(class extends rSageApplet {
    constructor(appletProfile, vdmClient) {
        super(appletProfile, vdmClient);
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
            execDRPShell: async (term, commandLine) => {
                //term.write(`\r\nRunning command >>>${commandLine}<<<`);
                term.write(`\r\n`);
                let cmdParts = commandLine.match(/^(\S*)(?: (.*))?$/);
                if (cmdParts) {
                    let cmdVerb = cmdParts[1];
                    let cmdParams = cmdParts[2] || "";
                    let results = null;
                    let pathList = [];
                    //console.dir({ cmdVerb: cmdVerb, cmdParams: cmdParams });
                    try {
                        switch (cmdVerb) {
                            case '?':
                            case 'help':
                                //term.write(`\x1B[0mDRP Shell commands:\x1B[0m\r\n`);
                                ['help', 'ls', 'cat', 'clear', 'topology', 'whoami', 'token', 'endpointid'].forEach(thisCmd => {
                                    term.write(`\x1B[95m  ${thisCmd}\x1B[0m\r\n`);
                                });
                                break;
                            case 'cls':
                            case 'clear':
                                term.clear();
                                break;
                            case 'ls':
                            case 'dir':
                                if (cmdParams.length > 0) pathList = cmdParams.split(/[\/\\]/g);

                                // Remove leading empty entries
                                while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                                // Remove trailing empty entries
                                while (pathList.length > 0 && pathList[pathList.length-1] === "") pathList.pop();

                                results = await myApp.sendCmd("DRP", "pathCmd", { pathList: pathList, listOnly: true }, true);
                                if (results && results.pathItemList && results.pathItemList.length > 0) {
                                    // We have a directory listing
                                    for (let i = 0; i < results.pathItemList.length; i++) {
                                        let entryObj = results.pathItemList[i];
                                        switch (entryObj.Type) {
                                            case 'Boolean':
                                            case 'Number':
                                            case 'String':
                                                term.write(`\x1B[0m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\t${entryObj.Value}\x1B[0m\r\n`);
                                                break;
                                            case 'Function':
                                            case 'AsyncFunction':
                                                term.write(`\x1B[92m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\x1B[0m\r\n`);
                                                break;
                                            default:
                                                // Must be some sort of object
                                                term.write(`\x1B[1;34m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\x1B[0;0m\r\n`);
                                                break;
                                        }
                                    }
                                } else {
                                    term.write(`\x1B[31mNo results\x1B[0m`);
                                }
                                break;
                            case 'gi':
                            case 'cat':
                                if (cmdParams.length > 0) pathList = cmdParams.split(/[\/\\]/g);

                                // Remove leading empty entries
                                while (pathList.length > 0 && pathList[0] === "") pathList.shift();

                                // Remove trailing empty entries
                                while (pathList.length > 0 && pathList[pathList.length - 1] === "") pathList.pop();

                                if (pathList.length === 0) {
                                    // Error
                                    term.write(`\x1B[31mNo target specified\x1B[0m\r\n`);
                                    break;
                                }

                                results = await myApp.sendCmd("DRP", "pathCmd", { pathList: pathList, listOnly: false }, true);
                                if (typeof results === "string") {
                                    // Error
                                    term.write(`\x1B[31m${results}\x1B[0m\r\n`);
                                } else if (results && results.pathItem) {
                                    // Have pathItem
                                    if (typeof results.pathItem === "object") {
                                        term.write(`\x1B[0m${JSON.stringify(results.pathItem, null, 4).replace(/\n/g, "\r\n")}\x1B[0m\r\n`);
                                    } else {
                                        term.write(`\x1B[0m${results.pathItem}\x1B[0m\r\n`);
                                    }
                                } else {
                                    term.write(`\x1B[0m${results}\x1B[0m\r\n`);
                                }
                                /*
                                if (results && results.pathItemList && results.pathItemList.length > 0) {
                                    // We have a directory listing
                                    for (let i = 0; i < results.pathItemList.length; i++) {
                                        let entryObj = results.pathItemList[i];
                                        switch (entryObj.Type) {
                                            case 'Boolean':
                                            case 'Number':
                                            case 'String':
                                                term.write(`\x1B[0m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\t${entryObj.Value}\x1B[0m\r\n`);
                                                break;
                                            case 'Function':
                                            case 'AsyncFunction':
                                                term.write(`\x1B[32m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\x1B[0m\r\n`);
                                                break;
                                            default:
                                                // Must be some sort of object
                                                term.write(`\x1B[34m${entryObj.Name.padEnd(24)}\t${entryObj.Type.padEnd(16)}\x1B[0m\r\n`);
                                                break;
                                        }
                                    }
                                } else {
                                    term.write(`\x1B[31mNo results\x1B[0m`);
                                }
                                */
                                break;
                            case 'topology':
                                results = await myApp.sendCmd("DRP", "getTopology", null, true);
                                //term.write(`\x1B[32m${JSON.stringify(results)}\x1B[0m`);
                                term.write(`\x1B[36m${JSON.stringify(results, null, 4).replace(/\n/g, "\r\n")}\x1B[0m\r\n`);
                                break;
                            case 'whoami':
                                term.write(`\x1B[33mUserName: \x1B[0m${myApp.appVars.UserInfo.UserName}`);
                                term.write(`\r\n\x1B[33mFullName: \x1B[0m${myApp.appVars.UserInfo.FullName}`);
                                term.write(`\r\n\x1B[33mGroups: \x1B[0m${myApp.appVars.UserInfo.Groups.join(',')}`);
                                term.write(`\r\n`);
                                //term.write(`\x1B[36m${JSON.stringify(myApp.appVars.UserInfo, null, 4).replace(/\n/g, "\r\n")}\x1B[0m\r\n`);
                                break;
                            case 'token':
                                term.write(`\x1B[33mToken: \x1B[0m${myApp.appVars.UserInfo.Token}`);
                                term.write(`\r\n`);
                                break;
                            case 'endpointid':
                                term.write(`\x1B[33mEndpointID: \x1B[0m${myApp.appVars.EndpointID}`);
                                term.write(`\r\n`);
                                break;
                            default:
                                term.write(`\x1B[31mInvalid command [${cmdVerb}]\x1B[0m`);
                                term.write(`\r\n`);
                                break;
                        }
                    } catch (ex) {
                        term.write(`\x1B[31mError executing command [${cmdVerb}]: ${ex}\x1B[0m\r\n`);
                    }
                }
            }
        };

        myApp.appVars = {
            dataStructs: {},
            term: null,
            termDiv: null
        };

        myApp.recvCmd = {
        };
    }

    async runStartup() {
        let myApp = this;

        myApp.appVars.termDiv = myApp.windowParts["data"];
        let term = new Terminal();
        myApp.appVars.term = term;
        myApp.appVars.fitaddon = new FitAddon.FitAddon();
        term.loadAddon(myApp.appVars.fitaddon);
        term.open(myApp.appVars.termDiv);
        term.setOption('cursorBlink', true);
        term.setOption('bellStyle', 'sound');
        //term.write('Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ');

        let writeNewPrompt = (supressNewline) => {
            if (!supressNewline) term.write('\n');
            term.write('\x1B[2K\r\x1B[95mdsh>\x1B[0m ');
        };

        let lineBufferHistory = [];
        let lineBuffer = "";
        let lineCursorIndex = 0;
        let scrollbackIndex = 0;
        let insertMode = true;

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
            console.log(`${charCode}, ${code2}, ${code3}`);
            //console.log(charCode);
            switch (charCode) {
                case 3:
                    // Ctrl-C
                    navigator.clipboard.writeText(term.getSelection());
                    /*
                    lineBuffer = "";
                    lineCursorIndex = 0;
                    scrollbackIndex = 0;
                    term.write("^C");
                    writeNewPrompt();
                    */
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
                        await myApp.appFuncs.execDRPShell(term, lineBuffer);
                    }
                    lineBuffer = "";
                    lineCursorIndex = 0;
                    scrollbackIndex = 0;
                    writeNewPrompt();
                    break;
                case 27:
                    // Special character
                    //term.write("\b ");
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
                            console.log(`ScrollbackIndex -> ${scrollbackIndex}`);
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
                            console.log(`ScrollbackIndex -> ${scrollbackIndex}`);
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

        /*
        term.textarea.onkeypress = function (e) {
            term.write(String.fromCharCode(e.keyCode));
        };
        */
        myApp.resizeMovingHook = function () {
            myApp.appVars.fitaddon.fit();
        };

        myApp.appVars.fitaddon.fit();
    }
});
//# sourceURL=vdm-app-DRPShell.js