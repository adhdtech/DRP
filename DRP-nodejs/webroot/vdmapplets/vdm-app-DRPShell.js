(class extends rSageApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let myApp = this;

        // Dropdown menu items
        myApp.menu = {
        };

        myApp.menuSearch = {
            "searchEmptyPlaceholder": "Search...",
            "searchField": null
        };
        /*
        myApp.menuQuery = {
        "queryEmptyPlaceholder": "Query...",
        "queryField": null
        }
         */

        myApp.appFuncs = {
        };

        myApp.appVars = {
            aliases: {
                '?': 'help',
                'dir': 'ls',
                'gi': 'cat',
                'cls': 'clear',
                'quit': 'exit'
            },
            term: null,
            termDiv: null,
            shellVars: {}
        };

        myApp.recvCmd = {
        };
    }

    async runStartup() {
        let myApp = this;

        let watchWindowApplet = {
            appletName: "TopicWatch",
            title: "Topic Watch",
            sizeX: 620,
            sizeY: 400,
            vdmClient: myApp.vdmClient,
            appletClass: (class extends rSageApplet {
                constructor(appletProfile, startupParams) {
                    super(appletProfile);
                    let myApp = this;

                    // Prerequisites
                    myApp.preReqs = [
                    ];

                    // Dropdown menu items
                    myApp.menu = {
                    };

                    myApp.appFuncs = {
                    };

                    myApp.appVars = {
                        startupParams: startupParams
                    };

                    myApp.recvCmd = {
                    };

                }

                runStartup() {
                    let myApp = this;

                    myApp.appVars.termDiv = myApp.windowParts["data"];
                    myApp.appVars.termDiv.style.backgroundColor = "black";
                    let term = new Terminal();
                    myApp.appVars.term = term;
                    myApp.appVars.fitaddon = new FitAddon.FitAddon();
                    term.loadAddon(myApp.appVars.fitaddon);
                    term.open(myApp.appVars.termDiv);
                    term.setOption('cursorBlink', true);
                    term.setOption('bellStyle', 'sound');

                    let topicName = myApp.appVars.startupParams.topicName;
                    let scope = myApp.appVars.startupParams.scope;

                    myApp.sendCmd_StreamHandler("DRP", "subscribe", { topicName: topicName, scope: scope }, (streamData) => {
                        if (typeof streamData.payload === "string") {
                            term.write(`\x1B[94m[${topicName}] \x1B[92m${streamData.payload}\x1B[0m\r\n`);
                        } else {
                            term.write(`\x1B[94m[${topicName}] \x1B[92m${JSON.stringify(streamData.payload)}\x1B[0m\r\n`);
                        }
                    });

                    myApp.resizeMovingHook = function () {
                        myApp.appVars.fitaddon.fit();
                    };

                    myApp.appVars.fitaddon.fit();
                }
            })
        }

        class drpMethodSwitch {
            constructor(switchName, dataType, description) {
                this.switchName = switchName;
                this.dataType = dataType;
                this.description = description;
            }
        }

        class drpMethod {
            /**
             * 
             * @param {string} name
             * @param {string} showHelp
             * @param {Object.<string,drpMethodSwitch>} switches
             * @param {Function} func
             */
            constructor(name, showHelp, switches, func) {
                this.name = name;
                this.showHelp = showHelp;
                this.switches = switches;
                this.func = func;
            }

            parseSwitchesAndData(switchesAndData) {
                let returnObj = {
                    switches: {},
                    data: ""
                }
                if (!switchesAndData) return returnObj;
                // Built regex
                /**
                 * 1. Define empty array for switch regex patterns
                 * 2. Iterate over switches, add switch regex to array
                 * 3. Join with OR into string
                 * 4. Add to template
                 * 5. Evaluate
                 **/
                let switchDataRegExList = [];
                if (this.switches) {
                    let switchList = Object.keys(this.switches);
                    for (let i = 0; i < switchList.length; i++) {
                        let thisSwitchDataRegEx;
                        let thisParameter = this.switches[switchList[i]];
                        if (thisParameter.dataType) {
                            thisSwitchDataRegEx = `(?: ?-(?:${thisParameter.switchName}) (?:(?:".*?")|(?:'.*?')|(?:[^-][^ ?]*)))`
                        } else {
                            thisSwitchDataRegEx = `(?: ?-(?:${thisParameter.switchName}))`
                        }
                        switchDataRegExList.push(thisSwitchDataRegEx);
                    }
                }
                let switchDataRegEx = new RegExp('^((?:' + switchDataRegExList.join('|') + ')*)?(?: ?([^-].*))?$');
                try {
                    let switchRegEx = / ?-(\w)(?: ((?:".*?")|(?:'.*?')|(?:[^-][^ ?]*)))?/g;
                    let switchDataMatch = switchesAndData.match(switchDataRegEx);
                    if (switchDataMatch) {
                        let switchHash = {};
                        let switchMatch;
                        while (switchMatch = switchRegEx.exec(switchDataMatch[1])) {
                            switchHash[switchMatch[1]] = switchMatch[2] || null;
                        }
                        returnObj.switches = switchHash;
                        returnObj.data = switchDataMatch[2] || "";
                    }
                } catch (ex) {
                    let ted = 1;
                }
                return returnObj;
            }

            async execute(switchesAndData, doPipeOut, pipeDataIn) {
                // Parse params
                let switchesAndDataObj = this.parseSwitchesAndData(switchesAndData);

                // If the help switch was specified, display help and return
                let results = await this.func(switchesAndDataObj, doPipeOut, pipeDataIn);
                return results;
            }
        }

        class drpShell {
            constructor(vdmApp, term) {
                /** @type VDMApplet */
                this.vdmApp = vdmApp;
                /** @type Terminal */
                this.term = term;
                /** @type Object.<string,drpMethod> */
                this.drpMethods = {};

                this.AddMethod(new drpMethod("help",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let methodList = Object.keys(this.drpMethods);
                        methodList.forEach(thisCmd => {
                            if (doPipeOut) pipeData += `  ${thisCmd}`;
                            else term.write(`\x1B[95m  ${thisCmd}\x1B[0m\r\n`);
                        });
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let methodList = Object.keys(this.drpMethods);
                        methodList.forEach(thisCmd => {
                            if (doPipeOut) pipeData += `  ${thisCmd}`;
                            else term.write(`\x1B[95m  ${thisCmd}\x1B[0m\r\n`);
                        });
                    }));

                this.AddMethod(new drpMethod("clear",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: clear");
                        console.log("Clear screen.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        term.clear();
                    }));

                this.AddMethod(new drpMethod("exit",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: exit");
                        console.log("Exit DRP Shell.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        vdmApp.vdmDesktop.closeWindow(myApp);
                    }));

                this.AddMethod(new drpMethod("ls",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: ls [OPTIONS]... [PATH]");
                        console.log("List path contents.\n");
                        console.log("Optional arguments:");
                        console.log("  ... need to add formatting options...");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = "";
                        let dataOut = null;
                        let pathList = [];
                        if (switchesAndData.data.length > 0) pathList = switchesAndData.data.split(/[\/\\]/g);

                        let namePadSize = 0;
                        let typePadSize = 0;

                        // Remove leading empty entries
                        while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                        // Remove trailing empty entries
                        while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                        let results = await myApp.sendCmd("DRP", "pathCmd", { pathList: pathList, listOnly: true }, true);
                        if (results && results.pathItemList && results.pathItemList.length > 0) {
                            // First, iterate over all and get the max length of the Name and Type fields
                            for (let i = 0; i < results.pathItemList.length; i++) {
                                let entryObj = results.pathItemList[i];
                                if (entryObj.Name && (!namePadSize || entryObj.Name.length > namePadSize)) {
                                    namePadSize = entryObj.Name.length;
                                }
                                if (entryObj.Type && (!typePadSize || entryObj.Type.length > typePadSize)) {
                                    typePadSize = entryObj.Type.length;
                                }
                            }

                            // We have a directory listing
                            for (let i = 0; i < results.pathItemList.length; i++) {
                                let entryObj = results.pathItemList[i];
                                if (!entryObj.Name) {
                                    console.log("This entry could not be printed, has a null name");
                                    console.dir(entryObj);
                                    continue;
                                }
                                switch (entryObj.Type) {
                                    case null:
                                    case 'Boolean':
                                    case 'Number':
                                    case 'String':
                                        dataOut = `${entryObj.Name.padEnd(namePadSize)}\t${entryObj.Type ? entryObj.Type.padEnd(typePadSize) : "null".padEnd(16)}\t${entryObj.Value}`;
                                        if (doPipeOut) returnObj += dataOut + "\r\n";
                                        else term.write(`\x1B[0m${dataOut}\x1B[0m\r\n`);
                                        break;
                                    case 'Function':
                                    case 'AsyncFunction':
                                        dataOut = `${entryObj.Name.padEnd(namePadSize)}\t${entryObj.Type.padEnd(typePadSize)}`;
                                        if (doPipeOut) returnObj += dataOut + "\r\n";
                                        else term.write(`\x1B[92m${dataOut}\x1B[0m\r\n`);
                                        break;
                                    default:
                                        // Must be some sort of object
                                        dataOut = `${entryObj.Name.padEnd(namePadSize)}\t${entryObj.Type.padEnd(typePadSize)}\t${entryObj.Value}`;
                                        if (doPipeOut) returnObj += dataOut + "\r\n";
                                        else term.write(`\x1B[1;34m${dataOut}\x1B[0m\r\n`);
                                        break;
                                }
                            }
                        } else {
                            dataOut = `No results`;
                            if (doPipeOut) {
                                returnObj += dataOut;
                            } else {
                                term.write(`\x1B[91m${dataOut}\x1B[0m`);
                            }
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("cat",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: cat [OPTIONS]... [PATH]");
                        console.log("Get object from path.\n");
                        console.log("Optional arguments:");
                        console.log("  ... need to add formatting options...");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        let pathList = [];
                        if (switchesAndData.data.length > 0) pathList = switchesAndData.data.split(/[\/\\]/g);

                        // Remove leading empty entries
                        while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                        // Remove trailing empty entries
                        while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                        if (pathList.length === 0) {
                            // Error
                            term.write(`\x1B[91mNo target specified\x1B[0m\r\n`);
                            return;
                        }

                        let results = await myApp.sendCmd("DRP", "pathCmd", { pathList: pathList, listOnly: false }, true);
                        if (typeof results === "string") {
                            // Error
                            term.write(`\x1B[91m${results}\x1B[0m\r\n`);
                        } else if (results && results.pathItem) {
                            // Have pathItem
                            if (doPipeOut) returnObj = results.pathItem;
                            else {
                                if (typeof results.pathItem === "object") {
                                    term.write(`\x1B[0m${JSON.stringify(results.pathItem, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                                } else if (typeof results.pathItem === "string") {
                                    term.write(`\x1B[0m${results.pathItem.replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                                } else {
                                    term.write(`\x1B[0m${results.pathItem}\x1B[0m\r\n`);
                                }
                            }
                        } else {
                            if (doPipeOut) returnObj = results;
                            else term.write(`\x1B[0m${results}\x1B[0m\r\n`);
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("topology",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: topology [OPTIONS]...");
                        console.log("Get mesh topology.\n");
                        console.log("Optional arguments:");
                        console.log("  ... need to add selection and formatting options...");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        let results = await myApp.sendCmd("DRP", "getTopology", null, true);
                        if (doPipeOut) returnObj = results
                        else term.write(`\x1B[96m${JSON.stringify(results, null, 4).replace(/\n/g, "\r\n")}\x1B[0m\r\n`);
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("whoami",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: whoami [OPTIONS]...");
                        console.log("Get my info.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        if (doPipeOut) {
                            returnObj = `UserName: ${myApp.appVars.UserInfo.UserName}`;
                            returnObj += `\r\nFullName: ${myApp.appVars.UserInfo.FullName}`
                            returnObj += `\r\n  Groups: ${myApp.appVars.UserInfo.Groups.join('\r\n          ')}`
                        } else {
                            term.write(`\x1B[33mUserName: \x1B[0m${myApp.appVars.UserInfo.UserName}`);
                            term.write(`\r\n\x1B[33mFullName: \x1B[0m${myApp.appVars.UserInfo.FullName}`);
                            term.write(`\r\n\x1B[33m  Groups: \x1B[0m${myApp.appVars.UserInfo.Groups.join('\r\n          ')}`);
                            term.write(`\r\n`);
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("token",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: token [OPTIONS]...");
                        console.log("Get session token.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        if (doPipeOut) {
                            returnObj = `Token: ${myApp.appVars.UserInfo.Token}`;
                        } else {
                            term.write(`\x1B[33mToken: \x1B[0m${myApp.appVars.UserInfo.Token}`);
                            term.write(`\r\n`);
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("endpointid",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: endpointid");
                        console.log("Get session endpointid.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        if (doPipeOut) {
                            returnObj = `EndpointID: ${myApp.appVars.EndpointID}`;
                        } else {
                            term.write(`\x1B[33mEndpointID: \x1B[0m${myApp.appVars.EndpointID}`);
                            term.write(`\r\n`);
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("download",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: download [OPTIONS]... [FILENAME]");
                        console.log("Download piped contents, optionally specifying a filename to download as.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        term.write(`\x1B[33mDownloading output\x1B[0m`);
                        term.write(`\r\n`);
                        let downloadFileName = "download.txt";
                        if (switchesAndData.data) downloadFileName = switchesAndData.data;
                        var pom = document.createElement('a');
                        let downloadData = null;
                        if (typeof pipeDataIn === 'string') {
                            downloadData = pipeDataIn;
                        } else {
                            downloadData = JSON.stringify(pipeDataIn, null, 2);
                        }
                        pom.setAttribute('href', 'data:application/xml;charset=utf-8,' + encodeURIComponent(downloadData));
                        pom.setAttribute('download', downloadFileName);
                        pom.click();
                    }));

                this.AddMethod(new drpMethod("watch",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: watch [OPTIONS]... [TOPICNAME]");
                        console.log("Subscribe to topic name and output the data stream.\n");
                        console.log("Optional arguments:");
                        console.log("  -s  Scope [local(default),zone,global]");
                    }, {
                    "s": new drpMethodSwitch("s", "string", "Subscription scope")
                },
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        // Open a new window and stream output
                        let scope = "local";

                        switch (switchesAndData.switches["s"]) {
                            case 'global':
                                scope = "global";
                                break;
                            case 'zone':
                                scope = "zone";
                                break;
                            default:
                                scope = "local";
                        }

                        if (switchesAndData.data) {
                            let topicName = switchesAndData.data;
                            let scope = switchesAndData.scope;

                            let newApp = new watchWindowApplet.appletClass(watchWindowApplet, { topicName: topicName, scope: scope });
                            await myApp.vdmDesktop.newWindow(newApp);
                            myApp.vdmDesktop.appletInstances[newApp.appletIndex] = newApp;

                            //term.write(`\x1B[33mSubscribed to stream ${topicName}\x1B[0m`);
                            term.write(`\x1B[33mOpened new window for streaming data\x1B[0m`);
                            term.write(`\r\n`);
                        } else {
                            term.write(`\x1B[91mSyntax: watch [-s local|zone|global] {streamName}\x1B[0m\r\n`);
                        }
                    }));

                this.AddMethod(new drpMethod("scrollback",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: scrollback [MAXLINES]");
                        console.log("Set the terminal scrollback.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, null,
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let returnObj = null;
                        if (switchesAndData.data) {
                            myApp.appVars.term.setOption('scrollback', switchesAndData.data);
                            term.write(`\x1B[33mScrollback set to \x1B[0m${switchesAndData.data}\x1B[33m lines.`);
                            term.write(`\r\n`);
                        } else {
                            let scrollbackLinesCount = myApp.appVars.term.getOption('scrollback');
                            term.write(`\x1B[33mScrollback currently \x1B[0m${scrollbackLinesCount}\x1B[33m lines.`);
                            term.write(`\r\n`);
                        }
                        return returnObj;
                    }));

                this.AddMethod(new drpMethod("grep",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: grep [OPTIONS]... [PATH]");
                        console.log("Grep piped contents or path.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, {
                    "h": new drpMethodSwitch("h", null, "Help"),
                    "i": new drpMethodSwitch("i", null, "Case Insensitive"),
                },
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let output = "";
                        let grepData = null;
                        if ("h" in switchesAndData.switches || !switchesAndData.data) {
                            output = "Usage: grep [OPTIONS]...\r\n";
                            output += "Grep piped contents\r\n\r\n";
                            output += "Optional arguments:\r\n";
                            output += "  -i\tCase insensitive\r\n";
                            term.write(output);
                            return
                        }
                        if (typeof pipeDataIn === 'string') {
                            grepData = pipeDataIn;
                        } else {
                            grepData = JSON.stringify(pipeDataIn, null, 2);
                        }
                        let regexFlags = "";
                        if ("i" in switchesAndData.switches) regexFlags += "i";
                        let checkRegEx = new RegExp(switchesAndData.data, regexFlags);
                        let lineArray = grepData.split('\n')
                        for (let i = 0; i < lineArray.length; i++) {
                            let cleanLine = lineArray[i].replace('\r', '');
                            if (checkRegEx.test(cleanLine)) {
                                if (doPipeOut) {
                                    output += `[${i}] ${cleanLine}`;
                                } else {
                                    term.write(`[${i}] ${cleanLine}\r\n`);
                                }
                            }
                        }
                        return output;
                    }));

                this.AddMethod(new drpMethod("set",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: set [VARIABLE]=[VALUE]");
                        console.log("Set or list shell ENV variables.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, { "h": new drpMethodSwitch("h", null, "Help menu") },
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let output = "";

                        if ("h" in switchesAndData.switches) {
                            output = "Usage: set [VARIABLE]=[VALUE]\r\n";
                            output += "Set or list shell ENV variables.\r\n\r\n";
                            output += "Optional arguments:\r\n";
                            output += "  (none)\r\n";
                            term.write(output);
                            return
                        }

                        if (switchesAndData.data) {
                            // The a parameter name (possibly value) is present
                            // Was a value passed as well?  If not, did we get pipeDataIn?
                            if (switchesAndData.data.indexOf('=') > 0) {
                                let varName = switchesAndData.data.substr(0, switchesAndData.data.indexOf('='));
                                let varValue = switchesAndData.data.substr(switchesAndData.data.indexOf('=') + 1);
                                myApp.appVars.shellVars[varName] = varValue;
                            } else {
                                let varName = switchesAndData.data;
                                if (pipeDataIn) {
                                    myApp.appVars.shellVars[varName] = pipeDataIn;
                                } else {
                                    delete myApp.appVars.shellVars[varName];
                                }
                            }
                        } else {
                            // No ENV variable name provided, list all variables and values
                            let shellVarNames = Object.keys(myApp.appVars.shellVars);
                            for (let i = 0; i < shellVarNames.length; i++) {
                                output += `${shellVarNames[i]}=${myApp.appVars.shellVars[shellVarNames[i]]}\r\n`;
                            }
                        }
                        if (!doPipeOut) {
                            term.write(output);
                        }
                    }));

                this.AddMethod(new drpMethod("echo",
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        console.log("Usage: echo [OUTPUT]");
                        console.log("Print data.\n");
                        console.log("Optional arguments:");
                        console.log("  (none)");
                    }, { "h": new drpMethodSwitch("h", null, "Help menu") },
                    async (switchesAndData, doPipeOut, pipeDataIn) => {
                        let output = "";

                        if ("h" in switchesAndData.switches) {
                            output = "Usage: echo [OUTPUT]\r\n";
                            output += "Print data.\r\n\r\n";
                            output += "Optional arguments:\r\n";
                            output += "  (none)\r\n";
                            term.write(output);
                            return
                        }

                        output += switchesAndData.data;
                        
                        if (!doPipeOut) {
                            term.write(output);
                        }
                    }));
            }
            /**
             * Add Method
             * @param {drpMethod} methodObject
             */
            AddMethod(methodObject) {
                this.drpMethods[methodObject.name] = methodObject;
            }

            async ExecuteCLICommand(commandLine) {
                let pipeData = null;
                term.write(`\r\n`);

                // Replace variables
                let envVarRegEx = /\$(\w+)/g;
                let envVarMatch;
                while (envVarMatch = envVarRegEx.exec(commandLine)) {
                    let varName = envVarMatch[1];
                    let replaceValue = "";
                    // Does the variable exist?
                    if (myApp.appVars.shellVars[varName]) {
                        replaceValue = myApp.appVars.shellVars[varName];
                    }
                    commandLine = commandLine.replace('$' + varName, replaceValue);
                }


                let cmdArray = commandLine.split(" | ");
                for (let i = 0; i < cmdArray.length; i++) {
                    let cmdParts = cmdArray[i].match(/^(\S*)(?: (.*))?$/);
                    if (cmdParts) {
                        let cmdVerb = cmdParts[1];

                        // Replace aliases
                        if (myApp.appVars.aliases && myApp.appVars.aliases[cmdVerb]) {
                            cmdVerb = myApp.appVars.aliases[cmdVerb]
                        }

                        let cmdParamsAndData = cmdParts[2] || "";
                        let doPipeOut = (i + 1 < cmdArray.length);
                        let pipeDataIn = pipeData;
                        pipeData = "";

                        try {
                            pipeData = await this.ExecuteMethod(cmdVerb, cmdParamsAndData, doPipeOut, pipeDataIn);
                        } catch (ex) {
                            term.write(`\x1B[91mError executing command [${cmdVerb}]: ${ex}\x1B[0m\r\n`);
                            break;
                        }
                    }
                }
            }

            async ExecuteMethod(methodName, switchesAndData, doPipeOut, pipeDataIn) {
                if (!this.drpMethods[methodName]) {
                    // Write error to terminal; unknown method
                    this.term.write(`\x1B[91mInvalid command [${methodName}]\x1B[0m`);
                    this.term.write(`\r\n`);
                    return;
                }
                let results = await this.drpMethods[methodName].execute(switchesAndData, doPipeOut, pipeDataIn);
                return results;
            }
        }

        myApp.appVars.termDiv = myApp.windowParts["data"];
        myApp.appVars.termDiv.style.backgroundColor = "black";
        let term = new Terminal();
        myApp.appVars.term = term;
        myApp.appVars.fitaddon = new FitAddon.FitAddon();
        term.loadAddon(myApp.appVars.fitaddon);
        term.open(myApp.appVars.termDiv);
        term.setOption('cursorBlink', true);
        term.setOption('bellStyle', 'sound');

        let writeNewPrompt = (supressNewline) => {
            if (!supressNewline) term.write('\n');
            term.write('\x1B[2K\r\x1B[95mdsh>\x1B[0m ');
        };

        let lineBufferHistory = [];
        let lineBuffer = "";
        let lineCursorIndex = 0;
        let scrollbackIndex = 0;
        let insertMode = true;

        myApp.appVars.drpShell = new drpShell(this, term);

        myApp.appVars.EndpointID = await myApp.sendCmd("DRP", "getEndpointID", null, true);

        myApp.appVars.UserInfo = await myApp.sendCmd("DRP", "getUserInfo", null, true);
        term.write(`\x1B[2K\r\x1B[97mWelcome to the DRP Shell, \x1B[33m${myApp.appVars.UserInfo.UserName}`);
        term.write(`\r\n`);
        writeNewPrompt();

        myApp.appVars.term.onKey(async (e) => {
            //let termBuffer = term.buffer.normal;
            //console.log(`${termBuffer.cursorX},${termBuffer.cursorY}`);
            let charCode = e.key.charCodeAt(0);
            let code2 = e.key.charCodeAt(1);
            let code3 = e.key.charCodeAt(2);
            //console.log(`${charCode}, ${code2}, ${code3}`);
            switch (charCode) {
                case 3:
                    // Ctrl-C
                    navigator.clipboard.writeText(term.getSelection());
                    break;
                case 22:
                    // Ctrl-V
                    let clipboardText = await navigator.clipboard.readText();
                    lineBuffer += clipboardText;
                    term.write(clipboardText);
                    lineCursorIndex += clipboardText.length;
                    break;
                case 24:
                    // Ctrl-X
                    break;
                case 9:
                    // Tab
                    break;
                case 13:
                    // Execute what's in the line buffer
                    if (lineBuffer.length > 0) {
                        // Add to lineBufferHistory
                        lineBufferHistory.unshift(lineBuffer);
                        // If the buffer is full, pop the last one
                        if (lineBufferHistory.length > 100) {
                            lineBufferHistory.pop();
                        }
                        //await myApp.appFuncs.execDRPShell(term, lineBuffer);
                        await myApp.appVars.drpShell.ExecuteCLICommand(lineBuffer);
                    }
                    lineBuffer = "";
                    lineCursorIndex = 0;
                    scrollbackIndex = 0;
                    writeNewPrompt();
                    break;
                case 27:
                    // Special character
                    if (!code2) {
                        // Escape
                        if (lineBuffer.length) {
                            lineBuffer = "";
                            lineCursorIndex = 0;
                            scrollbackIndex = 0;
                            writeNewPrompt(true);
                        } else {
                            term.write('\x07');
                        }
                    } else if (code2 === 91 && code3 === 50) {
                        // Insert
                        insertMode = !insertMode;

                        if (insertMode) term.setOption('cursorStyle', 'block');
                        else term.setOption('cursorStyle', 'underline');

                        break;
                    } else if (code2 === 91 && code3 === 51) {
                        // Delete
                        if (lineCursorIndex < lineBuffer.length) {
                            let part1 = lineBuffer.substr(0, lineCursorIndex);
                            let part2 = lineBuffer.substr(lineCursorIndex + 1);
                            lineBuffer = part1 + part2;
                            term.write(part2 + " ");
                            let goBackString = "\b";
                            for (let i = 0; i < part2.length; i++) {
                                goBackString = goBackString + "\b";
                            }
                            term.write(goBackString);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 65) {
                        // Arrow up
                        if (scrollbackIndex < lineBufferHistory.length) {
                            writeNewPrompt(true);
                            lineBuffer = lineBufferHistory[scrollbackIndex];
                            lineCursorIndex = lineBuffer.length;
                            term.write(lineBuffer);
                            if (scrollbackIndex < lineBufferHistory.length) scrollbackIndex++;
                        }
                        break;
                    } else if (code2 === 91 && code3 === 66) {
                        // Arrow down
                        if (scrollbackIndex > 0) {
                            scrollbackIndex--;
                            writeNewPrompt(true);
                            lineBuffer = lineBufferHistory[scrollbackIndex];
                            lineCursorIndex = lineBuffer.length;
                            term.write(lineBuffer);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 67) {
                        // Arrow right
                        if (lineCursorIndex < lineBuffer.length) {
                            lineCursorIndex++;
                            term.write(e.key);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 68) {
                        // Arrow left
                        if (lineCursorIndex > 0) {
                            lineCursorIndex--;
                            term.write(e.key);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 70) {
                        // End
                        for (let i = 0; i < lineBuffer.length - lineCursorIndex; i++) {
                            term.write(('\x1b[C'));
                        }
                        lineCursorIndex = lineBuffer.length;
                        break;
                    } else if (code2 === 91 && code3 === 72) {
                        // Home
                        let goBackString = "";
                        for (let i = 0; i < lineCursorIndex; i++) {
                            goBackString = goBackString + "\b";
                        }
                        term.write(goBackString);
                        lineCursorIndex = 0;
                        break;
                    } else {
                        term.write(e.key);
                    }
                    break;
                case 127:
                    // Backspace
                    if (lineCursorIndex > 0) {
                        let part1 = lineBuffer.substr(0, lineCursorIndex - 1);
                        let part2 = lineBuffer.substr(lineCursorIndex);
                        lineBuffer = part1 + part2;
                        lineCursorIndex--;
                        term.write("\b");
                        //term.write(part2);
                        term.write(part2 + " ");
                        let goBackString = "\b";
                        for (let i = 0; i < part2.length; i++) {
                            goBackString = goBackString + "\b";
                        }
                        term.write(goBackString);
                        //term.write(" ");
                    }
                    break;
                default:
                    if (lineCursorIndex < lineBuffer.length) {
                        if (insertMode) {
                            // Insert char at index
                            let part1 = lineBuffer.substr(0, lineCursorIndex);
                            let part2 = lineBuffer.substr(lineCursorIndex);
                            lineBuffer = part1 + e.key + part2;
                            term.write(e.key);
                            term.write(part2 + " ");
                            let goBackString = "\b";
                            for (let i = 0; i < part2.length; i++) {
                                goBackString = goBackString + "\b";
                            }
                            term.write(goBackString);
                        } else {
                            // Replace char at index
                            lineBuffer = lineBuffer.substr(0, lineCursorIndex) + e.key + lineBuffer.substr(lineCursorIndex + 1);
                            term.write(e.key);
                        }
                    } else {
                        lineBuffer += e.key;
                        term.write(e.key);
                    }
                    lineCursorIndex++;
            }
            //console.log(`${termBuffer.cursorX},${termBuffer.cursorY}`);
        });

        myApp.resizeMovingHook = function () {
            myApp.appVars.fitaddon.fit();
        };

        myApp.appVars.fitaddon.fit();
    }
});
//# sourceURL=vdm-app-DRPShell.js