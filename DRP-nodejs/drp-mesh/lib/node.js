'use strict';

const os = require('os');
const util = require('util');
const tcpp = require('tcp-ping');
const tcpPing = util.promisify(tcpp.ping);
const ping = require('ping');
const dns = require('dns').promises;
const express = require('express');
const DRP_Endpoint = require("./endpoint");
const DRP_Client = require("./client");
const DRP_Service = require("./service");
const { DRP_TopicManager, DRP_TopicManager_Topic } = require("./topicmanager");
const DRP_RouteHandler = require("./routehandler");
const { DRP_MethodParams, DRP_GetParams } = require("./params");
const { DRP_WebServer, DRP_WebServerConfig } = require("./webserver");
const { DRP_SubscribableSource, DRP_Subscriber } = require('./subscription');
const { DRP_AuthRequest, DRP_AuthResponse, DRP_AuthFunction, DRP_AuthInfo } = require('./auth');
const { DRP_Packet, DRP_Cmd, DRP_Reply, DRP_Stream, DRP_RouteOptions, DRP_CmdError, DRP_ErrorCode } = require('./packet');
const { DRP_Permission, DRP_PermissionSet, DRP_Securable, DRP_VirtualFunction, DRP_VirtualDirectory } = require('./securable');
const Express_Request = express.request;
const Express_Response = express.response;
const { v4: uuidv4 } = require('uuid');
const DRPVersion = "1.0.5"

class DRP_RemotePath {
    /**
     * Create a reference to a remote path
     * @param {DRP_Node} localNode
     * @param {string} targetNodeID
     * @param {DRP_MethodParams} params
     */
    constructor(localNode, targetNodeID) {
        this.localNode = localNode;
        this.targetNodeID = targetNodeID;
    }
    /**
     * Send pathCmd to remote node
     * @param {DRP_MethodParams} params
     */
    async CallPath(params) {
        let returnObj = await this.localNode.SendPathCmdToNode(this.targetNodeID, params);
        return returnObj;
    }
}

class DRP_NodeDeclaration {
    /**
     * 
     * @param {string} nodeID Node ID
     * @param {string[]} nodeRoles Functional Roles ['Registry','Broker','Portal','Provider','Producer','Sidecar','Logger']
     * @param {string} hostID Host Identifier
     * @param {string} nodeURL Listening URL (optional)
     * @param {string} domainName Domain Name
     * @param {string} meshKey Domain Key
     * @param {string} zoneName Zone Name
     * @param {string} scope Scope
     */
    constructor(nodeID, nodeRoles, hostID, nodeURL, domainName, meshKey, zoneName, scope) {
        this.NodeID = nodeID;
        this.NodeRoles = nodeRoles;
        this.HostID = hostID;
        this.NodeURL = nodeURL;
        this.DomainName = domainName;
        this.MeshKey = meshKey;
        this.Zone = zoneName;
        this.Scope = scope;
    }
}

class DRP_Node extends DRP_Securable {
    #MeshKey
    #debug
    #registrySet
    #useSwagger
    #rejectUnreachable
    /**
     * 
     * @param {string[]} nodeRoles Functional Roles ['Registry','Broker','Provider','Producer','Logger']
     * @param {string} hostID Host Identifier
     * @param {string} domainName DRP Domain Name
     * @param {string} meshKey DRP Mesh Key
     * @param {string} zone DRP Zone Name (optional)
     * @param {DRP_WebServerConfig} webServerConfig Web server config (optional)
     * @param {string} drpRoute DRP WS Route (optional)
     * @param {DRP_PermissionSet} permissionSet DRP Permission Set
     */
    constructor(nodeRoles, hostID, domainName, meshKey, zone, webServerConfig, drpRoute, permissionSet) {
        super(permissionSet);
        let thisNode = this;
        this.NodeID = `${os.hostname()}-${process.pid}`;
        this.HostID = hostID;
        /** @type {DRP_WebServer} */
        this.WebServer = null;
        this.WebServerConfig = webServerConfig || null;

        this.drpRoute = drpRoute || "/";
        this.DomainName = domainName;
        this.#MeshKey = meshKey;
        if (!this.#MeshKey) this.Die("No MeshKey provided");
        this.Zone = zone || "default";
        /** @type{string} */
        this.RegistryUrl = null;
        this.Debug = false;
        this.RegistrySet = null;
        this.UseSwagger = false;
        /** @type{string} */
        this.AuthenticationServiceName = null;
        this.HasConnectedToMesh = false;
        /** @type{function} */
        this.onControlPlaneConnect = null;
        this.ListeningURL = null;
        this.PendingRegistryConnections = new Set();

        /** @type{string[]} */
        this.NodeRoles = nodeRoles || [];
        /** @type{string} */
        this.WebProxyURL = null;

        // If we have a web server config, start listening
        if (this.WebServerConfig && this.WebServerConfig.ListeningURL) {
            this.WebServer = new DRP_WebServer(webServerConfig);
            this.WebServer.start();

            this.ListeningURL = this.WebServer.config.ListeningURL;
        }

        // By default, Registry nodes are "connected" to the Control Plane and non-Registry nodes aren't
        this.isConnectedToControlPlane = thisNode.IsRegistry();

        // True if this node is currently attempting to connect to the control plane
        this.isConnectingToControlPlane = false;

        // Wait time for Registry reconnect attempts
        this.ReconnectWaitTimeSeconds = 0;

        /** @type {Object.<string,DRP_NodeClient>} */
        this.NodeEndpoints = {};

        /** @type {Object.<string,DRP_NodeClient>} */
        this.ConsumerEndpoints = {};

        // Create topic manager - Handles stream messaging
        this.TopicManager = new DRP_TopicManager(thisNode);

        // Create subscription manager - Handles client subscriptions
        this.SubscriptionManager = new DRP_SubscriptionManager(thisNode);

        // Create topology tracker - Processes changes in mesh topology
        this.TopologyTracker = new DRP_TopologyTracker(thisNode);

        // Add this node to TopologyTracker
        let newNodeEntry = new DRP_NodeTableEntry(thisNode.NodeID, null, nodeRoles, this.ListeningURL, "global", this.Zone, this.NodeID, this.HostID);
        let addNodePacket = new DRP_TopologyPacket(newNodeEntry.NodeID, "add", "node", newNodeEntry.NodeID, newNodeEntry.Scope, newNodeEntry.Zone, newNodeEntry);
        thisNode.TopologyTracker.ProcessPacket(addNodePacket, this.NodeID);

        /** @type Object.<string,DRP_Service> */
        this.Services = {};

        /** @type Object.<string,DRP_AuthResponse> */
        this.ConsumerTokens = {};

        // Add a route handler even if we don't have an Express server (needed for stream relays)
        this.RouteHandler = new DRP_RouteHandler(this, this.drpRoute);

        this.PacketRelayCount = 0;

        this.TCPPing = this.TCPPing;
        this.GetServiceDefinitions = this.GetServiceDefinitions;
        this.ListClassInstances = this.ListClassInstances;
        this.ToggleDebug = this.ToggleDebug;
        this.GetDebug = () => { return this.Debug; }

        this.Evacuate = this.Evacuate;

        this.Mesh = async (params, callingEndpoint) => {
            let pathData = await thisNode.PathCmd(params, thisNode.GetBaseObj().Mesh, callingEndpoint);
            return pathData;
        }

        let localDRPEndpoint = new DRP_Endpoint(null, this, "Local");
        this.ApplyNodeEndpointMethods(localDRPEndpoint);

        let DRPService = new DRP_Service("DRP", this, "DRP", null, false, 10, 10, this.Zone, "local", null, ["Console", "TopologyTracker"], 1, DRPVersion);
        DRPService.ClientCmds = localDRPEndpoint.EndpointCmds;

        DRPService.Streams['Console'].MaxHistoryLength = 1000;
        DRPService.Streams['TopologyTracker'].MaxHistoryLength = 1000;

        // Add hook for watching topology for Subscription Manager
        let topologySubscription = new DRP_Subscriber("DRP", "TopologyTracker", "local", null, null, false, (topologyPacket) => {
            this.SubscriptionManager.ProcessTopologyPacket(topologyPacket.Message);
        }, null);
        this.TopicManager.SubscribeToTopic(topologySubscription);

        this.AddService(DRPService);
    }

    /** @type boolean */
    get Debug() { return this.#debug }
    set Debug(val) { this.#debug = this.IsTrue(val) }

    /** @type Object.<string,Object> */
    get RegistrySet() { return this.#registrySet }
    set RegistrySet(val) {
        if (!val) {
            this.#registrySet = null;
            return;
        }
        this.#registrySet = val.split(/,/).reduce((map, registryEntry) => {
            let [host, port] = registryEntry.split(/:/);
            if (!host || !port) {
                throw new Error(`Invalid registry entry [${registryEntry}], expecting "{host}:{port}"`);
            }
            let key = `${host}-${port}`;
            map[key] = {
                name: host,
                port: port,
                pingInfo: null
            };
            return map;
        }, {});
    }

    /** @type boolean */
    get UseSwagger() { return this.#useSwagger }
    set UseSwagger(val) { this.#useSwagger = this.IsTrue(val) }

    /** @type boolean */
    get RejectUnreachable() { return this.#rejectUnreachable }
    set RejectUnreachable(val) { this.#rejectUnreachable = this.IsTrue(val) }

    /**
     * Print message to stdout
     * @param {string} message Message to output
     * @param {boolean} isDebugMsg Is it a debug message?
     */
    log(message, isDebugMsg) {
        // If it's a debug message and we don't have debugging turned on, return
        if (!this.Debug && isDebugMsg) return;

        let paddedNodeID = this.NodeID.padEnd(14, ' ');
        let outputMsg = `${this.getTimestamp()} [${paddedNodeID}] -> ${message}`;
        console.log(outputMsg);
        if (this.TopicManager) {
            this.TopicManager.SendToTopic("DRP", "Console", outputMsg);
        }
    }
    getTimestamp() {
        let date = new Date();
        let hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;
        let min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;
        let sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;
        let ms = date.getMilliseconds();
        if (ms < 10) {
            ms = "00" + ms;
        } else if (ms < 100) {
            ms = "0" + ms;
        }
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;
        let day = date.getDate();
        day = (day < 10 ? "0" : "") + day;
        return year + "" + month + "" + day + "" + hour + "" + min + "" + sec + "." + ms;
    }

    ToggleDebug() {
        if (this.Debug) {
            this.Debug = false;
        } else {
            this.Debug = true;
        }
        return this.Debug;
    }

    __GetNodeDeclaration() {
        let thisNode = this;
        return new DRP_NodeDeclaration(thisNode.NodeID, thisNode.NodeRoles, thisNode.HostID, thisNode.ListeningURL, thisNode.DomainName, thisNode.#MeshKey, thisNode.Zone);
    }

    async GetConsumerToken(username, password) {
        let thisNode = this;
        let returnToken = null;
        /** @type {DRP_AuthResponse} */
        let authResults = await thisNode.Authenticate(username, password, null);
        if (authResults) {
            thisNode.ConsumerTokens[authResults.Token] = authResults;

            // If this Node is a Broker, relay to other Brokers in Zone
            if (thisNode.IsBroker()) {
                let nodeIDList = Object.keys(thisNode.TopologyTracker.NodeTable);
                for (let i = 0; i < nodeIDList.length; i++) {
                    let checkNode = thisNode.TopologyTracker.NodeTable[nodeIDList[i]];
                    if (checkNode.NodeID !== thisNode.NodeID && checkNode.IsBroker() && checkNode.Zone === thisNode.Zone) {
                        // Send command to remote Broker
                        thisNode.ServiceCmd("DRP", "addConsumerToken", { tokenPacket: authResults }, {
                            targetNodeID: checkNode.NodeID,
                            sendOnly: true
                        });
                    }
                }
            }
            returnToken = authResults.Token;
        }
        return returnToken;
    }

    async GetConsumerTokenAnon() {
        let thisNode = this;
        let returnToken = null;
        /** @type {DRP_AuthResponse} */
        let authResults = new DRP_AuthResponse(uuidv4(), "Anonymous", "Anonymous", [], null, "Anonymous", thisNode.getTimestamp());
        thisNode.ConsumerTokens[authResults.Token] = authResults;
        returnToken = authResults.Token;
        return returnToken;
    }

    GetLastTokenForUser(userName) {
        let thisNode = this;
        let tokenList = Object.keys(thisNode.ConsumerTokens).reverse();
        for (let i = 0; i < tokenList.length; i++) {
            let checkTokenID = tokenList[i];
            let thisToken = thisNode.ConsumerTokens[tokenList[i]];
            if (userName === thisToken.UserName) return checkTokenID;
        }
        return null;
    }

    /**
     * 
     * @param {string} restRoute Route to listen for Node REST requests
     * @param {string} basePath Base path list
     * @param {boolean} writeToLogger If true, output REST Logs to Logger
     * @returns {number} Failure code
     */
    EnableREST(webServer, restRoute, basePath, writeToLogger) {
        let thisNode = this;

        if (!webServer || !webServer.expressApp) return 1;

        // Set Consumer Token Cleanup Interval - 60 seconds
        let checkFrequencyMs = 60000;
        setInterval(() => {
            let iCurrentTimestamp = parseInt(thisNode.getTimestamp());
            let consumerTokenIDList = Object.keys(thisNode.ConsumerTokens);

            // Collect tokens from ConsumerEndpoints
            let connectedTokenList = [];
            let consumerEndpointIDList = Object.keys(thisNode.ConsumerEndpoints);
            for (let i = 0; i < consumerEndpointIDList.length; i++) {
                let consumerEndpointID = consumerEndpointIDList[i];
                connectedTokenList.push(thisNode.ConsumerEndpoints[consumerEndpointID].AuthInfo.value);
            }

            // TO DO - if clients automatically time out, we need to add a keepalive so that
            // tokens of consumers connected to this Broker are not removed from other Brokers
            for (let i = 0; i < consumerTokenIDList.length; i++) {
                let checkToken = consumerTokenIDList[i];
                let checkTokenObj = thisNode.ConsumerTokens[checkToken];
                let iCheckTimestamp = parseInt(checkTokenObj.AuthTimestamp);

                // Skip if currently connected
                if (connectedTokenList.includes(checkToken)) continue;

                // Expire after 30 minutes
                let maxAgeSeconds = 60 * 30;
                if (iCurrentTimestamp > iCheckTimestamp + maxAgeSeconds) {

                    // The token has expired
                    delete thisNode.ConsumerTokens[checkToken];
                }
            }
        }, checkFrequencyMs);

        let tmpBasePath = basePath || "";
        let basePathArray = tmpBasePath.replace(/^\/|\/$/g, '').split('/');

        // Get a list of valid HTTP codes, convert to numeric values for later comparison
        let validHttpCodes = Object.keys(require('http').STATUS_CODES).map(statusCode => parseInt(statusCode));

        /**
         * 
         * @param {Express_Request} req Request
         * @param {Express_Response} res Response
         * @param {function} next Next step
         */
        let nodeRestHandler = async function (req, res, next) {

            OUTERTRY:
            try {
                // Get Auth Key
                let authInfo = {
                    type: null,
                    value: null
                };

                // Check for authInfo:
                //   x-api-key - apps (static)
                //   x-api-token - users (dynamic)
                let xapikey = null;
                let xapitoken = null;

                if (req.headers['x-api-key']) {
                    xapikey = req.headers['x-api-key'];
                } else if (req.query['x-api-key']) {
                    xapikey = req.query['x-api-key'];
                } else if (req.headers.cookie && /^x-api-key=.*$/.test(req.headers.cookie)) {
                    xapikey = req.headers.cookie.match(/^x-api-key=(.*)$/)[1];
                } else if (req.headers['x-api-token']) {
                    xapitoken = req.headers['x-api-token'];
                } else if (req.headers.cookie && /^x-api-token=.*$/.test(req.headers.cookie)) {
                    xapitoken = req.headers.cookie.match(/^x-api-token=(.*)$/)[1];
                } else if (req.headers['x-gitlab-token']) {
                    xapikey = req.headers['x-gitlab-token']
                }

                if (thisNode.IsSidecar()) {
                    // No auth required from client, pass through sidecar creds
                    authInfo.type = 'sidecar';
                    authInfo.value = null;
                } else if (xapikey) {
                    authInfo.type = 'key';
                    authInfo.value = xapikey;
                } else if (xapitoken) {
                    authInfo.type = 'token';
                    authInfo.value = xapitoken;

                    // Make sure the token is current
                    if (!thisNode.ConsumerTokens[authInfo.value]) {
                        // We don't recognize this token
                        res.status(401).send("Invalid token");
                        return;
                    }
                    authInfo.userInfo = thisNode.ConsumerTokens[authInfo.value];
                } else {
                    // Unauthorized
                    res.status(401).send("No x-api-token or x-api-key provided");
                    return;
                }

                // Turn path into list, remove first element
                let decodedPath = decodeURIComponent(req.path);
                let remainingPath = decodedPath.replace(/^\/|\/$/g, '').split('/');
                remainingPath.shift();

                // Init vars
                let format = null;
                let verb = null;
                let resultString = "";
                let resCode = 200;

                // Reserved - format JSON output
                if (req.query.__format) format = thisNode.IsTrue(req.query.__format);

                // Reserved - override verb
                if (req.query.__verb) verb = req.query.__verb;

                // HTTP Verb Map
                let httpMethodToVerbMap = {
                    GET: "GetItem",
                    POST: "SetItem",
                    PUT: "SetItem",
                    DELETE: "RemoveItem"
                };

                RUNTRY:
                try {
                    // Client did not specify verb
                    if (!verb) {

                        // Get verb from HTTP method
                        verb = httpMethodToVerbMap[req.method];

                        if (!verb) {
                            resultString = `Invalid method: ${req.method}`;
                            resCode = DRP_ErrorCode.BADREQUEST;
                            break RUNTRY;
                        }
                    }
                    let params = new DRP_MethodParams(verb, basePathArray.concat(remainingPath), req.body, req.query, "REST", authInfo);
                    let resultObj = await thisNode.PathCmd(params, thisNode.GetBaseObj());

                    try {
                        // The res.send() method cannot accept numbers.  Convert the result if it's not already a string.
                        let objectType = typeof resultObj;
                        switch (objectType) {
                            case "string":
                                resultString = resultObj;
                                break;
                            case "number":
                            case "boolean":
                                resultString = resultObj.toString();
                                break;
                            default:
                                resultString = JSON.stringify(resultObj, null, format);
                        }
                    } catch {
                        resultString = "Could not convert result to string";
                        resCode = DRP_ErrorCode.BADREQUEST;
                    }

                } catch (ex) {
                    // An exception was thrown at some point in the call.  If the code isn't a valid HTTP code, use 500.
                    if (validHttpCodes.includes(ex.code)) {
                        resCode = ex.code;
                    } else {
                        resCode = 500;
                    }
                    resultString = ex.message;
                }

                // Send response to client
                res.status(resCode).send(resultString);

                // Create message for logging
                let logMessage = {
                    req: {
                        hostname: req.hostname,
                        ip: req.ip,
                        method: req.method,
                        protocol: req.protocol,
                        path: req.path,
                        headers: Object.assign({}, req.headers),
                        query: req.query,
                        baseUrl: req.baseUrl,
                        body: req.body
                    },
                    res: {
                        code: resCode,
                        length: resultString.length
                    }
                };

                // Remove authorization header for security purposes
                delete logMessage.req.headers["authorization"];

                // Send log to RESTLogs topic
                thisNode.TopicManager.SendToTopic("DRP", "RESTLogs", logMessage);

                // Write to Logger service if flag is set
                if (writeToLogger) {
                    thisNode.ServiceCmd("Logger", "writeLog", { serviceName: "REST", logData: logMessage }, {
                        sendOnly: true
                    });
                }

                return;
            } catch (ex) {
                console.log(`Could not respond to REST request:`);
                console.dir(ex);
                console.dir({
                    url: req.url,
                    method: req.method,
                    headers: req.headers,
                    body: req.body,
                    ip: req.ip
                });
            }
        };

        webServer.expressApp.all(`${restRoute}`, nodeRestHandler);
        webServer.expressApp.all(`${restRoute}/*`, nodeRestHandler);

        // Get Token
        webServer.expressApp.post('/token', async (req, res) => {
            // Get an auth token
            let username = req.body.username;
            let password = req.body.password;

            let userToken = await GetConsumerToken(username, password);

            if (userToken) {
                res.send(`x-api-token: ${userToken}`);
            } else {
                res.status(401).send("Bad credentials");
            }
            return;
        });

        return 0;
    }

    /**
     * Return a dictionary of class names, services and providers
     * @param {DRP_MethodParams} params Parameters
     * @param {object} callingEndpoint Calling Endpoint
     * @param {token} token Command token
     * @returns {Object.<string,Object.<string,{providers:string[]}>>} Class instances
     */
    async ListClassInstances(params, callingEndpoint, token) {
        let thisNode = this;

        let results = {};
        let findClassName = null;
        if (params && params.className) findClassName = params.className;
        else if (params && params.__pathList && params.__pathList.length > 0) findClassName = params.__pathList.shift();

        // Get best instance for each service
        let serviceDefinitions = await thisNode.GetServiceDefinitions(params, callingEndpoint);

        // Get best instance of each service
        let serviceList = Object.keys(serviceDefinitions);
        for (let i = 0; i < serviceList.length; i++) {
            let serviceName = serviceList[i];
            let serviceInstanceObj = serviceDefinitions[serviceName];
            let classList = Object.keys(serviceInstanceObj.Classes);
            for (let k = 0; k < classList.length; k++) {
                let className = classList[k];
                if (!findClassName || findClassName === className) {
                    if (!results[className]) {
                        results[className] = {};
                    }
                    if (!results[className][serviceName]) {
                        results[className][serviceName] = { providers: [] };
                    }
                    results[className][serviceName].providers.push(serviceInstanceObj.NodeID);
                }
            }
        }

        return results;
    }

    GetServiceDefinition(params) {
        /*
         * We need to return:
         * {
         *    "TestService": {ClientCmds: {}, Classes:{}, Streams:{}}
         * }
         */
        let thisNode = this;
        let targetService = thisNode.Services[params.serviceName];
        let serviceDefinition = targetService.GetDefinition();
        return serviceDefinition;
    }

    async GetServiceDefinitions(params, callingEndpoint) {
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
            let response = await thisNode.ServiceCmd("DRP", "getServiceDefinition", { serviceName: serviceName }, {
                targetNodeID: bestInstance.NodeID,
                targetServiceInstanceID: bestInstance.InstanceID,
                useControlPlane: true,
                callingEndpoint: callingEndpoint
            });
            response.NodeID = bestInstance.NodeID;
            serviceDefinitions[serviceName] = response;
        }
        return serviceDefinitions;
    }

    /**
     * Get service definitions for this DRP_Node
     * @param {DRP_MethodParams} params
     * @param {any} callingEndpoint
     */
    GetLocalServiceDefinitions(params, callingEndpoint) {
        /*
         * We need to return:
         * {
         *    "TestService": {ClientCmds: {}, Classes:{}, Streams:{}}
         * }
         */
        let thisNode = this;
        let serviceDefinitions = {};
        let checkServiceName = null;
        if (params) {
            if (params.serviceName) checkServiceName = params.serviceName;
            else if (params.__pathList && params.__pathList.length > 0) checkServiceName = params.__pathList.shift();
        }
        let serviceNameList = Object.keys(thisNode.Services);
        for (let i = 0; i < serviceNameList.length; i++) {
            let serviceName = serviceNameList[i];
            if (checkServiceName && checkServiceName !== serviceName) continue;
            let serviceDefinition = thisNode.Services[serviceName].GetDefinition();
            serviceDefinitions[serviceName] = serviceDefinition;
        }
        return serviceDefinitions;
    }

    /**
     * Return class records
     * @param {DRP_MethodParams} params Parameters
     * @returns {Object} Class records
     */
    async GetClassRecords(params) {
        let thisNode = this;

        let results = {};

        // If user didn't supply the className, return null
        if (!params || !params.className) return null;
        let thisClassName = params.className;

        // We need to get a list of all distinct INSTANCES for this class along with the best source for each
        let classInstances = await thisNode.ListClassInstances(params);

        // If we don't have data for this class, return null
        if (!classInstances[thisClassName]) return null;

        let thisClassObj = classInstances[thisClassName];

        // Loop over Class for this service
        let serviceNames = Object.keys(thisClassObj);
        for (let j = 0; j < serviceNames.length; j++) {
            let serviceName = serviceNames[j];

            if (params.serviceName && params.serviceName !== serviceName) continue;

            let recordPath = ["Mesh", "Services", serviceName, "Classes", thisClassName, "cache"];

            // Get data
            let pathParams = new DRP_MethodParams("GetItem", recordPath);
            let pathData = await thisNode.PathCmd(pathParams, thisNode.GetBaseObj());

            results[serviceName] = pathData;

        }
        return results;
    }

    /**
     * Send PathCmd to Remote Node
     * @param {string} targetNodeID
     * @param {Object} params
     * @returns {any}
     */
    async SendPathCmdToNode(targetNodeID, params) {
        let thisNode = this;
        let oReturnObject = null;

        if (targetNodeID === thisNode.NodeID) {
            // The target NodeID is local
            oReturnObject = thisNode.PathCmd(params, thisNode.GetBaseObj());
        } else {
            oReturnObject = await thisNode.ServiceCmd("DRP", "pathCmd", params, {
                targetNodeID: targetNodeID
            });
        }
        return oReturnObject;
    }

    GetBaseObj() {
        let thisNode = this;
        let pathFuncs = {
            Nodes: {
                /**
                 * Get dictionary of available nodes in Mesh, override type as DRP_RemotePath
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                List: async (params, zoneName) => {
                    let nodeList = thisNode.TopologyTracker.ListNodes(zoneName);
                    let returnObj = nodeList.reduce((map, nodeID) => {
                        map[nodeID] = new DRP_RemotePath();
                        return map;
                    }, {});
                    return returnObj;
                },
                /**
                 * Find node and return a DRP_RemotePath command object
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                Get: async (params, zoneName) => {
                    let targetNodeID = params.__pathList.shift();
                    let checkEntry = thisNode.TopologyTracker.NodeTable[targetNodeID];
                    if (!checkEntry) {
                        throw new DRP_CmdError(`Node [${targetNodeID}] does not exist`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                    }
                    if (zoneName && checkEntry.Zone !== zoneName) {
                        throw new DRP_CmdError(`Node [${targetNodeID}] is in Zone [${checkEntry.Zone}], not Zone [${zoneName}]`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                    }

                    let returnObj = {}
                    returnObj = new DRP_RemotePath(thisNode, targetNodeID, params);
                    return returnObj;
                },
            },
            Services: {
                /**
                 * Get dictionary of available services in Mesh, override type as DRP_RemotePath
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                List: async (params, zoneName) => {
                    let serviceList = Object.keys(thisNode.TopologyTracker.GetServicesWithProviders(zoneName));
                    let returnObj = serviceList.reduce((map, serviceName) => {
                        map[serviceName] = new DRP_RemotePath();
                        return map;
                    }, {});
                    return returnObj;
                },
                /**
                 * Find an instance of the service and send a command to that path
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                Get: async (params, zoneName) => {
                    let serviceName = params.__pathList.shift();

                    params.__pathList = ['Services', serviceName].concat(params.__pathList);

                    let limitScope = zoneName ? "zone" : null;
                    let targetServiceEntry = thisNode.TopologyTracker.FindInstanceOfService(serviceName, null, zoneName, null, limitScope);
                    if (!targetServiceEntry) {
                        throw new DRP_CmdError("Service not found", DRP_ErrorCode.NOTFOUND, "PathCmd");
                    };

                    let targetNodeID = targetServiceEntry.NodeID;

                    let returnObj = {}
                    returnObj = new DRP_RemotePath(thisNode, targetNodeID, params);
                    return returnObj;
                }
            },
            Streams: {
                /**
                 * List available streams in Mesh
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                List: async (params, zoneName) => {
                    let returnObj = {};
                    let streamProviders = thisNode.TopologyTracker.GetStreamsWithProviders(zoneName);
                    for (let streamName in streamProviders) {
                        returnObj[streamName] = {}
                        streamProviders[streamName].reduce((map, streamName) => {
                            let newParams = Object.assign({}, params);
                            newParams.__pathList = ['DRPNode', 'TopicManager', 'Topics', streamName].concat(params.__pathList.slice(1));
                            map[streamName] = new DRP_RemotePath(thisNode, streamName, newParams);
                            return map;
                        }, returnObj[streamName]);
                    }
                    return returnObj;
                },
                /**
                 * Get dictionary of available services in Mesh, override type as DRP_RemotePath
                 * @param {DRP_MethodParams} params
                 * @param {string} zoneName
                 */
                Get: async (params, zoneName) => {
                    let streamName = params.__pathList.shift();

                    let returnObj = {};
                    let streamProviders = thisNode.TopologyTracker.GetStreamsWithProviders(zoneName);
                    if (!streamProviders[streamName]) {
                        throw new DRP_CmdError(`Stream [${streamName}] not found`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                    }
                    returnObj = streamProviders[streamName].reduce((map, providerNodeID) => {
                        let newParams = Object.assign({}, params);
                        newParams.__pathList = ['DRPNode', 'TopicManager', 'Topics', streamName].concat(params.__pathList.slice(1));
                        map[providerNodeID] = new DRP_RemotePath(thisNode, providerNodeID, newParams);
                        return map;
                    }, returnObj);

                    return returnObj;
                }
            }
        }

        return {
            NodeID: thisNode.NodeID,
            NodeURL: thisNode.ListeningURL,
            DRPNode: thisNode,
            Services: thisNode.Services,
            Streams: thisNode.TopicManager.Topics,
            Endpoints: {
                /**
                 * Return Node endpoints
                 * @param {DRP_MethodParams} params
                 */
                Nodes: async function (params) {
                    let remainingChildPath = params.__pathList;
                    let oReturnObject = null;
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let targetNodeID = remainingChildPath.shift();

                        // Need to send command to remote Node with remaining tree data
                        params.__pathList = remainingChildPath;

                        oReturnObject = await thisNode.SendPathCmdToNode(targetNodeID, params);

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
                /**
                 * Return Consumer endpoints
                 * @param {DRP_MethodParams} params
                 */
                Consumers: async function (params) {
                    let remainingChildPath = params.__pathList;
                    let oReturnObject = null;
                    if (remainingChildPath && remainingChildPath.length > 0) {

                        let agentID = remainingChildPath.shift();

                        // Need to send command to consumer with remaining tree data
                        params.__pathList = remainingChildPath;
                        let targetEndpoint = await thisNode.VerifyConsumerConnection(agentID);

                        if (targetEndpoint) {
                            // Await for command from consumer
                            let results = await targetEndpoint.SendCmd("DRP", "pathCmd", params, true, null);
                            if (results) {
                                oReturnObject = results;
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
                Nodes: new DRP_VirtualDirectory(
                    /**
                     * List Nodes
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Nodes.List(params);
                    },
                    /**
                     * Get Node
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Nodes.Get(params);
                    },
                    // Permission set
                    null
                ),
                Services: new DRP_VirtualDirectory(
                    /**
                     * List Services
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Services.List(params);
                    },
                    /**
                     * Get Service
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Services.Get(params);
                    },
                    // Permission set
                    null
                ),
                Streams: new DRP_VirtualDirectory(
                    /**
                     * List Streams
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Streams.List(params);
                    },
                    /**
                     * Get Stream
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        return await pathFuncs.Streams.Get(params);
                    },
                    // Permission set
                    null
                ),
                Zones: new DRP_VirtualDirectory(
                    /**
                     * List Zones
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        // Return list of Zones
                        let returnObj = thisNode.TopologyTracker.ListZones().reduce((map, zoneName) => {
                            map[zoneName] = new DRP_RemotePath();
                            return map;
                        }, {});
                        return returnObj;
                    },
                    /**
                     * Get Zone
                     * @param {DRP_MethodParams} params
                     */
                    async (params) => {
                        let returnObj = {};

                        // Get Zone
                        let zoneName = params.__pathList.shift();
                        // Make sure zone exists
                        if (!(thisNode.TopologyTracker.ListZones().includes(zoneName))) {
                            throw new DRP_CmdError(`Zone [${zoneName}] not found`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                        }

                        // If the local DRPNode is not in the specified zone, we need to route the call to a Registry in the target zone
                        if (zoneName !== thisNode.Zone) {
                            let targetZoneRegistries = thisNode.TopologyTracker.FindRegistriesInZone(zoneName);
                            if (targetZoneRegistries.length == 0) {
                                throw new DRP_CmdError('No registries for zone', DRP_ErrorCode.UNAVAILABLE, "PathCmd");
                            }
                            let targetNodeID = targetZoneRegistries[0].NodeID;
                            params.__pathList = ['Mesh', 'Zones', zoneName].concat(params.__pathList);
                            returnObj = new DRP_RemotePath(thisNode, targetNodeID, params);
                            return returnObj;
                        }

                        // The local DRPNode is in the specified zone, proceed
                        let levelDefinitions = {
                            Nodes: new DRP_VirtualDirectory(
                                /**
                                 * List Nodes
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Nodes.List(params, zoneName);
                                },
                                /**
                                 * Get Node
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Nodes.Get(params, zoneName);
                                },
                                // Permission set
                                null
                            ),
                            Services: new DRP_VirtualDirectory(
                                /**
                                 * List Services
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Services.List(params, zoneName);
                                },
                                /**
                                 * Get Service
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Services.Get(params, zoneName);
                                },
                                // Permission set
                                null
                            ),
                            Streams: new DRP_VirtualDirectory(
                                /**
                                 * List Streams
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Streams.List(params, zoneName);
                                },
                                /**
                                 * Get Stream
                                 * @param {DRP_MethodParams} params
                                 */
                                async (params) => {
                                    return await pathFuncs.Streams.Get(params, zoneName);
                                },
                                // Permission set
                                null
                            )
                        }
                        returnObj = new DRP_VirtualDirectory(
                            /**
                             * List items
                             * @param {DRP_MethodParams} params
                             */
                            async (params) => {
                                // Return list of target types in Zone
                                let returnObj = Object.keys(levelDefinitions).reduce((map, targetType) => {
                                    map[targetType] = new DRP_VirtualDirectory();
                                    return map;
                                }, {});
                                return returnObj;
                            },
                            /**
                             * Get item
                             * @param {DRP_MethodParams} params
                             */
                            async (params) => {
                                let returnObj = {};
                                let targetType = params.__pathList.shift();
                                if (!levelDefinitions[targetType]) {
                                    throw new DRP_CmdError(`Invalid path`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                                }
                                returnObj = await levelDefinitions[targetType];
                                return returnObj;
                            },
                            // Permission set
                            null
                        )

                        return returnObj;
                    },
                    // Permission set
                    null
                )
            }
        };
    }

    /**
    * @param {DRP_MethodParams} params Remaining path
    * @param {Boolean} baseObj Flag to return list of children
    * @param {object} callingEndpoint Endpoint making request
    * @returns {object} oReturnObject Return object
    */
    async PathCmd(params, oCurrentObject, callingEndpoint) {

        /* 
         * REST Calls
         * params.__method = ('GetItem'|'GetChildItems'|'SetItem')
         * 
         * RPC Calls
         * params.__method = ('cat'|'ls'|'exec')
         * 
         * DRP_VirtualFunction accepts methods 'execute' and 'SetItem'
         * 
         * Using a subset of PowerShell NavigationCmdletProvider methods.
         * May implement more of them so that entire objects do not have
         * to be returned for Boolean operations.
         *   ItemExists
         *   IsValidPath
         *   IsItemContainer
         *   GetItem
         *   SetItem
         *   RemoveItem
         *   GetChildItems
         *   CopyItem
         */

        let outputObject = null;
        let returnObject = null;
        let listOnly = false;
        let writeOperation = false;
        let functionExecuted = false;
        let manPageOnly = false;

        switch (params.__verb) {
            case "man":
                manPageOnly = true;
            case "exec":
            case "SetItem":
            case "NewItem":
            // To create an item, one of the following conventions must be used:
            // (FILEDATA) -> .../VirtualDirectory/itemKey   Explicit key
            // (FILEDATA) -> .../VirtualDirectory           Dynamic key
            // If successful, the key of the new object will be returned via pathItemAffected
            case "CopyItem":
            // To copy an item, this convention must be used:
            // (NEWKEY) -> .../VirtualDirectory/ORIGINALKEY
            // If successful, the key of the new object will be returned via pathItemAffected
            case "RemoveItem":
                // To remove an item, this convention must be used:
                // () -> .../VirtualDirectory/itemKey   Explicit key
                // If successful, the key of the removed object will be returned via pathItemAffected
                writeOperation = true;
                break;
            case "cat":
            case "GetItem":
                break;
            case "ls":
            case "GetChildItems":
                listOnly = true;
                break;

                // TODO
                break;
            default:
                throw new DRP_CmdError("Invalid method", DRP_ErrorCode.BADREQUEST, "PathCmd");
        }

        let aChildPathArray = params.__pathList;
        let pathItemName

        // Do we have a path array?
        if (aChildPathArray.length === 0) {
            // No - act on parent object
            outputObject = oCurrentObject;
        } else {
            // Yes - get child
            PathLoop:
            for (let i = 0; i < aChildPathArray.length; i++) {

                let remainingPath = aChildPathArray.slice(0).splice(i + 1);

                // Function to see if we've arrived at the last item in the path
                let isFinalItem = () => {
                    return (i + 1 === aChildPathArray.length)
                }

                // Current path array element
                pathItemName = aChildPathArray[i];
                if (!pathItemName) {
                    throw new DRP_CmdError(`Empty path element at index ${i}`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                }

                // User is trying to access a hidden attribute
                if (pathItemName.substring(0, 2) === '__') {
                    throw new DRP_CmdError(`Cannot access hidden elements`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                }

                // Is current object valid?
                if (!oCurrentObject) {
                    throw new DRP_CmdError(`Invalid path`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                }

                // Does the child exist?
                if (oCurrentObject.hasOwnProperty(pathItemName)) {

                    // If the value is undefined, throw an error
                    if (typeof oCurrentObject[pathItemName] === 'undefined') {
                        throw new DRP_CmdError(`Invalid path`, DRP_ErrorCode.NOTFOUND, "PathCmd");
                    }

                    // If the value is null, return it
                    if (oCurrentObject[pathItemName] === null) {
                        if (isFinalItem()) {
                            outputObject = null;
                            break;
                        } else {
                            throw new DRP_CmdError(`Object is not traversable`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                        }
                    }

                    // If this is a DRP_Securable object, check permissions
                    if (oCurrentObject[pathItemName].CheckPermission) {
                        // This is a securable object - verify the caller has permissions to see it
                        let isAllowed = oCurrentObject[pathItemName].CheckPermission(params.__authInfo, "read");
                        if (!isAllowed) {
                            throw new DRP_CmdError("Unauthorized", DRP_ErrorCode.UNAUTHORIZED, "PathCmd");
                        }
                    }

                    // See what type of object we're dealing with
                    let objectType = typeof oCurrentObject[pathItemName];
                    switch (objectType) {
                        case 'object':

                            // Special handling needed for Set objects
                            let constructorName = oCurrentObject[pathItemName].constructor.name;

                            switch (constructorName) {
                                case "Set":
                                    // Set current object
                                    oCurrentObject = oCurrentObject[pathItemName];
                                    if (isFinalItem()) {
                                        // Last one - make this the return object
                                        outputObject = [...oCurrentObject];
                                    } else {
                                        // More to the path; skip to the next one
                                        i++;
                                        let pathItemName = aChildPathArray[i];
                                        // If the provided index isn't a number, return
                                        if (isNaN(pathItemName)) {
                                            throw new DRP_CmdError(`Set index must be a number: [${pathItemName}]`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                                        }
                                        let setIndexInt = parseInt(pathItemName);
                                        // If the provided index is out of range, return
                                        if (setIndexInt + 1 > oCurrentObject.size) {
                                            throw new DRP_CmdError(`Set index out of range: [${pathItemName}]`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                                        }
                                        oCurrentObject = [...oCurrentObject][setIndexInt];

                                        if (isFinalItem()) {
                                            // Last one - make this the return object
                                            outputObject = oCurrentObject;
                                        }
                                    }
                                    break;
                                case "DRP_VirtualFunction":
                                    // Send the rest of the path to a function
                                    params.__pathList = remainingPath;

                                    // Set current object
                                    /** @type {DRP_VirtualFunction} */
                                    let execFunction = oCurrentObject[pathItemName];

                                    // Execute virtual function
                                    if (manPageOnly) {
                                        outputObject = await execFunction.ShowHelp();
                                    } else {
                                        outputObject = await execFunction.Execute(params);
                                    }
                                    functionExecuted = true;
                                    // The function processed the rest of the path list so we'll break out of the loop
                                    break PathLoop;
                                case "DRP_VirtualDirectory":
                                    /** @type DRP_VirtualDirectory */
                                    let thisVirtualDirectory = oCurrentObject[pathItemName];
                                    if (isFinalItem()) {
                                        // Check for read-only listing
                                        if (!listOnly && !manPageOnly) {
                                            throw new DRP_CmdError(`Object is a directory`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                                        }

                                        // Return list
                                        outputObject = await thisVirtualDirectory.List(params);
                                        break PathLoop;
                                    } else {
                                        // Return item in hash
                                        pathItemName = aChildPathArray[i + 1];
                                        params.__pathList = remainingPath;
                                        oCurrentObject = {}
                                        oCurrentObject[pathItemName] = await thisVirtualDirectory.GetItem(params);
                                    }
                                    break;
                                case "DRP_VirtualObject":
                                    // Set current object
                                    oCurrentObject = oCurrentObject[pathItemName].securedObject;
                                    if (isFinalItem()) {
                                        // Last one - make this the return object
                                        outputObject = oCurrentObject;
                                    }
                                    break;
                                case "DRP_RemotePath":
                                    // DRP_RemotePath objects are functions which execute PathCmd again; return results directly 
                                    //params.__pathList = remainingPath;

                                    // Set current object
                                    /** @type {DRP_RemotePath} */
                                    let thisRemotePath = oCurrentObject[pathItemName];

                                    // Execute
                                    outputObject = await thisRemotePath.CallPath(params);

                                    // Do not continue evaluation; return directly to caller
                                    return outputObject;
                                default:
                                    // Set current object
                                    oCurrentObject = oCurrentObject[pathItemName];
                                    if (isFinalItem()) {
                                        // Last one - make this the return object
                                        outputObject = oCurrentObject;
                                    }
                            }
                            break;
                        case 'function':
                            // Send the rest of the path to a function
                            params.__pathList = remainingPath;
                            // Must be called this way so the method is aware of the parent
                            if (manPageOnly && isFinalItem()) {
                                throw new DRP_CmdError("Simple function does not have man page", DRP_ErrorCode.BADREQUEST, "PathCmd");
                            }
                            outputObject = await oCurrentObject[pathItemName](params, callingEndpoint);
                            functionExecuted = true;
                            // The function processed the rest of the path list so we'll break out of the loop
                            break PathLoop;
                        case 'string':
                        case 'number':
                        case 'boolean':
                            if (!isFinalItem()) {
                                // There are more elements in the path list, but there is nothing past this object
                                throw new DRP_CmdError(`Object is not traversable`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                            }
                            outputObject = oCurrentObject[pathItemName];
                            break;
                        default:
                            // Unknown object type
                            throw new DRP_CmdError(`Unknown object type: [${objectType}]`, DRP_ErrorCode.SVCERR, "PathCmd");
                    }

                } else {
                    // Child doesn't exist
                    throw new DRP_CmdError("Not found", DRP_ErrorCode.NOTFOUND, "PathCmd");
                }
            }
        }

        if (writeOperation) {
            // We executed some sort of change operation
            if (writeOperation && !functionExecuted) {
                if (manPageOnly) {
                    throw new DRP_CmdError(`Target is not executable, does not have man page`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                } else {
                    throw new DRP_CmdError(`Target is not executable`, DRP_ErrorCode.BADREQUEST, "PathCmd");
                }
            }
            returnObject = outputObject;
        } else if (listOnly) {
            // Determine if a the outputObject has already been converted to a list
            // If so, it will be an array of objects with keys [Name, Type, Value]
            if (outputObject instanceof Object) {
                if (outputObject.constructor.name === "Array" && (!outputObject.length || outputObject[0].Name && outputObject[0].Type)) {
                    returnObject = outputObject
                } else {
                    // Return only child keys and data types
                    returnObject = this.ListObjChildren(outputObject);
                }
            } else {
                throw new DRP_CmdError(`Object is not traversable`, DRP_ErrorCode.BADREQUEST, "PathCmd");
            }
        } else {
            // Return object as is
            returnObject = outputObject;
        }

        return returnObject;
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
            thisNodeEndpoint = new DRP_NodeClient(targetNodeURL, thisNode.WebProxyURL, thisNode, remoteNodeID);
            thisNode.NodeEndpoints[remoteNodeID] = thisNodeEndpoint;

            for (let i = 0; i < 50; i++) {

                // Are we still trying?
                if (thisNodeEndpoint.IsConnecting()) {
                    // Yes - wait
                    await thisNode.Sleep(100);
                } else {
                    // No - break the for loop
                    break;
                }
            }
        }

        // If this node is listening, try sending a back connection request to the remote node via the registry
        if (thisNode.ListeningURL) {

            if (thisNodeEndpoint) {
                // Wait for inbound connection to complete
                for (let i = 0; i < 50; i++) {

                    // Are we still trying?
                    if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                        // Yes - wait
                        await thisNode.Sleep(100);
                    } else {
                        // No - break the for loop
                        //thisNode.log(`Waited ${(i*100)}mS for connection from remote node [${remoteNodeID}]`, true);
                        i = 50;
                    }
                }

                if (thisNode.NodeEndpoints[remoteNodeID] && thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                    return thisNode.NodeEndpoints[remoteNodeID];
                } else {
                    return null;
                }
            } else {

                thisNode.log("Sending back request...", true);

                // Add placeholder, will be overwritten by inbound connection
                thisNode.NodeEndpoints[remoteNodeID] = new DRP_Endpoint();

                // Let's try having the Provider call us; send command through Registry
                try {
                    // Get next hop
                    let nextHopNodeID = thisNode.TopologyTracker.GetNextHop(remoteNodeID);

                    if (!thisNode.NodeEndpoints[nextHopNodeID]) {
                        let errMsg = `Error sending back request to ${remoteNodeID}, next hop ${nextHopNodeID} is unavailable`;
                        thisNode.log(errMsg);
                        throw errMsg;
                    }

                    if (nextHopNodeID) {
                        // Found the next hop
                        thisNode.log(`Sending back request to ${remoteNodeID} to connect to this node @[${thisNode.ListeningURL}], relaying to [${nextHopNodeID}]`, true);
                        let routeOptions = {
                            srcNodeID: thisNode.NodeID,
                            tgtNodeID: remoteNodeID,
                            routeHistory: []
                        };
                        thisNode.NodeEndpoints[nextHopNodeID].SendCmd("DRP", "connectToNode", { "targetNodeID": thisNode.NodeID, "targetURL": thisNode.ListeningURL }, false, null, routeOptions);
                    } else {
                        // Could not find the next hop
                        thisNode.log(`Could not find next hop to [${remoteNodeID}]`);
                    }

                } catch (err) {
                    thisNode.log(`ERR!!!! [${err}]`);
                }

                this.log("Starting wait...", true);
                // Wait a few seconds
                for (let i = 0; i < 50; i++) {

                    // Are we still trying?
                    if (!thisNode.NodeEndpoints[remoteNodeID] || !thisNode.NodeEndpoints[remoteNodeID].IsReady()) {
                        // Yes - wait
                        await thisNode.Sleep(100);
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
     */
    async AddService(serviceObj) {
        let thisNode = this;

        if (serviceObj && serviceObj.serviceName && serviceObj.ClientCmds) {
            thisNode.Services[serviceObj.serviceName] = serviceObj;

            let newServiceEntry = new DRP_ServiceTableEntry(thisNode.NodeID, null, serviceObj.serviceName, serviceObj.Type, serviceObj.InstanceID, serviceObj.Zone, serviceObj.Sticky, serviceObj.Priority, serviceObj.Weight, serviceObj.Scope, serviceObj.Dependencies, Object.keys(serviceObj.Streams), serviceObj.Status, serviceObj.Version);
            let addServicePacket = new DRP_TopologyPacket(thisNode.NodeID, "add", "service", newServiceEntry.InstanceID, newServiceEntry.Scope, newServiceEntry.Zone, newServiceEntry);
            thisNode.TopologyTracker.ProcessPacket(addServicePacket, thisNode.NodeID);
        }
    }

    async RemoveService(serviceName) {
        let thisNode = this;
        /*
         * TO DO - Add code to:
         * 1. Remove from thisNode.Services[]
         * 2. Create a delete Topology packet
         * 3. Execute ProcessPacket
         * 
         * This function is not currently used anywhere since services are normally
         * removed with the termination of the entire process.  Multiple instances
         * of a single service type should not be run from a single process.
         */
    }

    /**
     * Execute a service command with the option of routing via the control plane
     * @param {string} serviceName Target service name
     * @param {string} methodName Target method name
     * @param {DRP_MethodParams} methodParams Method parameters
     * @param {Object} execParams DRP execution parameters
     * @param {string} execParams.targetNodeID Send command to a specific Node
     * @param {string} execParams.targetServiceInstanceID Send command to a specific service instance
     * @param {boolean} execParams.useControlPlane Force use of control plane?
     * @param {boolean} execParams.sendOnly Do not expect a response
     * @param {DRP_Endpoint} execParams.callingEndpoint Endpoint initiating the call
     * @param {boolean} execParams.limitScope Limit scope to local or zone
     */
    async ServiceCmd(serviceName, methodName, methodParams, execParams) {
        let thisNode = this;
        let baseErrMsg = "ERROR - ";
        let msgSource = "ServiceCmd";

        if (!execParams) execParams = {};

        let targetNodeID = execParams.targetNodeID || null;
        let targetServiceInstanceID = execParams.targetServiceInstanceID || null;
        let useControlPlane = execParams.useControlPlane || false;
        let sendOnly = execParams.sendOnly || false;
        let callingEndpoint = execParams.callingEndpoint || null;
        let limitScope = execParams.limitScope || null;

        let handleError = (errMsg) => {
            thisNode.log(`${baseErrMsg}${errMsg}`, true);
            if (!sendOnly) {
                throw new DRP_CmdError(errMsg, DRP_ErrorCode.SVCERR, msgSource);
            }
        }

        // If if no service or command is provided, return null
        if (!serviceName || !methodName) {
            handleError(`Must provide serviceName and method`);
            return;
        }

        // If no targetNodeID was provided, we need to find a record in the ServiceTable
        if (!targetNodeID) {

            // If no targetServiceInstanceID was provided, we should attempt to locate a service instance

            /** @type {DRP_ServiceTableEntry} */
            let targetServiceRecord = null;

            if (!targetServiceInstanceID) {
                // Update to use the DRP_TopologyTracker object
                targetServiceRecord = thisNode.TopologyTracker.FindInstanceOfService(serviceName, null, null, null, limitScope);
                //console.dir(thisNode.TopologyTracker.ServiceTable)

                // If no match is found then return null
                if (!targetServiceRecord) {
                    handleError(`Could not find instance of service ${serviceName}`);
                    return;
                }

                // Assign target Node & Instance IDs
                targetServiceInstanceID = targetServiceRecord.InstanceID;
                targetNodeID = targetServiceRecord.NodeID;

                //thisNode.log(`Best instance of service [${serviceName}] is [${targetServiceRecord.InstanceID}] on node [${targetServiceRecord.NodeID}]`, true);
            } else {
                targetServiceRecord = thisNode.TopologyTracker.ServiceTable[targetServiceInstanceID];

                // If no match is found then return null
                if (!targetServiceRecord) {
                    handleError(`Service instance ${targetServiceInstanceID} not found in ServiceTable`);
                    return;
                }

                // Assign target Node
                targetNodeID = targetServiceRecord.NodeID;
            }
        }

        // We don't have a target NodeID
        if (!targetNodeID) {
            handleError(`No Node found to service request`);
            return;
        }

        if (!thisNode.TopologyTracker.NodeTable[targetNodeID]) {
            handleError(`Invalid Node [${targetNodeID}]`);
            return;
        }

        // Where is the service?
        if (targetNodeID === thisNode.NodeID) {
            // Execute locally
            let localServiceProvider = null;
            if (serviceName === "DRP" && callingEndpoint) {
                // If the service is DRP and the caller is a remote endpoint, execute from that caller's EndpointCmds
                localServiceProvider = callingEndpoint.EndpointCmds;
            } else {
                if (thisNode.Services[serviceName]) localServiceProvider = thisNode.Services[serviceName].ClientCmds;
            }

            if (!localServiceProvider) {
                handleError(`Service ${serviceName} does not exist`);
                return;
            }

            if (!localServiceProvider[methodName]) {
                handleError(`Service ${serviceName} does not have method ${methodName}`);
                return;
            }

            let constructorName = localServiceProvider[methodName].constructor.name;
            if (!sendOnly) {
                let results = null;
                // See if it's a virtual function before executing
                if (constructorName === "DRP_VirtualFunction") {
                    results = await localServiceProvider[methodName].Execute(methodParams, callingEndpoint);
                } else {
                    if (methodName !== "pathCmd" && methodParams && methodParams.__verb && methodParams.__verb === "man") {
                        throw new DRP_CmdError("Simple function does not have man page", DRP_ErrorCode.BADREQUEST, "PathCmd");
                    }
                    results = await localServiceProvider[methodName](methodParams, callingEndpoint);
                }
                return results;
            } else {
                try {
                    if (constructorName === "DRP_VirtualFunction") {
                        await localServiceProvider[methodName].Execute(methodParams, callingEndpoint);
                    } else {
                        await localServiceProvider[methodName](methodParams, callingEndpoint);
                    }
                } catch (ex) {
                    // Don't care about response
                }
                return;
            }
        } else {
            // Execute on another Node
            let routeNodeID = targetNodeID;
            let routeOptions = {};

            if (thisNode.isConnectedToControlPlane && !useControlPlane) {
                let localNodeEntry = thisNode.TopologyTracker.NodeTable[thisNode.NodeID];
                let remoteNodeEntry = thisNode.TopologyTracker.NodeTable[targetNodeID];

                // If the remote Node isn't found, return error message
                if (!remoteNodeEntry) {
                    handleError(`Node ${targetNodeID} not found in NodeTable`);
                    return;
                }

                // Make sure either the local Node or remote Node are listening; if not, route via control plane
                if (!localNodeEntry.NodeURL && !remoteNodeEntry.NodeURL) {
                    // Neither the local node nor the remote node are listening, use control plane
                    useControlPlane = true;
                }

                // If the local Node is not a Registry and the remote Node is a non-connected Registry, route via control plane
                if (!useControlPlane && !localNodeEntry.IsRegistry() && remoteNodeEntry.IsRegistry() && !thisNode.NodeEndpoints[targetNodeID]) {
                    useControlPlane = true;
                }

                // If the local Node is a Registry and the remote Node is a non-connected non-Registry, route via control plane
                if (!useControlPlane && localNodeEntry.IsRegistry() && !remoteNodeEntry.IsRegistry() && !thisNode.NodeEndpoints[targetNodeID]) {
                    useControlPlane = true;
                }
            }

            if (useControlPlane) {
                // We want to use to use the control plane instead of connecting directly to the target
                if (thisNode.isConnectedToControlPlane) {
                    routeNodeID = thisNode.TopologyTracker.GetNextHop(targetNodeID);
                    routeOptions = new DRP_RouteOptions(thisNode.NodeID, targetNodeID);
                } else {
                    // We're not connected to a Registry; fallback to VerifyNodeConnection
                    routeNodeID = targetNodeID;
                }
            }

            let routeNodeConnection = await thisNode.VerifyNodeConnection(routeNodeID);

            if (!routeNodeConnection) {
                handleError(`Could not establish connection from Node[${thisNode.NodeID}] to Node[${routeNodeID}]`);
                return;
            }

            if (!sendOnly) {
                let cmdResponse = await routeNodeConnection.SendCmd(serviceName, methodName, methodParams, true, null, routeOptions, targetServiceInstanceID);
                return cmdResponse;
            } else {
                routeNodeConnection.SendCmd(serviceName, methodName, methodParams, false, null, routeOptions, targetServiceInstanceID);
                return;
            }
        }
    }

    /**
     * Validate node declaration against local node
     * @param {DRP_NodeDeclaration} declaration Node declaration to check
     * @returns {boolean} Successful [true/false]
     */
    async ValidateNodeDeclaration(declaration) {
        let thisNode = this;

        // Is the NodeID specified?
        if (!declaration.NodeID) {
            thisNode.log(`Rejecting declaration - no NodeID specified`, true);
            return false;
        }

        // Do the domains match?
        let domainsMatch = (!thisNode.DomainName && !declaration.DomainName || thisNode.DomainName === declaration.DomainName);
        if (!domainsMatch) {
            thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - DomainName doesn't match, local[${thisNode.DomainName}] remote[${declaration.DomainName}]`, true);
            return false;
        }

        // Do the domainKeys match?
        let meshKeysMatch = (!thisNode.#MeshKey && !declaration.MeshKey || thisNode.#MeshKey === declaration.MeshKey);
        if (!meshKeysMatch) {
            thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - DomainName doesn't match, local[${thisNode.#MeshKey}] remote[${declaration.MeshKey}]`, true);
            return false;
        }

        // If the peer has a NodeURL and RejectUnreachable is set, make sure it's reachable
        if (declaration.NodeURL && thisNode.RejectUnreachable) {
            try {
                // Split NodeURL string into parts
                let nodeURLRegex = /^(.*):\/\/([A-Za-z0-9\-\.]+)(?::([0-9]+))?([^?]+)?(?:\?(.*))?/;
                let splitNodeURL = nodeURLRegex.exec(declaration.NodeURL);
                let checkProtocol = splitNodeURL[1];
                let checkHost = splitNodeURL[2];
                let checkPort = splitNodeURL[3];

                // Fail if no protocol or host found
                if (!checkProtocol || !checkHost) {
                    thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - invalid NodeURL [${declaration.NodeURL}]`, true);
                    return false;
                }

                // Assign port if not specified
                if (!checkPort) {
                    switch (checkProtocol) {
                        case 'http':
                        case 'ws':
                            checkPort = 80;
                            break;
                        case 'https':
                        case 'wss':
                            checkPort = 443;
                            break;
                        default:
                            // Unknown protocol
                            thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - invalid protocol [${checkProtocol}]`, true);
                            return false;
                    }
                }

                // Run TCP Ping check
                let pingInfo = await tcpPing({
                    address: checkHost,
                    port: checkPort,
                    timeout: 500,
                    attempts: 2
                });

                if (!pingInfo.avg) {
                    // No TCP Ping response (target unreachable)
                    thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - TCPPing shows closed to [${checkHost}:${checkPort}]`, true);
                    return false;
                }
            }
            catch (ex) {
                // Cannot do TCP Ping against host:port (local system error)
                thisNode.log(`Rejecting declaration from [${declaration.NodeID}] - could not execute TCPPing to [${checkHost}:${checkPort}]`, true);
                return false;
            }
        }

        return true;
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
            let isDeclarationValid = await thisNode.ValidateNodeDeclaration(declaration);
            if (!isDeclarationValid) {
                // The remote node did not offer a MeshKey or the key does not match
                thisNode.log(`Node [${declaration.NodeID}] declaration could not be validated`);
                if (thisNode.Debug) {
                    console.dir(declaration);
                }
                sourceEndpoint.Close();
                return null;
            }

            let sourceIsRegistry = declaration.NodeRoles.indexOf("Registry") >= 0;

            // Should we redirect this Node to a Registry in another Zone?
            if (thisNode.IsRegistry() && !sourceIsRegistry && declaration.Zone !== thisNode.Zone) {
                // We are a Registry and a Node from another zone has connected to us
                let zoneRegistryList = thisNode.TopologyTracker.FindRegistriesInZone(declaration.Zone);
                if (zoneRegistryList.length > 0) {
                    // Let's tell the remote Node to redirect
                    let registryURLList = [];
                    for (let nodeEntry of zoneRegistryList) {
                        registryURLList.push(nodeEntry.NodeURL)
                    }

                    thisNode.log(`Redirecting Node[${declaration.NodeID}] to one of these registry URLs: ${registryURLList}`);
                    let redirectResults = await sourceEndpoint.SendCmd("DRP", "connectToRegistryInList", registryURLList, true, null, null);
                    if (redirectResults) {
                        // Successful - terminate connection
                        sourceEndpoint.Close();
                        return;
                    } else {
                        // Failure - client could not reach target Registry, let them stay here
                    }
                } else {
                    thisNode.log(`Could not find a Registry in Zone[${declaration.Zone}] for Node[${declaration.NodeID}]`);
                }
            }

            results = { status: "OK" };

            // Hold inbound requests from non-Registries until pending Registry connections complete
            if (thisNode.IsRegistry() && !sourceIsRegistry) {
                // If we have a Registry connection in flight, wait until that completes
                let timeoutCountdown = 10;
                while (thisNode.PendingRegistryConnections.size > 0 && timeoutCountdown > 0) {
                    // Wait 1 second then check again; timeout after 10 seconds
                    thisNode.log(`Remote node client [${declaration.NodeID}] connected, but outgoing registry connection in progress.  Waiting...`, true)
                    await thisNode.Sleep(1000);
                    timeoutCountdown--;
                }
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

            await thisNode.TopologyTracker.ProcessNodeConnect(sourceEndpoint, declaration, localNodeIsProxy);

        } else if (declaration.userAgent) {
            // We need to authenticate the Consumer.  Could be using a static token or a name/password.  Need to implement
            // an authentication function.  Authorization to be handled by target services.

            // Authenticate the consumer
            /** @type {DRP_AuthResponse} */
            let authResponse = await thisNode.Authenticate(declaration.user, declaration.pass, declaration.token);

            // Authentication function did not return successfully
            if (!authResponse) {
                thisNode.log(`Failed to authenticate Consumer`, true);
                //console.dir(declaration);
                //sourceEndpoint.Close();
                return null;
            }

            // Authentication 
            thisNode.log(`Authenticated Consumer`, true);
            //console.dir(authResponse);

            results = { status: "OK" };

            // This is a consumer declaration
            sourceEndpoint.EndpointType = "Consumer";
            sourceEndpoint.UserAgent = declaration.userAgent;
            // Assign Authentication Response
            sourceEndpoint.AuthInfo = {
                type: "token",
                value: authResponse.Token,
                userInfo: authResponse
            };
            // Moved from wsOpen handler
            if (!thisNode.ConsumerConnectionID) thisNode.ConsumerConnectionID = 1;
            // Assign ID using simple counter for now
            let remoteEndpointID = thisNode.ConsumerConnectionID;
            thisNode.ConsumerConnectionID++;

            sourceEndpoint.EndpointID = remoteEndpointID;
            thisNode.ConsumerEndpoints[remoteEndpointID] = sourceEndpoint;

            // Apply all Node Endpoint commands
            thisNode.ApplyConsumerEndpointMethods(sourceEndpoint);

            thisNode.log(`Added ConsumerEndpoint[${sourceEndpoint.EndpointID}], type '${sourceEndpoint.EndpointType}'`, true);
        }
        else results = "INVALID DECLARATION";

        return results;
    }

    /**
     * 
     * @param {DRP_TopologyPacket} topologyPacket DRP Topology Packet
     * @param {DRP_Endpoint} srcEndpoint Source Endpoint
     */
    async TopologyUpdate(topologyPacket, srcEndpoint) {
        let thisNode = this;
        thisNode.TopologyTracker.ProcessPacket(topologyPacket, srcEndpoint.EndpointID);
    }

    async PingDomainRegistries(domainName) {
        let thisNode = this;

        let srvHash = null;

        // Do we use a provided registry set or look up DNS SRV records for the domain?
        if (thisNode.RegistrySet) {
            // Registry set specified
            thisNode.log("RegistrySet specified, ignoring domain SRV records", true);
            if (thisNode.Debug) {
                console.dir(thisNode.RegistrySet);
            }
            srvHash = thisNode.RegistrySet;
        } else {
            // Get SRV Records for domain
            let recordList = await dns.resolveSrv(`_drp._tcp.${domainName}`);

            // Prep records
            srvHash = recordList.reduce((map, srvRecord) => {
                let key = `${srvRecord.name}-${srvRecord.port}`;
                srvRecord.pingInfo = null;
                map[key] = srvRecord;
                return map;
            }, {});
        }

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
     * Handle connection to Registry Node (post Hello)
     * @param {DRP_NodeClient} nodeClient Node client to Registry
     */
    async RegistryClientHandler(nodeClient, registryURL) {
        let thisNode = this;
        // Get peer info
        let getDeclarationResponse = await nodeClient.SendCmd("DRP", "getNodeDeclaration", null, true, null);
        if (!getDeclarationResponse || !getDeclarationResponse.NodeID) {
            thisNode.log(`Tried connecting to Registry at ${registryURL}, but getNodeDeclaration failed`);
            return false;
        }

        // Get Peer Declaration
        let peerDeclaration = getDeclarationResponse;

        // Verify the Peer is a Registry
        if (peerDeclaration.NodeRoles.indexOf("Registry") < 0) {
            // Peer is not a Registry; disconnect
            thisNode.log(`Tried connecting to Registry at ${registryURL}, but isConnectedToControlPlane == false`);
            return false;
        }

        // Add to Endpoints
        let registryNodeID = peerDeclaration.NodeID;
        nodeClient.EndpointID = registryNodeID;
        thisNode.NodeEndpoints[registryNodeID] = nodeClient;

        // Get Registry
        await thisNode.TopologyTracker.ProcessNodeConnect(nodeClient, peerDeclaration);

        thisNode.log(`Connected to Registry at ${registryURL}`);

        return true;
    }

    /**
    * Connect to a Registry node via URL
    * @param {string} registryURL DRP Domain FQDN
    * @param {function} openCallback Callback on connection open (Optional)
    * @param {function} closeCallback Callback on connection close (Optional)
    */
    async ConnectToRegistry(registryURL, openCallback, closeCallback, connTrackingObj) {
        let thisNode = this;
        let retryOnClose = true;
        if (!openCallback || typeof openCallback !== 'function') {
            openCallback = () => { };
        }
        if (closeCallback && typeof closeCallback === 'function') {
            retryOnClose = false;
        } else closeCallback = () => { };

        let errorCallback = (err) => {
            //thisNode.log(`Failed to connect to registry: ${registryURL}, ${err}`, true);
            thisNode.PendingRegistryConnections.delete(registryURL);
            if (connTrackingObj && typeof connTrackingObj === 'object') {
                connTrackingObj.lastConnectionSucceeded = false;
            }
        };

        thisNode.log(`Attempting to connect to registry: ${registryURL}`, true);

        thisNode.PendingRegistryConnections.add(registryURL);

        // Initiate Registry Connection
        let nodeClient = new DRP_NodeClient(registryURL, thisNode.WebProxyURL, thisNode, null, retryOnClose, async () => {

            if (connTrackingObj && typeof connTrackingObj === 'object') {
                connTrackingObj.lastConnectionSucceeded = true;
            }

            // This is the callback which occurs after our Hello packet has been accepted
            thisNode.log(`RegistryURL: ${registryURL}, IsRegistry: ${thisNode.IsRegistry()}, isConnectedToControlPlane: ${thisNode.isConnectedToControlPlane}`, true);

            // Run the normal RegistryClientHandler
            let connectionSuccessful = await thisNode.RegistryClientHandler(nodeClient, registryURL);

            if (connectionSuccessful) {
                if (connTrackingObj && typeof connTrackingObj === 'object') {
                    connTrackingObj.validatedRegistry = true;
                }
                openCallback();
            } else {
                nodeClient.Close();
            }

            thisNode.PendingRegistryConnections.delete(registryURL);

        }, closeCallback, errorCallback);
    }

    // This is for non-Registry nodes
    async ConnectToRegistryByDomain() {
        let thisNode = this;

        if (thisNode.isConnectingToControlPlane) {
            thisNode.log(`Executed ConnectToRegistryByDomain, but isConnectingToControlPlane == true`, true);
            return;
        }

        if (thisNode.isConnectedToControlPlane) {
            thisNode.log(`Executed ConnectToRegistryByDomain, but isConnectedToControlPlane == true`, true);
            return;
        }

        // Look up SRV records for DNS
        thisNode.log(`Looking up a Registry Node for domain [${thisNode.DomainName}]...`);
        thisNode.isConnectingToControlPlane = true;
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

                thisNode.ConnectToRegistry(registryURL, async () => {
                    thisNode.isConnectingToControlPlane = false;

                }, async () => {
                    thisNode.isConnectingToControlPlane = false;
                    // Disconnect Callback; try again if we're not connected to another Registry
                    if (!thisNode.isConnectedToControlPlane && !thisNode.isConnectingToControlPlane) {
                        thisNode.log(`Disconnected from Registry and not connected to control plane, contacting another Registry`);
                        thisNode.ConnectToRegistryByDomain();
                    }
                });

            } else {
                thisNode.isConnectingToControlPlane = false;
                thisNode.log(`Could not find active registry`);
                await thisNode.Sleep(5000);
                thisNode.ConnectToRegistryByDomain();
            }

        } catch (ex) {
            thisNode.isConnectingToControlPlane = false;
            thisNode.log(`Error resolving DNS: ${ex}`);
            await thisNode.Sleep(5000);
            thisNode.ConnectToRegistryByDomain();
        }
    }

    /**
     * This function is used by Registry Nodes to connect to other Registry Nodes using SRV records
     * */
    async ConnectToOtherRegistries() {
        let thisNode = this;
        try {

            let srvHash = await thisNode.PingDomainRegistries(thisNode.DomainName);
            let srvKeys = Object.keys(srvHash);

            // Insert a random delay of up to 5 seconds to avoid a race condition
            let startupDelayMs = Math.floor(Math.random() * 5000);
            await thisNode.Sleep(startupDelayMs);

            // Connect to all remote registries
            for (let i = 0; i < srvKeys.length; i++) {
                let checkRegistry = srvHash[srvKeys[i]];

                // Skip the local registry
                let checkNamePort = `^wss?://${checkRegistry.name}:${checkRegistry.port}$`;
                let regExp = new RegExp(checkNamePort, 'i');
                if (thisNode.ListeningURL.match(regExp)) {
                    continue;
                }

                // Dirty check to see if the port is SSL; are the last three digits 44x?
                let protocol = "ws";
                let portString = checkRegistry.port.toString();
                let checkString = portString.slice(-3, 3);
                if (checkString === "44") {
                    protocol = "wss";
                }

                // Define URL
                let registryURL = `${protocol}://${checkRegistry.name}:${checkRegistry.port}`;

                // See if the Registry has already connected to this one; if so, skip it
                let checkNodeID = thisNode.TopologyTracker.GetNodeWithURL(registryURL);
                if (checkNodeID) {
                    // Already connected
                    thisNode.log(`Registry Node [${checkNodeID}] connected to this node during the random startup wait, skipping client connection`, true);
                    continue;
                }

                // Is the registry host reachable?
                if (checkRegistry.pingInfo && checkRegistry.pingInfo.avg) {

                    // Connect to target
                    thisNode.ReconnectWaitTimeSeconds = 10;

                    let connTrackingObj = {
                        validatedRegistry: false
                    };

                    let registryDisconnectCallback = async () => {
                        if (!connTrackingObj.validatedRegistry) {
                            return;
                        }

                        if (connTrackingObj.lastConnectionSucceeded) {
                            thisNode.log(`Connection closed to registry ${registryURL}, waiting ${thisNode.ReconnectWaitTimeSeconds} seconds to reconnect`, true);
                        } else {
                            thisNode.log(`Connection failed to registry ${registryURL}, waiting ${thisNode.ReconnectWaitTimeSeconds} seconds to reconnect`, true);
                        }

                        // On failure, wait 10 seconds, see if the remote registry is connected back then try again
                        // For each attempt, increase the wait time by 10 seconds up to 5 minutes
                        await thisNode.Sleep(thisNode.ReconnectWaitTimeSeconds * 1000);
                        let targetNodeID = thisNode.TopologyTracker.GetNodeWithURL(registryURL);
                        if (!targetNodeID || !thisNode.NodeEndpoints[targetNodeID]) {
                            // We're still not connected to the remote Registry, try again
                            thisNode.ConnectToRegistry(registryURL, null, registryDisconnectCallback, connTrackingObj);
                            if (thisNode.ReconnectWaitTimeSeconds < 300) thisNode.ReconnectWaitTimeSeconds += 10;
                        }
                    };

                    thisNode.ConnectToRegistry(registryURL, null, registryDisconnectCallback, connTrackingObj);
                }
            }

        } catch (ex) {
            thisNode.log(`Error resolving DNS: ${ex}`);
        }
    }

    async EvacuateNode(targetNodeID) {
        let thisNode = this;
        /** @type DRP_Endpoint */
        let remoteEndpoint = thisNode.NodeEndpoints[targetNodeID];
        let remoteNodeEntry = thisNode.TopologyTracker.NodeTable[targetNodeID];
        if (!remoteNodeEntry.IsRegistry()) {
            // We need to find another Registry for the client

            let thisTopologyTracker = thisNode.TopologyTracker;
            let targetZone = remoteNodeEntry.Zone;

            let registryList = [];
            let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
            for (let i = 0; i < nodeIDList.length; i++) {
                // See if this entry is in the desired zone
                let checkNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
                if (checkNodeEntry.IsRegistry() && checkNodeEntry.NodeID != thisNode.NodeID && checkNodeEntry.Zone === targetZone) {
                    registryList.push(checkNodeEntry.NodeURL);
                }
            }

            if (!registryList.length > 0) {
                // Didn't find anything in that zone; look for any others
                for (let i = 0; i < nodeIDList.length; i++) {
                    // See if this entry is in the desired zone
                    let checkNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
                    if (checkNodeEntry.IsRegistry() && checkNodeEntry.NodeID != thisNode.NodeID) {
                        registryList.push(checkNodeEntry.NodeURL);
                    }
                }
            }

            if (!registryList.length > 0) {
                // This must be the last Registry, nowhere to retarget
                return false;
            }

            // Let's tell the remote Node to redirect
            thisNode.log(`Redirecting Node[${targetNodeID}] to one of these registry URLs: ${registryList}`);
            let redirectResults = await remoteEndpoint.SendCmd("DRP", "connectToRegistryInList", registryList, true, null, null);
            if (redirectResults) {
                // Successful - terminate connection
                remoteEndpoint.Close();
                return true;
            } else {
                // Failure - client could not reach target Registry, let them stay here
                return false;
            }
        }
        return false;
    }

    /**
     * Tell directly connected non-Registry nodes to go elsewhere
     */
    async Evacuate() {
        let thisNode = this;

        // Loop over NodeEndpoints
        let nodeIDList = Object.keys(thisNode.NodeEndpoints);
        thisNode.log(`Attempting to evacuate Nodes [${nodeIDList}]`, true);

        // Get topology from all nodes
        await Promise.all(nodeIDList.map(n => thisNode.EvacuateNode(n)));
        thisNode.log('Non-registry Nodes evacuated', true);

        return "Non-registry Nodes evacuated";
    }

    /**
    * Connect to a specific Registry URL
    * @param {string[]} registryList DRP Domain FQDN
    * @param {DRP_NodeClient} endpoint Callback on connection close (Optional)
    * @returns {Promise} Returns Promise
    */
    ConnectToRegistryInList(registryList, endpoint) {
        let thisNode = this;

        let targetRegistryURL = registryList[Math.floor(Math.random() * registryList.length)];

        // We've been asked to contact another Registry
        thisNode.log(`We've been asked to contact another Registry in list [${registryList}], selected ${targetRegistryURL}`);

        let returnVal = new Promise(function (resolve, reject) {
            thisNode.ConnectToRegistry(targetRegistryURL, () => {
                // We've connected to the new Registry; close the connection to the previous one
                //thisNode.log(`Closing redundant Registry connection at ${endpoint.wsTarget}`);
                //endpoint.Close();
                resolve(true);
            }, () => {
                // The connection closed; fallback to connection by domain (SRV lookup)
                if (!thisNode.isConnectedToControlPlane && !thisNode.isConnectingToControlPlane) {
                    thisNode.ConnectToRegistryByDomain();
                    resolve(false);
                }
            });
        });
        return returnVal;
    }

    /**
     * 
     * @param {function} onControlPlaneConnect Execute after connection to Control Plane
     */
    async ConnectToMesh(onControlPlaneConnect) {
        let thisNode = this;
        if (onControlPlaneConnect) thisNode.onControlPlaneConnect = onControlPlaneConnect;
        // If this is a Registry, seed the Registry with it's own declaration
        if (thisNode.IsRegistry()) {
            if (this.DomainName) {
                // A domain name was provided; attempt to cluster with other registry hosts
                this.log(`This node is a Registry for ${this.DomainName}, attempting to contact other Registry nodes`);
                this.ConnectToOtherRegistries();
            }
            if (thisNode.onControlPlaneConnect && typeof thisNode.onControlPlaneConnect === "function") thisNode.onControlPlaneConnect();
        } else {
            if (this.RegistryUrl) {
                // A specific Registry URL was provided
                this.ConnectToRegistry(this.RegistryUrl);
            } else if (this.DomainName) {
                // A domain name was provided; attempt to connect to a registry host
                this.ConnectToRegistryByDomain();
            } else {
                // No Registry URL or domain provided
                this.Die("No DomainName or RegistryURL provided!");
            }
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
            thisNode.log(`Received back request, connecting to [${targetNodeID}] @ ${targetURL}`, true);
            thisNode.NodeEndpoints[targetNodeID] = new DRP_NodeClient(targetURL, thisNode.WebProxyURL, thisNode, targetNodeID, false, null, null);
        }
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            for (let attrName in oTargetObject) {
                if (attrName.substring(0, 2) === '__') continue;
                let returnVal;
                let childAttrObj = oTargetObject[attrName];
                let attrType = Object.prototype.toString.call(childAttrObj).match(/^\[object (.*)\]$/)[1];

                switch (attrType) {
                    case "Object":
                        returnVal = Object.keys(childAttrObj).length;
                        break;
                    case "Array":
                        returnVal = childAttrObj.length;
                        break;
                    case "Set":
                        returnVal = childAttrObj.size;
                        break;
                    case "Function":
                        returnVal = null;
                        break;
                    default:
                        returnVal = childAttrObj;
                }

                let pathObj = {
                    "Name": attrName,
                    "Type": attrType,
                    "Value": returnVal
                };

                if (childAttrObj) {
                    pathObj.Type = childAttrObj.constructor.name;
                    switch (pathObj.Type) {
                        case "DRP_TopicMessage":
                            pathObj.Value = childAttrObj.TimeStamp;
                            break;
                        default:
                    }
                }

                pathObjList.push(pathObj);
            }
        }
        return pathObjList;
    }

    IsRegistry() {
        let thisNode = this;
        let isRegistry = thisNode.NodeRoles.indexOf("Registry") >= 0;
        return isRegistry;
    }

    IsBroker() {
        let thisNode = this;
        let isBroker = thisNode.NodeRoles.indexOf("Broker") >= 0;
        return isBroker;
    }

    IsPortal() {
        let thisNode = this;
        let isPortal = thisNode.NodeRoles.indexOf("Portal") >= 0;
        return isPortal;
    }

    IsRelay() {
        let thisNode = this;
        let isRelay = thisNode.NodeRoles.indexOf("Relay") >= 0;
        return isRelay;
    }

    IsSidecar() {
        let thisNode = this;
        let isSidecar = thisNode.NodeRoles.indexOf("Sidecar") >= 0;
        return isSidecar;
    }

    /**
     * Tell whether this Node is a proxy for another Node
     * @param {string} checkNodeID Node to check
     * @returns {boolean} Is this node a proxy?
     */
    IsProxyFor(checkNodeID) {
        let thisNode = this;
        let isProxy = false;
        let checkNodeEntry = thisNode.TopologyTracker.NodeTable[checkNodeID];
        if (checkNodeEntry && checkNodeEntry.ProxyNodeID === thisNode.NodeID) {
            isProxy = true;
        }
        return isProxy;
    }

    /**
     * Tell whether this Node is connected to another Node
     * @param {string} checkNodeID Node to check
     * @returns {boolean} Is this node connected?
     */
    IsConnectedTo(checkNodeID) {
        let thisNode = this;
        let isConnected = false;
        let checkNodeEntry = thisNode.NodeEndpoints[checkNodeID];
        if (checkNodeEntry) {
            isConnected = true;
        }
        return isConnected;
    }

    async GetTopology(params, callingEndpoint, token) {
        let thisNode = this;
        let topologyObj = {};

        // Define function to get topology per node
        let GetTopologyInfoFromNode = async (targetNodeID) => {
            let topologyNode = {};

            let nodeTableEntry = thisNode.TopologyTracker.NodeTable[targetNodeID];
            let nodeClientConnections = await thisNode.ServiceCmd("DRP", "listClientConnections", null, {
                targetNodeID: targetNodeID,
                useControlPlane: true,
                callingEndpoint: callingEndpoint
            });
            let nodeServices = await thisNode.ServiceCmd("DRP", "getLocalServiceDefinitions", null, {
                targetNodeID: targetNodeID,
                useControlPlane: true,
                callingEndpoint: callingEndpoint
            });

            // Assign Node Table Entry attributes
            Object.assign(topologyNode, nodeTableEntry);

            // Assign Client Connections
            topologyNode.NodeClients = nodeClientConnections.nodeClients;
            topologyNode.ConsumerClients = nodeClientConnections.consumerClients;

            // Assign Services
            topologyNode.Services = nodeServices;

            // Return Node Topology
            return topologyNode;
        };

        // We need to get a list of all nodes from the registry
        let nodeIDList = Object.keys(thisNode.TopologyTracker.NodeTable);

        // Get topology from all nodes
        let topologyObjList = await Promise.all(nodeIDList.map(n => GetTopologyInfoFromNode(n)));

        // Convert to dictionary
        topologyObj = Object.assign({}, ...topologyObjList.map((x) => ({ [x.NodeID]: x })));

        return topologyObj;
    }

    /**
     * 
     * @param {string} reason Reason for Node termination
     */
    Die(reason) {
        let thisNode = this;
        thisNode.log(`TERMINATING - ${reason}`, false);
        process.exit(1);
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
            let nodeEndpoint = thisNode.NodeEndpoints[nodeID];
            if (nodeEndpoint.IsServer()) {
                nodeClientConnections.nodeClients[nodeID] = nodeEndpoint.ConnectionStats();
            }
        }

        // Loop over ConsumerEndpoints
        let consumerIDList = Object.keys(thisNode.ConsumerEndpoints);
        for (let i = 0; i < consumerIDList.length; i++) {
            let consumerID = consumerIDList[i];
            /** @type DRP_Endpoint */
            let consumerEndpoint = thisNode.ConsumerEndpoints[consumerID];
            let userInfo = consumerEndpoint.AuthInfo.userInfo;
            let consumerObj = {
                UserName: userInfo.UserName,
                FullName: userInfo.FullName,
                Groups: userInfo.Groups,
                IPAddress: consumerEndpoint.RemoteAddress(),
                Port: consumerEndpoint.RemotePort()
            }
            Object.assign(consumerObj, consumerEndpoint.ConnectionStats());
            nodeClientConnections.consumerClients[consumerID] = consumerObj;

        }

        return nodeClientConnections;
    }

    RemoveEndpoint(staleEndpoint, callback) {
        let thisNode = this;
        let staleEndpointID = staleEndpoint.EndpointID;
        if (staleEndpointID) {
            switch (staleEndpoint.EndpointType) {
                case "Node":
                    if (thisNode.NodeEndpoints[staleEndpointID]) {
                        thisNode.log(`Removing disconnected node [${staleEndpointID}]`, true);
                        thisNode.NodeEndpoints[staleEndpointID].RemoveSubscriptions();
                        delete thisNode.NodeEndpoints[staleEndpointID];
                        thisNode.TopologyTracker.ProcessNodeDisconnect(staleEndpointID);
                    }
                    break;
                case "Consumer":
                    if (thisNode.ConsumerEndpoints[staleEndpointID]) {
                        thisNode.ConsumerEndpoints[staleEndpointID].RemoveSubscriptions();
                        delete thisNode.ConsumerEndpoints[staleEndpointID];
                    }
                    break;
                default:
            }
        }
        if (callback && typeof callback === 'function') {
            callback();
        }
    }

    /**
     * Add Generic Methods to Endpoint
     * @param {DRP_Endpoint} targetEndpoint Endpoint to add methods to
     */
    ApplyGenericEndpointMethods(targetEndpoint) {
        let thisNode = this;

        targetEndpoint.RegisterMethod("getEndpointID", async function (...args) {
            return targetEndpoint.EndpointID;
        });

        targetEndpoint.RegisterMethod("getNodeDeclaration", async function (...args) {
            return thisNode.__GetNodeDeclaration();
        });

        targetEndpoint.RegisterMethod("pathCmd", async (params, srcEndpoint, token) => {
            return await thisNode.PathCmd(params, thisNode.GetBaseObj(), srcEndpoint);
        });

        targetEndpoint.RegisterMethod("getRegistry", (params, srcEndpoint, token) => {
            return thisNode.TopologyTracker.GetRegistry(params.reqNodeID);
        });

        targetEndpoint.RegisterMethod("getServiceDefinition", (...args) => {
            return thisNode.GetServiceDefinition(...args);
        });

        targetEndpoint.RegisterMethod("getServiceDefinitions", async function (...args) {
            return await thisNode.GetServiceDefinitions(...args);
        });

        targetEndpoint.RegisterMethod("getLocalServiceDefinitions", function (...args) {
            return thisNode.GetLocalServiceDefinitions(...args);
        });

        targetEndpoint.RegisterMethod("getClassRecords", async (...args) => {
            return await thisNode.GetClassRecords(...args);
        });

        targetEndpoint.RegisterMethod("listClassInstances", async (...args) => {
            return await thisNode.ListClassInstances(...args);
        });

        targetEndpoint.RegisterMethod("sendToTopic", function (params, srcEndpoint, token) {
            thisNode.TopicManager.SendToTopic(params.serviceName, params.topicName, params.topicData);
        });

        targetEndpoint.RegisterMethod("getTopology", async function (...args) {
            return await thisNode.GetTopology(...args);
        });

        targetEndpoint.RegisterMethod("listClientConnections", function (...args) {
            return thisNode.ListClientConnections(...args);
        });

        targetEndpoint.RegisterMethod("tcpPing", async (...args) => {
            return thisNode.TCPPing(...args);
        });

        targetEndpoint.RegisterMethod("ping", async (paramsObj) => {
            let params = DRP_GetParams(paramsObj, ['host', 'timeout', 'min_reply']);
            let host = params['host'];
            let timeout = params['timeout'] || 1;
            let min_reply = params['min_reply'] || 1;

            // Reject if no hostname was supplied
            if (!host) {
                throw new DRP_CmdError(`Must provide hostname`, DRP_ErrorCode.BADREQUEST, "ping");
            }

            let options = {
                timeout: timeout,
                min_reply: min_reply,
            };

            let pingResults = await ping.promise.probe(host, options);
            return pingResults;
        });

        targetEndpoint.RegisterMethod("resolve", async (paramsObj) => {
            let params = DRP_GetParams(paramsObj, ['hostname', 'type', 'server']);
            let hostname = params['hostname'];
            let type = params['type'];
            let dnsServer = params['server'];
            let resolver = dns;

            if (dnsServer) {
                resolver = new dns.Resolver();
                resolver.setServers([dnsServer]);
            }

            // Reject if no hostname was supplied
            if (!hostname) {
                throw new DRP_CmdError(`Must provide hostname`, DRP_ErrorCode.BADREQUEST, "resolve");
            }

            return await resolver.resolve(hostname, type);
        });

        targetEndpoint.RegisterMethod("findInstanceOfService", async (params) => {
            return thisNode.TopologyTracker.FindInstanceOfService(params.serviceName, params.serviceType, params.zone);
        });

        targetEndpoint.RegisterMethod("listNodes", async (paramsObj, srcEndpoint, token) => {
            let methodParams = ['zoneName'];
            let params = DRP_GetParams(paramsObj, methodParams);

            return thisNode.TopologyTracker.ListNodes(params.zoneName);
        });

        targetEndpoint.RegisterMethod("listServices", async (paramsObj, srcEndpoint, token) => {
            let methodParams = ['zoneName'];
            let params = DRP_GetParams(paramsObj, methodParams);

            return thisNode.TopologyTracker.ListServices(params.zoneName);
        });

        targetEndpoint.RegisterMethod("subscribe", async function (params, srcEndpoint, token) {
            // Only allow if the scope is local or this Node is a Broker|Portal|Relay
            if (params.scope !== "local" && !thisNode.IsBroker() && !thisNode.IsPortal() && !thisNode.IsRelay()) return null;

            let sendFunction = async (message) => {
                // Returns send status; error if not null
                return await srcEndpoint.SendReply(params.streamToken, 2, null, message);
            };
            let sendFailCallback = async (sendFailMsg) => {
                // Failed to send; may have already disconnected, take no further action
            };

            let thisSubscription = new DRP_Subscriber(params.serviceName || null, params.topicName, params.scope, params.filter, params.targetNodeID, thisNode.IsTrue(params.singleInstance), sendFunction, sendFailCallback);
            srcEndpoint.Subscriptions[params.streamToken] = thisSubscription;
            let results = await thisNode.SubscriptionManager.RegisterSubscription(thisSubscription);
            return results;
            //return await thisNode.Subscribe(thisSubscription);
        });

        targetEndpoint.RegisterMethod("unsubscribe", async function (params, srcEndpoint, token) {
            let response = false;
            let thisSubscription = srcEndpoint.Subscriptions[params.streamToken];
            if (thisSubscription) {
                thisSubscription.Terminate();
                thisNode.SubscriptionManager.Subscribers.delete(thisSubscription);
                response = true;
            }
            return response;
        });
    }

    /**
     * Add Methods to Node Endpoint
     * @param {DRP_Endpoint} targetEndpoint Endpoint to add methods to
     */
    ApplyNodeEndpointMethods(targetEndpoint) {
        let thisNode = this;

        thisNode.ApplyGenericEndpointMethods(targetEndpoint);

        targetEndpoint.RegisterMethod("topologyUpdate", async function (...args) {
            return thisNode.TopologyUpdate(...args);
        });

        targetEndpoint.RegisterMethod("connectToNode", async function (...args) {
            return await thisNode.ConnectToNode(...args);
        });

        targetEndpoint.RegisterMethod("addConsumerToken", async function (params, srcEndpoint, token) {
            if (params.tokenPacket) {
                thisNode.ConsumerTokens[params.tokenPacket.Token] = params.tokenPacket;
            }
            return;
        });

        if (targetEndpoint.IsServer && !targetEndpoint.IsServer()) {
            // Add this command for DRP_Client endpoints
            targetEndpoint.RegisterMethod("connectToRegistryInList", async function (...args) {
                return await thisNode.ConnectToRegistryInList(...args);
            });
        }
    }

    /**
     * Add Methods to Consumer Endpoint
     * @param {DRP_Endpoint} targetEndpoint Endpoint to add methods to
     */
    ApplyConsumerEndpointMethods(targetEndpoint) {
        let thisNode = this;

        thisNode.ApplyGenericEndpointMethods(targetEndpoint);

        targetEndpoint.RegisterMethod("getUserInfo", async function (params, srcEndpoint, token) {
            return targetEndpoint.AuthInfo.userInfo;
        });
    }

    /**
     * Register new subscription
     * @param {string} serviceName Topic name to subscribe to
     * @param {string} topicName Topic name to subscribe to
     * @param {string} scope Subscription scope [local,zone,global]
     * @param {Object<string,string>} filter Subscription filter
     * @param {string} targetNodeID Specify target Node ID
     * @param {boolean} singleInstance Limit subscription to single instance
     * @param {function} msgCb Function to execute on message receipt
     * @param {function} failCb Function to execute on message fail
     */
    async Subscribe(serviceName, topicName, scope, filter, targetNodeID, singleInstance, msgCb, failCb) {
        let thisNode = this;

        let thisSubscription = new DRP_Subscriber(serviceName, topicName, scope, filter, targetNodeID, thisNode.IsTrue(singleInstance), msgCb, failCb);
        let subscriptionSuccessful = await thisNode.SubscriptionManager.RegisterSubscription(thisSubscription);
        return subscriptionSuccessful ? thisSubscription : null;
    }

    /**
     * 
     * @param {string} targetNodeID Target Node ID
     * @param {string} topicName Topic Name
     * @param {string} scope Scope
     * @param {function} streamProcessor Function for processing stream data
     * @returns {string} Subscription token
     */
    async SubscribeRemote(targetNodeID, serviceName, topicName, scope, streamProcessor) {
        let thisNode = this;
        let returnVal = null;
        // Subscribe to a remote topic
        let thisNodeEndpoint = await thisNode.VerifyNodeConnection(targetNodeID);
        if (!thisNodeEndpoint) {
            // Could not contact remote endpoint
            thisNode.log(`Could not connect to Node [${targetNodeID}] to subscribe to topic ${topicName}`)
            return returnVal;
        }
        let sourceStreamToken = thisNodeEndpoint.AddReplyHandler(streamProcessor);

        // Await for command from source node
        let successful = await thisNodeEndpoint.SendCmd("DRP", "subscribe", { serviceName: serviceName, topicName: topicName, streamToken: sourceStreamToken, scope: scope }, true, null);
        if (successful) returnVal = sourceStreamToken;
        return returnVal;
    }

    /**
     * 
     * @param {string} targetNodeID Target Node ID
     * @param {string} streamToken Stream Token
     */
    async UnsubscribeRemote(targetNodeID, streamToken) {
        let thisNode = this;
        let returnVal = null;
        // Unsubscribe from a remote topic
        let thisNodeEndpoint = await thisNode.VerifyNodeConnection(targetNodeID);

        // If thisNodeEndpoint is null, it means the connection has already been terminated
        if (!thisNodeEndpoint) return;

        // Delete the reply handler
        thisNodeEndpoint.DeleteReplyHandler(streamToken);

        // Tell remote node this streamToken is no longer valid
        await thisNodeEndpoint.SendCmd("DRP", "unsubscribe", { "streamToken": streamToken }, true, null);
    }

    async Authenticate(userName, password, token) {
        let thisNode = this;
        let authenticationServiceName = null;
        let authResponse = null;

        // If a token is provided, skip the rest of the process
        if (token) {
            return thisNode.ConsumerTokens[token];
        }

        if (this.AuthenticationServiceName) {
            // This Node has been configured to use a specific Authentication service
            authenticationServiceName = this.AuthenticationServiceName;
        } else {
            // Use the best available
            let authenticationServiceRecord = thisNode.TopologyTracker.FindInstanceOfService(null, "Authenticator");
            if (authenticationServiceRecord) authenticationServiceName = authenticationServiceRecord.Name;
        }
        if (authenticationServiceName) {
            authResponse = await thisNode.ServiceCmd(authenticationServiceName, "authenticate", new DRP_AuthRequest(userName, password, token), {
                useControlPlane: true
            });
        } else {
            // No authentication service found
            thisNode.log(`Attempted to authenticate Consumer but no Authenticator was specified or found`, true);
        }
        return authResponse;
    }

    async TCPPing(paramsObj, srcEndpoint, token) {
        let thisNode = this;
        let methodParams = ['address', 'port', 'timeout', 'attempts'];
        let params = DRP_GetParams(paramsObj, methodParams);

        let pingInfo = null;

        if (!params.address || !params.port) {
            throw new DRP_CmdError(`Must provide address and port`, DRP_ErrorCode.BADREQUEST, "TCPPing");
        }

        if (params.timeout && isNaN(params.timeout)) {
            throw new DRP_CmdError(`Timeout must be a number: [${params.timeout}]`, DRP_ErrorCode.BADREQUEST, "PathCmd");
        }

        if (params.attempts && isNaN(params.attempts)) {
            throw new DRP_CmdError(`Attempts must be a number: [${params.attempts}]`, DRP_ErrorCode.BADREQUEST, "PathCmd");
        }

        pingInfo = await tcpPing({
            address: params.address,
            port: params.port,
            timeout: parseInt(params.timeout) || 3000,
            attempts: parseInt(params.attempts) || 1
        });

        return pingInfo;
    }

    async Sleep(ms) {
        await new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * See if call is restricted for object
     * @param {any} securityObj
     * @param {DRP_MethodParams} params
     */
    IsRestricted(securityObj, params) {
        let authInfo = params.__authInfo;
        try {
            if (authInfo && authInfo.type) {
                // Is it a token or a key?
                switch (authInfo.type) {
                    case 'key':
                        if (securityObj.Keys.indexOf(authInfo.value) >= 0) return false;
                        break;
                    case 'token':
                        // We need to look over the user's groups and see if any are in the group list
                        for (let i = 0; i < authInfo.userInfo.Groups.length; i++) {
                            let userGroupName = authInfo.userInfo.Groups[i];
                            if (securityObj.Groups.indexOf(userGroupName) >= 0) return false;
                        }
                        break;
                    default:
                }
            }
            return true;
        } catch (ex) {
            return false;
        }
    }

    IsTrue(value) {
        if (typeof (value) === 'string') {
            value = value.trim().toLowerCase();
        }
        switch (value) {
            case true:
            case "true":
            case 1:
            case "1":
            case "on":
            case "y":
            case "yes":
                return true;
            default:
                return false;
        }
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
    constructor(wsTarget, proxy, drpNode, endpointID, retryOnClose, openCallback, closeCallback, errorCallback) {
        super(wsTarget, proxy, drpNode, endpointID, "Node");
        this.retryOnClose = retryOnClose;
        this.proxy = proxy;
        this.openCallback = openCallback;
        this.closeCallback = closeCallback;
        this.errorCallback = errorCallback;
        // Register Endpoint commands
        // (methods should return output and optionally accept [params, token] for streaming)

        this.DRPNode.ApplyNodeEndpointMethods(this);
    }

    // Define Handlers
    async OpenHandler() {
        super.OpenHandler();
        if (this.DRPNode.Debug) this.DRPNode.log("Node client [" + this.RemoteAddress() + ":" + this.RemotePort() + "] opened");
        let response = await this.SendCmd("DRP", "hello", this.DRPNode.__GetNodeDeclaration(), true, null);
        if (this.openCallback && typeof this.openCallback === 'function') {
            this.openCallback(response);
        }
    }

    async CloseHandler(closeCode) {
        let thisEndpoint = this;
        if (thisEndpoint.RemoteAddress() && thisEndpoint.RemotePort()) {
            // This was a successful connection that is now closed
            if (this.DRPNode.Debug) this.DRPNode.log("Node client [" + thisEndpoint.RemoteAddress() + ":" + thisEndpoint.RemotePort() + "] closed with code [" + closeCode + "]");
        } else {
            // Connection was not made
        }

        thisEndpoint.DRPNode.RemoveEndpoint(thisEndpoint, thisEndpoint.closeCallback);

        if (this.retryOnClose) {
            thisEndpoint.DRPNode.log(`Will retry connection in 5 seconds...`, true);
            await thisEndpoint.DRPNode.Sleep(5000);
            this.RetryConnection();
        }
    }

    async ErrorHandler(error) {
        if (this.DRPNode.Debug) this.DRPNode.log("Node client encountered error [" + error + "]");
        if (this.errorCallback && typeof this.errorCallback === "function") {
            this.errorCallback(error);
        }
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
        this.DRPNode = drpNode;
        /** @type {Object.<string,DRP_NodeTableEntry>} */
        this.NodeTable = new DRP_NodeTable();
        /** @type {Object.<string,DRP_ServiceTableEntry>} */
        this.ServiceTable = new DRP_ServiceTable();

        this.GetNextHop = this.GetNextHop;
        this.GetServicesWithProviders = this.GetServicesWithProviders;
        this.ListNodes = this.ListNodes;
        this.ListServices = this.ListServices;
        this.ListZones = this.ListZones;
        this.ListConnectedRegistryNodes = this.ListConnectedRegistryNodes;
        this.FindRegistriesInZone = this.FindRegistriesInZone;
        this.FindInstanceOfService = this.FindInstanceOfService;
    }

    /**
     * 
     * @param {DRP_TopologyPacket} topologyPacket DRP Topology Packet
     * @param {string} srcNodeID Node we received this from
     * @param {string} sourceIsRegistry Is the source node a Registry?
     */
    ProcessPacket(topologyPacket, srcNodeID, sourceIsRegistry) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;
        let targetTable = null;
        /** @type {DRP_TrackingTableEntry} */
        let topologyEntry = null;

        /** @type {DRP_TrackingTableEntry} */
        let advertisedEntry = topologyPacket.data;
        let thisNodeEntry = thisTopologyTracker.NodeTable[thisNode.NodeID];
        let sourceNodeEntry = thisTopologyTracker.NodeTable[srcNodeID];
        let advertisedNodeEntry = thisTopologyTracker.NodeTable[topologyPacket.data.NodeID];
        let learnedFromEntry = thisTopologyTracker.NodeTable[topologyPacket.data.LearnedFrom];

        //thisNode.log(`ProcessPacket -> ${JSON.stringify(topologyPacket)}`);

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
                    thisNode.log(`We've received a topologyPacket for a record we already have: ${topologyPacket.type}[${topologyPacket.id}]`, true);

                    // If we're a Registry and the learned entry is a Registry, ignore it
                    if (thisNodeEntry.IsRegistry() && advertisedNodeEntry.IsRegistry()) return;

                    // Someone sent us info about the local node; ignore it
                    if (advertisedEntry.NodeID === thisNodeEntry.NodeID) return;

                    // We knew about the entry before, but the node just connected to us
                    if (advertisedEntry.NodeID === srcNodeID && targetTable[topologyPacket.id].LearnedFrom !== srcNodeID) {
                        // This is a direct connection from the source; update the LearnedFrom
                        if (thisNode.IsRegistry()) {
                            // Another Registry has made a warm Node handoff to this one
                            thisNode.log(`Updating LearnedFrom for ${topologyPacket.type} [${topologyPacket.id}] from [${targetTable[topologyPacket.id].LearnedFrom}] to [${srcNodeID}]`, true);
                            targetTable[topologyPacket.id].LearnedFrom = srcNodeID;

                            // We may want to redistribute
                            topologyEntry = targetTable[topologyPacket.id];
                            break;
                        } else {
                            if (sourceIsRegistry || sourceNodeEntry && sourceNodeEntry.IsRegistry()) {
                                // A Registry Node has connected to this non-Registry node.
                                thisNode.log(`Connected to new Registry, overwriting LearnedFrom for ${topologyPacket.type} [${topologyPacket.id}] from [${targetTable[topologyPacket.id].LearnedFrom}] to [${srcNodeID}]`, true);
                                targetTable.AddEntry(topologyPacket.id, topologyPacket.data, thisNode.getTimestamp());
                            } else {
                                // A non-Registry Node has connected to this non-Registry node.  Do not update LearnedFrom.
                            }
                            return;
                        }
                    }

                    // We are a Registry and learned about a newer route from another Registry; warm handoff?
                    if (thisNode.IsRegistry() &&
                        (sourceIsRegistry || sourceNodeEntry && sourceNodeEntry.IsRegistry()) &&
                        advertisedEntry.LearnedFrom === advertisedEntry.NodeID) {
                        //thisNode.log(`Ignoring ${topologyPacket.type} table entry [${topologyPacket.id}] from Node [${srcNodeID}], not not relayed from an authoritative source`);
                        thisNode.log(`Updating LearnedFrom for ${topologyPacket.type} [${topologyPacket.id}] from [${targetTable[topologyPacket.id].LearnedFrom}] to [${srcNodeID}]`, true);
                        targetTable[topologyPacket.id].LearnedFrom = srcNodeID;

                        // We wouldn't want to redistribute to other registries and we wouldn't need to redistribute to other nodes connected to us
                        return;
                    }

                    // We are not a Registry and Received this from a Registry after failure
                    if (!thisNode.IsRegistry() && (sourceIsRegistry || sourceNodeEntry && sourceNodeEntry.IsRegistry())) {
                        // We must have learned from a new Registry; treat like an add
                        topologyPacket.data.LearnedFrom = srcNodeID;
                        thisNode.log(`Connected to new Registry, overwriting LearnedFrom for ${topologyPacket.type} [${topologyPacket.id}] from [${targetTable[topologyPacket.id].LearnedFrom}] to [${srcNodeID}]`, true);
                        targetTable.AddEntry(topologyPacket.id, topologyPacket.data, thisNode.getTimestamp());
                    }
                    return;
                } else {
                    // If this is a Registry receiving a second hand advertisement about another Registry, ignore it
                    if (thisNode.IsRegistry() && topologyPacket.type === "node" && topologyPacket.data.Roles.indexOf("Registry") >= 0 && srcNodeID !== advertisedEntry.NodeID) return;

                    // If this is a Registry and the sender didn't get it from an authoritative source, ignore it
                    if (thisNode.IsRegistry() && topologyPacket.data.NodeID !== thisNode.NodeID && topologyPacket.data.LearnedFrom !== topologyPacket.data.NodeID && topologyPacket.data.LearnedFrom !== topologyPacket.data.ProxyNodeID) {
                        thisNode.log(`Ignoring ${topologyPacket.type} table entry [${topologyPacket.id}] from Node [${srcNodeID}], not relayed from an authoritative source`, true);
                        return;
                    }

                    // If this is a service entry and we don't have a corresponding node table entry, ignore it
                    if (topologyPacket.type === "service" && !thisTopologyTracker.NodeTable[topologyPacket.data.NodeID]) {
                        thisTopologyTracker.DRPNode.log(`Ignoring service table entry [${topologyPacket.id}], no matching node table entry`, true);
                        return;
                    }

                    // We don't have this one; add it and advertise
                    topologyPacket.data.LearnedFrom = srcNodeID;

                    // Add to the target table
                    targetTable.AddEntry(topologyPacket.id, topologyPacket.data, thisNode.getTimestamp());
                    topologyEntry = targetTable[topologyPacket.id];

                    // If this is a Registry, the new node is a Registry for another zone and we have connected endpoints for that zone, evacuate them
                    if (thisNode.IsRegistry() && topologyPacket.type === "node" && topologyPacket.data.Roles.indexOf("Registry") >= 0 && srcNodeID === advertisedEntry.NodeID && thisNode.Zone !== topologyPacket.zone) {
                        // Loop over connected Endpoints, see if any are non-registry and in the same zone as the new Registry
                        let endpointList = Object.keys(thisNode.NodeEndpoints);
                        for (let checkNodeId of endpointList) {
                            thisNode.log(`Evaluating connected Node [${checkNodeId}] for possible evacuation...`, true);
                            let checkNodeEntry = thisTopologyTracker.NodeTable[checkNodeId];
                            if (!checkNodeEntry) {
                                // This will occur if the Node is still in the process of connecting
                                thisNode.log(`No NodeTable entry for connected Node [${checkNodeId}], possibly still connecting`, true);
                                continue;
                            }
                            if (checkNodeEntry.Zone === topologyPacket.zone && !checkNodeEntry.IsRegistry()) {
                                // Evacuate the Node
                                thisNode.log(`Evacuating Node [${checkNodeId}] to new Registry in zone [${checkNodeEntry.Zone}]`, true);
                                thisNode.EvacuateNode(checkNodeId);
                            }
                        }
                    }
                }
                break;
            case "update":
                if (targetTable[topologyPacket.id]) {
                    targetTable.UpdateEntry(topologyPacket.id, topologyPacket.data, thisNode.getTimestamp());
                    topologyEntry = targetTable[topologyPacket.id];
                } else {
                    thisNode.log(`Could not update non-existent ${topologyPacket.type} entry ${topologyPacket.id}`, true);
                    return;
                }
                break;
            case "delete":
                // Only delete if we learned the packet from the sourceID or if we are the source (due to disconnect)
                if (topologyPacket.id === thisNode.NodeID && topologyPacket.type === "node") {
                    thisNode.log(`This node tried to delete itself.  Why?`, true);
                    //console.dir(topologyPacket);
                    return;
                }
                // Update this rule so that if the table LearnedFrom is another Registry, do not delete or relay!  We are no longer authoritative
                let isTargetNodeSource = targetTable[topologyPacket.id].NodeID === srcNodeID;
                let isTargetLearnedFromSource = targetTable[topologyPacket.id].LearnedFrom === srcNodeID;
                let isLocalNodeSource = thisNode.NodeID === srcNodeID;

                if (targetTable[topologyPacket.id] && (isTargetNodeSource || isTargetLearnedFromSource) || isLocalNodeSource) {
                    topologyEntry = targetTable[topologyPacket.id];
                    delete targetTable[topologyPacket.id];
                    if (topologyPacket.type === "node") {
                        // Delete services from this node
                        let serviceIDList = Object.keys(thisTopologyTracker.ServiceTable);
                        for (let i = 0; i < serviceIDList.length; i++) {
                            /** @type {DRP_ServiceTableEntry} */
                            let serviceInstanceID = serviceIDList[i];
                            let thisServiceEntry = thisTopologyTracker.ServiceTable[serviceInstanceID];
                            if (thisServiceEntry.NodeID === topologyPacket.id || thisServiceEntry.LearnedFrom === topologyPacket.id) {
                                thisNode.log(`Removing entries learned from [${topologyPacket.id}] -> Service[${serviceInstanceID}]`, true);
                                delete thisTopologyTracker.ServiceTable[serviceInstanceID];
                            }
                        }

                        // Remove any dependent Nodes
                        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
                        for (let i = 0; i < nodeIDList.length; i++) {
                            let checkNodeID = nodeIDList[i];
                            let checkNodeEntry = thisTopologyTracker.NodeTable[checkNodeID];
                            if (checkNodeEntry.LearnedFrom === topologyPacket.id) {
                                // Delete this entry
                                thisNode.log(`Removing entries learned from [${topologyPacket.id}] -> Node[${checkNodeEntry.NodeID}]`, true);
                                let nodeDeletePacket = new DRP_TopologyPacket(checkNodeEntry.NodeID, "delete", "node", checkNodeEntry.NodeID, checkNodeEntry.Scope, checkNodeEntry.Zone, checkNodeEntry);
                                thisTopologyTracker.ProcessPacket(nodeDeletePacket, checkNodeEntry.NodeID);
                            }
                        }
                    }
                } else {
                    // Ignore delete command
                    thisNode.log(`Ignoring delete from Node[${srcNodeID}]`, true);
                    let tableEntryExists = false;
                    if (targetTable[topologyPacket.id]) tableEntryExists = true;
                    if (thisNode.Debug) {
                        console.dir({
                            tableEntryExists: tableEntryExists,
                            isTargetNodeSource: isTargetNodeSource,
                            isTargetLearnedFromSource: isTargetLearnedFromSource,
                            isLocalNodeSource: isLocalNodeSource,
                            packet: topologyPacket,
                            tableEntry: targetTable[topologyPacket.id]
                        })
                    }
                    return;
                }
                break;
            default:
                return;
        }

        // Send to TopicManager
        thisNode.TopicManager.SendToTopic("DRP", "TopologyTracker", topologyPacket);

        thisNode.log(`Imported topology packet from [${topologyPacket.originNodeID}] -> ${topologyPacket.cmd} ${topologyPacket.type}[${topologyPacket.id}]`, true);

        if (!topologyEntry) {
            thisNode.log(`The topologyEntry is null!  Why?`, true);
            return;
            //console.dir(topologyPacket);
        }

        // Loop over all connected node endpoints
        let nodeIDList = Object.keys(thisTopologyTracker.DRPNode.NodeEndpoints);
        for (let i = 0; i < nodeIDList.length; i++) {

            // By default, do not relay the packet
            let relayPacket = false;

            // Get endpoint NodeID and object
            let targetNodeID = nodeIDList[i];

            // Check to see if we should relay this packet
            relayPacket = thisTopologyTracker.AdvertiseOutCheck(topologyEntry, targetNodeID);

            if (relayPacket) {
                thisTopologyTracker.DRPNode.NodeEndpoints[targetNodeID].SendCmd("DRP", "topologyUpdate", topologyPacket, false, null);
                thisNode.log(`Relayed topology packet to node: [${targetNodeID}]`, true);
            } else {
                if (targetNodeID !== thisNode.NodeID) {
                    //thisNode.log(`Not relaying packet to node[${targetNodeID}], roles ${thisTopologyTracker.NodeTable[targetNodeID].Roles}`);
                    //console.dir(topologyPacket);
                }
            }
        }
    }

    /**
    * @returns {string[]} List of node IDs
    */
    ListNodes(zoneName) {
        let returnList = [];
        let nodeIDList = Object.keys(this.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let checkNodeID = nodeIDList[i];
            /** @type DRP_NodeTableEntry */
            let nodeTableEntry = this.NodeTable[checkNodeID];
            if (!zoneName || nodeTableEntry.Zone === zoneName) {
                returnList.push(checkNodeID);
            }
        }
        return returnList;
    }

    /**
     * @returns {string[]} List of service names
     */
    ListServices(zoneName) {
        let serviceNameSet = new Set();
        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];
            if (!zoneName || serviceTableEntry.Zone === zoneName) {
                serviceNameSet.add(serviceTableEntry.Name);
            }
        }
        let returnList = [...serviceNameSet];
        return returnList;
    }

    /**
    * @returns {string[]} List of zone names
    */
    ListZones() {
        let zoneNameSet = new Set();
        let nodeInstanceList = Object.keys(this.NodeTable);
        for (let i = 0; i < nodeInstanceList.length; i++) {
            /** @type DRP_NodeTableEntry */
            let nodeTableEntry = this.NodeTable[nodeInstanceList[i]];
            zoneNameSet.add(nodeTableEntry.Zone);
        }
        let returnList = [...zoneNameSet];
        return returnList;
    }

    /**
     * @returns {Object.<string,string[]>} Dictionary of service names and providers
     */
    GetServicesWithProviders(zoneName) {
        let oReturnObject = {};
        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];

            if (zoneName && serviceTableEntry.Zone !== zoneName) {
                continue;
            }

            if (!oReturnObject[serviceTableEntry.Name]) oReturnObject[serviceTableEntry.Name] = [];
            oReturnObject[serviceTableEntry.Name].push(serviceTableEntry.NodeID);
        }
        return oReturnObject;
    }

    /**
    * @returns {Object.<string,string[]>} Dictionary of stream names and providers
    */
    GetStreamsWithProviders(zoneName) {
        let oReturnObject = {};
        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];

            if (zoneName && serviceTableEntry.Zone !== zoneName) {
                continue;
            }

            for (let j = 0; j < serviceTableEntry.Streams.length; j++) {
                let thisStreamName = serviceTableEntry.Streams[j];
                if (!oReturnObject[thisStreamName]) oReturnObject[thisStreamName] = [];
                oReturnObject[thisStreamName].push(serviceTableEntry.NodeID);
            }
        }
        return oReturnObject;
    }

    /**
     * Return the most preferred instance of a service
     * @param {string} serviceName Name of Service to find
     * @param {string} serviceType Type of Service to find (optional)
     * @param {string} zone Name of zone (optional)
     * @param {string} nodeID Specify Node ID (optional)
     * @param {string} limitScope Limit results to a specific scope
     * @returns {DRP_ServiceTableEntry} Best Service Table entry
     */
    FindInstanceOfService(serviceName, serviceType, zone, nodeID, limitScope) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;

        let checkZone = zone || thisNode.Zone;

        // If neither a name nor a type is specified, return null
        if (!serviceName && !serviceType) return null;

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

            // Skip if the service name/type doesn't match
            if (serviceName && serviceName !== serviceTableEntry.Name) continue;
            if (serviceType && serviceType !== serviceTableEntry.Type) continue;

            // Skip if the node ID doesn't match
            if (nodeID && nodeID !== serviceTableEntry.NodeID) continue;

            // If we offer the service locally, select it and continue
            if (serviceTableEntry.NodeID === thisNode.NodeID) {
                return serviceTableEntry;
            }

            // Skip if the zone is specified and doesn't match
            switch (serviceTableEntry.Scope) {
                case "local":
                    break;
                case "global":
                    break;
                case "zone":
                    if (checkZone !== serviceTableEntry.Zone) continue;
                    break;
                default:
                    // Unrecognized scope option
                    continue;
            }

            // Skip if limitScope is specified and doesn't match
            if (limitScope) {
                switch (limitScope) {
                    case "local":
                        if (thisNode.NodeID !== serviceTableEntry.NodeID) continue;
                        break;
                    case "global":
                        break;
                    case "zone":
                        if (checkZone !== serviceTableEntry.Zone) continue;
                        break;
                    default:
                        // Unrecognized scope option
                        continue;
                }
            }

            // Delete if we don't have a corresponding Node entry
            if (!this.NodeTable[serviceTableEntry.NodeID]) {
                thisNode.log(`Deleted service table entry [${serviceTableEntry.InstanceID}], no matching node table entry`);
                delete this.ServiceTable[serviceTableEntry.InstanceID];
                continue;
            }

            // If this is the first candidate, set it and go
            if (!bestServiceEntry) {
                bestServiceEntry = serviceTableEntry;
                candidateList = [bestServiceEntry];
                continue;
            }

            // Check this against the current bestServiceEntry

            // Better zone?
            if (bestServiceEntry && bestServiceEntry.Zone !== checkZone && serviceTableEntry.Zone === checkZone) {
                // The service being evaluated is in a better zone
                bestServiceEntry = serviceTableEntry;
                candidateList = [bestServiceEntry];
                continue;
            } else if (bestServiceEntry && bestServiceEntry.Zone === checkZone && serviceTableEntry.Zone !== checkZone) {
                // The service being evaluated is in a different zone
                continue;
            }

            // Local preference?
            if (bestServiceEntry && bestServiceEntry.Scope !== "local" && serviceTableEntry.Scope === "local") {
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

            let qualifierText = "";
            if (serviceName) qualifierText = `name[${serviceName}]`;
            if (serviceType) {
                if (qualifierText.length !== 0) qualifierText = `${qualifierText}/`;
                qualifierText = `${qualifierText}type[${serviceType}]`;
            }
            thisNode.log(`Need service ${qualifierText}, randomly selected [${bestServiceEntry.InstanceID}]`, true);
        }

        return bestServiceEntry;
    }

    /**
     * Return the most preferred instance of a service
     * @param {string} serviceName Name of Service to find
     * @returns {DRP_ServiceTableEntry[]} List of Service Table entries
     */
    FindInstancesOfService(serviceName) {
        let thisTopologyTracker = this;

        // If neither a name nor a type is specified, return null
        if (!serviceName) return null;

        /** @type {DRP_ServiceTableEntry[]} */
        let serviceEntryList = [];

        let serviceInstanceList = Object.keys(this.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            let serviceTableEntry = this.ServiceTable[serviceInstanceList[i]];
            if (serviceTableEntry.Name === serviceName) serviceEntryList.push(serviceTableEntry);
        }

        return serviceEntryList;
    }

    /**
     * Find peers of a specified service instance
     * @param {string} serviceID Service instance to find peers of
     * @returns {string[]} List of peers
     */
    FindServicePeers(serviceID) {
        let thisTopologyTracker = this;
        let peerServiceIDList = [];

        // Get origin service
        let originServiceTableEntry = thisTopologyTracker.ServiceTable[serviceID];
        if (!originServiceTableEntry) return [];

        // A peer is another service with the same name and falls
        // under the specified scope
        let serviceInstanceList = Object.keys(thisTopologyTracker.ServiceTable);
        for (let i = 0; i < serviceInstanceList.length; i++) {
            /** @type DRP_ServiceTableEntry */
            let serviceTableEntry = thisTopologyTracker.ServiceTable[serviceInstanceList[i]];

            // Skip the instance specified
            if (serviceTableEntry.InstanceID === serviceID) continue;

            // Skip if the service isn't ready
            if (serviceTableEntry.Status !== 1) continue;

            // Skip if the service name/type doesn't match
            if (originServiceTableEntry.Name !== serviceTableEntry.Name) continue;
            if (originServiceTableEntry.Type !== serviceTableEntry.Type) continue;

            // Skip if the zone doesn't match
            switch (searchScope) {
                case "local":
                    if (originServiceTableEntry.NodeID !== serviceTableEntry.NodeID) continue;
                    break;
                case "global":
                    break;
                case "zone":
                    if (originServiceTableEntry.Zone !== serviceTableEntry.Zone) continue;
                    break;
                default:
                    // Unrecognized scope option
                    continue;
            }

            // We have a match
            peerServiceIDList.push(serviceTableEntry.InstanceID);
        }

        return peerServiceIDList;
    }

    /**
     * Determine whether or not we should advertise this entry
     * @param {DRP_TrackingTableEntry} topologyEntry Topology entry
     * @param {string} targetNodeID Node we're considering sending to
     * @returns {boolean} Should the item be advertised
     */
    AdvertiseOutCheck(topologyEntry, targetNodeID) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;
        let localNodeID = thisNode.NodeID;
        let doSend = false;

        let advertisedNodeID = topologyEntry.NodeID;
        let learnedFromNodeID = topologyEntry.LearnedFrom;
        let proxyNodeID = topologyEntry.ProxyNodeID;
        let advertisedScope = topologyEntry.Scope;
        let advertisedZone = topologyEntry.Zone;

        let localNodeEntry = thisTopologyTracker.NodeTable[localNodeID];
        let targetNodeEntry = thisTopologyTracker.NodeTable[targetNodeID];
        let advertisedNodeEntry = thisTopologyTracker.NodeTable[advertisedNodeID];
        let learnedFromNodeEntry = thisTopologyTracker.NodeTable[learnedFromNodeID];
        let proxyNodeEntry = thisTopologyTracker.NodeTable[proxyNodeID];

        try {
            // Always skip the local node
            if (targetNodeID === localNodeID) {
                return false;
            }

            // We don't recognize the target node; give them everything by default
            if (!targetNodeEntry) return true;

            // TODO - Add logic to support Proxied Nodes

            switch (advertisedScope) {
                case "local":
                    // Never advertise local
                    return false;
                case "zone":
                    // Do not proceed if the target isn't in the same zone
                    if (advertisedZone !== targetNodeEntry.Zone) {
                        //thisNode.log(`Not relaying because Node[${targetNodeID}] is not in the same zone!`);
                        return false;
                    }
                    break;
                case "global":
                    // Global services can be advertised anywhere
                    break;
                default:
                    // Unknown scope type
                    return false;
            }

            // Never send back to the origin
            if (advertisedNodeID === targetNodeID) return false;

            // Always relay locally sourced entries
            if (advertisedNodeID === localNodeID) return true;

            // Only send items for which we are authoritative
            if (localNodeEntry.IsRegistry()) {
                // The local node is a Registry

                /// Relay to connected non-Registry Nodes
                if (targetNodeEntry && !targetNodeEntry.IsRegistry()) return true;

                // Relay if the advertised node was locally connected
                if (topologyEntry.LearnedFrom === topologyEntry.NodeID) return true;

                // Relay if we know the target isn't a Registry
                if (targetNodeEntry && !targetNodeEntry.IsRegistry()) return true;

                // Do not relay
                //console.log(`Not relaying to Node[${targetNodeID}]`);
                //console.dir(topologyEntry);
                return false;
            }
        } catch (ex) {
            thisNode.log(`AdvertiseOutCheck could not evaluate topologyPacket for relay: <<<${ex}>>>`);
            console.dir(topologyEntry);
        }
        return doSend;
    }

    /**
     * Get the local registry
     * @param {string} requestingNodeID Node ID requesting the registry
     * @returns {DRP_TopologyTracker} Returns node & service entries
     */
    GetRegistry(requestingNodeID) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;

        let returnNodeTable = {};
        let returnServiceTable = {};

        if (!requestingNodeID) { requestingNodeID = ""; }

        try {
            // Loop over Node Table
            let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
            for (let i = 0; i < nodeIDList.length; i++) {

                let advertisedNodeID = nodeIDList[i];
                let advertisedNodeEntry = thisTopologyTracker.NodeTable[advertisedNodeID];

                // Check to see if we should relay this packet
                let relayPacket = thisTopologyTracker.AdvertiseOutCheck(advertisedNodeEntry, requestingNodeID);

                if (relayPacket) {
                    returnNodeTable[advertisedNodeID] = advertisedNodeEntry;
                } else {
                    //thisNode.log(`Not relaying to Node[${requestingNodeID}]`);
                    //console.dir(advertisedNodeEntry);
                }
            }
            // Loop over Service Table
            let serviceIDList = Object.keys(thisTopologyTracker.ServiceTable);
            for (let i = 0; i < serviceIDList.length; i++) {

                let advertisedServiceID = serviceIDList[i];
                let advertisedServiceEntry = thisTopologyTracker.ServiceTable[advertisedServiceID];

                // Check to see if we should relay this packet
                let relayPacket = thisTopologyTracker.AdvertiseOutCheck(advertisedServiceEntry, requestingNodeID);

                if (relayPacket) {
                    returnServiceTable[advertisedServiceID] = advertisedServiceEntry;
                }
            }
        } catch (ex) {
            thisTopologyTracker.DRPNode.log(`Exception while getting subset of Registry: ${ex}`);
        }

        let returnObj = {
            NodeTable: returnNodeTable,
            ServiceTable: returnServiceTable
        };
        return returnObj;
    }

    /**
     * 
     * @param {DRP_Endpoint} sourceEndpoint Source Endopint
     * @param {DRP_NodeDeclaration} declaration Source Declaration
     * @param {boolean} localNodeIsProxy Is the local Node a proxy for the remote Node?
     */
    async ProcessNodeConnect(sourceEndpoint, declaration, localNodeIsProxy) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;
        thisNode.log(`Connection established with Node [${declaration.NodeID}] (${declaration.NodeRoles})`);
        let returnData = await sourceEndpoint.SendCmd("DRP", "getRegistry", { "reqNodeID": thisNode.NodeID }, true, null, null);
        //console.dir(returnData, { depth: 4 });
        let sourceIsRegistry = false;
        let remoteRegistry = returnData;
        let runCleanup = false;

        if (declaration.NodeRoles.indexOf("Registry") >= 0) {
            sourceIsRegistry = true;
        }

        // Import Nodes
        let nodeIDList = Object.keys(remoteRegistry.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            /** @type {DRP_NodeTableEntry} */
            let thisNodeEntry = remoteRegistry.NodeTable[nodeIDList[i]];
            if (localNodeIsProxy) thisNodeEntry.ProxyNodeID = thisNode.NodeID;
            let nodeAddPacket = new DRP_TopologyPacket(declaration.NodeID, "add", "node", thisNodeEntry.NodeID, thisNodeEntry.Scope, thisNodeEntry.Zone, thisNodeEntry);
            thisNode.TopologyTracker.ProcessPacket(nodeAddPacket, sourceEndpoint.EndpointID, sourceIsRegistry);
        }

        // Import Services
        let serviceIDList = Object.keys(remoteRegistry.ServiceTable);
        for (let i = 0; i < serviceIDList.length; i++) {
            /** @type {DRP_ServiceTableEntry} */
            let thisServiceEntry = remoteRegistry.ServiceTable[serviceIDList[i]];
            if (localNodeIsProxy) thisServiceEntry.ProxyNodeID = thisNode.NodeID;
            let serviceAddPacket = new DRP_TopologyPacket(declaration.NodeID, "add", "service", thisServiceEntry.InstanceID, thisServiceEntry.Scope, thisServiceEntry.Zone, thisServiceEntry);
            thisNode.TopologyTracker.ProcessPacket(serviceAddPacket, sourceEndpoint.EndpointID, sourceIsRegistry);
        }

        // Execute onControlPlaneConnect callback
        if (!thisNode.IsRegistry() && sourceIsRegistry && !thisNode.isConnectedToControlPlane) {
            // We are connected to a Registry
            thisNode.isConnectedToControlPlane = true;
            runCleanup = true;
            if (thisNode.onControlPlaneConnect && typeof thisNode.onControlPlaneConnect === "function" && !thisNode.HasConnectedToMesh) thisNode.onControlPlaneConnect();
            thisNode.HasConnectedToMesh = true;
        }

        // Remove any stale entries if we're reconnecting to a new Registry
        if (runCleanup) thisNode.TopologyTracker.StaleEntryCleanup();
    }

    ProcessNodeDisconnect(disconnectedNodeID) {
        let thisTopologyTracker = this;
        let thisNode = thisTopologyTracker.DRPNode;
        // Remove node; this should trigger an autoremoval of entries learned from it

        let thisNodeEntry = thisTopologyTracker.NodeTable[thisNode.NodeID];
        let disconnectedNodeEntry = thisTopologyTracker.NodeTable[disconnectedNodeID];

        // See if we're connected to other Registry Nodes
        let hasAnotherRegistryConnection = thisTopologyTracker.ListConnectedRegistryNodes().length > 0;

        if (!thisNodeEntry.IsRegistry() && !hasAnotherRegistryConnection) {
            // See if we have any registry connections
            thisNode.isConnectedToControlPlane = false;
        }

        // If we are not a Registry and we just disconnected from a Registry, hold off on this process!
        if (!disconnectedNodeEntry) {
            thisNode.log(`Ran ProcessNodeDisconnect on non-existent Node [${disconnectedNodeID}]`);
            return;
        }

        thisNode.log(`Connection terminated with Node [${disconnectedNodeEntry.NodeID}] (${disconnectedNodeEntry.Roles})`);

        // If both the local and remote are non-Registry nodes, skip further processing.  May just be a direct connection timing out.
        if (!thisNodeEntry.IsRegistry() && !disconnectedNodeEntry.IsRegistry()) return;

        // Do we need to hold off on purging the Registry?
        if (!thisNodeEntry.IsRegistry() && disconnectedNodeEntry && disconnectedNodeEntry.IsRegistry() && !hasAnotherRegistryConnection) {
            // Do not go through with the cleanup process; delete only the disconnected Registry node
            // for now and we'll run the StaleEntryCleanup when we connect to the next Registry.
            thisNode.log(`We disconnected from Registry Node[${disconnectedNodeID}] and have no other Registry connections`);
            delete thisTopologyTracker.NodeTable[disconnectedNodeID];
            return;
        }

        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            /** @type {DRP_NodeTableEntry} */
            let checkNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
            if (checkNodeEntry) {
                if (checkNodeEntry.NodeID === disconnectedNodeID && checkNodeEntry.LearnedFrom === disconnectedNodeID) {
                    let nodeDeletePacket = new DRP_TopologyPacket(checkNodeEntry.NodeID, "delete", "node", checkNodeEntry.NodeID, checkNodeEntry.Scope, checkNodeEntry.Zone, checkNodeEntry);
                    thisTopologyTracker.ProcessPacket(nodeDeletePacket, checkNodeEntry.NodeID);
                }
            } else {
                // Node has already been removed; maybe dupe delete commands
                thisNode.log(`ProcessNodeDisconnect: Node[${disconnectedNodeID}] has already been removed`, true);
            }
        }

        if (thisNode.isConnectedToControlPlane) thisNode.TopologyTracker.StaleEntryCleanup();
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

    /**
     * Validate Node ID
     * @param {string} checkNodeID Node ID we're trying to validate
     * @returns {boolean} Node ID of next hop
     */
    ValidateNodeID(checkNodeID) {
        let thisTopologyTracker = this;
        if (thisTopologyTracker.NodeTable[checkNodeID])
            return true;
        else
            return false;
    }

    GetNodeWithURL(checkNodeURL) {
        let thisTopologyTracker = this;
        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let checkNodeID = nodeIDList[i];
            let thisNodeEntry = thisTopologyTracker.NodeTable[checkNodeID];
            if (thisNodeEntry.NodeURL && thisNodeEntry.NodeURL === checkNodeURL) return checkNodeID;
        }
        return null;
    }

    StaleEntryCleanup() {
        let thisTopologyTracker = this;

        // Purge Node entries where the LearnedFrom Node is not present
        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let checkNodeID = nodeIDList[i];
            let checkNodeEntry = thisTopologyTracker.NodeTable[checkNodeID];
            if (!thisTopologyTracker.ValidateNodeID(checkNodeEntry.LearnedFrom)) {
                // Stale record - delete
                thisTopologyTracker.DRPNode.log(`Purged stale Node [${checkNodeID}], LearnedFrom Node [${checkNodeEntry.LearnedFrom}] not in Node table`);
                delete thisTopologyTracker.NodeTable[checkNodeID];
            }
        }

        // Purge Service entries where the Node is not present
        let serviceIDList = Object.keys(thisTopologyTracker.ServiceTable);
        for (let i = 0; i < serviceIDList.length; i++) {
            let checkServiceID = serviceIDList[i];
            let checkServiceEntry = thisTopologyTracker.ServiceTable[checkServiceID];
            if (!thisTopologyTracker.ValidateNodeID(checkServiceEntry.NodeID)) {
                // Stale record - delete
                thisTopologyTracker.DRPNode.log(`Purged stale Service [${checkServiceID}], LearnedFrom Node [${checkServiceEntry.LearnedFrom}] not in Node table`);
                delete thisTopologyTracker.ServiceTable[checkServiceID];
            }
        }
        return null;
    }

    ListConnectedRegistryNodes() {
        let thisTopologyTracker = this;
        let connectedRegistryList = [];
        // Look for entries with the Registry role and that are still connected
        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let thisNodeID = thisTopologyTracker.DRPNode.NodeID;
            let checkNodeID = nodeIDList[i];
            let checkNodeEntry = thisTopologyTracker.NodeTable[checkNodeID];
            if (checkNodeEntry.NodeID !== thisNodeID && checkNodeEntry.IsRegistry() && thisTopologyTracker.DRPNode.NodeEndpoints[checkNodeID]) {
                // Remote Node is a Registry and we are connected to it
                connectedRegistryList.push(checkNodeID);
            }
        }
        return connectedRegistryList;
    }

    /**
     * Returns list of NodeTable records for Registries in specified zone
     * @param {string} zoneName
     * @returns{DRP_NodeTableEntry[]}
     */
    FindRegistriesInZone(zoneName) {
        let thisTopologyTracker = this;
        let registryList = [];
        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let checkNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
            if (checkNodeEntry.IsRegistry() && checkNodeEntry.Zone === zoneName) {
                registryList.push(checkNodeEntry);
            }
        }
        return registryList;
    }

    /**
     * Returns list of NodeTable records for Relays in specified zone
     * @param {string} zoneName
     * @returns{DRP_NodeTableEntry[]}
     */
    FindRelaysInZone(zoneName) {
        let thisTopologyTracker = this;
        let relayList = [];
        let nodeIDList = Object.keys(thisTopologyTracker.NodeTable);
        for (let i = 0; i < nodeIDList.length; i++) {
            let checkNodeEntry = thisTopologyTracker.NodeTable[nodeIDList[i]];
            if (checkNodeEntry.IsRelay() && checkNodeEntry.Zone === zoneName) {
                relayList.push(checkNodeEntry);
            }
        }
        return relayList;
    }
}

class DRP_TrackingTableEntry {
    /**
    * 
    * @param {string} nodeID Node ID
    * @param {string} proxyNodeID Proxy Node ID
    * @param {string} scope Node Scope
    * @param {string} zone Node Zone
    * @param {string} learnedFrom NodeID that sent us this record
    * @param {string} lastModified Last Modified Timestamp
    */
    constructor(nodeID, proxyNodeID, scope, zone, learnedFrom, lastModified) {
        this.NodeID = nodeID;
        this.ProxyNodeID = proxyNodeID;
        this.Scope = scope || "zone";
        this.Zone = zone;
        this.LearnedFrom = learnedFrom;
        this.LastModified = lastModified;
    }
}

class DRP_NodeTable {
    /**
     * Add Node Table Entry
     * @param {string} entryID New table entry ID
     * @param {DRP_NodeTableEntry} entryData New table entry data
     * @param {string} lastModified Last Modified Timestamp
     */
    AddEntry(entryID, entryData, lastModified) {
        let thisTable = this;
        let newTableRecord = new DRP_NodeTableEntry();
        Object.assign(newTableRecord, entryData);
        thisTable[entryID] = newTableRecord;
        if (lastModified) thisTable[entryID].LastModified = lastModified;
    }

    UpdateEntry(entryID, updateData, lastModified) {
        let thisTable = this;
        Object.assign(thisTable[entryID], updateData);
        if (lastModified) thisTable[entryID].LastModified = lastModified;
    }
}

// Details of Node
class DRP_NodeTableEntry extends DRP_TrackingTableEntry {
    /**
     * 
     * @param {string} nodeID Node ID
     * @param {string} proxyNodeID Proxy Node ID
     * @param {string[]} roles Roles
     * @param {string} nodeURL Node URL
     * @param {string} scope Node Scope
     * @param {string} zone Node Zone
     * @param {string} learnedFrom NodeID that sent us this record
     * @param {string} hostID Host ID
     * @param {string} lastModified Last Modified Timestamp
     */
    constructor(nodeID, proxyNodeID, roles, nodeURL, scope, zone, learnedFrom, hostID, lastModified) {
        super(nodeID, proxyNodeID, scope, zone, learnedFrom, lastModified);
        this.Roles = roles;
        this.NodeURL = nodeURL;
        this.HostID = hostID;
    }

    IsRegistry() {
        let thisNodeTableEntry = this;
        let isRegistry = thisNodeTableEntry.Roles.indexOf("Registry") >= 0;
        return isRegistry;
    }

    IsBroker() {
        let thisNodeTableEntry = this;
        let isBroker = thisNodeTableEntry.Roles.indexOf("Broker") >= 0;
        return isBroker;
    }

    IsRelay() {
        let thisNodeTableEntry = this;
        let isRelay = thisNodeTableEntry.Roles.indexOf("Relay") >= 0;
        return isRelay;
    }

    UsesProxy(checkNodeID) {
        let thisNodeTableEntry = this;
        let usesProxy = false;

        if (!checkNodeID && thisNodeTableEntry.ProxyNodeID) {
            usesProxy = true;
        }

        if (checkNodeID && thisNodeTableEntry.ProxyNodeID && thisNodeTableEntry.ProxyNodeID === checkNodeID) {
            usesProxy = true;
        }

        return usesProxy;
    }
}

class DRP_ServiceTable {
    /**
     * Add Service Table Entry
     * @param {string} entryID New table entry ID
     * @param {DRP_ServiceTableEntry} entryData New table entry data
     * @param {string} lastModified Last Modified Timestamp
     */
    AddEntry(entryID, entryData, lastModified) {
        let thisTable = this;
        let newTableRecord = new DRP_ServiceTableEntry();
        Object.assign(newTableRecord, entryData);
        thisTable[entryID] = newTableRecord;
        if (lastModified) thisTable[entryID].LastModified = lastModified;
    }

    UpdateEntry(entryID, updateData, lastModified) {
        let thisTable = this;
        Object.assign(thisTable[entryID], updateData);
        if (lastModified) thisTable[entryID].LastModified = lastModified;
    }
}

class DRP_ServiceTableEntry extends DRP_TrackingTableEntry {
    /**
     * 
     * @param {string} nodeID Origin Node ID
     * @param {string} proxyNodeID Proxy Node ID
     * @param {string} serviceName Name of service
     * @param {string} serviceType Type of service
     * @param {string} instanceID Global Instance ID
     * @param {string} zone Service Zone
     * @param {boolean} serviceSticky Service sticky
     * @param {number} servicePriority Service priority
     * @param {number} serviceWeight Service weight
     * @param {string} scope Service scope (Local|Zone|Global)
     * @param {string[]} serviceDependencies Services required for this one to operate
     * @param {string[]} streams Streams provided by this service
     * @param {number} serviceStatus Service status (0 down|1 up|2 pending)
     * @param {string} serviceVersion Service version
     * @param {string} learnedFrom NodeID that sent us this record
     * @param {string} lastModified Last Modified Timestamp
     */
    constructor(nodeID, proxyNodeID, serviceName, serviceType, instanceID, zone, serviceSticky, servicePriority, serviceWeight, scope, serviceDependencies, streams, serviceStatus, serviceVersion, learnedFrom, lastModified) {
        super(nodeID, proxyNodeID, scope, zone, learnedFrom, lastModified);
        this.Name = serviceName;
        this.Type = serviceType;
        this.InstanceID = instanceID;
        this.Sticky = serviceSticky;
        this.Priority = servicePriority;
        this.Weight = serviceWeight;
        this.Dependencies = serviceDependencies || [];
        this.Streams = streams || [];
        this.Status = serviceStatus;
        this.Version = serviceVersion || null;
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

class DRP_RemoteSubscription extends DRP_SubscribableSource {
    /**
     * 
     * @param {string} targetNodeID Target Node ID
     * @param {string} topicName Topic Name
     * @param {string} streamToken Stream Token
     * @param {function} noSubscribersCallback Last subscriber disconnected callback
     */
    constructor(targetNodeID, serviceName, topicName, streamToken, noSubscribersCallback) {
        super(targetNodeID, serviceName, topicName);
        this.StreamToken = streamToken;
        this.NoSubscribersCallback = noSubscribersCallback;
    }

    /**
     *
     * @param {DRP_Subscriber} subscription Subscription to add
     */
    RemoveSubscription(subscription) {
        super.RemoveSubscription(subscription);

        // If there are no more subscribers, terminate this RemoteSubscription
        if (this.Subscriptions.size === 0) {
            if (this.NoSubscribersCallback && typeof this.NoSubscribersCallback === "function") this.NoSubscribersCallback();
        }
    }
}

class DRP_SubscriptionManager {
    /**
     * Tracks subscriptions to other Nodes.  Primary purpose is for stream deduplication on Brokers.
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(drpNode) {
        this.DRPNode = drpNode;
        /** @type Set<DRP_Subscriber> */
        this.Subscribers = new Set();

        /** @type Object.<string, DRP_RemoteSubscription> */
        this.RemoteSubscriptions = {};
    }

    /**
     * Analyse topology changes; look for new services to subscribe to
     * @param {DRP_TopologyPacket} topologyPacket Topology packet
     */
    async ProcessTopologyPacket(topologyPacket) {
        let thisSubMgr = this;
        let thisNode = thisSubMgr.DRPNode;

        // Ignore if we don't have any Subscriptions to check against
        if (thisSubMgr.Subscribers.size === 0) return;

        // This is a node add
        if (topologyPacket.cmd === "add" && topologyPacket.type === "node") {
            // If these conditions are true:
            //   - Local node is not a registry
            //   - Local node is attached to an out-of-zone registry
            //   - New node is a registry in the same zone as the local node
            // Then:
            //   - Connect to the new Registry

            // This logic was implemented in the TopologyTracker module.  Should it be here instead?
        }

        // This is a service add
        if (topologyPacket.cmd === "add" && topologyPacket.type === "service") {

            // Get topologyData
            /** @type {DRP_ServiceTableEntry} */
            let serviceEntry = topologyPacket.data;

            // Only Brokers should evaluate subscriptions for remote nodes.  Non-Brokers won't have subscription
            // requests registered until the service is advertised.
            if (!thisNode.IsBroker() && !thisNode.IsPortal()) {
                return;
            }

            for (let subscriber of thisSubMgr.Subscribers) {
                // Does the newly discovered service provide what this subscription is asking for?
                if (!thisSubMgr.EvaluateServiceTableEntryForSubscription(serviceEntry, subscriber)) continue;

                // Is this a single instance subscriber?
                if (subscriber.singleInstance) {

                    // If connecting to target, skip
                    if (subscriber.connectingToTarget) {
                        continue;
                    }

                    // If already connected, see if the new entry is more preferable
                    if (subscriber.subscribedTo.size > 0) {
                        /** @type {DRP_SubscribableSource} */
                        let currentSubscribedTarget = [...(subscriber.subscribedTo)][0];
                        let currentSubscribedTargetZone = thisNode.TopologyTracker.NodeTable[currentSubscribedTarget.NodeID].Zone;

                        // See if the serviceEntry Node is local or in the local Zone and the current target is not
                        if (serviceEntry.NodeID === thisNode.NodeID || currentSubscribedTargetZone !== thisNode.Zone && serviceEntry.Zone === thisNode.Zone) {
                            // Yes - eliminate the existing subscription and we'll connect to the new one
                            this.DRPNode.log(`Found a better subscription for client, switching from [${currentSubscribedTarget.NodeID}] ${currentSubscribedTarget.TopicName} to ${serviceEntry.NodeID}`, true);
                            currentSubscribedTarget.RemoveSubscription(subscriber);
                            subscriber.connectingToTarget = true;
                        } else {
                            continue;
                        }
                    } else {
                        thisNode.log(`Single instance subscriber has no subs and connectingToTarget=${subscriber.connectingToTarget}, subscribing to ${serviceEntry.NodeID}`, true);
                    }
                }
                try {
                    await this.RegisterSubscriberWithTargetSource(serviceEntry, subscriber);
                } catch (ex) {
                    // Failed to subscribe
                    thisNode.log(`Failed to subscribe to target -> ${ex}`);
                }
                subscriber.connectingToTarget = false;
            }
        }

        // This is a node delete
        if (topologyPacket.cmd === "delete" && topologyPacket.type === "node") {

            /** @type {DRP_NodeTableEntry} */
            let nodeEntry = topologyPacket.data;
            let checkNodeID = nodeEntry.NodeID;
            let reprocessSubscriptions = [];

            // Loop over all Subscribers and objects they're subscribed to
            let remoteSubscriptionIDList = Object.keys(thisSubMgr.RemoteSubscriptions);
            for (let i = 0; i < remoteSubscriptionIDList.length; i++) {
                let remoteSubscriptionID = remoteSubscriptionIDList[i];
                let thisRemoteSub = thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];

                // Skip subscriptions for other Nodes
                if (checkNodeID !== thisRemoteSub.__NodeID) continue;

                // The subscription matches, process it
                for (let thisLocalSub of thisRemoteSub.Subscriptions) {
                    // If the subscription is singleInstance, find another target for it
                    if (thisLocalSub.singleInstance) {
                        reprocessSubscriptions.push(thisLocalSub);
                    }

                    // This will remove the local sub from the remote and vice versa
                    thisRemoteSub.RemoveSubscription(thisLocalSub);
                }
                delete thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];

                // Reprocess any singleInstance subscriptions
                for (let subscriber of reprocessSubscriptions) {
                    let candidateList = this.GetStreamsForSubscriber(subscriber);
                    if (candidateList.length > 0) {
                        let subList = candidateList.map(svcEntry => `<${svcEntry.Zone}>${svcEntry.NodeID}`);
                        this.DRPNode.log(`Single instance subscriber lost target, subscribing to first in list: ${subList.join(",")}`, true);
                        await this.RegisterSubscriberWithTargetSource(candidateList[0], subscriber);
                    }
                }
            }
        }
    }

    /**
     * 
     * @param {DRP_Subscriber} subscriber Subscription
     * @returns {boolean} Registration success
     */
    async RegisterSubscription(subscriber) {
        let thisSubMgr = this;
        let thisNode = thisSubMgr.DRPNode;

        thisSubMgr.Subscribers.add(subscriber);

        // Get all services with the specified stream
        let candidateList = this.GetStreamsForSubscriber(subscriber);

        // Subscribe to candidates
        if (subscriber.singleInstance) {
            // The subscriber only wants a single instance, get the first one
            if (candidateList.length > 0) {
                let subList = candidateList.map(svcEntry => `<${svcEntry.Zone}> ${svcEntry.NodeID}`);
                this.DRPNode.log(`Single instance subscriber added, subscribing to first in list: ${subList.join(",")}`, true);
                await this.RegisterSubscriberWithTargetSource(candidateList[0], subscriber);
            }
        } else {
            // Subscribe to all
            for (let serviceEntry of candidateList) {
                // Register subscriber with target node
                await this.RegisterSubscriberWithTargetSource(serviceEntry, subscriber);
            }
        }

        return true;
    }

    /**
     * Return a list of all ServiceTable entries matching a subscriber in order of preference
     * @param {DRP_Subscriber} subscriber
     * @returns {DRP_ServiceTableEntry[]}
     */
    GetStreamsForSubscriber(subscriber) {
        let thisSubMgr = this;

        // We need to evaluate the service table, see if anyone provides the stream this subscriber is requesting
        let serviceTable = thisSubMgr.DRPNode.TopologyTracker.ServiceTable;
        let serviceEntryIDList = Object.keys(serviceTable);
        /** @type {DRP_ServiceTableEntry[]} */
        let candidateList = [];

        // Get candidates
        for (let i = 0; i < serviceEntryIDList.length; i++) {
            let serviceEntry = serviceTable[serviceEntryIDList[i]];

            // Does the service provide what this subscription is asking for?
            if (!thisSubMgr.EvaluateServiceTableEntryForSubscription(serviceEntry, subscriber)) continue;

            // Add to candidate list in order of preference
            let spliceIndex = 0;
            if (serviceEntry.NodeID === thisSubMgr.DRPNode.NodeID) {
                // Move this one to the front of the list
                spliceIndex = 0;
            } else if (serviceEntry.Zone === thisSubMgr.DRPNode.Zone) {
                // Move this one ahead of other zones
                for (let j = 0; j < candidateList.length; j++) {
                    let compareCandidate = candidateList[j];
                    if (compareCandidate.Zone !== thisSubMgr.DRPNode.Zone) {
                        // The compare entry is in another zone, insert here
                        spliceIndex = j;
                        break;
                    }
                }
            } else {
                // Lowest preference, add to the end
                spliceIndex = candidateList.length;
            }
            candidateList.splice(spliceIndex, 0, serviceEntry);
        }

        return candidateList;
    }

    /**
     * 
     * @param {DRP_ServiceTableEntry} serviceEntry Service to check
     * @param {DRP_Subscriber} subscriber Service to check
     * @returns {boolean} Successful Match
     */
    EvaluateServiceTableEntryForSubscription(serviceEntry, subscriber) {
        // Return false if the targetNodeID is specified and doesn't match
        if (subscriber.targetNodeID && serviceEntry.NodeID !== subscriber.targetNodeID) return false;

        // Return false if the service name is specified and doesn't match
        if (subscriber.serviceName && serviceEntry.Name !== subscriber.serviceName) return false;

        // Return false if the service doesn't provide the topic
        if (serviceEntry.Streams.indexOf(subscriber.topicName) < 0) return false;

        // Return false if the service scope is local and isn't on this node
        if (subscriber.scope === "local" && serviceEntry.NodeID !== this.DRPNode.NodeID) return false;

        // Return false if we're looking in a specific zone and it doesn't match
        if (subscriber.zone === "zone" && subscriber.zone !== serviceEntry.Zone) return false;

        // Must be good
        return true;
    }

    /**
     * Register Subscription with Target Source
     * @param {DRP_ServiceTableEntry} serviceEntry
     * @param {DRP_Subscriber} subscriber
     */
    async RegisterSubscriberWithTargetSource(serviceEntry, subscriber) {
        let thisSubMgr = this;
        let thisNode = thisSubMgr.DRPNode;

        /** @type {DRP_SubscribableSource} */
        let targetSource = null;

        if (subscriber.singleInstance && subscriber.subscribedTo.size > 0) {
            // Should not reach this
            thisNode.log(`Tried to register a single instance subscriber with multiple sources, rejecting request`, true);
            return;
        }

        // Is this local or remote?
        if (serviceEntry.NodeID === thisNode.NodeID) {
            targetSource = thisNode.TopicManager.GetTopic(serviceEntry.Name, subscriber.topicName);
        } else {
            // Verify we have a RemoteSubscription
            targetSource = await thisSubMgr.VerifyRemoteSubscription(serviceEntry.NodeID, serviceEntry.Name, subscriber.topicName);
        }

        // Are we aready subscribed?
        if (targetSource) {
            if (targetSource.Subscriptions.has(subscriber)) return;

            // Subscribe
            targetSource.AddSubscription(subscriber);
        }
    }

    /**
     * 
     * @param {string} targetNodeID Target Node ID
     * @param {string} topicName Topic Name
     * @returns {DRP_RemoteSubscription} Remote Subscription
     */
    async VerifyRemoteSubscription(targetNodeID, serviceName, topicName) {
        let thisSubMgr = this;
        let returnSubscription = null;
        let remoteSubscriptionID = `${targetNodeID}-${serviceName}.${topicName}`;
        if (!thisSubMgr.RemoteSubscriptions[remoteSubscriptionID]) {
            let newRemoteSubscription = new DRP_RemoteSubscription(targetNodeID, serviceName, topicName, null, () => {
                // No Subscribers Callback
                delete thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];
                thisSubMgr.DRPNode.UnsubscribeRemote(newRemoteSubscription.__NodeID, newRemoteSubscription.StreamToken);
            });
            thisSubMgr.RemoteSubscriptions[remoteSubscriptionID] = newRemoteSubscription;
            let streamToken = await thisSubMgr.DRPNode.SubscribeRemote(targetNodeID, serviceName, topicName, "local", (streamPacket) => {
                // TODO - use streamPacket.status to see if this is the last packet?

                // If we're relaying a message from a topic, add the local NodeID to the route
                if (streamPacket.payload && streamPacket.payload.Route) streamPacket.payload.Route.push(thisSubMgr.DRPNode.NodeID);

                newRemoteSubscription.Send(streamPacket.payload);
            });
            if (streamToken) {
                returnSubscription = thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];
                returnSubscription.StreamToken = streamToken;
            } else delete thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];
        } else {
            returnSubscription = thisSubMgr.RemoteSubscriptions[remoteSubscriptionID];
        }
        return returnSubscription;
    }
}

module.exports = DRP_Node;