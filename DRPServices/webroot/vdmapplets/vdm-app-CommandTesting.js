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
Service: <select class="drpService"></select><br>
Method: <select class="drpServiceMethod"></select><br>
Params: <input class="cmdParams" type="text"/><br>
<button class="cmdSend">Send</button>
`;

        let drpServiceSelect = $(myApp.appVars.topPane).find('.drpService')[0];
        let drpMethodSelect = $(myApp.appVars.topPane).find('.drpServiceMethod')[0];
        let cmdParamsInput = $(myApp.appVars.topPane).find('.cmdParams')[0];
        let cmdSend = $(myApp.appVars.topPane).find('.cmdSend')[0];

        // Add DRP as default
        var newOption = document.createElement("option");
        newOption.value = "DRP";
        newOption.text = "DRP";
        drpServiceSelect.appendChild(newOption);

        let svcDictionary = {};

        let svcListResponse = await myApp.sendCmd("DRP", "pathCmd", { "method": "cliGetPath", "pathList": ["Services"], "params": {}, "listOnly": false }, true);
        if (svcListResponse.pathItem) {
            svcDictionary = svcListResponse.pathItem;
            let serviceNameList = Object.keys(svcDictionary);
            for (let i = 0; i < serviceNameList.length; i++) {
                let svcName = serviceNameList[i];
                let newOption = document.createElement("option");
                newOption.value = svcName;
                newOption.text = svcName;
                drpServiceSelect.appendChild(newOption);
            }
            console.log(JSON.stringify(svcDictionary));
        }

        let drpCmdList = await myApp.sendCmd("DRP", "getCmds", null, true);
        svcDictionary["DRP"] = {
            "ClientCmds": drpCmdList
        };

        let cmdList = svcDictionary["DRP"]["ClientCmds"];
        for (let i = 0; i < cmdList.length; i++) {
            let newOption = document.createElement("option");
            newOption.value = cmdList[i];
            newOption.text = cmdList[i];
            drpMethodSelect.appendChild(newOption);
        }

        $(drpServiceSelect).on('change', function () {
            drpMethodSelect.innerHTML = "";
            let svcName = drpServiceSelect.value;
            let cmdList = svcDictionary[svcName]["ClientCmds"];
            for (let i = 0; i < cmdList.length; i++) {
                let cmdName = cmdList[i];
                let newOption = document.createElement("option");
                newOption.value = cmdName;
                newOption.text = cmdName;
                drpMethodSelect.appendChild(newOption);
            }
        })
        
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

            let drpCmd = drpMethodSelect.value;

            //let response = await myApp.SendCmd(tgtApp.value, appCmd.value, appDataObj, true);
            //let displayText = JSON.stringify(response, null, 2);
            //myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";

            let response = await myApp.sendCmd_StreamHandler(drpServiceSelect.value, drpCmd, appDataObj, function (response) {
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
