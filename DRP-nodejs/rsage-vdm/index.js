var drpService = require('drp-service');
var express = require('express');

// Create ID Generator
/*
var flakeIdGen = require('flake-idgen');
var intformat = require('biguint-format');
var idGenerator = new flakeIdGen;
*/

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

class VDMServer extends drpService.Service {
    constructor(serviceID, expressApp, clientDirectory) {
        super(serviceID);

        this.expressApp = expressApp;

        this.clientStaticDir = clientDirectory;
        expressApp.use(express.static(clientDirectory));

        expressApp.route('/')
            .get((req, res) => {
                res.sendFile("client.html", { "root": clientDirectory});
                //res.redirect('client.html');
                return;
            });

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)

        let thisVDMServer = this;

        //this.expressApp = expressApp;
        //this.wsClients = [];
        this.clientSessions = {};
        //this.wsServer = null;

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
                        };
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
                        };
                    }
                }

                return returnObj;
            },
            "openUserApp": function (params, wsConn) {
                thisVDMServer.OpenUserApp(params, wsConn);
            },
            "closeUserApp": function (params, wsConn) {
                thisVDMServer.CloseUserApp(params, wsConn);
            },
            "userLoginRequest": function (params, wsConn) {
                return thisVDMServer.UserLoginRequest(params, wsConn);
            }

        };

        /*
        thisVDMServer.GenerateID = function () {
            return intformat(idGenerator.next(), 'dec');
        };
        */

        thisVDMServer.expressApp.use(function vdmServerAttachHandler(req, res, next) {
            req.VDMServer = thisVDMServer;
            next();
        });
    }

    UserLoginRequest(params, wsConn, streamToken) {
        let thisVDMServer = this;
        let replyChunk = {};

        /*
         * NEED TO UPDATE!!!
         * 
         * Before we relied on Basic or SSPI auth to populate the clientSessions, but authentication
         * needs to be part of the DRP client protocol, not handled by basic or sspi auth
         * 
         * This function needs to be updated to accept user & password then authenticate it against <insert auth source here>
         * 
        */

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
        });
    }

    LogWSClientEvent(conn, logMsg) {
        var thisVDMServer = this;
        thisVDMServer.log(logMsg);
    }
}

module.exports = VDMServer;
