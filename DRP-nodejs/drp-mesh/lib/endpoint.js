'use strict';

// Had to remove this so we don't have a circular eval problem
//const DRP_Node = require('./node');
const DRP_Subscription = require('./subscription');

const WebSocket = require('ws');

class DRP_Endpoint {
    /**
     * 
     * @param {Websocket} wsConn Websocket connection
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(wsConn, drpNode) {
        let thisEndpoint = this;
        /** @type {WebSocket} */
        this.wsConn = wsConn || null;
        /** @type {DRP_Node} */
        this.drpNode = drpNode;
        if (this.wsConn) {
            this.wsConn.drpEndpoint = this;
        }
        this.EndpointCmds = {};
        /** @type {{string:DRP_Subscription}} */
        this.Subscriptions = {};
        /** @type {function} */
        this.openCallback;
        /** @type {function} */
        this.closeCallback;
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
        } else {
            thisEndpoint.log("ERROR: Could not delete streamToken[" + streamToken + "]");
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
            thisEndpoint.log("Cannot add EndpointCmds[" + cmd + "]" + " -> sourceObj[" + method + "] of type " + typeof thisEndpoint[method]);
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
        return returnVal;
    }

    SendReply(wsConnParam, token, status, payload) {
        let wsConn = wsConnParam || this.wsConn;
        if (wsConn.readyState === WebSocket.OPEN) {
            let replyString = null;
            try {
                replyString = JSON.stringify(new DRP_Reply(token, status, payload));
            } catch (e) {
                replyString = JSON.stringify(new DRP_Reply(token, 2, `Failed to stringify response: ${e}`));
            }
            wsConn.send(replyString);
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
            return 0;
        } else {
            return 1;
        }
    }

    /**
     * 
     * @param {WebSocket} wsConnParam WebSocket connection
     * @param {DRP_Cmd} message DRP Command
     */
    async ProcessCmd(wsConnParam, message) {
        let wsConn = wsConnParam || this.wsConn;
        let thisEndpoint = this;

        // TODO - Add logic to support the .srcNodeID & .tgtNodeID attributes for command routing

        /**
         * Possible conditions:
         *      .tgtNodeID is NULL/undef || .tgtNodeID === thisEndpoint.drpNode.nodeID
         *          -> Execute locally
         *          
         *      .tgtNodeID exists && is a recognized node
         *          -> VerifyConnection & route command to target
         *          
         *       ELSE
         *          -> No path to .tgtNodeID
         **/

        var cmdResults = {
            status: 0,
            output: null
        };

        // Is the message meant for the default DRP service?
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
                thisEndpoint.log(`Remote endpoint tried to execute invalid method '${message.cmd}'`);
            }
        } else {
            try {
                cmdResults.output = await thisEndpoint.drpNode.ServiceCommand(message, wsConn);
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
            thisEndpoint.log("Received non-JSON message, disconnecting client... %s", wsConn._socket.remoteAddress);
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
                thisEndpoint.log("Invalid message.type; here's the JSON data..." + rawMessage);
        }
    }

    /**
     * 
     * @param {string} topicName Stream to watch
     * @param {string} scope global|local
     * @param {function} streamHandler Function to process stream packets
     */
    async WatchStream(topicName, scope, streamHandler) {
        let thisEndpoint = this;
        let subscriptionObj = new DRP_Subscription(null, topicName, scope, null, streamHandler);
        thisEndpoint.RegisterSubscription(subscriptionObj);
    }

    /**
    * 
    * @param {DRP_Subscription} subscriptionObject Subscription object
    */
    async RegisterSubscription(subscriptionObject) {
        let thisEndpoint = this;
        subscriptionObject.subscribedTo.push(thisEndpoint.wsConn.nodeID);
        let streamToken = thisEndpoint.AddStreamHandler(thisEndpoint.wsConn, function (message) {
            if (message && message.payload) {
                subscriptionObject.streamHandler(message.payload);
            }
        });

        let response = await thisEndpoint.SendCmd(thisEndpoint.wsConn, "DRP", "subscribe", { "topicName": subscriptionObject.topicName, "streamToken": streamToken, "scope": subscriptionObject.scope }, true, null);

        if (response.status === 0) {
            thisEndpoint.DeleteStreamHandler(thisEndpoint.wsConn, streamToken);
            subscriptionObject.subscribedTo.slice(subscriptionObject.subscribedTo.indexOf(thisEndpoint.wsConn.nodeID), 1);
            thisEndpoint.log("Subscribe failed, deleted handler");
        } else {
            thisEndpoint.log(`Subscribed to ${thisEndpoint.wsConn.nodeID} -> ${subscriptionObject.topicName}`);
        }
    }

    GetCmds() {
        return Object.keys(this.EndpointCmds);
    }

    async OpenHandler() { }

    async CloseHandler() { }

    async ErrorHandler() { }

    log(logMessage) {
        let thisEndpoint = this;
        if (thisEndpoint.drpNode) {
            thisEndpoint.drpNode.log(logMessage);
        } else {
            console.log(logMessage);
        }
    }
}

class DRP_Cmd {
    constructor(serviceName, cmd, params, replytoken, srcNodeID, tgtNodeID) {
        this.type = "cmd";
        this.cmd = cmd;
        this.params = params;
        this.serviceName = serviceName;
        this.replytoken = replytoken;
        this.srcNodeID = srcNodeID;
        this.tgtNodeID = tgtNodeID;
    }
}

class DRP_Reply {
    constructor(token, status, payload, srcNodeID, tgtNodeID) {
        this.type = "reply";
        this.token = token;
        this.status = status;
        this.payload = payload;
        this.srcNodeID = srcNodeID;
        this.tgtNodeID = tgtNodeID;
    }
}

class DRP_Stream {
    constructor(token, status, payload, srcNodeID, tgtNodeID) {
        this.type = "stream";
        this.token = token;
        this.status = status;
        this.payload = payload;
        this.srcNodeID = srcNodeID;
        this.tgtNodeID = tgtNodeID;
    }
}

module.exports = DRP_Endpoint;
