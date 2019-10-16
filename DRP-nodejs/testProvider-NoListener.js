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
var registryurl = process.env.REGISTRYURL || "ws://localhost:8080";

let drpWSRoute = "";

// Set config
let myServerConfig = {
    "NodeURL": `${protocol}://${hostname}:${port}${drpWSRoute}`,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || "",
    "WebRoot": process.env.WEBROOT || "webroot"
};

// Create Broker on expressApp
console.log(`Starting DRP Node`);
console.log(`DRP Endpoint: ${myServerConfig.NodeURL}`);

let myNode = new drpService.Node(["Provider"]);

// Declare dummy stream
myNode.AddStream("dummy", "Some dummy data");

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.nodeID}]`);
}, 3000);

// Add a test service
myNode.AddService("Greeter", {
    ClientCmds: {
        sayHi: async function () { return { pathItem: `Hello from ${myNode.nodeID}` }; },
        sayBye: async function () { return { pathItem: `Goodbye from ${myNode.nodeID}` }; },
        showParams: async function (params) { return { pathItem: params }; }
    }
});

myNode.ConnectToRegistry(registryurl, async () => {
    myNode.log("Connected to Registry");
});