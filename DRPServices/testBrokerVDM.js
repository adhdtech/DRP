'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');
var os = require("os");

var hostname = os.hostname();

// Set config
let myServerConfig = {
    "BrokerName": "testBrokerVDM1",
    "RegistryURL": `ws://${hostname}:8080/registry`,
    "BrokerURL": `ws://${hostname}:8082/broker`,
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
    let myBroker = new drpService.Broker(serverConfig["BrokerName"], myServer.expressApp, serverConfig["RegistryURL"], serverConfig["BrokerURL"], () => {

        // Add DRP commands from Broker to VDM
        myBroker.AddService("VDM", myVDMServer);
    });
}

startBrokerVDMServer(myServerConfig);