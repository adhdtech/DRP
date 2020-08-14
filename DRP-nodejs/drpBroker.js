'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const vdmServer = require('drp-service-rsage').VDM;
const os = require("os");

let port = process.env.PORT || 8082;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || null;
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let serviceName = process.env.SERVICENAME || "VDM";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;

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
let roleList = ["Broker"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, myWebServer, myServerConfig.NodeURL, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.AuthenticationServiceName = authenticatorService;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {
    // Create VDM Server on node
    let myVDMServer = new vdmServer(serviceName, myNode, myServerConfig.WebRoot, "vdmapplets");

    myNode.AddService(myVDMServer);
    myNode.EnableREST("/Mesh", "Mesh");

    if (myNode.ListeningName) {
        myNode.log(`Listening at: ${myNode.ListeningName}`);
    }
});
