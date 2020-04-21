'use strict';
var DRP_Node = require('drp-mesh').Node;
var DRP_Service = require('drp-mesh').Service;
var DRP_WebServer = require('drp-mesh').WebServer;
var os = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

// Create test service class
class TestService extends DRP_Service {
    constructor(serviceName, drpNode) {
        super(serviceName, drpNode);
        this.ClientCmds = {
            sayHi: async function () { return { pathItem: `Hello from ${drpNode.NodeID}` }; },
            sayBye: async function () { return { pathItem: `Goodbye from ${drpNode.NodeID}` }; },
            showParams: async function (params) { return { pathItem: params }; }
        };
    }
}

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
var port = process.env.PORT || 8081;
var hostname = process.env.HOSTNAME || os.hostname();

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

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}

// Add dummy stream
myNode.AddStream("dummy", "Test stream");

// Add a test service
myNode.AddService(new TestService("Greeter", myNode));

// Connect to Registry
myNode.ConnectToRegistry(registryURL);

// Start sending data to dummy topic
setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.NodeID}]`);
}, 3000);
