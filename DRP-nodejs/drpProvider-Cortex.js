'use strict';
var drpService = require('drp-service');
var cortex = require('rsage-cortex');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Provider"]);

myNode.ConnectToRegistry(registryURL, async () => {
    myNode.log("Connected to Registry");

    let myHive = new cortex.Hive("Hive", myNode);
    let myCortex = new cortex.Cortex("Cortex", myNode, myHive, async function () {
        // Post Hive Load
        myNode.log("Hive load complete, Cortex continuing startup...");

        await myNode.AddService(myHive);
        await myNode.AddService(myCortex);
    });
});
