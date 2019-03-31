(class extends rSageApplet {
    constructor(appletProfile, vdmClient) {
        super(appletProfile, vdmClient);
        let myApp = this;

        this.menu = {
            "File": {
                "List Classes": async function () {
                    let response = await myApp.sendCmd("HiveAccess", "listClassTypes", null, true);
                    let displayText = JSON.stringify(response, null, 2);
                    //displayText = displayText.replace(/ /g, "&nbsp;");
                    myApp.windowParts.data.innerHTML = displayText;
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
Target:  <select class="tgtApp"></select><br>
AppCmd:  <select class="appCmd"></select><br>
AppData: <input class="appData" type="text"/><br>
<button class="cmdSend">Send</button>
`;

        let tgtApp = $(myApp.appVars.topPane).find('.tgtApp')[0];
        let appCmd = $(myApp.appVars.topPane).find('.appCmd')[0];
        let appData = $(myApp.appVars.topPane).find('.appData')[0];
        let cmdSend = $(myApp.appVars.topPane).find('.cmdSend')[0];

        let cmdHash = await myApp.sendCmd("VDMAccess", "getCommands", null, true);
        /*
        let cmdHash = {
            "HiveAccess": ['getCommands'],
            "CortexAccess": ['getCommands']
        };
        */
        let cmdHashKeys = Object.keys(cmdHash).sort();
        for (let i = 0; i < cmdHashKeys.length; i++) {
            var newOption = document.createElement("option");
            newOption.value = cmdHashKeys[i];
            newOption.text = cmdHashKeys[i];
            tgtApp.appendChild(newOption);
        }

        appCmd.innerHTML = "";
        for (let i = 0; i < cmdHash[tgtApp.value].length; i++) {
            var newOption = document.createElement("option");
            newOption.value = cmdHash[tgtApp.value][i];
            newOption.text = cmdHash[tgtApp.value][i];
            appCmd.appendChild(newOption);
        }

        $(tgtApp).on('change', function () {
            appCmd.innerHTML = "";
            for (let i = 0; i < cmdHash[tgtApp.value].length; i++) {
                var newOption = document.createElement("option");
                newOption.value = cmdHash[tgtApp.value][i];
                newOption.text = cmdHash[tgtApp.value][i];
                appCmd.appendChild(newOption);
            }
        })

        $(cmdSend).on('click', async function () {
            //let response = await myApp.SendCmd(tgtApp.value, appCmd.value, appData.value, true);
            //let displayText = JSON.stringify(response, null, 2);
            //myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";

            let appDataObj = null;
            try {
                appDataObj = JSON.parse(appData.value);
            }
            catch (ex) {
                appDataObj = appData.value;
            }
            //let response = await myApp.SendCmd(tgtApp.value, appCmd.value, appDataObj, true);
            //let displayText = JSON.stringify(response, null, 2);
            //myApp.appVars.bottomPane.innerHTML = "<pre style='font-size: 12px;line-height: 12px;color: #DDD;height: 100%;'>" + displayText + "</pre>";

            let response = await myApp.sendCmd_StreamHandler(tgtApp.value, appCmd.value, appDataObj, function (response) {
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
