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

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(["Broker", "Registry"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

// Declare VDM Authorization function
/*
function myAsyncAuthorizer(username, password, cb) {
    if (username === 'user' && password === 'pass')
        return cb(null, true);
    else
        return cb(null, false);
}
*/

// Set authorizator to null for demo
let myAsyncAuthorizer = null;

// Create VDM Server on node
let myVDMServer = new vdmServer("VDM", myNode, myServerConfig.WebRoot, myAsyncAuthorizer);

myNode.AddService(myVDMServer);
myNode.AddStream("RESTLogs", "REST service logs");
myNode.EnableREST("/Mesh", "Mesh");

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}
