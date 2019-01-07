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
        let myClient = new DRPBroker_RegistryClient(registryBrokerURL);
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
}

class DRPBroker_ConsumerRoute extends drpEndpoint.Server {
    /**
    * @param {DRPBroker} broker DRPBroker
    * @param {string} route WS route
    */
    constructor(broker, route) {

        // Define handlers
        let openHandler = function (wsConn, req) {
            console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        }

        let closeHandler = function (wsConn, closeCode) {
            console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        }

        let errorHandler = function (wsConn, error) {
            console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
        }

        // Initialize server
        super(broker.expressApp, route, openHandler, closeHandler, errorHandler);

        let thisBrokerRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn);
        })
        this.RegisterCmd("subscribe", "Subscribe");

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

    Subscribe(params, wsConn, token) {
        this.Consumers.push({ "wsConn": wsConn, "token": params });
        console.log("Client[" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] subscribed on token[" + token + "] with params[" + params + "]");
    }
    
}

class DRPBroker_RegistryClient extends drpEndpoint.Client {
    constructor(wsTarget) {
        super(wsTarget);
    }

    async OpenHandler(wsConn, req) {
        console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        response = await this.SendCmd(this.wsConn, "register", null, true, null);

        console.log(response);
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Broker to Registry client encountered error [" + error + "]");
    }
}

module.exports = DRPBroker;
