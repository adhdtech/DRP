'use strict';
var drpService = require('drp-service');

// Set config
let myServerConfig = {
    "Name": "testBroker1",
    "RegistryURL": "ws://localhost:8080/registry",
    "BrokerURL": "ws://localhost:8082/broker",
    "Port": "8082",
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"
}

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Load Broker
console.log(`Loading Broker [${myServerConfig["Name"]}]`);
let myBroker = new drpService.Broker(myServerConfig["Name"], myServer.expressApp, myServerConfig["RegistryURL"], myServerConfig["BrokerURL"]);
