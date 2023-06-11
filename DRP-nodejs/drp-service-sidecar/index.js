'use strict';

const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const { DRP_WebServer, DRP_WebServerConfig } = require('drp-mesh').WebServer;
const axios = require('axios');

// Create test service class
class SidecarService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope, sidecarConfig) {
        super(serviceName, drpNode, "Sidecar", null, false, priority, weight, drpNode.Zone, scope, null, ["RESTLogs"], 1);
        let thisService = this;

        // If this is a sidecar, set up a local listener
        this.WebServer = new DRP_WebServer(sidecarConfig);
        this.WebServer.start().then(() => {
            drpNode.EnableREST(this.WebServer, "/Mesh", "Mesh", false);
        });

        // Create rest agent for calling local legacy web service
        /** @type {axios.default} */
        this.__restAgent = axios.create({
            baseURL: sidecarConfig.TargetBaseURL,
            timeout: 5000,
            headers: {},
            proxy: false
        });

        // Need to come up with a way to take a legacy web service's OpenAPI doc and translate that to DRP calls

        // Define global methods
        this.ClientCmds = {
            call: async (cmdObj) => {
                // Remote services use this to make a call to the local legacy web service
                let params = thisService.GetParams(cmdObj, ['urlmethod', 'path', 'params']);
                let returnObj = null;
                returnObj = await thisService.__restAgent({
                    method: params.method,
                    url: thisService.__restAgent.defaults.baseURL + (params.path || ""),
                    params: params.params
                });
                return returnObj.data;
            }
        };
    }
}

module.exports = SidecarService;