var WebSocket = require('ws');
var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');

class DRP_Endpoint {
    constructor(wsConn) {
        this.wsConn = wsConn || null;
        let thisEndpoint = this;
        this.EndpointCmds = {};
        this.RegisterCmd("getCmds", "GetCmds");
    }

    GetToken(wsConnParam) {
        let wsConn = wsConnParam || this.wsConn;
        if (! wsConn.TokenNum) {
            wsConn.ReplyHandlerQueue = {};
            wsConn.StreamHandlerQueue = {};
            wsConn.TokenNum = 1;
        }
        let replyToken = wsConn.TokenNum;
        wsConn.TokenNum++;
        return replyToken.toString();
    }

    AddReplyHandler(wsConnParam, callback) {
        let wsConn = wsConnParam || this.wsConn;
        let token = this.GetToken(wsConn);
        wsConn.ReplyHandlerQueue[token] = callback;
        return token;
    }

    DeleteReplyHandler(wsConnParam, token) {
        let wsConn = wsConnParam || this.wsConn;
        delete wsConn.ReplyHandlerQueue[token];
    }

    AddStreamHandler(wsConnParam, callback) {
        let wsConn = wsConnParam || this.wsConn;
        let streamToken = this.GetToken(wsConn);
        wsConn.StreamHandlerQueue[streamToken] = callback;
        //console.dir(wsConn.StreamHandlerQueue);
        return streamToken;
    }

    DeleteStreamHandler(wsConnParam, streamToken) {
        let wsConn = wsConnParam || this.wsConn;
        if (wsConn && wsConn.StreamHandlerQueue) {
            delete wsConn.StreamHandlerQueue[streamToken];
            //console.log("Deleted stream handler!");
        } else {
            console.log("ERROR: Could not delete streamToken[" + streamToken + "]");
            //console.dir(wsConn.StreamHandlerQueue);
        }
    }

    RegisterCmd(cmd, method) {
        let thisEndpoint = this;
        // Need to do sanity checks; is the method actually a method?
        if (typeof method === 'function') {
            thisEndpoint.EndpointCmds[cmd] = method;
        } else if (typeof thisEndpoint[method] === 'function') {
            thisEndpoint.EndpointCmds[cmd] = function (...args) {
                return thisEndpoint[method](...args);
            };
        } else {
            console.log("Cannot add EndpointCmds[" + cmd + "]" + " -> sourceObj[" + method + "] of type " + typeof thisEndpoint[method]);
        }
    }

    SendCmd(wsConnParam, serviceName, cmd, params, promisify, callback) {
        let thisEndpoint = this;
        let returnVal = null;
        let replyToken = null;
        let wsConn = wsConnParam || this.wsConn;

        if (promisify) {
            // We expect a response, using await; add 'resolve' to queue
            returnVal = new Promise(function(resolve, reject) {
                replyToken = thisEndpoint.AddReplyHandler(wsConn, function(message) {
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

    SendReply(wsConnParam, token, status, payload) {
        let wsConn = wsConnParam || this.wsConn;
        if (wsConn.readyState === WebSocket.OPEN) {
            let replyCmd = new DRP_Reply(token, status, payload);
            let replyString = null;
            try {
                replyString = JSON.stringify(replyCmd);
            } catch (e) {
                replyString = JSON.stringify(new DRP_Reply(token, 2, `Failed to stringify response: ${e}`));
            }
            wsConn.send(replyString);
            //console.log("SEND -> " + replyString);
            return 0;
        } else {
            return 1;
        }
    }

    SendStream(wsConnParam, token, status, payload) {
        let wsConn = wsConnParam || this.wsConn;
        if (wsConn.readyState === WebSocket.OPEN) {
            let streamCmd = new DRP_Stream(token, status, payload);
            wsConn.send(JSON.stringify(streamCmd));
            //console.log("SEND -> " + JSON.stringify(streamCmd));
            return 0;
        } else {
            return 1;
        }
    }

    async ProcessCmd(wsConnParam, message) {
        let wsConn = wsConnParam || this.wsConn;
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
            if (thisEndpoint.service && thisEndpoint.service.log) {
                thisEndpoint.service.log("Remote endpoint tried to execute invalid method '" + message.cmd + "'...");
            } else {
                console.log("Remote endpoint tried to execute invalid method");
                console.dir(message);
                console.dir(thisEndpoint.service);
            }
            //console.dir(thisEndpoint.EndpointCmds);
        }

        // Reply with results
        if (typeof message.replytoken !== "undefined" && message.replytoken !== null) {
            thisEndpoint.SendReply(wsConn, message.replytoken, cmdResults.status, cmdResults.output);
        }
    }

    async ProcessReply(wsConnParam, message) {
        let wsConn = wsConnParam || this.wsConn;
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

    async ProcessStream(wsConnParam, message) {
        let wsConn = wsConnParam || this.wsConn;
        let thisEndpoint = this;

        //console.dir(message, {"depth": 10})

        // Yes - do we have the token?
        if (wsConn.hasOwnProperty("StreamHandlerQueue") && wsConn.StreamHandlerQueue.hasOwnProperty(message.token)) {

            // We have the token - execute the reply callback
            wsConn.StreamHandlerQueue[message.token](message);

        } else {
            // We do not have the token - tell the sender we do not honor this token
        }
    }
    
    async ReceiveMessage(wsConnParam, rawMessage) {
        let wsConn = wsConnParam || this.wsConn;
        let thisEndpoint = this;
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch (e) {
            console.log("Received non-JSON message, disconnecting client... %s", wsConn._socket.remoteAddress);
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

    async OpenHandler() { }

    async CloseHandler() { }

    async ErrorHandler() { }
}

class DRP_Client extends DRP_Endpoint {
    constructor(wsTarget, proxy) {
        super();
        this.wsTarget = wsTarget;
        this.proxy = proxy;
        let thisClient = this;

        let wsMaxPayload = 512 * 1024 * 1024;

        // Create wsConn
        let wsConn = null;
        if (thisClient.proxy) {
            let opts = url.parse(thisClient.proxy);
            let agent = new HttpsProxyAgent(opts);
            wsConn = new WebSocket(thisClient.wsTarget, "drp", { agent: agent, maxPayload: wsMaxPayload });
        } else {
            wsConn = new WebSocket(thisClient.wsTarget, "drp", { maxPayload: wsMaxPayload });
        }
        this.wsConn = wsConn;

        wsConn.on('open', function () {
            setInterval(function ping() {
                wsConn.ping(function () { });
            }, 30000);
            thisClient.OpenHandler(wsConn);
        });

        wsConn.on("message", function (message) {
            // Process command
            thisClient.ReceiveMessage(wsConn, message);
        });

        wsConn.on("close", function (closeCode) { thisClient.CloseHandler(wsConn, closeCode); });

        wsConn.on("error", function (error) { thisClient.ErrorHandler(wsConn, error); });
    }

    async RetryConnection() {
        let thisClient = this;
        let wsConn = null;
        if (thisClient.proxy) {
            let opts = url.parse(thisClient.proxy);
            let agent = new HttpsProxyAgent(opts);
            wsConn = new WebSocket(thisClient.wsTarget, "drp", { agent: agent });
        } else {
            wsConn = new WebSocket(thisClient.wsTarget, "drp");
        }
        this.wsConn = wsConn;

        wsConn.on('open', function () {
            setInterval(function ping() {
                wsConn.ping(function () { });
            }, 30000);
            thisClient.OpenHandler(wsConn);
        });

        wsConn.on("message", function (message) {
            // Process command
            thisClient.ReceiveMessage(wsConn, message);
        });

        wsConn.on("close", function (closeCode) { thisClient.CloseHandler(wsConn, closeCode); });

        wsConn.on("error", function (error) { thisClient.ErrorHandler(wsConn, error); });
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

module.exports = {
    Client: DRP_Client,
    Endpoint: DRP_Endpoint
};