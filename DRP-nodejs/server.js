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

// Create WebServer
let myWebServer = new drpService.WebServer(myServerConfig);
myWebServer.start();

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Broker", "Registry"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

// Create VDM Server on Node
let myVDMServer = new vdmServer("VDM", myNode, myServerConfig.WebRoot);

myNode.AddService(myVDMServer);
myNode.AddStream("RESTLogs", "REST service logs");
myNode.EnableREST("/broker", "Mesh");

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}
