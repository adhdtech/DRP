'use strict';
var DRP_Node = require('drp-mesh').Node;
var DRP_Service = require('drp-mesh').Service;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryurl = process.env.REGISTRYURL || "ws://localhost:8080";

// Create test service class
class TestService extends DRP_Service {
    constructor(serviceName, drpNode) {
        super(serviceName, drpNode);
        this.ClientCmds = {
            sayHi: async function () { return { pathItem: `Hello from ${drpNode.nodeID}` }; },
            sayBye: async function () { return { pathItem: `Goodbye from ${drpNode.nodeID}` }; },
            showParams: async function (params) { return { pathItem: params }; }
        };
    }
}

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new DRP_Node(["Provider"]);

// Declare dummy stream
myNode.AddStream("dummy", "Test stream");

// Add a test service
myNode.AddService(new TestService("Greeter", myNode));

// Connect to Registry
myNode.ConnectToRegistry(registryurl, async () => {
    myNode.log("Connected to Registry");
});

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.nodeID}]`);
}, 3000);