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

class DRPRegistry {
    constructor(port) {

        let thisDRPRegistry = this;

        this.expressApp = null;

        this.StartWebServer(port);

        this.ProviderDeclarations = {};

        this.ProviderConnections = {};
        this.BrokerConnections = {};

        this.ProviderRouteHandler = new DRPRegistry_ProviderRoute(this, '/provider');
        this.BrokerRouteHandler = new DRPRegistry_BrokerRoute(this, '/broker');
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
            res.end('This is the Registry\n');
        });

        // Start listening for HTTP & WS traffic
        expressApp.listen(port, function () {
            console.log('Express server listening on port ' + port + ' in ' + expressApp.get('env') + ' mode');
        });

        this.expressApp = expressApp;
    }

    RegisterProvider(params, wsConn, token) {
        this.ProviderDeclarations[params.ProviderID] = params;
        return "OKAY";
    }

    RegisterBroker(params, wsConn, token) {
        return "OKAY";
    }
}

class DRPRegistry_ProviderRoute extends drpEndpoint.Server {
    /**
    * @param {DRPRegistry} registry DRPRegistry
    * @param {string} route WS route
    */
    constructor(registry, route) {

        // Initialize server
        super(registry.expressApp, route);

        let thisRegistryRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return registry.RegisterProvider(params, wsConn, token);
        })
    }

    // Define Handlers
    async OpenHander(wsConn, req) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
}

class DRPRegistry_BrokerRoute extends drpEndpoint.Server {
    /**
    * @param {DRPRegistry} registry DRPRegistry
    * @param {string} route WS route
    */
    constructor(registry, route) {

        // Initialize server
        super(registry.expressApp, route);

        let thisRegistryRoute = this;
        this.Registry = registry;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", "Register");
        this.RegisterCmd("getDeclarations", "GetDeclarations");
    }

    // Define Handlers
    async OpenHander(wsConn, req) {
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
        return this.Registry.RegisterBroker(params, wsConn, token);
    }

    async GetDeclarations() {
        return this.Registry.ProviderDeclarations;
    }
}

module.exports = DRPRegistry;