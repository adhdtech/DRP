'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_UMLClass = require('drp-mesh').UMLClass;

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

        this.AddClass(new DRP_UMLClass("Person", [],
            [
                {
                    "Name": "personID",
                    "Stereotype": "personID",
                    "Visibility": "",
                    "Derived": false,
                    "Type": "int",
                    "Default": "",
                    "Multiplicity": "1",
                    "Restrictions": "PK,MK"
                },
                {
                    "Name": "firstName",
                    "Stereotype": "",
                    "Visibility": "",
                    "Derived": false,
                    "Type": "string(128)",
                    "Default": "",
                    "Multiplicity": "1",
                    "Restrictions": ""
                },
                {
                    "Name": "lastName",
                    "Stereotype": "",
                    "Visibility": "",
                    "Derived": false,
                    "Type": "string(128)",
                    "Default": "",
                    "Multiplicity": "1",
                    "Restrictions": ""
                },
                {
                    "Name": "departmentName",
                    "Stereotype": "departmentName",
                    "Visibility": "",
                    "Derived": false,
                    "Type": "string(128)",
                    "Default": "",
                    "Multiplicity": "1",
                    "Restrictions": "FK"
                }
            ],
            [
                {
                    "Name": "terminate",
                    "Visibility": "",
                    "Parameters": [
                        "effectiveData"
                    ],
                    "Return": "results"
                }
            ]
        ));

        this.Classes['Person'].AddRecord({
            "personID": 1001,
            "firstName": "John",
            "lastName": "Smith",
            "departmentName": "Accounting"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Person'].AddRecord({
            "personID": 1002,
            "firstName": "Bob",
            "lastName": "Jones",
            "departmentName": "Accounting"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Person'].loadedCache = true;
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