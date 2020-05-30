'use strict';
let DRP_Node = require('drp-mesh').Node;
let DRP_Service = require('drp-mesh').Service;
let DRP_WebServer = require('drp-mesh').WebServer;
let os = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

let registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

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

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let port = process.env.PORT || 8081;
let listeningName = process.env.LISTENINGNAME || os.hostname();

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

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(["Provider"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

if (myNode.ListeningName) {
    myNode.log(`Listening at: ${myNode.ListeningName}`);
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
