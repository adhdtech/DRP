'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');

var port = process.env.PORT || 8080;

// Set config
let myServerConfig = {
    "RegistryName": "testRegistry1",
    "ProviderName": "testProvider1",
    "BrokerName": "testBrokerVDM1",
    "RegistryURL": `ws://localhost:${port}/registry`,
    "ProviderURL": `ws://localhost:${port}/provider`,
    "BrokerURL": `ws://localhost:${port}/broker`,
    "Port": port,
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw",
    "WebRoot": "webroot"
}

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();



// Create Registry
console.log(`Loading Registry [${myServerConfig["RegistryName"]}]`);
let myRegistry = new drpService.Registry(myServerConfig["RegistryName"], myServer.expressApp, );



// Create Provider
console.log(`Loading Provider [${myServerConfig["ProviderName"]}]`);
let myProvider = new drpService.Provider(myServerConfig["ProviderName"], myServer.expressApp, myServerConfig["ProviderURL"]);

// Declare dummy stream
myProvider.ProviderDeclaration.Streams = {
    "dummy": { Class: "FakeData" }
}
setInterval(function () {
    let timeStamp = new Date().getTime();
    myProvider.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + myServerConfig["ProviderName"] + "]");
}, 3000);

// Add a test service
myProvider.AddService("TestService", {
    ClientCmds : {
        sayHi: async function () { return { pathItem: "Hello!" } },
        sayBye: async function () { return { pathItem: "Goodbye..." } }
    }
});

// Connect Provider to Registry
myProvider.ConnectToRegistry(myServerConfig["RegistryURL"]);



// Load Broker

// Create VDM Server on expressApp
let myVDMServer = new vdmServer(myServer.expressApp, myServerConfig["WebRoot"]);

// Create Broker on expressApp
let myBroker = new drpService.Broker(myServerConfig["BrokerName"], myServer.expressApp, myServerConfig["RegistryURL"], myServerConfig["BrokerURL"], null);

// Add DRP commands from Broker to VDM
myVDMServer.AddServerApp({
    "Name": "DRPAccess",
    "ClientCmds": myBroker.ConsumerRouteHandler.EndpointCmds
});