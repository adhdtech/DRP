'use strict';
var drpService = require('drp-service');
var cortex = require('rsage-cortex');
var fs = require('fs');
var os = require('os');
var process = require('process');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryURL = process.argv[2];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <registryURL> <brokerURL>");
    process.exit(0);
}

var brokerURL = process.argv[3];
if (!brokerURL) {
    console.error("No broker URL specified!\n\n> node " + process.argv[1] + " <registryURL> <brokerURL>");
    process.exit(0);
}

let hostname = os.hostname();
let pid = process.pid;
let providerName = `${hostname}-${pid}`;

let myProvider = new drpService.Provider(providerName);
myProvider.proxyBrokerURL = brokerURL;
myProvider.ConnectToRegistry(registryURL);

let myCortex = new cortex.CortexServer(myProvider, async function () {
    // Post Hive Load
    console.log("Hive load complete, Cortex continuing startup...");

    await myProvider.AddService("Cortex", myCortex);
    await myProvider.AddService("Hive", myCortex.Hive);
});


