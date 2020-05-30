'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const CacheManager = require('drp-service-cache');
const os = require("os");

let port = process.env.PORT || 8080;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || null;
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

// Service specific variables
let serviceName = process.env.SERVICENAME || "CacheManager";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;
let mongoURL = process.env.MONGOURL || "mongodb://localhost:27017";

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}

let drpWSRoute = "";

// Set config
let myServerConfig = {
    "NodeURL": `${protocol}://${listeningName}:${port}${drpWSRoute}`,
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
let roleList = ["Provider"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, myWebServer, myServerConfig.NodeURL, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {
    let myService = new CacheManager(serviceName, myNode, priority, weight, scope);
    await myService.Connect(mongoURL);
    myNode.log("Adding Cache service...");
    myNode.AddService(myService);
    myNode.log("Added Cache service");
});
