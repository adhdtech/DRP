'use strict';
var drpRegistry = require('drp-registry');

//var port = process.env.PORT || 8080;

var port = process.argv[2];
if (!port) {
    console.error("No listening port specified!\n\n> node " + process.argv[1] + " <listenPort>");
    process.exit(0);
}

console.log("Loading Registry...");
let myRegistry = new drpRegistry(port);
