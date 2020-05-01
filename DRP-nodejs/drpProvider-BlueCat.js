'use strict';
const DRP_Node = require('drp-mesh').Node;
const BlueCatManager = require('drp-service-bluecat');

const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let serviceName = process.env.SERVICENAME || "BlueCat";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let bcUser = process.env.BCUSER || "";
let bcPass = process.env.BCPASS || "";
let bcHosts = process.env.BCHOSTS.split(/[ ,]+/) || [];

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode, authenticatorService);

myNode.AddService(new BlueCatManager(serviceName, myNode, bcHosts, bcUser, bcPass));

// Connect to Registry directly if specified
if (registryURL) {
    myNode.ConnectToRegistry(registryURL, async () => {
        myNode.log("Connected to Registry");
    });
}
