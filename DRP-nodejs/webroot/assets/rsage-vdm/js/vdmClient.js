var JSONCmd = function () {
    this.cmd = '';
    this.data = {};
};

class DRP_Endpoint {
    constructor() {
        let thisEndpoint = this;
        this.EndpointCmds = {};
        this.RegisterCmd("getCmds", "GetCmds");
    }

    GetToken(wsConn) {
        if (!wsConn.TokenNum) {
            wsConn.ReplyHandlerQueue = {};
            wsConn.StreamHandlerQueue = {};
            wsConn.TokenNum = 1;
        }
        let replyToken = wsConn.TokenNum;
        wsConn.TokenNum++;
        return replyToken;
    }

    AddReplyHandler(wsConn, callback) {
        let token = this.GetToken(wsConn);
        wsConn.ReplyHandlerQueue[token] = callback;
        return token;
    }

    DeleteReplyHandler(wsConn, token) {
        delete wsConn.ReplyHandlerQueue[token];
    }

    AddStreamHandler(wsConn, callback) {
        let streamToken = this.GetToken(wsConn);
        wsConn.StreamHandlerQueue[streamToken] = callback;
        return streamToken;
    }

    DeleteStreamHandler(wsConn, streamToken) {
        if (wsConn && wsConn.StreamHandlerQueue) {
            delete wsConn.StreamHandlerQueue[streamToken];
        } else {
            console.log("ERROR: Could not delete streamToken[" + streamToken + "]");
        }
    }

    RegisterCmd(cmd, method) {
        let thisEndpoint = this;
        // Need to do sanity checks; is the method actually a method?
        if (typeof method === 'function') {
            thisEndpoint.EndpointCmds[cmd] = method;
        } else if (typeof thisEndpoint[method] === 'function') {
            thisEndpoint.EndpointCmds[cmd] = function (params, wsConn, replytoken) {
                return thisEndpoint[method](params, wsConn, replytoken);
            };
        } else {
            console.log("Cannot add EndpointCmds[" + cmd + "]" + " -> sourceObj[" + method + "] of type " + typeof thisEndpoint[method]);
        }
    }

    SendCmd(wsConn, serviceName, cmd, params, promisify, callback) {
        let thisEndpoint = this;
        let returnVal = null;
        let replyToken = null;

        if (promisify) {
            // We expect a response, using await; add 'resolve' to queue
            returnVal = new Promise(function (resolve, reject) {
                replyToken = thisEndpoint.AddReplyHandler(wsConn, function (message) {
                    resolve(message);
                });
            });
        } else if (typeof callback === 'function') {
            // We expect a response, using callback; add callback to queue
            replyToken = thisEndpoint.AddReplyHandler(wsConn, callback);
            //replyToken = thisEndpoint.GetToken(wsConn);
            //wsConn.ReturnCmdQueue[replyToken] = callback;
        } else {
            // We don't expect a response; leave replyToken null
        }

        let sendCmd = new DRP_Cmd(serviceName, cmd, params, replyToken);
        wsConn.send(JSON.stringify(sendCmd));
        //console.log("SEND -> " + JSON.stringify(sendCmd));
        return returnVal;
    }

    SendCmd_StreamHandler(wsConn, serviceName, cmd, params, callback, sourceApplet) {
        let thisEndpoint = this;
        let returnVal = null;
        let replyToken = null;

        if (!params) params = {};
        params.streamToken = thisEndpoint.AddStreamHandler(wsConn, callback);

        if (sourceApplet) {
            sourceApplet.streamHandlerTokens.push(params.streamToken);
        }

        returnVal = new Promise(function (resolve, reject) {
            replyToken = thisEndpoint.AddReplyHandler(wsConn, function (message) {
                //console.dir(message);
                resolve(message);
            });
        });

        let sendCmd = new DRP_Cmd(serviceName, cmd, params, replyToken);
        wsConn.send(JSON.stringify(sendCmd));
        //console.log("SEND -> " + JSON.stringify(sendCmd));

        return returnVal;
    }

    SendReply(wsConn, token, status, payload) {
        if (wsConn.readyState === WebSocket.OPEN) {
            let replyCmd = new DRP_Reply(token, status, payload);
            wsConn.send(JSON.stringify(replyCmd));
            //console.log("SEND -> " + JSON.stringify(replyCmd));
            return 0;
        } else {
            return 1;
        }
    }

    SendStream(wsConn, token, status, payload) {
        if (wsConn.readyState === WebSocket.OPEN) {
            let streamCmd = new DRP_Stream(token, status, payload);
            wsConn.send(JSON.stringify(streamCmd));
            //console.log("SEND -> " + JSON.stringify(streamCmd));
            return 0;
        } else {
            return 1;
        }
    }

    async ProcessCmd(wsConn, message) {
        let thisEndpoint = this;

        var cmdResults = {
            status: 0,
            output: null
        };

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
            console.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
            //console.dir(thisEndpoint.EndpointCmds);
        }

        // Reply with results
        if (typeof message.replytoken !== "undefined" && message.replytoken !== null) {
            thisEndpoint.SendReply(wsConn, message.replytoken, cmdResults.status, cmdResults.output);
        }
    }

    async ProcessReply(wsConn, message) {
        let thisEndpoint = this;

        //console.dir(message, {"depth": 10})

        // Yes - do we have the token?
        if (wsConn.hasOwnProperty("ReplyHandlerQueue") && wsConn.ReplyHandlerQueue.hasOwnProperty(message.token)) {

            // We have the token - execute the reply callback
            wsConn.ReplyHandlerQueue[message.token](message);

            delete wsConn.ReplyHandlerQueue[message.token];

        } else {
            // We do not have the token - tell the sender we do not honor this token
        }
    }

    async ProcessStream(wsConn, message) {
        let thisEndpoint = this;

        //console.dir(message, {"depth": 10})

        // Yes - do we have the token?
        if (wsConn.hasOwnProperty("StreamHandlerQueue") && wsConn.StreamHandlerQueue.hasOwnProperty(message.token)) {

            // We have the token - execute the reply callback
            wsConn.StreamHandlerQueue[message.token](message);

            // Is this the last item in the stream?
            if (message.status < 2) {

                // Yes - delete the handler
                delete wsConn.StreamHandlerQueue[message.token];
            }

        } else {
            // We do not have the token - tell the sender we do not honor this token
            let unsubResults = await thisEndpoint.SendCmd(wsConn, "DRP", "unsubscribe", { "streamToken": message.token }, true, null);
            //console.log("Send close request for unknown stream");
        }
    }

    async ReceiveMessage(wsConn, rawMessage) {
        let thisEndpoint = this;
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch (e) {
            console.log("Received non-JSON message, disconnecting client... %s", wsConn.url);
            wsConn.close();
            return;
        }
        //console.log("RECV <- " + rawMessage);

        switch (message.type) {
            case 'cmd':
                thisEndpoint.ProcessCmd(wsConn, message);
                break;
            case 'reply':
                thisEndpoint.ProcessReply(wsConn, message);
                break;
            case 'stream':
                thisEndpoint.ProcessStream(wsConn, message);
                break;
            default:
                console.log("Invalid message.type; here's the JSON data..." + rawMessage);
        }
    }

    GetCmds() {
        return Object.keys(this.EndpointCmds);
    }

    ListObjChildren(oTargetObject) {
        // Return only child keys and data types
        let pathObjList = [];
        if (oTargetObject && typeof oTargetObject === 'object') {
            let objKey;
            for (objKey in oTargetObject) {
                //let objKeys = Object.keys(oTargetObject);
                //for (let i = 0; i < objKeys.length; i++) {
                let returnVal;
                let attrType = null;
                //let attrType = typeof currentPathObj[objKeys[i]];
                let childAttrObj = oTargetObject[objKey];
                if (childAttrObj) {
                    attrType = Object.prototype.toString.call(childAttrObj).match(/^\[object (.*)\]$/)[1];

                    switch (attrType) {
                        case "String":
                            returnVal = childAttrObj;
                            break;
                        case "Number":
                            returnVal = childAttrObj;
                            break;
                        case "Array":
                            returnVal = childAttrObj.length;
                            break;
                        case "Function":
                            returnVal = null;
                            break;
                        case "Undefined":
                            returnVal = null;
                            break;
                        default:
                            returnVal = Object.keys(childAttrObj).length;
                    }
                } else returnVal = childAttrObj;
                pathObjList.push({
                    "Name": objKey,
                    "Type": attrType,
                    "Value": returnVal
                });

            }
        }
        return pathObjList;
    }

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
                //if (oCurrentObject.hasOwnProperty(aChildPathArray[i])) {
                if (oCurrentObject[aChildPathArray[i]]) {

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
                            if (i + 1 === aChildPathArray.length) {
                                oReturnObject = oCurrentObject[aChildPathArray[i]];
                            }
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
                oReturnObject = { pathItemList: [] };
            }
        } else if (oReturnObject) {
            if (!(typeof oReturnObject === 'object') || !oReturnObject["pathItem"]) {
                // Return object as item
                oReturnObject = { pathItem: oReturnObject };
            }
        }

        return oReturnObject;
    }

    async OpenHandler() { }

    async CloseHandler() { }

    async ErrorHandler() { }
}

class DRP_Client extends DRP_Endpoint {
    constructor() {
        super();
    }

    connect(wsTarget) {
        let thisClient = this;

        thisClient.wsTarget = wsTarget;

        // Create wsConn
        let wsConn = new WebSocket(wsTarget, "drp");
        this.wsConn = wsConn;

        wsConn.onopen = function () { thisClient.OpenHandler(wsConn); };

        wsConn.onmessage = function (message) { thisClient.ReceiveMessage(wsConn, message.data); };

        wsConn.onclose = function (closeCode) { thisClient.CloseHandler(wsConn, closeCode); };

        wsConn.onerror = function (error) { thisClient.ErrorHandler(wsConn, error); };

        this.RegisterCmd("cliGetPath", async function (params, wsConn, token) {
            let oReturnObject = await thisClient.GetObjFromPath(params, thisClient);

            // If we have a return object and want only a list of children, do that now
            if (params.listOnly) {
                if (!oReturnObject.pathItemList) {
                    // Return only child keys and data types
                    oReturnObject = { pathItemList: thisClient.ListObjChildren(oReturnObject) };
                }
            } else if (oReturnObject) {
                if (!oReturnObject.pathItem) {
                    // Return object as item
                    oReturnObject = { pathItem: oReturnObject };
                }
            }
            return oReturnObject;
        });
    }
}

class DRP_Cmd {
    constructor(serviceName, cmd, params, replytoken) {
        this.type = "cmd";
        this.cmd = cmd;
        this.params = params;
        this.serviceName = serviceName;
        this.replytoken = replytoken;
    }
}

class DRP_Reply {
    constructor(token, status, payload) {
        this.type = "reply";
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}

class DRP_Stream {
    constructor(token, status, payload) {
        this.type = "stream";
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}


class VDMClient {
    constructor(vdmDesktop) {

        let thisVDMClient = this;

        this.vdmServerAgent = null;

        this.vdmDesktop = vdmDesktop;
    }

    startSession(wsTarget) {
        let thisVDMClient = this;
        thisVDMClient.vdmServerAgent = new VDMServerAgent(thisVDMClient);
        thisVDMClient.vdmServerAgent.connect(wsTarget);
    }
    /*
    processLoginStatus(replyData, reconnect) {
        let thisVDMClient = this;
        if (replyData.loginSuccessful) {
            thisVDMClient.vdmServerAgent.username = replyData.userName;
            thisVDMClient.userLoginSuccess(reconnect);
        } else {
            thisVDMClient.userLoginFail();
        }
    }

    userLoginSuccess(reconnect) {
        let thisVDMClient = this;
        if (!reconnect) {
            thisVDMClient.vdmDesktop.loadDesktop();
            thisVDMClient.vdmDesktop.changeLEDColor('green');
        }
        return false;
    }

    userLoginFail() {
        let thisVDMClient = this;
        thisVDMClient.eraseCookie('sessionID');
        console.log("Login failed, redirecting...");
        setTimeout(function () {
            window.location.href = "/";
        }, 500);
    }
    */

    createCookie(name, value, days) {
        let expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            expires = "; expires=" + date.toGMTString();
        }
        document.cookie = name + "=" + value + expires + "; path=/";
    }

    readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    eraseCookie(name) {
        let thisVDMClient = this;
        thisVDMClient.createCookie(name, "", -1);
    }

    getLastSessionID() {
        let thisVDMClient = this;
        return thisVDMClient.readCookie('sessionID');
    }
}

class rSageApplet extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);

        let thisApplet = this;

        // Link to rSageClient
        this.vdmClient = appletProfile.vdmClient;

        // Handler for asynchronous commands received from the VDM Server
        this.recvCmd = {};

        // To track stream handlers for when window closes
        this.streamHandlerTokens = [];

    }

    // Send applet close notification to VDM Server after open
    postOpenHandler() {
        let thisApplet = this;
        thisApplet.sendCmd("VDM", "openUserApp",
            {
                appletName: thisApplet.appletName,
                appletIndex: thisApplet.appletIndex
            },
            false
        );
    }

    // Send applet close notification to VDM Server after closure
    postCloseHandler() {
        let thisApplet = this;
        // Delete stream handlers
        for (let i = 0; i < thisApplet.streamHandlerTokens.length; i++) {
            //console.dir(thisApplet.vdmClient.vdmServerAgent.wsConn);
            thisApplet.vdmClient.vdmServerAgent.DeleteStreamHandler(thisApplet.vdmClient.vdmServerAgent.wsConn, thisApplet.streamHandlerTokens[i]);
        }
        thisApplet.sendCmd("VDM", "closeUserApp",
            {
                appletName: thisApplet.appletName,
                appletIndex: thisApplet.appletIndex
            },
            false
        );
    }

    async sendCmd(serviceName, cmdName, cmdData, awaitResponse) {
        let thisApplet = this;
        let returnData = null;
        let wsConn = thisApplet.vdmClient.vdmServerAgent.wsConn;

        let response = await thisApplet.vdmClient.vdmServerAgent.SendCmd(wsConn, serviceName, cmdName, cmdData, awaitResponse, null);
        if (response) returnData = response.payload;

        return returnData;
    }

    async sendCmd_StreamHandler(serviceName, cmdName, cmdData, callback) {
        let thisApplet = this;
        let returnData = null;
        let wsConn = thisApplet.vdmClient.vdmServerAgent.wsConn;

        let response = await thisApplet.vdmClient.vdmServerAgent.SendCmd_StreamHandler(wsConn, serviceName, cmdName, cmdData, callback, thisApplet);
        if (response) returnData = response.payload;
        //console.log("Received response from stream subscription...");
        //console.dir(response);
        return returnData;
        // Sending command, specifying callback handler
        //thisApplet.vdmClient.appSendCmdWithTokenHandler(thisApplet.appletIndex, svrAppName, cmdName, cmdData, callback);
    }
}

class VDMServerAgent extends DRP_Client {
    constructor(vdmClient) {
        super();

        this.username = '';
        this.wsConn = '';
        this.sessionID = vdmClient.getLastSessionID();
        this.vdmClient = vdmClient;
		
		// This allows the client's document object to be viewed remotely via DRP
        this.HTMLDocument = vdmClient.vdmDesktop.vdmDiv.ownerDocument;
        this.URL = this.HTMLDocument.baseURI;
        this.wsTarget = null;
        this.platform = this.HTMLDocument.defaultView.navigator.platform;
        this.userAgent = this.HTMLDocument.defaultView.navigator.userAgent;
		
		// This is a test function for RickRolling users remotely via DRP
        this.RickRoll = function () {
            vdmClient.vdmDesktop.openApp("RickRoll", null);
        };
    }

    async OpenHandler(wsConn, req) {
        let thisVDMServerAgent = this;
        console.log("VDM Client to server [" + thisVDMServerAgent.wsTarget + "] opened");

        let response = await thisVDMServerAgent.SendCmd(thisVDMServerAgent.wsConn, "DRP", "hello", {
            platform: this.platform,
            userAgent: this.userAgent,
            URL: this.URL
        }, true, null);

        //let response = await thisVDMServerAgent.SendCmd(thisVDMServerAgent.wsConn, "VDM", "userLoginRequest", { "sessionID": thisVDMServerAgent.sessionID }, true, null);

        //thisVDMServerAgent.vdmClient.processLoginStatus(response.payload, thisVDMServerAgent.reconnect);
        thisVDMServerAgent.vdmClient.vdmDesktop.loadDesktop();
        thisVDMServerAgent.vdmClient.vdmDesktop.changeLEDColor('green');
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        let thisVDMServerAgent = this;
        thisVDMServerAgent.Disconnect();
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }

    Disconnect(isGraceful) {
        let thisVDMServerAgent = this;

        if (!isGraceful) {
            console.log("Unexpected connection drop, waiting 10 seconds for reconnect");
            setTimeout(function () {
                //window.location.href = "/";

                // Retry websocket connection
                thisVDMServerAgent.reconnect = true;
                thisVDMServerAgent.resetConnection();
                thisVDMServerAgent.connect(thisVDMServerAgent.wsTarget, thisVDMServerAgent.sessionID);
            }, 10000);

            thisVDMServerAgent.vdmClient.vdmDesktop.changeLEDColor('red');
        }
    }

    resetConnection() {
        this.username = '';
        this.wsConn = '';
        this.sessionID = this.vdmClient.getLastSessionID();
    }
}