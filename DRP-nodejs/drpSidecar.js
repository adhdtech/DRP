'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_SidecarService = require('drp-service-sidecar');
const os = require("os");

require('dotenv').config()

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

let sidecarIP = process.env.SIDECARIP || "127.0.0.1";
let sidecarPort = process.env.SIDECARPORT || "8080";
let sidecarBaseURL = process.env.SIDECARBASEURL || "http://127.0.0.1:8081/";

// Create Registry
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(["Sidecar"], hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.ConnectToMesh(async () => {
    // Create Sidecar Service
    let mySidecar = new DRP_SidecarService("TestSidecar", myNode, 10, 10, "global", {
        "BindingIP": sidecarIP,
        "Port": sidecarPort,
        "TargetBaseURL": sidecarBaseURL
    });
    myNode.AddService(mySidecar);
});

myNode.log(`Node in zone: ${myNode.Zone}`);
