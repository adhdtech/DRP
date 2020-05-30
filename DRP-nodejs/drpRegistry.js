'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const os = require("os");

let port = process.env.PORT || 8080;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}

let drpWSRoute = "";

// Set config
let myServerConfig = {
    "NodeURL": `${protocol}://${listeningName}:${port}${drpWSRoute}`,
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

// Create Registry
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(["Registry"], hostID, domainName, meshKey, zoneName, myWebServer, myServerConfig.NodeURL, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.ConnectToMesh();

myNode.log(`Listening at: ${myNode.ListeningName}`);
myNode.log(`Node in zone: ${myNode.Zone}`);
