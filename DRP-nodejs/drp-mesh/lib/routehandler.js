'use strict';

const DRP_Node = require("./node");
const DRP_Endpoint = require("./endpoint");
const DRP_Subscription = require('./subscription');

class DRP_Endpoint_Server extends DRP_Endpoint {
    /**
     * 
     * @param {WebSocket} wsConn Websocket connection
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} endpointID Remote Endpoint ID
     */
    constructor(wsConn, drpNode, endpointID) {
        super(wsConn, drpNode, endpointID);
        let thisEndpoint = this;

        this.RegisterCmd("hello", async function (...args) {
            return drpNode.Hello(...args);
        });
        this.RegisterCmd("registerNode", async function (...args) {
            return drpNode.RegisterNode(...args);
        });
        this.RegisterCmd("unregisterNode", async function (...args) {
            return drpNode.UnregisterNode(...args);
        });
        this.RegisterCmd("getNodeDeclaration", async function (...args) {
            return drpNode.NodeDeclaration;
        });
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("pathCmd", async function (params, srcEndpoint, token) {
            return await thisEndpoint.drpNode.GetObjFromPath(params, thisEndpoint.drpNode.GetBaseObj());
        });
        this.RegisterCmd("connectToNode", async function (...args) {
            return await thisEndpoint.drpNode.ConnectToNode(...args);
        });
        this.RegisterCmd("getRegistry", function () {
            return thisEndpoint.drpNode.NodeDeclarations;
        });

        this.RegisterCmd("getClassRecords", async function (...args) {
            return await thisEndpoint.drpNode.GetClassRecords(...args);
        });

        this.RegisterCmd("listClassInstances", function () {
            return thisEndpoint.drpNode.ListClassInstances();
        });

        this.RegisterCmd("listServiceInstances", function () {
            return thisEndpoint.drpNode.ListServiceInstances();
        });

        this.RegisterCmd("getClassDefinitions", function () {
            return thisEndpoint.drpNode.GetClassDefinitions();
        });

        this.RegisterCmd("sendToTopic", function (params, srcEndpoint, token) {
            thisEndpoint.drpNode.TopicManager.SendToTopic(params.topicName, params.topicData);
        });

        this.RegisterCmd("getTopology", async function (...args) {
            return await thisEndpoint.drpNode.GetTopology(...args);
        });
        this.RegisterCmd("listClientConnections", function (...args) {
            return thisEndpoint.drpNode.ListClientConnections(...args);
        });
    }

    // Define Endpoints commands
    async Subscribe(params, sourceEndpoint, token, customRelayHandler) {
        let thisEndpoint = this;
        let results = {};

        // Register the declaration for future reference
        let subscriberStreamToken = params.streamToken;

        // Create subscription object from paramaters
        let thisSubscription = new DRP_Subscription(params.streamToken, params.topicName, params.scope, params.filter);

        // Assign the subscription object to the Endpoint
        thisEndpoint.Subscriptions[subscriberStreamToken] = thisSubscription;

        switch (thisSubscription.scope) {
            case "local":
                results[thisEndpoint.drpNode.nodeID] = thisEndpoint.drpNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, thisEndpoint, thisSubscription.streamToken, thisSubscription.filter);
                break;
            case "global":
                // Find anyone who provides this data and subscribe on the consumer's behalf
                let sourceNodeIDList = Object.keys(thisEndpoint.drpNode.NodeDeclarations);
                for (let i = 0; i < sourceNodeIDList.length; i++) {
                    let sourceNodeID = sourceNodeIDList[i];
                    //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
                    let thisNodeDeclaration = thisEndpoint.drpNode.NodeDeclarations[sourceNodeID];
                    if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[thisSubscription.topicName]) {
                        // This source node offers the desired stream

                        // Is it this node?
                        if (sourceNodeID === thisEndpoint.drpNode.nodeID) {
                            results[sourceNodeID] = thisEndpoint.drpNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, thisEndpoint, thisSubscription.streamToken, thisSubscription.filter);
                        } else {
                            /**
                            * @type {DRP_Endpoint} DRP Node Client
                            */
                            let thisNodeEndpoint = await thisEndpoint.drpNode.VerifyNodeConnection(sourceNodeID);

                            // FOUND DOUBLE SUB ERROR - The VerifyNodeConnection will eval subscriptions!
                            // If already connected, we need to send the subscription request
                            // If this causes a connection, the subscription request will be auto-created
                            //
                            // TO DO - Figure out how to solve this

                            // Subscribe on behalf of the Consumer
                            //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                            let sourceStreamToken = thisNodeEndpoint.AddStreamHandler(async function (response) {
                                //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                                //console.dir(response);
                                let sendFailed = false;
                                if (!thisEndpoint.Subscriptions[subscriberStreamToken]) {
                                    sendFailed = true;
                                } else if (customRelayHandler && typeof customRelayHandler === 'function') {
                                    sendFailed = customRelayHandler(subscriberStreamToken, 2, response.payload);
                                } else {
                                    sendFailed = thisEndpoint.SendStream(subscriberStreamToken, 2, response.payload);
                                    //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                                }
                                if (sendFailed) {
                                    // Client disconnected
                                    if (thisNodeEndpoint.StreamHandlerQueue[response.token]) {
                                        thisNodeEndpoint.DeleteStreamHandler(response.token);
                                        //console.log("Stream handler removed forcefully");
                                    }
                                    let unsubResults = await thisNodeEndpoint.SendCmd("DRP", "unsubscribe", { "topicName": thisSubscription.topicName, "streamToken": response.token }, true, null);
                                    //console.log("Unsubscribe from orphaned stream");
                                    //console.dir(unsubResults);
                                }
                            });

                            // Await for command from source node
                            results[sourceNodeID] = await thisNodeEndpoint.SendCmd("DRP", "subscribe", { "topicName": thisSubscription.topicName, "streamToken": sourceStreamToken }, true, null);
                        }
                    }
                }
                break;
            default:

        }

        return results;
    }

    async Unsubscribe(params, wsConn, token) {
        let thisEndpoint = this;
        let subscriberStreamToken = params.streamToken;

        /** @type {DRP_Endpoint} */
        let remoteEndpoint = wsConn.drpEndpoint;

        // If this wsConn isn't a Node or Consumer, return null
        if (!remoteEndpoint) return null;

        //console.dir(wsConn.OutboundStreams);
        if (remoteEndpoint.Subscriptions[subscriberStreamToken]) {
            delete remoteEndpoint.Subscriptions[subscriberStreamToken];

            // Dirty workaround - try removing locally on each call
            thisEndpoint.drpNode.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, subscriberStreamToken, params.filter);
        }
        return null;
    }

    async OpenHandler(req) {
        // Moved logic for assigning ConsumerIDs; before, ALL connections were getting them
    }

    async CloseHandler(closeCode) {
        let thisEndpoint = this;

        switch (thisEndpoint.EndpointType) {
            case "Node":
                thisEndpoint.drpNode.UnregisterNode(thisEndpoint.EndpointID);
                break;
            case "Consumer":
                thisEndpoint.drpNode.ConsumerEndpoints[thisEndpoint.EndpointID];
                break;
            default:
        }

        if (this.closeCallback && typeof this.closeCallback === 'function') {
            this.closeCallback();
        }
    }

    async ErrorHandler(wsConn, error) {
        this.drpNode.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }
}

// Handles incoming DRP connections
class DRP_RouteHandler {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node Object
     * @param {string} route URL Route
     */
    constructor(drpNode, route) {

        let thisWebServerRoute = this;
        this.wsPingInterval = 10000;
        this.wsPingHistoryLength = 100;
        this.drpNode = drpNode;

        if (drpNode.WebServer && drpNode.WebServer.expressApp && drpNode.WebServer.expressApp.route !== null) {
            // This may be an Express server
            if (typeof drpNode.WebServer.expressApp.ws === "undefined") {
                // Websockets aren't enabled
                throw new Error("Must enable ws on Express server");
            }
        } else {
            // Express server not present
            return;
        }

        drpNode.WebServer.expressApp.ws(route, async function drpWebsocketHandler(wsConn, req) {

            // A new Websocket client has connected - create a DRP_Endpoint and assign the wsConn
            let remoteEndpoint = new DRP_Endpoint_Server(wsConn, drpNode, null);

            // We're missing the default commands; just add hello?

            await remoteEndpoint.OpenHandler(req);

            wsConn.on("message", function (message) {
                // Process command
                remoteEndpoint.ReceiveMessage(message);
            });

            wsConn.on("pong", function (message) {
                // Received pong; calculate time
                if (wsConn.pingSentTime) {
                    wsConn.pongRecvdTime = new Date().getTime();
                    wsConn.pingTimeMs = wsConn.pongRecvdTime - wsConn.pingSentTime;

                    // Clear values for next run
                    wsConn.pingSentTime = null;
                    wsConn.pongRecvdTime = null;

                    // Track ping history
                    if (wsConn.pingTimes.length >= thisWebServerRoute.wsPingHistoryLength) {
                        wsConn.pingTimes.shift();
                    }
                    wsConn.pingTimes.push(wsConn.pingTimeMs);
                }
            });

            wsConn.on("close", function (closeCode, reason) {
                remoteEndpoint.CloseHandler(closeCode);
                clearInterval(thisRollingPing);
            });

            wsConn.on("error", function (error) {
                remoteEndpoint.ErrorHandler(error);
            });

            // Note connection open time
            wsConn.openTime = new Date().getTime();

            // Set up wsPings tracking values
            wsConn.pingSentTime = null;
            wsConn.pongRecvdTime = null;
            wsConn.pingTimes = [];

            // Set up wsPing Interval
            let thisRollingPing = setInterval(async () => {
                thisWebServerRoute.SendWsPing(wsConn, thisRollingPing);
            }, thisWebServerRoute.wsPingInterval);

            // Run wsPing now to get initial value
            thisWebServerRoute.SendWsPing(wsConn, thisRollingPing);
        });
    }

    SendWsPing(wsConn, intervalObj) {
        let thisWebServerRoute = this;
        //console.dir(wsConn);
        try {
            if (wsConn.pingSentTime) {
                // Did not receive response last interval; enter null value
                if (wsConn.pingTimes.length >= thisWebServerRoute.wsPingHistoryLength) {
                    wsConn.pingTimes.shift();
                }
                wsConn.pingTimes.push(null);

                wsConn.drpEndpoint.log(`wsPing timed out to Endpoint ${wsConn.drpEndpoint.EndpointID}`);
            }
            wsConn.pingSentTime = new Date().getTime();
            wsConn.pongRecvdTime = null;
            wsConn.ping();
        } catch (ex) {
            wsConn.drpEndpoint.log(`Error sending wsPing to Endpoint ${wsConn.drpEndpoint.EndpointID}: ${ex}`);
        }
    }

    /*
     * Will this section cause the registry to tag Node connections as clients?
     */
}

module.exports = DRP_RouteHandler;