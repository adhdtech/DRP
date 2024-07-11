const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const express = require('express');
const Express_Application = express.application;
const fs = require('fs').promises;

class SPAServer extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {number} priority Service priority
     * @param {number} weight Service weight
     * @param {string} scope Service scope
     * @param {number} cookieTimeoutMinutes Timeout for x-api-token cookies
     * @param {string} clientDirectory Client directory
     * @param {string} vdmAppletsDir VDMApplets directory
     * @param {string} xrAppletsDir XRApplets directory
     * @param {number} cookieTimeoutMinutes Timeout for x-api-token cookies
     * @param {string} title Page title
     * @param {string} appletModuleFile Applet module file for clients to load
     */
    constructor(serviceName, drpNode, priority, weight, scope, clientDirectory, vdmAppletsDir, xrAppletsDir, cookieTimeoutMinutes, title, appletModuleFile) {
        super(serviceName, drpNode, "SPA", null, true, priority, weight, drpNode.Zone, scope, null, ["RESTLogs"], 1);

        let thisVDMServer = this;

        /** @type {Express_Application} */
        this.expressApp = thisVDMServer.DRPNode.WebServer.expressApp;

        this.CookieTimeoutMinutes = cookieTimeoutMinutes || 30;

        // Serve up static docs
        this.clientStaticDir = clientDirectory;
        this.vdmAppletsDir = vdmAppletsDir || "vdmapplets";
        this.xrAppletsDir = xrAppletsDir || "xrapplets";
        this.desktopTitle = title || "SPA";
        this.appletModuleFile = appletModuleFile;
        this.expressApp.use(express.static(clientDirectory));

        // Get default
        this.expressApp.get('/', async (req, res) => {
            // The authorizer only returns success/fail, so we need to do a dirty workaround - look for last token issued for this user
            let userToken = await thisVDMServer.DRPNode.GetConsumerTokenAnon();

            // Pass the x-api-token in a cookie for the WebSockets connection
            res.cookie('x-api-token', userToken, {
                expires: new Date(Date.now() + thisVDMServer.CookieTimeoutMinutes * 60000) // cookie will be removed after 5 minutes
            });
            let userAgentString = req.headers['user-agent'];
            if ((userAgentString && userAgentString.includes(" Quest")) || req.query.forceVR) {
                //res.sendFile("oculus.html", { "root": clientDirectory });
                res.send(thisVDMServer.GetXRClientHtml());
            } else {
                //res.sendFile("client.html", { "root": clientDirectory });
                res.send(thisVDMServer.GetVDMClientHtml());
            }
            //res.redirect('client.html');
            return;
        });

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)

        this.clientSessions = {};

        this.ClientCmds = {
            "getVDMAppletModule": async (...args) => { return await thisVDMServer.GetVDMAppletModule(...args); },
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
            }
        };

        this.expressApp.use(function vdmServerAttachHandler(req, res, next) {
            req.VDMServer = thisVDMServer;
            next();
        });
    }

    GetVDMClientHtml() {
        let thisVDMServer = this;
        let returnHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${thisVDMServer.desktopTitle}</title>
    <meta name="msapplication-TileColor" content="#5bc0de" />

    <!-- External CSS -->
    <link rel="stylesheet" href="assets/fontawesome/font-awesome.min.css">

</head>
<body>

    <!-- External Scripts -->
    <script src="assets/jquery/jquery.min.js"></script>
    <script src="assets/jquery-ui/jquery-ui.min.js"></script>

    <!-- SPA -->
    <script src="assets/drp/js/drpClient.js"></script>
    <script src="assets/drp/js/spaSession.js"></script>

    <!-- SPA Client script -->
    <script>
window.onload = function () {

    // Set applets path
    let vdmAppletsPath = "${thisVDMServer.vdmAppletsDir}";

    let spaSession = new SPASession(vdmAppletsPath);

    spaSession.StartSession(null, '${thisVDMServer.appletName}', '${thisVDMServer.serviceName}');
};
    </script>

</body>
</html>`;
        return returnHtml;
    }

    async GetVDMAppletModule() {
        let thisVDMServer = this;
        // Get applet module code
        let appletModuleFilePath = thisVDMServer.clientStaticDir + '/' + thisVDMServer.vdmAppletsDir + '/' + thisVDMServer.appletModuleFile;
        let fileData = await fs.readFile(appletModuleFilePath, 'utf8');
        return fileData;
    }

    LogWSClientEvent(conn, logMsg) {
        let thisVDMServer = this;
        thisVDMServer.DRPNode.log(logMsg);
    }
}

module.exports = SPAServer;