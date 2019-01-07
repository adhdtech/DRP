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

class DRPProvider {
    constructor(port, registryProviderURL) {

        let thisDRPProvider = this;

        this.expressApp = null;

        this.StartWebServer(port);

        this.ProviderDeclaration = {};

        this.RegistryConnections = {};
        this.BrokerConnections = {};

        this.BrokerRouteHandler = new DRPProvider_BrokerRoute(this, '/broker');

        // Initiate Registry Connection
        let myClient = new DRPProvider_RegistryClient(registryProviderURL);
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
}

class DRPProvider_BrokerRoute extends drpEndpoint.Server {
    /**
    * @param {DRPProvider} provider DRPProvider
    * @param {string} route WS route
    */
    constructor(provider, route) {

        // Define handlers
        let openHandler = function (wsConn, req) {
            console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        }

        let closeHandler = function (wsConn, closeCode) {
            console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        }

        let errorHandler = function (wsConn, error) {
            console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
        }

        // Initialize server
        super(provider.expressApp, route, openHandler, closeHandler, errorHandler);

        let thisProviderRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return provider.RegisterBroker(params, wsConn);
        })
    }
}

class DRPProvider_RegistryClient extends drpEndpoint.Client {
    constructor(wsTarget) {
        super(wsTarget);
    }

    async OpenHandler(wsConn, req) {
        console.log("Provider to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

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

module.exports = DRPProvider;