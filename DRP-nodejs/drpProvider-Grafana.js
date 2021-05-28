'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const AWS = require('aws-sdk');
const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;

// Must ignore cert errors due to Cortx certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

// Set Roles
let roleList = ["Provider"];

// Create Grafana service class
class GrafanaService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope) {
        super(serviceName, drpNode, "GrafanaService", null, false, priority, weight, drpNode.Zone, scope, null, [], 1);
        let thisService = this;

        // Define global methods
        this.ClientCmds = {
            jsonQuery: async (params) => {
                // This is usually called from Grafana
                return await this.jsonQuery(params);
            }
        };
    }

    async jsonQuery(params) {
        let returnObj = null;
        if (params.pathList.length === 0) {
            // No route provided
            return "OK";
        }
        let routeName = params.pathList.shift();
        switch (routeName) {
            case 'search':
                returnObj = await this.jsonQuery_Search(params);
                break;
            case 'annotations':
                returnObj = await this.jsonQuery_Annotations(params);
                break;
            case 'query':
                returnObj = await this.jsonQuery_Query(params);
                break;
            case 'tagkeys':
            case 'tag-keys':
                returnObj = await this.jsonQuery_TagKeys(params);
                break;
            case 'tagvalues':
            case 'tag-values':
                returnObj = await this.jsonQuery_TagValues(params);
                break;
            default:
                returnObj = null;
                break;
        }
        return returnObj;
    }

    async jsonQuery_Search(params) {
        let result = [];
        result = ["upper_50", "upper_75", "simple_table"];
        /*
        timeserie.forEach((ts) => {
            result.push(ts.target);
        });
        */
        return result;
    }

    async jsonQuery_Annotations(params) {
        return annotations;
    }

    async jsonQuery_Query(params) {

        let grafanaQuery = params.body || params.grafanaQuery;

        let grafanaQueryStatic = {
            "panelId": 1,
            "range": {
                "from": "2016-10-31T06:33:44.866Z",
                "to": "2016-10-31T12:33:44.866Z",
                "raw": {
                    "from": "now-6h",
                    "to": "now"
                }
            },
            "rangeRaw": {
                "from": "now-6h",
                "to": "now"
            },
            "interval": "30s",
            "intervalMs": 30000,
            "targets": [
                { "target": "upper_50", "refId": "A", "type": "timeserie" },
                { "target": "upper_75", "refId": "B", "type": "timeserie" }
            ],
            "adhocFilters": [{
                "key": "City",
                "operator": "=",
                "value": "Berlin"
            }],
            "format": "json",
            "maxDataPoints": 550
        }

        if (!grafanaQuery) return;

        let tsResult = [];

        grafanaQuery.targets.forEach((target) => {
            let tmpQuery = grafanaQuery;
            if (target.type === 'table') {
                let columnIndex = {
                    Time: 0,
                    Country: 1,
                    Number: 2
                };
                let returnTable =
                {
                    type: "table",
                    columns: [{ text: 'Time', type: 'time' }, { text: 'Country', type: 'string' }, { text: 'Number', type: 'number' }],
                    rows: [
                        [1450754160000, 'SE', 123],
                        [1450754160000, 'DE', 231],
                        [1450754160000, 'US', 321],
                    ]
                };
                if (grafanaQuery.adhocFilters && grafanaQuery.adhocFilters.length > 0) {
                    // Parse ad-hoc filters
                    grafanaQuery.adhocFilters.forEach((filter) => {
                        let returnRows = [];
                        returnTable.rows.forEach((rowData) => {
                            switch (filter.operator) {
                                case '=':
                                    if (rowData[columnIndex[filter.key]] === filter.value) {
                                        returnRows.push(rowData);
                                    } else {
                                        let match = false;
                                    }
                                    break;
                            }
                        });
                        returnTable.rows = returnRows;
                        //returnTable.rows = returnTable.rows.filter(t => t[filter.key] === filter.value);
                    })
                }
                tsResult.push(returnTable);
            } else {
                let k = timeserie.filter(t => t.target === target.target);
                k.forEach((kk) => {
                    tsResult.push(kk)
                });
            }
        });

        return tsResult;
    }

    async jsonQuery_TagKeys(params) {
        return tagKeys
    }
    async jsonQuery_TagValues(params) {
        return tagValues
    }
}

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName, null, null);
myNode.Debug = debug;
myNode.TestMode = testMode;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // Add Cortx service
    myNode.AddService(new CortxService("Grafana", myNode, 10, 10, "global"));
});
