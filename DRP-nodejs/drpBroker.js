'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_WebServerConfig = require('drp-mesh').WebServer.DRP_WebServerConfig;
const vdmServer = require('drp-service-rsage').VDM;
const os = require("os");

require('dotenv').config()

let protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
let drpWSRoute = "";
let port = process.env.PORT || 8082;
let listeningName = process.env.LISTENINGNAME || os.hostname();
let listeningURL = process.env.LISTENINGURL || `${protocol}://${listeningName}:${port}${drpWSRoute}`;
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let registrySet = process.env.REGISTRYSET || null;
let useSwagger = process.env.USESWAGGER || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let serviceName = process.env.SERVICENAME || "VDM";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;
let writeToLogger = process.env.WRITETOLOGGER || false;
let vdmTitle = process.env.VDMTITLE || "DRP Desktop";

// Set config
/** @type {DRP_WebServerConfig} */
let myServerConfig = {
    "ListeningURL": listeningURL,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || "",
    "WebRoot": process.env.WEBROOT || "webroot"
};

let webRoot = process.env.WEBROOT || "webroot";

// Set Roles
let roleList = ["Broker"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, myServerConfig, drpWSRoute);
myNode.Debug = debug;
myNode.RegistrySet = registrySet;
myNode.UseSwagger = useSwagger;
myNode.AuthenticationServiceName = authenticatorService;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {
    // Create VDM Server on node
    let myVDMServer = new vdmServer(serviceName, myNode, webRoot, "vdmapplets", "xrapplets", null, vdmTitle);

    myNode.AddService(myVDMServer);
    myNode.EnableREST(myNode.WebServer, "/Mesh", "Mesh", myNode.IsTrue(writeToLogger));

    if (myNode.UseSwagger) {
        let DRP_SwaggerUI = require('drp-swaggerui')
        new DRP_SwaggerUI(myNode, '/api-doc');
    }

    if (myNode.ListeningURL) {
        myNode.log(`Listening at: ${myNode.ListeningURL}`);
    }
});
