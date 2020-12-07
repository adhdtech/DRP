'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServerConfig = require('drp-mesh').WebServer.DRP_WebServerConfig;
const vdmServer = require('drp-service-rsage').VDM;
const DocMgr = require('drp-service-docmgr');
const DRP_AuthRequest = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_AuthResponse = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_Authenticator = require('drp-mesh').Auth.DRP_Authenticator;
const DRP_Logger = require('drp-service-logger');
const os = require("os");

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let port = process.env.PORT || 8080;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

let drpWSRoute = "";

// Set config
/** @type {DRP_WebServerConfig} */
let myWebServerConfig = {
    "ListeningURL": `${protocol}://${listeningName}:${port}${drpWSRoute}`,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || ""
};

let webRoot = process.env.WEBROOT || "webroot";

// Set Roles
let roleList = ["Broker", "Registry"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, myWebServerConfig, drpWSRoute);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.ConnectToMesh(async () => {
    // Test Authentication Service
    let myAuthenticator = new DRP_Authenticator("TestAuthenticator", myNode, 10, 10, "global", 1);
    /**
     * Authenticate User
     * @param {DRP_AuthRequest} authRequest Parameters to authentication function
     * @returns {DRP_AuthResponse} Response from authentication function
     */
    myAuthenticator.Authenticate = async function (authRequest) {
        let thisService = this;
        let authResponse = null;
        console.dir(authRequest);
        if (authRequest.UserName && authRequest.Password) {
            // For demo purposes; accept any user/password or token
            authResponse = new DRP_AuthResponse(thisService.GetToken(), authRequest.UserName, "Some User", ["Users"], null, thisService.serviceName, thisService.drpNode.getTimestamp());
        }
        myNode.TopicManager.SendToTopic("AuthLogs", authResponse);
        myNode.ServiceCmd("Logger", "writeLog", { serviceName: thisService.serviceName, logData: authResponse });
        return authResponse;
    };

    myNode.AddService(myAuthenticator);

    // Add logger
    //let logger = new DRP_Logger("Logger", myNode, 10, 10, "global", "localhost", null, null);
    //myNode.AddService(logger);

    // Create VDM Server on node
    let myVDMServer = new vdmServer("VDM", myNode, webRoot, "vdmapplets");

    myNode.AddService(myVDMServer);
    myNode.EnableREST("/Mesh", "Mesh");

    // Add another service for demo
    let myService = new DocMgr("DocMgr", myNode, 10, 10, "global", "jsondocs", null, null, null);
    myNode.AddService(myService);

    if (myNode.ListeningName) {
        myNode.log(`Listening at: ${myNode.ListeningName}`);
    }

    setInterval(function () {
        let timeStamp = new Date().getTime();
        myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.NodeID}]`);
    }, 3000);
});
