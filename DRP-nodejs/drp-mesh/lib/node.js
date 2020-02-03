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
const DRP_Command = require('./command');

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
     * @param {string} nodeURL Listening URL (optional)
     * @param {{string:object}} streams Provided Streams
     * @param {{string:object}} services Provided services
     * @param {string} domainKey Domain Key
     * @param {string} zoneName Zone Name
     */
    constructor(nodeID, nodeRoles, nodeURL, streams, services, domainKey, zoneName) {
        this.NodeID = nodeID;
        this.NodeRoles = nodeRoles;
        this.NodeURL = nodeURL;
        this.Streams = streams || {};
        this.Services = services || {};
        this.DomainKey = domainKey;
        this.ZoneName = zoneName;
    }
}

class DRP_Node {
    /**
     * 
     * @param {string[]} nodeRoles List of Roles: Broker, Provider, Registry
     * @param {DRP_WebServer} webServer Web server (optional)
     * @param {string} drpRoute DRP WS Route (optional)
     * @param {string} nodeURL Node WS URL (optional)
     * @param {string} webProxyURL Web Proxy URL (optional)
     * @param {string} domainName DRP Domain Name (optional)
     * @param {string} domainKey DRP Domain Key (optional)
     * @param {string} zoneName DRP Zone Name (optional)
     */
    constructor(nodeRoles, webServer, drpRoute, nodeURL, webProxyURL, domainName, domainKey, zoneName) {
        let thisNode = this;
        this.nodeID = `${os.hostname()}-${process.pid}-${getRandomInt(9999)}`;
        this.WebServer = webServer || null;
        this.drpRoute = drpRoute || "/";
        this.DomainName = domainName;
        this.DomainKey = domainKey;
        this.ZoneName = zoneName;
        this.nodeURL = null;
        if (this.WebServer && this.WebServer.expressApp) {
            this.nodeURL = nodeURL;
        }
        this.nodeRoles = nodeRoles || [];
        this.webProxyURL = webProxyURL || null;
        /** @type {{string:DRP_NodeDeclaration}} */
        this.NodeDeclarations = {};
        /** @type {{string:DRP_NodeClient}} */
        this.NodeEndpoints = {};
        /** @type {{string:DRP_NodeClient}} */
        this.ConsumerEndpoints = {};
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

        this.NodeDeclaration = new DRP_NodeDeclaration(this.nodeID, this.nodeRoles, this.nodeURL);

        /** @type {{string:DRP_Subscription}} */
        this.Subscriptions = {};

        // Create topic manager
        this.TopicManager = new DRP_TopicManager(this);

        // If this is a Registry, seed the Registry with it's own declaration
        if (thisNode.IsRegistry()) {
            this.AddStream("RegistryUpdate", "Registry updates");
            this.RegisterNode(this.NodeDeclaration);

            if (this.DomainName) {
                // A domain name was provided; attempt to cluster with other registry hosts
                this.ConnectToOtherRegistries();
            }
        }

        // Add a route handler even if we don't have an Express server (needed for stream relays)
        this.RouteHandler = new DRP_RouteHandler(this, this.drpRoute);
    }
    log(message) {
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

    ListServiceInstances(params) {
        let results = {};
        let findServiceName = params;
        let providerNames = Object.keys(this.NodeDeclarations);
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = this.NodeDeclarations[providerName];
            // Loop over Services
            if (!thisNodeDeclaration.Services) continue;
            let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
            for (let j = 0; j < serviceInstanceList.length; j++) {
                let serviceInstanceID = serviceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let serviceInstanceObj = thisNodeDeclaration.Services[serviceInstanceID];
                if (!results[serviceInstanceID]) results[serviceInstanceID] = {
                    providers: [],
                    Classes: serviceInstanceObj.Classes,
                    ClientCmds: serviceInstanceObj.ClientCmds
                };

                results[serviceInstanceID].providers.push(providerName);
            }
        }
        return results;
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
                            thisNode.log(`Could not verify node connection for [${remoteNodeID}]`);
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
                            let results = await targetEndpoint.SendCmd(targetEndpoint, "DRP", params.method, params, true, null);
                            if (results && results.payload && results.payload) {
                                oReturnObject = results.payload;
                            }
                        } else {
                            thisNode.log(`Could not verify consumer connection for [${agentID}]`);
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
                Registry: thisNode.NodeDeclarations,
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

                        let serviceInstanceID = remainingChildPath.shift();

                        params.pathList = ['Services', serviceInstanceID].concat(remainingChildPath);

                        let serviceInstanceProviders = thisNode.FindProvidersForService(serviceInstanceID);
                        let targetNodeID = serviceInstanceProviders[0];

                        if (targetNodeID === thisNode.nodeID) {
                            // The target NodeID is local
                            oReturnObject = thisNode.GetObjFromPath(params, thisNode.GetBaseObj());
                        } else {
                            // The target NodeID is remote
                            // TODO - Add support for routing through Broker (copy from ServiceCommand logic?)
                            let targetNodeObj = await thisNode.VerifyNodeConnection(targetNodeID);
                            if (targetNodeObj) {
                                let cmdResponse = await targetNodeObj.SendCmd("DRP", "pathCmd", params, true, null);
                                if (cmdResponse.payload) {
                                    oReturnObject = cmdResponse.payload;
                                }
                            }
                        }

                    } else {
                        // Return list of Services
                        let providerNames = Object.keys(thisNode.NodeDeclarations);
                        for (let i = 0; i < providerNames.length; i++) {
                            let providerName = providerNames[i];
                            let thisNodeDeclaration = thisNode.NodeDeclarations[providerName];
                            // Loop over Services
                            if (!thisNodeDeclaration.Services) continue;
                            let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
                            for (let j = 0; j < serviceInstanceList.length; j++) {
                                let serviceInstanceID = serviceInstanceList[j];
                                if (!oReturnObject[serviceInstanceID]) oReturnObject[serviceInstanceID] = {
                                    "ServiceName": serviceInstanceID,
                                    "Providers": []
                                };

                                oReturnObject[serviceInstanceID].Providers.push(providerName);
                            }
                        }
                    }
                    return oReturnObject;
                }
            }
        };
    }

    /**
     * Find Providers for a given Service Instance
     * @param {string} serviceInstanceID Service Instance to find
     * @returns {string[]} List of Providers offering Service
     */
    FindProvidersForService(serviceInstanceID) {
        let thisNode = this;
        let myRegistry = thisNode.NodeDeclarations;
        let providerList = [];

        let providerNames = Object.keys(myRegistry);

        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let thisNodeDeclaration = myRegistry[providerName];
            // Loop over Services
            if (!thisNodeDeclaration.Services) continue;
            let serviceInstanceList = Object.keys(thisNodeDeclaration.Services);
            for (let j = 0; j < serviceInstanceList.length; j++) {
                if (serviceInstanceID === serviceInstanceList[j]) {
                    providerList.push(providerName);
                }
            }
        }
        return providerList;
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

    GetRegistryNodeIDs() {
        let thisNode = this;
        let registryNodeIDList = [];
        let nodeIDlist = Object.keys(thisNode.NodeDeclarations);
        for (let i = 0; i < nodeIDlist.length; i++) {
            let thisNodeID = nodeIDlist[i];
            /** @type DRP_NodeDeclaration */
            let thisNodeDeclaration = thisNode.NodeDeclarations[thisNodeID];
            if (thisNodeDeclaration.NodeRoles.indexOf("Registry") >= 0) {
                registryNodeIDList.push(thisNodeID);
            }
        }
        return registryNodeIDList;
    }

    async SendToRegistries(cmd, params) {
        let thisNode = this;
        let registryNodeIDList = thisNode.GetRegistryNodeIDs();
        for (let i = 0; i < registryNodeIDList.length; i++) {
            /** @type DRP_NodeClient */
            let thisRegistryNodeEndpoint = thisNode.NodeEndpoints[registryNodeIDList[i]];
            if (thisRegistryNodeEndpoint) {
                thisRegistryNodeEndpoint.SendCmd("DRP", cmd, params, false, null);
            }
        }
    }

    /**
     * 
     * @param {string} remoteNodeID NodeID to connect to
     * @returns {DRP_Endpoint} DRP Node Endpoint
     */
    async VerifyNodeConnection(remoteNodeID) {

        let thisNode = this;

        /** @type DRP_NodeDeclaration */
        let thisNodeDeclaration = thisNode.NodeDeclarations[remoteNodeID];
        if (!thisNodeDeclaration) return null;

        /** @type {DRP_Endpoint} */
        let thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];

        // Try connecting to the remote node
        if (!thisNodeEndpoint && thisNodeDeclaration.NodeURL) {
            let targetNodeURL = thisNodeDeclaration.NodeURL;

            // If we have a valid target URL, wait a few seconds for connection to initiate
            if (targetNodeURL) {
                thisNode.log(`Connecting to Node [${remoteNodeID}] @ '${targetNodeURL}'`);
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
        }

        // Try sending a back connection request to the remote node via the registry
        if (!thisNodeEndpoint || !thisNodeEndpoint.IsReady()) {

            thisNode.log("Sending back request...");
            // Let's try having the Provider call us; send command through Registry
            try {
                // Get registry connection, can have multiple registries.  Pick the first one.
                let registryNodeIDList = thisNode.GetRegistryNodeIDs();
                for (let i = 0; i < registryNodeIDList.length; i++) {
                    /** @type DRP_NodeClient */
                    let registryNodeEndpoint = thisNode.NodeEndpoints[registryNodeIDList[i]];
                    registryNodeEndpoint.SendCmd("DRP", "connectToNode", { "targetNodeID": remoteNodeID, "sourceNodeID": thisNode.nodeID, "wsTarget": thisNode.nodeURL }, false, null);
                    break;
                }
            } catch (err) {
                this.log(`ERR!!!! [${err}]`);
            }

            this.log("Starting wait...");
            // Wait a few seconds
            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                    // Yes - wait
                    await sleep(100);
                } else {
                    // No - break the for loop
                    thisNode.log(`Received back connection from remote node [${remoteNodeID}]`);
                    i = 50;
                }
            }

            // If still not successful, return DRP_NodeClient
            if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                thisNode.log(`Could not open connection to Node [${remoteNodeID}]`);
                if (thisNode.NodeEndpoints[remoteNodeID]) {
                    delete thisNode.NodeEndpoints[remoteNodeID];
                }
                //throw new Error(`Could not get connection to Provider ${remoteNodeID}`);
            } else {
                thisNodeEndpoint = thisNode.NodeEndpoints[remoteNodeID];
            }
        }

        if (thisNodeEndpoint) {
            thisNodeEndpoint.drpNode = thisNode;
            thisNodeEndpoint.closeCallback = () => {
                // See if this endpoints was referenced in any subscriptions
                let remoteNodeID = thisNodeEndpoint.EndpointID;
                let subscriptionList = Object.keys(thisNode.Subscriptions);
                for (let i = 0; i < subscriptionList.length; i++) {
                    /** @type {DRP_Subscription} */
                    let subscriptionObject = thisNode.Subscriptions[subscriptionList[i]];
                    if (subscriptionObject.subscribedTo.indexOf(remoteNodeID) >= 0) {
                        // Remove from subcribedTo
                        subscriptionObject.subscribedTo.splice(subscriptionObject.subscribedTo.indexOf(remoteNodeID), 1);
                    }
                }
            };
        }

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
     * @param {boolean} quietAdd Flag to disable advertisement after add
     */
    async AddService(serviceObj, quietAdd) {
        let thisNode = this;
        if (serviceObj && serviceObj.serviceName && serviceObj.ClientCmds) {
            thisNode.Services[serviceObj.serviceName] = serviceObj;
            if (thisNode.NodeDeclaration) {
                thisNode.NodeDeclaration.Services[serviceObj.serviceName] = {
                    "ClientCmds": Object.keys(serviceObj.ClientCmds),
                    "Classes": Object.keys(serviceObj.Classes),
                    "Persistence": serviceObj.Persistence || false,
                    "Weight": serviceObj.Weight || 0,
                    "Zone": serviceObj.Zone || null
                };

                if (!quietAdd) thisNode.SendToRegistries("registerNode", thisNode.NodeDeclaration);
            }
        }
    }

    async RemoveService(serviceName) {
        let thisNode = this;
        if (serviceName && thisNode.NodeDeclaration.Services[serviceName]) {
            delete this.NodeDeclaration.Services[serviceName];
        }

        thisNode.SendToRegistries("registerNode", thisNode.NodeDeclaration);
    }

    AddStream(streamName, streamDescription) {
        let thisNode = this;
        if (streamName && streamDescription) {
            thisNode.NodeDeclaration.Streams[streamName] = streamDescription;
            thisNode.SendToRegistries("registerNode", thisNode.NodeDeclaration);
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
     * @param {DRP_Command} cmdObj Command object
     * @param {DRP_Endpoint} drpEndpoint Requesting Endpoint
     * @param {string} token Reply token
     * @return {object} Response
    */
    async LocalServiceCommand(cmdObj, drpEndpoint, token) {
        let thisNode = this;
        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            thisNode.log(`${baseMsg} params not supplied`);
            return null;
        }
        if (!cmdObj.serviceName) {
            thisNode.log(`${baseMsg} params.serviceName not supplied`);
            return null;
        }
        if (!cmdObj.cmd) {
            thisNode.log(`${baseMsg} params.method not supplied`);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName]) {
            thisNode.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
            return null;
        }
        if (!thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd]) {
            thisNode.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
            return null;
        }
        return await thisNode.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd](cmdObj.params, drpEndpoint);
    }

    /**
     * @param {DRP_Command} cmdObj Command object
     * @param {DRP_Endpoint} sourceEndpoint Requesting Endpoint
     * @param {string} token Reply token
     * @return {object} Response
    */
    async ServiceCommand(cmdObj, sourceEndpoint, token) {
        let thisNode = this;

        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            this.log(`${baseMsg} cmdObj not supplied`);
            return null;
        }
        if (!cmdObj.serviceName) {
            this.log(`${baseMsg} cmdObj.serviceName not supplied`);
            return null;
        }
        if (!cmdObj.cmd) {
            this.log(`${baseMsg} cmdObj.cmd not supplied`);
            return null;
        }

        // Do we offer this service?
        if (thisNode.Services[cmdObj.serviceName]) {
            let results = await thisNode.LocalServiceCommand(cmdObj, sourceEndpoint);
            return results;
        } else {

            let targetNodeID = null;

            // Are we specifying which provider to run this through?
            if (cmdObj.targetNodeID) {
                targetNodeID = cmdObj.targetNodeID;
                if (!this.NodeDeclarations[targetNodeID]) {
                    this.log(`${baseMsg} node ${targetNodeID} does not exist`);
                    return null;
                }
            } else {
                // Loop over providers
                // TODO - implement load balancing, prioritization & zoning mechanism
                let providerNames = Object.keys(this.NodeDeclarations);
                for (let i = 0; i < providerNames.length; i++) {
                    let thisProviderName = providerNames[i];

                    // Does this provider offer the service we need?
                    if (this.NodeDeclarations[thisProviderName].Services && this.NodeDeclarations[thisProviderName].Services[cmdObj.serviceName]) {

                        // Yes - pick this one
                        targetNodeID = thisProviderName;
                    }
                }

                // Did we find a provider with this service?
                if (!targetNodeID) {
                    // No suitable provider found
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
                    console.dir(cmdObj);
                    return null;
                }
            }

            // Does this provider offer the service we need?
            if (this.NodeDeclarations[targetNodeID].Services && this.NodeDeclarations[targetNodeID].Services[cmdObj.serviceName]) {
                let checkService = this.NodeDeclarations[targetNodeID].Services[cmdObj.serviceName];

                // Does the service offer the command we want to execute?
                if (checkService["ClientCmds"].includes(cmdObj.cmd)) {

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
                        let results = await thisNodeClient.SendCmd(cmdObj.serviceName, cmdObj.cmd, cmdObj.params, true, null);
                        if (results && results.payload && results.payload) {
                            returnObj = results.payload;
                        }
                        return returnObj;
                    } else return null;
                } else {
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
                    return null;
                }
            }
        }
    }

    /**
    * 
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
            thisNode.log(`Remote node client sent Hello [${declaration.NodeID}]`);

            // If this Node has a domain key, the remote node needs to match
            if (thisNode.DomainKey) {
                if (!declaration.DomainKey || declaration.DomainKey !== thisNode.DomainKey) {
                    // The remote node did not offer a DomainKey or the key does not match
                    thisNode.log(`Node [${declaration.NodeID}] DomainKey is not correct: ${declaration.DomainKey}`);
                    sourceEndpoint.Close();
                }
            }

            // TODO - Added due to race condition; a broker which provides may gets connection requests after connection to the registry but before getting
            // registry declarations.  Instead of doing this, we SHOULD put a marker in that says whether or not we've received an intial copy of the registry
            if (!thisNode.IsRegistry() && declaration.NodeID) {
                for (let i = 0; i < 5; i++) {
                    if (!thisNode.NodeDeclarations[declaration.NodeID]) {
                        // wait for a second...
                        await sleep(1000);
                    }
                }
            }

            if (!declaration.NodeID) {
                // Invalid NodeID
                thisNode.log("Declaration did not include a valid NodeID");
                sourceEndpoint.Close();
            } else if (!thisNode.IsRegistry() && !thisNode.NodeDeclarations[declaration.NodeID]) {
                // This host isn't a registry and doesn't recognize the provided NodeID
                thisNode.log(`Node [${declaration.NodeID}] tried to register to a non-registry Broker`);
                sourceEndpoint.Close();
            } else {
                // Allow the registration
                sourceEndpoint.EndpointID = declaration.NodeID;
                thisNode.NodeEndpoints[declaration.NodeID] = sourceEndpoint;
                thisNode.RegisterNode(declaration);
            }
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
        }
        else results = "INVALID DECLARATION";

        return results;
    }

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

        // If this is a registry node, tag the connection and relay to other nodes
        if (thisNode.IsRegistry()) {
            thisNode.RelayNodeChange("registerNode", declaration);
        }

        thisNode.NodeDeclarations[declaration.NodeID] = declaration;

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

    async UnregisterNode(nodeID) {
        // Delete node
        let thisNode = this;
        thisNode.log(`Unregistering node [${nodeID}]`);
        delete thisNode.NodeEndpoints[nodeID];
        delete thisNode.NodeDeclarations[nodeID];
        thisNode.TopicManager.SendToTopic("RegistryUpdate", { "action": "unregister", "nodeID": nodeID });
        if (thisNode.IsRegistry()) {
            // TODO - If the disconnected node was a registry, remove nodes it advertised (same for future proxy node role)

            // TODO - UPDATE DECLARATIONS TO INCLUDE SUPPORT FOR MULTIPLE NODES

            // Relay changes to other nodes
            thisNode.RelayNodeChange("unregisterNode", nodeID);
        }
    }

    RelayNodeChange(cmd, params) {
        // Relay to Nodes
        let thisNode = this;
        let nodeIDList = Object.keys(thisNode.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {
            thisNode.NodeEndpoints[nodeIDList[i]].SendCmd("DRP", cmd, params, false, null);
            thisNode.log(`Relayed to node: [${nodeIDList[i]}]`);
        }
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
                    thisNode.log(ex);
                }
            })
        );
    }

    /**
     * 
     * @param {string} registryURL DRP Domain FQDN
     * @param {function} openCallback Callback after open
     */
    async ConnectToRegistry(registryURL, openCallback) {
        let thisNode = this;
        // Initiate Registry Connection
        let nodeClient = new DRP_NodeClient(registryURL, thisNode.webProxyURL, thisNode, null, true, async function (response) {

            // Get peer info
            let getDeclarationResponse = await nodeClient.SendCmd("DRP", "getNodeDeclaration", null, true, null);
            if (getDeclarationResponse && getDeclarationResponse.payload && getDeclarationResponse.payload.NodeID) {
                let registryNodeID = getDeclarationResponse.payload.NodeID;
                nodeClient.EndpointID = registryNodeID;
                thisNode.NodeEndpoints[registryNodeID] = nodeClient;
            }

            // Get Registry
            let getRegistryResponse = await nodeClient.SendCmd("DRP", "getRegistry", null, true, null);
            thisNode.NodeDeclarations = getRegistryResponse.payload;
            if (openCallback && typeof openCallback === 'function') {
                openCallback(response);
            }

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

    /**
     * 
     * @param {string} domainName DRP Domain FQDN
     * @param {function} openCallback Callback after open
     */
    async ConnectToRegistryByDomain(domainName, openCallback) {
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
                thisNode.ConnectToRegistry(registryURL, openCallback);
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
                    let portString = closestRegistry.port.toString();
                    let checkString = portString.slice(-3, 3);
                    if (checkString === "44") {
                        protocol = "wss";
                    }
                    // Connect to target
                    let registryURL = `${protocol}://${checkRegistry.name}:${checkRegistry.port}`;
                    thisNode.ConnectToRegistry(registryURL, openCallback);
                }
            }

        } catch (ex) {
            thisNode.log(`Error resolving DNS: ${ex}`);
        }
    }

    async ConnectToNode(params) {
        let thisNode = this;
        let returnCode = 0;
        // Is the message meant for this Node?
        if (params.targetNodeID === thisNode.nodeID) {
            // Initiate Node Connection
            if (thisNode.NodeEndpoints[params.sourceNodeID]) {
                // We already have this NodeEndpoint registered.
                // TODO - Determine if this is a new connection in progress or a stale disconnected session
                thisNode.log(`Received back request, already have NodeEndpoints[${params.sourceNodeID}]`);
            } else {
                thisNode.log(`Received back request, connecting to [${params.sourceNodeID}] @ ${params.wsTarget}`);
                thisNode.NodeEndpoints[params.sourceNodeID] = new DRP_NodeClient(params.wsTarget, thisNode.webProxyURL, thisNode, params.sourceNodeID, false);
            }
        } else {
            // Are we connected to the target node?  If so, relay
            if (thisNode.NodeEndpoints[params.targetNodeID]) {
                thisNode.log(`Received back request from [${params.sourceNodeID}] @ ${params.wsTarget}, relaying to [${params.targetNodeID}]`);
                thisNode.NodeEndpoints[params.targetNodeID].SendCmd("DRP", "connectToNode", params, false, null);
            } else {
                // We are not connected to the target (FUTURE - Add node routing table)
                thisNode.log(`Received back request from [${params.sourceNodeID}] @ ${params.wsTarget}, not connected to [${params.targetNodeID}]`);
            }
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

    async GetTopology() {
        let thisNode = this;
        let topologyObj = {};
        // We need to get a list of all nodes from the registry
        let nodeIDList = Object.keys(thisNode.NodeDeclarations);
        for (let i = 0; i < nodeIDList.length; i++) {
            let nodeID = nodeIDList[i];
            /** @type DRP_NodeDeclaration */
            let nodeDeclaration = thisNode.NodeDeclarations[nodeID];
            let topologyNode = {};
            if (nodeID === thisNode.nodeID) {
                topologyNode = thisNode.ListClientConnections();
            } else {
                // Send a command to each node to get the list of client connections
                let nodeConnection = await thisNode.VerifyNodeConnection(nodeID);
                let cmdResponse = await nodeConnection.SendCmd("DRP", "listClientConnections", null, true, null);
                topologyNode = cmdResponse.payload;
            }

            // Append Roles and Listening URL
            topologyNode.roles = nodeDeclaration.NodeRoles;
            topologyNode.url = nodeDeclaration.NodeURL;
            topologyNode.services = Object.keys(nodeDeclaration.Services);

            // Add to hash
            topologyObj[nodeID] = topologyNode;

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

        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("registerNode", "RegisterNode");
        this.RegisterCmd("unregisterNode", "UnregisterNode");
        this.RegisterCmd("getNodeDeclaration", "GetNodeDeclaration");
        this.RegisterCmd("pathCmd", async function (params, token) {
            return await drpNode.GetObjFromPath(params, drpNode.GetBaseObj());
        });
        this.RegisterCmd("connectToNode", async function (...args) {
            drpNode.ConnectToNode(...args);
        });
        this.RegisterCmd("getTopology", async function (...args) {
            return await drpNode.GetTopology(...args);
        });
        this.RegisterCmd("listClientConnections", function (...args) {
            return drpNode.ListClientConnections(...args);
        });
        this.RegisterCmd("sendToTopic", function (params) {
            drpNode.TopicManager.SendToTopic(params.topicName, params.topicData);
        });
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
        this.log("Node client [" + thisEndpoint.RemoteAddress() + ":" + thisEndpoint.RemotePort() + "] closed with code [" + closeCode + "]");

        switch (thisEndpoint.EndpointType) {
            case "Node":
                thisEndpoint.drpNode.UnregisterNode(thisEndpoint.EndpointID);
                break;
            case "Consumer":
                thisEndpoint.drpNode.ConsumerEndpoints[thisEndpoint.EndpointID];
                break;
            default:
        }

        if (this.closeCallback && typeof this.closeCallback === 'function') {
            this.closeCallback();
        }
        if (this.retryOnClose) {
            await sleep(5000);
            this.RetryConnection();
        }
    }

    async ErrorHandler(error) {
        this.drpNode.log("Node client encountered error [" + error + "]");
    }

    async GetNodeDeclaration() {
        return this.drpNode.NodeDeclaration;
    }

    async RegisterNode(params) {
        return this.drpNode.RegisterNode(params);
    }

    async UnregisterNode(params) {
        return this.drpNode.UnregisterNode(params);
    }

}

module.exports = DRP_Node;