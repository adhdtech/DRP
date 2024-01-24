class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        this.menu = {
            "Tools": {
                "Refresh": async function () {
                    thisApplet.RefreshServices();
                }
            }
        };
    }

    async RunStartup() {
        let thisApplet = this;

        // Split data pane vertically
        let newPanes = thisApplet.SplitPaneVertical(thisApplet.dataPane, 100, false, false);
        thisApplet.topPane = newPanes[0];
        thisApplet.hDiv = newPanes[1];
        thisApplet.bottomPane = newPanes[2];

        thisApplet.bottomPane.style['user-select'] = "text";
        thisApplet.bottomPane.style['background'] = "#444";

        let preElement = document.createElement("pre");
        preElement.style = `font-size: 12px;line-height: 12px;height: 100%;`;
        thisApplet.bottomPane.appendChild(preElement);
        thisApplet.outputBox = preElement;

        // Add form to top
        thisApplet.topPane.innerHTML = `
Service: <select class="drpService"></select><br>
Method: <select class="drpServiceMethod"></select><br>
Params: <input class="cmdParams" type="text"/><br>
<button class="cmdSend">Send</button>
`;

        // Assign part elements
        thisApplet.drpServiceSelect = $(thisApplet.topPane).find('.drpService')[0];
        thisApplet.drpMethodSelect = $(thisApplet.topPane).find('.drpServiceMethod')[0];
        thisApplet.cmdParamsInput = $(thisApplet.topPane).find('.cmdParams')[0];
        thisApplet.cmdSend = $(thisApplet.topPane).find('.cmdSend')[0];

        thisApplet.cmdParamsInput.onkeydown = ((keyEvent) => {
            if (keyEvent.which == 13) {
                thisApplet.SubmitDRPCmd();
                keyEvent.preventDefault();
            }
        });

        // Action when selected service changes
        $(thisApplet.drpServiceSelect).on('change', function () {

            // Populate method list
            thisApplet.drpMethodSelect.innerHTML = "";
            let svcName = thisApplet.drpServiceSelect.value;
            let cmdList = thisApplet.svcDictionary[svcName]["ClientCmds"];
            for (let i = 0; i < cmdList.length; i++) {
                let cmdName = cmdList[i];
                let newOption = document.createElement("option");
                newOption.value = cmdName;
                newOption.text = cmdName;
                thisApplet.drpMethodSelect.appendChild(newOption);
            }
        });

        $(thisApplet.cmdSend).on('click', () => {
            thisApplet.SubmitDRPCmd();
        });

        thisApplet.RefreshServices();

    }

    async RefreshServices() {
        let thisApplet = this;

        // Clear items
        thisApplet.drpServiceSelect.innerHTML = "";
        thisApplet.drpMethodSelect.innerHTML = "";
        thisApplet.cmdParamsInput.innerHTML = "";

        // Add DRP as default
        /*
        var newOption = document.createElement("option");
        newOption.value = "DRP";
        newOption.text = "DRP";
        thisApplet.drpServiceSelect.appendChild(newOption);
        */
        thisApplet.svcDictionary = {};

        let svcListResponse = await thisApplet.sendCmd("DRP", "getServiceDefinitions", null, true);
        if (svcListResponse) {
            thisApplet.svcDictionary = svcListResponse;

            // Populate Service list
            let serviceNameList = Object.keys(thisApplet.svcDictionary);
            for (let i = 0; i < serviceNameList.length; i++) {
                let svcName = serviceNameList[i];
                let newOption = document.createElement("option");
                newOption.value = svcName;
                newOption.text = svcName;
                thisApplet.drpServiceSelect.appendChild(newOption);
            }
            //console.log(JSON.stringify(thisApplet.svcDictionary));
        }

        // Get DRP methods (not included in primary list of Services)
        /*
        let drpCmdList = await thisApplet.sendCmd("DRP", "getCmds", null, true);
        thisApplet.svcDictionary["DRP"] = {
            "ClientCmds": drpCmdList
        };
        */

        // Set initial Method list to DRP
        let cmdList = thisApplet.svcDictionary["DRP"]["ClientCmds"];
        for (let i = 0; i < cmdList.length; i++) {
            let newOption = document.createElement("option");
            newOption.value = cmdList[i];
            newOption.text = cmdList[i];
            thisApplet.drpMethodSelect.appendChild(newOption);
        }

    }

    DisplayResponse(displayData, isErr) {
        let thisApplet = this;
        let displayText = "";
        let textColor = "#DDD";
        if (isErr) {
            textColor = "#F66";
        }
        if (typeof displayData === "object") {
            displayText = JSON.stringify(displayData, null, 2);
        } else {
            try {
                let appDataObj = JSON.parse(displayData);
                displayText = JSON.stringify(appDataObj, null, 2);
            } catch (ex) {
                displayText = displayData;
            }
        }
        thisApplet.outputBox.style.color = textColor;
        thisApplet.outputBox.innerText = displayText;
    }

    async SubmitDRPCmd() {
        let thisApplet = this;

        // Clear output window
        thisApplet.DisplayResponse("");

        // Get service name
        let drpService = thisApplet.drpServiceSelect.value;

        // Get method name
        let drpMethod = thisApplet.drpMethodSelect.value;

        // Try to parse command data to JSON object
        let paramsString = thisApplet.cmdParamsInput.value;
        let params = {};
        try {
            let parsedValue = JSON.parse(paramsString);
            let constructorType = parsedValue.constructor.name;
            if (constructorType !== "Object") {
                throw { message: `Expected an object, received a ${constructorType}` };
            }
            params = parsedValue;
        }
        catch (ex) {
            if (paramsString.length > 0) {
                params.pathList = paramsString.split(",");
            }
        }


        // Send DRP command
        try {
            //let cmdResponse = await thisApplet.sendCmd(drpService, drpMethod, params, true);
            //thisApplet.DisplayResponse(cmdResponse);

            let response = await thisApplet.sendCmd_StreamHandler(drpService, drpMethod, params, (streamData) => {
                // Stream handler - persistent
                thisApplet.DisplayResponse(streamData);
            });

            if (response) {
                // Response to immediate command
                thisApplet.DisplayResponse(response);
            }

        } catch (ex) {
            // Caught an error, display it
            thisApplet.DisplayResponse(ex, true);
        }
    }
}

let AppletProfile = {
    "appletName": "CommandTesting",
    "title": "Command Testing",
    "sizeX": 850,
    "sizeY": 400,
    "appletIcon": "fa-book",
    "showInMenu": true,
    "preloadDeps": false,
    "dependencies": []
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-CommandTesting.js