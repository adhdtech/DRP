'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServerConfig = require('drp-mesh').WebServer.DRP_WebServerConfig;
const os = require("os");

require('dotenv').config()

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let drpWSRoute = "";
let port = process.env.PORT || 8080;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let listeningURL = process.env.LISTENINGURL || `${protocol}://${listeningName}:${port}${drpWSRoute}`;
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let rejectUnreachable = process.env.REJECTUNREACHABLE || false;

// Set config
/** @type {DRP_WebServerConfig} */
let myServerConfig = {
    "ListeningURL": listeningURL,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || ""
};

// Create Registry
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(["Registry","Relay"], hostID, domainName, meshKey, zoneName, myServerConfig, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RejectUnreachable = rejectUnreachable;
myNode.ConnectToMesh();

myNode.log(`Listening at: ${myNode.ListeningURL}`);
myNode.log(`Node in zone: ${myNode.Zone}`);
