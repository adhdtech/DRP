'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;

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
let myWebServer = new DRP_WebServer(myServerConfig);
myWebServer.start();

// Create Broker on expressApp
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(["Registry"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}
