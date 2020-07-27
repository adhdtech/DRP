'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let meshKey = process.env.MESHKEY || null;
let zoneName = process.env.ZONENAME || null;
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

let serviceName = process.env.SERVICENAME || "Webex";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;

// MUST SET process.env['WEBEX_ACCESS_TOKEN'] which is read by 'webex/env'

// Create test service class
class WebexService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope) {
        super(serviceName, drpNode, "WebexService", null, false, priority, weight, drpNode.Zone, scope, null, null, 1);

        // Define global methods
        this.webex = require('webex/env');

        this.ClientCmds = {
            listRooms: async () => {
                let response = await this.webex.rooms.list();
                return response.items;
            }
        };
    }
}

// Set Roles
let roleList = ["Provider"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // Add Webex service
    myNode.AddService(new WebexService(serviceName, myNode, priority, weight, scope));
});

