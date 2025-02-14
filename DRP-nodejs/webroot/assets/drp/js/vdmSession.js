class VDMSession extends VDMDesktop {
    /**
     * VDMSession is a VDMDesktop and owns VDMServerAgent objects
     */
    constructor(vdmDiv, vdmTitle, statusColor, appletPath) {

        super(vdmDiv, vdmTitle, statusColor, appletPath);

        let thisVDMSession = this;

        /** @type VDMServerAgent */
        this.drpClient = null;
    }

    startSession(wsTarget) {
        let thisVDMSession = this;
        thisVDMSession.drpClient = new VDMServerAgent(thisVDMSession);
        thisVDMSession.drpClient.connect(wsTarget);
    }
}

class DRPApplet extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);

        let thisApplet = this;

        // Handler for asynchronous commands received from the VDM Server
        this.recvCmd = {};

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
            thisApplet.vdmDesktop.drpClient.DeleteReplyHandler(thisStreamToken);
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
        returnData = await thisApplet.vdmDesktop.drpClient.SendCmd(serviceName, cmdName, cmdData, awaitResponse, null);
        return returnData;
    }

    async sendCmd_StreamHandler(serviceName, cmdName, cmdData, callback) {
        let thisApplet = this;
        let returnData = await thisApplet.vdmDesktop.drpClient.SendCmd_StreamHandler(serviceName, cmdName, cmdData, callback, thisApplet);
        return returnData;
    }
}

class VDMServerAgent extends DRP_Client_Browser {
    /**
     * Agent which connects to DRP_Node (Broker)
     * @param {VDMSession} vdmSession VDM Session object
     */
    constructor(vdmSession) {
        super();

        this.vdmSession = vdmSession;

        // This is a test function for RickRolling users remotely via DRP
        this.RickRoll = function () {
            vdmSession.OpenApplet(vdmSession.appletModules["RickRoll"], null);
        };
    }

    ShowLogin() {
        let thisDRPClient = this;
        thisDRPClient.vdmSession.loginPopoverDiv.style.display = 'block';
        thisDRPClient.vdmSession.loginButton.onclick = (e) => {
            thisDRPClient.SendLoginRequest();
        }

        thisDRPClient.vdmSession.loginUserInput.onkeyup = (e) => {
            if (e.keyCode === 13) {
                thisDRPClient.SendLoginRequest();
            }
        }

        thisDRPClient.vdmSession.loginPassInput.onkeyup = (e) => {
            if (e.keyCode === 13) {
                thisDRPClient.SendLoginRequest();
            }
        }

        thisDRPClient.vdmSession.loginUserInput.focus()
    }

    HideLogin() {
        this.vdmSession.loginPopoverDiv.style.display = 'none';
    }

    async SendLoginRequest() {
        let thisDRPClient = this;

        if (thisDRPClient.vdmSession.loginUserInput.value.length === 0) {
            thisDRPClient.vdmSession.loginResponseDiv.innerHTML = `Must provide username`
            thisDRPClient.vdmSession.loginUserInput.focus()
            return
        }

        if (thisDRPClient.vdmSession.loginPassInput.value.length === 0) {
            thisDRPClient.vdmSession.loginResponseDiv.innerHTML = `Must provide password`
            thisDRPClient.vdmSession.loginPassInput.focus()
            return
        }

        let response = await thisDRPClient.SendCmd("DRP", "hello", {
            "user": thisDRPClient.vdmSession.loginUserInput.value,
            "pass": thisDRPClient.vdmSession.loginPassInput.value,
            "platform": thisDRPClient.platform,
            "userAgent": thisDRPClient.userAgent,
            "URL": thisDRPClient.URL
        }, true, null);

        if (!response) {
            // Login failed, show error
            thisDRPClient.vdmSession.loginResponseDiv.innerHTML = `Login failed`
            return
        }

        // Login succeeded, proceed
        thisDRPClient.HideLogin();

        thisDRPClient.PopulateDesktop();
    }

    async PopulateDesktop() {
        let thisDRPClient = this;

        thisDRPClient.vdmSession.SetStatusLight('green');

        // If we don't have any appletProfiles, request them
        if (Object.keys(thisDRPClient.vdmSession.appletModules).length) return;
        let appletProfiles = {};
        let getAppletProfilesResponse = await thisDRPClient.SendCmd("VDM", "getVDMAppletProfiles", null, true, null);
        if (getAppletProfilesResponse) appletProfiles = getAppletProfilesResponse;
        let appletProfileNames = Object.keys(appletProfiles);
        for (let appletProfileName of appletProfileNames) {
            let thisAppletProfile = appletProfiles[appletProfileName];
            // Add the vdmSession to the appletProfile
            thisAppletProfile.vdmSession = thisDRPClient.vdmSession;

            // Updated for new Applet Module format
            let appletModuleCode = await thisDRPClient.vdmSession.FetchURLResource(thisDRPClient.vdmSession.appletPath + '/vdm-app-' + thisAppletProfile.appletName + '.js');
            let appletModule = new VDMAppletModule();
            await appletModule.LoadFromString(appletModuleCode);

            if (!appletModule.AppletProfile) {
                continue;
            }

            await thisDRPClient.vdmSession.AddAppletModule(appletModule);
        }

        thisDRPClient.vdmSession.PreloadAppletDependencies();
    }

    async OpenHandler(wsConn, req) {
        let thisDRPClient = this;
        //console.log("VDM Client to server [" + thisDRPClient.wsTarget + "] opened");

        this.wsConn = wsConn;

        thisDRPClient.vdmSession.SetStatusLight('yellow');

        thisDRPClient.ShowLogin();
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

            thisDRPClient.vdmSession.SetStatusLight('red');
            window.location.reload();
        }
    }
}