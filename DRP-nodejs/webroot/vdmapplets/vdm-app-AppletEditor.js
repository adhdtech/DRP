class AppletClass extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        // Dropdown menu items
        thisApplet.menu = {
            "Samples": {
                "Intro": () => {
                    thisApplet.LoadAppletModuleCode(thisApplet.sampleScripts.intro);
                },
                "Hello World - Simple": () => {
                    thisApplet.LoadAppletModuleCode(thisApplet.sampleScripts.helloWorldSimple);
                },
                "Hello World - Menu": () => {
                    thisApplet.LoadAppletModuleCode(thisApplet.sampleScripts.helloWorldMenu);
                }
            }
        };
    }

    async RunStartup() {
        let thisApplet = this;

        let popOverBox = thisApplet.windowParts.popover.firstChild;
        $(thisApplet.windowParts.popover).fadeIn();

        // See if another instance is running
        for (let checkWindow of thisApplet.vdmDesktop.vdmWindows) {
            if (checkWindow.appletName === thisApplet.appletName && checkWindow !== thisApplet) {
                popOverBox.innerHTML = `Only one editor can be loaded`;
                return;
            }
        }

        // Get applet profiles and populate "Loaded Applets"
        let dropdownEntries = {};
        let thisVDMDesktop = thisApplet.vdmDesktop;
        let profileKeys = Object.keys(thisVDMDesktop.appletModules);
        for (let i = 0; i < profileKeys.length; i++) {
            let appKeyName = profileKeys[i];
            // Do not load the Applet Editor itself
            if (appKeyName === "AppletEditor") {
                continue;
            }
            let appletModule = thisVDMDesktop.appletModules[appKeyName];
            popOverBox.innerHTML = `Loading dependencies for ${appletModule.AppletProfile.appletName}`;
            await thisVDMDesktop.LoadAppletDependencies(appletModule.AppletProfile);
            dropdownEntries[appletModule.AppletProfile.title] = () => { thisApplet.LoadAppletModuleCode(appletModule.ModuleCode) }
        }

        popOverBox.innerHTML = `Loading dependencies for AppletEditor`;

        thisApplet.AddTopMenuEntry("Loaded Applets", dropdownEntries);

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
<span style="vertical-align: middle;">Name</span><span style="float: right;"><input class="scriptName" value="" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
<span style="vertical-align: middle;">Title</span><span style="float: right;"><input class="title" value="" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width: 100px;
"></span></div>

<div style="padding: 0px 2px 0px 2px;">
    <span><span style="vertical-align: middle;">Size</span><span style="
    padding-left: 10px;
"><input class="sizeX" value="" style="
    font-size: 10px;
    background-color: #CCC;
    vertical-align: middle;
    width:  25px;
"></span>
<span style="vertical-align: middle;">x</span><span style="
    padding-left: 5px;
"><input class="sizeY" value="" style="
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
<span><textarea class="dependencies" style="font-size: 10px;"></textarea></span></div>
<div style="padding: 0px 2px 0px 2px;">
<span>Pre-load deps:</span><span><input type="checkbox" class="preloadDeps"></span>
</div>
<div style="padding: 0px 2px 0px 2px;">
<span>Show in menu:</span><span><input type="checkbox" class="showInMenu"></span>
</div>
<div>&nbsp;</div>
<div style="padding: 0px 2px 0px 2px;">
<span><button class="execute">Execute</button></span></div>
<div>&nbsp;</div>
<div style="padding: 0px 2px 0px 2px;">
<span><button class="download">Download</button></span></div>`;

        thisApplet.nameField = leftPane.querySelector('.scriptName');
        thisApplet.titleField = leftPane.querySelector('.title');
        thisApplet.sizeXField = leftPane.querySelector('.sizeX');
        thisApplet.sizeYField = leftPane.querySelector('.sizeY');
        thisApplet.showInMenuField = leftPane.querySelector('.showInMenu');
        thisApplet.dependenciesField = leftPane.querySelector('.dependencies');
        thisApplet.preloadDepsField = leftPane.querySelector('.preloadDeps');

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
	 * Preload dependencies
	 */
    preloadDeps: boolean
    /**
	 * Javascript and CSS pre-requisites
	 */
    dependencies: string[]
}

/**
 * VDM Window Parts
 */
class VDMWindowParts {
    header: HTMLElement
    /**
	 * Applet drop down menu
	 */
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
	OpenApp(appletProfile: VDMAppletProfile):VDMApplet
}

/**
 * VDM Applet
 */
class VDMApplet extends VDMWindow {
	/**
	 * Creates and returns window
	 */
    constructor(appletProfile: VDMAppletProfile);

    /**
	 * Creates and returns window
	 */
    AddTopMenuEntry(entryText: string, entries: { key: string, value: object });
}

/**
 * VDM Applet
 */
class DRPApplet extends VDMApplet {
	/**
	 * Creates and returns window
	 */
    constructor(appletProfile: VDMAppletProfile);

    /**
	 * Send a command to a mesh service
	 */
    sendCmd();
}

class DRPMeshServices {
    static ISD: inter
}

class DRPService {
    exec(method: string, params: { key: string, value: object })
}
`
        let initialEditorScriptValue = `/**
 *
 *             Welcome to the Applet Editor!
 *
 * If you have a previously saved applet file, just drag and drop
 * the file from your desktop into this applet window.
 *
 * Sample Code
 * -----------
 * Just getting started?  Click "Samples" and select an entry to
 * see how applets work.
 *
 * Registered Applet Code
 * ----------------------
 * To view code for currently registered applets, click on
 * Loaded Applets and select an entry.
 *
 * Saving Applet Code
 * ------------------
 * Click the Download button to get an applet module file containing
 * your class code and settings.
 *
 * Loading Applet Code
 * -------------------
 * To run your applet module, drag and drop the JS file from your
 * desktop into this window.
 */`;

        thisApplet.sampleScripts = {};
        thisApplet.sampleScripts.intro = `class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        /**
         * Applet instantiation process:
         *    1. Initial applet setup - thisApplet.constructor()
         *    2. Window element creation - VDMDesktop.OpenApplet(thisApplet)
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
    async RunStartup() {
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

let AppletProfile = {
    "appletName": "Intro",
    "title": "Intro",
    "sizeX": 600,
    "sizeY": 400,
    "appletIcon": "fa-book",
    "showInMenu": false,
    "preloadDeps": false,
    "dependencies": [
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-Intro.js`;

        thisApplet.sampleScripts.helloWorldSimple = `class AppletClass extends DRPApplet {
  constructor(appletProfile) {
    super(appletProfile);
    let thisApplet = this;
  }

  /** Function executed after VDMWindow is created */
  async RunStartup() {
    let thisApplet = this;

    // The data pane is empty by default; put something in it
    thisApplet.WriteHelloWorld();
  }

  // APPLET SPECIFIC METHODS

  /** Function to write to data pane */
  WriteHelloWorld() {
    let thisApplet = this;
    thisApplet.windowParts.data.innerHTML = "Hello world!";
  }
}

let AppletProfile = {
    "appletName": "HelloWorldSimple",
    "title": "Simple Hello World",
    "sizeX": 600,
    "sizeY": 400,
    "appletIcon": "fa-book",
    "showInMenu": false,
    "preloadDeps": false,
    "dependencies": [
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-HelloWorldSimple.js`;

        thisApplet.sampleScripts.helloWorldMenu = `class AppletClass extends DRPApplet {
  constructor(appletProfile) {
    super(appletProfile);
    let thisApplet = this;

    thisApplet.menu = {
      // First level - initial dropdown options (like File, Edit, etc)
      "Test Functions": {
        // Second level - items with actions
        "Write Hello World": () => {
          // Action to execute on click
          thisApplet.WriteHelloWorld();
        }
      }
    };
  }

  /** Function executed after VDMWindow is created */
  async RunStartup() {
    let thisApplet = this;

    // The data pane is empty by default; put something in it
    thisApplet.windowParts.data.innerHTML = "Click 'Test Functions' -> 'Write Hello World' to replace this message.";
  }

  // APPLET SPECIFIC METHODS

  /** Function to write to data pane */
  WriteHelloWorld() {
    let thisApplet = this;
    thisApplet.windowParts.data.innerHTML = "Hello world!";
  }
}

let AppletProfile = {
    "appletName": "HelloWorldMenu",
    "title": "Hello World with Menu",
    "sizeX": 600,
    "sizeY": 400,
    "appletIcon": "fa-book",
    "showInMenu": false,
    "preloadDeps": false,
    "dependencies": [
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-HelloWorldMenu.js`

        // Due to issues with monaco affecting other processes, load libraries here
        let monacoScripts = ["assets/vs/loader.js", "assets/vs/editor/editor.main.nls.js", "assets/vs/editor/editor.main.js"];
        for (let dependencyValue of monacoScripts) {
            if (this.vdmDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                this.vdmDesktop.loadedResources.push(dependencyValue);

                // Run it globally now
                let resourceText = await this.vdmDesktop.FetchURLResource(dependencyValue);
                await this.vdmDesktop.EvalWithinContext(window, resourceText);
            }
        }

        popOverBox.innerHTML = "";
        $(thisApplet.windowParts.popover).fadeOut();

        require.config({ paths: { 'vs': 'assets/vs' } });

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
            //autoIndent: true,
            //formatOnPaste: true,
            //formatOnType: true
        });

        thisApplet.editor.addAction({
            // An unique identifier of the contributed action.
            id: "execute-script",

            // A label of the action that will be presented to the user.
            label: "Execute script",

            // An optional array of keybindings for the action.
            keybindings: [
                monaco.KeyCode.F5,
                // chord
                //monaco.KeyMod.chord(
                //monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
                //monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM
                //),
            ],

            // A precondition for this action.
            precondition: null,

            // A rule to evaluate on top of the precondition in order to dispatch the keybindings.
            keybindingContext: null,

            contextMenuGroupId: "navigation",

            contextMenuOrder: 1.5,

            // Method that will be executed when the action is triggered.
            // @param editor The editor instance is passed in as a convenience
            run: function (ed) {
                thisApplet.ExecuteScript();
            },
        });

        let targetElement = thisApplet.windowParts["data"];
        //let targetElement = leftPane;

        let executeButton = leftPane.querySelector('.execute');
        executeButton.onclick = function (e) {
            thisApplet.ExecuteScript();
        };

        let downloadButton = leftPane.querySelector('.download');
        downloadButton.onclick = function (event) {
            thisApplet.DownloadScriptPackageFile();
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

                thisApplet.LoadAppletModuleCode(fileObj.contents);
            }
        };
    }

    RunSanityCheck() {
        let thisApplet = this;
        let missingRequirements = [];

        if (!thisApplet.nameField.value) missingRequirements.push("Name");
        if (!thisApplet.titleField.value) missingRequirements.push("Title");
        if (!thisApplet.sizeXField.value) missingRequirements.push("Size X");
        if (!thisApplet.sizeYField.value) missingRequirements.push("Size Y");

        if (missingRequirements.length > 0) {
            throw new Error(`Missing or invalid values for ${missingRequirements.join(", ")}`);
        }
    }

    GenerateAppletModuleCode() {
        let thisApplet = this;
        let dependenciesArr = [];

        thisApplet.RunSanityCheck();

        if (thisApplet.dependenciesField.value.length > 0) {
            for (let thisLine of thisApplet.dependenciesField.value.split(/,\n/)) {
                let [type, value] = thisLine.split(/: /);
                dependenciesArr.push(` { "${type}": "${value}" }`)
            }
        }
        let dependenciesString = `[${dependenciesArr.join(",\r\n")}]`;

        let appletClassCode = thisApplet.editor.getValue();

        // Create appletModuleCode
        let appletModuleCode = `${appletClassCode}

let AppletProfile = {
    "appletName": "${thisApplet.nameField.value}",
    "title": "${thisApplet.titleField.value}",
    "sizeX": ${thisApplet.sizeXField.value},
    "sizeY": ${thisApplet.sizeYField.value},
    "appletIcon": "fa-list-alt",
    "showInMenu": ${thisApplet.showInMenuField.checked},
    "preloadDeps": ${thisApplet.preloadDepsField.checked},
    "dependencies": ${dependenciesString}
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-${thisApplet.nameField.value}.js`

        return appletModuleCode;
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
            reader.readAsBinaryString(file);
        });
    }

    async ExecuteScript() {
        let thisApplet = this;

        try {
            let appletModuleCode = thisApplet.GenerateAppletModuleCode();
            let appletModule = new VDMAppletModule();
            await appletModule.LoadFromString(appletModuleCode);
            thisApplet.vdmDesktop.OpenApplet(appletModule);
        } catch (ex) {
            thisApplet.DisplayStatusMessage(`Could not run applet - ${ex.message}`, true);
        }
    }

    DisplayStatusMessage(message, isErr) {
        alert(message);
    }

    DownloadScriptPackageFile() {
        let thisApplet = this;

        try {
            thisApplet.RunSanityCheck();
            let filename = `vdm-app-${thisApplet.nameField.value}.js`;
            let data = thisApplet.GenerateAppletModuleCode();
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
        } catch (ex) {
            thisApplet.DisplayStatusMessage(`Could download applet - ${ex.message}`, true);
        }
    }

    /**
     * Take code for an applet module and apply it to the relevant editor fields
     * @param {string} appletModuleCode
     */
    async LoadAppletModuleCode(appletModuleCode) {
        let thisApplet = this;

        // Create module from code
        let appletModule = new VDMAppletModule();

        // This step will throw an error if the module code is invalid
        await appletModule.LoadFromString(appletModuleCode);

        // Set the AppletEditor form fields

        // Set script name
        thisApplet.nameField.value = appletModule.AppletProfile.appletName;

        // Set title
        thisApplet.titleField.value = appletModule.AppletProfile.title;

        // Set sizeX
        thisApplet.sizeXField.value = appletModule.AppletProfile.sizeX;

        // Set sizeY
        thisApplet.sizeYField.value = appletModule.AppletProfile.sizeY;

        // Set showInMenu
        thisApplet.showInMenuField.checked = (appletModule.AppletProfile.showInMenu) ? true : false;

        // Set dependencies
        let dependenciesStringArray = [];
        for (let thisEntry of appletModule.AppletProfile.dependencies) {
            for (const [key, value] of Object.entries(thisEntry)) {
                dependenciesStringArray.push(`${key}: ${value}`);
            }
        }
        thisApplet.dependenciesField.value = dependenciesStringArray.join(",\n");

        // Set preloadDeps
        thisApplet.preloadDepsField.checked = (appletModule.AppletProfile.preloadDeps) ? true : false;

        // Apply code to editor
        thisApplet.editor.setValue(appletModule.ClassCode);
    }
}

let AppletProfile = {
    "appletName": "AppletEditor",
    "title": "Applet Editor",
    "sizeX": 800,
    "sizeY": 500,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preloadDeps": false,
    "dependencies": [
        { "CSS-Link": "<link rel='stylesheet' data-name='vs/editor/editor.main' href='assets/vs/editor/editor.main.css'>" }
    ]
}

export { AppletProfile, AppletClass };
//# sourceURL=vdm-app-AppletEditor.js