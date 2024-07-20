/**
 * XR Applet Profile
 * @param {string} appletName Applet Name
 * @param {string} appletIcon Applet Icon
 */
class XRAppletProfile {
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

class XRAppletModule {
    /**
     * Create a new VDM Applet module
     */
    constructor() {
        /** @type VDMAppletProfile */
        this.AppletProfile = null;

        /** @type VDMApplet */
        this.AppletClass = null;

        /** @type string */
        this.ModuleCode = null;

        /** @type string */
        this.ClassCode = null;
    }

    async LoadFromString(appletModuleCode) {
        let blob = new Blob([appletModuleCode], { type: 'text/javascript' })
        let url = URL.createObjectURL(blob)
        let module = await import(url);
        URL.revokeObjectURL(url) // GC objectURLs

        // Validate module format
        let appletPackagePattern = /^(class AppletClass extends XRApplet {(?:.|\r?\n)*})\r?\n\r?\nlet AppletProfile = ({(?:\s+.*\r?\n)+})\r?\n\r?\n?export { AppletProfile, AppletClass };?\r?\n\/\/# sourceURL=xr-app-\w+\.js\s*$/gm;
        let appletPackageParts = appletPackagePattern.exec(appletModuleCode);

        if (!appletPackageParts) {
            throw new Error(`Module code does not pass regex check`);
        }

        this.AppletProfile = module.AppletProfile;
        this.AppletClass = module.AppletClass;
        this.ModuleCode = appletModuleCode;
        this.ClassCode = appletPackageParts[1];
    }
}

class XRApplet {
    constructor(appletProfile, xrSession) {
        // Attributes from profile
        this.appletName = appletProfile.appletName;
        this.appletPath = appletProfile.appletPath;
        this.xrSession = xrSession;
    }
    terminate() {
    }
}

class XRSession {
    /**
     * XRSession owns the XRServerAgent object
     */
    constructor(appletPath) {
        let thisXRSession = this;

        this.activeApplet = null;

        this.appletModules = {};

        this.appletPath = appletPath;

        /** @type XRServerAgent */
        this.drpClient = null;

        let body = document.body;

        body.innerHTML = '';

        this.menuDiv = document.createElement("div");
        this.menuDiv.style = `
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 100%;
            z-index: 2;
        `;
        body.appendChild(this.menuDiv);

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
    }

    showMenu() {

    }

    startSession(wsTarget) {
        let thisXRSession = this;
        thisXRSession.drpClient = new XRServerAgent(thisXRSession);
        thisXRSession.drpClient.connect(wsTarget);
    }

    // Add Client app profile
    /**
     * @param {XRAppletProfile} appletProfile Profile describing new Window
     */
    AddAppletModule(appletModule) {
        let thisVDMDesktop = this;

        let appletProfile = appletModule.AppletProfile;

        // Check to see if we have a name and the necessary attributes
        if (!appletProfile) {
            console.log("Cannot add app - No app definition");
        } else if (!appletProfile.appletName) {
            console.log("Cannot add app - App definition does not contain 'name' parameter");
        } else if (!appletModule.AppletClass) {
            console.log("Cannot add app '" + appletProfile.appletName + "' - Applet module does not have .AppletClass");
        } else {
            thisVDMDesktop.appletModules[appletProfile.appletName] = appletModule;
        }
    }

    async PopulateMenu() {
        let thisXRSession = this;
        let appletProfileNames = Object.keys(thisXRSession.appletModules);
        for (let i = 0; i < appletProfileNames.length; i++) {
            let thisAppletModule = thisXRSession.appletModules[appletProfileNames[i]];
            let thisAppletProfile = thisAppletModule.AppletProfile;
            if (thisAppletProfile.showInMenu) {
                let appletNameDiv = document.createElement("div");
                let appletNameSpan = document.createElement("span");
                appletNameDiv.appendChild(appletNameSpan);
                appletNameSpan.innerHTML = thisAppletProfile.appletName;
                appletNameSpan.onclick = function () { thisXRSession.RunApplet(thisAppletProfile.appletName); };
                thisXRSession.menuDiv.appendChild(appletNameDiv);
            }
        }
    }

    ResetSession() {
        // If there is an active applet, destroy it
        if (this.activeApplet) {
            this.activeApplet.terminate();
        }

        this.menuDiv.style.zIndex = 2;
        this.renderCanvas.style.zIndex = 1;
    }

    RunApplet(appletName) {
        let thisXRSession = this;
        thisXRSession.menuDiv.style.zIndex = 1;
        thisXRSession.renderCanvas.style.zIndex = 2;
        let thisAppletModule = thisXRSession.appletModules[appletName];
        // Create new instance of applet
        let newApp = new thisAppletModule.AppletClass(thisAppletModule, thisXRSession);
        thisXRSession.activeApplet = newApp;
        if (newApp.RunStartup) {
            newApp.RunStartup();
        }
    }

    evalWithinContext(context, code) {
        let outerResults = function (code) {
            let innerResults = eval(code);
            return innerResults;
        }.apply(context, [code]);
        return outerResults;
    }

    FetchURLResource(url) {
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

class XRServerAgent extends DRP_Client_Browser {
    /**
     * Agent which connects to DRP_Node (Broker)
     * @param {XRSession} xrSession XR Session object
     * @param {string} userToken User token
     */
    constructor(xrSession) {
        super();

        this.xrSession = xrSession;
    }

    async OpenHandler(wsConn, req) {
        let thisDRPClient = this;
        console.log("XR Client to server [" + thisDRPClient.wsTarget + "] opened");

        this.wsConn = wsConn;

        let response = await thisDRPClient.SendCmd("DRP", "hello", {
            "token": thisDRPClient.userToken,
            "platform": thisDRPClient.platform,
            "userAgent": thisDRPClient.userAgent,
            "URL": thisDRPClient.URL
        }, true, null);

        if (!response) window.location.reload();

        // If we don't have any appletProfiles, request them
        if (Object.keys(thisDRPClient.xrSession.appletModules).length) return;
        let appletProfiles = {};
        let getAppletProfilesResponse = await thisDRPClient.SendCmd("VDM", "getXRAppletProfiles", null, true, null);
        if (getAppletProfilesResponse) appletProfiles = getAppletProfilesResponse;
        let appletProfileNames = Object.keys(appletProfiles);
        for (let i = 0; i < appletProfileNames.length; i++) {
            let thisAppletProfile = appletProfiles[appletProfileNames[i]];
            // Manually add the xrSession to the appletProfile
            thisAppletProfile.xrSession = thisDRPClient.xrSession;

            // Updated for new Applet Module format
            let appletModuleCode = await thisDRPClient.xrSession.FetchURLResource(thisDRPClient.xrSession.appletPath + '/xr-app-' + thisAppletProfile.appletName + '.js');
            let appletModule = new XRAppletModule();
            await appletModule.LoadFromString(appletModuleCode);

            if (!appletModule.AppletProfile) {
                continue;
            }

            await thisDRPClient.xrSession.AddAppletModule(appletModule);
        }

        await thisDRPClient.xrSession.PopulateMenu();
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

            //thisDRPClient.xrSession.vdmDesktop.changeLEDColor('red');
            window.location.reload();
        }
    }
}