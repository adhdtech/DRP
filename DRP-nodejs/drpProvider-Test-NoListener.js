'use strict';
const DRP_Node = require('drp-mesh').Node;
const TestService = require('drp-service-test');
const os = require("os");

require('dotenv').config()

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
//let meshKey = process.env.MESHKEY || "supersecretkey";
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let debug = process.env.DEBUG || false;
let registrySet = process.env.REGISTRYSET || null;

let serviceName = process.env.SERVICENAME || "TestService";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;

let mtlsCertFile = process.env.SSL_CRTFILE || null;
let mtlsKeyFile = process.env.SSL_KEYFILE || null;

// Set Roles
let roleList = ["Provider"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.RegistrySet = registrySet;
myNode.mTLS = {
    certFile: mtlsCertFile,
    keyFile: mtlsKeyFile
}
myNode.ConnectToMesh(async () => {

    // Add a test service
    myNode.AddService(new TestService(serviceName, myNode, priority, weight, scope));

});

