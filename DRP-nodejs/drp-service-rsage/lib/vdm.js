const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const express = require('express');
const Express_Application = express.application;
const { DRP_CmdError, DRP_ErrorCode } = require('drp-mesh').Packet;
const fs = require('fs').promises;

class VDMAppletProfile {
    constructor(appletName, title, sizeX, sizeY, appletIcon, showInMenu, preloadDeps, appletScript, dependencies) {
        this.appletName = appletName;
        this.title = title;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.appletIcon = appletIcon;
        this.showInMenu = showInMenu;
        this.preloadDeps = preloadDeps;
        this.appletScript = appletScript;
        this.dependencies = dependencies || [];
    }
}

class XRAppletProfile {
    constructor(appletName, title, appletIcon, showInMenu, appletScript, preReqs) {
        this.appletName = appletName;
        this.title = title;
        this.appletIcon = appletIcon;
        this.showInMenu = showInMenu;
        this.appletScript = appletScript;
        this.preReqs = preReqs || [];
    }
}

class VDMServer extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} clientDirectory Client directory
     * @param {string} vdmAppletsDir VDMApplets directory
     * @param {string} xrAppletsDir XRApplets directory
     * @param {number} cookieTimeoutMinutes Timeout for x-api-token cookies
     */
    constructor(serviceName, drpNode, clientDirectory, vdmAppletsDir, xrAppletsDir, cookieTimeoutMinutes, desktopTitle) {
        super(serviceName, drpNode, "VDM", null, true, 10, 10, drpNode.Zone, "zone", null, ["RESTLogs"], 1);

        let thisVDMServer = this;

        /** @type {Express_Application} */
        this.expressApp = thisVDMServer.DRPNode.WebServer.expressApp;

        this.CookieTimeoutMinutes = cookieTimeoutMinutes || 30;

        // Serve up static docs
        this.clientStaticDir = clientDirectory;
        this.vdmAppletsDir = vdmAppletsDir || "vdmapplets";
        this.xrAppletsDir = xrAppletsDir || "xrapplets";
        this.desktopTitle = desktopTitle || "VDM Desktop";
        this.expressApp.use(express.static(clientDirectory));

        // Get default
        this.expressApp.get('/', (req, res) => {
            // Set Stric Transport Security header
            res.setHeader('Strict-Transport-Security', 'max-age=31536000');

            let userAgentString = req.headers['user-agent'];
            if (userAgentString.includes(" Quest") || req.query.forceVR) {
                // Return anonymous token for VR clients
                let userToken = await thisVDMServer.DRPNode.GetConsumerTokenAnon();

                // Pass the x-api-token in a cookie for the WebSockets connection
                res.cookie('x-api-token', userToken, {
                    expires: new Date(Date.now() + thisVDMServer.CookieTimeoutMinutes * 60000) // cookie will be removed after 5 minutes
                });
                res.send(thisVDMServer.GetXRClientHtml());
            } else {
                res.send(thisVDMServer.GetVDMClientHtml());
            }
        });

        // Register Endpoint commands
        // (methods should return output and optionally accept [params, wsConn, token] for streaming)

        this.VDMAppletProfiles = {};
        this.XRAppletProfiles = {};

        this.ClientCmds = {
            "getVDMAppletProfiles": async (...args) => { return await thisVDMServer.GetVDMAppletProfiles(...args); },
            "getXRAppletProfiles": async (...args) => { return await thisVDMServer.GetXRAppletProfiles(...args); },
            "uploadVDMApplet": async (params, wsConn) => {
                // Create new Applet Profile
                let newAppletProfile = thisVDMServer.AddVDMAppletProfile(params.appletName, params.title, params.sizeX, params.sizeY, params.appletIcon, params.showInMenu, params.preloadDeps, params.appletScript, params.dependencies);
                if (!newAppletProfile || !newAppletProfile.appletName) return "ERROR";

                // Save Applet Profile
                let outputJSONPath = `${thisVDMServer.clientStaticDir}/${thisVDMServer.vdmAppletsDir}/vdm-app-${newAppletProfile.appletName}.json`;
                await fs.writeFile(outputJSONPath, JSON.stringify(newAppletProfile));
                if (params.appletContents) {
                    // Save Applet Script
                    let outputScriptPath = `${thisVDMServer.clientStaticDir}/${thisVDMServer.vdmAppletsDir}/${params.appletScript}`;
                    let outputFileData = params.appletContents;
                    await fs.writeFile(outputScriptPath, outputFileData);
                    return null;
                } else {
                    return null;
                }
            },
            "removeVDMApplet": async (params, wsConn) => {
                return thisVDMServer.RemoveVDMApplet(params.appletName);
            },
            "loadApplets": async () => {
                return await thisVDMServer.LoadApplets();
            }

        };

        this.expressApp.use(function vdmServerAttachHandler(req, res, next) {
            req.VDMServer = thisVDMServer;
            next();
        });

        this.LoadApplets();
    }

    async LoadApplets() {
        let thisVDMServer = this;
        let appletsLoaded = 0;
        // List VDM applet profiles
        let vdmDirData = await fs.readdir(thisVDMServer.clientStaticDir + '/' + thisVDMServer.vdmAppletsDir);
        for (let i = 0; i < vdmDirData.length; i++) {
            let fileName = vdmDirData[i];

            if (fileName.match(/^vdm-app-.*\.js$/)) {

                // Read applets from local file store (TODO - add option to get from DocMgr)
                let fileData = await fs.readFile(thisVDMServer.clientStaticDir + '/' + thisVDMServer.vdmAppletsDir + '/' + fileName, 'utf8');
                try {

                    // See if this is a module package
                    let appletPackagePattern = /^(class AppletClass extends (?:VDMApplet|DRPApplet) {(?:.|\r?\n)*})\r?\n\r?\nlet AppletProfile = ({(?:\s+.*\r?\n)+})\r?\n\r?\n?export { AppletProfile, AppletClass };?\r?\n\/\/# sourceURL=vdm-app-\w+\.js$/gm;
                    let appletPackageParts = appletPackagePattern.exec(fileData);

                    if (!appletPackageParts) {
                        throw new Error("Could not load applet");
                    }

                    // Parse consolidated module format
                    let moduleCode = appletPackageParts[1];
                    let appletProfile = JSON.parse(appletPackageParts[2]);
                    thisVDMServer.AddVDMAppletProfile(appletProfile.appletName, appletProfile.title, appletProfile.sizeX, appletProfile.sizeY, appletProfile.appletIcon, appletProfile.showInMenu, appletProfile.preloadDeps, fileName, appletProfile.dependencies);
                    appletsLoaded++;
                    thisVDMServer.DRPNode.log(`Applet ${fileName} - Imported`);
                } catch (ex) {
                    // Could not parse file
                    thisVDMServer.DRPNode.log(`Applet ${fileName} - Could not import`);
                }
            }
        }

        // List XR applet profiles
        let xrDirData = await fs.readdir(thisVDMServer.clientStaticDir + '/' + thisVDMServer.xrAppletsDir);
        for (let i = 0; i < xrDirData.length; i++) {
            let fileName = xrDirData[i];

            if (fileName.match(/^xr-app-.*\.json$/)) {
                // Load each profile
                let fileData = await fs.readFile(thisVDMServer.clientStaticDir + '/' + thisVDMServer.xrAppletsDir + '/' + fileName, 'utf8');
                /** @type {VDMAppletProfile} */
                let appletProfile = JSON.parse(fileData);
                //console.dir(appletProfile);
                thisVDMServer.AddXRAppletProfile(appletProfile.appletName, appletProfile.title, appletProfile.appletIcon, appletProfile.showInMenu, appletProfile.appletScript, appletProfile.preReqs);
                appletsLoaded++;
            }
        }

        return `Loaded [${appletsLoaded}] applets`;
    }

    /**
     * 
     * @param {string} appletName Applet name
     * @param {string} title Window title
     * @param {integer} sizeX Window width
     * @param {integer} sizeY Window height
     * @param {string} appletIcon Applet icon
     * @param {boolean} showInMenu Should it show in menu
     * @param {boolean} preloadDeps Should the dependencies be pre-loaded
     * @param {string} appletScript Script to execute
     * @param {Object.<string,string>[]} dependencies Dependencies
     * @returns {VDMAppletProfile} New applet profile
     */
    AddVDMAppletProfile(appletName, title, sizeX, sizeY, appletIcon, showInMenu, preloadDeps, appletScript, dependencies) {
        if (appletName && title && sizeX && sizeY && appletScript) {
            let newAppletProfile = new VDMAppletProfile(appletName, title, sizeX, sizeY, appletIcon, showInMenu, preloadDeps, appletScript, dependencies);
            this.VDMAppletProfiles[newAppletProfile.appletName] = newAppletProfile;
            return newAppletProfile;
        }
    }

    /**
     * 
     * @param {string} appletName Applet name
     * @param {string} title Window title
     * @param {any} appletIcon Applet icon
     * @param {any} showInMenu Should it show in menu
     * @param {any} appletScript Script to execute
     * @param {Object.<string,string>[]} preReqs Pre-requisites
     * @returns {XRAppletProfile} New applet profile
     */
    AddXRAppletProfile(appletName, title, appletIcon, showInMenu, appletScript, preReqs) {
        if (appletName && title && appletScript) {
            let newAppletProfile = new XRAppletProfile(appletName, title, appletIcon, showInMenu, appletScript, preReqs);
            this.XRAppletProfiles[newAppletProfile.appletName] = newAppletProfile;
            return newAppletProfile;
        }
    }

    RemoveVDMApplet(appletName) {
        delete this.VDMAppletProfiles[appletName];
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

    <!-- VDM -->
    <link rel="stylesheet" href="assets/drp/css/vdm.css">

</head>
<body>

    <!-- External Scripts -->
    <script src="assets/jquery/jquery.min.js"></script>
    <script src="assets/jquery-ui/jquery-ui.min.js"></script>

    <!-- VDM -->
    <script src="assets/drp/js/drpClient.js"></script>
    <script src="assets/drp/js/vdmCore.js"></script>
    <script src="assets/drp/js/vdmSession.js"></script>

    <!-- VDM Client script -->
    <script>
window.onload = function () {

    // Set applets path
    let vdmAppletsPath = "${thisVDMServer.vdmAppletsDir}";

    let vdmSession = new VDMSession(null, "${thisVDMServer.desktopTitle}", "red", vdmAppletsPath);

    vdmSession.startSession();
};
    </script>

</body>
</html>`;
        return returnHtml;
    }

    GetXRClientHtml() {
        let thisVDMServer = this;
        let returnHtml = `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />

    <title>DRP XR Interface</title>

    <script src="https://cdn.babylonjs.com/babylon.js"></script>
    <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>

    <script src="assets/drp/js/drpClient.js"></script>
    <script src="assets/drp/js/xrSession.js"></script>

    <!-- XR Client script -->
    <script>
window.onload = function () {

    // Set applets path
    let xrAppletsPath = "${thisVDMServer.xrAppletsDir}";

    let xrSession = new XRSession(xrAppletsPath);

    xrSession.startSession();
};
    </script>

    <style>
        html, body {
            overflow: hidden;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
        }
    </style>
</head>
<body>
</body>
</html>`;
        return returnHtml;
    }

    GetVDMAppletProfiles() {
        return this.VDMAppletProfiles;
    }

    GetXRAppletProfiles() {
        return this.XRAppletProfiles;
    }
}

module.exports = VDMServer;
