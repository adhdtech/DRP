'use strict';
const DRP_Node = require('drp-mesh').Node;
const JSONDocMgr = require('drp-service-docmgr');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

//var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";
var registryURL = "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(["Provider"]);

let myService = new JSONDocMgr("JSONDocMgr", myNode, "jsondocs\\");

myNode.AddService(myService);
myNode.ConnectToRegistry(registryURL);
