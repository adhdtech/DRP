'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServer = require('drp-mesh').WebServer;
const vdmServer = require('drp-service-rsage').VDM;
const docManager = require('drp-service-docmgr');
const DRP_AuthRequest = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_AuthResponse = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_Authenticator = require('drp-mesh').Auth.DRP_Authenticator;
const os = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
var port = process.env.PORT || 8080;
let hostname = process.env.HOSTNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

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

// Set Roles
let roleList = ["Broker", "Registry"];

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(roleList, hostID, myWebServer, drpWSRoute, myServerConfig.NodeURL, null, domainName, domainKey, zoneName, debug, testMode);

// Test Authentication Service
let myAuthenticator = new DRP_Authenticator("TestAuthenticator", myNode, 10, 10, "global", 1);
/**
 * Authenticate User
 * @param {DRP_AuthRequest} authRequest Parameters to authentication function
 * @returns {DRP_AuthResponse} Response from authentication function
 */
myAuthenticator.Authenticate = async function (authRequest) {
    // For demo only; accept all requests
    let authResponse = new DRP_AuthResponse();
    authResponse.UserName = authRequest.UserName;
    authResponse.Token = "ABCD1234";
    authResponse.FullName = "Authenticated User";
    authResponse.Groups = ["Users"];
    return authResponse;
};

myNode.AddService(myAuthenticator);

// Create VDM Server on node
let myVDMServer = new vdmServer("VDM", myNode, myServerConfig.WebRoot);

myNode.AddService(myVDMServer);
myNode.AddStream("RESTLogs", "REST service logs");
myNode.AddStream("dummy", "dummy logs");
myNode.EnableREST("/Mesh", "Mesh");

// Add another service for demo
let docService = new docManager("JSONDocMgr", myNode, "jsondocs/");
myNode.AddService(docService);

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.nodeID}]`);
}, 3000);