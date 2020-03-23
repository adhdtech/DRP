'use strict';

const os = require('os');
const util = require('util');
const tcpp = require('tcp-ping');
const tcpPing = util.promisify(tcpp.ping);
const dns = require('dns').promises;
const DRP_Endpoint = require("./endpoint");
const DRP_Client = require("./client");
const DRP_Service = require("./service");
const DRP_TopicManager = require("./topicmanager");
const DRP_RouteHandler = require("./routehandler");
const DRP_Subscription = require('./subscription');
const { DRP_Packet, DRP_Cmd, DRP_Reply, DRP_Stream, DRP_RouteOptions } = require('./packet');

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

class DRP_PathCmd {
    /**
     * @param {string} method Method to execute
     * @param {string} pathList List of path elements
     * @param {object} params Arguments or payload
     */
    constructor(method, pathList, params) {
        this.method = method;
        this.pathList = pathlist;
        this.params = params;
    }
}

class DRP_NodeDeclaration {
    /**
     * 
     * @param {string} nodeID Node ID
     * @param {string[]} nodeRoles Functional Roles ['Registry','Broker','Provider','Logger']
     * @param {string} hostID Host Identifier
     * @param {string} nodeURL Listening URL (optional)
     * @param {string} domainName Domain Name
     * @param {string} domainKey Domain Key
     * @param {string} zoneName Zone Name
     * @param {string} scope Scope
     */
    constructor(nodeID, nodeRoles, hostID, nodeURL, domainName, domainKey, zoneName, scope) {
        this.NodeID = nodeID;
        this.NodeRoles = nodeRoles;
        this.HostID = hostID;
        this.NodeURL = nodeURL;
        this.DomainName = domainName;
        this.DomainKey = domainKey;
        this.Zone = zoneName;
        this.Scope = scope;
    }
}

class DRP_Node {
    /**
     * 
     * @param {string[]} nodeRoles List of Roles: Broker, Provider, Registry 
     * @param {string} hostID Host Identifier
     * @param {DRP_WebServer} webServer Web server (optional)
     * @param {string} drpRoute DRP WS Route (optional)
     * @param {string} nodeURL Node WS URL (optional)
     * @param {string} webProxyURL Web Proxy URL (optional)
     * @param {string} domainName DRP Domain Name (optional)
     * @param {string} domainKey DRP Domain Key (optional)
     * @param {string} zone DRP Zone Name (optional)
     * @param {boolean} debug Enable debug output (optional)
     */
    constructor(nodeRoles, hostID, webServer, drpRoute, nodeURL, webProxyURL, domainName, domainKey, zone, debug) {
        let thisNode = this;
        this.nodeID = `${os.hostname()}-${process.pid}-${getRandomInt(9999)}`;
        this.HostID = hostID;
        this.WebServer = webServer || null;
        this.drpRoute = drpRoute || "/";
        this.DomainName = domainName;
        this.DomainKey = domainKey;
        this.Zone = zone;
        this.Debug = debug;
        this.nodeURL = null;
        if (this.WebServer && this.WebServer.expressApp) {
            this.nodeURL = nodeURL;
        }
        this.nodeRoles = nodeRoles || [];
        this.webProxyURL = webProxyURL || null;

        /** @type {{string:DRP_NodeClient}} */
        this.NodeEndpoints = {};

        /** @type {{string:DRP_NodeClient}} */
        this.ConsumerEndpoints = {};

        this.TopologyTracker = new DRP_TopologyTracker(thisNode);

        let newNodeEntry = new DRP_NodeTableEntry(thisNode.nodeID, null, nodeRoles, nodeURL, "global", thisNode.Zone, "today", thisNode.nodeID);
        let addNodePacket = new DRP_TopologyPacket(newNodeEntry.NodeID, "add", "node", newNodeEntry.NodeID, newNodeEntry.Scope, newNodeEntry.Zone, newNodeEntry);
        thisNode.TopologyTracker.ProcessPacket(addNodePacket, thisNode.nodeID);

        //this.ServiceCommandTracking = {
        /*
         * ServiceName: {
         *    Providers: {
         *      myhost-port: {
         *          Weight,
         *          OutstandingCmds,
         *          AvgResponseTime,
         *          Reliability,
         *          ConnectionOpenTimestamp,
         *          ReconnectCount
         *      }
         *    }
         * }
         */
        //};

        /** @type Object.<string,DRP_Service> */
        this.Services = {};

        this.NodeDeclaration = new DRP_NodeDeclaration(this.nodeID, this.nodeRoles, this.HostID, this.nodeURL, this.DomainName, this.DomainKey, this.Zone);

        /** @type {{string:DRP_Subscription}} */
        this.Subscriptions = {};

        // Create topic manager
        this.TopicManager = new DRP_TopicManager(this);

        // If this is a Registry, seed the Registry with it's own declaration
        if (thisNode.IsRegistry()) {
            this.AddStream("RegistryUpdate", "Registry updates");

            if (this.DomainName) {
                // A domain name was provided; attempt to cluster with other registry hosts
                this.log(`This node is a Registry for ${this.DomainName}, attempting to contact other Registry nodes`);
                this.ConnectToOtherRegistries();
            }
        }

        // Add a route handler even if we don't have an Express server (needed for stream relays)
        this.RouteHandler = new DRP_RouteHandler(this, this.drpRoute);

        this.PacketRelayCount = 0;
    }
    /**
     * Print message to stdout
     * @param {string} message Message to output
     * @param {boolean} isDebugMsg Is it a debug message?
     */
    log(message, isDebugMsg) {
        // If it's a debug message and we don't have debugging turned on, return
        if (!this.Debug && isDebugMsg) return;

        let paddedNodeID = this.nodeID.padEnd(14, ' ');
        console.log(`${this.getTimestamp()} [${paddedNodeID}] -> ${message}`);
    }
    getTimestamp() {
        let date = new Date();
        let hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;
        let min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;
        let sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;
        let day = date.getDate();
        day = (day < 10 ? "0" : "") + day;
        return year + "" + month + "" + day + "" + hour + "" + min + "" + sec;
    }
    /**
     * 
     * @param {string} restRoute Route to listen for Node REST requests
     * @param {string} basePath Base path list
     * @returns {number} Failure code
     */
    EnableREST(restRoute, basePath) {
        let thisNode = this;

        if (!thisNode.WebServer || !thisNode.WebServer.expressApp) return 1;

        let tmpBasePath = basePath || "";
        let basePathArray = tmpBasePath.replace(/^\/|\/$/g, '').split('/');

        let nodeRestHandler = async function (req, res, next) {
            // Get Auth Key
            let authKey = null;
            if (req.headers && req.headers['authorization']) {
                authKey = req.headers['authorization'];
            }

            // Turn path into list, remove first element
            let remainingPath = req.path.replace(/^\/|\/$/g, '').split('/');
            remainingPath.shift();

            let listOnly = false;
            let format = null;

            if (req.query.listOnly) listOnly = true;
            if (req.query.format) format = 1;

            // Treat as "getPath"
            let results = await thisNode.GetObjFromPath({ "method": "cliGetPath", "pathList": basePathArray.concat(remainingPath), "listOnly": listOnly, "authKey": authKey }, thisNode.GetBaseObj());
            try {
                res.end(JSON.stringify(results, null, format));
            } catch (e) {
                res.end(`Failed to stringify response: ${e}`);
            }
            let timeStamp = thisNode.getTimestamp();
            thisNode.TopicManager.SendToTopic("RESTLogs", {
                timestamp: timeStamp,
                nodeid: thisNode.nodeID,
                req: {
                    hostname: req.hostname,
                    ip: req.ip,
                    method: req.method,
                    protocol: req.protocol,
                    path: req.path,
                    headers: req.headers,
                    query: req.query,
                    baseUrl: req.baseUrl,
                    body: req.body
                },
                res: results
            });
            next();
        };

        thisNode.WebServer.expressApp.all(`${restRoute}`, nodeRestHandler);
        thisNode.WebServer.expressApp.all(`${restRoute}/*`, nodeRestHandler);

        return 0;
    }

    async GetClassDefinitions() {

        let thisNode = this;
        let results = {};

        let classInstances = thisNode.ListClassInstances();

        // Loop over class names
        let classNames = Object.keys(classInstances);
        for (let i = 0; i < classNames.length; i++) {

            let className = classNames[i];

            // Loop over service names
            let serviceNames = Object.keys(classInstances[className]);

            // Call the first service to get the class definition
            let serviceName = serviceNames[0];
            let recordPath = ["Mesh", "Services", serviceName, "Classes", className, "GetDefinition"];

            // TO DO - Add logic to see if we can connect to the Provider; if not, route through Broker as we're doing now

            // Send cmd to broker for info
            let sendParams = {};
            sendParams.pathList = recordPath;
            let brokerNodeID = thisNode.FindBroker();
            let brokerNodeClient = await thisNode.VerifyNodeConnection(brokerNodeID);
            let cmdResponse = await brokerNodeClient.SendCmd("DRP", "pathCmd", sendParams, true, null);

            results[className] = cmdResponse.payload.pathItem;
            //let classDefinition = await thisNode.GetObjFromPath({ method: "cliGetPath", pathList: recordPath, listOnly: false }, thisNode.GetBaseObj());
            //results[className] = classDefinition.pathItem;
        }
        return results;
    }

    ListClassInstances(params) {
        let results = {};
        let findClassName = params;
        let nodeIDs = Object.keys(this.NodeDeclarations);
        for (let i = 0; i < nodeIDs.length; i++) {
            let nodeID = nodeIDs[i];
            //console.log("Looping over nodeID: " + nodeID);
            /** @type DRP_NodeDeclaration */
            let thisNodeDeclaration = this.NodeDeclarations[nodeID];
            // Loop over Services
            let serviceList = Object.keys(thisNodeDeclaration.Services);
            for (let j = 0; j < serviceList.length; j++) {
                let serviceID = serviceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let serviceInstanceObj = thisNodeDeclaration.Services[serviceID];
                // Loop over Classes
                //let classNames = Object.keys(serviceInstanceObj.Classes);
                for (let k = 0; k < serviceInstanceObj.Classes.length; k++) {
                    let className = serviceInstanceObj.Classes[k];
                    if (!findClassName || findClassName === className) {
                        if (!results[className]) {
                            results[className] = {};
                        }
                        if (!results[className][serviceID]) {
                            results[className][serviceID] = { providers: [] };
                        }
                        results[className][serviceID].providers.push(nodeID);
                    }
                }
            }
        }
        return results;
    }

    GetServiceDefinition(serviceName) {
        /*
         * We need to return:
         * {
         *    "TestService": {ClientCmds: {}, Classes:{}, Streams:{}}
         * }
         */
        let thisNode = this;
        let targetService = thisNode.Services[serviceName];
        let serviceDefinition = targetService.GetDefinition();
        return serviceDefinition;
    }

    async GetServiceDefinitions() {
        /*
         * We need to return:
         * {
         *    "TestService": {ClientCmds: {}, Classes:{}, Streams:{}}
         * }
         */
        let thisNode = this;
        let serviceDefinitions = {};
        let serviceNameList = thisNode.TopologyTracker.ListServices();
        for (let i = 0; i < serviceNameList.length; i++) {
            let serviceName = serviceNameList[i];
            // Unlike before, we don't distribute the actual service definitions in
            // the declarations.  We need to go out to each service and get the info
            let bestInstance = thisNode.TopologyTracker.FindInstanceOfService(serviceName);
            if (bestInstance.NodeID === thisNode.nodeID) {
                // Execute locally
                let response = thisNode.GetServiceDefinition(serviceName);
                serviceDefinitions[serviceName] = response;
            } else {
                // Execute remotely
                let targetNodeEndpoint = await thisNode.VerifyNodeConnection(bestInstance.NodeID);
                let response = await targetNodeEndpoint.SendCmd("DRP", "getServiceDefinition", serviceName, true, null, null);
                serviceDefinitions[serviceName] = response.payload;
            }
        }
        return serviceDefinitions;
    }

    async GetClassRecords(params) {
        let thisNode = this;

        let results = {};

        // If user didn't supply the className, return null
        if (!params || !params.className) return null;
        let thisClassName = params.className;

        // We need to get a list of all distinct INSTANCES for this class along with the best source for each
        let classInstances = thisNode.ListClassInstances(params.className);

        // If we don't have data for this class, return null
        if (!classInstances[thisClassName]) return null;

        let thisClassObj = classInstances[thisClassName];

        // Loop over Class for this service
        let serviceNames = Object.keys(thisClassObj);
        for (let j = 0; j < serviceNames.length; j++) {
            let serviceName = serviceNames[j];

            if (params.serviceName && params.serviceName !== serviceName) continue;

            let recordPath = ["Mesh", "Services", serviceName, "Classes", thisClassName, "cache"];

            // TO DO - Add logic to see if we can connect to the Provider; if not, route through Broker as we're doing now

            // Send cmd to broker for info
            let sendParams = {};
            sendParams.pathList = recordPath;
            let brokerNodeID = thisNode.FindBroker();
            let brokerNodeClient = await thisNode.VerifyNodeConnection(brokerNodeID);
            let cmdResponse = await brokerNodeClient.SendCmd("DRP", "pathCmd", sendParams, true, null);

            results[serviceName] = cmdResponse.payload.pathItem;

            //let returnData = await thisNode.GetObjFromPath({ method: "cliGetPath", pathList: recordPath, listOnly: false, authKey: params.authKey }, thisNode.GetBaseObj());
            //results[serviceName] = returnData.pathItem;
        }
        return results;
    }

    GetBaseObj() {
        let thisNode = this;
        return {
            NodeID: thisNode.nodeID,
            NodeURL: thisNode.nodeURL,
            NodeObj: thisNode,
            Services: thisNode.Services,
            Streams: thisNode.TopicManager.Topics,
            Endpoints: {
                Nodes: async function (params) {
                    let remainingChildPath = params.pathList;
                    let oReturnObject = null;
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let remoteNodeID = remainingChildPath.shift();

                        // Need to send command to remoet Node with remaining tree data
                        params.pathList = remainingChildPath;
                        let thisNodeEndpoint = await thisNode.VerifyNodeConnection(remoteNodeID);

                        if (thisNodeEndpoint) {
                            // Await for command from remote node
                            let cmdResponse = await thisNodeEndpoint.SendCmd("DRP", "pathCmd", params, true, null);
                            if (cmdResponse.payload) {
                                oReturnObject = cmdResponse.payload;
                            }
                        } else {
                            thisNode.log(`Could not verify node connection for [${remoteNodeID}]`, true);
                        }

                    } else {
                        // Return list of NodeEndpoints
                        oReturnObject = {};
                        let aNodeKeys = Object.keys(thisNode.NodeEndpoints);
                        for (let i = 0; i < aNodeKeys.length; i++) {
                            oReturnObject[aNodeKeys[i]] = {
                                "ConsumerType": "SomeType1",
                                "Status": "Unknown"
                            };
                        }
                    }
                    return oReturnObject;
                },
                Consumers: async function (params) {
                    let remainingChildPath = params.pathList;
                    let oReturnObject = null;
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let agentID = remainingChildPath.shift();

                        // Need to send command to consumer with remaining tree data
                        params.pathList = remainingChildPath;
                        let targetEndpoint = await thisNode.VerifyConsumerConnection(agentID);

                        if (targetEndpoint) {
                            // Await for command from consumer
                            let results = await targetEndpoint.SendCmd("DRP", params.method, params, true, null);
                            if (results && results.payload && results.payload) {
                                oReturnObject = results.payload;
                            }
                        } else {
                            thisNode.log(`Could not verify consumer connection for [${agentID}]`, true);
                        }

                    } else {
                        // Return list of consumers
                        oReturnObject = {};
                        let aConsumerKeys = Object.keys(thisNode.ConsumerEndpoints);
                        for (let i = 0; i < aConsumerKeys.length; i++) {
                            oReturnObject[aConsumerKeys[i]] = {
                                "ConsumerType": "SomeType1",
                                "Status": "Unknown"
                            };
                        }
                    }
                    return oReturnObject;
                }
            },
            Mesh: {
                Topology: thisNode.TopologyTracker,
                Streams: async function (params) {
                    //console.log("Checking Streams...");
                    let remainingChildPath = params.pathList;
                    let oReturnObject = {};
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let streamInstanceID = remainingChildPath.shift();

                        params.pathList = remainingChildPath;

                        if (remainingChildPath && remainingChildPath.length > 0) {
                            // Route to target node's topic manager
                            let targetNodeID = remainingChildPath.shift();
                            params.pathList = ['Streams', streamInstanceID].concat(remainingChildPath);

                            if (targetNodeID === thisNode.nodeID) {
                                // The target NodeID is local
                                oReturnObject = thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
                            } else {
                                // The target NodeID is remote
                                let targetNodeObj = await thisNode.VerifyNodeConnection(targetNodeID);
                                if (targetNodeObj) {
                                    let cmdResponse = await targetNodeObj.SendCmd("DRP", "pathCmd", params, true, null);
                                    if (cmdResponse.payload) {
                                        oReturnObject = cmdResponse.payload;
                                    }
                                }
                            }
                        } else {
                            // Just list the Nodes with this topic
                            let providerNames = Object.keys(thisNode.NodeDeclarations);
                            for (let i = 0; i < providerNames.length; i++) {
                                let providerName = providerNames[i];
                                let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                                // Loop over Streams
                                if (!thisNodeDeclaration.Streams) continue;
                                let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                                for (let j = 0; j < streamInstanceList.length; j++) {
                                    if (streamInstanceID === streamInstanceList[j]) {
                                        oReturnObject[providerName] = () => { };
                                    }
                                }
                            }
                        }

                    } else {
                        // Return list of Streams
                        let providerNames = Object.keys(thisNode.NodeDeclarations);
                        for (let i = 0; i < providerNames.length; i++) {
                            let providerName = providerNames[i];
                            let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                            // Loop over Streams
                            if (!thisNodeDeclaration.Streams) continue;
                            let streamInstanceList = Object.keys(thisNodeDeclaration.Streams);
                            for (let j = 0; j < streamInstanceList.length; j++) {
                                let streamInstanceID = streamInstanceList[j];
                                if (!oReturnObject[streamInstanceID]) oReturnObject[streamInstanceID] = {
                                    "StreamName": streamInstanceID,
                                    "Providers": []
                                };

                                oReturnObject[streamInstanceID].Providers.push(providerName);
                            }
                        }
                    }
                    return oReturnObject;
                },
                Services: async function (params) {
                    //console.log("Checking Services...");
                    let remainingChildPath = params.pathList;
                    let oReturnObject = {};
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let serviceName = remainingChildPath.shift();

                        params.pathList = ['Services', serviceName].concat(remainingChildPath);

                        let targetServiceEntry = thisNode.TopologyTracker.FindInstanceOfService(serviceName);
                        if (!targetServiceEntry) return;

                        let targetNodeID = targetServiceEntry.NodeID;
                        //thisNode.log(`Calling node ${targetNodeID}`);

                        if (targetNodeID === thisNode.nodeID) {
                            // The target NodeID is local
                            oReturnObject = thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
                        } else {
                            // The target NodeID is remote
                            let routeOptions = null;

                            // Try to get a direct connection
                            let targetNodeEndpoint = await thisNode.VerifyNodeConnection(targetNodeID);
                            if (!targetNodeEndpoint) {
                                // Fallback to nextHop relay (usually Registry)
                                let endpointNodeID = targetServiceEntry.LearnedFrom;
                                targetNodeEndpoint = thisNode.NodeEndpoints[endpointNodeID];
                                routeOptions = { srcNodeID: thisNode.nodeID, tgtNodeID: targetServiceEntry.NodeID, routeHistory: [] };
                            }

                            let cmdResponse = await targetNodeEndpoint.SendCmd("DRP", "pathCmd", params, true, null, routeOptions);
                            if (cmdResponse.payload) {
                                oReturnObject = cmdResponse.payload;
                            }
                        }

                    } else {
                        // Return list of Service Objects
                        oReturnObject = thisNode.TopologyTracker.GetServicesWithProviders();
                    }
                    return oReturnObject;
                }
            }
        };
    }

    /**
    * Find Providers for a given Stream
    * @param {string} streamName Stream to find
    * @returns {string[]} List of Providers offering Stream
    */
    FindProvidersForStream(streamName) {
        let thisNode = this;
        let myRegistry = thisNode.NodeDeclarations;
        let providerList = [];

        let providerNames = Object.keys(myRegistry);

        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = myRegistry[providerName];
            // Loop over Streams
            if (!thisNodeDeclaration.Streams) continue;
            let streamList = Object.keys(thisNodeDeclaration.Streams);
            for (let j = 0; j < streamList.length; j++) {
                if (streamName === streamList[j]) {
                    providerList.push(providerName);
                }
            }
        }
        return providerList;
    }

    async EvalPath(oCurrentObject, params) {
        let oReturnObject = null;

        let aChildPathArray = params.pathList;

        // Do we have a path array?
        if (aChildPathArray.length === 0) {
            // No - act on parent object
            oReturnObject = oCurrentObject;
        } else {
            // Yes - get child
            PathLoop:
            for (let i = 0; i < aChildPathArray.length; i++) {

                // Does the child exist?
                if (oCurrentObject.hasOwnProperty(aChildPathArray[i])) {

                    // See what we're dealing with
                    let objectType = typeof oCurrentObject[aChildPathArray[i]];
                    switch (objectType) {
                        case 'object':
                            // Set current object
                            oCurrentObject = oCurrentObject[aChildPathArray[i]];
                            if (i + 1 === aChildPathArray.length) {
                                // Last one - make this the return object
                                oReturnObject = oCurrentObject;
                            }
                            break;
                        case 'function':
                            // Send the rest of the path to a function
                            let remainingPath = aChildPathArray.splice(i + 1);
                            params.pathList = remainingPath;
                            oReturnObject = await oCurrentObject[aChildPathArray[i]](params);
                            break PathLoop;
                        case 'string':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        case 'number':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        case 'boolean':
                            oReturnObject = oCurrentObject[aChildPathArray[i]];
                            break PathLoop;
                        default:
                            break PathLoop;
                    }

                } else {
                    // Child doesn't exist
                    break PathLoop;
                }
            }
        }

        return oReturnObject;
    }

    /**
   * @param {object} params Remaining path
   * @param {Boolean} baseObj Flag to return list of children
   * @returns {object} oReturnObject Return object
   */
    async GetObjFromPath(params, baseObj) {

        // Return object
        let oReturnObject = await this.EvalPath(baseObj, params);

        // If we have a return object and want only a list of children, do that now
        if (params.listOnly) {
            if (typeof oReturnObject === 'object' && oReturnObject !== null) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: this.ListObjChildren(oReturnObject) };
                }
            } else {
                oReturnObject = null;
            }
        } else if (oReturnObject) {
            if (!(typeof oReturnObject === 'object') || !oReturnObject["pathItem"]) {
                // Return object as item
                oReturnObject = { pathItem: oReturnObject };
            }
        }

        return oReturnObject;
    }

    /**
     * 
     * @param {string} remoteNodeID NodeID to connect to
     * @returns {DRP_Endpoint} DRP Node Endpoint
     */
    async VerifyNodeConnection(remoteNodeID) {

        let thisNode = this;

        /** @type DRP_NodeDeclaration */
        let thisNodeEntry = thisNode.TopologyTracker.NodeTable[remoteNodeID];
        if (!thisNodeEntry) return null;

        /** @type {DRP_Endpoint} */
        let thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];

        // Is the remote node listening?  If so, try to connect
        if (!thisNodeEndpoint && thisNodeEntry.NodeURL) {
            let targetNodeURL = thisNodeEntry.NodeURL;

            // We have a target URL, wait a few seconds for connection to initiate
            thisNode.log(`Connecting to Node [${remoteNodeID}] @ '${targetNodeURL}'`, true);
            thisNodeEndpoint = new DRP_NodeClient(targetNodeURL, thisNode.webProxyURL, thisNode, remoteNodeID);
            thisNode.NodeEndpoints[remoteNodeID] = thisNodeEndpoint;

            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (thisNodeEndpoint.IsConnecting()) {
                    // Yes - wait
                    await sleep(100);
                } else {
                    // No - break the for loop
                    break;
                }
            }
        }

        // Try sending a back connection request to the remote node via the registry
        if (!thisNodeEndpoint || !thisNodeEndpoint.IsReady()) {

            thisNode.log("Sending back request...", true);
            // Let's try having the Provider call us; send command through Registry
            try {
                // Get next hop
                let nextHopNodeID = thisNode.TopologyTracker.GetNextHop(remoteNodeID);

                if (nextHopNodeID) {
                    // Found the next hop
                    thisNode.log(`Sending back request to ${remoteNodeID}, relaying to [${nextHopNodeID}]`, true);
                    let routeOptions = {
                        srcNodeID: thisNode.nodeID,
                        tgtNodeID: remoteNodeID,
                        routeHistory: []
                    };
                    thisNode.NodeEndpoints[nextHopNodeID].SendCmd("DRP", "connectToNode", { "targetNodeID": thisNode.nodeID, "targetURL": thisNode.nodeURL }, false, null, routeOptions);
                } else {
                    // Could not find the next hop
                    throw `Could not find next hop to [${remoteNodeID}]`;
                }

            } catch (err) {
                this.log(`ERR!!!! [${err}]`);
            }

            this.log("Starting wait...", true);
            // Wait a few seconds
            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                    // Yes - wait
                    await sleep(100);
                } else {
                    // No - break the for loop
                    thisNode.log(`Received back connection from remote node [${remoteNodeID}]`, true);
                    i = 50;
                }
            }

            // If still not successful, delete DRP_NodeClient
            if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                thisNode.log(`Could not open connection to Node [${remoteNodeID}]`, true);
                if (thisNode.NodeEndpoints[remoteNodeID]) {
                    delete thisNode.NodeEndpoints[remoteNodeID];
                }
                //throw new Error(`Could not get connection to Provider ${remoteNodeID}`);
            } else {
                thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];
            }
        }

        // Removing the subscription checking from this section
        /*
        if (thisNodeEndpoint) {
            thisNodeEndpoint.drpNode = thisNode;
            thisNodeEndpoint.closeCallback = () => {
                // See if this endpoints was referenced in any subscriptions
                let remoteNodeID = thisNodeEndpoint.EndpointID;
                let subscriptionList = Object.keys(thisNode.Subscriptions);
                for (let i = 0; i < subscriptionList.length; i++) {
                    let subscriptionObject = thisNode.Subscriptions[subscriptionList[i]];
                    if (subscriptionObject.subscribedTo.indexOf(remoteNodeID) >= 0) {
                        // Remove from subcribedTo
                        subscriptionObject.subscribedTo.splice(subscriptionObject.subscribedTo.indexOf(remoteNodeID), 1);
                    }
                }
            };
        }
        */

        return thisNodeEndpoint;
    }

    /**
     *
     * @param {string} consumerID Consumer ID to connect to
     * @returns {DRP_Endpoint} DRP Consumer Endpoint
     */
    async VerifyConsumerConnection(consumerID) {

        let thisNode = this;

        let thisConsumerEndpoint = null;

        // Make sure the consumer session is active
        if (thisNode.ConsumerEndpoints[consumerID] && thisNode.ConsumerEndpoints[consumerID].IsReady()) thisConsumerEndpoint = thisNode.ConsumerEndpoints[consumerID];

        return thisConsumerEndpoint;
    }

    /**
     * 
     * @param {DRP_Service} serviceObj DRP Service
     */
    async AddService(serviceObj) {
        let thisNode = this;

        if (serviceObj && serviceObj.serviceName && serviceObj.ClientCmds) {
            thisNode.Services[serviceObj.serviceName] = serviceObj;
            /*
            if (thisNode.NodeDeclaration) {
                thisNode.NodeDeclaration.Services[serviceObj.serviceName] = {
                    "ClientCmds": Object.keys(serviceObj.ClientCmds),
                    "Classes": Object.keys(serviceObj.Classes),
                    "Persistence": serviceObj.Sticky || false,
                    "Weight": serviceObj.Weight || 0,
                    "Zone": serviceObj.Zone || null
                };
            }
            */
            let newServiceEntry = new DRP_ServiceTableEntry(thisNode.nodeID, null, serviceObj.serviceName, serviceObj.Type, serviceObj.InstanceID, serviceObj.Zone, serviceObj.Sticky, serviceObj.Priority, serviceObj.Weight, serviceObj.Scope, serviceObj.Dependencies, serviceObj.Status);
            let addServicePacket = new DRP_TopologyPacket(thisNode.nodeID, "add", "service", newServiceEntry.InstanceID, newServiceEntry.Scope, newServiceEntry.Zone, newServiceEntry);
            thisNode.TopologyTracker.ProcessPacket(addServicePacket, thisNode.nodeID);
        }
    }

    async RemoveService(serviceName) {
        let thisNode = this;
        if (serviceName && thisNode.NodeDeclaration.Services[serviceName]) {
            delete this.NodeDeclaration.Services[serviceName];
        }
    }

    AddStream(streamName, streamDescription) {
        let thisNode = this;
        if (streamName && streamDescription) {
            //thisNode.NodeDeclaration.Streams[streamName] = streamDescription;
        }
    }

    AddSubscription(subscriptionName, subscriptionObj) {
        let thisNode = this;
        if (subscriptionName && subscriptionObj) {
            thisNode.Subscriptions[subscriptionName] = subscriptionObj;
            // See if the desired topic is offered by any Nodes
        }
    }

    FindBroker() {
        let thisNode = this;
        let thisRegistry = thisNode.NodeDeclarations;
        let nodeIDList = Object.keys(thisRegistry);
        for (let i = 0; i < nodeIDList.length; i++) {
            let nodeID = nodeIDList[i];
            /** @type DRP_NodeDeclaration */
            let thisNodeDeclaration = thisRegistry[nodeID];
            // Is this Node a Broker?
            if (thisNodeDeclaration.NodeURL && thisNodeDeclaration.NodeRoles.indexOf("Broker") >= 0) {
                return nodeID;
            }
        }
        // We should only reach this point when this is a Provider not yet connected to the mesh
        return null;
    }

    /**
     * @param {DRP_Cmd} cmdObj Command object
     * @param {DRP_Endpoint} drpEndpoint Requesting Endpoint
     * @param {string} token Reply token
     * @return {object} Response
    */
    async LocalServiceCommand(cmdObj, drpEndpoint, token) {
        let thisNode = this;
        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            thisNode.log(`${baseMsg} params not supplied`, true);
            return null;
        }
        if (!cmdObj.serviceName) {
            thisNode.log(`${baseMsg} params.serviceName not supplied`, true);
            return null;
        }
        if (!cmdObj.cmd) {
            thisNode.log(`${baseMsg} params.method not supplied`, true);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName]) {
            thisNode.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`, true);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd]) {
            thisNode.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`, true);
            return null;
        }
        return await thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd](cmdObj.params, drpEndpoint);
    }

    // Easier way of execiting a command with the option of routing via the control plane
    async RunCommand(serviceName, cmd, params, targetNodeID, useControlPlane, awaitResponse) {
        let thisNode = this;
        if (targetNodeID && targetNodeID === thisNode.nodeID) {
            // The service instance is local; execute here
            if (awaitResponse) {
                let results = await thisNode.LocalServiceCommand(new DRP_Cmd(serviceName, cmd, params));
                return results;
            } else {
                thisNode.LocalServiceCommand(new DRP_Cmd(serviceName, cmd, params));
                return;
            }
        } else {
            let routeNodeID = targetNodeID;
            let routeOptions = null;

            if (useControlPlane) {
                // We want to use to use the control plan instead of connecting directly to the target
                routeNodeID = thisNode.TopologyTracker.GetNextHop(targetNodeID);
                routeOptions = new DRP_RouteOptions(thisNode.nodeID, targetNodeID);
            }

            let routeNodeConnection = await thisNode.VerifyNodeConnection(routeNodeID);

            if (awaitResponse) {
                let cmdResponse = await routeNodeConnection.SendCmd(serviceName, cmd, params, true, null, routeOptions, targetNodeID);
                return cmdResponse.payload;
            } else {
                routeNodeConnection.SendCmd(serviceName, cmd, params, false, null, routeOptions, targetNodeID);
                return;
            }
        }
    }

    /**
     * @param {DRP_Cmd} cmdObj Command object
     * @param {DRP_Endpoint} sourceEndpoint Requesting Endpoint
     * @param {string} token Reply token
     * @return {object} Response
    */
    async ServiceCommand(cmdObj, sourceEndpoint, token) {
        let thisNode = this;

        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            this.log(`${baseMsg} cmdObj not supplied`, true);
            return null;
        }
        if (!cmdObj.serviceName) {
            this.log(`${baseMsg} cmdObj.serviceName not supplied`, true);
            return null;
        }
        if (!cmdObj.cmd) {
            this.log(`${baseMsg} cmdObj.cmd not supplied`, true);
            return null;
        }

        // Are we being asked to execute locally?
        if (cmdObj.runNodeID && cmdObj.runNodeID === thisNode.nodeID) {
            let results = await thisNode.LocalServiceCommand(cmdObj, sourceEndpoint);
            return results;
        }

        // Update to use the DRP_TopologyTracker object
        let targetServiceRecord = thisNode.TopologyTracker.FindInstanceOfService(cmdObj.serviceName);

        // If no match is found then return null
        if (!targetServiceRecord) return null;

        // Assign target Node & Instance IDs
        let targetInstanceID = targetServiceRecord.InstanceID;
        let targetNodeID = targetServiceRecord.NodeID;

        thisNode.log(`Best instance of service [${cmdObj.serviceName}] is [${targetInstanceID}] on node [${targetNodeID}]`, true);

        if (targetNodeID === thisNode.nodeID) {
            // The service instance is local; execute here

            // Need to make adjustment so that we can specify the InstanceID instead of just the ServiceName in the cmdObj
            let results = await thisNode.LocalServiceCommand(cmdObj, sourceEndpoint);
            return results;
        } else {
            // The service instance is remote; execute on another node

            // Finally, make sure that we can talk to the Provider.  One of the following must be true...
            // * This node is listening (broker/registry)
            // * The target node is listening

            /** @type DRP_NodeClient */
            let thisNodeClient = null;

            if (thisNode.IsBroker() || thisNode.IsRegistry() || this.NodeDeclarations[targetNodeID].NodeURL) {
                // Verify connection to target node
                thisNodeClient = await this.VerifyNodeConnection(targetNodeID);
            } else {
                // Verify connection to Broker node
                let brokerNodeID = thisNode.FindBroker();
                if (brokerNodeID) {
                    thisNodeClient = await this.VerifyNodeConnection(brokerNodeID);
                }
            }

            if (thisNodeClient) {
                // Await for command from remote node
                let returnObj = null;
                let results = await thisNodeClient.SendCmd(cmdObj.serviceName, cmdObj.cmd, cmdObj.params, true, null, null, targetNodeID);
                if (results && results.payload && results.payload) {
                    returnObj = results.payload;
                }
                return returnObj;
            } else return null;
        }
    }

    /**
     * Validate node declaration against local node
     * @param {DRP_NodeDeclaration} declaration Node declaration to check
     * @returns {boolean} Successful [true/false]
     */
    ValidateNodeDeclaration(declaration) {
        let thisNode = this;
        let returnVal = false;

        if (!declaration.NodeID) return false;

        // Do the domains match?
        if (!thisNode.DomainName && !declaration.DomainName || thisNode.DomainName === declaration.DomainName) {
            // Do the domain keys match?
            if (!thisNode.DomainKey && !declaration.DomainKey || thisNode.DomainKey === declaration.DomainKey) {
                // Yes - allow the remote node to connect
                returnVal = true;
            }
        }

        return returnVal;
    }

    /**
    * Process Hello packet from remote node (inbound connection)
    * @param {DRP_NodeDeclaration} declaration DRP Node Declaration
    * @param {DRP_Endpoint} sourceEndpoint Source DRP endpoint
    * @param {any} token Reply token
    * @returns {object} Unsure
    */
    async Hello(declaration, sourceEndpoint, token) {
        let thisNode = this;

        let results = null;

        let isDeclarationValid = typeof declaration !== "undefined" && typeof declaration.NodeID !== "undefined" && declaration.NodeID !== null && declaration.NodeID !== "";

        if (isDeclarationValid) {
            // This is a node declaration
            sourceEndpoint.EndpointType = "Node";
            thisNode.log(`Remote node client sent Hello [${declaration.NodeID}]`, true);

            // Validate the remote node's domain and key (if applicable)
            if (!thisNode.ValidateNodeDeclaration(declaration)) {
                // The remote node did not offer a DomainKey or the key does not match
                thisNode.log(`Node [${declaration.NodeID}] declaration could not be validated`);
                sourceEndpoint.Close();
                return null;
            }

            // Add to NodeEndpoints
            sourceEndpoint.EndpointID = declaration.NodeID;
            thisNode.NodeEndpoints[declaration.NodeID] = sourceEndpoint;

            // Apply all Node Endpoint commands
            thisNode.ApplyNodeEndpointMethods(sourceEndpoint);

            let localNodeIsProxy = false;

            // If the local node is not a Registry and we do not know about the remote node, this is a proxy for that node
            if (!thisNode.IsRegistry() && !thisNode.TopologyTracker.NodeTable[declaration.NodeID]) {
                localNodeIsProxy = true;
            }

            thisNode.TopologyTracker.ProcessNodeConnect(sourceEndpoint, declaration, localNodeIsProxy);

        } else if (declaration.userAgent) {
            // This is a consumer declaration
            sourceEndpoint.EndpointType = "Consumer";
            // Moved from wsOpen handler
            if (!thisNode.ConsumerConnectionID) thisNode.ConsumerConnectionID = 1;
            // Assign ID using simple counter for now
            let remoteEndpointID = thisNode.ConsumerConnectionID;
            thisNode.ConsumerConnectionID++;

            sourceEndpoint.EndpointID = remoteEndpointID;
            thisNode.ConsumerEndpoints[remoteEndpointID] = sourceEndpoint;

            // Apply all Node Endpoint commands
            thisNode.ApplyNodeEndpointMethods(sourceEndpoint);

            thisNode.log(`Added ConsumerEndpoint[${sourceEndpoint.EndpointID}], type '${sourceEndpoint.EndpointType}'`);
        }
        else results = "INVALID DECLARATION";

        return results;
    }

    // TODO - The "RegisterNode" function was responsible for evaluating newly recognized sources against client subscriptions.
    //        Move these to functions that get triggered on TopologyManager changes?

    /**
     * 
     * @param {DRP_NodeDeclaration} declaration DRP Node Declaration
     * @returns {object} Unsure
     */
    async RegisterNode(declaration) {
        let thisNode = this;

        let results = null;

        let isDeclarationValid = typeof declaration !== "undefined" && typeof declaration.NodeID !== "undefined" && declaration.NodeID !== null && declaration.NodeID !== "";
        if (!isDeclarationValid) return "INVALID DECLARATION";

        // Add node to NodeEndpoints
        thisNode.log(`Registering node [${declaration.NodeID}]`);

        // Send to topic manager for debugging
        thisNode.TopicManager.SendToTopic("RegistryUpdate", { "action": "register", "nodeID": declaration.NodeID, "declaration": declaration });

        // If this Node has subscriptions, check against the new Node
        let providerStreamNames = Object.keys(declaration.Streams);
        let subscriptionNameList = Object.keys(thisNode.Subscriptions);
        for (let i = 0; i < providerStreamNames.length; i++) {
            let subscriptionListKey = subscriptionNameList.indexOf(providerStreamNames[i]);
            if (subscriptionListKey >= 0) {
                // The new Node has a stream we want
                let subscriptionObject = thisNode.Subscriptions[subscriptionNameList[subscriptionListKey]];
                let providerConn = await thisNode.VerifyNodeConnection(declaration.NodeID);
                // Are we already subscribed?
                if (providerConn && subscriptionObject.subscribedTo.indexOf(declaration.NodeID) < 0) {
                    providerConn.RegisterSubscription(subscriptionObject);
                }
            }
        }

        // This needs to be moved elsewhere; loop over consumer clients to see if the sending node has any streams someone has subscribed to
        if (thisNode.ConsumerEndpoints && declaration.Streams && Object.keys(declaration.Streams).length > 0) {

            // Loop over streams
            let providerStreamNames = Object.keys(declaration.Streams);
            for (let i = 0; i < providerStreamNames.length; i++) {
                // Loop over clients
                let consumerEndpointList = Object.keys(thisNode.ConsumerEndpoints);
                for (let j = 0; j < consumerEndpointList.length; j++) {
                    /** @type {DRP_Endpoint} */
                    let thisEndpoint = thisNode.ConsumerEndpoints[consumerEndpointList[j]];

                    // Loop over client subscriptions
                    let subscriptionTokens = Object.keys(thisEndpoint.Subscriptions);
                    for (let k = 0; k < subscriptionTokens.length; k++) {

                        /** @type {DRP_Subscription} */
                        let thisSubscription = thisEndpoint.Subscriptions[subscriptionTokens[k]];

                        // Are we already subscribed?
                        if (thisSubscription.subscribedTo.indexOf(declaration.NodeID) >= 0) continue;

                        if (providerStreamNames[i] === thisSubscription.topicName && (thisSubscription.scope === "global" || declaration.NodeID === thisNode.nodeID)) {
                            // We have a match; need to subscribe
                            // This provider offers the desired stream
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            if (declaration.NodeID === thisNode.nodeID) {
                                // The client needs to subscribe to the local Node
                                thisNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, thisEndpoint, thisSubscription.streamToken, thisSubscription.filter);
                            } else {
                                // The client needs to subscribe to a remote Node
                                let targetEndpoint = await thisNode.VerifyNodeConnection(declaration.NodeID);

                                // Subscribe on behalf of the Consumer
                                let providerStreamToken = targetEndpoint.AddStreamHandler(async function (response) {
                                    let sendFailed = false;
                                    if (!thisEndpoint.Subscriptions[thisSubscription.streamToken]) {
                                        sendFailed = true;
                                    } else {
                                        sendFailed = thisEndpoint.SendStream(thisSubscription.streamToken, 2, response.payload);
                                    }
                                    if (sendFailed) {
                                        // Client disconnected
                                        if (targetEndpoint.StreamHandlerQueue[response.token]) {
                                            targetEndpoint.DeleteStreamHandler(response.token);
                                        }
                                        let unsubResults = await targetEndpoint.SendCmd("DRP", "unsubscribe", { "topicName": thisSubscription.topicName, "streamToken": response.token }, true, null);
                                    }
                                });

                                // Await for command from provider
                                let subResults = await targetEndpoint.SendCmd("DRP", "subscribe", { "topicName": thisSubscription.topicName, "streamToken": providerStreamToken }, true, null);
                            }
                        }
                    }
                }
            }
        }

        if (thisNode.NodeEndpoints && declaration.Streams && Object.keys(declaration.Streams).length > 0) {

            // Loop over streams
            let providerStreamNames = Object.keys(declaration.Streams);
            for (let i = 0; i < providerStreamNames.length; i++) {
                // Loop over nodes
                let nodeEndpointList = Object.keys(thisNode.NodeEndpoints);
                for (let j = 0; j < nodeEndpointList.length; j++) {
                    /** @type {DRP_Endpoint} */
                    let targetEndpoint = thisNode.NodeEndpoints[nodeEndpointList[j]];

                    // Loop over client subscriptions
                    let subscriptionTokens = Object.keys(targetEndpoint.Subscriptions);
                    for (let k = 0; k < subscriptionTokens.length; k++) {

                        /** @type {DRP_Subscription} */
                        let thisSubscription = targetEndpoint.Subscriptions[subscriptionTokens[k]];

                        // Are we already subscribed?
                        if (thisSubscription.subscribedTo.indexOf(declaration.NodeID) >= 0) continue;

                        if (providerStreamNames[i] === thisSubscription.topicName && (thisSubscription.scope === "global" || declaration.NodeID === thisNode.nodeID)) {
                            // We have a match; need to subscribe
                            // This provider offers the desired stream
                            /**
                            * @type {DRP_NodeClient} DRP Node Client
                            */

                            // Putting this before the actual subscription attempt due to race conditions
                            thisSubscription.subscribedTo.push(declaration.NodeID);

                            if (declaration.NodeID === thisNode.nodeID) {
                                // The client needs to subscribe to the local Node
                                thisNode.TopicManager.SubscribeToTopic(thisSubscription.topicName, targetEndpoint, thisSubscription.streamToken, thisSubscription.filter);
                            } else {
                                // The client needs to subscribe to a remote Node
                                let targetEndpoint = await thisNode.VerifyNodeConnection(declaration.NodeID);

                                // Subscribe on behalf of the Node
                                let providerStreamToken = targetEndpoint.AddStreamHandler(async function (response) {
                                    let sendFailed = false;
                                    if (!targetEndpoint.Subscriptions[thisSubscription.streamToken]) {
                                        sendFailed = true;
                                    } else {
                                        sendFailed = targetEndpoint.SendStream(thisSubscription.streamToken, 2, response.payload);
                                    }
                                    if (sendFailed) {
                                        // Client disconnected
                                        if (targetEndpoint.StreamHandlerQueue[response.token]) {
                                            targetEndpoint.DeleteStreamHandler(response.token);
                                        }
                                        let unsubResults = await targetEndpoint.SendCmd("DRP", "unsubscribe", { "topicName": thisSubscription.topicName, "streamToken": response.token }, true, null);
                                    }
                                });

                                // Await for command from provider
                                let subResults = await targetEndpoint.SendCmd("DRP", "subscribe", { "topicName": thisSubscription.topicName, "streamToken": providerStreamToken }, true, null);
                            }
                        }
                    }
                }
            }
        }

        return results;

    }

    /**
     * 
     * @param {DRP_TopologyPacket} topologyPacket DRP Topology Packet
     * @param {DRP_Endpoint} srcEndpoint Source Endpoint
     * @param {string} replyToken Reply token
     */
    async TopologyUpdate(topologyPacket, srcEndpoint, replyToken) {
        let thisNode = this;
        thisNode.TopologyTracker.ProcessPacket(topologyPacket, srcEndpoint.EndpointID);
    }

    async PingDomainRegistries(domainName) {
        let thisNode = this;
        let recordList = await dns.resolveSrv(`_drp._tcp.${domainName}`);

        let srvHash = recordList.reduce((map, srvRecord) => {
            let key = `${srvRecord.name}-${srvRecord.port}`;
            srvRecord.pingInfo = null;
            map[key] = srvRecord;
            return map;
        }, {});

        /*
        let srvHash = {
            "localhost-8082": { "name": "localhost", "port": 8082 },
            "localhost-8083": { "name": "localhost", "port": 8083 },
            "localhost-8084": { "name": "localhost", "port": 8084 },
            "localhost-8085": { "name": "localhost", "port": 8085 }
        };
        */

        let srvKeys = Object.keys(srvHash);

        // Run tcp pings in parallel
        await Promise.all(
            srvKeys.map(async (srvKey) => {
                let srvRecord = srvHash[srvKey];
                try {
                    srvRecord.pingInfo = await tcpPing({
                        address: srvRecord.name,
                        port: srvRecord.port,
                        timeout: 1000,
                        attempts: 3
                    });
                }
                catch (ex) {
                    // Cannot do tcpPing against host:port
                    thisNode.log(`TCP Pings errored: ${ex}`);
                }
            })
        );
        return srvHash;
    }

    /**
     * 
     * @param {string} registryURL DRP Domain FQDN
     */
    async ConnectToRegistry(registryURL) {
        let thisNode = this;
        // Initiate Registry Connection
        let nodeClient = new DRP_NodeClient(registryURL, thisNode.webProxyURL, thisNode, null, true, async function (response) {

            // This is the callback which occurs after our Hello packet has been accepted

            // Get peer info
            let getDeclarationResponse = await nodeClient.SendCmd("DRP", "getNodeDeclaration", null, true, null);
            if (getDeclarationResponse && getDeclarationResponse.payload && getDeclarationResponse.payload.NodeID) {
                let registryNodeID = getDeclarationResponse.payload.NodeID;
                nodeClient.EndpointID = registryNodeID;
                thisNode.NodeEndpoints[registryNodeID] = nodeClient;
            } else return;

            // Get Registry
            thisNode.TopologyTracker.ProcessNodeConnect(nodeClient, getDeclarationResponse.payload);

            // If this Node has subscriptions, contact Providers
            let subscriptionNameList = Object.keys(thisNode.Subscriptions);
            for (let i = 0; i < subscriptionNameList.length; i++) {
                /** @type {DRP_Subscription} */
                let subscriptionObject = thisNode.Subscriptions[subscriptionNameList[i]];
                let providerList = thisNode.FindProvidersForStream(subscriptionObject.topicName);
                for (let j = 0; j < providerList.length; j++) {
                    // Subscribe to provider
                    let providerID = providerList[j];
                    let providerConn = await thisNode.VerifyNodeConnection(providerID);
                    if (providerConn && subscriptionObject.subscribedTo.indexOf(providerID) < 0) {
                        providerConn.RegisterSubscription(subscriptionObject);
                    }
                }
            }
        });
    }

    async ConnectToRegistryByDomain() {
        let thisNode = this;
        // Look up SRV records for DNS
        try {
            let srvHash = await thisNode.PingDomainRegistries(thisNode.DomainName);
            let srvKeys = Object.keys(srvHash);
            // Find registry with lowest average ping time
            let closestRegistry = null;
            for (let i = 0; i < srvKeys.length; i++) {
                let checkRegistry = srvHash[srvKeys[i]];
                if (checkRegistry.pingInfo && checkRegistry.pingInfo.avg) {
                    if (!closestRegistry || checkRegistry.pingInfo.avg < closestRegistry.pingInfo.avg) {
                        closestRegistry = checkRegistry;
                    }
                }
            }
            if (closestRegistry) {
                let protocol = "ws";

                // Dirty check to see if the port is SSL; are the last three digits 44x?
                let portString = closestRegistry.port.toString();
                let checkString = portString.slice(-3, 3);
                if (checkString === "44") {
                    protocol = "wss";
                }

                // Connect to target
                let registryURL = `${protocol}://${closestRegistry.name}:${closestRegistry.port}`;
                thisNode.ConnectToRegistry(registryURL);
            } else {
                thisNode.log(`Could not find active registry`);
            }

        } catch (ex) {
            thisNode.log(`Error resolving DNS: ${ex}`);
        }
    }

    async ConnectToOtherRegistries() {
        let thisNode = this;
        try {

            let srvHash = await thisNode.PingDomainRegistries(thisNode.DomainName);
            let srvKeys = Object.keys(srvHash);

            // Connect to all remote registries
            for (let i = 0; i < srvKeys.length; i++) {
                let checkRegistry = srvHash[srvKeys[i]];

                // Skip the local registry
                let checkNamePort = `^wss?://${checkRegistry.name}:${checkRegistry.port}$`;
                let regExp = new RegExp(checkNamePort);
                if (thisNode.nodeURL.match(regExp)) {
                    continue;
                }

                // Is the registry host reachable?
                if (checkRegistry.pingInfo && checkRegistry.pingInfo.avg) {
                    // Dirty check to see if the port is SSL; are the last three digits 44x?
                    let protocol = "ws";
                    let portString = checkRegistry.port.toString();
                    let checkString = portString.slice(-3, 3);
                    if (checkString === "44") {
                        protocol = "wss";
                    }
                    // Connect to target
                    let registryURL = `${protocol}://${checkRegistry.name}:${checkRegistry.port}`;
                    thisNode.ConnectToRegistry(registryURL);
                }
            }

        } catch (ex) {
            thisNode.log(`Error resolving DNS: ${ex}`);
        }
    }

    async ConnectToNode(params) {
        let thisNode = this;
        let targetNodeID = params.targetNodeID;
        let targetURL = params.targetURL;

        // Initiate Node Connection
        if (thisNode.NodeEndpoints[targetNodeID] && thisNode.NodeEndpoints[targetNodeID].wsConn.readyState < 2) {
            // We already have this NodeEndpoint registered and the wsConn is opening or open
            thisNode.log(`Received back request, already have NodeEndpoints[${targetNodeID}]`, true);
        } else {
            thisNode.log(`Received back request, connecting to [${targetNodeID}] @ ${params.wsTarget}`, true);
            thisNode.NodeEndpoints[targetNodeID] = new DRP_NodeClient(targetURL, thisNode.webProxyURL, thisNode, targetNodeID, false, null, null);
        }
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            let objKeys = Object.keys(oTargetObject);
            for (let i = 0; i < objKeys.length; i++) {
                let returnVal;
                let childAttrObj = oTargetObject[objKeys[i]];
                let attrType = Object.prototype.toString.call(childAttrObj).match(/^\[object (.*)\]$/)[1];

                switch (attrType) {
                    case "Object":
                        returnVal = Object.keys(childAttrObj).length;
                        break;
                    case "Array":
                        returnVal = childAttrObj.length;
                        break;
                    case "Function":
                        returnVal = null;
                        break;
                    default:
                        returnVal = childAttrObj;
                }
                pathObjList.push({
                    "Name": objKeys[i],
                    "Type": attrType,
                    "Value": returnVal
                });
            }
        }
        return pathObjList;
    }

    IsRegistry() {
        let thisNode = this;
        let isRegistry = thisNode.nodeRoles.indexOf("Registry") >= 0;
        return isRegistry;
    }

    IsBroker() {
        let thisNode = this;
        let isBroker = thisNode.nodeRoles.indexOf("Broker") >= 0;
        return isBroker;
    }

    /**
     * Tell whether this Node is a proxy for another Node
     * @param {string} checkNodeID Node to check
     * @returns {boolean} Is this node a proxy?
     */
    IsProxyFor(checkNodeID) {
        let thisNode = this;
        let isProxy = true;
        let checkNodeEntry = thisNode.TopologyTracker.NodeTable[checkNodeID];
        if (checkNodeEntry && checkNodeEntry.ProxyNodeID === thisNode.nodeID) {
            isProxy = true;
        }
        return isProxy;
    }

    async GetTopology() {
        let thisNode = this;
        let topologyObj = {};
        // We need to get a list of all nodes from the registry
        let nodeIDList = Object.keys(thisNode.TopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let targetNodeID = nodeIDList[i];
            let nodeEntry = thisNode.TopologyTracker.NodeTable[targetNodeID];
            let topologyNode = {};
            if (targetNodeID === thisNode.nodeID) {
                topologyNode = thisNode.ListClientConnections();
            } else {
                // Send a command to each node to get the list of client connections
                let useControlPlane = true;
                let routeNodeID = targetNodeID;
                let routeOptions = null;

                if (useControlPlane) {
                    // We want to use to use the control plan instead of connecting directly to the target
                    routeNodeID = thisNode.TopologyTracker.GetNextHop(targetNodeID);
                    routeOptions = new DRP_RouteOptions(thisNode.nodeID, targetNodeID);
                }

                let routeNodeConnection = await thisNode.VerifyNodeConnection(routeNodeID);
                let cmdResponse = await routeNodeConnection.SendCmd("DRP", "listClientConnections", null, true, null, routeOptions, targetNodeID);
                topologyNode = cmdResponse.payload;
            }

            // Append Roles and Listening URL
            topologyNode.roles = nodeEntry.Roles;
            topologyNode.url = nodeEntry.NodeURL;
            topologyNode.services = []; //Object.keys(nodeEntry.Services);

            // Add to hash
            topologyObj[targetNodeID] = topologyNode;

        }

        return topologyObj;
    }

    ListClientConnections() {
        let thisNode = this;
        let nodeClientConnections = {
            nodeClients: {},
            consumerClients: {}
        };

        // Loop over NodeEndpoints
        let nodeIDList = Object.keys(thisNode.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {
            let nodeID = nodeIDList[i];
            /** @type DRP_Endpoint */
            let thisEndpoint = thisNode.NodeEndpoints[nodeID];
            if (thisEndpoint.IsServer()) {
                nodeClientConnections.nodeClients[nodeID] = thisEndpoint.ConnectionStats();
            }
        }

        // Loop over ConsumerEndpoints
        let consumerIDList = Object.keys(thisNode.ConsumerEndpoints);
        for (let i = 0; i < consumerIDList.length; i++) {
            let consumerID = consumerIDList[i];
            /** @type DRP_Endpoint */
            let thisEndpoint = thisNode.ConsumerEndpoints[consumerID];
            nodeClientConnections.consumerClients[consumerID] = thisEndpoint.ConnectionStats();
        }

        return nodeClientConnections;
    }

    RemoveEndpoint(staleEndpoint, callback) {
        let thisNode = this;
        let staleNodeID = staleEndpoint.EndpointID;
        switch (staleEndpoint.EndpointType) {
            case "Node":
                thisNode.log(`Removing disconnected node [${staleNodeID}]`, true);
                delete thisNode.NodeEndpoints[staleNodeID];
                thisNode.TopologyTracker.ProcessNodeDisconnect(staleNodeID);

                break;
            case "Consumer":
                delete thisNode.ConsumerEndpoints[staleNodeID];
                break;
            default:
        }
        if (callback && typeof callback === 'function') {
            callback();
        }
    }

    /**
     * Add Methods to Endpoint
     * @param {DRP_Endpoint} targetEndpoint Endpoint to add methods to
     */
    ApplyNodeEndpointMethods(targetEndpoint) {
        let thisNode = this;
        targetEndpoint.RegisterCmd("topologyUpdate", async function (...args) {
            return thisNode.TopologyUpdate(...args);
        });

        targetEndpoint.RegisterCmd("getNodeDeclaration", async function (...args) {
            return thisNode.NodeDeclaration;
        });

        targetEndpoint.RegisterCmd("pathCmd", async function (params, srcEndpoint, token) {
            return await thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
        });

        targetEndpoint.RegisterCmd("connectToNode", async function (...args) {
            return await thisNode.ConnectToNode(...args);
        });

        targetEndpoint.RegisterCmd("getRegistry", function (params, srcEndpoint, token) {
            return thisNode.TopologyTracker.GetRegistry(params.reqNodeID);
        });

        targetEndpoint.RegisterCmd("getServiceDefinition", function (params, srcEndpoint, token) {
            return thisNode.GetServiceDefinition(params);
        });

        targetEndpoint.RegisterCmd("getServiceDefinitions", async function () {
            return await thisNode.GetServiceDefinitions();
        });

        targetEndpoint.RegisterCmd("getClassRecords", async function (...args) {
            return await thisNode.GetClassRecords(...args);
        });

        targetEndpoint.RegisterCmd("listClassInstances", function () {
            return thisNode.ListClassInstances();
        });

        targetEndpoint.RegisterCmd("getClassDefinitions", function () {
            return thisNode.GetClassDefinitions();
        });

        targetEndpoint.RegisterCmd("sendToTopic", function (params, srcEndpoint, token) {
            thisNode.TopicManager.SendToTopic(params.topicName, params.topicData);
        });

        targetEndpoint.RegisterCmd("getTopology", async function (...args) {
            return await thisNode.GetTopology(...args);
        });

        targetEndpoint.RegisterCmd("listClientConnections", function (...args) {
            return thisNode.ListClientConnections(...args);
        });
    }
}

class DRP_NodeClient extends DRP_Client {
    /**
    * @param {string} wsTarget Remote Node WS target
    * @param {string} proxy Web proxy
    * @param {DRP_Node} drpNode Local Node
    * @param {string} endpointID Remote Endpoint ID
    * @param {boolean} retryOnClose Do we retry on close
    * @param {function} openCallback Execute after connection is established
    * @param {function} closeCallback Execute after connection is terminated
    */
    constructor(wsTarget, proxy, drpNode, endpointID, retryOnClose, openCallback, closeCallback) {
        super(wsTarget, proxy, drpNode, endpointID, "Node");
        this.retryOnClose = retryOnClose;
        this.proxy = proxy;
        this.openCallback = openCallback;
        this.closeCallback = closeCallback;
        // Register Endpoint commands
        // (methods should return output and optionally accept [params, token] for streaming)

        drpNode.ApplyNodeEndpointMethods(this);
    }

    // Define Handlers
    async OpenHandler() {
        this.drpNode.log("Node client [" + this.RemoteAddress() + ":" + this.RemotePort() + "] opened");
        let response = await this.SendCmd("DRP", "hello", this.drpNode.NodeDeclaration, true, null);
        if (this.openCallback && typeof this.openCallback === 'function') {
            this.openCallback(response);
        }
    }

    async CloseHandler(closeCode) {
        let thisEndpoint = this;
        this.drpNode.log("Node client [" + thisEndpoint.RemoteAddress() + ":" + thisEndpoint.RemotePort() + "] closed with code [" + closeCode + "]");

        thisEndpoint.drpNode.RemoveEndpoint(thisEndpoint, thisEndpoint.closeCallback);

        if (this.retryOnClose) {
            await sleep(5000);
            this.RetryConnection();
        }
    }

    async ErrorHandler(error) {
        this.drpNode.log("Node client encountered error [" + error + "]");
    }

}

// Object which tracks advertised nodes and services
class DRP_TopologyTracker {
    /**
     * 
     * @param {DRP_Node} drpNode Associated DRP Node
     */
    constructor(drpNode) {
        let thisTopologyTracker = this;
        this.drpNode = drpNode;
        /** @type {Object.<string,DRP_NodeTableEntry>} */
        this.NodeTable = new DRP_NodeTable();
        /** @type {Object.<string,DRP_ServiceTableEntry>} */
        this.ServiceTable = new DRP_ServiceTable();
    }

    RemoveNextHop(nextHopNode) {
        // Loop over NodeEntries, remove all from nextHopNode
        let instanceIDlist = Object.keys(this.NodeEntries);
        for (let i = 0; i < instanceIDlist.length; i++) {
            let instanceID = instanceIDlist[i];
            if (this.NodeEntries[instanceID].NextHopNode === nextHopNode) {
                delete this.NodeEntries[instanceID];

                // Add to list of changes?
            }
        }
    }

    /**
     * 
     * @param {DRP_TopologyPacket} topologyPacket DRP Topology Packet
     * @param {string} srcNodeID Node we received this from
     */
    ProcessPacket(topologyPacket, srcNodeID) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.drpNode;
        let targetTable = null;

        // Get Base object
        switch (topologyPacket.type) {
            case "node":
                targetTable = thisTopologyTracker.NodeTable;
                break;
            case "service":
                targetTable = thisTopologyTracker.ServiceTable;
                break;
            default:
                return;
        }

        // Inbound topology packet; service add, update, delete
        switch (topologyPacket.cmd) {
            case "add":
                if (targetTable[topologyPacket.id]) {
                    // We already know about this one
                    if (targetTable[topologyPacket.id].NodeID === srcNodeID) {
                        // This is a direct connection from the source; update the LearnedFrom
                        targetTable[topologyPacket.id].LearnedFrom = srcNodeID;
                    }
                    return;
                } else {
                    // We don't have this one; add it and advertise
                    topologyPacket.data.LearnedFrom = srcNodeID;
                    targetTable.AddEntry(topologyPacket.id, topologyPacket.data);
                }
                break;
            case "update":
                if (targetTable[topologyPacket.id]) {
                    targetTable.UpdateEntry(topologyPacket.id, topologyPacket.data);
                } else {
                    thisTopologyTracker.drpNode.log(`Could not update non-existent ${topologyPacket.type} entry ${topologyPacket.id}`);
                    return;
                }
                break;
            case "delete":
                // Only delete if we learned the packet from the sourceID or if we are the source (due to disconnect)
                if (targetTable[topologyPacket.id] && targetTable[topologyPacket.id].LearnedFrom === srcNodeID || thisNode.nodeID === srcNodeID) {
                    delete targetTable[topologyPacket.id];
                } else {
                    return;
                }
                break;
            default:
                return;
        }

        thisTopologyTracker.drpNode.log(`Imported topology packet from [${topologyPacket.originNodeID}] -> ${topologyPacket.cmd} ${topologyPacket.type}[${topologyPacket.id}]`, true);

        // Loop over all connected node endpoints
        let nodeIDList = Object.keys(thisTopologyTracker.drpNode.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {

            // By default, do not relay the packet
            let relayPacket = false;

            // Get endpoint NodeID and object
            let checkNodeID = nodeIDList[i];

            let sourceNodeEntry = thisTopologyTracker.NodeTable[srcNodeID];
            let checkNodeEntry = thisTopologyTracker.NodeTable[checkNodeID];

            // Duplicate delete condition; if the deleted node was connected to the local node
            // as well as a registry node, this node will end up processing two delete requests
            if (!checkNodeEntry) {
                thisNode.log(`Tried to reference non-existent entry NodeTable[${checkNodeID}]`, true);
                continue;
            }

            /** @type {DRP_Endpoint} */
            let checkEndpoint = thisTopologyTracker.drpNode.NodeEndpoints[checkNodeID];

            // Skip if we received the packet from this node
            if (checkNodeID === srcNodeID) { continue; }

            // Skip if there is a scope restriction
            if (!(topologyPacket.scope === "global" || topologyPacket.scope === "zone" && topologyPacket.zone === checkNodeEntry.Zone)) { continue; }

            // If ANY of these conditions are true, relay
            // LOOP PREVENTION
            //  * We are the srcNode, NOT a Registry and the checkNode IS a Registry
            //  * We are a Proxy for the srcNode AND the checkNode is a Registry
            //  * We are a Proxy for the checkNode AND the srcNode is a Registry
            //  * We are a Registry, the packet WAS NOT received from a Registry
            //  * We are a Registry, the packet WAS received from a Registry and the checkNode IS NOT a Registry 

            switch (true) {
                case srcNodeID === thisNode.nodeID && !thisNode.IsRegistry() && checkNodeEntry.IsRegistry():
                    relayPacket = true;
                    break;
                case thisNode.IsProxyFor(srcNodeID) && checkNodeEntry.IsRegistry():
                    relayPacket = true;
                    break;
                case thisNode.IsProxyFor(checkNodeID) && sourceNodeEntry.IsRegistry():
                    relayPacket = true;
                    break;
                case thisNode.IsRegistry() && !sourceNodeEntry.IsRegistry():
                    relayPacket = true;
                    break;
                case thisNode.IsRegistry() && sourceNodeEntry.IsRegistry() && !checkNode.IsRegistry():
                    relayPacket = true;
                    break;
            }

            if (relayPacket) {
                checkEndpoint.SendCmd("DRP", "topologyUpdate", topologyPacket, false, null);
                thisNode.log(`Relayed topology packet to node: [${checkNodeID}]`, true);
            }
        }
        //thisTopologyTracker.drpNode.log(`Imported packet`);
    }

    /**
     * @returns {string[]} List of service names
     */
    ListServices() {
        let serviceNameSet = new Set();
        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];
            serviceNameSet.add(serviceTableEntry.Name);
        }
        let returnList = [...serviceNameSet];
        return returnList;
    }

    GetServicesWithProviders() {
        let oReturnObject = {};
        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];

            if (!oReturnObject[serviceTableEntry.Name]) oReturnObject[serviceTableEntry.Name] = {
                "ServiceName": serviceTableEntry.Name,
                "Providers": []
            };

            oReturnObject[serviceTableEntry.Name].Providers.push(serviceTableEntry.NodeID);
        }
        return oReturnObject;
    }

    /**
     * Return the most preferred instance of a service
     * @param {string} serviceName Name of Service to find
     * @param {string} zone Name of zone (optional)
     * @returns {DRP_ServiceTableEntry} Best Service Table entry
     */
    FindInstanceOfService(serviceName, zone) {
        let thisTopologyTracker = this;
        /*
         * Status MUST be 1 (Ready)
         * Local zone is better than others (if specified, must match)
         * Lower priority is better
         * Higher weight is better
         */

        /** @type {DRP_ServiceTableEntry} */
        let bestServiceEntry = null;
        let candidateList = [];

        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];

            // Skip if the service isn't ready
            if (serviceTableEntry.Status !== 1) continue;

            // Skip if the service name doesn't match
            if (serviceName !== serviceTableEntry.Name) continue;

            // Skip if the zone is specified and doesn't match
            if (zone && zone !== serviceTableEntry.Zone) continue;

            // If this is the first candidate, set it and go
            if (!bestServiceEntry) {
                bestServiceEntry = serviceTableEntry;
                candidateList = [bestServiceEntry];
                continue;
            }

            // Check this against the current bestServiceEntry

            // Better zone?
            if (!zone && bestServiceEntry.Zone !== thisTopologyTracker.drpNode.Zone && serviceTableEntry.Zone === thisTopologyTracker.drpNode.Zone) {
                bestServiceEntry = serviceTableEntry;
                candidateList = [bestServiceEntry];
                continue;
            }

            // Lower Priority?
            if (bestServiceEntry.Priority > serviceTableEntry.Priority) {
                bestServiceEntry = serviceTableEntry;
                candidateList = [bestServiceEntry];
                continue;
            }

            // Weighted?
            if (bestServiceEntry.Priority === serviceTableEntry.Priority) {
                candidateList.push(serviceTableEntry);
            }
        }

        // Did we find a match?
        if (candidateList.length === 1) {
            // Single match
        } else if (candidateList.length > 1) {
            // Multiple matches; select based on weight

            // Multiply elements by its weight and create new array
            let weight = function (arr) {
                return [].concat(...arr.map((obj) => Array(obj.Weight).fill(obj)));
            };

            let pick = function (arr) {
                let weighted = weight(arr);
                return weighted[Math.floor(Math.random() * weighted.length)];
            };

            bestServiceEntry = pick(candidateList);
            thisTopologyTracker.drpNode.log(`Need service [${serviceName}], randomly selected [${bestServiceEntry.InstanceID}]`, true);
        }

        return bestServiceEntry;
    }

    /**
     * Get the local registry
     * @param {string} requestingNodeID Node ID requesting the registry
     * @returns {DRP_TopologyTracker} Returns node & service entries
     */
    GetRegistry(requestingNodeID) {
        let thisTopologyTracker = this;

        let returnNodeTable = thisTopologyTracker.NodeTable;
        let returnServiceTable = thisTopologyTracker.ServiceTable;

        // If a reqNodeID is specified, do NOT return entries learned from that node
        if (requestingNodeID) {
            try {
                returnNodeTable = Object.assign({}, ...
                    Object.entries(thisTopologyTracker.NodeTable).filter(([k, v]) => v.LearnedFrom !== requestingNodeID).map(([k, v]) => ({ [k]: v }))
                );
                returnServiceTable = Object.assign({}, ...
                    Object.entries(thisTopologyTracker.ServiceTable).filter(([k, v]) => v.LearnedFrom !== requestingNodeID).map(([k, v]) => ({ [k]: v }))
                );
                //returnNodeTable = Object.fromEntries(Object.entries(thisTopologyTracker.NodeTable).filter(([k, v]) => v.LearnedFrom !== requestingNodeID));
                //returnServiceTable = Object.fromEntries(Object.entries(thisTopologyTracker.ServiceTable).filter(([k, v]) => v.LearnedFrom !== requestingNodeID));
            } catch (ex) {
                thisTopologyTracker.drpNode.log(`Exception while getting subset of Registry: ${ex}`);
            }
        }

        let returnObj = {
            NodeTable: returnNodeTable,
            ServiceTable: returnServiceTable
        };
        return returnObj;
    }

    async ProcessNodeConnect(sourceEndpoint, declaration, localNodeIsProxy) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.drpNode;
        let returnData = await sourceEndpoint.SendCmd("DRP", "getRegistry", { "reqNodeID": thisNode.nodeID }, true, null, null);
        let remoteRegistry = returnData.payload;

        // Import
        let nodeIDList = Object.keys(remoteRegistry.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            /** @type {DRP_NodeTableEntry} */
            let thisNodeEntry = remoteRegistry.NodeTable[nodeIDList[i]];
            if (localNodeIsProxy) thisNodeEntry.ProxyNodeID = thisNode.nodeID;
            let nodeAddPacket = new DRP_TopologyPacket(declaration.NodeID, "add", "node", thisNodeEntry.NodeID, thisNodeEntry.Scope, thisNodeEntry.Zone, thisNodeEntry);
            thisNode.TopologyTracker.ProcessPacket(nodeAddPacket, sourceEndpoint.EndpointID);
        }

        let serviceIDList = Object.keys(remoteRegistry.ServiceTable);
        for (let i = 0; i < serviceIDList.length; i++) {
            /** @type {DRP_ServiceTableEntry} */
            let thisServiceEntry = remoteRegistry.ServiceTable[serviceIDList[i]];
            if (localNodeIsProxy) thisServiceEntry.ProxyNodeID = thisNode.nodeID;
            let serviceAddPacket = new DRP_TopologyPacket(declaration.NodeID, "add", "service", thisServiceEntry.InstanceID, thisServiceEntry.Scope, thisServiceEntry.Zone, thisServiceEntry);
            thisNode.TopologyTracker.ProcessPacket(serviceAddPacket, sourceEndpoint.EndpointID);
        }
    }

    ProcessNodeDisconnect(disconnectedNodeID) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.drpNode;
        // Remove node; this should trigger an autoremoval of entries learned from it

        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            /** @type {DRP_NodeTableEntry} */
            let thisNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
            if (thisNodeEntry.LearnedFrom === disconnectedNodeID) {
                let nodeDeletePacket = new DRP_TopologyPacket(thisNode.nodeID, "delete", "node", thisNodeEntry.NodeID, thisNodeEntry.Scope, thisNodeEntry.Zone, thisNodeEntry);
                thisTopologyTracker.ProcessPacket(nodeDeletePacket, thisNode.nodeID);
            }
        }

        let serviceIDList = Object.keys(thisTopologyTracker.ServiceTable);
        for (let i = 0; i < serviceIDList.length; i++) {
            /** @type {DRP_ServiceTableEntry} */
            let thisServiceEntry = thisTopologyTracker.ServiceTable[serviceIDList[i]];
            if (thisServiceEntry.LearnedFrom === disconnectedNodeID) {
                let serviceDeletePacket = new DRP_TopologyPacket(thisNode.nodeID, "delete", "service", thisServiceEntry.InstanceID, thisServiceEntry.Scope, thisServiceEntry.Zone, thisServiceEntry);
                thisTopologyTracker.ProcessPacket(serviceDeletePacket, thisNode.nodeID);
            }
        }
    }

    /**
     * Get next hop for relaying a command
     * @param {string} targetNodeID Node ID we're ultimately trying to reach
     * @returns {string} Node ID of next hop
     */
    GetNextHop(targetNodeID) {
        let thisTopologyTracker = this;
        let nextHopNodeID = null;
        let targetNodeEntry = thisTopologyTracker.NodeTable[targetNodeID];
        if (targetNodeEntry) nextHopNodeID = targetNodeEntry.LearnedFrom;
        return nextHopNodeID;
    }

    ValidateNodeID(checkNodeID) {
        let thisTopologyTracker = this;
        if (thisTopologyTracker.NodeTable[checkNodeID])
            return true;
        else
            return false;
    }
}

class DRP_NodeTable {
    /**
     * Add Node Table Entry
     * @param {string} entryID New table entry ID
     * @param {DRP_NodeTableEntry} entryData New table entry data
     */
    AddEntry(entryID, entryData) {
        let thisTable = this;
        let newTableRecord = new DRP_NodeTableEntry();
        Object.assign(newTableRecord, entryData);
        thisTable[entryID] = newTableRecord;
    }

    UpdateEntry(entryID, updateData) {
        let thisTable = this;
        Object.assign(thisTable[entryID], updateData);
    }
}

// Details of Node
class DRP_NodeTableEntry {
    /**
     * 
     * @param {string} nodeID Node ID
     * @param {string} proxyNodeID Proxy Node ID
     * @param {string[]} roles Roles
     * @param {string} nodeURL Node URL
     * @param {string} nodeScope Node Scope
     * @param {string} nodeZone Node Zone
     * @param {string} lastSeen Last seen
     * @param {string} learnedFrom NodeID that sent us this record
     */
    constructor(nodeID, proxyNodeID, roles, nodeURL, nodeScope, nodeZone, lastSeen, learnedFrom) {
        this.NodeID = nodeID;
        this.ProxyNodeID = proxyNodeID;
        this.Roles = roles;
        this.NodeURL = nodeURL;
        this.Scope = nodeScope;
        this.Zone = nodeZone;
        this.LastSeen = lastSeen;
        this.LearnedFrom = learnedFrom;
    }

    IsRegistry() {
        let thisNodeTableEntry = this;
        let isRegistry = thisNodeTableEntry.Roles.indexOf("Registry") >= 0;
        return isRegistry;
    }
}

class DRP_ServiceTable {
    /**
     * Add Service Table Entry
     * @param {string} entryID New table entry ID
     * @param {DRP_ServiceTableEntry} entryData New table entry data
     */
    AddEntry(entryID, entryData) {
        let thisTable = this;
        let newTableRecord = new DRP_ServiceTableEntry();
        Object.assign(newTableRecord, entryData);
        thisTable[entryID] = newTableRecord;
    }

    UpdateEntry(entryID, updateData) {
        let thisTable = this;
        Object.assign(thisTable[entryID], updateData);
    }
}

class DRP_ServiceTableEntry {
    /**
     * 
     * @param {string} nodeID Origin Node ID
     * @param {string} proxyNodeID Proxy Node ID
     * @param {string} serviceName Name of service
     * @param {string} serviceType Type of service
     * @param {string} instanceID Global Instance ID
     * @param {string} serviceZone Service Zone
     * @param {boolean} serviceSticky Service sticky
     * @param {number} servicePriority Service priority
     * @param {number} serviceWeight Service weight
     * @param {string} serviceScope Service scope (Local|Zone|Global)
     * @param {string} serviceDependencies Services required for this one to operate
     * @param {number} serviceStatus Service status (0 down|1 up|2 pending)
     * @param {string} learnedFrom NodeID that sent us this record
     */
    constructor(nodeID, proxyNodeID, serviceName, serviceType, instanceID, serviceZone, serviceSticky, servicePriority, serviceWeight, serviceScope, serviceDependencies, serviceStatus, learnedFrom) {
        this.NodeID = nodeID;
        this.ProxyNodeID = proxyNodeID;
        this.Name = serviceName;
        this.Type = serviceType;
        this.InstanceID = instanceID;
        this.Zone = serviceZone;
        this.Sticky = serviceSticky;
        this.Priority = servicePriority;
        this.Weight = serviceWeight;
        this.Scope = serviceScope || "zone";
        this.Dependencies = serviceDependencies || [];
        this.Status = serviceStatus;
        this.LearnedFrom = learnedFrom;
    }
}

class DRP_TopologyPacket {
    /**
     * 
     * @param {string} originNodeID Source Node ID
     * @param {string} cmd Command [Add|Update|Delete]
     * @param {string} type Object Type [Node|Service]
     * @param {string} id Object ID
     * @param {string} scope Object Scope [Zone|Global]
     * @param {string} zone Object Zone Name [MyZone1,MyZone2,etc]
     * @param {object} data Data
     */
    constructor(originNodeID, cmd, type, id, scope, zone, data) {
        this.originNodeID = originNodeID;
        this.cmd = cmd;
        this.type = type;
        this.id = id;
        this.scope = scope;
        this.zone = zone;
        this.data = data;
    }
}

module.exports = DRP_Node;