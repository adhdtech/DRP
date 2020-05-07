const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const express = require('express');
const Express_Application = express.application;
const Express_Request = express.request;
const Express_Response = express.response;
const DRP_AuthResponse = require('drp-mesh').Auth.DRP_AuthResponse;
const basicAuth = require('express-basic-auth');

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

class VDMServer extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} clientDirectory Client directory
     */
    constructor(serviceName, drpNode, clientDirectory) {
        super(serviceName, drpNode, "VDM", `${drpNode.NodeID}-${serviceName}`, true, 10, 10, drpNode.Zone, "local", null, null, 1);

        /** @type {Express_Application} */
        this.expressApp = drpNode.WebServer.expressApp;

        // Serve up static docs
        this.clientStaticDir = clientDirectory;
        this.expressApp.use(express.static(clientDirectory));

        // Define Authorizer
        let asyncAuthorizer = async function (username, password, cb) {
            let authSucceeded = false;
            let newToken = await drpNode.GetConsumerToken(username, password);
            if (newToken) authSucceeded = true;
            return cb(null, authSucceeded);
        };

        // Get default
        this.expressApp.get('/', basicAuth({
            challenge: true,
            authorizer: asyncAuthorizer,
            authorizeAsync: true,
            unauthorizedResponse: (req) => {
                return req.auth
                    ? 'Credentials rejected'
                    : 'No credentials provided';
            }
        }), (req, res) => {
            // The authorizer only returns success/fail, so we need to do a dirty workaround - look for last token issued for this user
            let userToken = thisVDMServer.drpNode.GetLastTokenForUser(req.auth.user);

            // Pass the x-api-token in a cookie for the WebSockets connection
            res.cookie('x-api-token', userToken, {
                expires: new Date(Date.now() + 5 * 60000) // cookie will be removed after 5 minutes
            });
            let userAgentString = req.headers['user-agent'];
            if (userAgentString.includes(" Quest")) {
                res.sendFile("oculus.html", { "root": clientDirectory });
            } else {
                res.sendFile("client.html", { "root": clientDirectory });
            }
            //res.redirect('client.html');
            return;
        });

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)

        let thisVDMServer = this;

        this.clientSessions = {};

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
            }

        };

        /*
        thisVDMServer.GenerateID = function () {
            return intformat(idGenerator.next(), 'dec');
        };
        */

        this.expressApp.use(function vdmServerAttachHandler(req, res, next) {
            req.VDMServer = thisVDMServer;
            next();
        });
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
