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

    RegisterProvider(declaration, wsConn, token) {
        // Add provider and relay to Brokers
        this.ProviderConnections[declaration.ProviderID] = wsConn;
        this.ProviderDeclarations[declaration.ProviderID] = declaration;
        this.RelayProviderChange("registerProvider", declaration);
        return "OKAY";
    }

    UnregisterProvider(providerID) {
        // Delete provider and relay to Brokers
        delete this.ProviderConnections[providerID];
        delete this.ProviderDeclarations[providerID];
        this.RelayProviderChange("unregisterProvider", providerID);
    }

    RelayProviderChange(cmd, params) {
        // Relay to Brokers
        let brokerIDList = Object.keys(this.BrokerConnections);
        for (let i = 0; i < brokerIDList.length; i++) {
            this.BrokerRouteHandler.SendCmd(this.BrokerConnections[brokerIDList[i]], cmd, parms, false, null);
        }
    }

    RegisterBroker(params, wsConn, token) {
        wsConn.BrokerID = params;
        this.BrokerConnections[wsConn.BrokerID] = wsConn;
        return "OKAY";
    }

    UnregisterBroker(brokerID) {
        delete this.BrokerConnections[brokerID];
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
        this.Registry = registry;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", "Register");
    }

    // Define Handlers
    async OpenHander(wsConn, req) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        //if (wsConn.ProviderID) {
        //    this.Registry.UnregisterProvider(wsConn.ProviderID);
        //}
    }

    async ErrorHandler(wsConn, error) {
        console.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Register(params, wsConn, token) {
        let response = this.Registry.RegisterProvider(params, wsConn, token);
        return response;
    }
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
        //if (wsConn.BrokerID) {
        //    this.Registry.UnregisterBroker(wsConn.BrokerID);
        //}
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