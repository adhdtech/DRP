'use strict';
const DRP_Node = require('drp-mesh').Node;
const JSONDocMgr = require('drp-service-docmgr');
const os = require("os");

var port = process.env.PORT || 8080;
let hostname = process.env.HOSTNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode);

let myService = new JSONDocMgr("JSONDocMgr", myNode, "jsondocs/");

myNode.AddService(myService);
myNode.ConnectToRegistry(registryURL);
