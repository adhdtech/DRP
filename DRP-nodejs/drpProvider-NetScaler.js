'use strict';
const DRP_Node = require('drp-mesh').Node;
const NetScalerManager = require('drp-service-netscaler');
const os = require("os");

// Node variables
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || null;
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let fs = require('fs');
let promisify = require('util').promisify;
let readFile = promisify(fs.readFile);
let serviceName = process.env.SERVICENAME || "NetScaler";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;
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

// Set Roles
let roleList = ["Provider"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {
    let rawConfig = await readFile(nsConfigFile, "utf8");
    let nsConfigSet = JSON.parse(rawConfig);
    let thisSvc = new NetScalerManager(serviceName, myNode, priority, weight, scope, nsConfigSet);
    myNode.AddService(thisSvc);
});
