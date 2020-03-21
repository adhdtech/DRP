'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const vdmServer = require('drp-service-rsage').VDM;
const os = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let port = process.env.PORT || 8082;
let hostname = process.env.HOSTNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;

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

// Set Roles
let roleList = ["Broker"];

// If we haven't specified a Registry, make this one
if (!registryURL) roleList.push("Registry");

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(roleList, hostID, myWebServer, drpWSRoute, myServerConfig.NodeURL, null, domainName, domainKey, zoneName, debug);

// Create VDM Server on node
let myVDMServer = new vdmServer("VDM", myNode, myServerConfig.WebRoot);

myNode.AddService(myVDMServer);
myNode.AddStream("RESTLogs", "REST service logs");
myNode.EnableREST("/Mesh", "Mesh");

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}

if (registryURL) {
    myNode.ConnectToRegistry(registryURL);
}