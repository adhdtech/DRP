/**
 * SPA Applet Profile
 * @param {string} appletName Applet Name
 * @param {string} appletIcon Applet Icon
 */
class SPAAppletProfile {
    constructor() {
        this.appletName = "";
        this.appletIcon = "";
        this.appletPath = "";
        this.appletScript = "";
        this.appletClass = null;
        this.showInMenu = true;
        this.startupScript = "";
        this.title = "";
    }
}

class VDMApplet {
    constructor(appletProfile, vdmSession) {
        // Attributes from profile
        this.appletName = appletProfile.appletName;
        this.appletPath = appletProfile.appletPath;
        this.vdmSession = vdmSession;
    }
    terminate() {
    }
}

class SPASession {
    /**
     * SPASession owns the SPAServerAgent object
     */
    constructor(appletPath) {
        let thisSPASession = this;

        this.activeApplet = null;

        // App Profiles
        this.appletProfiles = {};

        /** @type {Object.<string,VDMApplet>} */
        this.appletInstances = {};

        // Applet base path
        this.appletPath = appletPath || "vdmapplets";

        // App Resources
        this.loadedResources = [];
        this.sharedJSON = {};

        // Misc
        this.appletCreateIndex = 0;

        this.appletPath = appletPath;

        /** @type SPAServerAgent */
        this.drpClient = null;

        let body = document.body;

        body.innerHTML = '';

        this.appletDiv = document.createElement("div");
        this.appletDiv.style = `
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 100%;
            z-index: 2;
        `;
        body.appendChild(this.appletDiv);
        /*
        this.renderCanvas = document.createElement("canvas");
        this.renderCanvas.style = `
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 100%;
            touch-action: none;
            z-index: 1;
        `;
        body.appendChild(this.renderCanvas);

        this.babylonEngine = new BABYLON.Engine(this.renderCanvas, true);

        let css = `
            body > div > div {
                padding-top: 20px;
                padding-bottom: 20px;
                text-align: center;
            }
            body > div > div > span {
                background: rgb(170, 170, 170);
                font-size: xx-large;
                padding: 10px;
            }
            body > div > div > span:hover { background-color: #00ff00 }
        `;
        let style = document.createElement('style');

        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(document.createTextNode(css));
        }

        document.getElementsByTagName('head')[0].appendChild(style);
        */
    }

    showMenu() {

    }

    startSession(wsTarget, appletName, appletService) {
        let thisSPASession = this;
        thisSPASession.drpClient = new SPAServerAgent(thisSPASession, appletName, appletService);
        thisSPASession.drpClient.connect(wsTarget);
    }

    // Add Client app profile
    /**
     * @param {SPAAppletProfile} appletProfile Profile describing new Window
     */
    addAppletProfile(appletProfile) {
        let thisVDMDesktop = this;

        // Check to see if we have a name and the necessary attributes
        if (!appletProfile) {
            console.log("Cannot add app - No app definition");
        } else if (!appletProfile.appletName) {
            console.log("Cannot add app - App definition does not contain 'name' parameter");
        } else if (!appletProfile.appletScript) {
            console.log("Cannot add app '" + appletProfile.appletName + "' - App definition does not contain 'appletScript' parameter");
        } else {
            thisVDMDesktop.appletProfiles[appletProfile.appletName] = appletProfile;
        }
    }

    async loadAppletProfiles(appletName) {
        let thisSPASession = this;
        await thisSPASession.loadAppletScripts();

        let profileKeys = Object.keys(thisSPASession.appletProfiles);
        for (let i = 0; i < profileKeys.length; i++) {
            let appKeyName = profileKeys[i];
            if (appletName && appletName != appKeyName) continue;
            let appletProfile = thisSPASession.appletProfiles[appKeyName];

            if (typeof appletProfile.preReqs !== "undefined" && appletProfile.preReqs.length > 0) {
                await thisSPASession.loadAppletResources(appletProfile);
            }
        }
        /*
        let appletProfileNames = Object.keys(thisSPASession.appletProfiles);
        for (let i = 0; i < appletProfileNames.length; i++) {
            let thisAppletProfile = thisSPASession.appletProfiles[appletProfileNames[i]];
            if (thisAppletProfile.showInMenu) {
                let appletNameDiv = document.createElement("div");
                let appletNameSpan = document.createElement("span");
                appletNameDiv.appendChild(appletNameSpan);
                appletNameSpan.innerHTML = thisAppletProfile.appletName;
                appletNameSpan.onclick = function () { thisSPASession.runApplet(thisAppletProfile.appletName); };
                thisSPASession.menuDiv.appendChild(appletNameDiv);
            }
        }
        */
    }

    async loadAppletScripts() {
        let thisSPASession = this;
        let appletProfileList = Object.keys(thisSPASession.appletProfiles);
        for (let i = 0; i < appletProfileList.length; i++) {
            var tmpAppletName = appletProfileList[i];
            var appletDefinition = thisSPASession.appletProfiles[tmpAppletName];
            var tmpScriptPath = appletDefinition.appletScript;
            if (!appletDefinition.appletPath) appletDefinition.appletPath = thisSPASession.appletPath;
            if (!appletDefinition.appletScript.match(/https?:\/\//)) {
                tmpScriptPath = thisSPASession.appletPath + '/' + appletDefinition.appletScript;
                let thisAppletScript = await thisSPASession.fetchURLResource(tmpScriptPath);
                appletDefinition.appletClass = thisSPASession.evalWithinContext(appletDefinition, thisAppletScript);
            }
        }
    }

    resetSession() {
        // If there is an active applet, destroy it
        if (this.activeApplet) {
            this.activeApplet.terminate();
        }

        this.menuDiv.style.zIndex = 2;
        this.renderCanvas.style.zIndex = 1;
    }

    runApplet(appletName) {
        let thisSPASession = this;
        //thisSPASession.menuDiv.style.zIndex = 1;
        //thisSPASession.renderCanvas.style.zIndex = 2;
        let appletDefinition = thisSPASession.appletProfiles[appletName];
        // Create new instance of applet
        let newApp = new appletDefinition.appletClass(appletDefinition, thisSPASession);
        newApp.windowParts = {
            data: thisSPASession.appletDiv
        }
        thisSPASession.activeApplet = newApp;
        if (newApp.runStartup) {
            newApp.runStartup();
        }
    }

    evalWithinContext(context, code) {
        let outerResults = function (code) {
            let innerResults = eval(code);
            return innerResults;
        }.apply(context, [code]);
        return outerResults;
    }

    async loadAppletResources(appletProfile) {
        let thisVDMDesktop = this;

        for (let i = 0; i < appletProfile.preReqs.length; i++) {
            let preReqHash = appletProfile.preReqs[i];
            let preReqKeys = Object.keys(preReqHash);
            for (let j = 0; j < preReqKeys.length; j++) {
                let preReqType = preReqKeys[j];
                let preReqLocation = preReqHash[preReqType];

                switch (preReqType) {
                    case 'CSS':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqLocation) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqLocation);

                            // Append it to HEAD
                            let resourceText = await thisVDMDesktop.fetchURLResource(preReqLocation);
                            $("head").append($("<style>" + resourceText + "</style>"));

                        }
                        break;
                    case 'JS':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqLocation) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqLocation);

                            // Run it globally now
                            let resourceText = await thisVDMDesktop.fetchURLResource(preReqLocation);
                            jQuery.globalEval(resourceText);
                        }
                        break;
                    case 'JS-Runtime':

                        // Cache for execution at runtime (executes before runStartup)
                        let resourceText = await thisVDMDesktop.fetchURLResource(preReqLocation);
                        appletProfile.startupScript = resourceText;

                        break;
                    case 'JS-Head':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqLocation) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqLocation);

                            // Run it globally now
                            let script = document.createElement('script');
                            script.src = preReqLocation;
                            script.defer = true;

                            document.head.appendChild(script);
                        }
                        break;
                    case 'JSON':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqLocation) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqLocation);

                            // Cache for use at runtime
                            let resourceText = await thisVDMDesktop.fetchURLResource(preReqLocation);
                            thisVDMDesktop.sharedJSON[preReqLocation] = resourceText;

                        }
                        break;
                    default:
                        alert("Unknown prerequisite type: '" + preReqType + "'");
                        return false;
                }
            }
        }
    }

    fetchURLResource(url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send();
        });
    }
}

class SPAServerAgent extends DRP_Client_Browser {
    /**
     * Agent which connects to DRP_Node (Broker)
     * @param {SPASession} spaSession SPA Session object
     * @param {string} appletName Applet name to load
     * @param {string} appletService Primary service for applet
     */
    constructor(spaSession, appletName, appletService) {
        super();

        this.spaSession = spaSession;
        this.appletName = appletName;
        this.appletService = appletService;
    }

    async OpenHandler(wsConn, req) {
        let thisDRPClient = this;
        console.log("SPA Client to server [" + thisDRPClient.wsTarget + "] opened");

        this.wsConn = wsConn;

        let response = await thisDRPClient.SendCmd("DRP", "hello", {
            "token": thisDRPClient.userToken,
            "platform": thisDRPClient.platform,
            "userAgent": thisDRPClient.userAgent,
            "URL": thisDRPClient.URL
        }, true, null);

        if (!response) window.location.reload();

        // If we don't have any appletProfiles, request them
        let targetAppletService = thisDRPClient.appletService || "VDM";
        if (Object.keys(thisDRPClient.spaSession.appletProfiles).length) return;
        let appletProfiles = {};
        let getAppletProfilesResponse = await thisDRPClient.SendCmd(targetAppletService, "getVDMAppletProfiles", null, true, null);
        if (getAppletProfilesResponse) appletProfiles = getAppletProfilesResponse;
        let appletProfileNames = Object.keys(appletProfiles);
        for (let i = 0; i < appletProfileNames.length; i++) {
            let thisAppletProfile = appletProfiles[appletProfileNames[i]];
            // Manually add the spaSession to the appletProfile
            thisAppletProfile.vdmSession = thisDRPClient.spaSession;
            thisDRPClient.spaSession.addAppletProfile(thisAppletProfile);
        }

        await thisDRPClient.spaSession.loadAppletProfiles(thisDRPClient.appletName);
        thisDRPClient.spaSession.runApplet(thisDRPClient.appletName);
    }

    async CloseHandler(closeCode) {
        let thisDRPClient = this;
        thisDRPClient.Disconnect();
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
        window.location.reload();
    }

    Disconnect(isGraceful) {
        let thisDRPClient = this;

        if (!isGraceful) {
            console.log("Unexpected connection drop, waiting 10 seconds for reconnect");
            setTimeout(function () {
                //window.location.href = "/";

                // Retry websocket connection
                thisDRPClient.reconnect = true;
                thisDRPClient.wsConn = null;
                thisDRPClient.connect(thisDRPClient.wsTarget);
            }, 10000);

            window.location.reload();
        }
    }
}

class rSageApplet extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);

        let thisApplet = this;

        // Link to rSageClient
        this.vdmSession = appletProfile.vdmSession;

        // Handler for asynchronous commands received from the VDM Server
        this.recvCmd = {};

        // To track stream handlers for when window closes
        this.streamHandlerTokens = [];

    }

    // Send applet close notification to VDM Server after open
    postOpenHandler() {
        let thisApplet = this;
        /*
        thisApplet.sendCmd("VDM", "openUserApp",
            {
                appletName: thisApplet.appletName,
                appletIndex: thisApplet.appletIndex
            },
            false
        );
        */
    }

    // Send applet close notification to VDM Server after closure
    postCloseHandler() {
        let thisApplet = this;
        // Delete stream handlers
        for (let i = 0; i < thisApplet.streamHandlerTokens.length; i++) {
            let thisStreamToken = thisApplet.streamHandlerTokens[i];
            thisApplet.sendCmd("DRP", "unsubscribe", { streamToken: thisStreamToken }, false);
            thisApplet.vdmSession.drpClient.DeleteReplyHandler(thisStreamToken);
        }
        // Delete from 
        delete thisApplet.vdmDesktop.appletInstances[thisApplet.appletIndex];
        /*
        thisApplet.sendCmd("VDM", "closeUserApp",
            {
                appletName: thisApplet.appletName,
                appletIndex: thisApplet.appletIndex
            },
            false
        );
        */
    }

    /**
     * 
     * @param {string} serviceName Service Name
     * @param {string} cmdName Command
     * @param {object} cmdData Data object
     * @param {boolean} awaitResponse Await response flag
     * @return {function} Returns Promise
     */
    async sendCmd(serviceName, cmdName, cmdData, awaitResponse) {
        let thisApplet = this;
        let returnData = null;

        let response = await thisApplet.vdmSession.drpClient.SendCmd(serviceName, cmdName, cmdData, awaitResponse, null);
        if (response) returnData = response;

        return returnData;
    }

    async sendCmd_StreamHandler(serviceName, cmdName, cmdData, callback) {
        let thisApplet = this;
        let returnData = null;

        let response = await thisApplet.vdmSession.drpClient.SendCmd_StreamHandler(serviceName, cmdName, cmdData, callback, thisApplet);
        if (response) returnData = response;
        return returnData;
    }
}