'use strict';
var drpService = require('drp-service');
var cortex = require('rsage-cortex');

var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Provider"]);

myNode.ConnectToRegistry(registryURL, async () => {
    myNode.log("Connected to Registry");

    let myCortex = new cortex.CortexServer(myNode, async function () {
        // Post Hive Load
        console.log("Hive load complete, Cortex continuing startup...");

        await myNode.AddService("Cortex", myCortex);
        await myNode.AddService("Hive", myCortex.Hive);
    });
});
