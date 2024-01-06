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
                    "Download": () => { },
                    "Add to local menu": () => { },
                    "Upload to profile": () => { }
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
<span style="vertical-align: middle;">Name</span><span style="float: right;"><input class="scriptName" value="MyApp" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Title</span><span style="float: right;"><input class="title" value="My App" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
    <span><span style="vertical-align: middle;">Size</span><span style="
    padding-left: 10px;
"><input class="sizeX" value="1250" style="
    font-size: 10px;
    background-color: #888;
    vertical-align: middle;
    width:  25px;
"></span>
<span style="vertical-align: middle;">x</span><span style="
    padding-left: 5px;
"><input class="sizeY" value="800" style="
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
<span><textarea class="preReqs" style="font-size: 10px;">(list of dependencies)</textarea></span></div>
<div style="padding: 0px 2px 0px 2px;">
<span><button class="execute">Execute</button></span></div>`;

            let nameField = leftPane.querySelector('.scriptName');
            let titleField = leftPane.querySelector('.title');
            let sizeXField = leftPane.querySelector('.sizeX');
            let sizeYField = leftPane.querySelector('.sizeY');
            let preReqsField = leftPane.querySelector('.preReqs');

            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

            //myApp.windowParts["data"].innerHTML = '<pre style="height: 100%; margin: 0;"><code class="language-javascript" style="height: 100%"></code></pre>';
            //let targetContainer = $(myApp.windowParts["data"]).find('.language-javascript')[0];
            //hljs.highlightElement(el);
            let libSource = `
/**
 * VDM Window
 */
class VDMWindow {
	constructor(targetDiv: HTMLElement);
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

            let editor = monaco.editor.create(rightPane, {
                value: `function x() {\n  console.log("Hello world!");\n}`,
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 12
            });

            let targetElement = myApp.windowParts["data"];
            //let targetElement = leftPane;

            let executeButton = leftPane.querySelector('.execute');
            executeButton.onclick = async () => {
                let preReqsString = "[]";

                // Create appletObj
                let appletCode = `({
    "appletName": "${nameField.value}",
    "title": "${titleField.value}",
    "sizeX": ${sizeXField.value},
    "sizeY": ${sizeYField.value},
    "appletIcon": "fa-list-alt",
    "showInMenu": false,
    "preReqs": ${preReqsString},
    "appletClass": ${editor.getValue()}
})
//# sourceURL=vdm-app-${nameField.value}.js`

                // TODO - Add sanity checks

                let appletObj = eval(appletCode);
                //console.dir(appletCode);
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
                    let appletPattern = /\({\r?\n((?:\s*"(?:appletName|title|sizeX|sizeY|appletIcon|showInMenu)": .*,\r?\n)+)(\s*"preReqs": \[\r?\n(?:\s+(?:\/\/)?{.*},?\r?\n)*\s+],)\r?\n\s+"appletClass": (class extends (?:VDMApplet|rSageApplet) {(?:.|\r?\n)*)}\)\r?\n\/\/\# sourceURL=(.*\.js)/gm;
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
                    nameField.value = metaData.appletName;

                    // Set title
                    titleField.value = metaData.title;

                    // Set sizeX
                    sizeXField.value = metaData.sizeX;

                    // Set sizeY
                    sizeYField.value = metaData.sizeY;

                    // Set preReqs
                    let preReqStringArray = [];
                    for (let thisEntry of metaData.preReqs) {
                        for (const [key, value] of Object.entries(thisEntry)) {
                            preReqStringArray.push(`${key}: ${value}`);
                        }
                    }
                    preReqsField.value = preReqStringArray.join(",\n");

                    // Apply code to editor
                    editor.setValue(scriptData);
                }
            };
        }
    }
})
//# sourceURL=vdm-app-AppletEditor.js
