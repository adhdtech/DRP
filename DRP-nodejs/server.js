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

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Create VDM Server on expressApp
let myVDMServer = new vdmServer("VDM", myServer.expressApp, myServerConfig.WebRoot);

// Create Broker on expressApp
console.log(`Starting DRP Node`);
console.log(`DRP Endpoint: ${myServerConfig.NodeURL}`);

let myNode = new drpService.Node(["Broker", "Registry"], myServer.expressApp, drpWSRoute, myServerConfig.NodeURL);
myNode.AddService("VDM", myVDMServer);

// Declare dummy stream
myNode.AddStream("dummy", "Some dummy data");

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + myNode.nodeID + "]");
}, 3000);

// Add a test service
myNode.AddService("Greeter", {
    ClientCmds: {
        sayHi: async function () { return { pathItem: "Hello!" }; },
        sayBye: async function () { return { pathItem: "Goodbye..." }; },
        showParams: async function (params) { return { pathItem: params }; }
    }
});
