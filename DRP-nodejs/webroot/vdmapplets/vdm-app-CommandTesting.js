(class extends rSageApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let myApp = this;

        this.menu = {
            "Tools": {
                "Refresh": async function () {
                    myApp.appFuncs.refreshServices();
                }
            }
        };

        this.appFuncs = {
            "refreshServices": async function () {

                // Clear items
                myApp.appVars.drpServiceSelect.innerHTML = "";
                myApp.appVars.drpMethodSelect.innerHTML = "";
                myApp.appVars.cmdParamsInput.innerHTML = "";

                // Add DRP as default
                /*
                var newOption = document.createElement("option");
                newOption.value = "DRP";
                newOption.text = "DRP";
                myApp.appVars.drpServiceSelect.appendChild(newOption);
                */
                myApp.appVars.svcDictionary = {};

                let svcListResponse = await myApp.sendCmd("DRP", "getServiceDefinitions", null, true);
                if (svcListResponse) {
                    myApp.appVars.svcDictionary = svcListResponse;

                    // Populate Service list
                    let serviceNameList = Object.keys(myApp.appVars.svcDictionary);
                    for (let i = 0; i < serviceNameList.length; i++) {
                        let svcName = serviceNameList[i];
                        let newOption = document.createElement("option");
                        newOption.value = svcName;
                        newOption.text = svcName;
                        myApp.appVars.drpServiceSelect.appendChild(newOption);
                    }
                    //console.log(JSON.stringify(myApp.appVars.svcDictionary));
                }

                // Get DRP methods (not included in primary list of Services)
                /*
                let drpCmdList = await myApp.sendCmd("DRP", "getCmds", null, true);
                myApp.appVars.svcDictionary["DRP"] = {
                    "ClientCmds": drpCmdList
                };
                */

                // Set initial Method list to DRP
                let cmdList = myApp.appVars.svcDictionary["DRP"]["ClientCmds"];
                for (let i = 0; i < cmdList.length; i++) {
                    let newOption = document.createElement("option");
                    newOption.value = cmdList[i];
                    newOption.text = cmdList[i];
                    myApp.appVars.drpMethodSelect.appendChild(newOption);
                }

            },
            "displayResponse": function (displayData, isErr) {
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
                myApp.appVars.bottomPane.innerHTML = `<pre style='font-size: 12px;line-height: 12px;color: ${textColor};height: 100%;'>${displayText}</pre>`;
            }
        };
    }

    async runStartup() {
        let myApp = this;

        // Split data pane vertically
        var newPanes = myApp.splitPaneVertical(myApp.windowParts["data"], 100, false, false);
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

        // Assign appVars
        myApp.appVars.drpServiceSelect = $(myApp.appVars.topPane).find('.drpService')[0];
        myApp.appVars.drpMethodSelect = $(myApp.appVars.topPane).find('.drpServiceMethod')[0];
        myApp.appVars.cmdParamsInput = $(myApp.appVars.topPane).find('.cmdParams')[0];
        myApp.appVars.cmdSend = $(myApp.appVars.topPane).find('.cmdSend')[0];

        myApp.appVars.cmdParamsInput.onkeydown = ((keyEvent) => {
            if (keyEvent.which == 13) {
                submitDRPCmd();
                keyEvent.preventDefault();
            }
        });

        let submitDRPCmd = async () => {
            // Get service name
            let drpService = myApp.appVars.drpServiceSelect.value;

            // Get method name
            let drpMethod = myApp.appVars.drpMethodSelect.value;

            // Try to parse command data to JSON object
            let paramsString = myApp.appVars.cmdParamsInput.value;
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
                //let cmdResponse = await myApp.sendCmd(drpService, drpMethod, params, true);
                //myApp.appFuncs.displayResponse(cmdResponse);
                
                let response = await myApp.sendCmd_StreamHandler(drpService, drpMethod, params, (streamData) => {
                    // Stream handler - persistent
                    myApp.appFuncs.displayResponse(streamData);
                });

                if (response) {
                    // Response to immediate command
                    myApp.appFuncs.displayResponse(response);
                }
                
            } catch (ex) {
                // Caught an error, display it
                myApp.appFuncs.displayResponse(ex, true);
            }
        }

        // Action when selected service changes
        $(myApp.appVars.drpServiceSelect).on('change', function () {

            // Populate method list
            myApp.appVars.drpMethodSelect.innerHTML = "";
            let svcName = myApp.appVars.drpServiceSelect.value;
            let cmdList = myApp.appVars.svcDictionary[svcName]["ClientCmds"];
            for (let i = 0; i < cmdList.length; i++) {
                let cmdName = cmdList[i];
                let newOption = document.createElement("option");
                newOption.value = cmdName;
                newOption.text = cmdName;
                myApp.appVars.drpMethodSelect.appendChild(newOption);
            }
        });

        $(myApp.appVars.cmdSend).on('click', () => {
            submitDRPCmd();
        });

        myApp.appFuncs.refreshServices();

    }
});
//# sourceURL=vdm-app-CommandTesting.js
