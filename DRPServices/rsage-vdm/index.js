var drpService = require('drp-service');
var express = require('express');

class VDMServer_UserAppInstance {
    constructor(conn, appletIndex, appletName, vdmServer) {
        this.conn = conn;
        this.appletIndex = appletIndex;
        this.appletName = appletName;
        this.vdmServer = vdmServer;
        this.subscriptions = [];
    }

    RemoveSubscriptions() {
        // Remove subscription hooks specific to app
        var userAppObj = this;
        for (var subIdx in userAppObj.subscriptions) {
            var publisherObj = userAppObj.subscriptions[subIdx];
            publisherObj['subscribers'].splice(publisherObj['subscribers'].indexOf(userAppObj), 1);
        }
        userAppObj['subscriptions'] = [];
    }

    SubscribeTo(publisherObj) {
        // Add subscription hook
        var userAppObj = this;
        publisherObj['subscribers'].push(userAppObj);
        userAppObj['subscriptions'].push(publisherObj);
    }

    UnsubscribeFrom(publisherObj) {
        // Remove subscription hook
        var userAppObj = this;
        publisherObj['subscribers'].splice(publisherObj['subscribers'].indexOf(userAppObj), 1);
        userAppObj['subscriptions'].splice(userAppObj['subscriptions'].indexOf(publisherObj), 1);
    }

    SendCmd(appCmd, appData) {
        var userAppObj = this;
        if (userAppObj.conn.readyState === WebSocket.OPEN) {
            userAppObj.conn.send(JSON.stringify({
                'cmd': 'appCmd',
                'data': {
                    'appletIndex': userAppObj['appletIndex'],
                    'appCmd': appCmd,
                    'appData': appData
                }
            }));
        } else {
            this.vdmServer.LogWSClientEvent(userAppObj.conn, "Tried sending packet to closed WS client");
        }
    }

    ToObject() {
        // Return this
        var returnObj = {};
        var userAppObj = this;
        returnObj.appletIndex = userAppObj.appletIndex;
        returnObj.appletName = userAppObj.appletName;
        //returnObj.remoteAddress = userAppObj.remoteAddress;
        return returnObj;
    }
}

class VDMServer extends drpService.ServerRoute {
    constructor(expressApp, clientDirectory) {
        super({ expressApp: expressApp }, "/vdm");

        this.clientStaticDir = clientDirectory;
        expressApp.use(express.static(clientDirectory));

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)
        this.RegisterCmd("register", function (params, wsConn, token) {
            return broker.RegisterConsumer(params, wsConn, token);
        });
        //this.RegisterCmd("subscribe", "Subscribe");

        this.RegisterCmd("userLoginRequest", "UserLoginRequest");

        this.RegisterCmd("appCmdWithToken", "AppCmdWithToken");

        //this.RegisterCmd("getCmds", "GetCmds");

        var thisVDMServer = this;

        this.expressApp = expressApp;
        this.wsClients = [];
        this.clientSessions = {};
        this.wsServer = null;

        this.AppServerProfiles = {
        }
        
        this.ClientCmds = {
            "listClientSessions": function () {
                let returnObj = {};
                for (var i = 0; i < thisVDMServer.wsClients.length; i++) {
                    let thisClientObj = thisVDMServer.wsClients[i].clientObj;
                    if (thisClientObj) {
                        returnObj[i] = {
                            remoteAddress: thisVDMServer.wsClients[i]._socket.remoteAddress,
                            sessionID: thisClientObj['sessionID'],
                            userName: thisClientObj['userName'],
                            openApps: {}
                        }
                        let appKeys = Object.keys(thisClientObj.openApps);
                        for (let j = 0; j < appKeys.length; j++) {
                            let appObj = thisClientObj.openApps[appKeys[j]].ToObject();
                            returnObj[i].openApps[appObj.appletIndex] = appObj;
                        }
                    } else {
                        returnObj[i] = {
                            remoteAddress: thisVDMServer.wsClients[i]._socket.remoteAddress,
                            sessionID: null,
                            userName: null,
                            openApps: {}
                        }
                    }
                }

                return returnObj;
            },
            "getCommands": function () {
                let returnHash = {};
                let serverAppList = Object.keys(thisVDMServer.AppServerProfiles);
                for (let i = 0; i < serverAppList.length; i++) {
                    let serverAppName = serverAppList[i];
                    returnHash[serverAppName] = Object.keys(thisVDMServer.AppServerProfiles[serverAppName].ClientCmds);
                }
                return returnHash;
            },
            "openUserApp": function (conn, appletIndex, appData) { thisVDMServer.OpenUserApp(appData, conn, null) },
            "closeUserApp": function (conn, appletIndex, appData) { thisVDMServer.CloseUserApp(appData, conn, null) }

        }

        this.AddServerApp({
            "Name": "VDMAccess",
            "ClientCmds": this.ClientCmds
        });
        
        // Setup ID Generator
        var FlakeIdGen = require('flake-idgen');
        thisVDMServer.intformat = require('biguint-format');
        thisVDMServer.generator = new FlakeIdGen;

        thisVDMServer.GenerateID = function () {
            return thisVDMServer.intformat(thisVDMServer.generator.next(), 'dec')
        }

        this.expressApp.get('/login', function (req, res, next) {
            var userName = "testUser";
            var ip = req.connection.remoteAddress;
            var sessionID = thisVDMServer.GenerateID();
            thisVDMServer.AddClientSession({
                'sessionID': sessionID,
                'userName': userName,
                'userGroups': [],
                'openApps': {}
            });
            console.log("EXPRESS - Authenticated user [" + userName + "] from ip (" + ip + "), key {" + sessionID + "}");
            res.cookie('sessionID', sessionID);
            res.redirect('/client.html');
        });

        this.expressApp.use(function (req, res, next) {
            req.VDMServer = thisVDMServer;
            next();
        });

        // Redirect root requests to /login for authentication
        this.expressApp.get('/', function (req, res, next) {
            res.redirect('/login');
        });
    }

    async OpenHandler(wsConn, req) {
        let thisVDMServer = this;
        thisVDMServer.LogSysEvent("WS - new connection from ip (" + wsConn._socket.remoteAddress + ")");
        thisVDMServer.wsClients.push(wsConn);
    }

    async CloseHandler(wsConn, closeCode) {
        let thisVDMServer = this;
        for (var i = 0; i < thisVDMServer.wsClients.length; i++) {
            if (thisVDMServer.wsClients[i] == wsConn) {
                if (wsConn.clientObj) {
                    thisVDMServer.CloseAllUserApps(wsConn.clientObj);
                    thisVDMServer.LogWSClientEvent(wsConn, "disconnected");
                }
                thisVDMServer.wsClients.splice(i, 1);
                break;
            }
        }
    }

    UserLoginRequest(params, wsConn, streamToken) {
        let thisVDMServer = this;
        let replyChunk = {};
        if (params.sessionID in thisVDMServer.clientSessions) {
            var thisClientObj = thisVDMServer.clientSessions[params.sessionID];
            wsConn.clientObj = thisClientObj;
            // Need to tag conn with ClientObjectID
            replyChunk.loginSuccessful = true;
            replyChunk.userName = thisClientObj["userName"];
            thisVDMServer.LogWSClientEvent(wsConn, "authenticated");
        } else {
            replyChunk.loginSuccessful = false;
            thisVDMServer.LogSysEvent("WS - failed auth from ip (" + wsConn._socket.remoteAddress + "), key {" + params.sessionID + "}");
            //console.log("WS - failed auth from ip (" + conn._socket.remoteAddress + "), key {" + data.sessionID + "}");
            //conn.send(JSON.stringify(replyChunk));
            //conn.close();
        }
        return replyChunk;
    }

    AddClientSession(params) {
        let thisVDMServer = this;
        // Need to add logic to validate that 'data' contains [sessionID, userName and userGroups]
        thisVDMServer.clientSessions[params.sessionID] = params;
    }

    async AppCmdWithToken(params, wsConn, streamToken) {
        let thisVDMServer = this;
        let replyChunk = {};

        var tgtApp = thisVDMServer.AppServerProfiles[params.appName];
        if (tgtApp && tgtApp.ClientCmds && tgtApp.ClientCmds[params.appCmd]) {
            replyChunk = await tgtApp.ClientCmds[params.appCmd](params.appData, wsConn, streamToken);
        } else {
            thisVDMServer.LogWSClientEvent(wsConn, "sent unrecognized command: '" + params.appName + "' -> '" + params.appCmd + "'");
        }

        return replyChunk;
    }

    async GetCmds(params, wsConn, streamToken) {
        let thisVDMServer = this;
        let replyChunk = {};

        let serverAppList = Object.keys(thisVDMServer.AppServerProfiles);
        for (let i = 0; i < serverAppList.length; i++) {
            let serverAppName = serverAppList[i];
            replyChunk[serverAppName] = Object.keys(thisVDMServer.AppServerProfiles[serverAppName].ClientCmds);
        }

        return replyChunk;
    }

    /*
    AppSendCmd(conn, appIndex, appCmd, appData) {
        let thisVDMServer = this;
        var sendChunk = new VDMServer_JSONCmd();
        sendChunk.cmd = 'appCmd';
        sendChunk.data.appIndex = appIndex;
        sendChunk.data.appCmd = appCmd;
        sendChunk.data.appData = appData;
        sendChunk.token = null;
        conn.send(JSON.stringify(sendChunk));
    }

    AppSendCmdWithToken(conn, appData, token, stream) {
        let thisVDMServer = this;
        var sendChunk = new VDMServer_JSONCmd();
        sendChunk.data = appData;
        sendChunk.token = token;
        sendChunk.stream = stream;
        conn.send(JSON.stringify(sendChunk));
    }
    */
    Broadcast(sendCmd, sendData) {
        let thisVDMServer = this;
        for (var i = 0; i < thisVDMServer.wsClients.length; i++) {
            var thisClient = thisVDMServer.wsClients[i];
            if (thisClient.clientObj) {
                thisClient.send(JSON.stringify({ cmd: sendCmd, data: sendData }));
            }
        }
    }

    AddServerApp(appDefinition) {
        let thisVDMServer = this;
        // Check to see if we have a name and the necessary attributes
        if (!appDefinition) {
            console.log("Cannot add app - No definition");
        } else if (!appDefinition.Name) {
            console.log("Cannot add app - Name not defined");
        } else if (!appDefinition.ClientCmds) {
            console.log("Cannot add app '" + appDefinition.Name + "' - App definition does not contain 'ClientCmds' parameter");
        } else {
            thisVDMServer.AppServerProfiles[appDefinition.Name] = appDefinition;
        }
    }

    OpenUserApp(params, wsConn, streamToken) {
        let thisVDMServer = this;
        thisVDMServer.LogWSClientEvent(wsConn, "opened app '" + params["appletName"] + "' [" + params["appletIndex"] + "]");
        // Create object to represent open app under client connection['openApps'] object
        wsConn.clientObj.openApps[params["appletIndex"]] = new VDMServer_UserAppInstance(wsConn, params["appletIndex"], params["appletName"], thisVDMServer);
    }

    CloseUserApp(params, wsConn, streamToken) {
        let thisVDMServer = this;
        thisVDMServer.LogWSClientEvent(wsConn, "closed app '" + params["appletName"] + "' [" + params["appletIndex"] + "]");
        // Remove Subscriptions
        wsConn.clientObj.openApps[params["appletIndex"]].RemoveSubscriptions();
        // Remove from user app hash
        delete wsConn.clientObj.openApps[params["appletIndex"]];
    }

    CloseAllUserApps(clientObj) {
        let thisVDMServer = this;
        Object.keys(clientObj.openApps).forEach(function (appletIndex) {
            thisVDMServer.LogWSClientEvent(clientObj.openApps[appletIndex]["conn"], "closed app '" + clientObj.openApps[appletIndex]["appletName"] + "' [" + clientObj.openApps[appletIndex]["appletIndex"] + "] - FORCED");
            // Remove Subscriptions
            clientObj.openApps[appletIndex].RemoveSubscriptions();
            // Remove from user app hash
            delete clientObj.openApps[appletIndex];
        })
    }
    /*
    async ParseJSONCmd(conn, jsonMessage) {
        let thisVDMServer = this;
        var message;
        try {
            message = JSON.parse(jsonMessage);
        } catch (e) {
            console.log("Received non-JSON message, disconnecting client... %s", conn._socket.remoteAddress);
            conn.close();
            return;
        }
        // Add logic to see if conn has been authorized
        if (message.cmd) {
            try {
                if (conn.clientObj) {
                    switch (message.cmd) {
                        case 'userLoginRequest':
                            // Already authenticated, shouldn't reach this
                            thisVDMServer.LogWSClientEvent(conn, "tried to re-authenticate");
                            break;
                        case 'appCmd':
                            var tgtApp = thisVDMServer.AppServerProfiles[message.data.appName];
                            if (tgtApp && tgtApp.ClientCmds && tgtApp.ClientCmds[message.data.appCmd]) {
                                tgtApp.ClientCmds[message.data.appCmd](conn, message.data.appIndex, message.data.appData);
                            } else {
                                thisVDMServer.LogWSClientEvent(conn, "sent unrecognized command: '" + message.data.appName + "' -> '" + message.data.appCmd + "'");
                            }
                            break;
                        case 'appCmdWithToken':
                            var tgtApp = thisVDMServer.AppServerProfiles[message.data.appName];
                            if (tgtApp && tgtApp.ClientCmds && tgtApp.ClientCmds[message.data.appCmd]) {
                                let responseData = await tgtApp.ClientCmds[message.data.appCmd](conn, message.data.appIndex, message.data.appData, message.token);
                                if (responseData) {
                                    thisVDMServer.AppSendCmdWithToken(conn, responseData, message.token)
                                }
                            } else {
                                thisVDMServer.LogWSClientEvent(conn, "sent unrecognized command: '" + message.data.appName + "' -> '" + message.data.appCmd + "'");
                            }
                            break;
                        case 'openApp':
                            thisVDMServer.OpenUserApp(conn, message.data);
                            break;
                        case 'closeApp':
                            thisVDMServer.CloseUserApp(conn, message.data);
                            break;
                        default:
                            thisVDMServer.LogSysEvent("Unknown command.  Here's the JSON data..." + jsonMessage);
                            //console.log("Unknown command.  Here's the JSON data..." + jsonMessage);
                            conn.send("Unknown command.  Here's the JSON data..." + jsonMessage);
                            break;
                    }
                } else {
                    switch (message.cmd) {
                        case 'userLoginRequest':
                            let replyChunk = thisVDMServer.UserLoginAttempt(conn, message.params);
                            conn.send(JSON.stringify(replyChunk));
                            break;
                        case 'appCmdWithToken':
                            var tgtApp = thisVDMServer.AppServerProfiles[message.data.appName];
                            if (tgtApp && tgtApp.ClientCmds && tgtApp.ClientCmds[message.data.appCmd]) {
                                let responseData = await tgtApp.ClientCmds[message.data.appCmd](conn, message.data.appIndex, message.data.appData, message.token);
                                if (responseData) {
                                    thisVDMServer.AppSendCmdWithToken(conn, responseData, message.token)
                                }
                            } else {
                                thisVDMServer.LogWSClientEvent(conn, "sent unrecognized command: '" + message.data.appName + "' -> '" + message.data.appCmd + "'");
                            }
                            break;
                        default:
                            var replyChunk = new VDMServer_JSONCmd();
                            replyChunk.cmd = 'disconnect';
                            replyChunk.data.reason = 'Must authenticate before sending command';
                            thisVDMServer.LogSysEvent("WS - failed to auth before sending command from ip (" + conn._socket.remoteAddress + "), key {" + message.data.sessionID + "}");
                            //console.log("WS - failed to auth before sending command from ip (" + conn._socket.remoteAddress + "), key {" + data.sessionID + "}");
                            conn.send(JSON.stringify(replyChunk));
                            conn.close();
                            break;
                    }
                }
            } catch (e) {
                console.log("Error processing command.  Here's the JSON data..." + jsonMessage);
                thisVDMServer.DumpError(e);
            }
        } else {
            console.log("Bad command.  Here's the JSON data..." + jsonMessage);
            conn.send("Bad command.  Here's the JSON data..." + jsonMessage);
        }
    }
    */
    LogWSClientEvent(conn, logMsg) {
        var thisVDMServer = this;
        var dateTimeStamp = thisVDMServer.GetTimestamp();
        if (conn.clientObj) {
            console.log(dateTimeStamp + " WS - [" + conn.clientObj["userName"] + "] key {" + conn.clientObj["sessionID"] + "} " + logMsg);
        } else {
            console.log(dateTimeStamp + " WS - [---] key {---} " + logMsg);
        }
    }

    LogSysEvent(logMsg) {
        var thisVDMServer = this;
        var dateTimeStamp = thisVDMServer.GetTimestamp();
        console.log(dateTimeStamp + " SYS - " + logMsg);
    }

    GetTimestamp() {
        var thisVDMServer = this;
        var date = new Date();

        var hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;

        var min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;

        var sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;

        var year = date.getFullYear();

        var month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;

        var day = date.getDate();
        day = (day < 10 ? "0" : "") + day;

        return year + "" + month + "" + day + "" + hour + "" + min + "" + sec;
    }

    DumpError(err) {
        var thisVDMServer = this;
        if (typeof err === 'object') {
            if (err.message) {
                console.log('\nMessage: ' + err.message)
            }
            if (err.stack) {
                console.log('\nStacktrace:')
                console.log('====================')
                console.log(err.stack);
            }
        } else {
            console.log('dumpError :: argument is not an object');
        }
    }
}

module.exports = VDMServer;
