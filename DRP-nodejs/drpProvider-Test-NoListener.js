'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_UMLAttribute = require('drp-mesh').UML.Attribute;
const DRP_UMLFunction = require('drp-mesh').UML.Function;
const DRP_UMLClass = require('drp-mesh').UML.Class;

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
                new DRP_UMLAttribute("personID", "personID", null, false, "int", null, "1", "PK,MK"),
                new DRP_UMLAttribute("firstName", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("lastName", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("departmentName", "departmentName", null, false, "string(128)", null, "1", "FK")
            ],
            [
                new DRP_UMLFunction("terminate", null, ["effectiveDate"], "results")
            ]
        ));

        this.AddClass(new DRP_UMLClass("Department", [],
            [
                new DRP_UMLAttribute("name", "departmentName", null, false, "int", null, "1", "PK,MK"),
                new DRP_UMLAttribute("description", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("address", null, null, false, "string(128)", null, "1", null)
            ],
            []
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

        this.Classes['Department'].AddRecord({
            "name": "Accounting",
            "description": "Number crunchers",
            "address": "123 Pine St, Nowhere, AR"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Person'].loadedCache = true;
        this.Classes['Department'].loadedCache = true;
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