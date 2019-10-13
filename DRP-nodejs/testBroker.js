'use strict';
var drpService = require('drp-service');
var vdmServer = require('rsage-vdm');

var registryURL = process.argv[2];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <registryURL>");
    process.exit(0);
}
/*
var brokerURL = process.argv[3];
if (!brokerURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <registryURL> <brokerURL>");
    process.exit(0);
}
*/

//var port = process.env.PORT || 8080;
var port = 8080;
let protocol = "ws";
let svcFQDN = "localhost";
let drpWSRoute = ""; //"/drpnode";

// Set config
let myServerConfig = {
    "Port": port,
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw",
    "WebRoot": "webroot"
};

if (myServerConfig.SSLEnabled) protocol = "wss";

let nodeURL = `${protocol}://${svcFQDN}:${myServerConfig.Port}${drpWSRoute}`;

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Create VDM Server on expressApp
let myVDMServer = new vdmServer("VDM", myServer.expressApp, myServerConfig["WebRoot"]);

// Create Broker on expressApp
/*
let myBroker = new drpService.Broker(myServer.expressApp, brokerURL, () => {

    // Add DRP commands from Broker to VDM
    myBroker.AddService("VDM", myVDMServer);
});

myBroker.ConnectToRegistry(registryURL);
*/

let myBroker = new drpService.Node(["Broker"], myServer.expressApp, drpWSRoute, nodeURL);
myBroker.AddService("VDM", myVDMServer);

myBroker.ConnectToRegistry(registryURL);