class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;
    }

    async RunStartup() {
        let thisApplet = this;

        // Create DRP Shell instance
        thisApplet.drpShell = new DRPShell(thisApplet.dataPane, this);

        // Terminal resize handler
        thisApplet.resizeMovingHook = function () {
            thisApplet.drpShell.fitaddon.fit();
        };
    }
}

class DRPShellMethodSwitch {
    constructor(switchName, dataType, description) {
        this.switchName = switchName;
        this.dataType = dataType;
        this.description = description;
    }
}

class DRPShellMethod {
    /**
     * 
     * @param {string} name
     * @param {string} description
     * @param {string} usage
     * @param {Object.<string,DRPShellMethodSwitch>} switches
     * @param {Function} execute
     * @param {DRPShell} shell
     */
    constructor(name, description, usage, switches, execute, shell) {
        this.name = name;
        this.description = description || '';
        this.usage = usage || '';
        this.switches = switches || {};
        this.execute = execute || (() => { })();
        //this.shell = shell;
    }

    ShowHelp() {
        let output = `Usage: ${this.name} ${this.usage}\r\n`;
        output += `${this.description}\r\n\r\n`;
        output += "Optional arguments:\r\n";
        let switchesKeys = Object.keys(this.switches);
        if (switchesKeys.length > 0) {
            for (let i = 0; i < switchesKeys.length; i++) {
                output += `  -${switchesKeys[i]}\t${this.switches[switchesKeys[i]].description}\r\n`;
            }
        } else {
            output += "  (none)\r\n";
        }
        return output;
    }
}

class DRPShell {
    constructor(targetDiv, applet) {
        let thisShell = this;

        /** @type DRPApplet */
        thisShell.applet = applet;

        // Set parent div style
        thisShell.termDiv = targetDiv;
        thisShell.termDiv.style.backgroundColor = "black";

        /** @type Terminal */
        thisShell.term = new Terminal();

        /** @type Object.<string,DRPShellMethod> */
        thisShell.drpMethods = {};

        thisShell.aliases = {
            '?': 'help',
            'dir': 'ls',
            'gi': 'cat',
            'cls': 'clear',
            'quit': 'exit'
        }

        thisShell.lineBufferHistory = [];
        thisShell.lineBuffer = "";
        thisShell.lineCursorIndex = 0;
        thisShell.scrollbackIndex = 0;
        thisShell.insertMode = true;

        thisShell.shellVars = {};
        thisShell.dropWindowDiv = null;
        thisShell.uploadPendingPromise = null;
        thisShell.normalbgcolor = '#FFF';
        thisShell.hoverbgcolor = '#F88';

        thisShell.fitaddon = new FitAddon.FitAddon();
        thisShell.term.loadAddon(this.fitaddon);

        thisShell.term.open(this.termDiv);
        thisShell.term.setOption('cursorBlink', true);
        thisShell.term.setOption('bellStyle', 'sound');

        thisShell.term.onKey(async (e) => {
            let charCode = e.key.charCodeAt(0);
            let code2 = e.key.charCodeAt(1);
            let code3 = e.key.charCodeAt(2);
            switch (charCode) {
                case 3:
                    // Ctrl-C
                    navigator.clipboard.writeText(thisShell.term.getSelection());
                    break;
                default:
            }
        });

        thisShell.term.onData(async (e) => {
            let charCode = e.charCodeAt(0);
            let code2 = e.charCodeAt(1);
            let code3 = e.charCodeAt(2);
            switch (charCode) {
                case 3:
                    // Ctrl-C
                    // Ignore here
                    break;
                case 22:
                    thisShell.ProcessPaste();
                    break;
                case 24:
                    // Ctrl-X
                    break;
                case 9:
                    // Tab
                    console.log(thisShell.getSelection());
                    break;
                case 13:
                    // Execute what's in the line buffer
                    await thisShell.ProcessLineBuffer();
                    break;
                case 27:
                    // Special character
                    if (!code2) {
                        // Escape
                        if (thisShell.lineBuffer.length) {
                            thisShell.lineBuffer = "";
                            thisShell.lineCursorIndex = 0;
                            thisShell.scrollbackIndex = 0;
                            writeNewPrompt(true);
                        } else {
                            thisShell.term.write('\x07');
                        }
                    } else if (code2 === 91 && code3 === 50) {
                        // Insert
                        thisShell.insertMode = !thisShell.insertMode;

                        if (thisShell.insertMode) thisShell.term.setOption('cursorStyle', 'block');
                        else thisShell.term.setOption('cursorStyle', 'underline');

                        break;
                    } else if (code2 === 91 && code3 === 51) {
                        // Delete
                        if (thisShell.lineCursorIndex < thisShell.lineBuffer.length) {
                            let part1 = thisShell.lineBuffer.substr(0, thisShell.lineCursorIndex);
                            let part2 = thisShell.lineBuffer.substr(thisShell.lineCursorIndex + 1);
                            thisShell.lineBuffer = part1 + part2;
                            thisShell.term.write(part2 + " ");
                            let goBackString = "\b";
                            for (let i = 0; i < part2.length; i++) {
                                goBackString = goBackString + "\b";
                            }
                            thisShell.term.write(goBackString);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 65) {
                        // Arrow up
                        if (thisShell.scrollbackIndex < thisShell.lineBufferHistory.length) {
                            thisShell.WriteNewPrompt(true);
                            thisShell.lineBuffer = thisShell.lineBufferHistory[thisShell.scrollbackIndex];
                            thisShell.lineCursorIndex = thisShell.lineBuffer.length;
                            thisShell.term.write(thisShell.lineBuffer);
                            if (thisShell.scrollbackIndex < thisShell.lineBufferHistory.length) thisShell.scrollbackIndex++;
                        }
                        break;
                    } else if (code2 === 91 && code3 === 66) {
                        // Arrow down
                        if (thisShell.scrollbackIndex > 0) {
                            thisShell.scrollbackIndex--;
                            thisShell.WriteNewPrompt(true);
                            thisShell.lineBuffer = thisShell.lineBufferHistory[thisShell.scrollbackIndex];
                            thisShell.lineCursorIndex = thisShell.lineBuffer.length;
                            thisShell.term.write(thisShell.lineBuffer);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 67) {
                        // Arrow right
                        if (thisShell.lineCursorIndex < thisShell.lineBuffer.length) {
                            thisShell.lineCursorIndex++;
                            thisShell.term.write(e);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 68) {
                        // Arrow left
                        if (thisShell.lineCursorIndex > 0) {
                            thisShell.lineCursorIndex--;
                            thisShell.term.write(e);
                        }
                        break;
                    } else if (code2 === 91 && code3 === 70) {
                        // End
                        for (let i = 0; i < thisShell.lineBuffer.length - thisShell.lineCursorIndex; i++) {
                            thisShell.term.write(('\x1b[C'));
                        }
                        thisShell.lineCursorIndex = thisShell.lineBuffer.length;
                        break;
                    } else if (code2 === 91 && code3 === 72) {
                        // Home
                        let goBackString = "";
                        for (let i = 0; i < thisShell.lineCursorIndex; i++) {
                            goBackString = goBackString + "\b";
                        }
                        thisShell.term.write(goBackString);
                        thisShell.lineCursorIndex = 0;
                        break;
                    } else {
                        thisShell.term.write(e);
                    }
                    break;
                case 127:
                    // Backspace
                    if (thisShell.lineCursorIndex > 0) {
                        let part1 = thisShell.lineBuffer.substr(0, thisShell.lineCursorIndex - 1);
                        let part2 = thisShell.lineBuffer.substr(thisShell.lineCursorIndex);
                        thisShell.lineBuffer = part1 + part2;
                        thisShell.lineCursorIndex--;
                        thisShell.term.write("\b");
                        //term.write(part2);
                        thisShell.term.write(part2 + " ");
                        let goBackString = "\b";
                        for (let i = 0; i < part2.length; i++) {
                            goBackString = goBackString + "\b";
                        }
                        thisShell.term.write(goBackString);
                        //term.write(" ");
                    }
                    break;
                default:
                    let lineArray = e.split(/\r/);
                    for (let lineIdx = 0; lineIdx < lineArray.length; lineIdx++) {
                        thisShell.InsertString(lineArray[lineIdx]);
                        if (lineIdx + 1 < lineArray.length) {
                            await thisShell.ProcessLineBuffer();
                        }
                    }
            }
        });

        this.AddMethod(new DRPShellMethod("help",
            "Show available commands", // Description
            null,  // Usage
            null,  // Switches
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                thisShell.term.write(thisMethod.ShowHelp());
                return
            }));

        this.drpMethods["help"].ShowHelp = function () {
            let output = "";
            let methodList = Object.keys(thisShell.drpMethods);
            methodList.forEach(thisCmd => {
                output += `\x1B[92m  ${thisCmd.padEnd(16)}\x1B[0m \x1B[94m${thisShell.drpMethods[thisCmd].description}\x1B[0m\r\n`;
            });
            return output;
        }

        this.AddMethod(new DRPShellMethod("clear",
            "Clear screen",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                thisShell.term.clear();
            }));

        this.AddMethod(new DRPShellMethod("exit",
            "Exit DRP Shell",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                thisShell.applet.vdmDesktop.CloseApplet(thisShell.applet);
            }));

        this.AddMethod(new DRPShellMethod("ls",
            "List path contents",
            "[OPTIONS]... [PATH]",
            { "h": new DRPShellMethodSwitch("h", null, "Help") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                let returnObj = "";
                let dataOut = null;
                let pathList = [];
                if (switchesAndData.data.length > 0) pathList = switchesAndData.data.split(/[\/\\]/g);

                let namePadSize = 0;
                let typePadSize = 0;
                let maxValueOutLen = 128;
                let fieldSeparator = "    ";

                // Remove leading empty entries
                while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                // Remove trailing empty entries
                while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                let results = null;

                try {
                    results = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "ls", __pathList: pathList }, true);
                } catch (ex) {
                    let errMsg = ex.message;
                    if (doPipeOut) return errMsg + "\r\n";
                    else thisShell.term.write(`\x1B[91m${errMsg}\x1B[0m`);
                    return
                }

                if (!results || !results.length) {
                    let errMsg = "No entries";
                    if (doPipeOut) return errMsg + "\r\n";
                    else thisShell.term.write(`\x1B[91m${errMsg}\x1B[0m`);
                    return
                }

                // First, iterate over all and get the max length of the Name and Type fields
                for (let i = 0; i < results.length; i++) {
                    let entryObj = results[i];
                    if (entryObj.Name && (!namePadSize || entryObj.Name.length > namePadSize)) {
                        namePadSize = entryObj.Name.length;
                    }
                    if (entryObj.Type && (!typePadSize || entryObj.Type.length > typePadSize)) {
                        typePadSize = entryObj.Type.length;
                    }
                }

                // We have a directory listing
                for (let i = 0; i < results.length; i++) {
                    let entryObj = results[i];
                    if (!entryObj.Name) {
                        console.log("This entry could not be printed, has a null name");
                        console.dir(entryObj);
                        continue;
                    }
                    if (doPipeOut) {
                        fieldSeparator = "\t";
                    }
                    switch (entryObj.Type) {
                        case null:
                        case 'Boolean':
                        case 'Number':
                            dataOut = `${entryObj.Name.padEnd(namePadSize)}${fieldSeparator}${entryObj.Type ? entryObj.Type.padEnd(typePadSize) : "null".padEnd(16)}${fieldSeparator}${entryObj.Value}`;
                            if (doPipeOut) returnObj += dataOut + "\r\n";
                            else thisShell.term.write(`\x1B[0m${dataOut}\x1B[0m\r\n`);
                            break;
                        case 'String':
                            let lineArray = entryObj.Value.split(/\r?\n/);
                            let valueOut = "";
                            if (lineArray[0].length <= maxValueOutLen) {
                                valueOut = lineArray[0];
                            } else {
                                if (doPipeOut) valueOut = `${lineArray[0].substr(0, maxValueOutLen)}...`;
                                else valueOut = `${lineArray[0].substr(0, maxValueOutLen)}\x1B[3;43m...\x1B[0m`;
                            }
                            if (lineArray.length > 1) {
                                if (doPipeOut) valueOut += ` [${lineArray.length - 1} more lines]`;
                                else valueOut += ` \x1B[3;43m[${lineArray.length - 1} more lines]\x1B[0m`;
                            }
                            dataOut = `${entryObj.Name.padEnd(namePadSize)}${fieldSeparator}${entryObj.Type ? entryObj.Type.padEnd(typePadSize) : "null".padEnd(16)}${fieldSeparator}${valueOut}`;
                            if (doPipeOut) returnObj += dataOut + "\r\n";
                            else thisShell.term.write(`\x1B[0m${dataOut}\x1B[0m\r\n`);
                            break;
                        case 'Function':
                        case 'AsyncFunction':
                        case 'DRP_VirtualFunction':
                            dataOut = `${entryObj.Name.padEnd(namePadSize)}${fieldSeparator}${entryObj.Type.padEnd(typePadSize)}`;
                            if (doPipeOut) returnObj += dataOut + "\r\n";
                            else thisShell.term.write(`\x1B[92m${dataOut}\x1B[0m\r\n`);
                            break;
                        default:
                            // Must be some sort of object
                            dataOut = `${entryObj.Name.padEnd(namePadSize)}${fieldSeparator}${entryObj.Type.padEnd(typePadSize)}${fieldSeparator}${entryObj.Value}`;
                            if (doPipeOut) returnObj += dataOut + "\r\n";
                            else thisShell.term.write(`\x1B[1;34m${dataOut}\x1B[0m\r\n`);
                            break;
                    }
                }
                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("cat",
            "Get object from path",
            "[PATH]",
            { "h": new DRPShellMethodSwitch("h", null, "Help") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);

                let returnObj = null;

                // If an object was passed in a variable, output and return
                if (typeof switchesAndData.data === "object") {
                    if (doPipeOut) {
                        return switchesAndData.data;
                    } else {
                        thisShell.term.write(`\x1B[0m${JSON.stringify(switchesAndData.data, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                        return returnObj;
                    }
                }

                let pathList = [];
                if (switchesAndData.data.length > 0) pathList = switchesAndData.data.split(/[\/\\]/g);

                // Remove leading empty entries
                while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                // Remove trailing empty entries
                while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                if ("h" in switchesAndData.switches || pathList.length === 0) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                let results = null;

                try {
                    results = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "cat", __pathList: pathList }, true);
                } catch (ex) {
                    thisShell.term.write(`\x1B[91m${ex.message}\x1B[0m`);
                    return;
                }

                // Item was returned
                if (doPipeOut) returnObj = results;
                else {
                    if (typeof results === "object") {
                        thisShell.term.write(`\x1B[0m${JSON.stringify(results, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                    } else if (typeof results === "string") {
                        thisShell.term.write(`\x1B[0m${results.replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                    } else {
                        thisShell.term.write(`\x1B[0m${results}\x1B[0m\r\n`);
                    }
                }

                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("exec",
            "Execute RPC Method",
            "[service].[method]([param]:[val],...)",
            {},
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                // Get Service, Method and Data
                // TODO - not using the ParseSwitchesAndData method which processes variables
                let returnObj = null;
                let results = null;

                // First try to match the <service>.<method> convention
                let rpcRegex = /^(\w+)\.(\w+)\((?:(.*))?\)\s*$/;
                let rpcRegexMatch = switchesAndDataString.match(rpcRegex);

                if (rpcRegexMatch) {
                    let serviceName = rpcRegexMatch[1];
                    let cmdName = rpcRegexMatch[2];
                    let paramsString = rpcRegexMatch[3] || "";
                    let params = {
                        __method: "exec"
                    };
                    try {
                        let parsedValue = JSON.parse(paramsString);
                        let constructorType = parsedValue.constructor.name;
                        if (constructorType !== "Object") {
                            throw { message: `Expected an object, received a ${constructorType}` };
                        }
                        params = parsedValue;
                        params.__method = "exec";
                    }
                    catch (ex) {
                        if (paramsString.length > 0) {
                            let paramRegex = /[^,"']+|"([^"]*)"|'([^']*)'/g;
                            let matches = paramsString.match(paramRegex);
                            if (matches) {
                                params.__pathList = [];
                                for (let thisMatch of matches) {
                                    params.__pathList.push(thisMatch);
                                }
                            }
                            //params.__pathList = paramsString.split(",");
                        }
                    }

                    // Execute RPC method
                    try {
                        let debugOut = {
                            service: serviceName,
                            cmd: cmdName,
                            paramsString: paramsString,
                            params: params
                        }
                        //term.write(`\x1B[0m${JSON.stringify(debugOut, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                        results = await thisShell.applet.sendCmd(serviceName, cmdName, params, true);
                    } catch (ex) {
                        thisShell.term.write(`\x1B[91m${ex.message}\x1B[0m`);
                        return;
                    }
                } else {
                    // Did not match the <service>.<method> convention, treat as a path
                    let pathList = [];
                    pathList = switchesAndDataString.split(/[\/\\]/g);

                    // Remove leading empty entries
                    while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                    // Remove trailing empty entries
                    while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                    if (pathList.length === 0) {
                        thisShell.term.write(thisMethod.ShowHelp());
                        return
                    }

                    try {
                        results = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "exec", __pathList: pathList }, true);
                    } catch (ex) {
                        thisShell.term.write(`\x1B[91m${ex.message}\x1B[0m`);
                        return;
                    }
                }

                // Do stuff with output
                if (doPipeOut) returnObj = results;
                else {
                    if (typeof results === "object") {
                        thisShell.term.write(`\x1B[0m${JSON.stringify(results, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                    } else if (typeof results === "string") {
                        thisShell.term.write(`\x1B[0m${results.replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                    } else {
                        thisShell.term.write(`\x1B[0m${results}\x1B[0m\r\n`);
                    }
                }

                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("man",
            "Get man page for function",
            "[path to function]",
            {},
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                // Get Service, Method
                let returnObj = null;
                let results = null;
                let rpcRegexMatch = null;

                // First, try to match the <method> convention
                if (rpcRegexMatch = switchesAndDataString.match(/^(\w+)$/)) {
                    let cmdName = rpcRegexMatch[1];

                    // Execute RPC method
                    if (thisShell.drpMethods[cmdName]) {
                        results = thisShell.drpMethods[cmdName].ShowHelp();
                    } else {
                        thisShell.term.write(`\x1B[91mUnknown shell command: ${cmdName}\x1B[0m`);
                        return;
                    }
                    // Second, try to match the <service>.<method> convention
                } else if (rpcRegexMatch = switchesAndDataString.match(/^(\w+)\.(\w+)\s*$/)) {
                    let serviceName = rpcRegexMatch[1];
                    let cmdName = rpcRegexMatch[2];
                    let params = {
                        __verb: "man"
                    };

                    // Execute RPC method
                    try {
                        //term.write(`\x1B[0m${JSON.stringify(debugOut, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                        results = await thisShell.applet.sendCmd(serviceName, cmdName, params, true);
                    } catch (ex) {
                        thisShell.term.write(`\x1B[91m${ex.message}\x1B[0m`);
                        return;
                    }
                    // Finally, try to match the path convention
                } else {
                    let pathList = [];
                    pathList = switchesAndDataString.split(/[\/\\]/g);

                    // Remove leading empty entries
                    while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                    // Remove trailing empty entries
                    while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                    if (pathList.length < 2) {
                        thisShell.term.write(thisMethod.ShowHelp());
                        return;
                    }

                    try {
                        results = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "man", __pathList: pathList }, true);
                    } catch (ex) {
                        thisShell.term.write(`\x1B[91m${ex.message}\x1B[0m`);
                        return;
                    }
                }

                // Do stuff with output
                if (doPipeOut) returnObj = results;
                else thisShell.term.write(`\x1B[0m${results}\x1B[0m\r\n`);

                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("topology",
            "Get mesh topology",
            null,
            {
                "h": new DRPShellMethodSwitch("h", null, "Help menu"),
                "l": new DRPShellMethodSwitch("l", null, "Retrieve topology logs from all mesh nodes")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let returnObj = null;
                let tmpResults = null;

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                if ("l" in switchesAndData.switches) {
                    // Get topology logs from each node in mesh
                    tmpResults = {};
                    let pathString = `Mesh/Nodes`;
                    let pathList = pathString.split(/[\/\\]/g);
                    let nodeListDir = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "GetChildItems", __pathList: pathList }, true);
                    if (nodeListDir && nodeListDir.length > 0) {
                        for (let i = 0; i < nodeListDir.length; i++) {
                            let entryObj = nodeListDir[i];
                            if (!entryObj.Name) {
                                console.log("This entry could not be printed, has a null name");
                                console.dir(entryObj);
                                continue;
                            }
                            let nodeID = entryObj.Name;
                            pathString = `Mesh/Nodes/${nodeID}/DRPNode/TopicManager/Topics/TopologyTracker/History`;
                            pathList = pathString.split(/[\/\\]/g);
                            let nodeListGet = await thisShell.applet.sendCmd("DRP", "pathCmd", { __verb: "GetItem", __pathList: pathList }, true);
                            tmpResults[nodeID] = nodeListGet;
                        }
                    }
                } else {
                    tmpResults = await thisShell.applet.sendCmd("DRP", "getTopology", null, true);
                }
                if (doPipeOut) returnObj = tmpResults;
                else thisShell.term.write(`\x1B[96m${JSON.stringify(tmpResults, null, 4).replace(/\r?\n/g, "\r\n")}\x1B[0m\r\n`);

                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("whoami",
            "Get my info",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let returnObj = null;
                if (doPipeOut) {
                    returnObj = `UserName: ${thisShell.UserInfo.UserName}`;
                    returnObj += `\r\nFullName: ${thisShell.UserInfo.FullName}`
                    returnObj += `\r\n  Groups: ${thisShell.UserInfo.Groups.join('\r\n          ')}`
                } else {
                    thisShell.term.write(`\x1B[33mUserName: \x1B[0m${thisShell.UserInfo.UserName}`);
                    thisShell.term.write(`\r\n\x1B[33mFullName: \x1B[0m${thisShell.UserInfo.FullName}`);
                    thisShell.term.write(`\r\n\x1B[33m  Groups: \x1B[0m${thisShell.UserInfo.Groups.join('\r\n          ')}`);
                    thisShell.term.write(`\r\n`);
                }
                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("token",
            "Get session token",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let returnObj = null;
                if (doPipeOut) {
                    returnObj = `Token: ${thisShell.UserInfo.Token}`;
                } else {
                    thisShell.term.write(`\x1B[33mToken: \x1B[0m${thisShell.UserInfo.Token}`);
                    thisShell.term.write(`\r\n`);
                }
                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("endpointid",
            "Get session endpointid",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let returnObj = null;
                let endpointID = await thisShell.applet.sendCmd("DRP", "getEndpointID", null, true);
                if (doPipeOut) {
                    returnObj = `EndpointID: ${endpointID}`;
                } else {
                    thisShell.term.write(`\x1B[33mEndpointID: \x1B[0m${endpointID}`);
                    thisShell.term.write(`\r\n`);
                }
                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("download",
            "Download piped contents as file",
            "[FILENAME]",
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                thisShell.term.write(`\x1B[33mDownloading output\x1B[0m`);
                thisShell.term.write(`\r\n`);
                let downloadFileName = "download.txt";
                if (switchesAndData.data) downloadFileName = switchesAndData.data;
                let pom = document.createElement('a');
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

        this.AddMethod(new DRPShellMethod("jsontable",
            "Display piped JSON as a table",
            null,
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let inputArray;
                //if (switchesAndData.data) downloadFileName = switchesAndData.data;

                let maxColLength = 30;

                // Did this function receive a string that needs to be parsed?
                if (typeof pipeDataIn === 'string') {
                    inputArray = JSON.parse(pipeDataIn);
                } else {
                    inputArray = pipeDataIn;
                }

                if (!inputArray || !inputArray.length) {
                    throw { message: `No data received to display` };
                }

                let output = "";
                let headerLabels = [];
                let headerLengths = {};
                // Loop over input records
                for (let thisRecord of inputArray) {
                    // Loop over headers
                    let thisRecordHeaders = Object.keys(thisRecord);
                    for (let thisRecordHeader of thisRecordHeaders) {
                        // Make sure header exists
                        if (!headerLabels.includes(thisRecordHeader)) {
                            headerLabels.push(thisRecordHeader);
                            headerLengths[thisRecordHeader] = thisRecordHeader.length;
                        }

                        let fieldData = thisRecord[thisRecordHeader];
                        let fieldDataString = "";

                        if (typeof fieldData === "object") {
                            fieldDataString = String(fieldData);
                        } else if (typeof fieldData === "string") {
                            fieldDataString = fieldData;
                        } else {
                            fieldDataString = String(fieldData);
                        }

                        // See if the current fieldData is longer than the header
                        headerLengths[thisRecordHeader] = Math.max(headerLengths[thisRecordHeader], fieldDataString.length);
                        if (headerLengths[thisRecordHeader] > maxColLength) {
                            headerLengths[thisRecordHeader] = maxColLength;
                        }
                    }
                }

                let headerColorCtrl = '\x1B[40;1;95m';
                let headerList = headerLabels.map(thisHeader => `${headerColorCtrl}${thisHeader.padEnd(headerLengths[thisHeader], ' ')}\x1B[0m`);
                output += `\r\n` + headerList.join(' ') + `\r\n`;

                // Loop over input records
                for (let thisRecord of inputArray) {
                    // Loop over headers
                    let dataStrings = [];
                    for (let thisRecordHeader of headerLabels) {

                        let fieldData = thisRecord[thisRecordHeader];
                        let fieldDataString = "";

                        if (typeof fieldData === "object") {
                            fieldDataString = String(fieldData);
                        } else if (typeof fieldData === "string") {
                            fieldDataString = fieldData;
                        } else {
                            fieldDataString = String(fieldData);
                        }

                        fieldDataString = fieldDataString.substr(0, headerLengths[thisRecordHeader]).padEnd(headerLengths[thisRecordHeader], ' ');
                        fieldDataString = `\x1B[0m${fieldDataString}\x1B[0m`;
                        dataStrings.push(fieldDataString)
                    }
                    output += `${dataStrings.join(' ')}\r\n`;
                }

                if (doPipeOut) {
                    // Sanitize output by removing terminal control characters
                    output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                } else {
                    thisShell.term.write(output);
                }

                return output;
            }));

        this.AddMethod(new DRPShellMethod("watch",
            "Subscribe to topic name and output the data stream",
            "[OPTIONS]... [STREAM]",
            {
                "s": new DRPShellMethodSwitch("s", "string", "Scope [local(default)|zone|global]"),
                "z": new DRPShellMethodSwitch("z", null, "Switch scope to zone"),
                "g": new DRPShellMethodSwitch("g", null, "Switch scope to global"),
                "n": new DRPShellMethodSwitch("n", "string", "Target NodeID"),
                "i": new DRPShellMethodSwitch("i", null, "Single Instance"),
                "f": new DRPShellMethodSwitch("f", "string", "Format [timestamp(default)|bare|full]"),
                "p": new DRPShellMethodSwitch("p", null, "Pretty print objects (multi-line)"),
                "l": new DRPShellMethodSwitch("l", null, "List available streams"),
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";
                if ("l" in switchesAndData.switches) {

                    let headerLabels = ["Stream Name", "Service Instance", "Scope", "Zone"];
                    /*
                    let fieldMaxLengths = [];
                    for (let i = 0; i < headerLabels.length; i++) {
                        fieldMaxLengths.push(headerLabels[i]);
                    }
                    */

                    let headerLengths = Object.assign({}, ...headerLabels.map((x) => ({ [x]: x.length })));

                    let topologyData = await thisShell.applet.sendCmd("DRP", "getTopology", null, true);
                    let streamTable = {};
                    // Loop over nodes
                    let nodeList = Object.keys(topologyData);
                    for (let i = 0; i < nodeList.length; i++) {
                        let nodeEntry = topologyData[nodeList[i]];
                        let serviceList = Object.keys(nodeEntry.Services);
                        for (let j = 0; j < serviceList.length; j++) {
                            let serviceEntry = nodeEntry.Services[serviceList[j]];
                            for (let k = 0; k < serviceEntry.Streams.length; k++) {
                                let thisStreamName = serviceEntry.Streams[k];
                                if (!streamTable[thisStreamName]) {
                                    streamTable[thisStreamName] = [];
                                    headerLengths["Stream Name"] = Math.max(headerLengths["Stream Name"], thisStreamName.length);
                                }
                                headerLengths["Service Instance"] = Math.max(headerLengths["Service Instance"], serviceEntry.InstanceID.length);
                                headerLengths["Scope"] = Math.max(headerLengths["Scope"], serviceEntry.Scope.length);
                                headerLengths["Zone"] = Math.max(headerLengths["Zone"], serviceEntry.Zone.length);
                                streamTable[thisStreamName].push(serviceEntry);
                            }
                        }
                    }

                    //let headerColorCtrl = '\x1B[40;96m';
                    let headerColorCtrl = '\x1B[40;1;95m';
                    output += `\r\n` +
                        `${headerColorCtrl}${headerLabels[0].padEnd(headerLengths[headerLabels[0]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[1].padEnd(headerLengths[headerLabels[1]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[2].padEnd(headerLengths[headerLabels[2]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[3].padEnd(headerLengths[headerLabels[3]], ' ')}\x1B[0m` +
                        `\r\n`;

                    // Output stream list
                    let streamNameList = Object.keys(streamTable);
                    for (let i = 0; i < streamNameList.length; i++) {
                        let thisStreamName = streamNameList[i];
                        let thisServiceArray = streamTable[thisStreamName];
                        for (let j = 0; j < thisServiceArray.length; j++) {
                            let thisServiceObj = thisServiceArray[j];
                            let thisStreamNameText = thisStreamName.padEnd(headerLengths["Stream Name"]);
                            let thisInstanceIDText = thisServiceObj.InstanceID.padEnd(headerLengths["Service Instance"]);
                            let thisScopeText = thisServiceObj.Scope.padEnd(headerLengths["Scope"]);
                            let thisZoneText = thisServiceObj.Zone;
                            let scopeColor = "";
                            switch (thisServiceObj.Scope) {
                                case "local":
                                    scopeColor = "93";
                                    break;
                                case "zone":
                                    //scopeColor = "94";
                                    scopeColor = "96";
                                    break;
                                case "global":
                                    scopeColor = "92";
                                    break;
                                default:
                                    scopeColor = "39";
                            }
                            output += `\x1B[37m${thisStreamNameText} \x1B[0;37m${thisInstanceIDText}\x1B[0m \x1B[${scopeColor}m${thisScopeText}\x1B[0m ${thisZoneText}\r\n`;
                        }
                    }

                    if (doPipeOut) {
                        // Sanitize output by removing terminal control characters
                        output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                    } else {
                        thisShell.term.write(output);
                    }

                    return output;
                }

                if (switchesAndData.data) {
                    // Open a new window and stream output
                    let topicName = switchesAndData.data;
                    let scope = switchesAndData.switches["s"] || "local";
                    let targetNodeID = switchesAndData.switches["n"] || null;
                    let singleInstance = false;
                    let prettyPrint = false;
                    let format = switchesAndData.switches["f"] || null;

                    // If a specific NodeID is set, override the scope
                    if (targetNodeID) {
                        scope = "local";
                    } else {
                        if ("z" in switchesAndData.switches) {
                            scope = "zone";
                        }

                        if ("g" in switchesAndData.switches) {
                            scope = "global";
                        }
                    }

                    // Check for single instance
                    if ("i" in switchesAndData.switches) {
                        singleInstance = true;
                    }

                    // Check for pretty print
                    if ("p" in switchesAndData.switches) {
                        prettyPrint = true;
                    }

                    switch (scope) {
                        case "local":
                        case "zone":
                        case "global":
                            break;
                        default:
                            thisShell.term.write(`\x1B[91mInvalid scope: ${scope}\x1B[0m\r\n`);
                            thisShell.term.write(`\x1B[91mSyntax: watch [-s local(default)|zone|global] {streamName}\x1B[0m\r\n`);
                            return;
                    }

                    switch (format) {
                        case null:
                        case "timestamp":
                        case "bare":
                        case "full":
                            break;
                        default:
                            thisShell.term.write(`\x1B[91mInvalid format: ${format}\x1B[0m\r\n`);
                            thisShell.term.write(`\x1B[91mSyntax: watch [-f [timestamp(default)|bare|full] {streamName}\x1B[0m\r\n`);
                            return;
                    }

                    await thisShell.applet.vdmDesktop.OpenApplet("TopicWatch", {
                        topicName: topicName,
                        scope: scope,
                        targetNodeID: targetNodeID,
                        singleInstance: singleInstance,
                        format: format,
                        prettyPrint: prettyPrint
                    });

                    thisShell.term.write(`\x1B[33mOpened new window for streaming data\x1B[0m`);
                    thisShell.term.write(`\r\n`);
                } else {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }
            }));

        this.AddMethod(new DRPShellMethod("dm",
            "Data mesh operations (demo)",
            "-[ig] {className} | -k {stereotypeName} [OPTIONS]...",
            {
                "l": new DRPShellMethodSwitch("l", null, "List available classes"),
                "i": new DRPShellMethodSwitch("i", "string", "Get Class definitions matching a specified class name (opt: -s)"),
                "k": new DRPShellMethodSwitch("k", "string", "Get Class definitions containing a specified stereotype (opt: -s)"),
                "g": new DRPShellMethodSwitch("g", "string", "Get Class data (opt: -s)"),
                "s": new DRPShellMethodSwitch("s", "string", "Service Name"),
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";
                if ("l" in switchesAndData.switches) {

                    let headerLabels = ["Service", "Class", "Record Count", "Scope", "Zone"];

                    let headerLengths = Object.assign({}, ...headerLabels.map((x) => ({ [x]: x.length })));

                    let serviceData = await thisShell.applet.sendCmd("DRP", "getServiceDefinitions", null, true);
                    let serviceTable = {};
                    // Loop over nodes
                    let serviceList = Object.keys(serviceData);
                    for (let i = 0; i < serviceList.length; i++) {
                        let thisServiceName = serviceList[i];
                        let serviceEntry = serviceData[thisServiceName];
                        let classList = Object.keys(serviceEntry.Classes);
                        for (let j = 0; j < classList.length; j++) {
                            let thisClassName = classList[j];
                            let thisClassObj = serviceEntry.Classes[thisClassName];

                            // Get Class object count
                            let recCount = "";
                            let classMeshPath = `Mesh/Services/${thisServiceName}/Classes/${thisClassName}`.split("/");
                            let classListDir = await thisShell.applet.sendCmd("DRP", "pathCmd", { "method": "GetChildItems", "pathList": classMeshPath }, true);
                            if (classListDir && classListDir.length > 0) {
                                for (let i = 0; i < classListDir.length; i++) {
                                    let entryObj = classListDir[i];
                                    if (!entryObj.Name) {
                                        continue;
                                    }

                                    if (entryObj.Name === "cache") {
                                        recCount = entryObj.Value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                                        break;
                                    }
                                }
                            }

                            thisClassObj.RecordCount = recCount;

                            if (!serviceTable[thisServiceName]) {
                                serviceTable[thisServiceName] = [];
                                headerLengths["Service"] = Math.max(headerLengths["Service"], thisServiceName.length);
                            }
                            headerLengths["Class"] = Math.max(headerLengths["Class"], thisClassName.length);
                            headerLengths["Record Count"] = Math.max(headerLengths["Record Count"], thisClassName.length);
                            headerLengths["Scope"] = Math.max(headerLengths["Scope"], serviceEntry.Scope.length);
                            headerLengths["Zone"] = Math.max(headerLengths["Zone"], serviceEntry.Zone.length);
                        }
                    }

                    //let headerColorCtrl = '\x1B[40;96m';
                    let headerColorCtrl = '\x1B[40;1;95m';
                    output += `\r\n` +
                        `${headerColorCtrl}${headerLabels[0].padEnd(headerLengths[headerLabels[0]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[1].padEnd(headerLengths[headerLabels[1]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[2].padEnd(headerLengths[headerLabels[2]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[3].padEnd(headerLengths[headerLabels[3]], ' ')}\x1B[0m ` +
                        `${headerColorCtrl}${headerLabels[4].padEnd(headerLengths[headerLabels[4]], ' ')}\x1B[0m` +
                        `\r\n`;

                    // Output class list
                    for (let i = 0; i < serviceList.length; i++) {
                        let thisServiceName = serviceList[i];
                        let serviceEntry = serviceData[thisServiceName];
                        let classList = Object.keys(serviceEntry.Classes);
                        for (let j = 0; j < classList.length; j++) {
                            let thisClassName = classList[j];
                            let thisClassObj = serviceEntry.Classes[thisClassName];
                            let thisServiceText = thisServiceName.padEnd(headerLengths["Service"]);
                            let thisClassNameText = thisClassName.padEnd(headerLengths["Class"]);
                            let thisRecordCountText = thisClassObj.RecordCount.padStart(headerLengths["Record Count"]);
                            let thisScopeText = serviceEntry.Scope.padEnd(headerLengths["Scope"]);
                            let thisZoneText = serviceEntry.Zone;
                            let scopeColor = "";
                            switch (serviceEntry.Scope) {
                                case "local":
                                    scopeColor = "93";
                                    break;
                                case "zone":
                                    //scopeColor = "94";
                                    scopeColor = "96";
                                    break;
                                case "global":
                                    scopeColor = "92";
                                    break;
                                default:
                                    scopeColor = "39";
                            }
                            output += `\x1B[37m${thisServiceText} \x1B[0;37m${thisClassNameText}\x1B[0m \x1B[0;37m${thisRecordCountText}\x1B[0m \x1B[${scopeColor}m${thisScopeText}\x1B[0m ${thisZoneText}\r\n`;
                        }
                    }

                    if (doPipeOut) {
                        // Sanitize output by removing terminal control characters
                        output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                    } else {
                        thisShell.term.write(output);
                    }

                    return output;
                }

                if ("g" in switchesAndData.switches) {

                    let className = switchesAndData.switches["g"];

                    let serviceDataTable = {};

                    if (switchesAndData.switches["s"]) {
                        // Specify a single service
                        serviceDataTable[switchesAndData.switches["s"]] = null;
                    } else {
                        // Query all services with this class
                        let serviceData = await thisShell.applet.sendCmd("DRP", "getServiceDefinitions", null, true);
                        // Loop over nodes
                        let serviceList = Object.keys(serviceData);
                        for (let i = 0; i < serviceList.length; i++) {
                            let thisServiceName = serviceList[i];
                            let serviceEntry = serviceData[thisServiceName];
                            let classList = Object.keys(serviceEntry.Classes);
                            for (let j = 0; j < classList.length; j++) {
                                let thisClassName = classList[j];
                                if (thisClassName !== className) {
                                    continue;
                                }
                                serviceDataTable[thisServiceName] = null;
                                break;
                            }
                        }
                    }

                    // Loop over services
                    let serviceList = Object.keys(serviceDataTable);
                    for (let i = 0; i < serviceList.length; i++) {
                        let thisServiceName = serviceList[i];
                        // Get Class object data
                        let classMeshPath = `Mesh/Services/${thisServiceName}/Classes/${className}/cache`.split("/");
                        let classListDir = await thisShell.applet.sendCmd("DRP", "pathCmd", { "method": "GetItem", "pathList": classMeshPath }, true);
                        if (classListDir) {
                            serviceDataTable[thisServiceName] = classListDir;
                        }
                    }

                    let output = serviceDataTable;

                    if (doPipeOut) {
                        // Sanitize output by removing terminal control characters
                        //output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                    } else {
                        if (typeof output === "object") {
                            thisShell.term.write(`\x1B[0m${JSON.stringify(output, null, 4).replace(/([^\r])\n/g, "$1\r\n")}\x1B[0m\r\n`);
                        }
                    }

                    return output;
                }

                if ("i" in switchesAndData.switches) {

                    let className = switchesAndData.switches["i"];

                    let serviceClassTable = {};

                    // Query all services with this class
                    let serviceData = await thisShell.applet.sendCmd("DRP", "getServiceDefinitions", null, true);
                    // Loop over nodes
                    let serviceList = Object.keys(serviceData);
                    for (let i = 0; i < serviceList.length; i++) {
                        let thisServiceName = serviceList[i];
                        if (switchesAndData.switches["s"] && switchesAndData.switches["s"] !== thisServiceName) {
                            continue;
                        }
                        let serviceEntry = serviceData[thisServiceName];
                        let classList = Object.keys(serviceEntry.Classes);
                        for (let j = 0; j < classList.length; j++) {
                            let thisClassName = classList[j];
                            if (thisClassName !== className) {
                                continue;
                            }
                            if (!serviceClassTable[thisServiceName]) {
                                serviceClassTable[thisServiceName] = {};
                            }
                            serviceClassTable[thisServiceName][thisClassName] = serviceEntry.Classes[thisClassName];
                            break;
                        }
                    }

                    //let output = classDataTable;
                    let output = "";

                    let headerLabels = ["Attribute", "Stereotype", "Type", "Multiplicity", "Restrictions"];

                    let headerLengths = Object.assign({}, ...headerLabels.map((x) => ({ [x]: x.length })));

                    // Loop over services
                    let classServiceList = Object.keys(serviceClassTable);
                    for (let i = 0; i < classServiceList.length; i++) {
                        let thisServiceName = classServiceList[i];
                        let serviceEntry = serviceClassTable[thisServiceName];
                        let classList = Object.keys(serviceEntry);
                        for (let j = 0; j < classList.length; j++) {
                            let className = classList[j];
                            let classObj = serviceEntry[className];
                            let attributeList = Object.keys(classObj.Attributes);
                            for (let k = 0; k < attributeList.length; k++) {
                                let thisAttributeName = attributeList[k];
                                let thisAttributeObj = classObj.Attributes[thisAttributeName];

                                headerLengths["Attribute"] = Math.max(headerLengths["Attribute"], thisAttributeObj["Name"].length);
                                headerLengths["Stereotype"] = Math.max(headerLengths["Stereotype"], (thisAttributeObj["Stereotype"] || "").length);
                                headerLengths["Type"] = Math.max(headerLengths["Type"], thisAttributeObj["Type"].length);
                                headerLengths["Multiplicity"] = Math.max(headerLengths["Multiplicity"], thisAttributeObj["Multiplicity"].length);
                                headerLengths["Restrictions"] = Math.max(headerLengths["Restrictions"], (thisAttributeObj["Restrictions"] || "").length);
                            }
                        }
                    }

                    // Output Attribute list
                    for (let i = 0; i < classServiceList.length; i++) {
                        let thisServiceName = classServiceList[i];
                        let serviceEntry = serviceClassTable[thisServiceName];
                        let classList = Object.keys(serviceEntry);
                        for (let j = 0; j < classList.length; j++) {
                            let className = classList[j];
                            let classObj = serviceEntry[className];

                            let headerColorCtrl = '\x1B[40;1;95m';
                            output += `\r\n\r\n` +
                                `\x1B[92m${className}\x1B[0m [${thisServiceName}]\x1B[0m\r\n\r\n` +
                                `${headerColorCtrl}${headerLabels[0].padEnd(headerLengths[headerLabels[0]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[1].padEnd(headerLengths[headerLabels[1]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[2].padEnd(headerLengths[headerLabels[2]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[3].padEnd(headerLengths[headerLabels[3]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[4].padEnd(headerLengths[headerLabels[4]], ' ')}\x1B[0m` +
                                `\r\n`;

                            let attributeList = Object.keys(classObj.Attributes);
                            for (let k = 0; k < attributeList.length; k++) {
                                let thisAttributeName = attributeList[k];
                                let thisAttributeObj = classObj.Attributes[thisAttributeName];
                                let thisAttributeText = thisAttributeName.padEnd(headerLengths["Attribute"]);
                                let thisStereotypeText = (thisAttributeObj.Stereotype || "").padEnd(headerLengths["Stereotype"]);
                                let thisTypeText = thisAttributeObj.Type.padEnd(headerLengths["Type"]);
                                let thisMultiplicityText = thisAttributeObj.Multiplicity.padEnd(headerLengths["Multiplicity"]);
                                let thisRestrictionsText = (thisAttributeObj.Restrictions || "").padEnd(headerLengths["Restrictions"]);
                                output += `\x1B[37m${thisAttributeText} \x1B[0;37m${thisStereotypeText}\x1B[0m \x1B[0;37m${thisTypeText}\x1B[0m \x1B[37m${thisMultiplicityText}\x1B[0m ${thisRestrictionsText}\r\n`;
                            }
                        }
                    }

                    if (doPipeOut) {
                        // Sanitize output by removing terminal control characters
                        output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                    } else {
                        thisShell.term.write(output);
                    }

                    return output;
                }

                if ("k" in switchesAndData.switches) {

                    let stereotypeName = switchesAndData.switches["k"];

                    let serviceClassTable = {};

                    // Query all services with this class
                    let serviceData = await thisShell.applet.sendCmd("DRP", "getServiceDefinitions", null, true);
                    // Loop over nodes
                    let serviceList = Object.keys(serviceData);
                    for (let i = 0; i < serviceList.length; i++) {
                        let thisServiceName = serviceList[i];
                        if (switchesAndData.switches["s"] && switchesAndData.switches["s"] !== thisServiceName) {
                            continue;
                        }
                        let serviceEntry = serviceData[thisServiceName];
                        let classList = Object.keys(serviceEntry.Classes);
                        for (let j = 0; j < classList.length; j++) {
                            let thisClassName = classList[j];
                            let classObj = serviceEntry.Classes[thisClassName];
                            let attributeList = Object.keys(classObj.Attributes);
                            for (let k = 0; k < attributeList.length; k++) {
                                let thisAttributeName = attributeList[k];
                                let thisAttributeObj = classObj.Attributes[thisAttributeName];
                                if (thisAttributeObj["Stereotype"] && thisAttributeObj["Stereotype"] === stereotypeName) {
                                    if (!serviceClassTable[thisServiceName]) {
                                        serviceClassTable[thisServiceName] = {};
                                    }
                                    serviceClassTable[thisServiceName][thisClassName] = serviceEntry.Classes[thisClassName];
                                    break;
                                }
                            }
                        }
                    }

                    //let output = classDataTable;
                    let output = "";

                    let headerLabels = ["Attribute", "Stereotype", "Type", "Multiplicity", "Restrictions"];

                    let headerLengths = Object.assign({}, ...headerLabels.map((x) => ({ [x]: x.length })));

                    // Loop over services
                    let classServiceList = Object.keys(serviceClassTable);
                    for (let i = 0; i < classServiceList.length; i++) {
                        let thisServiceName = classServiceList[i];
                        let serviceEntry = serviceClassTable[thisServiceName];
                        let classList = Object.keys(serviceEntry);
                        for (let j = 0; j < classList.length; j++) {
                            let className = classList[j];
                            let classObj = serviceEntry[className];
                            let attributeList = Object.keys(classObj.Attributes);
                            for (let k = 0; k < attributeList.length; k++) {
                                let thisAttributeName = attributeList[k];
                                let thisAttributeObj = classObj.Attributes[thisAttributeName];

                                headerLengths["Attribute"] = Math.max(headerLengths["Attribute"], thisAttributeObj["Name"].length);
                                headerLengths["Stereotype"] = Math.max(headerLengths["Stereotype"], (thisAttributeObj["Stereotype"] || "").length);
                                headerLengths["Type"] = Math.max(headerLengths["Type"], thisAttributeObj["Type"].length);
                                headerLengths["Multiplicity"] = Math.max(headerLengths["Multiplicity"], thisAttributeObj["Multiplicity"].length);
                                headerLengths["Restrictions"] = Math.max(headerLengths["Restrictions"], (thisAttributeObj["Restrictions"] || "").length);
                            }
                        }
                    }

                    // Output Attribute list
                    for (let i = 0; i < classServiceList.length; i++) {
                        let thisServiceName = classServiceList[i];
                        let serviceEntry = serviceClassTable[thisServiceName];
                        let classList = Object.keys(serviceEntry);
                        for (let j = 0; j < classList.length; j++) {
                            let className = classList[j];
                            let classObj = serviceEntry[className];

                            let headerColorCtrl = '\x1B[40;1;95m';
                            output += `\r\n\r\n` +
                                `\x1B[92m${className}\x1B[0m [${thisServiceName}]\x1B[0m\r\n\r\n` +
                                `${headerColorCtrl}${headerLabels[0].padEnd(headerLengths[headerLabels[0]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[1].padEnd(headerLengths[headerLabels[1]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[2].padEnd(headerLengths[headerLabels[2]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[3].padEnd(headerLengths[headerLabels[3]], ' ')}\x1B[0m ` +
                                `${headerColorCtrl}${headerLabels[4].padEnd(headerLengths[headerLabels[4]], ' ')}\x1B[0m` +
                                `\r\n`;

                            let attributeList = Object.keys(classObj.Attributes);
                            for (let k = 0; k < attributeList.length; k++) {
                                let thisAttributeName = attributeList[k];
                                let thisAttributeObj = classObj.Attributes[thisAttributeName];
                                let thisAttributeText = thisAttributeName.padEnd(headerLengths["Attribute"]);
                                let thisStereotypeText = (thisAttributeObj.Stereotype || "").padEnd(headerLengths["Stereotype"]);
                                let thisTypeText = thisAttributeObj.Type.padEnd(headerLengths["Type"]);
                                let thisMultiplicityText = thisAttributeObj.Multiplicity.padEnd(headerLengths["Multiplicity"]);
                                let thisRestrictionsText = (thisAttributeObj.Restrictions || "").padEnd(headerLengths["Restrictions"]);
                                let stereotypeColor = 37;
                                if (thisAttributeObj["Stereotype"] && thisAttributeObj["Stereotype"] === stereotypeName) {
                                    stereotypeColor = 93;
                                }
                                output += `\x1B[37m${thisAttributeText} \x1B[0;${stereotypeColor}m${thisStereotypeText}\x1B[0m \x1B[0;37m${thisTypeText}\x1B[0m \x1B[37m${thisMultiplicityText}\x1B[0m ${thisRestrictionsText}\r\n`;
                            }
                        }
                    }

                    if (doPipeOut) {
                        // Sanitize output by removing terminal control characters
                        output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                    } else {
                        thisShell.term.write(output);
                    }

                    return output;
                }

                thisShell.term.write(thisMethod.ShowHelp());
                return
            }));

        this.AddMethod(new DRPShellMethod("scrollback",
            "Set or get terminal scrollback",
            "[MAXLINES]",
            null,
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let returnObj = null;
                if (switchesAndData.data) {
                    thisShell.term.setOption('scrollback', switchesAndData.data);
                    thisShell.term.write(`\x1B[33mScrollback set to \x1B[0m${switchesAndData.data}\x1B[33m lines.`);
                    thisShell.term.write(`\r\n`);
                } else {
                    let scrollbackLinesCount = thisShell.term.getOption('scrollback');
                    thisShell.term.write(`\x1B[33mScrollback currently \x1B[0m${scrollbackLinesCount}\x1B[33m lines.`);
                    thisShell.term.write(`\r\n`);
                }
                return returnObj;
            }));

        this.AddMethod(new DRPShellMethod("grep",
            "Grep piped contents or path",
            "[OPTIONS]...",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help"),
                "i": new DRPShellMethodSwitch("i", null, "Case Insensitive"),
                "v": new DRPShellMethodSwitch("v", null, "Select non-matching lines"),
                "n": new DRPShellMethodSwitch("n", null, "Output line number"),
                "B": new DRPShellMethodSwitch("B", "integer", "Print lines before match"),
                "A": new DRPShellMethodSwitch("A", "integer", "Print lines after match"),
                "C": new DRPShellMethodSwitch("C", "integer", "Print lines before and after match")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";
                let printingContext = false;
                let switchA = Number.parseInt(switchesAndData.switches["A"]) || 0;
                let switchB = Number.parseInt(switchesAndData.switches["B"]) || 0;
                let switchC = Number.parseInt(switchesAndData.switches["C"]) || 0;
                let contextLinesBefore = Math.max(switchB, switchC) || 0;
                let contextLinesAfter = Math.max(switchA, switchC) || 0;

                if (contextLinesBefore || contextLinesAfter) {
                    printingContext = true;
                }

                // Function to output line
                let printLine = (inputLine, matchLine, lineNumber) => {
                    let returnLine = '';
                    let outputLineNumber = '';
                    if ("n" in switchesAndData.switches) {
                        outputLineNumber += `\x1b\[92m${lineNumber}\x1b\[0m`;
                        if (matchLine) {
                            outputLineNumber += `\x1b\[94m:\x1b\[0m`;
                        } else {
                            outputLineNumber += `\x1b\[94m-\x1b\[0m`;
                        }
                    }
                    if (matchLine) {
                        returnLine = `${outputLineNumber}\x1b\[93m${inputLine}\x1b\[0m\r\n`;
                    } else {
                        returnLine = `${outputLineNumber}\x1b\[97m${inputLine}\x1b\[0m\r\n`;
                    }
                    return returnLine;
                }

                // If any context switches specified, insert '--' between matching sections

                let linesPrinted = [];
                let grepData = null;
                if ("h" in switchesAndData.switches || !pipeDataIn) {
                    thisShell.term.write(thisMethod.ShowHelp());
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
                    let lineMatches = checkRegEx.test(cleanLine);
                    let doInvert = ("v" in switchesAndData.switches);
                    if ((lineMatches && !doInvert) || (!lineMatches && doInvert)) {
                        // We need to print this line

                        if (printingContext && linesPrinted.length) {

                            // Get the last line we printed
                            let lastPrintedLine = linesPrinted[linesPrinted.length - 1];

                            // Did we hit a break between sections?
                            if (i > lastPrintedLine + 1) {

                                // We've already printed a section, add a break
                                output += `\x1b\[94m--\x1b\[0m\r\n`;
                            }
                        }

                        // Are we printing context before?
                        if (contextLinesBefore) {
                            // Calculate the starting and ending lines
                            let linesToFetch = Math.min(contextLinesBefore, i);
                            for (let j = linesToFetch; j > 0; j--) {
                                let targetLine = i - j;
                                if (!linesPrinted.includes(targetLine)) {
                                    let cleanLine = lineArray[targetLine].replace('\r', '');
                                    output += printLine(cleanLine, false, targetLine);
                                    linesPrinted.push(targetLine);
                                }
                            }
                        }

                        // If we've already printed this line, skip
                        if (!linesPrinted.includes(i)) {
                            output += printLine(cleanLine, true, i);
                            linesPrinted.push(i);
                        }

                        // Are we printing context after?
                        if (contextLinesAfter) {
                            // Calculate the starting and ending lines

                            /**
                             * 
                             * length = 10
                             * linesAfter = 5
                             * i = 6 (7th line, only 3 left)
                             * 
                             * */

                            let linesToFetch = Math.min(contextLinesAfter, lineArray.length - (i + 1));
                            for (let j = 1; j <= linesToFetch; j++) {
                                let targetLine = i + j;
                                if (!linesPrinted.includes(targetLine)) {
                                    let cleanLine = lineArray[targetLine].replace('\r', '');
                                    // Need to eval; possible this is a matching line
                                    let matchingLine = checkRegEx.test(cleanLine);
                                    output += printLine(cleanLine, doPipeOut, matchingLine, targetLine);
                                    linesPrinted.push(targetLine);
                                }
                            }
                        }
                    }
                }
                output = output.replace(/\r\n$/, '');

                if (doPipeOut) {
                    // Sanitize output by removing terminal control characters
                    output = output.replace(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g, '');
                } else {
                    thisShell.term.write(output);
                }

                return output;
            }));

        this.AddMethod(new DRPShellMethod("head",
            "Output first 10 lines of piped contents or path",
            "[OPTIONS]...",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help"),
                "n": new DRPShellMethodSwitch("n", "integer", "Number of lines")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";
                let headData = null;
                if ("h" in switchesAndData.switches || (!switchesAndData.data && !pipeDataIn)) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }
                if (typeof pipeDataIn === 'string') {
                    headData = pipeDataIn;
                } else {
                    headData = JSON.stringify(pipeDataIn, null, 2);
                }
                let lineArray = headData.split('\n');
                let lineFetchCount = 10;
                if (switchesAndData.switches["n"]) {
                    lineFetchCount = Number.parseInt(switchesAndData.switches["n"]);
                } else {
                    let switchRegEx = /^-([\d]+)/;
                    let switchDataMatch = switchesAndDataString.match(switchRegEx);
                    if (switchDataMatch) {
                        lineFetchCount = switchDataMatch[1];
                    }
                }

                if (typeof lineFetchCount === "string") {
                    try {
                        lineFetchCount = Number.parseInt(lineFetchCount);
                    } catch (ex) {
                        thisShell.term.write(thisMethod.ShowHelp());
                        return
                    }
                }

                if (lineArray.length < lineFetchCount) {
                    // There are fewer lines than we want to get
                    lineFetchCount = lineArray.length;
                }
                for (let i = 0; i < lineFetchCount; i++) {
                    let cleanLine = lineArray[i].replace('\r', '');
                    if (doPipeOut) {
                        output += `${cleanLine}\r\n`;
                    } else {
                        thisShell.term.write(`${cleanLine}\r\n`);
                    }
                }
                return output;
            }));


        this.AddMethod(new DRPShellMethod("tail",
            "Output last 10 lines of piped contents or path",
            "[OPTIONS]...",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help"),
                "n": new DRPShellMethodSwitch("n", "integer", "Number of lines")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";
                let tailData = null;
                if ("h" in switchesAndData.switches || (!switchesAndData.data && !pipeDataIn)) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }
                if (typeof pipeDataIn === 'string') {
                    tailData = pipeDataIn;
                } else {
                    tailData = JSON.stringify(pipeDataIn, null, 2);
                }
                let lineArray = tailData.split('\n');
                let lineFetchCount = 10;
                if (switchesAndData.switches["n"]) {
                    lineFetchCount = Number.parseInt(switchesAndData.switches["n"]);
                } else {
                    let switchRegEx = /^-([\d]+)/;
                    let switchDataMatch = switchesAndDataString.match(switchRegEx);
                    if (switchDataMatch) {
                        lineFetchCount = switchDataMatch[1];
                    }
                }

                if (typeof lineFetchCount === "string") {
                    try {
                        lineFetchCount = Number.parseInt(lineFetchCount);
                    } catch (ex) {
                        thisShell.term.write(thisMethod.ShowHelp());
                        return
                    }
                }

                let lineStart = 0;

                if (lineArray.length < lineFetchCount) {
                    // There are fewer lines than we want to get
                    lineFetchCount = lineArray.length;
                } else {
                    lineStart = lineArray.length - lineFetchCount;
                }

                for (let i = lineStart; i < lineFetchCount + lineStart; i++) {
                    let cleanLine = lineArray[i].replace('\r', '');
                    if (doPipeOut) {
                        output += `${cleanLine}\r\n`;
                    } else {
                        thisShell.term.write(`${cleanLine}\r\n`);
                    }
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("set",
            "Set or list shell ENV variables",
            "[VARIABLE]=[VALUE]",
            { "h": new DRPShellMethodSwitch("h", null, "Help menu") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                if (switchesAndData.data) {
                    // The a parameter name (possibly value) is present
                    // Was a value passed as well?  If not, did we get pipeDataIn?
                    if (switchesAndData.data.indexOf('=') > 0) {
                        let varName = switchesAndData.data.substr(0, switchesAndData.data.indexOf('='));
                        let varValue = switchesAndData.data.substr(switchesAndData.data.indexOf('=') + 1);
                        thisShell.shellVars[varName] = varValue;
                    } else {
                        let varName = switchesAndData.data;
                        if (pipeDataIn) {
                            thisShell.shellVars[varName] = pipeDataIn;
                        } else {
                            delete thisShell.shellVars[varName];
                        }
                    }
                } else {
                    // No ENV variable name provided, list all variables and values
                    output += `\x1B[33mShell variables:\x1B[0m\r\n`;
                    let shellVarNames = Object.keys(thisShell.shellVars);
                    for (let i = 0; i < shellVarNames.length; i++) {
                        let printVal = "";
                        let varValue = thisShell.shellVars[shellVarNames[i]];
                        let varType = Object.prototype.toString.call(varValue).match(/^\[object (.*)\]$/)[1];

                        switch (varType) {
                            case "Object":
                                printVal = `[${varType}:${Object.keys(varValue).length}]`;
                                break;
                            case "Array":
                                printVal = `[${varType}:${varValue.length}]`;
                                break;
                            case "Set":
                                printVal = `[${varType}:${varValue.size}]`;
                                break;
                            case "Function":
                                printVal = `[${varType}]`;
                                break;
                            case "String":
                                printVal = JSON.stringify(varValue.substr(0, 60));
                                break;
                            default:
                                returnVal = varType;
                        }
                        output += `${shellVarNames[i]}=${printVal}\r\n`;
                    }
                }
                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("echo",
            "Output data",
            "[OUTPUT]",
            { "h": new DRPShellMethodSwitch("h", null, "Help menu") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                output += switchesAndData.data;

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("ping",
            "Ping a host",
            "[HOSTNAME or IP]",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help menu"),
                "c": new DRPShellMethodSwitch("c", "integer", "Number of requests to send"),
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }
                if (!switchesAndData.data) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                let pingResults = await thisShell.applet.sendCmd("DRP", "ping", {
                    host: switchesAndData.data,
                    min_reply: switchesAndData.switches["c"] || 4
                }, true);
                output = pingResults.output.replace(/\r?\n/g, "\r\n");

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("resolve",
            "Resolve a host",
            "[HOSTNAME]",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help menu"),
                "t": new DRPShellMethodSwitch("t", "string", "Record type (A,CNAME,SRV,...)"),
                "s": new DRPShellMethodSwitch("s", "string", "DNS server")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }
                if (!switchesAndData.data) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                let resolveResults = await thisShell.applet.sendCmd("DRP", "resolve", {
                    hostname: switchesAndData.data,
                    type: switchesAndData.switches["t"] || "A",
                    server: switchesAndData.switches["s"] || ""
                }, true);
                output = JSON.stringify(resolveResults, null, 4).replace(/\r?\n/g, "\r\n");

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("jsonpath",
            "Retrieve data from JSON object",
            "[OPTIONS]",
            { "q": new DRPShellMethodSwitch("q", "string", "JSONPath query") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                let inputObj = switchesAndData.data || pipeDataIn;

                if (typeof inputObj === "string") {
                    // Try to parse as JSON
                    try {
                        inputObj = JSON.parse(inputObj);
                    } catch (ex) {
                        thisShell.term.write(`\x1B[91mInput could not be parsed as JSON:\x1B[0m\r\n\x1B[37m${inputObj}\x1B[0m\r\n`);
                        return
                    }
                }

                if ("h" in switchesAndData.switches || !inputObj) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                let jsonPathQuery = switchesAndData.switches["q"];
                jsonPathQuery = jsonPathQuery.replace(/^"|"$/g, '');
                jsonPathQuery = jsonPathQuery.replace(/^'|'$/g, '');

                output = JSON.stringify(jsonPath(inputObj, jsonPathQuery), null, 4).replace(/\r?\n/g, "\r\n");

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("colors",
            "Show terminal color test pattern",
            "",
            { "h": new DRPShellMethodSwitch("h", null, "Help menu") },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                for (let i = 0; i < 100; i++) {
                    output += `\x1B[${i}m${i}\x1B[0m `;
                    if (i % 10 === 9) {
                        output += `\r\n`;
                    }
                }

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.EnableUploads();
        this.AddMethod(new DRPShellMethod("upload",
            "Upload data for processing",
            "",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help menu"),
                "j": new DRPShellMethodSwitch("j", null, "Convert JSON to object")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);
                let output = "";

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                // WAIT FOR DATA TO BE UPLOADED
                thisShell.ShowUploadDiv();

                try {
                    let uploadData = await new Promise(function (resolve, reject) {
                        thisShell.uploadPendingPromise = function (message, cancelled) {
                            if (cancelled) {
                                reject();
                            } else {
                                resolve(message);
                            }
                        };
                    });
                    if ("j" in switchesAndData.switches) {
                        // Convert JSON to object
                        output = JSON.parse(uploadData);
                    } else {
                        output = uploadData;
                    }
                } catch (ex) {
                    // Must have cancelled operation
                    let thisError = ex;
                }

                if (!doPipeOut) {
                    thisShell.term.write(output);
                }
                return output;
            }));

        this.AddMethod(new DRPShellMethod("logout",
            "Log out of DRP Desktop",
            "",
            {
                "h": new DRPShellMethodSwitch("h", null, "Help menu")
            },
            async (thisMethod, switchesAndDataString, doPipeOut, pipeDataIn) => {
                let switchesAndData = thisShell.ParseSwitchesAndData(thisMethod, switchesAndDataString);

                if ("h" in switchesAndData.switches) {
                    thisShell.term.write(thisMethod.ShowHelp());
                    return
                }

                // Run logout
                thisShell.applet.vdmSession.drpClient.eraseCookie('x-api-token');
                thisShell.applet.vdmSession.drpClient.Disconnect();
            }));

        thisShell.ShowGreeting();
    }

    async ShowGreeting() {
        let thisShell = this;
        thisShell.UserInfo = await thisShell.applet.sendCmd("DRP", "getUserInfo", null, true);
        thisShell.term.write(`\x1B[2K\r\x1B[97mWelcome to the DRP Shell, \x1B[33m${thisShell.UserInfo.UserName}`);
        thisShell.term.write(`\r\n`);
        thisShell.WriteNewPrompt();
    }

    EnableUploads() {
        let thisShell = this;
        this.fitaddon.fit();

        this.term.focus();

        // Add the drop window
        let dropWindowDiv = document.createElement('div');
        dropWindowDiv.tabIndex = 991;
        dropWindowDiv.className = "uploadDiv";
        dropWindowDiv.style = `position: absolute;left: 0px;top: 0px;width: 100%;height: 100%;`;

        let dropWindowP = document.createElement('p');
        dropWindowP.style = "margin: 0; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; font-size: x-large; line-height: normal; color: forestgreen;";
        dropWindowP.innerHTML = "Drag and drop file here<br>(or press ESC)";
        dropWindowDiv.appendChild(dropWindowP);

        dropWindowDiv.ondragover = function (event) {
            event.preventDefault();
            dropWindowDiv.style["background-color"] = thisShell.hoverbgcolor;
        }

        dropWindowDiv.ondragleave = function (event) {
            event.preventDefault();
            dropWindowDiv.style["background-color"] = thisShell.normalbgcolor;
        }

        dropWindowDiv.ondrop = function (event) {
            event.preventDefault();
            thisShell.HideUploadDiv();

            let fileRecord = event.dataTransfer.files[0];
            let fileReader = new FileReader();
            fileReader.onload = function (event) {
                thisShell.uploadPendingPromise(event.target.result, false);
            };
            fileReader.readAsBinaryString(fileRecord);
        };

        dropWindowDiv.onkeyup = (e) => {
            let charCode = e.key.charCodeAt(0);
            let code2 = e.key.charCodeAt(1);
            let code3 = e.key.charCodeAt(2);
            switch (e.key) {
                case "Escape":
                    // Escape
                    thisShell.HideUploadDiv();
                    thisShell.uploadPendingPromise(null, true);
                    break;
                default:
            }
        };

        thisShell.dropWindowDiv = dropWindowDiv;
        thisShell.HideUploadDiv();

        thisShell.termDiv.appendChild(dropWindowDiv);
    }

    ShowUploadDiv() {
        let thisShell = this;
        thisShell.dropWindowDiv.style["background-color"] = thisShell.normalbgcolor;
        thisShell.dropWindowDiv.style["z-index"] = 3;
        thisShell.dropWindowDiv.style["opacity"] = 0.7;
        thisShell.dropWindowDiv.focus();
    }

    HideUploadDiv() {
        let thisShell = this;
        thisShell.dropWindowDiv.style["background-color"] = thisShell.normalbgcolor;
        thisShell.dropWindowDiv.style["z-index"] = -1;
        thisShell.dropWindowDiv.style["opacity"] = 0;
        thisShell.term.focus();
    }

    WriteNewPrompt(supressNewline) {
        if (!supressNewline) this.term.write('\n');
        this.term.write('\x1B[2K\r\x1B[95mdsh>\x1B[0m ');
    }

    EvaluateStringForVariables(evalString) {
        let thisShell = this;

        // If the string matches a single variable, return that first - necessary for objects
        // Otherwise we'll need to evalute as a concatenated string
        if (!evalString) return evalString;

        // Remove leading and trailing whitespace
        evalString = evalString.replace(/^\s+|\s+$/g, '');
        if (!evalString) return evalString;

        /** Single Variable Match */
        let singleVarRegEx = /^\$(\w+)$/;
        let singleVarMatch = evalString.match(singleVarRegEx);
        if (singleVarMatch) {
            let varName = singleVarMatch[1];
            let replaceValue = "";
            if (thisShell.shellVars[varName]) {
                replaceValue = thisShell.shellVars[varName];
            }
            return replaceValue;
        }

        /** Multiple Variable Match */
        let envVarRegEx = /\$(\w+)/g;
        let envVarMatch;
        while (envVarMatch = envVarRegEx.exec(evalString)) {
            let varName = envVarMatch[1];
            let replaceValue = "";
            // Does the variable exist?
            if (thisShell.shellVars[varName]) {
                let varValue = thisShell.shellVars[varName];
                let varType = typeof varValue;
                if (varType === "object" || ((varType === "string") && (varValue.match(/\n/)))) {
                    // Don't actually replace the variable
                    replaceValue = '$' + varName;
                } else {
                    // Replace with contents of the variable
                    replaceValue = thisShell.shellVars[varName];
                }
            }
            evalString = evalString.replace('$' + varName, replaceValue);
        }

        return evalString;
    }

    ParseSwitchesAndData(shellMethod, switchesAndData, skipVarEval) {
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

        /** List containing  */
        let switchDataRegExList = [];
        if (shellMethod.switches) {
            let switchList = Object.keys(shellMethod.switches);
            for (let i = 0; i < switchList.length; i++) {
                let thisSwitchDataRegEx;
                let thisParameter = shellMethod.switches[switchList[i]];
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
                    let varName = switchMatch[1];
                    let varValue = switchMatch[2] || null;
                    if (skipVarEval) {
                        switchHash[varName] = varValue;
                    } else {
                        switchHash[varName] = this.EvaluateStringForVariables(varValue);
                    }
                }
                returnObj.switches = switchHash;
                if (skipVarEval) {
                    returnObj.data = switchDataMatch[2] || "";
                } else {
                    returnObj.data = this.EvaluateStringForVariables(switchDataMatch[2]) || "";
                }
            }
        } catch (ex) {
            let ted = 1;
        }
        return returnObj;
    }

    async ProcessLineBuffer() {
        let thisShell = this;
        if (thisShell.lineBuffer.length > 0) {
            // Add to lineBufferHistory
            thisShell.lineBufferHistory.unshift(thisShell.lineBuffer);
            // If the buffer is full, pop the last one
            if (thisShell.lineBufferHistory.length > 100) {
                thisShell.lineBufferHistory.pop();
            }
            let execLine = thisShell.lineBuffer;
            thisShell.lineBuffer = "";
            await this.ExecuteCLICommand(execLine);
        }
        thisShell.lineCursorIndex = 0;
        thisShell.scrollbackIndex = 0;
        this.WriteNewPrompt();
    }

    async ProcessPaste() {
        let thisShell = this;
        // Ctrl-V
        let clipboardText = await navigator.clipboard.readText();

        // Split on newlines
        let lineArray = clipboardText.split(/\r?\n/);
        for (let lineIdx = 0; lineIdx < lineArray.length; lineIdx++) {
            thisShell.InsertString(lineArray[lineIdx]);
            if (lineIdx + 1 < lineArray.length) {
                await thisShell.ProcessLineBuffer();
            }
        }
    }

    // Newlines should be removed before this is executed
    InsertString(newText) {
        let thisShell = this;
        if (thisShell.lineCursorIndex < thisShell.lineBuffer.length) {
            if (thisShell.insertMode) {
                // Insert char at index
                let part1 = thisShell.lineBuffer.substr(0, thisShell.lineCursorIndex);
                let part2 = thisShell.lineBuffer.substr(thisShell.lineCursorIndex);
                thisShell.lineBuffer = part1 + newText + part2;
                thisShell.term.write(newText);
                thisShell.term.write(part2 + " ");
                let goBackString = "\b";
                for (let i = 0; i < part2.length; i++) {
                    goBackString = goBackString + "\b";
                }
                thisShell.term.write(goBackString);
            } else {
                // Replace char at index
                thisShell.lineBuffer = thisShell.lineBuffer.substr(0, thisShell.lineCursorIndex) + newText + thisShell.lineBuffer.substr(thisShell.lineCursorIndex + newText.length);
                tthisShell.term.write(newText);
            }
        } else {
            thisShell.lineBuffer += newText;
            thisShell.term.write(newText);
        }
        thisShell.lineCursorIndex += newText.length;
    }

    /**
     * Add Method
     * @param {DRPShellMethod} methodObject
     */
    AddMethod(methodObject) {
        this.drpMethods[methodObject.name] = methodObject;
        //methodObject.shell = this;
    }

    async ExecuteCLICommand(commandLine) {
        let thisShell = this;
        let pipeData = null;
        thisShell.term.write(`\r\n`);

        let cmdArray = commandLine.split(" | ");
        for (let i = 0; i < cmdArray.length; i++) {
            let cmdParts = cmdArray[i].match(/^(\S*)(?: (.*))?$/);
            if (cmdParts) {
                let methodName = cmdParts[1];

                // Replace aliases
                if (thisShell.aliases && thisShell.aliases[methodName]) {
                    methodName = thisShell.aliases[methodName]
                }

                let switchesAndData = cmdParts[2] || "";
                let doPipeOut = (i + 1 < cmdArray.length);
                let pipeDataIn = pipeData;
                pipeData = "";

                try {
                    // See if the method is actually a service and method name combo
                    if (cmdArray[i].match(/^(\w+)\.(\w+)\((.*)\)$/)) {
                        // This is a direct function call
                        methodName = "exec";
                        switchesAndData = cmdArray[i];
                    }

                    let targetMethod = thisShell.drpMethods[methodName];

                    if (!targetMethod) {
                        // Write error to terminal; unknown method
                        thisShell.term.write(`\x1B[91mInvalid command [${methodName}]\x1B[0m`);
                        thisShell.term.write(`\r\n`);
                        return;
                    }
                    pipeData = await targetMethod.execute(targetMethod, switchesAndData, doPipeOut, pipeDataIn);

                } catch (ex) {
                    let outputMessage = ex;
                    if (ex.message) {
                        outputMessage = ex.message;
                    }
                    thisShell.term.write(`\x1B[91mError executing command [${methodName}]: ${outputMessage}\x1B[0m\r\n`);
                    break;
                }
            }
        }
    }
}

/* JSONPath 0.8.0 - XPath for JSON
 *
 * Copyright (c) 2007 Stefan Goessner (goessner.net)
 * Licensed under the MIT (MIT-LICENSE.txt) licence.
 */
let jsonPath = function (obj, expr, arg) {
    var P = {
        resultType: arg && arg.resultType || "VALUE",
        result: [],
        normalize: function (expr) {
            var subx = [];
            return expr.replace(/[\['](\??\(.*?\))[\]']/g, function ($0, $1) { return "[#" + (subx.push($1) - 1) + "]"; })
                .replace(/'?\.'?|\['?/g, ";")
                .replace(/;;;|;;/g, ";..;")
                .replace(/;$|'?\]|'$/g, "")
                .replace(/#([0-9]+)/g, function ($0, $1) { return subx[$1]; });
        },
        asPath: function (path) {
            var x = path.split(";"), p = "$";
            for (var i = 1, n = x.length; i < n; i++)
                p += /^[0-9*]+$/.test(x[i]) ? ("[" + x[i] + "]") : ("['" + x[i] + "']");
            return p;
        },
        store: function (p, v) {
            if (p) P.result[P.result.length] = P.resultType == "PATH" ? P.asPath(p) : v;
            return !!p;
        },
        trace: function (expr, val, path) {
            if (expr) {
                var x = expr.split(";"), loc = x.shift();
                x = x.join(";");
                if (val && val.hasOwnProperty(loc))
                    P.trace(x, val[loc], path + ";" + loc);
                else if (loc === "*")
                    P.walk(loc, x, val, path, function (m, l, x, v, p) { P.trace(m + ";" + x, v, p); });
                else if (loc === "..") {
                    P.trace(x, val, path);
                    P.walk(loc, x, val, path, function (m, l, x, v, p) { typeof v[m] === "object" && P.trace("..;" + x, v[m], p + ";" + m); });
                }
                else if (/,/.test(loc)) { // [name1,name2,...]
                    for (var s = loc.split(/'?,'?/), i = 0, n = s.length; i < n; i++)
                        P.trace(s[i] + ";" + x, val, path);
                }
                else if (/^\(.*?\)$/.test(loc)) // [(expr)]
                    P.trace(P.eval(loc, val, path.substr(path.lastIndexOf(";") + 1)) + ";" + x, val, path);
                else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
                    P.walk(loc, x, val, path, function (m, l, x, v, p) { if (P.eval(l.replace(/^\?\((.*?)\)$/, "$1"), v[m], m)) P.trace(m + ";" + x, v, p); });
                else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) // [start:end:step]  phyton slice syntax
                    P.slice(loc, x, val, path);
            }
            else
                P.store(path, val);
        },
        walk: function (loc, expr, val, path, f) {
            if (val instanceof Array) {
                for (var i = 0, n = val.length; i < n; i++)
                    if (i in val)
                        f(i, loc, expr, val, path);
            }
            else if (typeof val === "object") {
                for (var m in val)
                    if (val.hasOwnProperty(m))
                        f(m, loc, expr, val, path);
            }
        },
        slice: function (loc, expr, val, path) {
            if (val instanceof Array) {
                var len = val.length, start = 0, end = len, step = 1;
                loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, function ($0, $1, $2, $3) { start = parseInt($1 || start); end = parseInt($2 || end); step = parseInt($3 || step); });
                start = (start < 0) ? Math.max(0, start + len) : Math.min(len, start);
                end = (end < 0) ? Math.max(0, end + len) : Math.min(len, end);
                for (var i = start; i < end; i += step)
                    P.trace(i + ";" + expr, val, path);
            }
        },
        eval: function (x, _v, _vname) {
            try { return $ && _v && eval(x.replace(/@/g, "_v")); }
            catch (e) { throw new SyntaxError("jsonPath: " + e.message + ": " + x.replace(/@/g, "_v").replace(/\^/g, "_a")); }
        }
    };

    var $ = obj;
    if (expr && obj && (P.resultType == "VALUE" || P.resultType == "PATH")) {
        P.trace(P.normalize(expr).replace(/^\$;/, ""), obj, "$");
        return P.result.length ? P.result : false;
    }
}

let AppletProfile = {
    "appletName": "DRPShell",
    "title": "DRP Shell",
    "sizeX": 740,
    "sizeY": 442,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preloadDeps": true,
    "dependencies": [
        { "JS": "assets/xterm/lib/xterm.js" },
        { "JS": "assets/xterm/lib/xterm-addon-fit.js" },
        { "CSS": "assets/xterm/css/xterm.css" }
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-DRPShell.js