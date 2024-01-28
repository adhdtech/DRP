'use strict';
const DRP_Consumer = require('drp-mesh').Consumer;

let brokerURL = process.env.BROKERURL || "ws://localhost:8080";
let user = process.env.DRPUSER || null;
let pass = process.env.DRPPASS || null;

console.log(`Starting Test Consumer, connecting to Broker Node @ ${brokerURL}`);
let myConsumer = new DRP_Consumer(brokerURL, user, pass, null, async function () {
    let myClient = myConsumer.BrokerClient;
    // Connection established - let's do stuff
    let response = null;

    // Execute a pathCmd
    response = await myClient.SendCmd("DRP", "pathCmd", { __verb: "GetChildItems", __pathList: ["Mesh", "Services"] }, true);
    let serviceList = Object.keys(response);
    console.log(`Found [${serviceList.length}] DRP services`)

    // Get data for a class
    let className = "BUS.Location";
    response = await myClient.SendCmd("DRP", "getClassRecords", { className: className }, true);
    let serviceNames = Object.keys(response);
    let totalRecords = 0;
    for (let i = 0; i < serviceNames.length; i++) {
        totalRecords = + Object.keys(response[serviceNames[i]]).length;
    }
    console.log(`Found [${totalRecords}] records from [${serviceNames.length}] services for class ${className}`);

    // Subscribe to a stream
    let streamName = "TopologyTracker";
    myClient.WatchStream(streamName, "local", (payload) => {
        console.log(`[${streamName}] -> ${JSON.stringify(payload, null, 2)}`);
    });
});