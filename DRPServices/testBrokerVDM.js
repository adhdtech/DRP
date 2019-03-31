'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');

// Set config
let myServerConfig = {
    "BrokerName": "testBrokerVDM1",
    "RegistryURL": "ws://localhost:8080/registry",
    "BrokerURL": "ws://localhost:8082/broker",
    "Port": "8082",
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw",
	"WebRoot": "webroot"
}

async function startBrokerVDMServer(serverConfig) {

	// Create expressApp
	let myServer = new drpService.Server(serverConfig);
	// Start web server
	await myServer.start();
	console.log(`Web server started on port[${serverConfig.Port}]`);
	
	// Create VDM Server on expressApp
	let myVDMServer = new vdmServer(myServer.expressApp, myServerConfig["WebRoot"]);
	
	// Create Broker on expressApp
	let myBroker = new drpService.Broker(serverConfig["BrokerName"], myServer.expressApp, serverConfig["RegistryURL"], serverConfig["BrokerURL"], null);
	
	// Add DRP commands from Broker to VDM
    myVDMServer.AddServerApp({
        "Name": "DRPAccess",
        "ClientCmds": myBroker.ConsumerRouteHandler.EndpointCmds
    });
}

startBrokerVDMServer(myServerConfig);