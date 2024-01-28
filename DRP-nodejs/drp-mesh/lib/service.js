'use strict';

const DRP_MethodParams = require("./methodparams");
const UMLClass = require('./uml').Class;
//const DRP_Node = require('./node');

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

class DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} type Service Type
     * @param {string} instanceID Instance ID
     * @param {boolean} sticky Stickiness
     * @param {number} priority Lower better
     * @param {number} weight Higher better
     * @param {string} zone Declared zone
     * @param {string} scope Availability Local|Zone|Global
     * @param {string[]} dependencies Peer service dependencies
     * @param {string[]} streams Streams provided
     * @param {number} status Service status [0|1|2]
     */
    constructor(serviceName, drpNode, type, instanceID, sticky, priority, weight, zone, scope, dependencies, streams, status) {
        this.serviceName = serviceName;
        this.DRPNode = drpNode;
        this.ClientCmds = {};
        /** @type Object.<string,UMLClass> */
        this.Classes = {};
        this.Type = type;
        this.InstanceID = instanceID || `${this.DRPNode.NodeID}-${serviceName}-${getRandomInt(9999)}`;
        this.Sticky = sticky;
        this.Priority = priority || 10;
        this.Weight = weight || 10;
        this.Zone = zone || "DEFAULT";
        this.Scope = scope || "global";
        this.Dependencies = dependencies || [];
        this.Streams = streams || [];
        this.Status = status || 0;
    }

    /**
     * 
     * @param {UMLClass} umlClass New Class definition
     */
    AddClass(umlClass) {
        this.Classes[umlClass.Name] = umlClass;
    }

    GetDefinition() {
        let thisService = this;
        let serviceDefinition = {
            InstanceID: thisService.InstanceID,
            Name: thisService.serviceName,
            Type: thisService.Type,
            Scope: thisService.Scope,
            Zone: thisService.Zone,
            Classes: {},
            ClientCmds: Object.keys(thisService.ClientCmds),
            Streams: thisService.Streams,
            Status: thisService.Status,
            Sticky: thisService.Sticky,
            Weight: thisService.Weight,
            Priority: thisService.Priority,
            Dependencies: thisService.Dependencies
        };

        // Loop over classes, get defs (excluding caches)
        let classNameList = Object.keys(thisService.Classes);
        for (let i = 0; i < classNameList.length; i++) {
            let className = classNameList[i];
            serviceDefinition.Classes[className] = thisService.Classes[className].GetDefinition();
        }
        return serviceDefinition;
    }

    /**
     * Send a command to peer services
     * @param {string} method Method name
     * @param {object} params Method parameters
     */
    PeerBroadcast(method, params) {
        let thisService = this;

        // Get list of peer service IDs
        let peerServiceIDList = thisService.DRPNode.TopologyTracker.FindServicePeers(thisService.InstanceID);

        // Loop over peers, broadcast command
        for (let i = 0; i < peerServiceIDList.length; i++) {
            let peerServiceID = peerServiceIDList[i];
            thisService.DRPNode.ServiceCmd(thisService.serviceName, method, params, {
                targetServiceInstanceID: peerServiceID
            });
        }
    }

    /**
     * Get parameters for Service Method
     * @param {DRP_MethodParams} params Parameters object
     * @param {string[]} paramNames Ordered list of parameters to extract
     * @returns {object}
     */
    GetParams(params, paramNames) {
        /*
         * Parameters can be passed three ways:
         *   - Ordered list of remaining path elements (params.__pathList[paramNames[x]])
         *   - POST or PUT body (params.payload.myVar)
         *   - Directly in params (params.myVar)
        */
        let returnObj = {};
        if (!paramNames || !Array.isArray(paramNames)) return returnObj;
        for (let i = 0; i < paramNames.length; i++) {
            returnObj[paramNames[i]] = null;
            // First, see if the parameters were part of the remaining path (CLI or REST)
            if (params.__pathList && Array.isArray(params.__pathList)) {
                if (typeof params.__pathList[i] !== 'undefined') {
                    returnObj[paramNames[i]] = params.__pathList[i];
                }
            }

            // Second, see if the parameters were passed in the payload (REST body)
            if (params.__payload && typeof params.__payload[paramNames[i]] !== 'undefined') {
                returnObj[paramNames[i]] = params.__payload[paramNames[i]];
            }

            // Third, see if the parameters were passed directly in the params (DRP Exec)
            if (typeof params[paramNames[i]] !== 'undefined') {
                returnObj[paramNames[i]] = params[paramNames[i]];
            }
        }
        return returnObj;
    }
}

module.exports = DRP_Service;