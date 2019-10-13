'use strict';
var drpService = require('drp-service');

//var port = process.env.PORT || 8080;
var port = 8082;
let protocol = "ws";
let svcFQDN = "localhost";
let drpWSRoute = ""; //"/drpnode";

// Set config
let myServerConfig = {
    "Port": port,
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"
};

if (myServerConfig.SSLEnabled) protocol = "wss";

let nodeURL = `${protocol}://${svcFQDN}:${myServerConfig.Port}${drpWSRoute}`;

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Create Registry
console.log(`Loading Registry`);
console.log(`DRP Endpoint: ${nodeURL}`);
//let myRegistry = new drpService.Registry(myServer.expressApp);

let myRegistry = new drpService.Node(["Registry"], myServer.expressApp, drpWSRoute, nodeURL);