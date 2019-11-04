'use strict';
var drpService = require('drp-service');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryurl = process.env.REGISTRYURL || "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Provider"]);

// Declare dummy stream
myNode.AddStream("dummy", "Some dummy data");

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.nodeID}]`);
}, 3000);

// Add a test service
myNode.AddService({
    ServiceName: "Greeter",
    ClientCmds: {
        sayHi: async function () { return { pathItem: `Hello from ${myNode.nodeID}` }; },
        sayBye: async function () { return { pathItem: `Goodbye from ${myNode.nodeID}` }; },
        showParams: async function (params) { return { pathItem: params }; }
    }
});

myNode.ConnectToRegistry(registryurl, async () => {
    myNode.log("Connected to Registry");
});