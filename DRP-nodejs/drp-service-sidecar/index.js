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

        /** @type DRP_Node */
        let thisNode = drpNode;

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
            },
            subscribeWebhook: async (cmdObj) => {
                // Local service uses this to push streams to webhooks
                let params = thisService.GetParams(cmdObj, ['topicName', 'scope', 'webhook']);
                if (!params.topicName || !params.scope) {
                    throw new DRP_CmdError(`Must specify topicName,scope`, DRP_ErrorCode.BADREQUEST, "subscribe");
                }

                // Find a relay
                let relayList = await thisNode.ToplogyTracker.FindRelaysInZone(thisNode.Zone);
                if (!relayList.length) {
                    throw new DRP_CmdError(`No subscription relays found`, DRP_ErrorCode.NOTFOUND, "subscribe");
                }

                let targetNodeID = null;

                // Evaluate relays
                for (let thisRecord of relayList) {
                    // See if localNode is in list
                    if (thisRecord.NodeID === thisNode.NodeID) {
                        targetNodeID = thisNode.NodeID;
                        break;
                    }
                }
                if (!targetNodeID) {
                    // See if a dedicated Relay is in list
                    if (thisRecord.NodeRoles.length === 1) {
                        targetNodeID = thisNode.NodeID;
                        break;
                    }
                }
                
                if (!targetNodeID) {
                    // See if the connected Node is in list
                }
                
                if (!targetNodeID) {
                    // Pick the first one
                    let targetNodeRecord = relayList.shift();
                    targetNodeID = targetNodeRecord.NodeID;
                }

                let streamToken = await thisNode.SubscribeRemote(targetNodeID, params.topicName, params.scope, async (streamPacket) => {
                    // TODO - use streamPacket.status to see if this is the last packet?

                    // If we're relaying a message from a topic, add the local NodeID to the route
                    if (streamPacket.payload && streamPacket.payload.Route) streamPacket.payload.Route.push(thisNode.NodeID);

                    try {
                        await thisService.__restAgent.put(params.webhook, streamPacket.payload);
                    } catch (ex) {
                        thisNode.TopicManager.SendToTopic("Webhooks", ex);
                        if (thisNode.Debug) {
                            console.dir(ex);
                        }
                    }
                });

                return streamToken;
            }
        };
    }
}

module.exports = SidecarService;