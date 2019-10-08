'use strict';
var drpService = require('drp-service');

//var port = process.env.PORT || 8080;
var port = 8082;

// Set config
let myServerConfig = {
    "Port": port,
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"
};

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Create Registry
console.log(`Loading Registry`);
let myRegistry = new drpService.Registry(myServer.expressApp);