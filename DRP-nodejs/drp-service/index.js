var WebSocket = require('ws');
var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');
var drpEndpoint = require('drp-endpoint');
var bodyParser = require('body-parser');
var express = require('express');
var expressWs = require('express-ws');
var cors = require('cors');
var https = require('https');
var fs = require('fs');

var os = require('os');
var process = require('process');

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

class DRP_PathCmd {
    /**
     * @param {string} method Method to execute
     * @param {string} pathList List of path elements
     * @param {object} params Arguments or payload
     */
    constructor(method, pathList, params) {
        this.method = method;
        this.pathList = pathlist;
        this.params = params;
    }
}

class DRP_TopicManager {
    /**
     * 
     * @param {DRP_Node} node DRP Node
     */
    constructor(node) {
        let thisTopicManager = this;

        // Set DRP Node
        this.node = node;
        this.Topics = {};
    }

    CreateTopic(topicName) {
        // Add logic to verify topic queue name is formatted correctly and doesn't already exist
        this.Topics[topicName] = new DRP_TopicManager_Topic(this, topicName);
        this.node.log("Created topic [" + topicName + "]", "TopicManager");
        //this.DRPServer.LogEvent("Created topic [" + topicName + "]", "TopicManager");
    }

    SubscribeToTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Subscribers.push({
            conn: conn,
            token: token,
            filter: filter
        });

        this.node.log("Subscribed to topic [" + topicName + "] with token [" + token + "]");
        //this.DRPServer.VDMServer.LogWSUnityClientEvent(conn, "Subscribed to topic [" + topicName + "]");
    }

    UnsubscribeFromTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (this.Topics[topicName]) {
            let thisTopic = this.Topics[topicName];

            let i = thisTopic.Subscribers.length;
            while (i--) {
                let thisSubscriberObj = thisTopic.Subscribers[i];
                if (thisSubscriberObj.conn === conn && thisSubscriberObj.token === token) {
                    thisTopic.Subscribers.splice(i, 1);
                    //console.log("Subscription client[" + i + "] removed gracefully");
                    break;
                }
            }
        }
    }

    UnsubscribeFromAll(conn, token) {
        let thisTopicManager = this;
        let topicKeys = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeys.length; i++) {
            thisTopicManager.UnsubscribeFromTopic(topicKeys[i], conn, token);
        }
    }

    SendToTopic(topicName, message) {
        let thisTopicManager = this;
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Send(message);
    }

    GetTopicCounts() {
        let thisTopicManager = this;
        let responseObject = {};
        let topicKeyList = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeyList.length; i++) {
            let thisTopic = thisTopicManager.Topics[topicKeyList[i]];
            responseObject[topicKeyList[i]] = {
                SubscriberCount: thisTopic.Subscribers.length,
                ReceivedMessages: thisTopic.ReceivedMessages,
                SentMessages: thisTopic.SentMessages
            };
        }
        return responseObject;
    }
}

class DRP_TopicManager_Topic {
    constructor(topicManager, topicName) {
        var thisTopic = this;

        // Set Topic Manager
        this.TopicManager = topicManager;
        this.TopicName = topicName;
        this.Subscribers = [];
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.LastTen = [];

        /*
        Subscribers: [
            {
                clientObj : {clientObj},
                token: {subscriberToken},
                filter: {filter}
            }
        ]
        */
    }

    Send(message) {
        let thisTopic = this;

        thisTopic.ReceivedMessages++;

        if (thisTopic.LastTen.length === 10) {
            thisTopic.LastTen.shift();
        }
        thisTopic.LastTen.push(message);

        let i = thisTopic.Subscribers.length;
        while (i--) {
            let thisSubscriberObj = thisTopic.Subscribers[i];
            let sendFailed = this.TopicManager.node.RouteHandler.SendStream(thisSubscriberObj.conn, thisSubscriberObj.token, 2, message);
            if (sendFailed) {
                thisTopic.Subscribers.splice(i, 1);
                console.log("Subscription client[" + i + "] removed forcefully");
            }
        }
    }
}

// Instantiate Express instance
class DRP_Server {
    constructor(webServerConfig) {

        // Setup the Express web server
        this.webServerConfig = webServerConfig;

        this.webServer = null;
        this.expressApp = express();
        this.expressApp.use(cors());

        // Is SSL enabled?
        if (webServerConfig.SSLEnabled) {
            var optionsExpress = {
                key: fs.readFileSync(webServerConfig.SSLKeyFile),
                cert: fs.readFileSync(webServerConfig.SSLCrtFile),
                passphrase: webServerConfig.SSLCrtFilePwd
            };
            let httpsServer = https.createServer(optionsExpress, this.expressApp);
            expressWs(this.expressApp, httpsServer);
            this.webServer = httpsServer;

        } else {
            expressWs(this.expressApp);
            this.webServer = this.expressApp;
        }

        this.expressApp.get('env');
        this.expressApp.use(bodyParser.urlencoded({
            extended: true
        }));
        this.expressApp.use(bodyParser.json());
    }

    start() {
        let thisDRPServer = this;
        return new Promise(function (resolve, reject) {
            thisDRPServer.webServer.listen(thisDRPServer.webServerConfig.Port, function () {
                resolve();
            });
        });
    }
}

// Handles incoming DRP connections
class DRP_Node_ServerRoute extends drpEndpoint.Endpoint {
    /**
     * 
     * @param {DRP_Node} node DRP Node Object
     * @param {string} route URL Route
     */
    constructor(node, route) {
        super();

        let thisServer = this;
        let expressApp = node.expressApp;
        this.node = node;

        if (expressApp && expressApp.route !== null) {
            // This may be an Express server
            if (typeof expressApp.ws === "undefined") {
                // Websockets aren't enabled
                throw new Error("Must enable ws on Express server");
            }
        } else {
            // Express server not present
            return;
        }

        expressApp.ws(route, async function drpWebsocketHandler(wsConn, req) {

            await thisServer.OpenHandler(wsConn, req);
            let remoteAddress = wsConn._socket.remoteAddress;
            let remotePort = wsConn._socket.remotePort;

            wsConn.on("message", function (message) {
                // Process command
                thisServer.ReceiveMessage(wsConn, message);
            });
            //wsConn.onclose = function (ev) { console.dir(ev, {depth:2}) };
            wsConn.on("close", function (closeCode, reason) {
                //console.log("CLOSED -> " + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort);
                //thisServer.CloseHandler(wsConn, closeCode, remoteAddress, remotePort)
                thisServer.CloseHandler(wsConn, closeCode);
            });

            wsConn.on("error", function (error) { thisServer.ErrorHandler(wsConn, error); });

        });


        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("getDeclarations", "GetDeclarations");
        this.RegisterCmd("getNodeDeclaration", "GetNodeDeclaration");
        //this.RegisterCmd("nodeToNodeCmd", "NodeToNodeCmd");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("pathCmd", async function (params, wsConn, token) {
            return await thisServer.node.GetObjFromPath(params, thisServer.node.GetBaseObj());
        });
        /*
        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let oReturnObject = await thisServer.node.GetObjFromPath(params, thisServer.node.GetBaseObj());

            // If we have a return object and want only a list of children, do that now
            if (params.listOnly) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: thisServer.node.ListObjChildren(oReturnObject) };
                }
            } else if (oReturnObject) {
                if (!oReturnObject.pathItem) {
                    // Return object as item
                    oReturnObject = { pathItem: oReturnObject };
                }
            }

            return oReturnObject;
        });
        */
    }

    async RegisterNode(params, wsConn, token) {
        return this.node.RegisterNode(params, wsConn, token);
    }

    /**
    * @returns {{string:DRP_NodeDeclaration}} Node Declarations
    */
    async GetDeclarations() {
        return this.node.NodeDeclarations;
    }

    async GetNodeDeclaration() {
        return this.node.NodeDeclaration;
    }

    // Override ProcessCmd from drpEndpoint
    async ProcessCmd(wsConn, message) {
        let thisEndpoint = this;

        var cmdResults = {
            status: 0,
            output: null
        };

        // Does the message need to be relayed to another node?
        if (message.params && message.params.targetNodeID && message.params.targetNodeID !== thisEndpoint.node.nodeID) {
            // Relay to another host and get response
        }
        // Is the message meant for the default DRP service?
        else if (!message.serviceName || message.serviceName === "DRP") {
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
                thisEndpoint.node.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
                console.dir(message);
                //console.dir(thisEndpoint.EndpointCmds);
            }
        }
        // A service other than DRP has been specified
        else {
            try {
                cmdResults.output = await thisEndpoint.node.ServiceCommand(message, wsConn);
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
        //console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        //this.service.ConsumerConnections
        if (!this.node.ConsumerConnectionID) this.node.ConsumerConnectionID = 1;
        //wsConn.id = `${wsConn._socket.remoteAddress}-${wsConn._socket.remotePort}`;
        wsConn.id = this.node.ConsumerConnectionID;
        this.node.ConsumerConnectionID++;
        this.node.ConsumerConnections[wsConn.id] = wsConn;
    }

    async CloseHandler(wsConn, closeCode) {
        //this.service.log("Broker client [" + wsConn.id + "] closed with code [" + closeCode + "]");
        if (wsConn.NodeID) {
            this.node.UnregisterNode(wsConn.NodeID);
        }
        if (wsConn.id) delete this.node.ConsumerConnections[wsConn.id];
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisRouteServer = this;
        let results = {};
        // Register the declaration for future reference
        //console.log("Stream handler reply token: " + token);
        //console.dir(params);
        let subscriberStreamToken = params.streamToken;
        if (!wsConn.Subscriptions) wsConn.Subscriptions = {};
        wsConn.Subscriptions[subscriberStreamToken] = params.topicName;

        // If the client did not specify a subscription scope, default to local
        let subScope = params.scope || "local";

        switch (subScope) {
            case "local":
                results[thisRouteServer.node.nodeID] = thisRouteServer.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
                break;
            case "global":
                // Find anyone who provides this data and subscribe on the consumer's behalf
                let sourceNodeIDList = Object.keys(thisRouteServer.node.NodeDeclarations);
                for (let i = 0; i < sourceNodeIDList.length; i++) {
                    let sourceNodeID = sourceNodeIDList[i];
                    //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
                    let thisNodeDeclaration = thisRouteServer.node.NodeDeclarations[sourceNodeID];
                    if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[params.topicName]) {
                        // This source node offers the desired stream

                        // Is it this node?
                        if (sourceNodeID === thisRouteServer.node.nodeID) {
                            results[sourceNodeID] = thisRouteServer.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
                        } else {
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            let thisNodeEndpoint = await thisRouteServer.node.VerifyNodeConnection(sourceNodeID);

                            // Subscribe on behalf of the Consumer
                            //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                            let sourceStreamToken = thisRouteServer.AddStreamHandler(thisNodeEndpoint.wsConn, async function (response) {
                                //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                                //console.dir(response);
                                let sendFailed = false;
                                if (!wsConn.Subscriptions[subscriberStreamToken]) {
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
                                    let unsubResults = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "unsubscribe", { "topicName": params.topicName, "streamToken": response.token }, true, null);
                                    //console.log("Unsubscribe from orphaned stream");
                                    //console.dir(unsubResults);
                                }
                            });

                            // Await for command from source node
                            results[sourceNodeID] = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "subscribe", { "topicName": params.topicName, "streamToken": sourceStreamToken }, true, null);
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
        //console.dir(wsConn.OutboundStreams);
        if (wsConn.Subscriptions && wsConn.Subscriptions[subscriberStreamToken]) {
            delete wsConn.Subscriptions[subscriberStreamToken];

            // Dirty workaround - try removing locally on each call
            thisRouteServer.node.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
        }
        return null;
    }
}

class DRP_NodeDeclaration {
    /**
     * 
     * @param {string} nodeID Node ID
     * @param {string[]} nodeRoles Functional Roles ['Registry','Broker','Provider']
     * @param {string} nodeURL Listening URL (optional)
     * @param {{string:object}} classes Class definitions and instance paths (optional)
     * @param {object} structure Object structure (optional)
     * @param {{string:object}} streams Provided Streams
     * @param {{string:object}} services Provided services
     */
    constructor(nodeID, nodeRoles, nodeURL, classes, structure, streams, services) {
        this.NodeID = nodeID;
        this.NodeRoles = nodeRoles;
        this.NodeURL = nodeURL;
        this.Classes = classes || {};
        this.Structure = structure || {};
        this.Streams = streams || {};
        this.Services = services || {};
        this.SourceInstances = {};
    }
}

class DRP_Command {
    constructor(serviceName, cmd, params) {
        this.serviceName = serviceName;
        this.cmd = cmd;
        this.params = params;
    }
}

class DRP_Node {
    /**
     * 
     * @param {string[]} nodeRoles List of Roles: Broker, Provider, Registry
     * @param {express} expressApp Express server (optional)
     * @param {string} drpRoute DRP WS Route (optional)
     * @param {string} nodeURL Node WS URL (optional)
     * @param {string} webProxyURL Web Proxy URL (optional)
     */
    constructor(nodeRoles, expressApp, drpRoute, nodeURL, webProxyURL) {
        let thisNode = this;
        this.nodeID = `${os.hostname()}-${process.pid}-${getRandomInt(9999)}`;
        this.expressApp = expressApp || null;
        this.drpRoute = drpRoute || "/";
        this.nodeURL = nodeURL || null;
        this.nodeRoles = nodeRoles || [];
        this.webProxyURL = webProxyURL || null;
        /** @type {{string:DRP_NodeDeclaration}} */
        this.NodeDeclarations = {};
        /** @type {{string:DRP_NodeClient}} */
        this.NodeEndpoints = {};
        this.ConsumerConnections = {};
        //this.ServiceCommandTracking = {
        /*
         * ServiceName: {
         *    Providers: {
         *      myhost-port: {
         *          Weight,
         *          OutstandingCmds,
         *          AvgResponseTime,
         *          Reliability,
         *          ConnectionOpenTimestamp,
         *          ReconnectCount
         *      }
         *    }
         * }
         */
        //};
        this.Services = {};

        this.NodeDeclaration = new DRP_NodeDeclaration(this.nodeID, this.nodeRoles, this.nodeURL);

        // Create topic manager
        this.TopicManager = new DRP_TopicManager(this);

        // If this is a Registry, seed the Registry with it's own declaration
        if (thisNode.IsRegistry()) {
            this.AddStream("RegistryUpdate", "Registry updates");
            this.RegisterNode(this.NodeDeclaration);
            //this.NodeDeclarations[this.NodeDeclaration.NodeID] = this.NodeDeclaration;
        }

        // Add a route handler even if we don't have an Express server (needed for stream relays)
        this.RouteHandler = new DRP_Node_ServerRoute(this, this.drpRoute);
    }
    log(message) {
        //let paddedType = this.nodeRoles.padEnd(8, ' ');
        let paddedNodeID = this.nodeID.padEnd(14, ' ');
        //console.log(`${this.getTimestamp()} ${paddedType} [${paddedNodeID}] -> ${message}`);
        console.log(`${this.getTimestamp()} [${paddedNodeID}] -> ${message}`);
    }
    getTimestamp() {
        let date = new Date();
        let hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;
        let min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;
        let sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;
        let day = date.getDate();
        day = (day < 10 ? "0" : "") + day;
        return year + "" + month + "" + day + "" + hour + "" + min + "" + sec;
    }
    GetClassDefinitions() {
        //console.log("getting class definitions...");
        let results = {};
        let nodeIDs = Object.keys(this.NodeDeclarations);
        //console.log("got node IDs, looping...");
        for (let i = 0; i < nodeIDs.length; i++) {
            let nodeID = nodeIDs[i];
            //console.log("Looping over nodeID: " + nodeID);
            let thisNodeDeclaration = this.NodeDeclarations[nodeID];
            // Loop over Instances
            let instanceList = Object.keys(thisNodeDeclaration.SourceInstances);
            for (let j = 0; j < instanceList.length; j++) {
                let sourceInstanceID = instanceList[j];
                //console.log("Looping over instanceID: " + instanceID);
                let sourceInstanceObj = thisNodeDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    if (!results[className]) {
                        results[className] = thisNodeDeclaration.SourceInstances[sourceInstanceID][className].Definition;
                    }
                }
            }
        }
        //console.dir(results);
        return results;
    }
    ListClassInstanceDefinitions() {
        let results = {};
        // Loop over Node Declarations
        //console.log("Looping over this.NodeDeclarations: " + this.NodeDeclarations);
        let nodeIDs = Object.keys(this.NodeDeclarations);
        for (let i = 0; i < nodeIDs.length; i++) {
            let nodeID = nodeIDs[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = this.NodeDeclarations[nodeID];
            // Loop over Sources
            let sourceInstanceList = Object.keys(thisNodeDeclaration.SourceInstances);
            for (let j = 0; j < sourceInstanceList.length; j++) {
                let sourceInstanceID = sourceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let sourceInstanceObj = thisNodeDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    //console.log("Looping over className: " + className);
                    if (!results[className]) {
                        results[className] = {};
                    }
                    if (!results[className][sourceInstanceID]) {
                        results[className][sourceInstanceID] = {};
                    }
                    results[className][sourceInstanceID][nodeID] = thisNodeDeclaration.SourceInstances[sourceInstanceID][className];
                }
            }
        }
        return results;
    }
    ListClassInstances(params) {
        let results = {};
        let findClassName = params;
        let nodeIDs = Object.keys(this.NodeDeclarations);
        for (let i = 0; i < nodeIDs.length; i++) {
            let nodeID = nodeIDs[i];
            //console.log("Looping over nodeID: " + nodeID);
            let thisNodeDeclaration = this.NodeDeclarations[nodeID];
            // Loop over Sources
            let sourceInstanceList = Object.keys(thisNodeDeclaration.SourceInstances);
            for (let j = 0; j < sourceInstanceList.length; j++) {
                let sourceInstanceID = sourceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let sourceInstanceObj = thisNodeDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    if (!findClassName || findClassName === className) {
                        if (!results[className]) {
                            results[className] = {};
                        }
                        if (!results[className][sourceInstanceID]) {
                            results[className][sourceInstanceID] = { providers: {} };
                        }
                        results[className][sourceInstanceID].providers[nodeID] = Object.assign({}, thisNodeDeclaration.SourceInstances[sourceInstanceID][className]);
                        delete results[className][sourceInstanceID].providers[nodeID].Definition;
                    }
                }
            }
        }
        return results;
    }

    GetBaseObj() {
        let thisNode = this;
        return {
            LocalNode: thisNode,
            ConnectedNodes: async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let remoteNodeID = remainingChildPath.shift();

                    // Need to send command to consumer with remaining tree data
                    params.pathList = remainingChildPath;
                    let thisNodeConnection = await thisNode.VerifyNodeConnection(remoteNodeID);

                    if (thisNodeConnection) {
                        // Await for command from consumer
                        let results = await thisNode.RouteHandler.SendCmd(thisNodeConnection, "DRP", params.method, params, true, null);
                        if (results && results.payload && results.payload) {
                            oReturnObject = results.payload;
                        }
                    } else {
                        thisNode.log(`Could not verify node connection for [${remoteNodeID}]`);
                    }

                } else {
                    // Return list of consumers
                    oReturnObject = {};
                    let aNodeKeys = Object.keys(thisNode.NodeEndpoints);
                    for (let i = 0; i < aNodeKeys.length; i++) {
                        oReturnObject[aNodeKeys[i]] = {
                            "ConsumerType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            Registry: thisNode.NodeDeclarations,
            Streams: async function (params) {
                //console.log("Checking Streams...");
                let remainingChildPath = params.pathList;
                let oReturnObject = {};
                if (remainingChildPath && remainingChildPath.length > 0) {

                    //console.log(" -> Have remaining child path...");

                    let streamInstanceID = remainingChildPath.shift();

                    params.pathList = remainingChildPath;

                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Streams
                        if (!thisNodeDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            if (streamInstanceID === streamInstanceList[j]) {
                                if (!oReturnObject["Providers"]) {
                                    oReturnObject = {
                                        "Providers": []
                                    };
                                }
                                oReturnObject["Providers"].push(providerName);
                            }
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }

                    if (oReturnObject["Providers"]) {
                        oReturnObject["Providers"] = oReturnObject["Providers"].join(",");
                    }

                    if (oReturnObject["ClientCmds"]) {
                        oReturnObject["ClientCmds"] = oReturnObject["ClientCmds"].join(",");
                    }

                } else {
                    // Return list of Streams
                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Streams
                        if (!thisNodeDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            let streamInstanceID = streamInstanceList[j];
                            //console.log("Looping over sourceID: " + streamInstanceID);
                            //let streamInstanceObj = thisNodeDeclaration.Streams[streamInstanceID];
                            if (!oReturnObject[streamInstanceID]) oReturnObject[streamInstanceID] = {
                                "StreamName": streamInstanceID,
                                "Providers": []
                            };

                            oReturnObject[streamInstanceID].Providers.push(providerName);
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }
                }
                //console.dir(oReturnObject);
                return oReturnObject;
            },
            Consumers: async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let agentID = remainingChildPath.shift();

                    // Need to send command to consumer with remaining tree data
                    params.pathList = remainingChildPath;
                    let thisConsumerConn = await thisNode.VerifyConsumerConnection(agentID);

                    if (thisConsumerConn) {
                        // Await for command from consumer
                        let results = await thisNode.RouteHandler.SendCmd(thisConsumerConn, "DRP", params.method, params, true, null);
                        if (results && results.payload && results.payload) {
                            oReturnObject = results.payload;
                        }
                    } else {
                        thisNode.log(`Could not verify consumer connection for [${agentID}]`);
                    }

                } else {
                    // Return list of consumers
                    oReturnObject = {};
                    let aConsumerKeys = Object.keys(thisNode.ConsumerConnections);
                    for (let i = 0; i < aConsumerKeys.length; i++) {
                        oReturnObject[aConsumerKeys[i]] = {
                            "ConsumerType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            Services: async function (params) {
                //console.log("Checking Services...");
                // Structure:
                //      \Services\{svcName}\Providers
                //      \Services\{svcName}\Commands\{cmdName}\param1\param2
                let remainingChildPath = params.pathList;
                let oReturnObject = {};

                let serviceInstanceID = remainingChildPath.shift();

                if (!serviceInstanceID) {
                    // List Services

                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Services
                        if (!thisNodeDeclaration.Services) continue;
                        let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
                        for (let j = 0; j < serviceInstanceList.length; j++) {
                            let serviceInstanceID = serviceInstanceList[j];
                            //console.log("Looping over sourceID: " + serviceInstanceID);
                            //let serviceInstanceObj = thisNodeDeclaration.Services[serviceInstanceID];
                            if (!oReturnObject[serviceInstanceID]) oReturnObject[serviceInstanceID] = {
                                "ServiceName": serviceInstanceID,
                                "ProviderList": [],
                                "ClientCmds": thisNodeDeclaration.Services[serviceInstanceID].ClientCmds
                            };

                            oReturnObject[serviceInstanceID].ProviderList.push(providerName);
                            //console.log("added sourceID: " + serviceInstanceID);
                        }
                    }
                } else {

                    // A service ID has been specified; retrieve Provider instances
                    let serviceInstanceProviders = thisNode.FindProvidersForService(serviceInstanceID);

                    // If service doesn't exist, return nothing
                    if (!serviceInstanceProviders.length) return {};

                    // See if an attribute has been specified
                    let serviceAttribute = remainingChildPath.shift();

                    // No attribute provided
                    if (!serviceAttribute) {

                        // Return hash of Providers, ClientCmds, etc
                        let myRegistry = thisNode.NodeDeclarations;

                        oReturnObject = {
                            "ProviderList": serviceInstanceProviders.join(","),
                            "ClientCmds": myRegistry[serviceInstanceProviders[0]]['Services'][serviceInstanceID]['ClientCmds'],
                            "Provider": () => { }
                        };

                    } else {

                        // An attribute has been specified - which one?
                        if (serviceAttribute === "ClientCmds") {

                            // Was a method specified?
                            let methodName = remainingChildPath.shift();
                            if (!methodName) {

                                // No - List Methods
                                let cmdList = myRegistry[serviceInstanceProviders[0]]['Services'][serviceInstanceID]['ClientCmds'];
                                for (let k = 0; k < cmdList.length; k++) {
                                    let cmdName = cmdList[k];
                                    oReturnObject[cmdName] = async function () {
                                        let cmdObj = {
                                            "serviceName": serviceInstanceID,
                                            "cmd": cmdName,
                                            "params": null
                                        };
                                        oReturnObject = await thisNode.ServiceCommand(cmdObj, null, null);
                                    };
                                }
                                return oReturnObject;

                            } else {
                                // Yes - Execute Method
                                let cmdObj = {
                                    serviceName: serviceInstanceID,
                                    cmd: methodName,
                                    params: {
                                        pathList: remainingChildPath,
                                        authKey: params.authKey,
                                        payload: params.payload
                                    }
                                };
                                oReturnObject = await thisNode.ServiceCommand(cmdObj, null, null);
                            }
                        } else if (serviceAttribute === "Provider") {
                            // Route the rest of the request to the first provider
                            let serviceInstanceProviders = thisNode.FindProvidersForService(serviceInstanceID);
                            let targetNodeID = serviceInstanceProviders[0];
                            params.pathList = remainingChildPath;

                            if (targetNodeID === thisNode.nodeID) {
                                // The target NodeID is local
                                oReturnObject = thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
                            } else {
                                // The target NodeID is remote
                                let targetProviderObj = await thisNode.VerifyNodeConnection(targetNodeID);
                                let cmdResponse = await targetProviderObj.SendCmd(null, "DRP", "pathCmd", params, true, null);
                                if (cmdResponse.payload) {
                                    oReturnObject = cmdResponse.payload;
                                }
                            }
                            //oReturnObject = await thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
                        } else {
                            thisNode.log("UNKNOWN");
                        }
                    }
                }
                //console.dir(oReturnObject);
                return oReturnObject;
            }
        };
    }

    GetBaseObj_Broker() {
        let thisNode = this;
        let myRegistry = this.NodeDeclarations;
        return {
            "Broker": thisNode,
            "Registry": thisNode.NodeDeclarations,
            "Providers": async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let nodeID = remainingChildPath.shift();

                    // Need to send command to provider with remaining tree data
                    //let oResults = await oCurrentObject[aChildPathArray[i]](aChildPathArray.splice(i + 1));
                    //if (typeof oResults == 'object') {
                    //    oReturnObject = oResults;
                    //}
                    params.pathList = remainingChildPath;
                    let thisNodeClient = await thisNode.VerifyNodeConnection(nodeID);

                    // Await for command from provider
                    let results = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", params.method, params, true, null);
                    if (results && results.payload && results.payload) {
                        oReturnObject = results.payload;
                    }

                } else {
                    // Return list of providers
                    oReturnObject = {};
                    let aProviderKeys = Object.keys(myRegistry);
                    for (let i = 0; i < aProviderKeys.length; i++) {
                        oReturnObject[aProviderKeys[i]] = {
                            "ProviderType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            "Consumers": async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let agentID = remainingChildPath.shift();

                    // Need to send command to consumer with remaining tree data
                    params.pathList = remainingChildPath;
                    let thisConsumerConn = await thisNode.VerifyConsumerConnection(agentID);

                    if (thisConsumerConn) {
                        // Await for command from consumer
                        let results = await thisNode.ConsumerRouteHandler.SendCmd(thisConsumerConn, "DRP", params.method, params, true, null);
                        if (results && results.payload && results.payload) {
                            oReturnObject = results.payload;
                        }
                    } else {
                        thisNode.log(`Could not verify consumer connection for [${agentID}]`);
                    }

                } else {
                    // Return list of consumers
                    oReturnObject = {};
                    let aConsumerKeys = Object.keys(thisNode.ConsumerConnections);
                    for (let i = 0; i < aConsumerKeys.length; i++) {
                        oReturnObject[aConsumerKeys[i]] = {
                            "ConsumerType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            "Services": async function (params) {
                //console.log("Checking Services...");
                // Structure:
                //      \Services\{svcName}\Providers
                //      \Services\{svcName}\Commands\{cmdName}\param1\param2
                let remainingChildPath = params.pathList;
                let oReturnObject = {};

                let serviceInstanceID = remainingChildPath.shift();

                if (!serviceInstanceID) {
                    // List Services

                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Services
                        if (!thisNodeDeclaration.Services) continue;
                        let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
                        for (let j = 0; j < serviceInstanceList.length; j++) {
                            let serviceInstanceID = serviceInstanceList[j];
                            //console.log("Looping over sourceID: " + serviceInstanceID);
                            //let serviceInstanceObj = thisNodeDeclaration.Services[serviceInstanceID];
                            if (!oReturnObject[serviceInstanceID]) oReturnObject[serviceInstanceID] = {
                                "ServiceName": serviceInstanceID,
                                "ProviderList": [],
                                "ClientCmds": thisNodeDeclaration.Services[serviceInstanceID].ClientCmds
                            };

                            oReturnObject[serviceInstanceID].ProviderList.push(providerName);
                            //console.log("added sourceID: " + serviceInstanceID);
                        }
                    }
                } else {

                    // A service ID has been specified; retrieve Provider instances
                    let serviceInstanceProviders = thisNode.FindProvidersForService(serviceInstanceID);

                    // If service doesn't exist, return nothing
                    if (!serviceInstanceProviders.length) return {};

                    // See if an attribute has been specified
                    let serviceAttribute = remainingChildPath.shift();

                    // No attribute provided
                    if (!serviceAttribute) {

                        // Return hash of Providers, ClientCmds, etc
                        let myRegistry = thisNode.NodeDeclarations;

                        oReturnObject = {
                            "ProviderList": serviceInstanceProviders.join(","),
                            "ClientCmds": myRegistry[serviceInstanceProviders[0]]['Services'][serviceInstanceID]['ClientCmds'],
                            "Provider": () => { }
                        };

                    } else {

                        // An attribute has been specified - which one?
                        if (serviceAttribute === "ClientCmds") {

                            // Was a method specified?
                            let methodName = remainingChildPath.shift();
                            if (!methodName) {

                                // No - List Methods
                                let cmdList = myRegistry[serviceInstanceProviders[0]]['Services'][serviceInstanceID]['ClientCmds'];
                                for (let k = 0; k < cmdList.length; k++) {
                                    let cmdName = cmdList[k];
                                    oReturnObject[cmdName] = async function () {
                                        let cmdObj = {
                                            "serviceName": serviceInstanceID,
                                            "cmd": cmdName,
                                            "params": null
                                        };
                                        oReturnObject = await thisNode.ServiceCommand(cmdObj, null, null);
                                    };
                                }
                                return oReturnObject;

                            } else {
                                // Yes - Execute Method
                                let cmdObj = {
                                    serviceName: serviceInstanceID,
                                    cmd: methodName,
                                    params: {
                                        pathList: remainingChildPath,
                                        authKey: params.authKey,
                                        payload: params.payload
                                    }
                                };
                                oReturnObject = await thisNode.ServiceCommand(cmdObj, null, null);
                            }
                        } else if (serviceAttribute === "Provider") {
                            // Route the rest of the request to the first provider
                            let serviceInstanceProviders = thisNode.FindProvidersForService(serviceInstanceID);
                            let recordPath = ['Providers', serviceInstanceProviders[0], 'Services', serviceInstanceID].concat(remainingChildPath);
                            params.pathList = recordPath;
                            oReturnObject = await thisNode.GetObjFromPath(params, thisNode.GetBaseObj_Broker());
                        } else {
                            thisNode.log("UNKNOWN");
                        }
                    }
                }
                //console.dir(oReturnObject);
                return oReturnObject;
            }, "Streams": async function (params) {
                //console.log("Checking Streams...");
                let remainingChildPath = params.pathList;
                let oReturnObject = {};
                if (remainingChildPath && remainingChildPath.length > 0) {

                    //console.log(" -> Have remaining child path...");

                    let streamInstanceID = remainingChildPath.shift();

                    params.pathList = remainingChildPath;

                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Streams
                        if (!thisNodeDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            if (streamInstanceID === streamInstanceList[j]) {
                                if (!oReturnObject["Providers"]) {
                                    oReturnObject = {
                                        "Providers": []
                                    };
                                }
                                oReturnObject["Providers"].push(providerName);
                            }
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }

                    if (oReturnObject["Providers"]) {
                        oReturnObject["Providers"] = oReturnObject["Providers"].join(",");
                    }

                    if (oReturnObject["ClientCmds"]) {
                        oReturnObject["ClientCmds"] = oReturnObject["ClientCmds"].join(",");
                    }

                } else {
                    // Return list of Streams
                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(thisNode.NodeDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                        // Loop over Streams
                        if (!thisNodeDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            let streamInstanceID = streamInstanceList[j];
                            //console.log("Looping over sourceID: " + streamInstanceID);
                            //let streamInstanceObj = thisNodeDeclaration.Streams[streamInstanceID];
                            if (!oReturnObject[streamInstanceID]) oReturnObject[streamInstanceID] = {
                                "StreamName": streamInstanceID,
                                "Providers": []
                            };

                            oReturnObject[streamInstanceID].Providers.push(providerName);
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }
                }
                //console.dir(oReturnObject);
                return oReturnObject;
            }
        };
    }

    /**
     * Find Providers for a given Service Instance
     * @param {string} serviceInstanceID Service Instance to find
     * @returns {string[]} List of Providers offering Service
     */
    FindProvidersForService(serviceInstanceID) {
        let thisNode = this;
        let myRegistry = thisNode.NodeDeclarations;
        let providerList = [];

        let providerNames = Object.keys(myRegistry);

        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = myRegistry[providerName];
            // Loop over Services
            if (!thisNodeDeclaration.Services) continue;
            let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
            for (let j = 0; j < serviceInstanceList.length; j++) {
                if (serviceInstanceID === serviceInstanceList[j]) {
                    providerList.push(providerName);
                }
            }
        }
        return providerList;
    }

    async EvalPath(oCurrentObject, params) {
        let oReturnObject = null;

        let aChildPathArray = params.pathList;

        // Do we have a path array?
        if (aChildPathArray.length === 0) {
            // No - act on parent object
            oReturnObject = oCurrentObject;
        } else {
            // Yes - get child
            PathLoop:
            for (let i = 0; i < aChildPathArray.length; i++) {

                // Does the child exist?
                if (oCurrentObject.hasOwnProperty(aChildPathArray[i])) {

                    // See what we're dealing with
                    let objectType = typeof oCurrentObject[aChildPathArray[i]];
                    switch (objectType) {
                        case 'object':
                            // Set current object
                            oCurrentObject = oCurrentObject[aChildPathArray[i]];
                            if (i + 1 === aChildPathArray.length) {
                                // Last one - make this the return object
                                oReturnObject = oCurrentObject;
                            }
                            break;
                        case 'function':
                            // Send the rest of the path to a function
                            let remainingPath = aChildPathArray.splice(i + 1);
                            params.pathList = remainingPath;
                            oReturnObject = await oCurrentObject[aChildPathArray[i]](params);
                            break PathLoop;
                        case 'string':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        case 'number':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        case 'boolean':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        default:
                            break PathLoop;
                    }

                } else {
                    // Child doesn't exist
                    break PathLoop;
                }
            }
        }

        return oReturnObject;
    }

    /**
   * @param {object} params Remaining path
   * @param {Boolean} baseObj Flag to return list of children
   * @returns {object} oReturnObject Return object
   */
    async GetObjFromPath(params, baseObj) {

        // Return object
        let oReturnObject = await this.EvalPath(baseObj, params);

        // If we have a return object and want only a list of children, do that now
        if (params.listOnly) {
            if (typeof oReturnObject === 'object' && oReturnObject !== null) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: this.ListObjChildren(oReturnObject) };
                }
            } else {
                oReturnObject = null;
            }
        } else if (oReturnObject) {
            if (!(typeof oReturnObject === 'object') || !oReturnObject["pathItem"]) {
                // Return object as item
                oReturnObject = { pathItem: oReturnObject };
            }
        }

        return oReturnObject;
    }

    GetRegistryNodeIDs() {
        let thisNode = this;
        let registryNodeIDList = [];
        let nodeIDlist = Object.keys(thisNode.NodeDeclarations);
        for (let i = 0; i < nodeIDlist.length; i++) {
            let thisNodeID = nodeIDlist[i];
            /** @type DRP_NodeDeclaration */
            let thisNodeDeclaration = thisNode.NodeDeclarations[thisNodeID];
            if (thisNodeDeclaration.NodeRoles.indexOf("Registry") >= 0) {
                registryNodeIDList.push(thisNodeID);
            }
        }
        return registryNodeIDList;
    }

    async SendToRegistries(cmd, params) {
        let thisNode = this;
        let registryNodeIDList = thisNode.GetRegistryNodeIDs();
        for (let i = 0; i < registryNodeIDList.length; i++) {
            /** @type DRP_NodeClient */
            let thisRegistryNodeEndpoint = thisNode.NodeEndpoints[registryNodeIDList[i]];
            if (thisRegistryNodeEndpoint) {
                thisRegistryNodeEndpoint.SendCmd(null, "DRP", cmd, params, false, null);
            }
        }
    }

    async VerifyNodeConnection(remoteNodeID) {

        let thisNode = this;

        /** @type DRP_NodeDeclaration */
        let thisNodeDeclaration = thisNode.NodeDeclarations[remoteNodeID];
        if (!thisNodeDeclaration) return null;

        let thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];

        // Try connecting to the remote node
        if (!thisNodeEndpoint && thisNodeDeclaration.NodeURL) {
            let targetNodeURL = thisNodeDeclaration.NodeURL;

            // If we have a valid target URL, wait a few seconds for connection to initiate
            if (targetNodeURL) {
                thisNode.log(`Connecting to Node [${remoteNodeID}] @ '${targetNodeURL}'`);
                thisNodeEndpoint = new DRP_NodeClient(thisNode, targetNodeURL, thisNode.webProxyURL);
                thisNode.NodeEndpoints[remoteNodeID] = thisNodeEndpoint;

                for (let i = 0; i < 50; i++) {

                    // Are we still trying?
                    if (!thisNodeEndpoint.wsConn.readyState) {
                        // Yes - wait
                        await sleep(100);
                    } else {
                        // No - break the for loop
                        break;
                    }
                }
            }
        }

        // Try sending a back connection request to the remote node via the registry
        if (!thisNodeEndpoint || thisNodeEndpoint.wsConn.readyState !== 1) {

            thisNode.log("Sending back request...");
            // Let's try having the Provider call us; send command through Registry
            try {
                // Get registry connection, can have multiple registries.  Pick the first one.
                let registryNodeIDList = thisNode.GetRegistryNodeIDs();
                for (let i = 0; i < registryNodeIDList.length; i++) {
                    /** @type DRP_NodeClient */
                    let registryNodeEndpoint = thisNode.NodeEndpoints[registryNodeIDList[i]];
                    registryNodeEndpoint.SendCmd(null, "DRP", "connectToNode", { "targetNodeID": remoteNodeID, "sourceNodeID": thisNode.nodeID, "token": "123", "wsTarget": thisNode.nodeURL }, false, null);
                    break;
                }
            } catch (err) {
                this.log(`ERR!!!! [${err}]`);
            }

            this.log("Starting wait...");
            // Wait a few seconds
            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (!thisNode.NodeEndpoints[remoteNodeID] || thisNode.NodeEndpoints[remoteNodeID].wsConn.readyState !== 1) {
                    // Yes - wait
                    await sleep(100);
                } else {
                    // No - break the for loop
                    thisNode.log(`Received back connection from remote node [${remoteNodeID}]`);
                    i = 50;
                }
            }

            // If still not successful, return DRP_NodeClient
            if (!thisNode.NodeEndpoints[remoteNodeID] || thisNode.NodeEndpoints[remoteNodeID].wsConn.readyState !== 1) {
                thisNode.log(`Could not open connection to Node [${remoteNodeID}]`);
                if (thisNode.NodeEndpoints[remoteNodeID]) {
                    delete thisNode.NodeEndpoints[remoteNodeID];
                }
                //throw new Error(`Could not get connection to Provider ${remoteNodeID}`);
            } else {
                thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];
            }
        }

        return thisNodeEndpoint;
    }

    async VerifyConsumerConnection(consumerID) {

        let thisNode = this;

        let thisConsumerWS = null;

        // Establish a wsConn client if not already established
        //if (thisConsumerWS && thisConsumerWS.readyState === 1 && thisConsumerWS.clientObj) thisConsumerObj = thisConsumerWS.clientObj;
        if (thisNode.ConsumerConnections[consumerID] && thisNode.ConsumerConnections[consumerID].readyState === 1) thisConsumerWS = thisNode.ConsumerConnections[consumerID];

        return thisConsumerWS;
    }

    async sendBrokerRequest(method, params) {
        let thisNode = this;
        // NEED TO UPDATE - if there is no proxyBrokerURL, interrogate the registry to find a broker
        if (!thisNode.brokerClient) {
            await new Promise(resolve => {
                thisNode.brokerClient = new DRP_Consumer_BrokerClient(thisNode.proxyBrokerURL, resolve);
            });
        }

        let response = await thisNode.brokerClient.SendCmd(thisNode.brokerClient.wsConn, "DRP", method, params, true);
        return response.payload;
    }

    async AddService(serviceName, serviceObject) {
        let thisNode = this;
        if (serviceName && serviceObject && serviceObject.ClientCmds) {
            thisNode.Services[serviceName] = serviceObject;
            if (thisNode.NodeDeclaration) {
                //this.NodeDeclaration.Services[serviceName] = Object.keys(serviceObject.ClientCmds);
                thisNode.NodeDeclaration.Services[serviceName] = {
                    "ClientCmds": Object.keys(serviceObject.ClientCmds),
                    "Persistence": serviceObject.Persistence || false,
                    "Weight": serviceObject.Weight || 0,
                    "Zone": serviceObject.Zone || null
                };
            }
        }

        thisNode.SendToRegistries("registerNode", thisNode.NodeDeclaration);
    }

    async RemoveService(serviceName) {
        let thisNode = this;
        if (serviceName && thisNode.NodeDeclaration.Services[serviceName]) {
            delete this.NodeDeclaration.Services[serviceName];
        }

        thisNode.SendToRegistries("registerNode", thisNode.NodeDeclaration);
    }

    AddStream(streamName, streamDescription) {
        let thisNode = this;
        if (streamName && streamDescription) {
            thisNode.NodeDeclaration.Streams[streamName] = streamDescription;
        }
    }

    /**
     * @param {DRP_Command} cmdObj Command object
     * @param {object} wsConn Websocket connection object
     * @param {string} token Reply token
     * @return {object} Response
    */
    async LocalServiceCommand(cmdObj, wsConn, token) {
        let thisNode = this;
        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            thisNode.Registry.log(`${baseMsg} params not supplied`);
            return null;
        }
        if (!cmdObj.serviceName) {
            thisNode.Registry.log(`${baseMsg} params.serviceName not supplied`);
            return null;
        }
        if (!cmdObj.cmd) {
            thisNode.Registry.log(`${baseMsg} params.method not supplied`);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName]) {
            thisNode.Registry.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd]) {
            thisNode.Registry.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
            return null;
        }
        return await thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd](cmdObj.params, wsConn);
    }

    /**
     * @param {DRP_Command} cmdObj Command object
     * @param {object} wsConn Websocket connection object
     * @param {string} token Reply token
     * @return {object} Response
    */
    async ServiceCommand(cmdObj, wsConn, token) {
        let thisNode = this;

        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            this.log(`${baseMsg} cmdObj not supplied`);
            return null;
        }
        if (!cmdObj.serviceName) {
            this.log(`${baseMsg} cmdObj.serviceName not supplied`);
            return null;
        }
        if (!cmdObj.cmd) {
            this.log(`${baseMsg} cmdObj.cmd not supplied`);
            return null;
        }

        // Do we offer this service?
        if (thisNode.Services[cmdObj.serviceName]) {
            let results = await thisNode.LocalServiceCommand(cmdObj, wsConn);
            return results;
        } else {

            let targetProviderName = null;

            // Are we specifying which provider to run this through?
            if (cmdObj.targetProvider) {
                targetProviderName = cmdObj.targetProvider;
                if (!this.NodeDeclarations[targetProviderName]) {
                    this.log(`${baseMsg} provider ${targetProviderName} does not exist`);
                    return null;
                }
            } else {
                // Loop over providers
                // TODO - implement load balancing, prioritization & zoning mechanism
                let providerNames = Object.keys(this.NodeDeclarations);
                for (let i = 0; i < providerNames.length; i++) {
                    let thisProviderName = providerNames[i];

                    // Does this provider offer the service we need?
                    if (this.NodeDeclarations[thisProviderName].Services && this.NodeDeclarations[thisProviderName].Services[cmdObj.serviceName]) {

                        // Yes - pick this one
                        targetProviderName = thisProviderName;
                    }
                }

                // Did we find a provider with this service?
                if (!targetProviderName) {
                    // No suitable provider found
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
                    console.dir(cmdObj);
                    return null;
                }
            }

            // Does this provider offer the service we need?
            if (this.NodeDeclarations[targetProviderName].Services && this.NodeDeclarations[targetProviderName].Services[cmdObj.serviceName]) {
                let checkService = this.NodeDeclarations[targetProviderName].Services[cmdObj.serviceName];

                // Does the service offer the command we want to execute?
                if (checkService["ClientCmds"].includes(cmdObj.cmd)) {
                    // Let's execute it
                    let thisNodeClient = await this.VerifyNodeConnection(targetProviderName);

                    // Await for command from provider
                    let returnObj = null;
                    let results = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", "serviceCommand", cmdObj, true, null);
                    if (results && results.payload && results.payload) {
                        returnObj = results.payload;
                    }
                    return returnObj;
                } else {
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
                    return null;
                }
            }
        }
    }

    /**
     * 
     * @param {DRP_NodeDeclaration} declaration DRP Node Declaration
     * @param {any} wsConn Source websocket conn
     * @param {any} token Reply token
     * @returns {object} Unsure
     */
    async RegisterNode(declaration, wsConn, token) {
        let thisNode = this;

        let results = null;

        let isDeclarationValid = typeof declaration !== "undefined" && typeof declaration.NodeID !== "undefined" && declaration.NodeID !== null && declaration.NodeID !== "";
        if (!isDeclarationValid) return "INVALID DECLARATION";

        // Add to declarations
        thisNode.NodeDeclarations[declaration.NodeID] = declaration;

        // Send to topic manager for debugging
        thisNode.TopicManager.SendToTopic("RegistryUpdate", { "action": "register", "nodeID": declaration.NodeID, "declaration": declaration });

        // If this is a registry node, tag the connection and relay to other nodes
        if (thisNode.IsRegistry()) {

            // Add provider and relay to Brokers
            thisNode.log(`Registering node [${declaration.NodeID}]`);
            // If the change is local, wsConn will not be present
            if (wsConn) {
                wsConn.NodeID = declaration.NodeID;
                thisNode.NodeEndpoints[declaration.NodeID] = new drpEndpoint.Endpoint(wsConn);
            }
            thisNode.RelayNodeChange("registerNode", declaration);
        }

        // TODO: This needs to be updated to check whether or not the consumerWSConn.Subscriptions is global or local!
        // consumerWSConn.Subscriptions[subscriberStreamToken] = subscribedTopicName
        // Needs to be change to an object...
        // consumerWSConn.Subscriptions[subscriberStreamToken] = {"topicName":subscribedTopicName,"scope":"{local|global}"

        // This needs to be moved elsewhere; loop over broker clients to see if this provider has any streams someone has subscribed to
        if (thisNode.ConsumerConnections && declaration.Streams && Object.keys(declaration.Streams).length > 0) {

            // Loop over streams
            let providerStreamNames = Object.keys(declaration.Streams);
            for (let i = 0; i < providerStreamNames.length; i++) {
                // Loop over clients
                let consumerConnList = Object.keys(thisNode.ConsumerConnections);
                for (let j = 0; j < consumerConnList.length; j++) {
                    let consumerWSConn = thisNode.ConsumerConnections[consumerConnList[j]];
                    if (!consumerWSConn.Subscriptions || Object.keys(consumerWSConn.Subscriptions).length === 0) continue;
                    // Loop over client subscriptions
                    let subscriptionTokens = Object.keys(consumerWSConn.Subscriptions);
                    for (let k = 0; k < subscriptionTokens.length; k++) {
                        let subscriberStreamToken = subscriptionTokens[k];
                        let subscribedTopicName = consumerWSConn.Subscriptions[subscriberStreamToken];
                        if (providerStreamNames[i] === subscribedTopicName) {
                            // We have a match; need to subscribe
                            // This provider offers the desired stream
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            let thisNodeClient = await thisNode.VerifyNodeConnection(declaration.NodeID);

                            // Subscribe on behalf of the Consumer
                            let providerStreamToken = thisNode.RouteHandler.AddStreamHandler(thisNodeClient.wsConn, async function (response) {
                                //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                                //console.dir(response);
                                let sendFailed = false;
                                if (!consumerWSConn.Subscriptions[subscriberStreamToken]) {
                                    sendFailed = true;
                                } else {
                                    sendFailed = thisNode.RouteHandler.SendStream(consumerWSConn, subscriberStreamToken, 2, response.payload);
                                    //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                                }
                                if (sendFailed) {
                                    // Client disconnected
                                    if (thisNodeClient.wsConn.StreamHandlerQueue[response.token]) {
                                        thisNodeClient.DeleteStreamHandler(thisNodeClient.wsConn, response.token);
                                        //console.log("Stream handler removed forcefully");
                                    }
                                    let unsubResults = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", "unsubscribe", { "topicName": subscribedTopicName, "streamToken": response.token }, true, null);
                                    //console.log("Unsubscribe from orphaned stream");
                                    //console.dir(unsubResults);
                                }
                            });

                            // Await for command from provider
                            let subResults = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", "subscribe", { "topicName": subscribedTopicName, "streamToken": providerStreamToken }, true, null);
                            let bob = 1;
                        }
                    }
                }
            }
        }
        return results;

    }

    async UnregisterNode(nodeID) {
        // Delete node
        let thisNode = this;
        thisNode.log(`Unregistering node [${nodeID}]`);
        delete thisNode.NodeEndpoints[nodeID];
        delete thisNode.NodeDeclarations[nodeID];
        thisNode.TopicManager.SendToTopic("RegistryUpdate", { "action": "unregister", "nodeID": nodeID });
        if (thisNode.IsRegistry()) {
            thisNode.RelayNodeChange("unregisterNode", nodeID);
        }
    }

    RelayNodeChange(cmd, params) {
        // Relay to Nodes
        let thisNode = this;
        let nodeIDList = Object.keys(thisNode.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {
            thisNode.NodeEndpoints[nodeIDList[i]].SendCmd(null, "DRP", cmd, params, false, null);
            //thisNode.RouteHandler.SendCmd(thisNode.NodeEndpoints[nodeIDList[i]], "DRP", cmd, params, false, null);
            thisNode.log(`Relayed to node: [${nodeIDList[i]}]`);
        }
    }

    async ConnectToRegistry(registryURL) {
        let thisNode = this;
        // Initiate Registry Connection
        let nodeClient = new DRP_NodeClient(thisNode, registryURL, thisNode.webProxyURL, async function (response) {
            let getDeclarationResponse = await nodeClient.SendCmd(null, "DRP", "getNodeDeclaration", null, true, null);
            if (getDeclarationResponse && getDeclarationResponse.payload && getDeclarationResponse.payload.NodeID) {
                thisNode.NodeEndpoints[getDeclarationResponse.payload.NodeID] = nodeClient;
            }
            let getDeclarationsResponse = await nodeClient.SendCmd(null, "DRP", "getDeclarations", null, true, null);
            thisNode.NodeDeclarations = getDeclarationsResponse.payload;
        });
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            let objKeys = Object.keys(oTargetObject);
            for (let i = 0; i < objKeys.length; i++) {
                let returnVal;
                //let attrType = typeof currentPathObj[objKeys[i]];
                let childAttrObj = oTargetObject[objKeys[i]];
                let attrType = Object.prototype.toString.call(childAttrObj).match(/^\[object (.*)\]$/)[1];

                switch (attrType) {
                    case "Object":
                        returnVal = Object.keys(childAttrObj).length;
                        break;
                    case "Array":
                        returnVal = childAttrObj.length;
                        break;
                    case "Function":
                        returnVal = null;
                        break;
                    default:
                        returnVal = childAttrObj;
                }
                pathObjList.push({
                    "Name": objKeys[i],
                    "Type": attrType,
                    "Value": returnVal
                });
            }
        }
        return pathObjList;
    }
    /*
    async NodeToNodeCmd(params, wsConn, token) {
        let thisNode = this;
        // Find Provider connection, relay this packet
        if (params.targetNodeID === thisNode.nodeID) {
            // This message is meant for thisNode
            let thisRegistryClient = this;
            // We've received a message from a Broker through the Registry; should be a connection request
            thisNode.log("We've received a Node to Node message through the Registry...");
            //console.dir(params);

            thisNode.log(`Connecting to broker [${params.sourceNodeID}] @ '${params.wsTarget}'`);

            // Replace the following with a shortcut? (Add .ConnectToNode to this class)

            let wsConnBroker = null;
            if (thisRegistryClient.proxy) {
                let opts = url.parse(thisRegistryClient.proxy);
                let agent = new HttpsProxyAgent(opts);
                wsConnBroker = new WebSocket(params.wsTarget, "drp", { agent: agent });
            } else {
                wsConnBroker = new WebSocket(params.wsTarget, "drp");
            }
            wsConnBroker.on('open', function () {
                thisNode.log("Connected to broker...");
                thisNode.RouteHandler.OpenHandler(wsConnBroker);
                thisNode.RouteHandler.SendCmd(wsConnBroker, "DRP", "nodeConnection", { token: params.token, nodeID: thisNode.NodeDeclaration.NodeID });
            });

            wsConnBroker.on("message", function (message) {
                // Process command
                thisNode.RouteHandler.ReceiveMessage(wsConnBroker, message);
            });

            wsConnBroker.on("close", function (closeCode) {
                thisNode.log(`Closed conn to broker: [${closeCode}]`);
                thisNode.CloseHandler(wsConnBroker, closeCode);
            });

            wsConnBroker.on("error", function (error) {
                thisRegistryClient.node.log(`Errored conn to broker: [${error}]`);
                thisRegistryClient.node.RouteHandler.ErrorHandler(wsConnBroker, error);
            });

            thisNode.NodeConnections[params.sourceNodeID] = wsConnBroker;
        } else {
            thisNode.log(`Relaying to Node [${params.targetNodeID}]...`);
            //console.dir(params);
            thisNode.RouteHandler.SendCmd(thisNode.NodeConnections[params.targetNodeID], "DRP", "nodeToNodeCmd", params, false, null);
        }
        return null;
    }
    */

    IsRegistry() {
        let thisNode = this;
        let isRegistry = thisNode.nodeRoles.indexOf("Registry") >= 0;
        return isRegistry;
    }
}

class DRP_Node_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRP_Node} node DRP Node
    * @param {string} wsTarget WS target
    * @param {string} proxy Web proxy
    */
    constructor(node, wsTarget, proxy) {
        super(wsTarget, proxy);
        this.node = node;

        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("unregisterNode", "UnregisterNode");
        //this.RegisterCmd("nodeToNodeCmd", "NodeToNodeCmd");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
    }

    // Define handlers
    async OpenHandler(wsConn, req) {

        this.node.log("Node to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "DRP", "registerNode", this.node.NodeDeclaration, true, null);

        //console.log("Getting declarations broker...");
        response = await this.SendCmd(this.wsConn, "DRP", "getDeclarations", null, true, null);

        this.node.NodeDeclarations = response.payload;
        this.node.TopicManager.SendToTopic("RegistryUpdate", { "action": "initialread", "declarations": this.node.NodeDeclarations });
        //console.dir(response, { depth: 10 });

        // TODO - Iterate over provider declarations and build tree for data lookups
        // OR - Do it on the fly

        if (this.node.RegistryOpenedHandler && typeof this.node.RegistryOpenedHandler === 'function') {
            this.node.RegistryOpenedHandler();
        }
    }

    async CloseHandler(wsConn, closeCode) {
        let remoteAddress = null;
        let remotePort = null;
        if (wsConn._socket) {
            remoteAddress = wsConn._socket.remoteAddress;
            remotePort = wsConn._socket.remotePort;
        }
        this.node.log("Node to Registry client [" + remoteAddress + ":" + remotePort + "] closed with code [" + closeCode + "]");
        await sleep(5000);
        this.RetryConnection();
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Provider to Registry client encountered error [" + error + "]");
    }

    async RegisterNode(params, wsConn, token) {
        return await this.node.RegisterNode(params, wsConn, token);
    }

    async UnregisterNode(params, wsConn, token) {
        return await this.node.UnregisterNode(params, wsConn, token);
    }

    /*
    async NodeToNodeCmd(params, wsConn, token) {
        let thisRegistryClient = this;
        // We've received a message from a Broker through the Registry; should be a connection request
        this.node.log("We've received a Node to Node message through the Registry...");
        //console.dir(params);

        this.node.log(`Connecting to broker [${params.sourceNodeID}] @ '${params.wsTarget}'`);
        let wsConnBroker = null;
        if (thisRegistryClient.proxy) {
            let opts = url.parse(thisRegistryClient.proxy);
            let agent = new HttpsProxyAgent(opts);
            wsConnBroker = new WebSocket(params.wsTarget, "drp", { agent: agent });
        } else {
            wsConnBroker = new WebSocket(params.wsTarget, "drp");
        }
        wsConnBroker.on('open', function () {
            thisRegistryClient.node.log("Connected to broker...");
            thisRegistryClient.node.RouteHandler.OpenHandler(wsConnBroker);
            thisRegistryClient.node.RouteHandler.SendCmd(wsConnBroker, "DRP", "nodeConnection", { token: params.token, nodeID: thisRegistryClient.node.NodeDeclaration.NodeID });
        });

        wsConnBroker.on("message", function (message) {
            // Process command
            thisRegistryClient.node.RouteHandler.ReceiveMessage(wsConnBroker, message);
        });

        wsConnBroker.on("close", function (closeCode) {
            thisRegistryClient.node.log(`Closed conn to broker: [${closeCode}]`);
            thisRegistryClient.node.RouteHandler.CloseHandler(wsConnBroker, closeCode);
        });

        wsConnBroker.on("error", function (error) {
            thisRegistryClient.node.log(`Errored conn to broker: [${error}]`);
            thisRegistryClient.node.RouteHandler.ErrorHandler(wsConnBroker, error);
        });

        thisRegistryClient.node.NodeConnections[params.sourceNodeID] = wsConnBroker;
    }
    */

    // Define Endpoints commands
    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisNodeClient = this;
        let results = {};
        // Register the declaration for future reference
        //console.log("Stream handler reply token: " + token);
        //console.dir(params);
        let subscriberStreamToken = params.streamToken;
        if (!wsConn.Subscriptions) wsConn.Subscriptions = {};
        wsConn.Subscriptions[subscriberStreamToken] = params.topicName;
        // Find anyone who provides this data and subscribe on the consumer's behalf
        let sourceNodeIDList = Object.keys(thisNodeClient.node.NodeDeclarations);
        for (let i = 0; i < sourceNodeIDList.length; i++) {
            let sourceNodeID = sourceNodeIDList[i];
            //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
            let thisNodeDeclaration = thisNodeClient.node.NodeDeclarations[sourceNodeID];
            if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[params.topicName]) {
                // This source node offers the desired stream

                // Is it this node?
                if (sourceNodeID === thisNodeClient.node.nodeID) {
                    results[sourceNodeID] = thisNodeClient.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
                } else {
                    /**
                    * @type {DRP_NodeClient} DRP Node Client
                    */

                    let thisNodeEndpoint = await thisNodeClient.node.VerifyNodeConnection(sourceNodeID);

                    // Subscribe on behalf of the Consumer
                    //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                    let sourceStreamToken = thisNodeClient.AddStreamHandler(thisNodeEndpoint.wsConn, async function (response) {
                        //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                        //console.dir(response);
                        let sendFailed = false;
                        if (!wsConn.Subscriptions[subscriberStreamToken]) {
                            sendFailed = true;
                        } else if (customRelayHandler && typeof customRelayHandler === 'function') {
                            sendFailed = customRelayHandler(wsConn, subscriberStreamToken, 2, response.payload);
                        } else {
                            sendFailed = thisNodeClient.SendStream(wsConn, subscriberStreamToken, 2, response.payload);
                            //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                        }
                        if (sendFailed) {
                            // Client disconnected
                            if (thisNodeEndpoint.wsConn.StreamHandlerQueue[response.token]) {
                                thisNodeEndpoint.DeleteStreamHandler(thisNodeEndpoint.wsConn, response.token);
                                //console.log("Stream handler removed forcefully");
                            }
                            let unsubResults = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "unsubscribe", { "topicName": params.topicName, "streamToken": response.token }, true, null);
                            //console.log("Unsubscribe from orphaned stream");
                            //console.dir(unsubResults);
                        }
                    });

                    // Await for command from source node
                    results[sourceNodeID] = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "subscribe", { "topicName": params.topicName, "streamToken": sourceStreamToken }, true, null);
                }
            }
        }

        return results;
    }

    async Unsubscribe(params, wsConn, token) {
        let thisRouteServer = this;
        let subscriberStreamToken = params.streamToken;
        //console.dir(wsConn.OutboundStreams);
        if (wsConn.Subscriptions && wsConn.Subscriptions[subscriberStreamToken]) {
            delete wsConn.Subscriptions[subscriberStreamToken];

            // Dirty workaround - try removing locally on each call
            thisRouteServer.node.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
        }
        return null;
    }
}

class DRP_Service {
    constructor(serviceID) {
        this.serviceID = serviceID;
    }
}

class DRP_Registry extends DRP_Node {
    constructor(expressApp) {

        super(["Registry"], expressApp);

        let thisDRPRegistry = this;

        this.RouteHandler = new DRP_Registry_Route(this, '/registry');
    }

    RegisterNode(declaration, wsConn, token) {
        if (typeof declaration !== "undefined" && typeof declaration.NodeID !== "undefined" && declaration.NodeID !== null && declaration.NodeID !== "") {
            // Add provider and relay to Brokers
            this.log(`Registering node [${declaration.NodeID}]`);
            wsConn.NodeID = declaration.NodeID;
            this.NodeEndpoints[declaration.NodeID] = wsConn;
            this.NodeDeclarations[declaration.NodeID] = declaration;
            this.RelayNodeChange("registerNode", declaration);
            //console.log("Provider registered...");
            //console.dir(declaration, {depth: 10});
            return "OKAY";
        } else return "NO PROVIDER ID";
    }

    UnregisterNode(nodeID) {
        // Delete provider and relay to Brokers
        this.log(`Unregistering provider [${nodeID}]`);
        delete this.NodeEndpoints[nodeID];
        delete this.NodeDeclarations[nodeID];
        this.RelayNodeChange("unregisterNode", nodeID);
    }

    RelayNodeChange(cmd, params) {
        // Relay to Brokers
        //console.dir(this.BrokerConnections);
        let nodeIDList = Object.keys(this.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {
            this.RouteHandler.SendCmd(this.NodeEndpoints[nodeIDList[i]], "DRP", cmd, params, false, null);
            this.log(`Relayed to node: [${nodeIDList[i]}]`);
        }
    }
}

class DRP_Registry_Route extends DRP_Node_ServerRoute {
    /**
    * @param {DRP_Registry} registry DRP Registry
    * @param {string} route WS route
    */
    constructor(registry, route) {

        // Initialize server
        super(registry, route);

        let thisRegistryRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("getDeclarations", "GetDeclarations");
        //this.RegisterCmd("nodeToNodeCmd", "NodeToNodeCmd");
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        //console.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");

        if (wsConn.NodeID) {
            this.node.UnregisterNode(wsConn.NodeID);
        }
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    async RegisterNode(params, wsConn, token) {
        return this.node.RegisterNode(params, wsConn, token);
    }

    /**
    * @returns {{string:DRP_NodeDeclaration}} Node Declarations
    */
    async GetDeclarations() {
        return this.node.NodeDeclarations;
    }

    /*
    async NodeToNodeCmd(params, wsConn, token) {
        // Find Provider connection, relay this packet
        this.node.log(`Relaying to Node [${params.targetNodeID}]...`);
        //console.dir(params);
        this.node.RouteHandler.SendCmd(this.node.NodeConnections[params.targetNodeID], "DRP", "nodeToNodeCmd", params, false, null);
        return null;
    }
    */
}

class DRP_Provider extends DRP_Node {
    /**
    * @param {express} expressApp WS enabled ExpressApp
	* @param {string} providerURL Broker to Provider URL
    * @param {string} providerRoute Route for WS endpoints to access this instance
    */
    constructor(expressApp, providerURL, providerRoute) {

        super(["Provider"], expressApp, providerURL);

        this.providerRoute = providerRoute;
        if (!providerRoute) this.providerRoute = "/provider";

        let thisDRPProvider = this;

        this.expressApp = expressApp;

        this.Structure = {};

        this.Services = {};

        // Create RouteHandler
        this.RouteHandler = new DRP_Provider_Route(this, this.providerRoute);

        // Create topic manager
        this.TopicManager = new DRP_TopicManager(this);
    }

    Subscribe(params, wsConn, token) {
        this.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

    Unsubscribe(params, wsConn, token) {
        this.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

}

class DRP_Provider_Route extends DRP_Node_ServerRoute {
    /**
    * @param {DRP_Provider} provider DRP Provider
    * @param {string} route WS route
    */
    constructor(provider, route) {

        // Initialize server
        super(provider, route);

        let thisProviderRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("serviceCommand", async function (...args) {
            return await provider.ServiceCommand(...args);
        });
        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let oReturnObject = await thisProviderRoute.node.GetObjFromPath(params, thisProviderRoute.node.GetBaseObj());

            // If we have a return object and want only a list of children, do that now
            if (params.listOnly) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: thisProviderRoute.node.ListObjChildren(oReturnObject) };
                }
            } else if (oReturnObject) {
                if (!oReturnObject.pathItem) {
                    // Return object as item
                    oReturnObject = { pathItem: oReturnObject };
                }
            }

            return oReturnObject;
        });
    }

    // Define handlers
    async OpenHandler(wsConn, req) {
        this.node.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        setInterval(function ping() {
            wsConn.ping(function () { });
        }, 30000);
    }

    async CloseHandler(wsConn, closeCode) {
        this.node.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async RegisterNode(params, wsConn, token) {
        return this.node.RegisterNode(params, wsConn, token);
    }

    // Subscribe to data stream
    async Subscribe(params, wsConn, token) {
        return this.node.Subscribe(params, wsConn, token);
    }

    // Unsubscribe from data stream
    async Unsubscribe(params, wsConn, token) {
        return this.node.Unsubscribe(params, wsConn, token);
    }
}

class DRP_Broker extends DRP_Node {
    constructor(expressApp, brokerURL, registryOpenedHandler) {

        super(["Broker"], expressApp);

        let thisDRPBroker = this;

        this.expressApp = expressApp;

        this.brokerURL = brokerURL;

        this.ConsumerConnections = {};

        this.RegistryOpenedHandler = registryOpenedHandler;

        this.ConsumerRouteHandler = new DRP_Broker_Route(this, '/broker');
        this.routerStack = this.expressApp._router.stack;
        let brokerRestHandler = async function (req, res, next) {
            // Get Auth Key
            let authKey = null;
            if (req.headers && req.headers['authorization']) {
                authKey = req.headers['authorization'];
            }

            // Turn path into list, remove first element
            let remainingPath = req.path.replace(/^\/|\/$/g, '').split('/');
            remainingPath.shift();

            let listOnly = false;
            let format = null;

            if (req.query.listOnly) listOnly = true;
            if (req.query.format) format = 1;

            // Treat as "getPath"
            let results = await thisDRPBroker.ConsumerRouteHandler.PathCmd({ "method": "cliGetPath", "pathList": remainingPath, "listOnly": listOnly, "authKey": authKey });
            try {
                res.end(JSON.stringify(results, null, format));
            } catch (e) {
                res.end(`Failed to stringify response: ${e}`);
            }
            next();
        };

        expressApp.get("/broker", brokerRestHandler);
        expressApp.get("/broker/*", brokerRestHandler);
    }

    RegisterConsumer(params, wsConn, token) {
    }

    async GetClassRecords(params) {
        let thisBroker = this;

        let results = {};

        // If user didn't supply the className, return null
        if (!params || !params.className) return null;
        let thisClassName = params.className;

        // We need to get a list of all distinct INSTANCES for this class along with the best source for each
        let classInstances = thisBroker.ListClassInstances();

        // If we don't have data for this class, return null
        if (!classInstances[thisClassName]) return null;

        let thisClassObj = classInstances[thisClassName];

        // Loop over sourceInstances
        let sourceInstanceNames = Object.keys(thisClassObj);
        for (let j = 0; j < sourceInstanceNames.length; j++) {
            let thisSourceInstanceName = sourceInstanceNames[j];
            let thisSourceInstanceObj = thisClassObj[thisSourceInstanceName];

            // Loop over providers; get the best precedence (lower is better)
            let bestProviderObj = null;
            let bestProviderName = null;
            let providerNames = Object.keys(thisSourceInstanceObj.providers);
            for (let k = 0; k < providerNames.length; k++) {
                let thisProviderName = providerNames[k];
                let thisProviderObj = thisSourceInstanceObj.providers[thisProviderName];
                if (!bestProviderObj || thisProviderObj.Precedence < bestProviderObj.Precedence) {
                    bestProviderObj = thisProviderObj;
                    bestProviderName = thisProviderName;
                }
            }

            // We have the best provider for this class instance
            let recordPath = ["Providers", bestProviderName].concat(bestProviderObj.RecordPath);
            let returnData = await thisBroker.GetObjFromPath({ method: "cliGetPath", pathList: recordPath, listOnly: false, authKey: params.authKey }, thisBroker.GetBaseObj_Broker());
            results[thisSourceInstanceName] = returnData.pathItem;
        }
        return results;
    }

    ListServiceInstances(params) {
        let results = {};
        let findServiceName = params;
        let providerNames = Object.keys(this.NodeDeclarations);
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = this.NodeDeclarations[providerName];
            // Loop over Services
            if (!thisNodeDeclaration.Services) continue;
            let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
            for (let j = 0; j < serviceInstanceList.length; j++) {
                let serviceInstanceID = serviceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let serviceInstanceObj = thisNodeDeclaration.Services[serviceInstanceID];
                if (!results[serviceInstanceID]) results[serviceInstanceID] = {
                    providers: [],
                    methods: serviceInstanceObj
                };

                results[serviceInstanceID].providers.push(providerName);
            }
        }
        return results;
    }
}

class DRP_Broker_Route extends DRP_Node_ServerRoute {
    /**
    * @param {DRP_Broker} broker DRP Broker
    * @param {string} route WS route
    */
    constructor(broker, route) {

        // Initialize server
        super(broker, route);

        let thisBrokerRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn, token);
        });
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");

        this.RegisterCmd("pathCmd", "PathCmd");

        this.RegisterCmd("getRegistry", function () {
            return thisBrokerRoute.node.NodeDeclarations;
        });

        this.RegisterCmd("getClassRecords", async function (...args) {
            return await thisBrokerRoute.node.GetClassRecords(...args);
        });

        this.RegisterCmd("listClassInstances", function () {
            return thisBrokerRoute.node.ListClassInstances();
        });

        this.RegisterCmd("listServiceInstances", function () {
            return thisBrokerRoute.node.ListServiceInstances();
        });

        this.RegisterCmd("getClassDefinitions", function () {
            return thisBrokerRoute.node.GetClassDefinitions();
        });

        this.RegisterCmd("listClassInstanceDefinitions", async function (...args) {
            return await thisBrokerRoute.node.ListClassInstanceDefinitions(...args);
        });

        this.RegisterCmd("nodeConnection", function (params, wsConn, token) {
            thisBrokerRoute.node.NodeEndpoints[params.nodeID] = wsConn;
            if (wsConn.id) delete thisBrokerRoute.node.ConsumerConnections[wsConn.id];
        });
    }

    // We need to override the default ProcessCmd; we may be receiving a "service" attribute
    async ProcessCmd(wsConn, message) {
        let thisEndpoint = this;

        var cmdResults = {
            status: 0,
            output: null
        };

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
                thisEndpoint.node.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
                console.dir(message);
                //console.dir(thisEndpoint.EndpointCmds);
            }
        } else {
            try {
                cmdResults.output = await thisEndpoint.node.ServiceCommand(message, wsConn);
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

    // Define Handlers
    async OpenHandler(wsConn, req) {
        //console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        //this.service.ConsumerConnections
        if (!this.node.ConsumerConnectionID) this.node.ConsumerConnectionID = 1;
        //wsConn.id = `${wsConn._socket.remoteAddress}-${wsConn._socket.remotePort}`;
        wsConn.id = this.node.ConsumerConnectionID;
        this.node.ConsumerConnectionID++;
        this.node.ConsumerConnections[wsConn.id] = wsConn;
    }

    async CloseHandler(wsConn, closeCode) {
        //this.service.log("Broker client [" + wsConn.id + "] closed with code [" + closeCode + "]");
        if (wsConn.id) delete this.node.ConsumerConnections[wsConn.id];
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisConsumerRoute = this;
        let results = {};
        // Register the declaration for future reference
        //console.log("Stream handler reply token: " + token);
        //console.dir(params);
        let subscriberStreamToken = params.streamToken;
        if (!wsConn.Subscriptions) wsConn.Subscriptions = {};
        wsConn.Subscriptions[subscriberStreamToken] = params.topicName;
        // Find anyone who provides this data and subscribe on the consumer's behalf
        let sourceNodeIDList = Object.keys(this.node.NodeDeclarations);
        for (let i = 0; i < sourceNodeIDList.length; i++) {
            let sourceNodeID = sourceNodeIDList[i];
            //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
            let thisNodeDeclaration = this.node.NodeDeclarations[sourceNodeID];
            if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[params.topicName]) {
                // This source node offers the desired stream
                /**
                * @type {DRP_NodeClient} DRP Node Client
                */

                let thisNodeClient = await this.node.VerifyNodeConnection(sourceNodeID);

                // Subscribe on behalf of the Consumer
                //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                let sourceStreamToken = thisConsumerRoute.AddStreamHandler(thisNodeClient.wsConn, async function (response) {
                    //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                    //console.dir(response);
                    let sendFailed = false;
                    if (!wsConn.Subscriptions[subscriberStreamToken]) {
                        sendFailed = true;
                    } else if (customRelayHandler && typeof customRelayHandler === 'function') {
                        sendFailed = customRelayHandler(wsConn, subscriberStreamToken, 2, response.payload);
                    } else {
                        sendFailed = thisConsumerRoute.SendStream(wsConn, subscriberStreamToken, 2, response.payload);
                        //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                    }
                    if (sendFailed) {
                        // Client disconnected
                        if (thisNodeClient.wsConn.StreamHandlerQueue[response.token]) {
                            thisNodeClient.DeleteStreamHandler(thisNodeClient.wsConn, response.token);
                            //console.log("Stream handler removed forcefully");
                        }
                        let unsubResults = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", "unsubscribe", { "topicName": params.topicName, "streamToken": response.token }, true, null);
                        //console.log("Unsubscribe from orphaned stream");
                        //console.dir(unsubResults);
                    }
                });

                // Await for command from source node
                results[sourceNodeID] = await thisNodeClient.SendCmd(thisNodeClient.wsConn, "DRP", "subscribe", { "topicName": params.topicName, "streamToken": sourceStreamToken }, true, null);
            }
        }

        return results;
    }

    async Unsubscribe(params, wsConn, token) {
        let subscriberStreamToken = params.streamToken;
        //console.dir(wsConn.OutboundStreams);
        if (wsConn.Subscriptions && wsConn.Subscriptions[subscriberStreamToken]) {
            delete wsConn.Subscriptions[subscriberStreamToken];
            //console.log("Outbound stream removed");
        }
        return null;
    }

    async PathCmd(params, wsConn, token) {
        // params.method
        // params.pathList
        return await this.node.GetObjFromPath(params, this.node.GetBaseObj_Broker());
    }

}

class DRP_NodeClient extends drpEndpoint.Client {
    /**
    * @param {DRP_Node} drpNode Local Node
    * @param {string} wsTarget Remote Node WS target
    * @param {string} proxy Web proxy
    * @param {function} openCallback Execute after connection is established
    */
    constructor(drpNode, wsTarget, proxy, openCallback) {
        super(wsTarget, proxy);
        this.node = drpNode;
        this.proxy = proxy;
        this.openCallback = openCallback;
        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        //this.RegisterCmd("getDeclarations", "GetDeclarations");

        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("getNodeDeclaration", "GetNodeDeclaration");
        this.RegisterCmd("pathCmd", async function (params, wsConn, token) {
            return await drpNode.GetObjFromPath(params, drpNode.GetBaseObj());
        });
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        this.node.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        //let response = await this.SendCmd(this.wsConn, "DRP", "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        let response = await this.SendCmd(this.wsConn, "DRP", "registerNode", this.node.NodeDeclaration, true, null);
        this.openCallback(response);

    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        let remoteAddress = null;
        let remotePort = null;
        if (wsConn._socket) {
            remoteAddress = wsConn._socket.remoteAddress;
            remotePort = wsConn._socket.remotePort;
        }
        this.node.log("Node client [" + remoteAddress + ":" + remotePort + "] closed with code [" + closeCode + "]");
        await sleep(5000);
        this.RetryConnection();
    }

    async ErrorHandler(wsConn, error) {
        this.node.log("Node client encountered error [" + error + "]");
    }

    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisRouteServer = this;
        let results = {};
        // Register the declaration for future reference
        //console.log("Stream handler reply token: " + token);
        //console.dir(params);
        let subscriberStreamToken = params.streamToken;
        if (!wsConn.Subscriptions) wsConn.Subscriptions = {};
        wsConn.Subscriptions[subscriberStreamToken] = params.topicName;

        let subScope = params.scope || "local";

        // TO DO: We need to determine if this request came from a Consumer or a Node
        //
        // If it came from a node, we need to subscribe to the topic and reply back
        // results[sourceNodeID] = thisRouteServer.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
        //
        // If it came from a consumer, we need to find all instances and subscribe to them on behalf of the consumer

        switch (subScope) {
            case "local":
                results[thisRouteServer.node.nodeID] = thisRouteServer.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
                break;
            case "global":
                // Find anyone who provides this data and subscribe on the consumer's behalf
                let sourceNodeIDList = Object.keys(thisRouteServer.node.NodeDeclarations);
                for (let i = 0; i < sourceNodeIDList.length; i++) {
                    let sourceNodeID = sourceNodeIDList[i];
                    //console.log(`Checking for stream [${params.topicName}] for client on node [${sourceNodeID}]`);
                    let thisNodeDeclaration = thisRouteServer.node.NodeDeclarations[sourceNodeID];
                    if (thisNodeDeclaration.Streams && thisNodeDeclaration.Streams[params.topicName]) {
                        // This source node offers the desired stream

                        // Is it this node?
                        if (sourceNodeID === thisRouteServer.node.nodeID) {
                            results[sourceNodeID] = thisRouteServer.node.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
                        } else {
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            let thisNodeEndpoint = await thisRouteServer.node.VerifyNodeConnection(sourceNodeID);

                            // Subscribe on behalf of the Consumer
                            //console.log(`Subscribing to stream [${params.topicName}] for client from node [${sourceNodeID}] using streamToken [${subscriberStreamToken}]`);
                            let sourceStreamToken = thisRouteServer.AddStreamHandler(thisNodeEndpoint.wsConn, async function (response) {
                                //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                                //console.dir(response);
                                let sendFailed = false;
                                if (!wsConn.Subscriptions[subscriberStreamToken]) {
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
                                    let unsubResults = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "unsubscribe", { "topicName": params.topicName, "streamToken": response.token }, true, null);
                                    //console.log("Unsubscribe from orphaned stream");
                                    //console.dir(unsubResults);
                                }
                            });

                            // Await for command from source node
                            results[sourceNodeID] = await thisNodeEndpoint.SendCmd(thisNodeEndpoint.wsConn, "DRP", "subscribe", { "topicName": params.topicName, "streamToken": sourceStreamToken }, true, null);
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
        //console.dir(wsConn.OutboundStreams);
        if (wsConn.Subscriptions && wsConn.Subscriptions[subscriberStreamToken]) {
            delete wsConn.Subscriptions[subscriberStreamToken];

            // Dirty workaround - try removing locally on each call
            thisRouteServer.node.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
        }
        return null;
    }

    async GetNodeDeclaration() {
        return this.node.NodeDeclaration;
    }

    async RegisterNode(params, wsConn, token) {
        return this.node.RegisterNode(params, wsConn, token);
    }
}

class DRP_Consumer_BrokerClient extends drpEndpoint.Client {
    constructor(wsTarget, callback) {
        super(wsTarget);
        this.postOpenCallback = callback;
    }

    async OpenHandler(wsConn, req) {
        let thisBrokerClient = this;

        thisBrokerClient.postOpenCallback();
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Consumer to Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }

    // Watch a stream
    async WatchStream(streamName, callback) {
        let thisBrokerClient = this;
        let streamToken = thisBrokerClient.AddStreamHandler(thisBrokerClient.wsConn, function (message) {
            if (message && message.payload) {
                callback(message.payload);
            }
        });

        let response = await thisBrokerClient.SendCmd(thisBrokerClient.wsConn, "DRP", "subscribe", { "topicName": streamName, "streamToken": streamToken }, true, null);

        if (response.status === 0) {
            this.DeleteCmdHandler(this.wsConn, streamToken);
            console.log("Subscribe failed, deleted handler");
        } else {
            console.log("Subscribe succeeded");
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

module.exports = {
    "Node": DRP_Node,
    "Service": DRP_Service,
    "Registry": DRP_Registry,
    "Provider": DRP_Provider,
    "ProviderRoute": DRP_Provider_Route,
    "Broker": DRP_Broker,
    "BrokerRoute": DRP_Broker_Route,
    "Server": DRP_Server,
    "ServerRoute": DRP_Node_ServerRoute,
    "Command": DRP_Command
};