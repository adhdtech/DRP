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

        let thisVDMServer = this;

        this.expressApp = expressApp;
        this.wsClients = [];
        this.clientSessions = {};
        this.wsServer = null;

        this.ClientCmds = {
            "listClientSessions": function () {
                let returnObj = {};
                let clientSessionIDList = Object.keys(thisVDMServer.clientSessions);
                for (let i = 0; i < clientSessionIDList.length; i++) {
                    let thisClientSessionID = clientSessionIDList[i];
                    let thisClientObj = thisVDMServer.clientSessions[thisClientSessionID];

                    if (thisClientObj) {
                        let remoteAddress = null;
                        let readyState = null;
                        if (thisClientObj.wsConn && thisClientObj.wsConn._socket) {
                            remoteAddress = thisClientObj.wsConn._socket.remoteAddress + ":" + thisClientObj.wsConn._socket.remotePort;
                            readyState = thisClientObj.wsConn._socket.readyState;
                        }
                        returnObj[thisClientSessionID] = {
                            remoteAddress: remoteAddress,
                            readyState: readyState,
                            sessionID: thisClientObj['sessionID'],
                            userName: thisClientObj['userName'],
                            openApps: {}
                        }
                        let appKeys = Object.keys(thisClientObj.openApps);
                        for (let j = 0; j < appKeys.length; j++) {
                            let appObj = thisClientObj.openApps[appKeys[j]].ToObject();
                            returnObj[thisClientSessionID].openApps[appObj.appletIndex] = appObj;
                        }
                    } else {
                        returnObj[thisClientSessionID] = {
                            remoteAddress: null, //thisVDMServer.wsClients[i]._socket.remoteAddress,
                            sessionID: null,
                            userName: null,
                            openApps: {}
                        }
                    }
                }

                return returnObj;
            },
            "openUserApp": function (params, wsConn) { thisVDMServer.OpenUserApp(params, wsConn) },
            "closeUserApp": function (params, wsConn) { thisVDMServer.CloseUserApp(params, wsConn) },
            "userLoginRequest": function (params, wsConn) {
                return thisVDMServer.UserLoginRequest(params, wsConn)
            }

        }

        // Setup ID Generator
        var FlakeIdGen = require('flake-idgen');
        thisVDMServer.intformat = require('biguint-format');
        thisVDMServer.generator = new FlakeIdGen;

        thisVDMServer.GenerateID = function () {
            return thisVDMServer.intformat(thisVDMServer.generator.next(), 'dec')
        }
		
		var IS_WIN = process.platform === 'win32';
        if (IS_WIN) {
            // For SSPI Authentication - Windows only
            var nodeSSPI = require('node-sspi');
            expressApp.use('/login', function (req, res, next) {
                var nodeSSPIObj = new nodeSSPI({
                    retrieveGroups: true
                });
                nodeSSPIObj.authenticate(req, res, function (err) {
                    res.finished || next();
                });
            });
            expressApp.route('/login')
                .get(function (req, res, next) {
                    var ip = req.connection.remoteAddress;
                    var sessionID = thisVDMServer.GenerateID();
                    thisVDMServer.AddClientSession({
                        'sessionID': sessionID,
                        'userName': req.connection.user,
                        'userGroups': req.connection.userGroups,
                        'openApps': {}
                    });
					thisVDMServer.LogExpressEvent(`Authenticated user [${req.connection.user}] from ip (${ip}), key {${sessionID}}`);
                    //thisVDMServer.LogSysEvent("EXPRESS - Authenticated user [" + req.connection.user + "] from ip (" + ip + "), key {" + sessionID + "}");
                    res.cookie('sessionID', sessionID);
                    res.redirect('/client.html');
                });
        } else {
            // For Basic Authentication - Cross platform
            var basicAuth = require('basic-auth');
            var auth = function (req, res, next) {
                function unauthorized(res) {
                    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
                    return res.sendStatus(401);
                }
                var user = basicAuth(req);
                if (!user || !user.name || !user.pass) {
                    return unauthorized(res);
                }
                // Static username and password for testing purposes only; you'll need to write your own user/pass check function
                if (user.name === 'testUser' && user.pass === 'testPass') {
                    return next();
                } else {
                    return unauthorized(res);
                }
            }
            expressApp.get('/login', auth, function (req, res, next) {
                var user = basicAuth(req);
                var ip = req.connection.remoteAddress;
                var sessionID = thisVDMServer.GenerateID();
                thisVDMServer.AddClientSession({
                    'sessionID': sessionID,
                    'userName': user.name,
                    'userGroups': [],
                    'openApps': {}
                });
				thisVDMServer.LogExpressEvent(`Authenticated user [${user.name}] from ip (${ip}), key {${sessionID}}`);
                //console.log("EXPRESS - Authenticated user [" + user.name + "] from ip (" + ip + "), key {" + sessionID + "}");
                res.cookie('sessionID', sessionID);
                res.redirect('/client.html');
            });
        }
		
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
            if (thisVDMServer.wsClients[i] === wsConn) {
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
            wsConn.clientObj.wsConn = wsConn;
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

    OpenUserApp(params, wsConn) {
        let thisVDMServer = this;
        thisVDMServer.LogWSClientEvent(wsConn, "opened app '" + params["appletName"] + "' [" + params["appletIndex"] + "]");
        // Create object to represent open app under client connection['openApps'] object
        wsConn.clientObj.openApps[params["appletIndex"]] = new VDMServer_UserAppInstance(wsConn, params["appletIndex"], params["appletName"], thisVDMServer);
    }

    CloseUserApp(params, wsConn) {
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

    LogWSClientEvent(conn, logMsg) {
        var thisVDMServer = this;
        var dateTimeStamp = thisVDMServer.GetTimestamp();

        let paddedName = "VDM".padEnd(8, ' ');
        let paddedServiceID = "WS".padEnd(14, ' ');
        let message = "";
        if (conn.clientObj) {
            message = "[" + conn.clientObj["userName"] + "] key {" + conn.clientObj["sessionID"] + "} " + logMsg;
        } else {
            message = "[---] key {---} " + logMsg;
        }
        console.log(`${dateTimeStamp} ${paddedName} [${paddedServiceID}] -> ${message}`);
    }

    LogSysEvent(logMsg) {
        var thisVDMServer = this;
        var dateTimeStamp = thisVDMServer.GetTimestamp();

        let paddedName = "VDM".padEnd(8, ' ');
        let paddedServiceID = "SYS".padEnd(14, ' ');
        let message = logMsg;
        console.log(`${dateTimeStamp} ${paddedName} [${paddedServiceID}] -> ${message}`);
    }

    LogExpressEvent(logMsg) {
        var thisVDMServer = this;
        var dateTimeStamp = thisVDMServer.GetTimestamp();

        let paddedName = "VDM".padEnd(8, ' ');
        let paddedServiceID = "EXPRESS".padEnd(14, ' ');
        let message = logMsg;
        console.log(`${dateTimeStamp} ${paddedName} [${paddedServiceID}] -> ${message}`);
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
