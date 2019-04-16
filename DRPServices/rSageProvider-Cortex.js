'use strict';
var drpService = require('drp-service');
var cortex = require('rsage-cortex');
var fs = require('fs');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var providerID = process.argv[2];
if (!providerID) {
    console.error("No provider ID specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL> <brokerURL>");
    process.exit(0);
}

var registryURL = process.argv[3];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL> <brokerURL>");
    process.exit(0);
}

var brokerURL = process.argv[4];
if (!brokerURL) {
    console.error("No broker URL specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL> <brokerURL>");
    process.exit(0);
}

let myProvider = new drpService.Provider(providerID);
myProvider.proxyBrokerURL = brokerURL;
myProvider.ConnectToRegistry(registryURL);

		let myCortex = new cortex.CortexServer(myProvider, async function () {
			// Post Hive Load
			console.log("Hive load complete, Cortex continuing startup...");
			
			await myProvider.AddService("Cortex", myCortex);
			await myProvider.AddService("Hive", myCortex.Hive);
		});


