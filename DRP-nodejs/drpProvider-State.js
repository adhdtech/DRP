'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_UMLAttribute = require('drp-mesh').UML.Attribute;
const DRP_UMLFunction = require('drp-mesh').UML.Function;
const DRP_UMLClass = require('drp-mesh').UML.Class;
const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

let serviceName = process.env.SERVICENAME || "State";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;

// Define StateService Class
class StateService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope) {
        super(serviceName, drpNode, "State", null, false, priority, weight, drpNode.Zone, scope, null, ["Safety"], 1);
        let thisService = this;

        // Define global methods
        this.ClientCmds = {
            getMunicipalities: async (cmdObj) => {
                return thisService.Classes.Municipality.cache;
            }
        };

        // Define data classes
        this.AddClass(new DRP_UMLClass("BallotItem", [],
            [
                new DRP_UMLAttribute("ballotItemID", "ballotItemID", null, false, "int", null, "1", "PK,MK"),
                new DRP_UMLAttribute("description", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("votingDate", null, null, false, "string(128)", null, "1", null)
            ],
            []
        ));

        this.AddClass(new DRP_UMLClass("Municipality", [],
            [
                new DRP_UMLAttribute("name", "departmentName", null, false, "string(128)", null, "1", "PK,MK"),
                new DRP_UMLAttribute("description", null, null, false, "string(128)", null, "1", null),
                new DRP_UMLAttribute("address", null, null, false, "string(128)", null, "1", null)
            ],
            []
        ));

        // Add sample data records
        this.Classes['BallotItem'].AddRecord({
            "ballotItemID": 1001,
            "description": "Save the Moose Initiative",
            "votingDate": "2023-07-30"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['BallotItem'].AddRecord({
            "ballotItemID": 1002,
            "description": "Free Taco Tuesdays Initiative",
            "votingDate": "2023-07-30"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Municipality'].AddRecord({
            "name": "Bangor",
            "description": "It's pronounced 'bang-or'",
            "address": "123 Main St, Bangor, ME",
            "website": "https://www.bangormaine.gov"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Municipality'].AddRecord({
            "name": "Augusta",
            "description": "The capital",
            "address": "123 Main St, Augusta, ME",
            "website": "https://www.augustamaine.gov"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        this.Classes['Municipality'].AddRecord({
            "name": "Portland",
            "description": "The most cosmopolitan city in Maine",
            "address": "123 Main St, Portland, ME",
            "website": "https://www.portlandmaine.gov"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        // Mark cache loading as complete
        this.Classes['BallotItem'].loadedCache = true;
        this.Classes['Municipality'].loadedCache = true;

        // Start sending data to Safety
        setInterval(function () {
            thisService.DRPNode.TopicManager.SendToTopic("Safety", `[${thisService.serviceName}] Hurricane is coming, go clear out store shelves`);
        }, 5000);
    }
}

// Set Roles
let roleList = ["Provider"];

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // Add a test service
    myNode.AddService(new StateService(serviceName, myNode, priority, weight, scope));

});

