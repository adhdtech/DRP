'use strict';
var drpService = require('drp-service');

// Set config
let myServerConfig = {
    "Name": "testRegistry1",
    "Port": "8080",
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"
}

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Load Broker
console.log(`Loading Registry [${myServerConfig["Name"]}]`);
let myRegistry = new drpService.Registry(myServerConfig["Name"], myServer.expressApp);