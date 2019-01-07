'use strict';

var drpRegistry = require('drp-registry');
var drpEndpoint = require('drp-endpoint');

let myRegistry = new drpRegistry();
let myClient = new drpEndpoint.Client();

console.log('Hello world');
