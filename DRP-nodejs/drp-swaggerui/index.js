'use strict';

const express = require('express');
const Express_Router = express.Router;
const swaggerUI = require("swagger-ui-express");
const { DRP_SubscribableSource, DRP_Subscriber } = require('drp-mesh').Subscription;

// There is a glitch causing misroutes, need to address.  Noticed that if
// service A is online and service B joins, it could potentially start responding
// on service A's route.

// GH Issue: DRP VDM - Swagger UI Misroutes #171

class SwaggerRouter {
    constructor(thisNode, swaggerRoute) {
        this.DRPNode = thisNode;
        /** @type {Object<string,Express_Router}} */
        thisNode.SwaggerRoute = swaggerRoute;
        thisNode.SwaggerRouters = {};
        thisNode.AddSwaggerRouter = async (serviceName, targetNodeID) => {

            let swaggerObj;

            // Reach out to the remote node
            try {
                swaggerObj = await thisNode.ServiceCmd(serviceName, "getOpenAPIDoc", null, {
                    targetNodeID: targetNodeID,
                    useControlPlane: true
                });
            } catch (ex) {
                // Could not add swagger route for service
                return false;
            }

            // Does it exist?
            if (swaggerObj && swaggerObj.openapi) {

                // Override server settings
                swaggerObj.servers = [
                    {
                        "url": `/Mesh/Services/${serviceName}`
                    }
                ];

                // Override security settings
                swaggerObj.components = {
                    "securitySchemes": {
                        "x-api-key": {
                            "type": "apiKey",
                            "name": "x-api-key",
                            "in": "header"
                        },
                        "x-api-token": {
                            "type": "apiKey",
                            "name": "x-api-token",
                            "in": "header"
                        }
                    }
                };

                swaggerObj.security = [
                    { "x-api-key": [] },
                    { "x-api-token": [] }
                ];

                let thisRouter = express.Router();
                thisRouter.use("/", swaggerUI.serve);
                thisRouter.get("/", swaggerUI.setup(swaggerObj));
                thisNode.SwaggerRouters[serviceName] = thisRouter;
            }
            return true;
        }

        // Need to add this to allow refreshing of Swagger Routes
        /*
        targetEndpoint.RegisterMethod("refreshSwaggerRouter", async function (params, srcEndpoint, token) {
            let serviceName = null;
            if (params && params.serviceName) {
                serviceName = params.serviceName;

            } else if (params && params.__pathList && params.__pathList.length > 0) {
                serviceName = params.__pathList.shift();
            } else {
                if (params && params.__pathList) return `Format \\refreshSwaggerRouter\\{serviceName}`;
                else return `FAIL - serviceName not defined`;
            }

            if (thisNode.SwaggerRouters[serviceName]) {
                delete thisNode.SwaggerRouters[serviceName];
                let serviceInstance = thisNode.TopologyTracker.FindInstanceOfService(serviceName);
                if (!serviceInstance) return `FAIL - Service [${serviceName}] does not exist`;
                await thisNode.AddSwaggerRouter(serviceName, serviceInstance.NodeID);
                return `OK - Refreshed SwaggerRouters[${serviceName}]`;
            } else {
                return `FAIL - SwaggerRouters[${serviceName}] does not exist`;
            }
        });
        */

        this.Start();
    }
    async Start() {
        let thisNode = this.DRPNode;
        // Add hooks to expressApp
        thisNode.WebServer.expressApp.use(`${thisNode.SwaggerRoute}/:serviceName?`, (req, res) => {
            // What service are we trying to reach?
            let targetServiceName = req.params['serviceName'];

            if (!targetServiceName) {
                let apiNames = Object.keys(thisNode.SwaggerRouters);
                let linkList = [];
                for (let i = 0; i < apiNames.length; i++) {
                    linkList.push(`<a href="${req.baseUrl}/${apiNames[i]}">${apiNames[i]}</a>`);
                }
                let linkListHtml = linkList.join("<br><br>");
                res.send(`<h3>Service List</h3>${linkListHtml}`);
                return;
            }

            // If we have it, execute
            if (thisNode.SwaggerRouters[targetServiceName]) {
                thisNode.SwaggerRouters[targetServiceName].handle(req, res, null);
            } else {
                res.status(404).send(`API doc not found for service ${targetServiceName}`);
            }
        });

        /**
         * 
         * @param {DRP_TopologyPacket} topologyPacket Topology Packet
         */
        let WatchTopologyForServices = async (topologyPacket) => {

            // Is this a service add?
            if (topologyPacket.cmd === "add" && topologyPacket.type === "service") {

                // Get topologyData
                /** @type {DRP_ServiceTableEntry} */
                let serviceEntry = topologyPacket.data;

                // If we already have it, ignore
                if (thisNode.SwaggerRouters[serviceEntry.Name]) return;

                // Reach out to the remote node, see if it has a Swagger doc for this service
                await thisNode.AddSwaggerRouter(serviceEntry.Name, serviceEntry.NodeID);
            }

            // Is this a service delete?
            if (topologyPacket.cmd === "delete" && topologyPacket.type === "node") {

                // TODO - Figure out a cleaner way to do this.  The TopologyManager only passes Node deletes to topic, not service deletes
                // Because of this we need to check each service after a Node removal
                let serviceNameList = Object.keys(thisNode.SwaggerRouters);
                for (let i = 0; i < serviceNameList.length; i++) {
                    let serviceName = serviceNameList[i];
                    let serviceInstance = thisNode.TopologyTracker.FindInstanceOfService(serviceName);
                    if (!serviceInstance) delete thisNode.SwaggerRouters[serviceName];
                }
            }

            if (topologyPacket.cmd === "delete" && topologyPacket.type === "service") {
                // Individual service removal; uncommon

                // Get topologyData
                /** @type {DRP_ServiceTableEntry} */
                let serviceEntry = topologyPacket.data;

                let serviceInstance = thisNode.TopologyTracker.FindInstanceOfService(serviceEntry.Name);
                if (!serviceInstance) delete thisNode.SwaggerRouters[serviceEntry.Name];
            }
        };

        // Watch Topology for new Service
        thisNode.TopicManager.SubscribeToTopic(new DRP_Subscriber("DRP", "TopologyTracker", null, null, null, false, (topologyPacket) => {
            WatchTopologyForServices(topologyPacket.Message);
        }, null));

        // Grab current services from Topology
        let serviceList = thisNode.TopologyTracker.ListServices();
        for (let serviceName of serviceList) {
            // Reach out to the remote node, see if it has a Swagger doc for this service
            await thisNode.AddSwaggerRouter(serviceName, null);
        }
    }
}

module.exports = SwaggerRouter;