'use strict';
const DRP_Node = require('drp-mesh').Node;
const rSageHive = require('drp-service-rsage').Hive;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(["Provider"]);

let myHive = null;

myNode.ConnectToRegistry(registryURL, async () => {
    myNode.log("Connected to Registry");

    if (!myHive) {
        myHive = new rSageHive("Hive", myNode);
        myHive.Start(async () => {
            myNode.log("Hive load complete, adding service...");

            await myNode.AddService(myHive);
        });
    }
});
