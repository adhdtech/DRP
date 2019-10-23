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
var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

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

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Broker", "Registry"], myServer.expressApp, drpWSRoute, myServerConfig.NodeURL);
myNode.NodeServer = myServer;
myNode.AddService("VDM", myVDMServer);
myNode.AddStream("RESTLogs", "REST service logs");
myNode.EnableREST("/broker", "Mesh");

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}
