var WebSocket = require('ws');
var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');
var drpEndpoint = require('drp-endpoint');
var bodyParser = require('body-parser');
var express = require('express');
var expressWs = require('express-ws');
var cors = require('cors');
var https = require('https');
var fs = require('fs');

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

class DRP_TopicManager {
    constructor(drpEndpoint) {
        let thisTopicManager = this;

        // Set DRPServer
        this.DRPEndpoint = drpEndpoint;
        this.Topics = {};
    }

    CreateTopic(topicName) {
        // Add logic to verify topic queue name is formatted correctly and doesn't already exist
        this.Topics[topicName] = new DRP_TopicManager_Topic(this, topicName);
        this.DRPEndpoint.service.log("Created topic [" + topicName + "]", "TopicManager");
        //this.DRPServer.LogEvent("Created topic [" + topicName + "]", "TopicManager");
    }

    SubscribeToTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Subscribers.push({
            conn: conn,
            token: token,
            filter: filter
        });

        //console.log("Subscribed to topic [" + topicName + "] with token [" + token + "]");
        //this.DRPServer.VDMServer.LogWSUnityClientEvent(conn, "Subscribed to topic [" + topicName + "]");
    }

    UnsubscribeFromTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (this.Topics[topicName]) {
            let thisTopic = this.Topics[topicName];

            let i = thisTopic.Subscribers.length;
            while (i--) {
                let thisSubscriberObj = thisTopic.Subscribers[i];
                if (thisSubscriberObj.conn === conn && thisSubscriberObj.token === token) {
                    thisTopic.Subscribers.splice(i, 1);
                    //console.log("Subscription client[" + i + "] removed gracefully");
                    break;
                }
            }
        }
    }

    UnsubscribeFromAll(conn, token) {
        let thisTopicManager = this;
        let topicKeys = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeys.length; i++) {
            thisTopicManager.UnsubscribeFromTopic(topicKeys[i], conn, token);
        }
    }

    SendToTopic(topicName, message) {
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Send(message);
    }

    GetTopicCounts() {
        let thisTopicManager = this;
        let responseObject = {};
        let topicKeyList = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeyList.length; i++) {
            let thisTopic = thisTopicManager.Topics[topicKeyList[i]];
            responseObject[topicKeyList[i]] = {
                SubscriberCount: thisTopic.Subscribers.length,
                ReceivedMessages: thisTopic.ReceivedMessages,
                SentMessages: thisTopic.SentMessages
            }
        }
        return responseObject;
    }
}

class DRP_TopicManager_Topic {
    constructor(topicManager, topicName) {
        var thisTopic = this;

        // Set Topic Manager
        this.TopicManager = topicManager
        this.TopicName = topicName
        this.Subscribers = [];
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.LastTen = [];

        /*
        Subscribers: [
            {
                clientObj : {clientObj},
                token: {subscriberToken},
                filter: {filter}
            }
        ]
        */
    }

    Send(message) {
        let thisTopic = this;

        thisTopic.ReceivedMessages++;

        if (thisTopic.LastTen.length === 10) {
            thisTopic.LastTen.shift();
        }
        thisTopic.LastTen.push(message);

        let i = thisTopic.Subscribers.length;
        while (i--) {
            let thisSubscriberObj = thisTopic.Subscribers[i];
            let sendFailed = this.TopicManager.DRPEndpoint.SendStream(thisSubscriberObj.conn, thisSubscriberObj.token, 2, message);
            if (sendFailed) {
                thisTopic.Subscribers.splice(i, 1);
                console.log("Subscription client[" + i + "] removed forcefully");
            }
        }
    }
}

// Instantiate Express instance
class DRP_Server {
    constructor(webServerConfig) {

        // Setup the Express web server
        this.webServerConfig = webServerConfig;

        this.webServer = null;
        this.expressApp = express();
        this.expressApp.use(cors())

        // Is SSL enabled?
        if (webServerConfig.SSLEnabled) {
            var optionsExpress = {
                key: fs.readFileSync(webServerConfig.SSLKeyFile),
                cert: fs.readFileSync(webServerConfig.SSLCrtFile),
                passphrase: webServerConfig.SSLCrtFilePwd
            };
            let httpsServer = https.createServer(optionsExpress, this.expressApp);
            expressWs(this.expressApp, httpsServer);
            this.webServer = httpsServer;

        } else {
            expressWs(this.expressApp);
            this.webServer = this.expressApp;
        }

        this.expressApp.get('env');
        this.expressApp.use(bodyParser.urlencoded({
            extended: true
        }));
        this.expressApp.use(bodyParser.json());
    }

    start() {
        let thisDRPServer = this;
        return new Promise(function (resolve, reject) {
            thisDRPServer.webServer.listen(thisDRPServer.webServerConfig.Port, function () {
                resolve();
            });
        });
    }
}

// Handles incoming DRP connections
class DRP_ServerRoute extends drpEndpoint.Endpoint {
    constructor(service, route) {
        super();

        let thisServer = this;
        let expressApp = service.expressApp;
        this.service = service;

        if (expressApp && expressApp.route !== null) {
            // This may be an Express server
            if (typeof (expressApp.ws) === "undefined") {
                // Websockets aren't enabled
                throw new Error("Must enable ws on Express server");
            }
        } else {
            // Express server not present
            return;
        }

        expressApp.ws(route, async function drpWebsocketHandler(wsConn, req) {

            await thisServer.OpenHandler(wsConn, req);
            let remoteAddress = wsConn._socket.remoteAddress;
            let remotePort = wsConn._socket.remotePort;

            wsConn.on("message", function (message) {
                // Process command
                thisServer.ReceiveMessage(wsConn, message);
            });
            //wsConn.onclose = function (ev) { console.dir(ev, {depth:2}) };
            wsConn.on("close", function (closeCode, reason) {
                //console.log("CLOSED -> " + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort);
                //thisServer.CloseHandler(wsConn, closeCode, remoteAddress, remotePort)
                thisServer.CloseHandler(wsConn, closeCode);
            });

            wsConn.on("error", function (error) { thisServer.ErrorHandler(wsConn, error) });

        });
    }
}

class DRP_ProviderDeclaration {
    constructor(providerID, providerURL, classes, structure, streams, services) {
        this.ProviderID = providerID;
        this.ProviderURL = providerURL;
        this.Classes = classes || {};
        this.Structure = structure || {};
        this.Streams = streams || {};
        this.Services = services || {};
        this.SourceInstances = {};
    }
}

class DRP_Service {
    constructor(serviceID, expressApp) {
        this.serviceID = serviceID;
        this.expressApp = expressApp;
        this.serviceType = null;
        this.ProviderDeclarations = {};
        this.ProviderConnections = {};
        this.ServiceCommandTracking = {
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
        };
        this.RegistryClients = {};
        this.Services = {};
    }
    log(message) {
        let paddedName = this.serviceType.padEnd(8, ' ');
        let paddedServiceID = this.serviceID.padEnd(14, ' ');
        console.log(`${this.getTimestamp()} ${paddedName} [${paddedServiceID}] -> ${message}`);
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
    GetClassDefinitions() {
        //console.log("getting class definitions...");
        let results = {};
        let providerNames = Object.keys(this.ProviderDeclarations);
        //console.log("got provider names, looping...");
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let providerDeclaration = this.ProviderDeclarations[providerName];
            // Loop over Instances
            let instanceList = Object.keys(providerDeclaration.SourceInstances);
            for (let j = 0; j < instanceList.length; j++) {
                let sourceInstanceID = instanceList[j];
                //console.log("Looping over instanceID: " + instanceID);
                let sourceInstanceObj = providerDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    if (!results[className]) {
                        results[className] = providerDeclaration.SourceInstances[sourceInstanceID][className].Definition;
                    }
                }
            }
        }
        //console.dir(results);
        return results;
    }
    ListClassInstanceDefinitions() {
        let results = {};
        // Loop over Provider Declarations
        //console.log("Looping over this.ProviderDeclarations: " + this.ProviderDeclarations);
        let providerNames = Object.keys(this.ProviderDeclarations);
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let providerDeclaration = this.ProviderDeclarations[providerName];
            // Loop over Sources
            let sourceInstanceList = Object.keys(providerDeclaration.SourceInstances);
            for (let j = 0; j < sourceInstanceList.length; j++) {
                let sourceInstanceID = sourceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let sourceInstanceObj = providerDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    //console.log("Looping over className: " + className);
                    if (!results[className]) {
                        results[className] = {};
                    }
                    if (!results[className][sourceInstanceID]) {
                        results[className][sourceInstanceID] = {};
                    }
                    results[className][sourceInstanceID][providerName] = providerDeclaration.SourceInstances[sourceInstanceID][className];
                }
            }
        }
        return results;
    }
    ListClassInstances(params) {
        let results = {};
        let findClassName = params;
        let providerNames = Object.keys(this.ProviderDeclarations);
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let providerDeclaration = this.ProviderDeclarations[providerName];
            // Loop over Sources
            let sourceInstanceList = Object.keys(providerDeclaration.SourceInstances);
            for (let j = 0; j < sourceInstanceList.length; j++) {
                let sourceInstanceID = sourceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let sourceInstanceObj = providerDeclaration.SourceInstances[sourceInstanceID];
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    if (!findClassName || findClassName === className) {
                        if (!results[className]) {
                            results[className] = {};
                        }
                        if (!results[className][sourceInstanceID]) {
                            results[className][sourceInstanceID] = { providers: {} };
                        }
                        results[className][sourceInstanceID].providers[providerName] = Object.assign({}, providerDeclaration.SourceInstances[sourceInstanceID][className]);
                        delete results[className][sourceInstanceID].providers[providerName].Definition;
                    }
                }
            }
        }
        return results;
    }

    GetBaseObj_Provider() {
        return {
            Structure: this.Structure,
            Streams: this.TopicManager.Topics,
            Services: this.Services
        }
    }

    GetBaseObj_Broker() {
        let myService = this;
        let myRegistry = this.ProviderDeclarations;
        return {
            "Broker": myService,
            "Registry": myService.ProviderDeclarations,
            "Providers": async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let providerID = remainingChildPath.shift();

                    // Need to send command to provider with remaining tree data
                    //let oResults = await oCurrentObject[aChildPathArray[i]](aChildPathArray.splice(i + 1));
                    //if (typeof oResults == 'object') {
                    //    oReturnObject = oResults;
                    //}
                    params.pathList = remainingChildPath;
                    let thisProviderClient = await myService.VerifyProviderConnection(providerID);

                    // Await for command from provider
                    let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", params.method, params, true, null);
                    if (results && results.payload && results.payload) {
                        oReturnObject = results.payload;
                    }

                } else {
                    // Return list of providers
                    oReturnObject = {};
                    let aProviderKeys = Object.keys(myRegistry);
                    for (let i = 0; i < aProviderKeys.length; i++) {
                        oReturnObject[aProviderKeys[i]] = {
                            "ProviderType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            "Consumers": async function (params) {
                let remainingChildPath = params.pathList;
                let oReturnObject = null;
                if (remainingChildPath && remainingChildPath.length > 0) {

                    let agentID = remainingChildPath.shift();

                    // Need to send command to consumer with remaining tree data
                    params.pathList = remainingChildPath;
                    let thisConsumer = await myService.VerifyConsumerConnection(agentID);

                    // Await for command from consumer
                    let results = await myService.ConsumerRouteHandler.SendCmd(thisConsumer.wsConn, "DRP", params.method, params, true, null);
                    if (results && results.payload && results.payload) {
                        oReturnObject = results.payload;
                    }

                } else {
                    // Return list of consumers
                    oReturnObject = {};
                    let aConsumerKeys = Object.keys(myService.ConsumerConnections);
                    for (let i = 0; i < aConsumerKeys.length; i++) {
                        oReturnObject[aConsumerKeys[i]] = {
                            "ConsumerType": "SomeType1",
                            "Status": "Unknown"
                        };
                    }
                }
                return oReturnObject;
            },
            "Services": async function (params) {
                //console.log("Checking Services...");
                // Structure:
                //      \Services\{svcName}\Providers
                //      \Services\{svcName}\Commands\{cmdName}\param1\param2
                let remainingChildPath = params.pathList;
                let oReturnObject = {};

                let serviceInstanceID = remainingChildPath.shift();

                if (!serviceInstanceID) {
                    // List Services

                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(myService.ProviderDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let providerDeclaration = myService.ProviderDeclarations[providerName];
                        // Loop over Services
                        if (!providerDeclaration.Services) continue;
                        let serviceInstanceList = Object.keys(providerDeclaration.Services);
                        for (let j = 0; j < serviceInstanceList.length; j++) {
                            let serviceInstanceID = serviceInstanceList[j];
                            //console.log("Looping over sourceID: " + serviceInstanceID);
                            //let serviceInstanceObj = providerDeclaration.Services[serviceInstanceID];
                            if (!oReturnObject[serviceInstanceID]) oReturnObject[serviceInstanceID] = {
                                "ServiceName": serviceInstanceID,
                                "Providers": [],
                                "ClientCmds": providerDeclaration.Services[serviceInstanceID].ClientCmds
                            };

                            oReturnObject[serviceInstanceID].Providers.push(providerName);
                            //console.log("added sourceID: " + serviceInstanceID);
                        }
                    }
                } else {
                    let serviceAttribute = remainingChildPath.shift();

                    if (!serviceAttribute) {
                        // List Service Attributes

                        let providerNames = Object.keys(myService.ProviderDeclarations);
                        for (let i = 0; i < providerNames.length; i++) {
                            let providerName = providerNames[i];
                            //console.log("Looping over providerName: " + providerName);
                            let providerDeclaration = myService.ProviderDeclarations[providerName];
                            // Loop over Services
                            if (!providerDeclaration.Services) continue;
                            let serviceInstanceList = Object.keys(providerDeclaration.Services);
                            for (let j = 0; j < serviceInstanceList.length; j++) {
                                if (serviceInstanceID === serviceInstanceList[j]) {
                                    if (!oReturnObject["Providers"]) {
                                        oReturnObject = {
                                            "Providers": [],
                                            "ClientCmds": {}
                                        };

                                        let cmdList = providerDeclaration.Services[serviceInstanceID].ClientCmds;
                                        for (let k = 0; k < cmdList.length; k++) {
                                            let cmdName = cmdList[k];
                                            oReturnObject["ClientCmds"][cmdName] = async function () {
                                                let cmdObj = {
                                                    "serviceName": serviceInstanceID,
                                                    "cmd": cmdName,
                                                    "params": null
                                                }
                                                oReturnObject = await myService.ServiceCommand(cmdObj, null, null);
                                                return oReturnObject;
                                            }
                                        }

                                    }
                                    oReturnObject["Providers"].push(providerName);
                                }
                                //console.log("added sourceID: " + serviceInstanceID);
                            }
                        }

                        if (oReturnObject["Providers"]) {
                            oReturnObject["Providers"] = oReturnObject["Providers"].join(",");
                        }
                    } else {
                        if (serviceAttribute === "ClientCmds") {
                            let methodName = remainingChildPath.shift();
                            if (!methodName) {
                                // List Methods
                                let providerNames = Object.keys(myService.ProviderDeclarations);
                                for (let i = 0; i < providerNames.length; i++) {
                                    let providerName = providerNames[i];
                                    //console.log("Looping over providerName: " + providerName);
                                    let providerDeclaration = myService.ProviderDeclarations[providerName];
                                    // Loop over Services
                                    if (!providerDeclaration.Services) continue;
                                    let serviceInstanceList = Object.keys(providerDeclaration.Services);
                                    for (let j = 0; j < serviceInstanceList.length; j++) {
                                        if (serviceInstanceID === serviceInstanceList[j]) {

                                            let cmdList = providerDeclaration.Services[serviceInstanceID]["ClientCmds"];
                                            for (let k = 0; k < cmdList.length; k++) {
                                                let cmdName = cmdList[k];
                                                oReturnObject[cmdName] = async function () {
                                                    let cmdObj = {
                                                        "serviceName": serviceInstanceID,
                                                        "cmd": cmdName,
                                                        "params": null
                                                    }
                                                    oReturnObject = await myService.ServiceCommand(cmdObj, null, null);
                                                }
                                            }
                                            return oReturnObject;
                                        }
                                        //console.log("added sourceID: " + serviceInstanceID);
                                    }
                                }
                            } else {
                                // Execute Method
                                let cmdObj = {
                                    serviceName: serviceInstanceID,
                                    cmd: methodName,
                                    params: {
                                        pathList: remainingChildPath
                                    }
                                };
                                oReturnObject = await myService.ServiceCommand(cmdObj, null, null);
                            }
                        }
                    }
                }
                /*
                if (remainingChildPath && remainingChildPath.length > 0) {

                    //console.log(" -> Have remaining child path...");

                    let serviceInstanceID = remainingChildPath.shift();

                    params.pathList = remainingChildPath;

                    let providerNames = Object.keys(myService.ProviderDeclarations);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let providerDeclaration = myService.ProviderDeclarations[providerName];
                        // Loop over Services
                        if (!providerDeclaration.Services) continue;
                        let serviceInstanceList = Object.keys(providerDeclaration.Services);
                        for (let j = 0; j < serviceInstanceList.length; j++) {
                            if (serviceInstanceID == serviceInstanceList[j]) {
                                if (!oReturnObject["Providers"]) {
                                    oReturnObject = {
                                        "Providers": [],
                                        "Commands": {}
                                        //"Commands": providerDeclaration.Services[serviceInstanceID]
                                    };
                                    
                                    let cmdList = providerDeclaration.Services[serviceInstanceID];
                                    for (let k = 0; k < cmdList.length; k++) {
                                        let cmdName = cmdList[k];
                                        oReturnObject.Commands[cmdName] = async function () {
                                            let cmdObj = {
                                                "serviceName": serviceInstanceID,
                                                "cmd": cmdName,
                                                "params": null
                                            }
                                            oReturnObject = await myService.ServiceCommand(cmdObj, null, null);
                                            return oReturnObject;
                                        }
                                    }
                                    
                                }
                                oReturnObject["Providers"].push(providerName);
                            }
                            //console.log("added sourceID: " + serviceInstanceID);
                        }
                    }

                    if (oReturnObject["Providers"]) {
                        oReturnObject["Providers"] = oReturnObject["Providers"].join(",");
                    }
                    /*
                    if (oReturnObject["Commands"]) {
                        oReturnObject["Commands"] = oReturnObject["Commands"].join(",");
                    }

                    //let thisProviderClient = await myBroker.VerifyProviderConnection(providerID);

                    // Await for command from provider
                    //let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", params.method, params, true, null);
                    //if (results && results.payload && results.payload) {
                    //    oReturnObject = results.payload;
                    //}
                    
                } else {
                    // Return list of services
                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(myService.ProviderDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let providerDeclaration = myService.ProviderDeclarations[providerName];
                        // Loop over Services
                        if (!providerDeclaration.Services) continue;
                        let serviceInstanceList = Object.keys(providerDeclaration.Services);
                        for (let j = 0; j < serviceInstanceList.length; j++) {
                            let serviceInstanceID = serviceInstanceList[j];
                            //console.log("Looping over sourceID: " + serviceInstanceID);
                            //let serviceInstanceObj = providerDeclaration.Services[serviceInstanceID];
                            if (!oReturnObject[serviceInstanceID]) oReturnObject[serviceInstanceID] = {
                                "ServiceName": serviceInstanceID,
                                "Providers": [],
                                "Commands": providerDeclaration.Services[serviceInstanceID]
                            };

                            oReturnObject[serviceInstanceID].Providers.push(providerName);
                            //console.log("added sourceID: " + serviceInstanceID);
                        }
                    }
                }
                */
                //console.dir(oReturnObject);
                return oReturnObject;
            }, "Streams": async function (params) {
                //console.log("Checking Streams...");
                let remainingChildPath = params.pathList;
                let oReturnObject = {};
                if (remainingChildPath && remainingChildPath.length > 0) {

                    //console.log(" -> Have remaining child path...");

                    let streamInstanceID = remainingChildPath.shift();

                    params.pathList = remainingChildPath;

                    let providerNames = Object.keys(myService.ProviderDeclarations);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let providerDeclaration = myService.ProviderDeclarations[providerName];
                        // Loop over Streams
                        if (!providerDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(providerDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            if (streamInstanceID === streamInstanceList[j]) {
                                if (!oReturnObject["Providers"]) {
                                    oReturnObject = {
                                        "Providers": [],
                                    };
                                }
                                oReturnObject["Providers"].push(providerName);
                            }
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }

                    if (oReturnObject["Providers"]) {
                        oReturnObject["Providers"] = oReturnObject["Providers"].join(",");
                    }

                    if (oReturnObject["ClientCmds"]) {
                        oReturnObject["ClientCmds"] = oReturnObject["ClientCmds"].join(",");
                    }
                    /*
                    let thisProviderClient = await myBroker.VerifyProviderConnection(providerID);

                    // Await for command from provider
                    let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", params.method, params, true, null);
                    if (results && results.payload && results.payload) {
                        oReturnObject = results.payload;
                    }
                    */
                } else {
                    // Return list of Streams
                    //console.log(" -> No remaining child path...");
                    let providerNames = Object.keys(myService.ProviderDeclarations);
                    //console.log(` -> Checking keys[${providerNames.length}]...`);
                    for (let i = 0; i < providerNames.length; i++) {
                        let providerName = providerNames[i];
                        //console.log("Looping over providerName: " + providerName);
                        let providerDeclaration = myService.ProviderDeclarations[providerName];
                        // Loop over Streams
                        if (!providerDeclaration.Streams) continue;
                        let streamInstanceList = Object.keys(providerDeclaration.Streams);
                        for (let j = 0; j < streamInstanceList.length; j++) {
                            let streamInstanceID = streamInstanceList[j];
                            //console.log("Looping over sourceID: " + streamInstanceID);
                            //let streamInstanceObj = providerDeclaration.Streams[streamInstanceID];
                            if (!oReturnObject[streamInstanceID]) oReturnObject[streamInstanceID] = {
                                "StreamName": streamInstanceID,
                                "Providers": [],
                            };

                            oReturnObject[streamInstanceID].Providers.push(providerName);
                            //console.log("added sourceID: " + streamInstanceID);
                        }
                    }
                }
                //console.dir(oReturnObject);
                return oReturnObject;
            }
        }
    }

    /**
   * @param {object} params Remaining path
   * @param {Boolean} baseObj Flag to return list of children
   * @returns {object} oReturnObject Return object
   */
    async GetObjFromPath(params, baseObj) {

        let aChildPathArray = params.pathList;

        // Initial object
        let oCurrentObject = baseObj;

        // Return object
        let oReturnObject = null;

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
                    switch (typeof oCurrentObject[aChildPathArray[i]]) {
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
                        default:
                            break PathLoop;
                    }

                } else {
                    // Child doesn't exist
                    break PathLoop;
                }
            }
        }

        // If we have a return object and want only a list of children, do that now
        if (params.listOnly) {
            if (typeof oReturnObject === 'object') {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: this.ListObjChildren(oReturnObject) };
                }
            } else {
                oReturnObject = null;
            }
        } else if (oReturnObject) {
            if (!(typeof oReturnObject === 'object') || !(oReturnObject["pathItem"])) {
                // Return object as item
                oReturnObject = { pathItem: oReturnObject };
            }
        }

        return oReturnObject;
    }

    async VerifyProviderConnection(providerID) {

        let thisService = this;

        let thisProviderDeclaration = this.ProviderDeclarations[providerID];
        if (!thisProviderDeclaration) return null;

        let thisProviderClient = this.ProviderConnections[providerID];

        // Establish a wsConn client if not already established
        if (!thisProviderClient || thisProviderClient.wsConn.readyState !== 1) {

            let targetURL = thisProviderDeclaration.ProviderURL;
            if (!targetURL) {
                targetURL = null;
            }

            this.log(`Connecting to provider [${providerID}] @ '${targetURL}'`);
            thisProviderClient = new DRP_Broker_ProviderClient(this, targetURL);
            this.ProviderConnections[providerID] = thisProviderClient;

            // If we have a valid target URL, wait a few seconds for connection to initiate
            if (targetURL) {
                for (let i = 0; i < 50; i++) {

                    // Are we still trying?
                    if (!thisProviderClient.wsConn.readyState) {
                        // Yes - wait
                        await sleep(100);
                    } else {
                        // No - break the for loop
                        break;
                    }
                }
            }

            // If no good connection, return false
            if (thisProviderClient.wsConn.readyState !== 1) {
                this.log("Sending back request...");
                // Let's try having the Provider call us; send command through Registry
                try {
                    // Get registry connection, can have multiple registries.  Pick the first one.
                    let registryList = Object.keys(thisService.RegistryClients);
                    if (registryList.length > 0) {
                        let registryClient = thisService.RegistryClients[registryList[0]];
                        registryClient.SendCmd(registryClient.wsConn, "DRP", "brokerToProviderCmd", { "providerID": providerID, "brokerID": thisService.brokerID, "token": "123", "wsTarget": thisService.brokerURL }, false, null);
                    }
                } catch (err) {
                    this.log(`ERR!!!! [${err}]`);
                }

                this.log("Starting wait...");
                // Wait a few seconds
                for (let i = 0; i < 50; i++) {

                    // Are we still trying?
                    if (!thisService.ProviderConnections[providerID] || !thisService.ProviderConnections[providerID].readyState) {
                        // Yes - wait
                        await sleep(100);
                    } else {
                        // No - break the for loop
                        thisProviderClient.wsConn = thisService.ProviderConnections[providerID];
                        thisService.ProviderConnections[providerID] = thisProviderClient;
                        this.log("Received back connection from provider!");
                    }
                }

                // If still not successful, return ProviderClient
                if (thisProviderClient.wsConn.readyState !== 1) {
                    this.log(`Not successful... readyState[${thisProviderClient.wsConn.readyState}]`);
                    thisProviderClient = null;
                    delete this.ProviderConnections[providerID];
                    throw new Error(`Could not get connection to Provider ${providerID}`);
                }
            }
        }

        return thisProviderClient;
    }

    async VerifyConsumerConnection(consumerID) {

        let thisService = this;

        let thisConsumerObj = null;

        let thisConsumerWS = this.ConsumerConnections[consumerID];

        // Establish a wsConn client if not already established
        if (thisConsumerWS && thisConsumerWS.readyState === 1 && thisConsumerWS.clientObj) thisConsumerObj = thisConsumerWS.clientObj;

        return thisConsumerObj;
    }

    async sendBrokerRequest(method, params) {
        let thisService = this;
        // NEED TO UPDATE - if there is no proxyBrokerURL, interrogate the registry to find a broker
        if (!thisService.brokerClient) {
            await new Promise(resolve => {
                thisService.brokerClient = new DRP_Consumer_BrokerClient(thisService.proxyBrokerURL, resolve);
            });
        }

        let response = await thisService.brokerClient.SendCmd(thisService.brokerClient.wsConn, "DRP", method, params, true);
        return response.payload;
    }

    async AddService(serviceName, serviceObject) {
        if (serviceName && serviceObject && serviceObject.ClientCmds) {
            this.Services[serviceName] = serviceObject;
            if (this.ProviderDeclaration) {
                //this.ProviderDeclaration.Services[serviceName] = Object.keys(serviceObject.ClientCmds);
                this.ProviderDeclaration.Services[serviceName] = {
                    "ClientCmds": Object.keys(serviceObject.ClientCmds),
                    "Persistence": serviceObject.Persistence || false,
                    "Weight": serviceObject.Weight || 0,
                    "Zone": serviceObject.Zone || null
                };
            }
        }

        let registryList = Object.keys(this.RegistryClients);
        for (let i = 0; i < registryList.length; i++) {
            let thisRegistryClient = this.RegistryClients[registryList[i]];
            if (thisRegistryClient.wsConn.readyState === 1) {
                await thisRegistryClient.SendCmd(thisRegistryClient.wsConn, "DRP", "registerProvider", this.ProviderDeclaration, true, null);
            }
        }
    }

    AddStream(streamName, streamDescription) {
        if (streamName && streamDescription) {
            this.ProviderDeclaration.Streams[streamName] = streamDescription;
        }
    }

    async ServiceCommand(cmdObj, wsConn, token) {
        let baseMsg = "ERR executing ServiceCommand:";
        if (!cmdObj) {
            this.Registry.log(`${baseMsg} params not supplied`);
            return null;
        }
        if (!cmdObj.serviceName) {
            this.Registry.log(`${baseMsg} params.serviceName not supplied`);
            return null;
        }
        if (!cmdObj.cmd) {
            this.Registry.log(`${baseMsg} params.method not supplied`);
            return null;
        }
        if (!this.Services[cmdObj.serviceName]) {
            this.Registry.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
            return null;
        }
        if (!this.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd]) {
            this.Registry.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
            return null;
        }
        return await this.Services[cmdObj.serviceName].ClientCmds[cmdObj.cmd](cmdObj.params, wsConn);
    }
}

class DRP_Registry extends DRP_Service {
    constructor(registryID, expressApp) {

        super(registryID, expressApp);
        this.serviceType = "Registry";

        let thisDRPRegistry = this;

        this.ProviderDeclarations = {};

        this.ProviderConnections = {};
        this.BrokerConnections = {};

        this.RouteHandler = new DRP_Registry_Route(this, '/registry');
    }

    RegisterProvider(declaration, wsConn, token) {
        if (typeof (declaration) !== "undefined" && typeof (declaration.ProviderID) !== "undefined" && declaration.ProviderID !== null && declaration.ProviderID !== "") {
            // Add provider and relay to Brokers
            wsConn.ProviderID = declaration.ProviderID;
            this.ProviderConnections[declaration.ProviderID] = wsConn;
            this.ProviderDeclarations[declaration.ProviderID] = declaration;
            this.RelayProviderChange("registerProvider", declaration);
            //console.log("Provider registered...");
            //console.dir(declaration, {depth: 10});
            return "OKAY";
        } else return "NO PROVIDER ID";
    }

    UnregisterProvider(providerID) {
        // Delete provider and relay to Brokers
        delete this.ProviderConnections[providerID];
        delete this.ProviderDeclarations[providerID];
        this.RelayProviderChange("unregisterProvider", providerID);
    }

    RelayProviderChange(cmd, params) {
        // Relay to Brokers
        //console.dir(this.BrokerConnections);
        let brokerIDList = Object.keys(this.BrokerConnections);
        for (let i = 0; i < brokerIDList.length; i++) {
            this.RouteHandler.SendCmd(this.BrokerConnections[brokerIDList[i]], "DRP", cmd, params, false, null);
            this.log(`Relayed to broker: ${brokerIDList[i]}`);
        }
    }

    RegisterBroker(params, wsConn, token) {
        if (typeof (params) !== "undefined" && params !== null && params !== "") {
            wsConn.BrokerID = params;
            this.BrokerConnections[wsConn.BrokerID] = wsConn;
            return "OKAY";
        } else return "NO BROKER ID";
    }

    UnregisterBroker(brokerID) {
        delete this.BrokerConnections[brokerID];
    }
}

class DRP_Registry_Route extends DRP_ServerRoute {
    /**
    * @param {DRP_Registry} registry DRP Registry
    * @param {string} route WS route
    */
    constructor(registry, route) {

        // Initialize server
        super(registry, route);

        let thisRegistryRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerBroker", "RegisterBroker");
        this.RegisterCmd("registerProvider", "RegisterProvider");
        this.RegisterCmd("getDeclarations", "GetDeclarations");
        this.RegisterCmd("brokerToProviderCmd", "BrokerToProviderCmd");
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        //console.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");

        if (wsConn.BrokerID) {
            this.service.UnregisterBroker(wsConn.BrokerID);
        }

        if (wsConn.ProviderID) {
            this.service.UnregisterProvider(wsConn.ProviderID);
        }
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async RegisterBroker(params, wsConn, token) {
        this.service.log("Registering broker...");
        return this.service.RegisterBroker(params, wsConn, token);
    }

    async RegisterProvider(params, wsConn, token) {
        this.service.log("Registering provider...");
        return this.service.RegisterProvider(params, wsConn, token);
    }

    /**
    * @returns {{providerID:ProviderDeclaration}} Provider Declarations
    */
    async GetDeclarations() {
        return this.service.ProviderDeclarations;
    }

    async BrokerToProviderCmd(params, wsConn, token) {
        // Find Provider connection, relay this packet
        this.service.log(`Relaying to Provider [${params.providerID}]...`);
        //console.dir(params);
        this.service.RouteHandler.SendCmd(this.service.ProviderConnections[params.providerID], "DRP", "brokerToProviderCmd", params, false, null);
        return null;
    }
}

class DRP_Provider extends DRP_Service {
    /**
	* @param {string} providerID Globally unique ID for Provider
    * @param {express} expressApp WS enabled ExpressApp
	* @param {string} providerURL Broker to Provider URL
    * @param {string} providerRoute Route for WS endpoints to access this instance
    */
    constructor(providerID, expressApp, providerURL, providerRoute) {

        super(providerID, expressApp);
        this.serviceType = "Provider";

        this.providerRoute = providerRoute;
        if (!providerRoute) this.providerRoute = "/provider";

        let thisDRPProvider = this;

        this.expressApp = expressApp;

        this.ProviderDeclaration = new DRP_ProviderDeclaration(providerID, providerURL);

        this.Structure = {};

        this.Services = {};

        //this.RegistryConnections = {};
        this.BrokerConnections = {};

        // Create RouteHandler
        this.RouteHandler = new DRP_Provider_Route(this, this.providerRoute);

        // Create topic manager, assign to BrokerRoute
        this.TopicManager = new DRP_TopicManager(this.RouteHandler);
    }

    ConnectToRegistry(registryURL, proxy) {
        // Initiate Registry Connection
        this.RegistryClients[registryURL] = new DRP_Provider_RegistryClient(this, registryURL, proxy);
    }

    RegisterBroker(params, wsConn, token) {
    }

    Subscribe(params, wsConn, token) {
        this.TopicManager.SubscribeToTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

    Unsubscribe(params, wsConn, token) {
        this.TopicManager.UnsubscribeFromTopic(params.topicName, wsConn, params.streamToken, params.filter);
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            let objKeys = Object.keys(oTargetObject);
            for (let i = 0; i < objKeys.length; i++) {
                let returnVal;
                //let attrType = typeof currentPathObj[objKeys[i]];
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

}

class DRP_Provider_Route extends DRP_ServerRoute {
    /**
    * @param {DRP_Provider} provider DRP Provider
    * @param {string} route WS route
    */
    constructor(provider, route) {

        // Initialize server
        super(provider, route);

        let thisProviderRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerBroker", "RegisterBroker");
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");
        this.RegisterCmd("serviceCommand", async function (...args) {
            return await provider.ServiceCommand(...args);
        });
        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let oReturnObject = await thisProviderRoute.service.GetObjFromPath(params, thisProviderRoute.service.GetBaseObj_Provider());
            //console.log("OUTPUT FROM cliGetPath...");
            //console.dir(oReturnObject);

            // If we have a return object and want only a list of children, do that now
            if (params.listOnly) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: thisProviderRoute.service.ListObjChildren(oReturnObject) };
                }
            } else if (oReturnObject) {
                if (!oReturnObject.pathItem) {
                    // Return object as item
                    oReturnObject = { pathItem: oReturnObject };
                }
            }
            /*
            // If we have a return object, get children
            if (oReturnObject && typeof oReturnObject == 'object') {
                // Return only child keys and data types
                oReturnObject = { "pathItems": provider.ListObjChildren(oReturnObject) };
            }
            */
            //console.dir(oReturnObject);
            return oReturnObject;
        });
        /*
        this.RegisterCmd("register", function (params, wsConn, token) {
            return provider.RegisterBroker(params, wsConn);
        })
        */
    }

    // Define handlers
    async OpenHandler(wsConn, req) {
        this.service.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        setInterval(function ping() {
            wsConn.ping(function () { });
        }, 30000);
    }

    async CloseHandler(wsConn, closeCode) {
        this.service.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async RegisterBroker(params, wsConn, token) {
        return this.service.RegisterBroker(params, wsConn, token);
    }

    // Subscribe to data stream
    async Subscribe(params, wsConn, token) {
        return this.service.Subscribe(params, wsConn, token);
    }

    // Unsubscribe from data stream
    async Unsubscribe(params, wsConn, token) {
        return this.service.Unsubscribe(params, wsConn, token);
    }
}

class DRP_Provider_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRP_Provider} provider DRP Provider
    * @param {string} wsTarget WS target
    * @param {string} proxy Web proxy
    */
    constructor(provider, wsTarget, proxy) {
        super(wsTarget, proxy);
        this.service = provider;

        this.RegisterCmd("brokerToProviderCmd", "BrokerToProviderCmd");
    }

    // Define handlers
    async OpenHandler(wsConn, req) {
        this.service.log("Provider to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        //let response = await this.SendCmd(this.wsConn, "DRP", "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        let response = await this.SendCmd(this.wsConn, "DRP", "registerProvider", this.service.ProviderDeclaration, true, null);

        response = await this.SendCmd(this.wsConn, "DRP", "getDeclarations", null, true, null);

        this.service.ProviderDeclarations = response.payload;

        //console.log("Register response...");
        //console.dir(response, { depth: 10 });
    }

    async CloseHandler(wsConn, closeCode) {
        let remoteAddress = null;
        let remotePort = null;
        if (wsConn._socket) {
            remoteAddress = wsConn._socket.remoteAddress;
            remotePort = wsConn._socket.remotePort;
        }
        this.service.log("Provider to Registry client [" + remoteAddress + ":" + remotePort + "] closed with code [" + closeCode + "]");
        await sleep(5000);
        this.RetryConnection();
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Provider to Registry client encountered error [" + error + "]");
    }

    async BrokerToProviderCmd(params, wsConn, token) {
        let thisRegistryClient = this;
        // We've received a message from a Broker through the Registry; should be a connection request
        this.service.log("We've received a message from a Broker through the Registry...");
        //console.dir(params);

        this.service.log(`Connecting to broker [${params.brokerID}] @ '${params.wsTarget}'`);
        let wsConnBroker = null;
        if (thisRegistryClient.proxy) {
            let opts = url.parse(thisRegistryClient.proxy);
            let agent = new HttpsProxyAgent(opts);
            wsConnBroker = new WebSocket(params.wsTarget, "drp", { agent: agent });
        } else {
            wsConnBroker = new WebSocket(params.wsTarget, "drp");
        }
        wsConnBroker.on('open', function () {
            thisRegistryClient.service.log("Connected to broker...");
            thisRegistryClient.service.RouteHandler.OpenHandler(wsConnBroker);
            thisRegistryClient.service.RouteHandler.SendCmd(wsConnBroker, "DRP", "providerConnection", { token: params.token, providerID: thisRegistryClient.service.ProviderDeclaration.ProviderID });
        });

        wsConnBroker.on("message", function (message) {
            // Process command
            //thisRegistryClient.service.log("Message to broker...");
            thisRegistryClient.service.RouteHandler.ReceiveMessage(wsConnBroker, message);
        });

        wsConnBroker.on("close", function (closeCode) {
            thisRegistryClient.service.log(`Closed conn to broker: [${closeCode}]`);
            thisRegistryClient.service.RouteHandler.CloseHandler(wsConnBroker, closeCode)
        });

        wsConnBroker.on("error", function (error) {
            thisRegistryClient.service.log(`Errored conn to broker: [${error}]`);
            thisRegistryClient.service.RouteHandler.ErrorHandler(wsConnBroker, error)
        });

        thisRegistryClient.service.BrokerConnections[params.brokerID] = wsConnBroker;
    }
}

class DRP_Broker extends DRP_Service {
    constructor(brokerID, expressApp, registryURL, brokerURL, registryOpenedHandler) {

        super(brokerID, expressApp);
        this.serviceType = "Broker";

        let thisDRPBroker = this;

        this.brokerID = brokerID;

        this.expressApp = expressApp;

        this.registryURL = registryURL;

        this.brokerURL = brokerURL;

        /**
         * @type {{string: ProviderDeclaration}} ProviderDeclarations
         * */

        this.ProviderConnections = {};
        this.RegistryConnections = {};
        this.ConsumerConnections = {};

        //this.ProviderCallbacks = {};

        this.RegistryOpenedHandler = registryOpenedHandler;

        if (expressApp) {
            this.ConsumerRouteHandler = new DRP_Broker_Route(this, '/broker');
            this.routerStack = this.expressApp._router.stack;
            let brokerRestHandler = async function (req, res, next) {
                // Turn path into list, remove first element
                let remainingPath = req.path.replace(/^\/|\/$/g, '').split('/');
                remainingPath.shift();
                //remainingPath.shift();

                // If the last item is empty (trailing slash), remove it.
                /*
                if (remainingPath.length) {
                    if (remainingPath[remainingPath.length - 1].length == 0) {
                        remainingPath.pop();
                    }
                }
                */

                let listOnly = true;
                let format = null;

                if (req.query.getItem) listOnly = false;
                if (req.query.format) format = 1;

                // Treat as "getPath"
                let results = await thisDRPBroker.ConsumerRouteHandler.PathCmd({ "method": "cliGetPath", "pathList": remainingPath, "listOnly": listOnly });
                try {
                    res.end(JSON.stringify(results, null, format));
                } catch(e) {
                    res.end(`Failed to stringify response: ${e}`);
                }
                next();
            }

            expressApp.get("/broker", brokerRestHandler);
            expressApp.get("/broker/*", brokerRestHandler);
        }

        // Create topic manager, assign to ConsumerRoute
        this.TopicManager = new DRP_TopicManager(this.ConsumerRouteHandler);

        // Initiate Registry Connection
        this.RegistryClients[this.registryURL] = new DRP_Broker_RegistryClient(this, this.registryURL);
    }

    RegisterConsumer(params, wsConn, token) {
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            let objKeys = Object.keys(oTargetObject);
            for (let i = 0; i < objKeys.length; i++) {
                let returnVal;
                //let attrType = typeof currentPathObj[objKeys[i]];
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

    /**
    * @param {DRP_PathCmd} pathCmd Path Command Object
    * @param {object} wsConn Caller's Websocket connection
    * @param {string} replytoken Caller's reply token
    * @returns {object} oReturnObject Return object
    */
    async PathCmd(pathCmd, wsConn, replytoken) {
        // We either need to find the object locally and execute or dispatch
        // Initial object
        let oCurrentObject = this.GetBaseObj_Broker();

        // Return object
        let oReturnObject = null;

        let aChildPathArray = pathCmd.pathList;
        let bReturnChildList = pathCmd.listOnly;

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
                    switch (typeof oCurrentObject[aChildPathArray[i]]) {
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
                            let oResults = await oCurrentObject[aChildPathArray[i]](aChildPathArray.splice(i + 1));
                            if (typeof oResults === 'object') {
                                oReturnObject = oResults;
                            }
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

        // If we have a return object and want only a list of children, do that now
        if (oReturnObject && typeof oReturnObject === 'object' && bReturnChildList) {
            if (!oReturnObject.pathItems) {
                // Return only child keys and data types
                oReturnObject = this.ListObjChildren(oReturnObject);
            }
        }

        return oReturnObject;
    }

    GetPath(pathList) {
        /*
         * Currently this is based on a static struct; need to make it dynamic.
         * If the client requests access to actual objects on a provider, we
         * need to establish a connection to the provider (if not already) and
         * send a command to retrieve the objects
         */
        let currentPathObj = this.ProviderDeclarations;
        for (let i = 0; i < pathList.length; i++) {
            if (currentPathObj.hasOwnProperty(pathList[i]) && typeof currentPathObj[pathList[i]] === 'object') {
                currentPathObj = currentPathObj[pathList[i]];
            } else {
                return { "pathItems": [] };
            }
        }
        let pathObjList = [];
        let objKeys = Object.keys(currentPathObj);
        for (let i = 0; i < objKeys.length; i++) {
            let returnVal;
            //let attrType = typeof currentPathObj[objKeys[i]];
            let childAttrObj = currentPathObj[objKeys[i]];
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
                    returnVal = currentPathObj[objKeys[i]];
            }
            pathObjList.push({
                "Name": objKeys[i],
                "Type": attrType,
                "Value": returnVal
            });
        }
        return { "pathItems": pathObjList };
    }

    GetItem(pathList) {
        let currentPathObj = this.ProviderDeclarations;
        for (let i = 0; i < pathList.length; i++) {
            if (currentPathObj.hasOwnProperty(pathList[i])) {
                currentPathObj = currentPathObj[pathList[i]];
            } else {
                return { "item": null };
            }
        }

        return { "item": currentPathObj };
    }

    SetItem(pathList, objData) {
        let currentPathObj = this.ProviderDeclarations;
        for (let i = 0; i < pathList.length; i++) {
            if (currentPathObj.hasOwnProperty(pathList[i])) {
                currentPathObj = currentPathObj[pathList[i]];
            } else {
                return { "item": null };
            }
        }

        return { "item": currentPathObj };
    }

    async GetClassRecords(params) {
        let thisBroker = this;

        let results = {};

        // If user didn't supply the className, return null
        if (!params || !params.className) return null;
        let thisClassName = params.className;

        // We need to get a list of all distinct INSTANCES for this class along with the best source for each
        let classInstances = thisBroker.ListClassInstances();

        // If we don't have data for this class, return null
        if (!classInstances[thisClassName]) return null;

        let thisClassObj = classInstances[thisClassName];

        // Loop over sourceInstances
        let sourceInstanceNames = Object.keys(thisClassObj);
        for (let j = 0; j < sourceInstanceNames.length; j++) {
            let thisSourceInstanceName = sourceInstanceNames[j];
            let thisSourceInstanceObj = thisClassObj[thisSourceInstanceName];

            // Loop over providers; get the best precedence (lower is better)
            let bestProviderObj = null;
            let bestProviderName = null;
            let providerNames = Object.keys(thisSourceInstanceObj.providers);
            for (let k = 0; k < providerNames.length; k++) {
                let thisProviderName = providerNames[k];
                let thisProviderObj = thisSourceInstanceObj.providers[thisProviderName];
                if (!bestProviderObj || thisProviderObj.Precedence < bestProviderObj.Precedence) {
                    bestProviderObj = thisProviderObj;
                    bestProviderName = thisProviderName;
                }
            }

            // We have the best provider for this class instance
            let recordPath = ["Providers", bestProviderName].concat(bestProviderObj.RecordPath);
            let returnData = await thisBroker.GetObjFromPath({ method: "cliGetPath", pathList: recordPath, listOnly: false }, thisBroker.GetBaseObj_Broker());
            results[thisSourceInstanceName] = returnData.pathItem;
        }
        return results;
    }

    ListServiceInstances(params) {
        let results = {};
        let findServiceName = params;
        let providerNames = Object.keys(this.ProviderDeclarations);
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let providerDeclaration = this.ProviderDeclarations[providerName];
            // Loop over Services
            if (!providerDeclaration.Services) continue;
            let serviceInstanceList = Object.keys(providerDeclaration.Services);
            for (let j = 0; j < serviceInstanceList.length; j++) {
                let serviceInstanceID = serviceInstanceList[j];
                //console.log("Looping over sourceID: " + sourceID);
                let serviceInstanceObj = providerDeclaration.Services[serviceInstanceID];
                if (!results[serviceInstanceID]) results[serviceInstanceID] = {
                    providers: [],
                    methods: serviceInstanceObj
                };

                results[serviceInstanceID].providers.push(providerName);
            }
        }
        return results;
    }

    async ServiceCommand(cmdObj, wsConn) {
        let thisBroker = this;

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
        if (thisBroker.Services[cmdObj.serviceName]) {
            let results = await super.ServiceCommand(cmdObj, wsConn);
            return results;
        } else {

            let targetProviderName = null;

            // Are we specifying which provider to run this through?
            if (cmdObj.targetProvider) {
                targetProviderName = cmdObj.targetProvider;
                if (!this.ProviderDeclarations[targetProviderName]) {
                    this.log(`${baseMsg} provider ${targetProviderName} does not exist`);
                    return null;
                }
            } else {
                // Loop over providers
                // TODO - implement load balancing, prioritization & zoning mechanism
                let providerNames = Object.keys(this.ProviderDeclarations);
                for (let i = 0; i < providerNames.length; i++) {
                    let thisProviderName = providerNames[i];

                    // Does this provider offer the service we need?
                    if (this.ProviderDeclarations[thisProviderName].Services && this.ProviderDeclarations[thisProviderName].Services[cmdObj.serviceName]) {

                        // Yes - pick this one
                        targetProviderName = thisProviderName;
                    }
                }

                // Did we find a provider with this service?
                if (!targetProviderName) {
                    // No suitable provider found
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not exist`);
                    console.dir(cmdObj)
                    return null;
                }
            }

            // Does this provider offer the service we need?
            if (this.ProviderDeclarations[targetProviderName].Services && this.ProviderDeclarations[targetProviderName].Services[cmdObj.serviceName]) {
                let checkService = this.ProviderDeclarations[targetProviderName].Services[cmdObj.serviceName];

                // Does the service offer the command we want to execute?
                if (checkService["ClientCmds"].includes(cmdObj.cmd)) {
                    // Let's execute it
                    let thisProviderClient = await this.VerifyProviderConnection(targetProviderName);

                    // Await for command from provider
                    let returnObj = null;
                    let results = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", "serviceCommand", cmdObj, true, null);
                    if (results && results.payload && results.payload) {
                        returnObj = results.payload;
                    }
                    return returnObj;
                } else {
                    this.log(`${baseMsg} service ${cmdObj.serviceName} does not have method ${cmdObj.cmd}`);
                    return null;
                }
            }
        }
    }
    /*
    GetSourceInstances() {
        //console.log("getting class definitions...");
        let results = {};
        let providerNames = Object.keys(this.ProviderDeclarations);
        //console.log("got provider names, looping...");
        for (let i = 0; i < providerNames.length; i++) {
            let providerName = providerNames[i];
            //console.log("Looping over providerName: " + providerName);
            let providerDeclaration = this.ProviderDeclarations[providerName];
            // Loop over Instances
            let instanceList = Object.keys(providerDeclaration.SourceInstances);
            for (let j = 0; j < instanceList.length; j++) {
                let sourceInstanceID = instanceList[j];
                //console.log("Looping over instanceID: " + instanceID);
                let sourceInstanceObj = providerDeclaration.SourceInstances[sourceInstanceID];
                results[sourceInstanceID] = {};
                // Loop over Classes
                let classNames = Object.keys(sourceInstanceObj);
                for (let k = 0; k < classNames.length; k++) {
                    let className = classNames[k];
                    if (!results[className]) {
                        results[className] = providerDeclaration.SourceInstances[sourceInstanceID][className].Definition;
                    }
                }
            }
        }
        //console.dir(results);
        return results;
    }
    */
}

class DRP_Broker_Route extends DRP_ServerRoute {
    /**
    * @param {DRP_Broker} broker DRP Broker
    * @param {string} route WS route
    */
    constructor(broker, route) {

        // Initialize server
        super(broker, route);

        let thisBrokerRoute = this;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn, token);
        });
        this.RegisterCmd("subscribe", "Subscribe");
        this.RegisterCmd("unsubscribe", "Unsubscribe");

        this.RegisterCmd("pathCmd", "PathCmd");

        this.RegisterCmd("getRegistry", function () {
            return thisBrokerRoute.service.ProviderDeclarations;
        });

        this.RegisterCmd("getClassRecords", async function (...args) {
            return await thisBrokerRoute.service.GetClassRecords(...args);
        });

        this.RegisterCmd("listClassInstances", function () {
            return thisBrokerRoute.service.ListClassInstances();
        });

        this.RegisterCmd("listServiceInstances", function () {
            return thisBrokerRoute.service.ListServiceInstances();
        });

        this.RegisterCmd("getClassDefinitions", function () {
            return thisBrokerRoute.service.GetClassDefinitions();
        });

        this.RegisterCmd("listClassInstanceDefinitions", async function (...args) {
            return await thisBrokerRoute.service.ListClassInstanceDefinitions(...args);
        });

        this.RegisterCmd("providerConnection", function (params, wsConn, token) {
            thisBrokerRoute.service.ProviderConnections[params.providerID] = wsConn;
            if (wsConn.id) delete thisBrokerRoute.service.ConsumerConnections[wsConn.id];
        });

        /*
        this.RegisterCmd("cliGetItem", function (params, wsConn, token) {
            return broker.GetItem(params.pathList, wsConn, token);
        });
        this.RegisterCmd("cliSetItem", function (params, wsConn, token) {
            return broker.SetItem(params.pathList, params.objData, wsConn, token);
        });
        */
    }

    // We need to override the default ProcessCmd; we may be receiving a "service" attribute
    async ProcessCmd(wsConn, message) {
        let thisEndpoint = this;

        var cmdResults = {
            status: 0,
            output: null
        };

        if (!message.serviceName || message.serviceName === "DRP") {
            if (typeof thisEndpoint.EndpointCmds[message.cmd] === 'function') {
                // Execute method
                try {
                    cmdResults.output = await thisEndpoint.EndpointCmds[message.cmd](message.params, wsConn, message.replytoken);
                    cmdResults.status = 1;
                } catch (err) {
                    cmdResults.output = err.message;
                }
            } else {
                cmdResults.output = "Endpoint does not have method";
                thisEndpoint.service.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
                console.dir(message);
                //console.dir(thisEndpoint.EndpointCmds);
            }
        } else {
            try {
                cmdResults.output = await thisEndpoint.service.ServiceCommand(message, wsConn);
                cmdResults.status = 1;
            } catch (err) {
                cmdResults.output = err.message;
            }
        }

        // Reply with results
        if (typeof message.replytoken !== "undefined" && message.replytoken !== null) {
            thisEndpoint.SendReply(wsConn, message.replytoken, cmdResults.status, cmdResults.output);
        }
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        //console.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");
        //this.service.ConsumerConnections
        if (!this.service.ConsumerConnectionID) this.service.ConsumerConnectionID = 1;
        //wsConn.id = `${wsConn._socket.remoteAddress}-${wsConn._socket.remotePort}`;
        wsConn.id = this.service.ConsumerConnectionID;
        this.service.ConsumerConnectionID++;
        this.service.ConsumerConnections[wsConn.id] = wsConn;
    }

    async CloseHandler(wsConn, closeCode) {
        //this.service.log("Broker client [" + wsConn.id + "] closed with code [" + closeCode + "]");
        if (wsConn.id) delete this.service.ConsumerConnections[wsConn.id];
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async Subscribe(params, wsConn, token, customRelayHandler) {
        let thisConsumerRoute = this;
        let results = {};
        // Register the declaration for future reference
        //console.log("Stream handler reply token: " + token);
        //console.dir(params);
        let subscriberStreamToken = params.streamToken;
        if (!wsConn.Subscriptions) wsConn.Subscriptions = {};
        wsConn.Subscriptions[subscriberStreamToken] = params.topicName;
        // Find anyone who provides this data and subscribe on the consumer's behalf
        let providerIDList = Object.keys(this.service.ProviderDeclarations);
        for (let i = 0; i < providerIDList.length; i++) {
            let providerID = providerIDList[i];
            //console.log(`Checking for stream [${params.topicName}] for client on provider [${providerID}]`);
            let thisProviderDeclaration = this.service.ProviderDeclarations[providerID];
            if (thisProviderDeclaration.Streams && thisProviderDeclaration.Streams[params.topicName]) {
                // This provider offers the desired stream
                /**
                * @type {DRP_Broker_ProviderClient} thisProviderClient DRP_Broker_ProviderClient
                */

                let thisProviderClient = await this.service.VerifyProviderConnection(providerID);

                // Subscribe on behalf of the Consumer
                //let streamToken = thisConsumerRoute.GetToken(thisProviderClient.wsConn);
                //console.log(`Subscribing to stream [${params.topicName}] for client from provider [${providerID}] using streamToken [${subscriberStreamToken}]`);
                let providerStreamToken = thisConsumerRoute.AddStreamHandler(thisProviderClient.wsConn, async function (response) {
                    //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                    //console.dir(response);
                    let sendFailed = false;
                    if (!wsConn.Subscriptions[subscriberStreamToken]) {
                        sendFailed = true;
                    } else if (customRelayHandler && typeof customRelayHandler === 'function') {
                        sendFailed = customRelayHandler(wsConn, subscriberStreamToken, 2, response.payload)
                    } else {
                        sendFailed = thisConsumerRoute.SendStream(wsConn, subscriberStreamToken, 2, response.payload);
                        //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                    }
                    if (sendFailed) {
                        // Client disconnected
                        if (thisProviderClient.wsConn.StreamHandlerQueue[response.token]) {
                            thisProviderClient.DeleteStreamHandler(thisProviderClient.wsConn, response.token);
                            //console.log("Stream handler removed forcefully");
                        }
                        let unsubResults = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", "unsubscribe", { "topicName": params.topicName, "streamToken": response.token }, true, null);
                        //console.log("Unsubscribe from orphaned stream");
                        //console.dir(unsubResults);
                    }
                });

                // Await for command from provider
                results[providerID] = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", "subscribe", { "topicName": params.topicName, "streamToken": providerStreamToken }, true, null);
            }
        }

        return results;
    }

    async Unsubscribe(params, wsConn, token) {
        let subscriberStreamToken = params.streamToken;
        //console.dir(wsConn.OutboundStreams);
        if (wsConn.Subscriptions && wsConn.Subscriptions[subscriberStreamToken]) {
            delete wsConn.Subscriptions[subscriberStreamToken];
            //console.log("Outbound stream removed");
        }
        return null;
    }

    async PathCmd(params, wsConn, token) {
        // params.method
        // params.pathList

        // First we should find where the item lives.  If remote, relay params and return results.
        switch (params.method) {
            case 'cliGetPath':
                return await this.service.GetObjFromPath(params, this.service.GetBaseObj_Broker());
            case 'cliGetItem':
                break;
            case 'cliSetItem':
                break;
            default:
        }
    }

}

class DRP_Broker_RegistryClient extends drpEndpoint.Client {
    /**
    * @param {DRP_Broker} broker DRP Broker
    * @param {string} wsTarget Registry WS target
    */
    constructor(broker, wsTarget) {
        super(wsTarget);
        this.service = broker;

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("registerProvider", "RegisterProvider");
        this.RegisterCmd("unregisterProvider", "UnregisterProvider");
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        this.service.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "DRP", "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });
        //console.log("Registering this broker...");
        //console.dir(this.Broker);
        response = await this.SendCmd(this.wsConn, "DRP", "registerBroker", this.service.brokerID, true, null);
        //console.log("Getting declarations broker...");
        response = await this.SendCmd(this.wsConn, "DRP", "getDeclarations", null, true, null);

        this.service.ProviderDeclarations = response.payload;
        this.service.TopicManager.SendToTopic("RegistryUpdate", { "action": "initialread", "declarations": this.service.ProviderDeclarations });
        //console.dir(response, { depth: 10 });

        // TODO - Iterate over provider declarations and build tree for data lookups
        // OR - Do it on the fly

        if (this.service.RegistryOpenedHandler && typeof this.service.RegistryOpenedHandler === 'function') {
            this.service.RegistryOpenedHandler();
        }
    }

    async CloseHandler(wsConn, closeCode) {
        let remoteAddress = null;
        let remotePort = null;
        if (wsConn._socket) {
            remoteAddress = wsConn._socket.remoteAddress;
            remotePort = wsConn._socket.remotePort;
        }
        this.service.log("Broker to Registry client [" + remoteAddress + ":" + remotePort + "] closed with code [" + closeCode + "]");
        await sleep(5000);
        this.RetryConnection();
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Broker to Registry client encountered error [" + error + "]");
    }

    // Define Endpoints commands
    async RegisterProvider(declaration) {
        let results = {};
        let thisService = this.service;
        let providerID = declaration.ProviderID;
        this.service.log("Registering provider [" + providerID + "]");
        this.service.ProviderDeclarations[providerID] = declaration;
        this.service.TopicManager.SendToTopic("RegistryUpdate", { "action": "register", "providerID": providerID, "declaration": declaration });

        // This needs to be moved elsewhere; loop over broker clients to see if this provider has any streams someone has subscribed to
        if (!declaration.Streams || Object.keys(declaration.Streams).length === 0) return;

        // Loop over streams
        let providerStreamNames = Object.keys(declaration.Streams);
        for (let i = 0; i < providerStreamNames.length; i++) {
            // Loop over clients
            let consumerConnList = Object.keys(this.service.ConsumerConnections);
            for (let j = 0; j < consumerConnList.length; j++) {
                let consumerWSConn = this.service.ConsumerConnections[consumerConnList[j]];
                if (!consumerWSConn.Subscriptions || Object.keys(consumerWSConn.Subscriptions).length === 0) continue;
                // Loop over client subscriptions
                let subscriptionTokens = Object.keys(consumerWSConn.Subscriptions);
                for (let k = 0; k < subscriptionTokens.length; k++) {
                    let subscriberStreamToken = subscriptionTokens[k];
                    let subscribedTopicName = consumerWSConn.Subscriptions[subscriberStreamToken];
                    if (providerStreamNames[i] === subscribedTopicName) {
                        // We have a match; need to subscribe
                        // This provider offers the desired stream
                        /**
                        * @type {DRP_Broker_ProviderClient} thisProviderClient DRP_Broker_ProviderClient
                        */

                        let thisProviderClient = await thisService.VerifyProviderConnection(providerID);

                        // Subscribe on behalf of the Consumer
                        //let streamToken = thisConsumerRoute.GetToken(thisProviderClient.wsConn);
                        //console.log(`Subscribing to stream [${subscribedTopicName}] for client from provider [${providerID}] using streamToken [${subscriberStreamToken}]`);
                        let providerStreamToken = thisService.ConsumerRouteHandler.AddStreamHandler(thisProviderClient.wsConn, async function (response) {
                            //console.log(`... stream data ... streamToken[${subscriberStreamToken}]`);
                            //console.dir(response);
                            let sendFailed = false;
                            if (!consumerWSConn.Subscriptions[subscriberStreamToken]) {
                                sendFailed = true;
                            } else {
                                sendFailed = thisService.ConsumerRouteHandler.SendStream(consumerWSConn, subscriberStreamToken, 2, response.payload);
                                //console.log(`Stream to consumer token[${subscriberStreamToken}]`);
                            }
                            if (sendFailed) {
                                // Client disconnected
                                if (thisProviderClient.wsConn.StreamHandlerQueue[response.token]) {
                                    thisProviderClient.DeleteStreamHandler(thisProviderClient.wsConn, response.token);
                                    //console.log("Stream handler removed forcefully");
                                }
                                let unsubResults = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", "unsubscribe", { "topicName": subscribedTopicName, "streamToken": response.token }, true, null);
                                //console.log("Unsubscribe from orphaned stream");
                                //console.dir(unsubResults);
                            }
                        });

                        // Await for command from provider
                        results[providerID] = await thisProviderClient.SendCmd(thisProviderClient.wsConn, "DRP", "subscribe", { "topicName": subscribedTopicName, "streamToken": providerStreamToken }, true, null);
                    }
                }
            }
        }
    }

    async UnregisterProvider(providerID) {
        this.service.log("Unregistering provider [" + providerID + "]");
        delete this.service.ProviderConnections[providerID];
        delete this.service.ProviderDeclarations[providerID];
        this.service.TopicManager.SendToTopic("RegistryUpdate", { "action": "unregister", "providerID": providerID });
    }
}

class DRP_Broker_ProviderClient extends drpEndpoint.Client {
    /**
    * @param {DRP_Broker} broker DRP Broker
    * @param {string} wsTarget Provider WS target
    */
    constructor(broker, wsTarget) {
        super(wsTarget);
        this.service = broker;
        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
    }

    // Define Handlers
    async OpenHandler(wsConn, req) {
        this.service.log("Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        //let response = await this.SendCmd(this.wsConn, "DRP", "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        let response = await this.SendCmd(this.wsConn, "DRP", "registerBroker", this.service.brokerID, true, null);

    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Provider client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        this.service.log("Broker to Provider client encountered error [" + error + "]");
    }
}

class DRP_Consumer_BrokerClient extends drpEndpoint.Client {
    constructor(wsTarget, callback) {
        super(wsTarget);
        this.postOpenCallback = callback;
    }

    async OpenHandler(wsConn, req) {
        let thisBrokerClient = this;

        thisBrokerClient.postOpenCallback();
    }

    async CloseHandler(wsConn, closeCode) {
        console.log("Consumer to Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }

    // Watch a stream
    async WatchStream(streamName, callback) {
        let thisBrokerClient = this;
        let streamToken = thisBrokerClient.AddStreamHandler(thisBrokerClient.wsConn, function (message) {
            if (message && message.payload) {
                callback(message.payload);
            }
        });

        let response = await thisBrokerClient.SendCmd(thisBrokerClient.wsConn, "DRP", "subscribe", { "topicName": streamName, "streamToken": streamToken }, true, null);

        if (response.status === 0) {
            this.DeleteCmdHandler(this.wsConn, streamToken);
            console.log("Subscribe failed, deleted handler");
        } else {
            console.log("Subscribe succeeded");
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

module.exports = {
    "Registry": DRP_Registry,
    "Provider": DRP_Provider,
    "Broker": DRP_Broker,
    "Server": DRP_Server,
    "ServerRoute": DRP_ServerRoute
}