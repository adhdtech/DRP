({
    "appletName": "AppletEditor",
    "title": "Applet Editor",
    "sizeX": 800,
    "sizeY": 500,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preReqs": [
        { "JS": "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js" },
        { "JS": "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.nls.js" },
        { "JS": "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.js" }
    ],
    "appletClass": class extends VDMApplet {
        constructor(appletProfile) {
            super(appletProfile);
            let myApp = this;

            // Dropdown menu items
            myApp.menu = {
                "File": {
                    "Download": () => {
                        let filename = `vdm-app-${myApp.appVars.nameField.value}.js`;
                        let data = myApp.appFuncs.generateAppletCode();
                        const blob = new Blob([data], { type: 'application/octet-stream' });
                        if (window.navigator.msSaveOrOpenBlob) {
                            window.navigator.msSaveBlob(blob, filename);
                        }
                        else {
                            const elem = window.document.createElement('a');
                            elem.href = window.URL.createObjectURL(blob);
                            elem.download = filename;
                            document.body.appendChild(elem);
                            elem.click();
                            document.body.removeChild(elem);
                        }
                    }
                }
            };

            myApp.appFuncs = {
                readDroppedFile: (file) => {
                    // Return a promise outputting the uploaded file object
                    return new Promise((resolve, reject) => {
                        let reader = new FileReader();
                        reader.onload = async () => {
                            try {
                                let response = {
                                    name: file.name,
                                    size: file.size,
                                    type: file.type,
                                    contents: reader.result
                                };
                                // Resolve the promise with the response value
                                resolve(response);
                            } catch (err) {
                                reject(err);
                            }
                        };
                        reader.onerror = (error) => {
                            reject(error);
                        };
                        //reader.readAsDataURL(file);
                        reader.readAsBinaryString(file);
                    });
                },
                generateAppletCode: () => {
                    let preReqsString = "[]";

                    // Create appletObj
                    let appletCode = `({
    "appletName": "${myApp.appVars.nameField.value}",
    "title": "${myApp.appVars.titleField.value}",
    "sizeX": ${myApp.appVars.sizeXField.value},
    "sizeY": ${myApp.appVars.sizeYField.value},
    "appletIcon": "fa-list-alt",
    "showInMenu": false,
    "preReqs": ${preReqsString},
    "appletClass": ${myApp.appVars.editor.getValue()}
})
//# sourceURL=vdm-app-${myApp.appVars.nameField.value}.js`

                    return appletCode;
                }
            };

            myApp.appVars = {
                "videoURL": "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;autoplay=1&amp;controls=0&amp;showinfo=0"
            };

            myApp.recvCmd = {
            };

        }

        async runStartup() {
            let myApp = this;

            myApp.windowParts["data"].style.display = "flex";
            let leftPane = document.createElement("div");
            //leftPane.className = "leftPane";
            leftPane.style = "width: 140px; background-color: rgb(85, 85, 85);/* display:  inline-flex; */font-size:  10px;color: darkgrey;/* margin: 1px; */";
            let rightPane = document.createElement("div");
            //rightPane.className = "rightPane";
            rightPane.style = "width: 100%;";

            myApp.windowParts["data"].appendChild(leftPane);
            myApp.windowParts["data"].appendChild(rightPane);

            leftPane.innerHTML = `
<div>&nbsp;</div>
		
<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Name</span><span style="float: right;"><input class="scriptName" value="MyApplet" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Title</span><span style="float: right;"><input class="title" value="My Applet" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
    <span><span style="vertical-align: middle;">Size</span><span style="
    padding-left: 10px;
"><input class="sizeX" value="600" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width:  25px;
"></span>
<span style="vertical-align: middle;">x</span><span style="
    padding-left: 5px;
"><input class="sizeY" value="400" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width:  25px;
"></span>
    </span>
</div>
<div>&nbsp;</div>
<div style="padding: 0px 2px 0px 2px;">
<span>Dependencies:</span>
</div>
<div style="padding: 0px 2px 0px 2px;">
<span><textarea class="preReqs" style="font-size: 10px;"></textarea></span></div>
<div style="padding: 0px 2px 0px 2px;">
<span><button class="execute">Execute</button></span></div>`;

            myApp.appVars.nameField = leftPane.querySelector('.scriptName');
            myApp.appVars.titleField = leftPane.querySelector('.title');
            myApp.appVars.sizeXField = leftPane.querySelector('.sizeX');
            myApp.appVars.sizeYField = leftPane.querySelector('.sizeY');
            myApp.appVars.preReqsField = leftPane.querySelector('.preReqs');

            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

            let libSource = `
/**
 * VDM Window Parts
 */
class VDMWindowParts {
    header: HTMLElement
    menu: HTMLElement
    data: HTMLElement
    footer: HTMLElement,
    popover: HTMLElement,
    maximize: HTMLElement,
    close: HTMLElement
}

/**
 * VDM Window
 */
class VDMWindow {
	constructor(targetDiv: HTMLElement);
    windowParts: VDMWindowParts
	/**
	 * Closes window
	 */
	close():string
}

/**
 * VDM Desktop Manager
 */
class VDMDesktop {
	/**
	 * Creates and returns window
	 */
	newWindow():VDMWindow
}

/**
 * VDM Applet
 */
class VDMApplet extends VDMWindow {
	/**
	 * Creates and returns window
	 */
}
`
            let initialEditorScriptValue = `class extends VDMApplet {
  constructor(appletProfile) {
    super(appletProfile);
    let thisApplet = this;
      
    // Dropdown menu items
    thisApplet.menu = {
      "Test Functions": {
        "Alert": () => {
          alert("Hello world")
        },
        "RickRoll": () => {
          thisApplet.appFuncs.rickRoll();
        }
      }
    };

    thisApplet.appFuncs = {
      clearDataPane: () => {
        thisApplet.windowParts.data.innerHTML = "";
      },
      populateDataPane: () => {
        thisApplet.windowParts.data.innerHTML = thisApplet.appVars.foo;
      },
      rickRoll: () => {
          thisApplet.appFuncs.clearDataPane();
          let iFrame = document.createElement("iframe");
          iFrame.style.width = "100%";
          iFrame.style.height = "100%";
          iFrame.allow = "autoplay";
          iFrame.src = thisApplet.appVars.rickRollURL;
          thisApplet.windowParts.data.appendChild(iFrame);
      }
    };

    thisApplet.appVars = {
      foo: "The data of foo",
      rickRollURL: "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;autoplay=1&amp;controls=0&amp;showinfo=0"
    };
  }

  runStartup() {
    let thisApplet = this;
    thisApplet.appFuncs.populateDataPane();
  }
}
`
            //libSource = await myApp.vdmDesktop.fetchURLResource('assets/drp/js/vdm.js');

            if (monaco.editor.getModels().length) {
                monaco.editor.getModels().forEach(model => model.dispose());
            }

            //monaco.languages.typescript.javascriptDefaults.setCompilerOptions({isolatedModules: true})
            //monaco.languages.typescript.typescriptDefaults.setCompilerOptions({isolatedModules: true})

            let libUri = "ts:filename/vdm.d.ts";
            monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);
            // When resolving definitions and references, the editor will try to use created models.
            // Creating a model for the library allows "peek definition/references" commands to work with the library.
            monaco.editor.createModel(libSource, "typescript", monaco.Uri.parse(libUri));

            myApp.appVars.editor = monaco.editor.create(rightPane, {
                value: initialEditorScriptValue,
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 12
            });

            let targetElement = myApp.windowParts["data"];
            //let targetElement = leftPane;

            let executeButton = leftPane.querySelector('.execute');
            executeButton.onclick = async () => {
                // TODO - Add sanity checks
                let appletCode = myApp.appFuncs.generateAppletCode();
                let appletObj = eval(appletCode);
                myApp.vdmDesktop.openApp(appletObj);
            };

            // Add Applet Drop logic
            targetElement.ondragover = function (event) {
                event.preventDefault();
                targetElement.style["opacity"] = 0.5;
            }

            targetElement.ondragleave = function (event) {
                event.preventDefault();
                targetElement.style["opacity"] = 1;
            }

            targetElement.ondrop = async (event) => {
                event.preventDefault();
                targetElement.style["opacity"] = 1;

                for (let file of event.dataTransfer.files) {
                    // Check for large files
                    if (file.size > (1024 * 1024)) {
                        // The file is the too large, reject
                    }

                    switch (file.type) {
                        case 'text/javascript':
                            // Add sanity checks!
                            break;
                        default:
                            // Unrecognized type
                            continue;
                    }

                    // Get file data
                    let fileObj;
                    let droppedApplet;
                    try {
                        fileObj = await myApp.appFuncs.readDroppedFile(file);
                    } catch (ex) {
                        //console.log("Could not read file");
                        return;
                    }

                    // See if it's a valid applet
                    let appletPattern = /\({\r?\n((?:\s*"(?:appletName|title|sizeX|sizeY|appletIcon|showInMenu)": .*,\r?\n)+)(\s*"preReqs": \[(?:\r?\n(?:\s+(?:\/\/)?{.*},?\r?\n)*\s+)?],)\r?\n\s+"appletClass": (class extends (?:VDMApplet|rSageApplet) {(?:.|\r?\n)*)}\)\r?\n\/\/\# sourceURL=(.*\.js)/gm;
                    let appletParts = appletPattern.exec(fileObj.contents);

                    if (!appletParts) {
                        // Dropped file does not appear to be an applet
                        return;
                    }

                    // Retrieve script parts
                    let metaDataJSON = '{' + appletParts[1] + (appletParts[2].replace(/,\r?\n?$/, '')) + '}'
                    let metaData = JSON.parse(metaDataJSON);
                    let scriptData = appletParts[3];
                    let sourceURL = appletParts[4];

                    // Set the relevant fields

                    // Set script name
                    myApp.appVars.nameField.value = metaData.appletName;

                    // Set title
                    myApp.appVars.titleField.value = metaData.title;

                    // Set sizeX
                    myApp.appVars.sizeXField.value = metaData.sizeX;

                    // Set sizeY
                    myApp.appVars.sizeYField.value = metaData.sizeY;

                    // Set preReqs
                    let preReqStringArray = [];
                    for (let thisEntry of metaData.preReqs) {
                        for (const [key, value] of Object.entries(thisEntry)) {
                            preReqStringArray.push(`${key}: ${value}`);
                        }
                    }
                    myApp.appVars.preReqsField.value = preReqStringArray.join(",\n");

                    // Apply code to editor
                    myApp.appVars.editor.setValue(scriptData);
                }
            };
        }
    }
})
//# sourceURL=vdm-app-AppletEditor.js
