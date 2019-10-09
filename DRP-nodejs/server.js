'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');
var os = require("os");

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
var port = process.env.PORT || 8080;
var hostname = process.env.HOSTNAME || os.hostname();

/*
	This script will start a demo server:
		* Registry
		* Provider
		* Broker
*/

// Set config
let myServerConfig = {
    "RegistryURL": `${protocol}://${hostname}:${port}/registry`,
    "ProviderURL": `${protocol}://${hostname}:${port}/provider`,
    "BrokerURL": `${protocol}://${hostname}:${port}/broker`,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || "",
    "WebRoot": process.env.WEBROOT || "webroot"
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