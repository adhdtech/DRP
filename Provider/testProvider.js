'use strict';
var drpProvider = require('drp-provider');

var port = process.env.PORT || 1337;

console.log("Loading Provider...");
let myProvider = new drpProvider(port, "http://localhost:8080/provider");
