({
    "appletName": "AppletEditor",
    "title": "Applet Editor",
    "sizeX": 800,
    "sizeY": 500,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preReqs": [
        { "CSS-Link": '<link rel="stylesheet" data-name="vs/editor/editor.main" href="assets/vs/editor/editor.main.css">' },
        { "JS": "assets/vs/loader.js" },
        { "JS": "assets/vs/editor/editor.main.nls.js" },
        { "JS": "assets/vs/editor/editor.main.js" }
    ],
    "appletClass": class extends VDMApplet {
        constructor(appletProfile) {
            super(appletProfile);
            let thisApplet = this;

            require.config({ paths: { 'vs': 'assets/vs' } });

            // Dropdown menu items
            thisApplet.menu = {
                "File": {
                    "Download": () => {
                        let filename = `vdm-app-${thisApplet.nameField.value}.js`;
                        let data = thisApplet.GenerateAppletCode();
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
        }

        async RunStartup() {
            let thisApplet = this;

            thisApplet.windowParts["data"].style.display = "flex";
            let leftPane = document.createElement("div");
            //leftPane.className = "leftPane";
            leftPane.style = "width: 140px; background-color: rgb(85, 85, 85);/* display:  inline-flex; */font-size:  10px;color: darkgrey;/* margin: 1px; */";
            let rightPane = document.createElement("div");
            //rightPane.className = "rightPane";
            rightPane.style = "width: 100%;";

            thisApplet.windowParts["data"].appendChild(leftPane);
            thisApplet.windowParts["data"].appendChild(rightPane);

            leftPane.innerHTML = `
<div>&nbsp;</div>
		
<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Name</span><span style="float: right;"><input class="scriptName" value="HelloWorld" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Title</span><span style="float: right;"><input class="title" value="Hello World" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
    <span><span style="vertical-align: middle;">Size</span><span style="
    padding-left: 10px;
"><input class="sizeX" value="600" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width:  25px;
"></span>
<span style="vertical-align: middle;">x</span><span style="
    padding-left: 5px;
"><input class="sizeY" value="400" style="
    font-size: 10px;
    background-color: #CCC;
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

            thisApplet.nameField = leftPane.querySelector('.scriptName');
            thisApplet.titleField = leftPane.querySelector('.title');
            thisApplet.sizeXField = leftPane.querySelector('.sizeX');
            thisApplet.sizeYField = leftPane.querySelector('.sizeY');
            thisApplet.preReqsField = leftPane.querySelector('.preReqs');



            let libSource = `
/**
 * VDM Applet Profile Parts
 */
class VDMAppletProfile {
    /**
	 * Applet name (used in to create filename)
	 */
    appletName: string
    /**
	 * Text to display in the window title
	 */
    title: string
    /**
	 * Initial window width
	 */
    sizeX: number
    /**
	 * Initial window height
	 */
    sizeY: number
    /**
	 * Name of Font Awesome icon
	 */
    appletIcon: string
    /**
	 * Add applet to main menu
	 */
    showInMenu: boolean
    /**
	 * Javascript and CSS pre-requisites
	 */
    preReqs: string[]
}

/**
 * VDM Window Parts
 */
class VDMWindowParts {
    header: HTMLElement
    menu: HTMLElement
    /**
	 * Applet data window
	 */
    data: HTMLElement
    footer: HTMLElement
    popover: HTMLElement
    maximize: HTMLElement
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
    constructor(appletProfile: VDMAppletProfile);
}
`
            let initialEditorScriptValue = `class HelloWorldApplet extends VDMApplet {
  constructor(appletProfile) {
    super(appletProfile);
    let thisApplet = this;

    /**
     * Applet instantiation process:
     *    1. Initial applet setup - thisApplet.constructor()
     *    2. Window element creation - VDMDesktop.NewWindow(thisApplet)
     *    3. Applet data population - thisApplet.RunStartup()
     */
    
     /** 
     * This code block is for initial applet setup:
     *   - Menu definition (OPTIONAL - menu bar hidden if not defined)
     *   - Setting class attributes (OPTIONAL)
     *   - Overriding appletProfile values prior to window creation
     * 
     * The RunStartup() method is used to populate the applet's data pane
     * which is referenced using 'thisApplet.windowParts.data' (DIV element).
    */

    // Dropdown menu (OPTIONAL)
    thisApplet.menu = {
      // First level - initial dropdown options (like File, Edit, etc)
      "Test Functions": {
        // Second level - items with actions
        "Alert": () => {
          // Action to execute on click
          alert("Hello world")
        },
        "RickRoll": () => {
          thisApplet.RickRoll();
        }
      }
    };

    // Set some applet specific attributes (OPTIONAL)
    thisApplet.rickRollURL = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;autoplay=1&amp;controls=0&amp;showinfo=0";
  }

  /** Function executed after VDMWindow is created */
  RunStartup() {
    let thisApplet = this;

    // The data pane is empty by default; put something in it
    thisApplet.windowParts.data.innerHTML = "Hello, world!";
  }

  // APPLET SPECIFIC METHODS

  /** Function to clear data pane */
  ClearDataPane() {
    let thisApplet = this;
    thisApplet.windowParts.data.innerHTML = "";
  }

  /** Play the greatest video known to mankind */
  RickRoll() {
    let thisApplet = this;
    thisApplet.ClearDataPane();
    let iFrame = document.createElement("iframe");
    iFrame.style.width = "100%";
    iFrame.style.height = "100%";
    iFrame.allow = "autoplay";
    iFrame.src = thisApplet.rickRollURL;
    thisApplet.windowParts.data.appendChild(iFrame);
  }
}
`
            //libSource = await thisApplet.vdmDesktop.fetchURLResource('assets/drp/js/vdm.js');

            // Wait for CSS to finish loading
            //if (typeof monaco === 'undefined') {
            //await new Promise(res => setTimeout(res, 100));
            //}

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

            thisApplet.editor = monaco.editor.create(rightPane, {
                value: initialEditorScriptValue,
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 12
            });

            let targetElement = thisApplet.windowParts["data"];
            //let targetElement = leftPane;

            let executeButton = leftPane.querySelector('.execute');
            executeButton.onclick = async () => {
                // TODO - Add sanity checks
                let appletCode = thisApplet.GenerateAppletCode();
                let appletObj = eval(appletCode);
                thisApplet.vdmDesktop.OpenApp(appletObj);
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
                        fileObj = await thisApplet.ReadDroppedFile(file);
                    } catch (ex) {
                        //console.log("Could not read file");
                        return;
                    }

                    // See if it's a valid applet
                    let appletPattern = /\({\r?\n((?:\s*"(?:appletName|title|sizeX|sizeY|appletIcon|showInMenu)": .*,\r?\n)+)(\s*"preReqs": \[(?:\r?\n(?:\s+(?:\/\/)?{.*},?\r?\n)*\s+)?],)\r?\n\s+"appletClass": (class(?: \w+)? extends (?:VDMApplet|rSageApplet) {(?:.|\r?\n)*)}\)\r?\n\/\/\# sourceURL=(.*\.js)/gm;
                    let appletParts = appletPattern.exec(fileObj.contents);

                    if (!appletParts) {
                        // Dropped file does not appear to be an applet

                        // TO DO - Add some sort of output, maybe add a status message section on the footer
                        return;
                    }

                    // Retrieve script parts
                    let metaDataJSON = '{' + appletParts[1] + (appletParts[2].replace(/,\r?\n?$/, '')) + '}'
                    let metaData = JSON.parse(metaDataJSON);
                    let scriptData = appletParts[3].replace(/(?:\r?\n)+$/, '\r\n');
                    let sourceURL = appletParts[4];

                    // Set the relevant fields

                    // Set script name
                    thisApplet.nameField.value = metaData.appletName;

                    // Set title
                    thisApplet.titleField.value = metaData.title;

                    // Set sizeX
                    thisApplet.sizeXField.value = metaData.sizeX;

                    // Set sizeY
                    thisApplet.sizeYField.value = metaData.sizeY;

                    // Set preReqs
                    let preReqStringArray = [];
                    for (let thisEntry of metaData.preReqs) {
                        for (const [key, value] of Object.entries(thisEntry)) {
                            preReqStringArray.push(`${key}: ${value}`);
                        }
                    }
                    thisApplet.preReqsField.value = preReqStringArray.join(",\n");

                    // Apply code to editor
                    thisApplet.editor.setValue(scriptData);
                }
            };
        }

        GenerateAppletCode() {
            let thisApplet = this;
            let preReqsString = "[]";

            // Create appletObj
            let appletCode = `({
    "appletName": "${thisApplet.nameField.value}",
    "title": "${thisApplet.titleField.value}",
    "sizeX": ${thisApplet.sizeXField.value},
    "sizeY": ${thisApplet.sizeYField.value},
    "appletIcon": "fa-list-alt",
    "showInMenu": false,
    "preReqs": ${preReqsString},
    "appletClass": ${thisApplet.editor.getValue()}
})
//# sourceURL=vdm-app-${thisApplet.nameField.value}.js`

            return appletCode;
        }

        ReadDroppedFile(file) {
            let thisApplet = this;
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
    }
})
//# sourceURL=vdm-app-AppletEditor.js
