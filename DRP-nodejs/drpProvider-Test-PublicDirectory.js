'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_UMLAttribute = require('drp-mesh').UML.Attribute;
const DRP_UMLFunction = require('drp-mesh').UML.Function;
const DRP_UMLClass = require('drp-mesh').UML.Class;
const os = require("os");

var port = process.env.PORT || 8080;
let hostname = process.env.HOSTNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

// Create test service class
class DirectoryService extends DRP_Service {
    constructor(serviceName, drpNode) {
        super(serviceName, drpNode, "TestService", `${drpNode.nodeID}-${serviceName}`, false, 10, 10, drpNode.Zone, "global", null, null, 1);
        this.ClientCmds = {
            sayHi: async function () { return { pathItem: `Hello from ${drpNode.nodeID}` }; },
            sayBye: async function () { return { pathItem: `Goodbye from ${drpNode.nodeID}` }; },
            showParams: async function (params) { return { pathItem: params }; }
        };

        this.AddClass(new DRP_UMLClass("HealthProvider", [],
            [
                new DRP_UMLAttribute("providerID", "providerID", null, false, "int", null, "1", "PK,MK"),
                new DRP_UMLAttribute("providerName", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("streetAddress", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("city", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("state", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("zip", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("geoCoords", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("capabilities", null, null, false, "string(128)", null, "1", null)
            ],
            [
            ]
        ));

        this.Classes['HealthProvider'].AddRecord({
            "providerID": 1001,
            "providerName": "Methodist Healthcare",
            "streetAddress": "123 Pine Ln.",
            "city": "Louisville",
            "state": "KY",
            "zip": "49001",
            "geoCoords": "29.0093,18.0991",
            "capabilities": "Emergency Medical (12/24 bed), Mental Health (3/12 room)"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['HealthProvider'].AddRecord({
            "providerID": 1002,
            "providerName": "Baptist Healthcare",
            "streetAddress": "234 Pine Ln.",
            "city": "Louisville",
            "state": "KY",
            "zip": "49002",
            "geoCoords": "29.0093,18.1991",
            "capabilities": "Emergency Medical (16/18 bed)",
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['HealthProvider'].loadedCache = true;
    }
}

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode);

// Declare dummy stream
myNode.AddStream("dummy", "Test stream");

// Add a test service
myNode.AddService(new DirectoryService("DirectoryService", myNode));

// Connect to Registry manually if no domainName was specified
if (!domainName && registryURL) {
    myNode.ConnectToRegistry(registryURL, async () => {
        myNode.log("Connected to Registry");
    });
}

setInterval(function () {
    let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", `${timeStamp} Dummy message from node [${myNode.nodeID}]`);
}, 3000);