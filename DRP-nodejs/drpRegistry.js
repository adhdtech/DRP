'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const os = require("os");

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let port = process.env.PORT || 8080;
let hostname = process.env.HOSTNAME || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || null;

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
let myNode = new DRP_Node(["Registry"], myWebServer, drpWSRoute, myServerConfig.NodeURL, null, domainName, domainKey, zoneName);

myNode.log(`Listening at: ${myNode.nodeURL}`);
myNode.log(`Node in zone: ${myNode.ZoneName}`);

// We should offer two modes; single registry and clustered.  Clustered will require DNS SRV records.
myNode.log(`TODO - Query DNS and connect to other registries`);
if (domainName) {
    // Connect to registries in other zones
}