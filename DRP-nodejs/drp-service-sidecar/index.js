'use strict';

const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const { DRP_WebServer, DRP_WebServerConfig } = require('drp-mesh').WebServer;
const { DRP_Packet, DRP_Cmd, DRP_Reply, DRP_Reply_Error, DRP_RouteOptions, DRP_CmdError, DRP_ErrorCode } = require('drp-mesh').Packet;
const axios = require('axios');

// Create test service class
class SidecarService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope, sidecarConfig) {
        super(serviceName, drpNode, "Sidecar", null, false, priority, weight, drpNode.Zone, scope, null, ["RESTLogs","WebhookLogs"], 1);
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

        thisService.StreamRelayNodeID = null;
        thisService.openAPIDoc = null;
        thisService.config = sidecarConfig;

        if (sidecarConfig.OpenAPIDocPath) {
            (async () => {
                let responseObj = await thisService.__restAgent.get(sidecarConfig.OpenAPIDocPath);
                thisService.openAPIDoc = responseObj.data;
            })()
        }

        // Need to come up with a way to take a legacy web service's OpenAPI doc and translate that to DRP calls

        // Define global methods
        this.ClientCmds = {
            //getOpenAPIDoc: async function (paramsObj) { return openAPIDoc; },
            call: async (paramsObj) => {
                // Remote services use this to make a call to the local legacy web service
                let params = thisService.GetParams(paramsObj, ['urlmethod', 'path', 'params']);
                let returnObj = null;
                returnObj = await thisService.__restAgent({
                    method: params.method,
                    url: thisService.__restAgent.defaults.baseURL + (params.path || ""),
                    params: params.params
                });
                return returnObj.data;
            },
            subscribeWebhook: async (paramsObj) => {
                // Local service uses this to push streams to webhooks
                let params = thisService.GetParams(paramsObj, ['topicName', 'scope', 'webhook', 'maxErrors']);
                if (!params.topicName || !params.scope || !params.webhook) {
                    throw new DRP_CmdError(`Must specify topicName,scope,webhook`, DRP_ErrorCode.BADREQUEST, "subscribeWebhook");
                }

                // Find a relay
                let relayList = await thisNode.TopologyTracker.FindRelaysInZone(thisNode.Zone);
                if (!relayList.length) {
                    throw new DRP_CmdError(`No subscription relays found`, DRP_ErrorCode.NOTFOUND, "subscribeWebhook");
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
                    for (let thisRecord of relayList) {
                        // See if a dedicated Relay is in list
                        if (thisRecord.Roles.length === 1) {
                            targetNodeID = thisNode.NodeID;
                        }
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

                thisService.StreamRelayNodeID = targetNodeID;

                let maxErrors = 1;
                if (params.maxErrors) {
                    maxErrors = parseInt(params.maxErrors);
                }

                let errCount = 0;
                let unsubscribed = false;

                let streamToken = await thisNode.SubscribeRemote(targetNodeID, params.topicName, params.scope, async (streamPacket) => {
                    // TODO - use streamPacket.status to see if this is the last packet?

                    // If we're relaying a message from a topic, add the local NodeID to the route
                    if (streamPacket.payload && streamPacket.payload.Route) streamPacket.payload.Route.push(thisNode.NodeID);

                    try {
                        let response = await thisService.__restAgent.put(params.webhook, streamPacket.payload);
                        errCount = 0;
                        let logPacket = {
                            code: response.status,
                            baseURL: response.config.baseURL,
                            method: response.config.method,
                            url: response.config.url,
                            headers: response.config.headers
                        }
                        thisNode.TopicManager.SendToTopic("WebhookLogs", logPacket);
                        if (thisNode.Debug) {
                            console.dir(logPacket);
                        }
                    } catch (ex) {
                        errCount++;
                        let logPacket = {
                            code: ex.code,
                            baseURL: ex.config.baseURL,
                            method: ex.config.method,
                            url: ex.config.url,
                            headers: ex.config.headers
                        };
                        thisNode.TopicManager.SendToTopic("WebhookLogs", logPacket);
                        if (thisNode.Debug) {
                            console.dir(logPacket);
                        }

                        // See if the error threshold has been exceeded
                        if (errCount >= maxErrors && !unsubscribed) {
                            if (thisNode.Debug) {
                                console.log(`Sending unsubscribe to NodeID ${targetNodeID} for streamToken ${streamToken}`);
                            }
                            unsubscribed = true;
                            thisNode.UnsubscribeRemote(targetNodeID, streamToken);
                        }
                    }
                });

                return streamToken;
            },
            unsubscribeWebhook: async (paramsObj) => {
                // Local service uses this to push streams to webhooks
                let params = thisService.GetParams(paramsObj, ['streamToken']);
                if (!params.streamToken) {
                    throw new DRP_CmdError(`Must specify streamToken`, DRP_ErrorCode.BADREQUEST, "unsubscribeWebhook");
                }

                if (!thisService.StreamRelayNodeID) {
                    throw new DRP_CmdError(`No subscription relay`, DRP_ErrorCode.NOTFOUND, "unsubscribeWebhook");
                }

                thisNode.UnsubscribeRemote(thisService.StreamRelayNodeID, params.streamToken);

                return "Unsubscribed";
            }
        };

        thisService.REST = async (paramsObj) => {
            // Need to translate path, paramsObj verbs and params to callParams
            let callParams = {};
            return await thisService.ClientCmds.call(callParams);
        }
    }
}

module.exports = SidecarService;