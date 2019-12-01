'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const CacheManager = require('drp-service-cache');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryurl = process.env.REGISTRYURL || "ws://localhost:8080";
let mongourl = process.env.MONGOURL || "mongodb://localhost:27017";

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
var port = process.env.PORT || 8083;
var hostname = process.env.HOSTNAME || require('os').hostname();

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
let myNode = new DRP_Node(["Provider"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

// Connect to Registry
myNode.ConnectToRegistry(registryurl, async () => {
    let myService = new CacheManager("CacheManager", myNode);
    await myService.Connect(mongourl);
    myNode.log("Adding Cache service...");
    myNode.AddService(myService);
    myNode.MongoConn = myService.mongoConn;
    myNode.log("Added Cache service");
});
