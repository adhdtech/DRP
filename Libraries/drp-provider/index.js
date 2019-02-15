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

class DRPProvider {
    /**
    * @param {string} port TCP Listening Port
    * @param {ProviderDeclaration} providerDeclaration Provider Declaration
    * @param {string} registryProviderURL Registry URL
    */
    constructor(port, providerDeclaration, registryProviderURL) {

        let thisDRPProvider = this;

        this.expressApp = null;

        this.StartWebServer(port);

        this.ProviderDeclaration = providerDeclaration;

        this.Structure = {};

        //this.RegistryConnections = {};
        this.BrokerConnections = {};

        // Create BrokerRoute
        this.BrokerRouteHandler = new DRPProvider_BrokerRoute(this, '/broker');

        // Create topic manager, assign to BrokerRoute
        this.TopicManager = new drpEndpoint.TopicManager(this.BrokerRouteHandler);

        // Initiate Registry Connection
        this.RegistryClient = new DRPProvider_RegistryClient(this, registryProviderURL);

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
            res.end('This is the Provider\n');
        });

        // Start listening for HTTP & WS traffic
        expressApp.listen(port, function () {
            console.log('Express server listening on port ' + port + ' in ' + expressApp.get('env') + ' mode');
        });

        this.expressApp = expressApp;
    }

    RegisterBroker(params, wsConn, token) {
    }

    Subscribe(params, wsConn, token) {
        this.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

    Unsubscribe(params, wsConn, token) {
        this.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

    GetBaseObj() {
        return {
            Structure: this.Structure,
            Streams: this.TopicManager.Topics
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

        return pathObjList;
    }

    /**
    * @param {Array.<string>} aChildPathArray Remaining path
    * @param {Object} oBaseObject Starting object
    */
    async GetObjFromPath(aChildPathArray, oBaseObject) {

        // Initial object
        let oCurrentObject = oBaseObject;

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

        return oReturnObject;
    }

}

class DRPProvider_BrokerRoute extends drpEndpoint.Server {
    /**
    * @param {DRPProvider} provider DRPProvider
    * @param {string} route WS route
    */
    constructor(provider, route) {

        // Initialize server
        super(provider.expressApp, route);

        let thisProviderRoute = this;
        this.Provider = provider;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", "Register");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let oReturnObject = await provider.GetObjFromPath(params, provider.GetBaseObj());
            // If we have a return object, get children
            if (oReturnObject && typeof oReturnObject == 'object') {
                // Return only child keys and data types
                oReturnObject = { "pathItems": provider.ListObjChildren(oReturnObject) };
            }
            return oReturnObject;
        });
        /*
        this.RegisterCmd("register", function (params, wsConn, token) {
            return provider.RegisterBroker(params, wsConn);
        })
        */
    }

    // Define handlers
    async OpenHandler(wsConn, req) {
        console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Register(params, wsConn, token) {
        return this.Provider.RegisterBroker(params, wsConn, token);
    }

    // Subscribe to data stream
    async Subscribe(params, wsConn, token) {
        return this.Provider.Subscribe(params, wsConn, token);
    }

    // Unsubscribe from data stream
    async Unsubscribe(params, wsConn, token) {
        return this.Provider.Unsubscribe(params, wsConn, token);
    }
}

class DRPProvider_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRPProvider} provider DRPProvider
    * @param {string} wsTarget WS target
    */
    constructor(provider, wsTarget) {
        super(wsTarget);
        this.Provider = provider;
    }

    // Define handlers
    async OpenHandler(wsConn, req) {
        console.log("Provider to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        response = await this.SendCmd(this.wsConn, "register", this.Provider.ProviderDeclaration, true, null);

        console.log("Register response...");
        console.dir(response, { depth: 10 });
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Broker to Registry client encountered error [" + error + "]");
    }
}

module.exports = DRPProvider;