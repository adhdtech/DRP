class AppletClass extends DRPApplet {
    constructor(appletProfile, startupParams) {
        super(appletProfile);
        let watchApp = this;

        // Override Title
        watchApp.title += ` - ${startupParams.topicName} (${startupParams.scope})`;
        if (startupParams.targetNodeID) {
            watchApp.title += ` @ ${startupParams.targetNodeID}`;
        }
        if (startupParams.singleInstance) {
            watchApp.title += `, single instance`;
        }

        // Prerequisites
        watchApp.dependencies = [
        ];

        // Dropdown menu items
        watchApp.menu = {
            "Stream": {
                "Stop": () => {
                    watchApp.appFuncs.stopStream();
                },
                "Start": () => {
                    watchApp.appFuncs.startStream();
                }
            },
            "Output": {
                "Pretty print objects": () => {
                    watchApp.appVars.startupParams.prettyPrint = true;
                },
                "Objects single line": () => {
                    watchApp.appVars.startupParams.prettyPrint = false;
                }
            },
            "Format": {
                "Timestamp": () => {
                    watchApp.appVars.startupParams.format = "timestamp";
                },
                "Bare": () => {
                    watchApp.appVars.startupParams.format = "bare";
                },
                "Full": () => {
                    watchApp.appVars.startupParams.format = "full";
                }
            }
        };

        watchApp.appFuncs = {
            startStream: () => {
                let topicName = watchApp.appVars.startupParams.topicName;
                let scope = watchApp.appVars.startupParams.scope;
                let targetNodeID = watchApp.appVars.startupParams.targetNodeID;
                let singleInstance = watchApp.appVars.startupParams.singleInstance;
                try {
                    watchApp.sendCmd_StreamHandler("DRP", "subscribe", { topicName: topicName, scope: scope, targetNodeID: targetNodeID, singleInstance: singleInstance }, (streamData) => {
                        let outputTimestamp = true;
                        let outputData = streamData.payload.Message;
                        switch (watchApp.appVars.startupParams.format) {
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
                            if (watchApp.appVars.startupParams.prettyPrint) {
                                writeMessage += `\x1B[92m${JSON.stringify(outputData, null, 4).replace(/\r?\n/g, "\r\n")}\x1B[0m\r\n`;
                            } else {
                                writeMessage += `\x1B[92m${JSON.stringify(outputData)}\x1B[0m\r\n`;
                            }
                        }
                        watchApp.appVars.term.write(writeMessage);
                    });
                } catch (ex) {
                    console.dir(ex);
                }
            },
            stopStream: () => {
                let thisStreamToken = watchApp.streamHandlerTokens.pop();
                if (thisStreamToken) {
                    watchApp.sendCmd("DRP", "unsubscribe", { streamToken: thisStreamToken }, false);
                    watchApp.vdmSession.drpClient.DeleteReplyHandler(thisStreamToken);
                }
            }
        };

        watchApp.appVars = {
            startupParams: startupParams
        };

        watchApp.recvCmd = {
        };

    }

    RunStartup() {
        let watchApp = this;

        watchApp.appVars.termDiv = watchApp.windowParts["data"];
        watchApp.appVars.termDiv.style.backgroundColor = "black";
        let term = new Terminal();
        watchApp.appVars.term = term;
        watchApp.appVars.fitaddon = new FitAddon.FitAddon();
        term.loadAddon(watchApp.appVars.fitaddon);
        term.open(watchApp.appVars.termDiv);
        term.setOption('cursorBlink', true);
        term.setOption('bellStyle', 'sound');
        //term.setOption('fontSize', 12);

        watchApp.appFuncs.startStream();

        watchApp.resizeMovingHook = function () {
            watchApp.appVars.fitaddon.fit();
        };

        watchApp.appVars.fitaddon.fit();
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
    "dependencies": []
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-CommandTesting.js