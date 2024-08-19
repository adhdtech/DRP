'use strict';

const { DRP_MethodParams, DRP_GetParams } = require("./params");
const { DRP_TopicManager, DRP_TopicManager_Topic } = require("./topicmanager");
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
     * @param {string} version Instance Version
     */
    constructor(serviceName, drpNode, type, instanceID, sticky, priority, weight, zone, scope, dependencies, streams, status, version) {
        this.serviceName = serviceName;
        this.DRPNode = drpNode;
        this.GetParams = DRP_GetParams;
        this.ClientCmds = {};
        /** @type Object.<string,UMLClass> */
        this.Classes = {};
        this.Type = type;
        this.Version = version || null;
        this.InstanceID = instanceID || `${this.DRPNode.NodeID}-${serviceName}-${getRandomInt(9999)}`;
        this.Sticky = sticky;
        this.Priority = priority || 10;
        this.Weight = weight || 10;
        this.Zone = zone || "DEFAULT";
        this.Scope = scope || "global";
        this.Dependencies = dependencies || [];
        /** @type Object.<string,DRP_TopicManager_Topic> */
        this.Streams = {};
        this.Status = status || 0;

        if (streams && streams.length) {
            for (let thisStreamName of streams) {
                this.Streams[thisStreamName] = this.DRPNode.TopicManager.CreateTopic(serviceName, thisStreamName, 100);
            }
        }
    }

    /**
     * 
     * @param {UMLClass} umlClass New Class definition
     */
    AddClass(umlClass) {
        this.Classes[umlClass.Name] = umlClass;
    }

    AddStream(streamName, historyLength) {
        let newStream = this.DRPNode.TopicManager.CreateTopic(this.serviceName, streamName, historyLength);
        this.Streams[streamName] = newStream;
    }

    GetDefinition() {
        let thisService = this;
        let serviceDefinition = {
            InstanceID: thisService.InstanceID,
            Name: thisService.serviceName,
            Type: thisService.Type,
            Version: thisService.Version,
            Scope: thisService.Scope,
            Zone: thisService.Zone,
            Classes: {},
            ClientCmds: Object.keys(thisService.ClientCmds),
            Streams: Object.keys(thisService.Streams),
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
}

module.exports = DRP_Service;