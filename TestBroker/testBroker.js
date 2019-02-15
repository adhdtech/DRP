'use strict';
var drpBroker = require('drp-broker');

//var port = process.env.PORT || 1337;

var port = process.argv[2];
if (!port) {
    console.error("No listening port specified!\n\n> node " + process.argv[1] + " <listenPort> <registryBrokerURL>");
    process.exit(0);
}

var registryBrokerURL = process.argv[3];
if (!registryBrokerURL) {
    console.error("No registry broker URL specified!\n\n> node " + process.argv[1] + "<listenPort> <registryBrokerURL>");
    process.exit(0);
}

console.log('Loading Broker...');
let myBroker = new drpBroker(port, registryBrokerURL);
