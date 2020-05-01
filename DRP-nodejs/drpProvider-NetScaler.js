'use strict';
const DRP_Node = require('drp-mesh').Node;
const NetScalerManager = require('drp-service-netscaler');

const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let serviceName = process.env.SERVICENAME || "NetScaler";
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let fs = require('fs');
let promisify = require('util').promisify;
let readFile = promisify(fs.readFile);
let nsConfigFile = process.env.NSCONFFILE || "nsconf.json";

/*
nsconf.json format:
{
	"NSPairName": {
		"Hosts": [
			"10.1.1.10",
			"10.1.1.11"
		],
		"KeyFileName": "nsroot.priv"
	}
}
 */

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode, authenticatorService);

(async () => {
    let rawConfig = await readFile(nsConfigFile, "utf8");
    let nsConfigSet = JSON.parse(rawConfig);
    //console.dir(nsConfigSet);
    let thisSvc = new NetScalerManager(serviceName, myNode);

    let configSetKeys = Object.keys(nsConfigSet);
    for (let i = 0; i < configSetKeys.length; i++) {
        let nsSetName = configSetKeys[i];
        let nsSetData = nsConfigSet[nsSetName];
        if (debug) myNode.log(`Adding set ${nsSetName}...`);
        await thisSvc.AddSet(nsSetName, nsSetData.Hosts, nsSetData.KeyFileName);
        if (debug) myNode.log(`Added set ${nsSetName}`);
    }
    myNode.AddService(thisSvc);
})();

// Connect to Registry directly if specified
if (registryURL) {
    myNode.ConnectToRegistry(registryURL, async () => {
        myNode.log("Connected to Registry");
    });
}
