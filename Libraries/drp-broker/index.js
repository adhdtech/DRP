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

class DRPBroker {
    constructor(port, registryBrokerURL) {

        let thisDRPBroker = this;

        this.expressApp = null;

        this.StartWebServer(port);

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

    GetPath(pathList) {
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
            let childAttrObj= currentPathObj[objKeys[i]];
            let attrType = Object.prototype.toString.call(childAttrObj).match(/^\[object (.*)\]$/)[1];

            switch(attrType) {
                case "Object":
                    returnVal = Object.keys(childAttrObj).length;
                    break;
                case "Array":
                    returnVal = childAttrObj.length;
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

        let thisBrokerRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn, token);
        });
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("cliGetPath", function (params, wsConn, token) {
            return broker.GetPath(params, wsConn, token);
        });
        this.RegisterCmd("cliGetItem", function (params, wsConn, token) {
            return broker.GetItem(params, wsConn, token);
        });

        this.Consumers = [];
        this.DummyCounter = 0;

        setInterval(function () {
            thisBrokerRoute.DummyCounter++;
            let i = thisBrokerRoute.Consumers.length;
            while (i--) {
                let thisSubscriber = thisBrokerRoute.Consumers[i];
                let sendFailed = thisBrokerRoute.SendResponse(thisSubscriber.wsConn, thisSubscriber.token, 2, "DummyCounter=" + thisBrokerRoute.DummyCounter);
                if (sendFailed) {
                    thisBrokerRoute.Consumers.splice(i, 1);
                    console.log("Broadcast client[" + i + "] removed");
                }
            }
        }, 3000);

    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler (wsConn, error) {
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    Subscribe(params, wsConn, token) {
        this.Consumers.push({ "wsConn": wsConn, "token": params });
        console.log("Consumer client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] subscribed on token[" + token + "] with params[" + params + "]");
    }

}

class DRPBroker_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRPBroker} broker DRPBroker
    * @param {string} wsTarget WS target
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
        delete this.Broker.ProviderDeclarations[providerID]
    }
}

module.exports = DRPBroker;
