'use strict';
var drpBroker = require('drp-broker');

var port = process.env.PORT || 1337;

console.log('Loading Broker...');
let myBroker = new drpBroker(port, "http://localhost:8080/broker");
