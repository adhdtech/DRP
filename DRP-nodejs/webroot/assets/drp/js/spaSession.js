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

class DRPApplet extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);

        let thisApplet = this;

        // Link to rSageClient
        this.vdmSession = appletProfile.vdmSession;

        // To track stream handlers for when window closes
        this.streamHandlerTokens = [];

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

class SPASession {
    /**
     * SPASession owns the SPAServerAgent object
     */
    constructor(appletPath) {
        let thisSPASession = this;

        this.activeApplet = null;

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
    }

    StartSession(wsTarget, appletName, appletService) {
        let thisSPASession = this;
        thisSPASession.drpClient = new SPAServerAgent(thisSPASession, appletName, appletService);
        thisSPASession.drpClient.connect(wsTarget);
    }

    ResetSession() {
        // If there is an active applet, destroy it
        if (this.activeApplet) {
            this.activeApplet.terminate();
        }

        this.menuDiv.style.zIndex = 2;
        this.renderCanvas.style.zIndex = 1;
    }

    RunApplet(appletModule) {
        let thisSPASession = this;

        // Create new instance of applet
        let newApp = new appletModule.AppletClass(appletModule.AppletProfile, thisSPASession);
        newApp.vdmSession = thisSPASession;
        newApp.windowParts = {
            data: thisSPASession.appletDiv
        }
        thisSPASession.activeApplet = newApp;
        if (newApp.RunStartup) {
            newApp.RunStartup();
        }
    }

    EvalWithinContext(context, code) {
        let outerResults = function (code) {
            let innerResults = eval(code);
            return innerResults;
        }.apply(context, [code]);
        return outerResults;
    }

    /**
     * Load applet prerequisites
     * @param {VDMAppletProfile} appletProfile
     */
    async LoadAppletDependencies(appletProfile) {
        let thisVDMDesktop = this;

        if (!appletProfile.dependencies) {
            appletProfile.dependencies = [];
        }

        // Load prerequisites
        for (let i = 0; i < appletProfile.dependencies.length; i++) {
            let dependenciesObj = appletProfile.dependencies[i];
            let preReqKeys = Object.keys(dependenciesObj);
            for (let j = 0; j < preReqKeys.length; j++) {
                let dependencyType = preReqKeys[j];
                let dependencyValue = dependenciesObj[dependencyType];

                switch (dependencyType) {
                    case 'CSS':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Append it to HEAD
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            let styleNode = document.createElement("style");
                            styleNode.innerHTML = resourceText;
                            document.head.appendChild(styleNode);
                        }
                        break;
                    case 'CSS-Link':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            const template = document.createElement('template');
                            template.innerHTML = dependencyValue;
                            document.head.appendChild(template.content.children[0]);
                        }
                        break;
                    case 'JS':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Run it globally now
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            await thisVDMDesktop.EvalWithinContext(window, resourceText);
                        }
                        break;
                    case 'JS-Runtime':

                        // Cache for execution at runtime (executes before runStartup)
                        let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                        appletProfile.startupScript = resourceText;

                        break;
                    case 'JS-Head':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Run it globally now
                            let script = document.createElement('script');
                            script.src = dependencyValue;
                            script.defer = true;

                            document.head.appendChild(script);
                        }
                        break;
                    case 'JSON':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Cache for use at runtime
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            thisVDMDesktop.sharedJSON[dependencyValue] = resourceText;

                        }
                        break;
                    default:
                        alert("Unknown prerequisite type: '" + dependencyType + "'");
                        return false;
                }
            }
        }
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

        // Get the applet module code
        let targetAppletService = thisDRPClient.appletService || "VDM";
        let appletModuleCode = await thisDRPClient.SendCmd(targetAppletService, "getVDMAppletModule", null, true, null);
        let appletModule = new VDMAppletModule();
        await appletModule.LoadFromString(appletModuleCode);
        await thisDRPClient.spaSession.LoadAppletDependencies(appletModule.AppletProfile);
        thisDRPClient.spaSession.RunApplet(appletModule);
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

class VDMAppletModule {
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
        let appletPackagePattern = /^(class AppletClass extends (?:VDMApplet|DRPApplet) {(?:.|\r?\n)*})\r?\n\r?\nlet AppletProfile = ({(?:\s+.*\r?\n)+})\r?\n\r?\n?export { AppletProfile, AppletClass };?\r?\n\/\/# sourceURL=vdm-app-\w+\.js$/gm;
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
