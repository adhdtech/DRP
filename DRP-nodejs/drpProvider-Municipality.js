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

let serviceName = process.env.SERVICENAME || "Municipality";
let priority = process.env.PRIORITY || null;
let weight = process.env.WEIGHT || null;
let scope = process.env.SCOPE || null;

// Define MunicipalityService Class
class MunicipalityService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope) {
        super(serviceName, drpNode, "Municipality", null, false, priority, weight, drpNode.Zone, scope, null, ["Safety", "Weather", "Traffic"], 1);
        let thisService = this;

        // Define global methods
        this.ClientCmds = {
            payPropertyTaxes: async (paramsObj) => {
                let params = thisService.GetParams(paramsObj, ['accountId', 'amountToPay']);
                if (!params.acctID || !params.amountToPay) {
                    throw new DRP_CmdError(`Must provide [accountId, amountToPay]`, DRP_ErrorCode.BADREQUEST, "resolve");
                }
                return `Paid $${params.amountToPay} on account ${params.accountId}`;
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

        this.AddClass(new DRP_UMLClass("Department", [],
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

        this.Classes['Department'].AddRecord({
            "name": "Accounting",
            "description": "Number crunchers",
            "address": "123 Pine St, Nowhere, AR"
        }, this.serviceName, "2019-11-30T04:10:54.843Z");

        // Mark cache loading as complete
        this.Classes['BallotItem'].loadedCache = true;
        this.Classes['Department'].loadedCache = true;

        // Start sending data to Safety, Weather, Traffic
        setInterval(function () {
            thisService.DRPNode.TopicManager.SendToTopic("Weather", `[${thisService.serviceName}] It's currently 72 degrees and sunny`);
        }, 3000);

        setInterval(function () {
            thisService.DRPNode.TopicManager.SendToTopic("Safety", `[${thisService.serviceName}] Godzilla is attacking, stay indoors`);
        }, 5000);

        setInterval(function () {
            thisService.DRPNode.TopicManager.SendToTopic("Traffic", `[${thisService.serviceName}] Massachusetts drivers spotted on I95, excercise caution`);
        }, 7000);
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
    myNode.AddService(new MunicipalityService(serviceName, myNode, priority, weight, scope));

});

