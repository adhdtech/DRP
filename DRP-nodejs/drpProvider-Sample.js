'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const os = require("os");


// Create sample service class
class SampleService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope) {
        super(serviceName, drpNode, "SampleService", null, false, priority, weight, drpNode.Zone, scope, null, ["SampleStream"], 1);
        let thisService = this;

        // Define global methods, called via HTTP POST, URL path or direct RPC call
        // GET https://<brokerURL>/Mesh/Services/<serviceName>/ClientCmds/<methodName>/:param1/:param2/...
        // dsh> exec <serviceName>.<methodName>(:param1,:param2,...)
        this.ClientCmds = {

            // Say "hi"
            sayHi: async () => {
                thisService.DRPNode.log("Remote node wants to say hi");
                return `Hello from ${thisService.DRPNode.NodeID}`;
            },

            // Return paramsObj back to user
            showParams: async (paramsObj) => {
                return paramsObj;
            },

            // Get parameters from HTTP POST, URL path or direct DRP RPC call
            parseParams: async (paramsObj) => {
                // Parameter list; order is relevant when parsing values URL path
                let methodParams = ['someParam', 'anotherParam'];
                let params = thisService.GetParams(paramsObj, methodParams);
                let returnVal = `someParam: ${params['someParam']}, anotherParam: ${params['anotherParam']}`;
                return returnVal;
            }
        };

        // Start sending data to a sample stream
        setInterval(function () {
            thisService.DRPNode.TopicManager.SendToTopic("SampleStream", `Test string message from [${thisService.InstanceID}]`);
        }, 3000);

        // Set an arbitrary data structure; can be called via REST or traversed via DRP Shell
        // GET https://<brokerURL>/Mesh/Services/<serviceName>/someData
        // dsh> ls Mesh/Services/<serviceName>/someData
        this.someData = {
            firstLevel: {
                secondLevel: {
                    someString: "a string",
                    someNumber: 123
                }
            }
        }
    }
}

/**
 * Set config options for the DRP Node.  Nodes use either a domain name or static registry URL to connect to a mesh.
 */

// Host ID to advertise to the mesh
let hostID = process.env.HOSTID || os.hostname();

// DNS domain name (used for locating Registries)
let domainName = process.env.DOMAINNAME || "";

// Static key to join mesh
let meshKey = process.env.MESHKEY || "supersecretkey";

// DRP zone
let zoneName = process.env.ZONENAME || "MyZone";

// Set one or more roles for the Node.  Provider nodes can be non-listening, but Registry and Broker nodes must listen for inbound connections.
let roleList = ["Provider"];

// (optional) Force connection to a specific Registry
let registryUrl = process.env.REGISTRYURL || null;

// (optional) Enable debug output
let debug = process.env.DEBUG || false;

// (optional) Test Mode 
let registrySet = process.env.REGISTRYSET || null;

/**
 * Set config options for the service to be advertised to the mesh.
 */

let serviceName = process.env.SERVICENAME || "SampleService";
let priority = process.env.PRIORITY || null; // Default = 10, lowest available priorities will be selected
let weight = process.env.WEIGHT || null; // Default = 10, higher is more likely to be selected in the same priority level
let scope = process.env.SCOPE || null; // (local, zone or global)


// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.RegistrySet = registrySet;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // After the node has connected to the mesh, create a new service instance and advertise it to the mesh
    let sampleServiceInstance = new SampleService(serviceName, myNode, priority, weight, scope);
    myNode.AddService(sampleServiceInstance);

});

