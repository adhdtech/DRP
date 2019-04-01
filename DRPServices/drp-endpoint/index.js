var WebSocket = require('ws');

class DRP_Endpoint {
    constructor() {
        let thisEndpoint = this;
        this.EndpointCmds = {};
        this.RegisterCmd("getCmds", "GetCmds");
    }

    GetToken(wsConn) {
        if (! wsConn.TokenNum) {
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
        //console.dir(wsConn.StreamHandlerQueue);
        return streamToken;
    }

    DeleteStreamHandler(wsConn, streamToken) {
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

    SendCmd(wsConn, cmd, params, promisify, callback) {
        let thisEndpoint = this;
        let returnVal = null;
        let replyToken = null;

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

        let sendCmd = new DRP_Cmd(cmd, params, replyToken);
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
            console.dir(message);
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

        } else {
            // We do not have the token - tell the sender we do not honor this token
        }
    }
    
    async ReceiveMessage(wsConn, rawMessage) {
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
    constructor(wsTarget) {
        super();

        let thisClient = this;

        // Create wsConn
        let wsConn = new WebSocket(wsTarget);
        this.wsConn = wsConn;

        wsConn.on('open', function () { thisClient.OpenHandler(wsConn); });

        wsConn.on("message", function (message) {
            // Process command
            thisClient.ReceiveMessage(wsConn, message);
        });

        wsConn.on("close", function (closeCode) { thisClient.CloseHandler(wsConn, closeCode) });

        wsConn.on("error", function (error) { thisClient.ErrorHandler(wsConn, error) });

        setInterval(function ping() {
            wsConn.ping(function () { });
        }, 30000);
    }
}

class DRP_Cmd {
    constructor(cmd, params, replytoken) {
        this.type = "cmd";
        this.cmd = cmd;
        this.params = params;
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
}
