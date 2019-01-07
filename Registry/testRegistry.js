'use strict';
var drpRegistry = require('drp-registry');

var port = process.env.PORT || 8080;

console.log("Loading Registry...");
let myRegistry = new drpRegistry(port);
