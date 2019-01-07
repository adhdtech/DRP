var WebSocket = require('ws');

class DRP_Endpoint {
    constructor() {
        let thisEndpoint = this;
        this.EndpointCmds = {};
        this.RegisterCmd("getCmds", "GetCmds");
    }

    GetToken(wsConn) {
        if (typeof (wsConn.ReturnCmdQueue) === "undefined") {
            wsConn.ReturnCmdQueue = {};
            wsConn.TokenNum = 0;
        }
        let replyToken = wsConn.TokenNum;
        wsConn.TokenNum++;
        return replyToken;
    }

    AddCmdHandler(wsConn, callback) {
        let token = this.GetToken(wsConn);
        wsConn.ReturnCmdQueue[token] = callback;
        return token;
    }

    DeleteCmdHandler(wsConn, token) {
        let streamToken = this.GetToken(wsConn);
        delete wsConn.ReturnCmdQueue[token];
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
            console.log("Cannot add EndpointCmds[" + cmd + "]" + " -> sourceObj[" + method + "]");
        }
    }

    SendCmd(wsConn, cmd, params, promisify, callback) {
        let thisEndpoint = this;
        let returnVal = null;
        let replyToken = null;

        if (promisify) {
            // We expect a response, using await; add 'resolve' to queue
            returnVal = new Promise(function (resolve, reject) {
                replyToken = thisEndpoint.GetToken(wsConn);
                wsConn.ReturnCmdQueue[replyToken] = function (message) {
                    resolve(message);
                };
            });
        } else if (typeof callback === 'function') {
            // We expect a response, using callback; add callback to queue
            replyToken = thisEndpoint.GetToken(wsConn);
            wsConn.ReturnCmdQueue[replyToken] = callback;
        } else {
            // We don't expect a response; leave replyToken null
        }

        let sendCmd = new DRP_Cmd(cmd, params, replyToken);
        wsConn.send(JSON.stringify(sendCmd));

        return returnVal;
    }

    SendResponse(wsConn, token, status, payload) {
        if (wsConn.readyState === WebSocket.OPEN) {
            wsConn.send(JSON.stringify(new DRP_Response(token, status, payload)));
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
        thisEndpoint.SendResponse(wsConn, message.replytoken, cmdResults.status, cmdResults.output);

    }

    async ProcessResponse(wsConn, message) {
        let thisEndpoint = this;

        //console.dir(message, {"depth": 10})

        // Yes - do we have the token?
        if (wsConn.hasOwnProperty("ReturnCmdQueue") && wsConn.ReturnCmdQueue.hasOwnProperty(message.token)) {

            // We have the token - execute the reply callback
            wsConn.ReturnCmdQueue[message.token](message);

            // If complete, delete the entry
            if (message.status < 2) {
                delete wsConn.ReturnCmdQueue[message.token];
            }

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

        // Is this a response?
        if (typeof (message.token) !== "undefined" && message.token !== null && message.token !== "") {

            // We have a response; try to process it
            thisEndpoint.ProcessResponse(wsConn, message);

        } else if (typeof (message.cmd) !== "undefined" && message.cmd !== null && message.cmd !== "") {

            // We have a command; try to process it
            thisEndpoint.ProcessCmd(wsConn, message);

        } else {
            console.log("No cmd or token; here's the JSON data..." + rawMessage);
            //thisStoreBotClient.wsConn.send("Bad command.  Here's the JSON data..." + jsonMessage);
        }
    }

    GetCmds() {
        return Object.keys(this.EndpointCmds);
    }

    async OpenHandler() { }

    async CloseHandler() { }

    async ErrorHandler() { }
}

// Handles incoming DRP connections
class DRP_Server extends DRP_Endpoint {
    constructor(expressApp, route) {
        super();

        let thisServer = this;

        if (expressApp !== null && expressApp.route !== null) {
            // This may be an Express server
            if (typeof (expressApp.ws) === "undefined") {
                // Websockets aren't enabled
                throw new Error("Must enable ws on Express server");
            }
        } else {
            // This isn't an Express server
            throw new Error("Object must be an Express server");
        }

        expressApp.ws(route, async function (wsConn, req) {

            thisServer.OpenHandler(wsConn, req);
            
            wsConn.on("message", function (message) {
                // Process command
                thisServer.ReceiveMessage(wsConn, message);
            });

            wsConn.on("close", function (closeCode) { thisServer.CloseHandler(wsConn, closeCode) });

            wsConn.on("error", function (error) { thisServer.ErrorHandler(wsConn, error) });

        });
    }
}

class DRP_Client extends DRP_Endpoint {
    constructor(wsTarget) {
        super();

        let thisClient = this;

        // Create wsConn
        let wsConn = new WebSocket(wsTarget);
        this.wsConn = wsConn;

        wsConn.on('open', function () { thisClient.OpenHandler(wsConn) });

        wsConn.on("message", function (message) {
            // Process command
            thisClient.ReceiveMessage(wsConn, message);
        });

        wsConn.on("close", function (closeCode) { thisClient.CloseHandler(wsConn, closeCode) });

        wsConn.on("error", function (error) { thisClient.ErrorHandler(wsConn, error) });
    }
}

class DRP_Cmd {
    constructor(cmd, params, replytoken) {
        this.cmd = cmd;
        this.params = params;
        this.replytoken = replytoken;
    }
}

class DRP_Response {
    constructor(token, status, payload) {
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}

module.exports = {
    Server: DRP_Server,
    Client: DRP_Client
}
