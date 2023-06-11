'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServerConfig = require('drp-mesh').WebServer.DRP_WebServerConfig;
const os = require("os");

require('dotenv').config()

let port = process.env.PORT || 8080;
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

// Set config
/** @type {DRP_WebServerConfig} */
let myServerConfig = {
    "BindingIP": "127.0.0.1",
    "Port": port
};

// Create Registry
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(["Sidecar"], hostID, domainName, meshKey, zoneName, myServerConfig);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.ConnectToMesh();

myNode.log(`Node in zone: ${myNode.Zone}`);
