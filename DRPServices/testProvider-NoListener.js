'use strict';
var drpService = require('drp-service');
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

var proxyURL = process.argv[4];

//let proxy = null;

// Load Provider
console.log(`Loading Provider [${providerName}]`);
let myProvider = new drpService.Provider(providerName);

// Add a test service
myProvider.AddService("Greeter", {
    ClientCmds : {
        sayHi: async function () { return { pathItem: "Hello!" }; },
        sayBye: async function () { return { pathItem: "Goodbye..." }; },
        showParams: async function (params) { return { pathItem: params }; }
    }
});

// Connect to Registry
myProvider.ConnectToRegistry(registryURL, proxyURL);



