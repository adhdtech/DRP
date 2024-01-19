class AppletClass extends DRPApplet {
    constructor(appletProfile, startupParams) {
        super(appletProfile);
        let thisApplet = this;

        thisApplet.startupParams = startupParams

        if (startupParams) {
            // Override Title
            thisApplet.title += ` - ${startupParams.topicName} (${startupParams.scope})`;
            if (startupParams.targetNodeID) {
                thisApplet.title += ` @ ${startupParams.targetNodeID}`;
            }
            if (startupParams.singleInstance) {
                thisApplet.title += `, single instance`;
            }
        }

        // Dropdown menu items
        thisApplet.menu = {
            "Stream": {
                "Stop": () => {
                    thisApplet.StopStream();
                },
                "Start": () => {
                    thisApplet.StartStream();
                }
            },
            "Output": {
                "Pretty print objects": () => {
                    thisApplet.startupParams.prettyPrint = true;
                },
                "Objects single line": () => {
                    thisApplet.startupParams.prettyPrint = false;
                }
            },
            "Format": {
                "Timestamp": () => {
                    thisApplet.startupParams.format = "timestamp";
                },
                "Bare": () => {
                    thisApplet.startupParams.format = "bare";
                },
                "Full": () => {
                    thisApplet.startupParams.format = "full";
                }
            }
        };

    }

    RunStartup() {
        let thisApplet = this;

        thisApplet.termDiv = thisApplet.dataPane;
        thisApplet.termDiv.style.backgroundColor = "black";
        let term = new Terminal();
        thisApplet.term = term;
        thisApplet.fitaddon = new FitAddon.FitAddon();
        term.loadAddon(thisApplet.fitaddon);
        term.open(thisApplet.termDiv);
        term.setOption('cursorBlink', true);
        term.setOption('bellStyle', 'sound');
        //term.setOption('fontSize', 12);

        thisApplet.StartStream();

        thisApplet.resizeMovingHook = function () {
            thisApplet.fitaddon.fit();
        };

        thisApplet.fitaddon.fit();
    }

    StartStream() {
        let thisApplet = this;
        let topicName = thisApplet.startupParams.topicName;
        let scope = thisApplet.startupParams.scope;
        let targetNodeID = thisApplet.startupParams.targetNodeID;
        let singleInstance = thisApplet.startupParams.singleInstance;
        try {
            thisApplet.sendCmd_StreamHandler("DRP", "subscribe", { topicName: topicName, scope: scope, targetNodeID: targetNodeID, singleInstance: singleInstance }, (streamData) => {
                let outputTimestamp = true;
                let outputData = streamData.payload.Message;
                switch (thisApplet.startupParams.format) {
                    case 'bare':
                        outputTimestamp = false;
                        break;
                    case 'full':
                        outputTimestamp = false;
                        outputData = streamData.payload;
                        break;
                    default:

                }
                let writeMessage = "";
                if (outputTimestamp) {
                    writeMessage += `\x1B[94m[${streamData.payload.TimeStamp}] `;
                }
                if (typeof outputData === "string") {
                    writeMessage += `\x1B[97m${streamData.payload.Message}\x1B[0m\r\n`;
                } else {
                    if (thisApplet.startupParams.prettyPrint) {
                        writeMessage += `\x1B[92m${JSON.stringify(outputData, null, 4).replace(/\r?\n/g, "\r\n")}\x1B[0m\r\n`;
                    } else {
                        writeMessage += `\x1B[92m${JSON.stringify(outputData)}\x1B[0m\r\n`;
                    }
                }
                thisApplet.term.write(writeMessage);
            });
        } catch (ex) {
            console.dir(ex);
        }
    }

    StopStream() {
        let thisApplet = this;
        let thisStreamToken = thisApplet.streamHandlerTokens.pop();
        if (thisStreamToken) {
            thisApplet.sendCmd("DRP", "unsubscribe", { streamToken: thisStreamToken }, false);
            thisApplet.vdmDesktop.drpClient.DeleteReplyHandler(thisStreamToken);
        }
    }
}

let AppletProfile = {
    "appletName": "TopicWatch",
    "title": "Topic Watch",
    "sizeX": 700,
    "sizeY": 411,
    "appletIcon": "fa-list-alt",
    "showInMenu": false,
    "preloadDeps": false,
    "dependencies": [
        { "JS": "assets/xterm/lib/xterm.js" },
        { "JS": "assets/xterm/lib/xterm-addon-fit.js" },
        { "CSS": "assets/xterm/css/xterm.css" }
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-TopicWatch.js