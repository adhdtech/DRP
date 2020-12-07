'use strict';
let DRP_Node = require('drp-mesh').Node;
let DRP_Service = require('drp-mesh').Service;
let DRP_WebServer = require('drp-mesh').WebServer;
let os = require("os");

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let port = process.env.PORT || 8080;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

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

// Set config
let myServerConfig = {
    "ListeningURL": `${protocol}://${listeningName}:${port}${drpWSRoute}`,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || ""
};

let drpWSRoute = "";

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, myWebServerConfig, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // Add a test service
    myNode.AddService(new TestService("TestService", myNode));

    if (myNode.ListeningName) {
        myNode.log(`Listening at: ${myNode.ListeningName}`);
    }
});

// Start sending data to dummy topic
setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.NodeID}]`);
}, 3000);
