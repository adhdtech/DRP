var express = require('express');
var bodyParser = require('body-parser');
var expressWs = require('express-ws');
//var cors = require('cors');
var path = require('path');
var fs = require('fs');
var util = require('util');
var os = require("os");
//var WebSocket = require('ws');
var drpEndpoint = require('drp-endpoint');

class ProviderDeclaration extends drpEndpoint.ProviderDeclaration {
    constructor(...args) { super(...args); }
}

class DRPBroker {
    constructor(port, registryBrokerURL) {

        let thisDRPBroker = this;

        this.expressApp = null;

        this.StartWebServer(port);

        /**
         * @type {{string: ProviderDeclaration}} ProviderDeclarations
         * */
        this.ProviderDeclarations = {};

        this.ProviderConnections = {};
        this.RegistryConnections = {};
        this.ConsumerConnections = {};

        this.ConsumerRouteHandler = new DRPBroker_ConsumerRoute(this, '/consumer');

        // Initiate Registry Connection
        let myClient = new DRPBroker_RegistryClient(this, registryBrokerURL);
    }

    StartWebServer(port) {
        let expressApp = express();
        //let objType = Object.getPrototypeOf(expressApp);
        expressWs(expressApp);

        expressApp.get('env');
        expressApp.use(express.static('client'));
        expressApp.use(bodyParser.urlencoded({
            extended: true
        }));
        expressApp.use(bodyParser.json());

        expressApp.get('/', function (req, res) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('This is the Broker\n');
        });

        // Start listening for HTTP & WS traffic
        expressApp.listen(port, function () {
            console.log('Express server listening on port ' + port + ' in ' + expressApp.get('env') + ' mode');
        });

        this.expressApp = expressApp;
    }

    RegisterConsumer(params, wsConn, token) {
    }

    async VerifyProviderConnection(providerID) {

        let thisBroker = this;

        let thisProviderDeclaration = this.ProviderDeclarations[providerID];

        let thisProviderClient = this.ProviderConnections[providerID];

        // Establish a wsConn client if not already established
        if (!thisProviderClient || thisProviderClient.wsConn.readyState != 1) {
            thisProviderClient = new DRPBroker_ProviderClient(this, thisProviderDeclaration.ProviderURL);
            this.ProviderConnections[providerID] = thisProviderClient;

            // Wait a few seconds for connection to initiate; need to add checks in here...
            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (!thisProviderClient.wsConn.readyState) {
                    // Yes - wait
                    await sleep(100);
                } else {
                    // No - break the for loop
                    break;
                }
            }

            // If no good connection, return false
            if (thisProviderClient.wsConn.readyState != 1) {
                thisProviderClient = null;
                delete this.ProviderConnections[providerID];
            }
        }

        return thisProviderClient;
    }

    GetBaseObj() {
        let myBroker = this;
        let myRegistry = this.ProviderDeclarations;
        return {
            "Broker": myBroker,
            "Registry": myBroker.ProviderDeclarations,
            "Providers": async function (remainingChildPath) {
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let providerID = remainingChildPath.shift();

                    // Need to send command to provider with remaining tree data
                    //let oResults = await oCurrentObject[aChildPathArray[i]](aChildPathArray.splice(i + 1));
                    //if (typeof oResults == 'object') {
                    //    oReturnObject = oResults;
                    //}

                    let thisProviderClient = await myBroker.VerifyProviderConnection(providerID);

                    // Await for command from provider
                    let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "cliGetPath", remainingChildPath, true, null);
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
            }
        }
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
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

        return { "pathItems": pathObjList }
    }

    /**
    * @param {Array.<string>} aChildPathArray Remaining path
    * @param {Boolean} bReturnChildList Flag to return list of children
    */
    async GetObjFromPath(aChildPathArray, bReturnChildList) {

        // Initial object
        let oCurrentObject = this.GetBaseObj();

        // Return object
        let oReturnObject = null;

        // Do we have a path array?
        if (aChildPathArray.length == 0) {
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
                    switch (typeof oCurrentObject[aChildPathArray[i]]) {
                        case 'object':
                            // Set current object
                            oCurrentObject = oCurrentObject[aChildPathArray[i]];
                            if (i + 1 == aChildPathArray.length) {
                                // Last one - make this the return object
                                oReturnObject = oCurrentObject;
                            }
                            break;
                        case 'function':
                            // Send the rest of the path to a function
                            let oResults = await oCurrentObject[aChildPathArray[i]](aChildPathArray.splice(i + 1));
                            if (typeof oResults == 'object') {
                                oReturnObject = oResults;
                            }
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

        // If we have a return object and want only a list of children, do that now
        if (oReturnObject && typeof oReturnObject == 'object' && bReturnChildList) {
            if (! oReturnObject.pathItems) {
                // Return only child keys and data types
                oReturnObject = this.ListObjChildren(oReturnObject);
            }
        }

        return oReturnObject;
    }

    GetPath(pathList) {
        /*
         * Currently this is based on a static struct; need to make it dynamic.
         * If the client requests access to actual objects on a provider, we
         * need to establish a connection to the provider (if not already) and
         * send a command to retrieve the objects
         */
        let currentPathObj = this.ProviderDeclarations;
        for (let i = 0; i < pathList.length; i++) {
            if (currentPathObj.hasOwnProperty(pathList[i]) && typeof currentPathObj[pathList[i]] === 'object') {
                currentPathObj = currentPathObj[pathList[i]];
            } else {
                return { "pathItems": [] };
            }
        }
        let pathObjList = [];
        let objKeys = Object.keys(currentPathObj);
        for (let i = 0; i < objKeys.length; i++) {
            let returnVal;
            //let attrType = typeof currentPathObj[objKeys[i]];
            let childAttrObj = currentPathObj[objKeys[i]];
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
                    returnVal = currentPathObj[objKeys[i]];
            }
            pathObjList.push({
                "Name": objKeys[i],
                "Type": attrType,
                "Value": returnVal
            });
        }
        return { "pathItems": pathObjList };
    }

    GetItem(pathList) {
        let currentPathObj = this.ProviderDeclarations;
        for (let i = 0; i < pathList.length; i++) {
            if (currentPathObj.hasOwnProperty(pathList[i])) {
                currentPathObj = currentPathObj[pathList[i]];
            } else {
                return { "item": null };
            }
        }

        return { "item": currentPathObj };
    }
}

class DRPBroker_ConsumerRoute extends drpEndpoint.Server {
    /**
    * @param {DRPBroker} broker DRPBroker
    * @param {string} route WS route
    */
    constructor(broker, route) {

        // Initialize server
        super(broker.expressApp, route);

        this.Broker = broker;
        let thisBrokerRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn, token);
        });
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let results = await broker.GetObjFromPath(params, true)
            return results;
        });
        this.RegisterCmd("cliGetItem", function (params, wsConn, token) {
            return broker.GetItem(params, wsConn, token);
        });

        //this.Consumers = [];
        //this.DummyCounter = 0;

        /*
        setInterval(function () {
            thisBrokerRoute.DummyCounter++;
            let i = thisBrokerRoute.Consumers.length;
            while (i--) {
                let thisSubscriber = thisBrokerRoute.Consumers[i];
                let sendFailed = thisBrokerRoute.SendStream(thisSubscriber.wsConn, thisSubscriber.token, 2, "DummyCounter=" + thisBrokerRoute.DummyCounter);
                if (sendFailed) {
                    thisBrokerRoute.Consumers.splice(i, 1);
                    console.log("Broadcast client[" + i + "] removed");
                }
            }
        }, 3000);
        */
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Subscribe(params, wsConn, token) {
        let thisConsumerRoute = this;
        // Register the declaration for future reference

        // Find anyone who provides this data and subscribe on the consumer's behalf
        let providerIDList = Object.keys(this.Broker.ProviderDeclarations);
        for (let i = 0; i < providerIDList.length; i++) {
            let providerID = providerIDList[i];
            let thisProviderDeclaration = this.Broker.ProviderDeclarations[providerID];
            if (thisProviderDeclaration.Streams && thisProviderDeclaration.Streams[params.topicName]) {
                // This provider offers the desired stream
                /**
                * @type {DRPBroker_ProviderClient} thisProviderClient DRPBroker_ProviderClient
                */

                let thisProviderClient = await this.Broker.VerifyProviderConnection(providerID);
                /*VerifyProviderConnection
                let thisProviderClient = this.Broker.ProviderConnections[providerID];

                // Establish a wsConn client if not already established
                if (!thisProviderClient) {
                    thisProviderClient = new DRPBroker_ProviderClient(this.Broker, thisProviderDeclaration.ProviderURL);
                    this.Broker.ProviderConnections[providerID] = thisProviderClient;
                    // Wait a few seconds for connection to initiate; need to add checks in here...
                    await sleep(2000);
                }
                */

                // Subscribe on behalf of the Consumer
                //let streamToken = thisConsumerRoute.GetToken(thisProviderClient.wsConn);
                let streamToken = thisConsumerRoute.AddStreamHandler(thisProviderClient.wsConn, async function (response) {
                    let sendFailed = thisConsumerRoute.SendStream(wsConn, params.streamToken, 2, response.payload);
                    if (sendFailed) {
                        // Client disconnected
                        thisConsumerRoute.DeleteStreamHandler(wsConn, params.streamToken);
                        console.log("Stream handler removed forcefully");
                        let unsubResults = await thisConsumerRoute.SendCmd(thisProviderClient.wsConn, "unsubscribe", { "topicName": params.topicName, "streamToken": streamToken }, true, null);
                        console.log("Unsubscribe results...");
                        console.dir(unsubResults);
                    }
                });

                // Await for command from provider
                let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "subscribe", { "topicName": params.topicName, "streamToken": streamToken }, true, null);
                return results;
            }
        }
    }

}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

class DRPBroker_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRPBroker} broker DRPBroker
    * @param {string} wsTarget Registry WS target
    */
    constructor(broker, wsTarget) {
        super(wsTarget);
        this.Broker = broker;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerProvider", "RegisterProvider");
        this.RegisterCmd("unregisterProvider", "UnregisterProvider");
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        response = await this.SendCmd(this.wsConn, "register", "Broker-1", true, null);

        response = await this.SendCmd(this.wsConn, "getDeclarations", null, true, null);

        this.Broker.ProviderDeclarations = response.payload;
        //console.dir(response, { depth: 10 });

        // TODO - Iterate over provider declarations and build tree for data lookups
        // OR - Do it on the fly
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Broker to Registry client encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async RegisterProvider(declaration) {
        console.log("Registering provider [" + declaration.ProviderID + "]");
        this.Broker.ProviderDeclarations[declaration.ProviderID] = declaration;
    }

    async UnregisterProvider(providerID) {
        console.log("Unregistering provider [" + providerID + "]");
        delete this.Broker.ProviderConnections[providerID];
        delete this.Broker.ProviderDeclarations[providerID];
    }
}

class DRPBroker_ProviderClient extends drpEndpoint.Client {
    /**
    * @param {DRPBroker} broker DRPBroker
    * @param {string} wsTarget Provider WS target
    */
    constructor(broker, wsTarget) {
        super(wsTarget);
        this.Broker = broker;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        console.log("Broker to Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        response = await this.SendCmd(this.wsConn, "register", "Broker-1", true, null);

    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Broker to Provider client encountered error [" + error + "]");
    }
}

module.exports = DRPBroker;
