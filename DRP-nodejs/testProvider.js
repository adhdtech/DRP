'use strict';
var drpService = require('drp-service');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var registryURL = process.argv[2];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <registryURL>");
    process.exit(0);
}

var port = 8081;

// Set config
let myServerConfig = {
    "ProviderURL": "ws://localhost:8081/provider",
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

// Load Provider
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

// Connect to Registry
myProvider.ConnectToRegistry(registryURL);
