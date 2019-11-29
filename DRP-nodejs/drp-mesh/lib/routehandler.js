'use strict';

const DRP_Endpoint = require("./endpoint");
const DRP_Subscription = require('./subscription');

// Handles incoming DRP connections
class DRP_RouteHandler extends DRP_Endpoint {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node Object
     * @param {string} route URL Route
     */
    constructor(drpNode, route) {
        super();

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

            await thisWebServerRoute.OpenHandler(wsConn, req);
            //let remoteAddress = wsConn._socket.remoteAddress;
            //let remotePort = wsConn._socket.remotePort;

            wsConn.on("message", function (message) {
                // Process command
                thisWebServerRoute.ReceiveMessage(wsConn, message);
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
                thisWebServerRoute.CloseHandler(wsConn, closeCode);
                clearInterval(thisRollingPing);
            });

            wsConn.on("error", function (error) {
                thisWebServerRoute.ErrorHandler(wsConn, error);
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

        this.RegisterCmd("hello", "Hello");
        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("unregisterNode", "UnregisterNode");
        this.RegisterCmd("getNodeDeclaration", "GetNodeDeclaration");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("pathCmd", async function (params, wsConn, token) {
            return await thisWebServerRoute.drpNode.GetObjFromPath(params, thisWebServerRoute.drpNode.GetBaseObj());
        });
        this.RegisterCmd("connectToNode", async function (...args) {
            return await thisWebServerRoute.drpNode.ConnectToNode(...args);
        });
        this.RegisterCmd("getRegistry", function () {
            return thisWebServerRoute.drpNode.NodeDeclarations;
        });

        this.RegisterCmd("getClassRecords", async function (...args) {
            return await thisWebServerRoute.drpNode.GetClassRecords(...args);
        });

        this.RegisterCmd("listClassInstances", function () {
            return thisWebServerRoute.drpNode.ListClassInstances();
        });

        this.RegisterCmd("listServiceInstances", function () {
            return thisWebServerRoute.drpNode.ListServiceInstances();
        });

        this.RegisterCmd("getClassDefinitions", function () {
            return thisWebServerRoute.drpNode.GetClassDefinitions();
        });

        this.RegisterCmd("listClassInstanceDefinitions", async function (...args) {
            return await thisWebServerRoute.drpNode.ListClassInstanceDefinitions(...args);
        });

        this.RegisterCmd("sendToTopic", function (params, wsConn, token) {
            thisWebServerRoute.drpNode.TopicManager.SendToTopic(params.topicName, params.topicData);
        });

        this.RegisterCmd("getTopology", async function (...args) {
            return await thisWebServerRoute.drpNode.GetTopology(...args);
        });
        this.RegisterCmd("listClientConnections", function (...args) {
            return thisWebServerRoute.drpNode.ListClientConnections(...args);
        });
    }

    SendWsPing(wsConn, intervalObj) {
        try {
            if (wsConn.pingSentTime) {
                // Did not receive response last interval; enter null value
                if (wsConn.pingTimes.length >= thisWebServerRoute.wsPingHistoryLength) {
                    wsConn.pingTimes.shift();
                }
                wsConn.pingTimes.push(null);
            }
            wsConn.pingSentTime = new Date().getTime();
            wsConn.pongRecvdTime = null;
            wsConn.ping();
        } catch (ex) {
            clearInterval(intervalObj);
        }
    }

    async Hello(params, wsConn, token) {
        return this.drpNode.Hello(params, wsConn, token);
    }

    async RegisterNode(params, wsConn, token) {
        return this.drpNode.RegisterNode(params, wsConn, token);
    }

    async UnregisterNode(params, wsConn, token) {
        return this.drpNode.UnregisterNode(params, wsConn, token);
    }

    /**
    * @returns {{string:DRP_NodeDeclaration}} Node Declarations
    */

    async GetNodeDeclaration() {
        return this.drpNode.NodeDeclaration;
    }

    // Override ProcessCmd from drpEndpoint
    async ProcessCmd(wsConn, message) {
        let thisEndpoint = this;

        var cmdResults = {
            status: 0,
            output: null
        };

        // Is the message meant for the default DRP service?
        if (!message.serviceName || message.serviceName === "DRP") {
            if (typeof thisEndpoint.EndpointCmds[message.cmd] === 'function') {
                // Execute method
                try {
                    cmdResults.output = await thisEndpoint.EndpointCmds[message.cmd](message.params, wsConn, message.replytoken);
                    cmdResults.status = 1;
                } catch (err) {
                    cmdResults.output = err.message;
                }
            } else {
                cmdResults.output = "Endpoint does not have method";
                thisEndpoint.drpNode.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
                console.dir(message);
            }
        }
        // A service other than DRP has been specified
        else {
            try {
                cmdResults.output = await thisEndpoint.drpNode.ServiceCommand(message, wsConn);
                cmdResults.status = 1;
            } catch (err) {
                cmdResults.output = err.message;
            }
        }

        // Reply with results
        if (typeof message.replytoken !== "undefined" && message.replytoken !== null) {
            thisEndpoint.SendReply(wsConn, message.replytoken, cmdResults.status, cmdResults.output);
        }
    }

    /*
     * Will this section cause the registry to tag Node connections as clients?
     */

    async OpenHandler(wsConn, req) {
        if (!this.drpNode.ConsumerConnectionID) this.drpNode.ConsumerConnectionID = 1;
        // Assign ID using simple counter for now
        wsConn.id = this.drpNode.ConsumerConnectionID;
        this.drpNode.ConsumerConnectionID++;
    }

    async CloseHandler(wsConn, closeCode) {
        if (wsConn.drpEndpoint) {

            // Was this a Node?
            if (wsConn.drpEndpoint.nodeID) {
                this.drpNode.UnregisterNode(wsConn.drpEndpoint.nodeID);
            }

            // Was this a Consumer?
            if (wsConn.drpEndpoint.ConsumerID) {
                delete this.drpNode.ConsumerEndpoints[wsConn.drpEndpoint.ConsumerID];
            }

            if (this.closeCallback && typeof this.closeCallback === 'function') {
                this.closeCallback();
            }
        }
    }

    async ErrorHandler(wsConn, error) {
        this.drpNode.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisRouteServer = this;
        let results = {};

        /** @type {DRP_Endpoint} */
        let remoteEndpoint = wsConn.drpEndpoint;

        // If this wsConn isn't a Node or Consumer, return null
        if (!remoteEndpoint) return null;

        // Register the declaration for future reference
        let subscriberStreamToken = params.streamToken;

        // Create subscription object from paramaters
        let thisSubscription = new DRP_Subscription(params.streamToken, params.topicName, params.scope, params.filter);

        // Assign the subscription object to the Endpoint (used to be wsConn)
        remoteEndpoint.Subscriptions[subscriberStreamToken] = thisSubscription;

        switch (thisSubscription.scope) {
            case "local":
                results[thisRouteServer.drpNode.nodeID] = thisRouteServer.drpNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, wsConn, thisSubscription.streamToken, thisSubscription.filter);
                break;
            case "global":
                // Find anyone who provides this data and subscribe on the consumer's behalf
                let sourceNodeIDList = Object.keys(thisRouteServer.drpNode.NodeDeclarations);
                for (let i = 0; i < sourceNodeIDList.length; i++) {
                    let sourceNodeID = sourceNodeIDList[i];
                    //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
                    let thisNodeDeclaration = thisRouteServer.drpNode.NodeDeclarations[sourceNodeID];
                    if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[thisSubscription.topicName]) {
                        // This source node offers the desired stream

                        // Is it this node?
                        if (sourceNodeID === thisRouteServer.drpNode.nodeID) {
                            results[sourceNodeID] = thisRouteServer.drpNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, wsConn, thisSubscription.streamToken, thisSubscription.filter);
                        } else {
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            let thisNodeEndpoint = await thisRouteServer.drpNode.VerifyNodeConnection(sourceNodeID);

                            // Subscribe on behalf of the Consumer
                            //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                            let sourceStreamToken = thisRouteServer.AddStreamHandler(thisNodeEndpoint.wsConn, async function (response) {
                                //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                                //console.dir(response);
                                let sendFailed = false;
                                if (!remoteEndpoint.Subscriptions[subscriberStreamToken]) {
                                    sendFailed = true;
                                } else if (customRelayHandler && typeof customRelayHandler === 'function') {
                                    sendFailed = customRelayHandler(wsConn, subscriberStreamToken, 2, response.payload);
                                } else {
                                    sendFailed = thisRouteServer.SendStream(wsConn, subscriberStreamToken, 2, response.payload);
                                    //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                                }
                                if (sendFailed) {
                                    // Client disconnected
                                    if (thisNodeEndpoint.wsConn.StreamHandlerQueue[response.token]) {
                                        thisNodeEndpoint.DeleteStreamHandler(thisNodeEndpoint.wsConn, response.token);
                                        //console.log("Stream handler removed forcefully");
                                    }
                                    let unsubResults = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "unsubscribe", { "topicName": thisSubscription.topicName, "streamToken": response.token }, true, null);
                                    //console.log("Unsubscribe from orphaned stream");
                                    //console.dir(unsubResults);
                                }
                            });

                            // Await for command from source node
                            results[sourceNodeID] = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "subscribe", { "topicName": thisSubscription.topicName, "streamToken": sourceStreamToken }, true, null);
                        }
                    }
                }
                break;
            default:

        }

        return results;
    }

    async Unsubscribe(params, wsConn, token) {
        let thisRouteServer = this;
        let subscriberStreamToken = params.streamToken;

        /** @type {DRP_Endpoint} */
        let remoteEndpoint = wsConn.drpEndpoint;

        // If this wsConn isn't a Node or Consumer, return null
        if (!remoteEndpoint) return null;

        //console.dir(wsConn.OutboundStreams);
        if (remoteEndpoint.Subscriptions[subscriberStreamToken]) {
            delete remoteEndpoint.Subscriptions[subscriberStreamToken];

            // Dirty workaround - try removing locally on each call
            thisRouteServer.drpNode.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, subscriberStreamToken, params.filter);
        }
        return null;
    }
}

module.exports = DRP_RouteHandler;