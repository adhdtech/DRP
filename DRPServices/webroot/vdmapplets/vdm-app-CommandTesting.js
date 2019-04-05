(class extends rSageApplet {
    constructor(appletProfile, vdmClient) {
        super(appletProfile, vdmClient);
        let myApp = this;

        this.menu = {
            "File": {
                "Do Nothing": async function () {
                }
            }
        }
    }

    async runStartup() {
        let myApp = this;

        // Split data pane horizontally
        var newPanes = myApp.splitPaneHorizontal(myApp.windowParts["data"], 100, false, false);
        myApp.appVars.topPane = newPanes[0];
        myApp.appVars.hDiv = newPanes[1];
        myApp.appVars.bottomPane = newPanes[2];

        myApp.appVars.bottomPane.style['user-select'] = "text";
        myApp.appVars.bottomPane.style['background'] = "#444";

        // Add form to top
        myApp.appVars.topPane.innerHTML = `
Cmd:   <select class="drpCmd"></select><br>
Service: <select class="drpService"></select><br>
Method: <select class="drpServiceMethod"></select><br>
Params: <input class="cmdParams" type="text"/><br>
<button class="cmdSend">Send</button>
`;

        let drpCmdSelect = $(myApp.appVars.topPane).find('.drpCmd')[0];
        let drpServiceSelect = $(myApp.appVars.topPane).find('.drpService')[0];
        let drpServiceMethodSelect = $(myApp.appVars.topPane).find('.drpServiceMethod')[0];
        let cmdParamsInput = $(myApp.appVars.topPane).find('.cmdParams')[0];
        let cmdSend = $(myApp.appVars.topPane).find('.cmdSend')[0];

        let cmdList = await myApp.sendCmd("DRP", "getCmds", null, true);

        for (let i = 0; i < cmdList.length; i++) {
            var newOption = document.createElement("option");
            newOption.value = cmdList[i];
            newOption.text = cmdList[i];
            drpCmdSelect.appendChild(newOption);
        }
        /*
        drpServiceSelect.innerHTML = "";
        for (let i = 0; i < cmdHash[drpCmdSelect.value].length; i++) {
            var newOption = document.createElement("option");
            newOption.value = cmdHash[drpCmdSelect.value][i];
            newOption.text = cmdHash[drpCmdSelect.value][i];
            drpServiceSelect.appendChild(newOption);
        }

        $(drpCmdSelect).on('change', function () {
            drpServiceSelect.innerHTML = "";
            for (let i = 0; i < cmdHash[drpCmdSelect.value].length; i++) {
                var newOption = document.createElement("option");
                newOption.value = cmdHash[drpCmdSelect.value][i];
                newOption.text = cmdHash[drpCmdSelect.value][i];
                drpServiceSelect.appendChild(newOption);
            }
        })
        */
        $(cmdSend).on('click', async function () {
            //let response = await myApp.SendCmd(tgtApp.value, appCmd.value, appData.value, true);
            //let displayText = JSON.stringify(response, null, 2);
            //myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";

            let appDataObj = null;
            try {
                appDataObj = JSON.parse(cmdParamsInput.value);
            }
            catch (ex) {
                appDataObj = cmdParamsInput.value;
            }

            let drpCmd = drpCmdSelect.value;
            let params = {};

            //let response = await myApp.SendCmd(tgtApp.value, appCmd.value, appDataObj, true);
            //let displayText = JSON.stringify(response, null, 2);
            //myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";

            let response = await myApp.sendCmd_StreamHandler("DRP", drpCmd, params, null, function (response) {
                let appDataObj = null;
                try {
                    appDataObj = JSON.parse(response);
                }
                catch (ex) {
                    appDataObj = response;
                }
                let displayText = JSON.stringify(appDataObj, null, 2);
                myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";
            });

            if (response) {
                let appDataObj = null;
                try {
                    appDataObj = JSON.parse(response);
                }
                catch (ex) {
                    appDataObj = response;
                }
                let displayText = JSON.stringify(appDataObj, null, 2);
                myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";
            }
        });

    }
})
//# sourceURL=vdm-app-CommandTesting.js
