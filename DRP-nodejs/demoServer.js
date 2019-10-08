'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');
var os = require("os");

//var port = process.env.PORT || 8080;
var port = 8080;

var hostname = os.hostname();

/*
	This script will start a demo server:
		* Registry
		* Provider
		* Broker
*/

// Set config
let myServerConfig = {
    "RegistryURL": `ws://${hostname}:${port}/registry`,
    "ProviderURL": `ws://${hostname}:${port}/provider`,
    "BrokerURL": `ws://${hostname}:${port}/broker`,
    "Port": port,
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw",
    "WebRoot": "webroot"
};

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();



// Create Registry
console.log(`Loading Registry`);
let myRegistry = new drpService.Registry(myServer.expressApp);


// Create Provider
console.log(`Loading Provider`);
let myProvider = new drpService.Provider(myServer.expressApp, myServerConfig["ProviderURL"]);

// Declare dummy stream
myProvider.NodeDeclaration.Streams = {
    "dummy": { Class: "FakeData" }
};
setInterval(function () {
    let timeStamp = new Date().getTime();
    myProvider.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + myProvider.nodeID + "]");
}, 3000);

// Add a test service
myProvider.AddService("Greeter", {
    ClientCmds: {
        sayHi: async function () { return { pathItem: "Hello!" }; },
        sayBye: async function () { return { pathItem: "Goodbye..." }; },
        showParams: async function (params) { return { pathItem: params }; }
    }
});

// Connect Provider to Registry
myProvider.ConnectToRegistry(myServerConfig["RegistryURL"]);



// Load Broker

// Create VDM Server on expressApp
let myVDMServer = new vdmServer("VDM", myServer.expressApp, myServerConfig["WebRoot"]);

// Create Broker on expressApp
let myBroker = new drpService.Broker(myServer.expressApp, myServerConfig["BrokerURL"], () => {

    // Add DRP commands from Broker to VDM
    myBroker.AddService("VDM", myVDMServer);
});

// Connect Broker to Registry
myBroker.ConnectToRegistry(myServerConfig["RegistryURL"]);