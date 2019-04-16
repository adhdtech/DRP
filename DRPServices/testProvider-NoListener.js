'use strict';
var drpService = require('drp-service');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var providerID = process.argv[2];
if (!providerID) {
    console.error("No provider ID specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL>");
    process.exit(0);
}

var registryURL = process.argv[3];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL>");
    process.exit(0);
}

var proxyURL = process.argv[4];

//let proxy = null;

// Load Provider
console.log(`Loading Provider [${providerID}]`);
let myProvider = new drpService.Provider(providerID);

// Add a test service
myProvider.AddService("Greeter", {
    ClientCmds : {
        sayHi: async function () { return { pathItem: "Hello!" }; },
        sayBye: async function () { return { pathItem: "Goodbye..." }; },
        showParams: async function (params) { return { pathItem: params} }
    }
});

// Connect to Registry
myProvider.ConnectToRegistry(registryURL, proxyURL);



