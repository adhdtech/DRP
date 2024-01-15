// VDM Desktop
/**
 * VDM Desktop manager
 * @param {HTMLDivElement} parentDiv Parent div for the VDM
 * @param {string} vdmTitle Title on top bar
 * @param {string} statusLightColor Initial status light color
 * @param {Object.<string,VDMAppletModule>} appletModules Dictionary of applet profiles
 */
class VDMDesktop {
    constructor(parentDiv, vdmTitle, statusLightColor, appletPath) {
        let thisVDMDesktop = this;

        // VDM Desktop DIV
        this.vdmDiv = document.createElement("div");
        this.vdmDiv.className = "vdmDesktop";
        if (parentDiv) {
            parentDiv.append(this.vdmDiv);
        } else {
            document.body.append(this.vdmDiv);
        }

        // VDM Window Array
        /** @type VDMWindow[] */
        this.vdmWindows = [];

        // Current Active Window
        /** @type VDMWindow */
        this.currentActiveWindow = null;

        // App Modules
        /** @type {Object.<string,VDMAppletModule>} */
        this.appletModules = {};

        /** @type {Object.<string,VDMApplet>} */
        this.appletInstances = {};

        // Applet base path
        this.appletPath = appletPath || "vdmapplets";

        // App Resources
        this.loadedResources = [];
        this.sharedJSON = {};

        // Misc
        this.appletCreateIndex = 0;

        // Top Bar
        this.vdmTopBar = {
            title: vdmTitle,
            leftSide: [],
            rightSide: []
        };

        // Disable F5 and backspace keys unless we're in a text input
        this.DisableBackAndRefreshKeys();

        // Populate vdmDiv
        this.vdmDiv.innerHTML = `
<div class="vdmTopBar">
    <div class="topMenu">
        <button class="dropButton">Go <i class="fa fa-chevron-down"></i></button>
        <ul class="dropMenu">
            <li class="nav-last"/>
        </ul>
    </div>
    <div class="vdmTitle">
        <span class="vdmTitleText">VDM Desktop</span>
        <span>&nbsp;</span>
        <span class="vdmled"></span>
    </div>
</div>
<div class="vdmWindows">
`;

        // Assign major elements
        this.vdmTopBarDiv = this.vdmDiv.querySelector(".vdmTopBar");
        this.vdmMenuDiv = this.vdmDiv.querySelector(".vdmMenu");
        this.vdmTitleText = this.vdmDiv.querySelector(".vdmTitleText");
        this.vdmStatusLed = this.vdmDiv.querySelector(".vdmled");
        this.vdmWindowsDiv = this.vdmDiv.querySelector(".vdmWindows");
        this.vdmTopBarMenuUL = this.vdmTopBarDiv.querySelector(".dropMenu");

        // Set Title
        this.SetTitle(vdmTitle);

        // Set Status
        if (statusLightColor) {
            this.SetStatusLight(statusLightColor);
        }

        // Resize Window logic
        window.onresize = () => {
            // Loop over all VDMWindow nodes, set drag limits for each
            this.vdmWindowsDiv.querySelectorAll(".vdmWindow").forEach((thisWindow) => {
                $(thisWindow).draggable({
                    handle: '.vdmWindowHeader',
                    containment: [0, thisVDMDesktop.vdmTopBarDiv.offsetHeight, $(window).width() - 50, $(window).height() - 50]
                });
            });
        };

        // Allow Applet JS files to be dropped and immediately instantiated
        //this.enableAppletDropOnElement(this.vdmWindowsDiv);
    }

    SetTitle(titleData) {
        this.vdmTitleText.innerHTML = titleData;
    }

    /**
     * Set VDM Status Light to red, yellow, green or blue
     * @param {string} statusColor
     */
    SetStatusLight(statusColor) {
        this.vdmStatusLed.className = `vdmled ${statusColor}`
    }

    EnableAppletDropOnElement(targetElement) {
        let thisVDMDesktop = this;

        // Add Applet Drop logic
        targetElement.ondragover = function (event) {
            event.preventDefault();
            targetElement.style["background-color"] = "#F88";
        }

        targetElement.ondragleave = function (event) {
            event.preventDefault();
            targetElement.style["background-color"] = null;
        }

        targetElement.ondrop = async (event) => {
            event.preventDefault();
            targetElement.style["background-color"] = null;

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
                    fileObj = await this.ReadDroppedFile(file);
                } catch (ex) {
                    //console.log("Could not read file");
                    return;
                }

                // Parse as JS
                try {
                    droppedApplet = eval(fileObj.contents);
                } catch (ex) {
                    //console.log("Could not parse file contents as JSON");
                    return;
                }

                // If it's an applet profile, instantiate it
                if (droppedApplet.appletName) {
                    //this.addAppletProfile(droppedJSONObj, true);

                    this.OpenApplet(droppedApplet);
                }
            }
        };
    }

    ReadDroppedFile(file) {
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

    DisableBackAndRefreshKeys() {
        document.onkeydown = function (e) {
            if ((e.which || e.keyCode) === 116) {
                e.preventDefault();
            }
            if ((e.which || e.keyCode) === 8 && !e.target.localName.localeCompare("input") && !e.target.localName.localeCompare("textarea")) {
                e.preventDefault();
            }
        };
    }

    /**
     * Add Client app profile
     * @param {VDMAppletModule} appletModule Profile describing new Window
     */
    AddAppletModule(appletModule) {
        let thisVDMDesktop = this;

        let appletProfile = appletModule.AppletProfile;

        // Check to see if we have a name and the necessary attributes
        if (!appletProfile) {
            console.log("Cannot add app - No app definition");
        } else if (!appletProfile.appletName) {
            console.log("Cannot add app - App definition does not contain 'name' parameter");
        } else if (!appletModule.AppletClass) {
            console.log("Cannot add app '" + appletProfile.appletName + "' - Applet module does not have .AppletClass");
        } else {
            thisVDMDesktop.appletModules[appletProfile.appletName] = appletModule;
        }

        if (appletProfile.showInMenu) {
            thisVDMDesktop.AddDropDownMenuItem(function () {
                thisVDMDesktop.OpenApplet(appletModule, null);
            }, appletProfile.appletIcon, appletProfile.title);
        }
    }

    EvalWithinContext(context, code) {
        let outerResults = function (code) {
            let innerResults = eval(code);
            return innerResults;
        }.apply(context, [code]);
        return outerResults;
    }

    /**
     * Load applet prerequisites
     * @param {VDMAppletProfile} appletProfile
     * @param {VDMApplet} appletInstance
     */
    async LoadAppletDependencies(appletProfile, appletInstance) {
        let thisVDMDesktop = this;

        let popOverBox = null;

        if (!appletProfile.dependencies) {
            appletProfile.dependencies = [];
        }

        if (appletProfile.dependencies.length === 0) {
            appletProfile.dependenciesLoaded = true;
        }

        if (appletProfile.dependenciesLoaded) {
            return true;
        }

        let dependenciesToLoad = [];

        // First loop determine if any dependencies need to be loaded
        for (let i = 0; i < appletProfile.dependencies.length; i++) {
            let dependenciesObj = appletProfile.dependencies[i];
            const [dependencyType, dependencyValue] = Object.entries(dependenciesObj)[0];

            // Has the resource been loaded?
            if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                // No - add to list
                let thisDepObj = {};
                thisDepObj[dependencyType] = dependencyValue;
                dependenciesToLoad.push(thisDepObj);
            }
            //}
        }

        // If there are no remaining dependencies, skip loading
        if (dependenciesToLoad.length === 0) {
            appletProfile.dependenciesLoaded = true;
            return true;
        }

        if (appletInstance) {
            // Enabled popover saying dependencies are being loaded
            //popOverDiv.tabindex = 101;
            popOverBox = appletInstance.windowParts.popover.firstChild;
            $(appletInstance.windowParts.popover).fadeIn();
        }

        // Load prerequisites
        for (let i = 0; i < appletProfile.dependencies.length; i++) {
            let dependenciesObj = appletProfile.dependencies[i];
            const [dependencyType, dependencyValue] = Object.entries(dependenciesObj)[0];

            // Updated popover message to show current item being loaded
            if (appletInstance) {
                popOverBox.innerHTML = `Loading dependency [${i + 1}/${appletProfile.dependencies.length}]`;
            }

            try {

                switch (dependencyType) {
                    case 'CSS':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Append it to HEAD
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            let styleNode = document.createElement("style");
                            styleNode.innerHTML = resourceText;
                            document.head.appendChild(styleNode);
                        }
                        break;
                    case 'CSS-Link':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            const template = document.createElement('template');
                            template.innerHTML = dependencyValue;
                            document.head.appendChild(template.content.children[0]);
                        }
                        break;
                    case 'JS':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Run it globally now
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            await thisVDMDesktop.EvalWithinContext(window, resourceText);
                        }
                        break;
                    case 'JS-Runtime':

                        // Cache for execution at runtime (executes before runStartup)
                        let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                        appletProfile.startupScript = resourceText;

                        break;
                    case 'JS-Head':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Run it globally now
                            let script = document.createElement('script');
                            script.src = dependencyValue;
                            script.defer = true;

                            document.head.appendChild(script);
                        }
                        break;
                    case 'JSON':
                        if (thisVDMDesktop.loadedResources.indexOf(dependencyValue) === -1) {
                            thisVDMDesktop.loadedResources.push(dependencyValue);

                            // Cache for use at runtime
                            let resourceText = await thisVDMDesktop.FetchURLResource(dependencyValue);
                            thisVDMDesktop.sharedJSON[dependencyValue] = resourceText;

                        }
                        break;
                    default:
                        if (appletInstance) {
                            popOverBox.innerHTML = `Unknown dependency type:<br>${dependencyType}`
                        }
                        return false;
                }
            } catch (ex) {
                // Ran into error loading dependency
                if (appletInstance) {
                    popOverBox.innerHTML = `Could not load dependency:<br>${dependencyValue}`
                }
                return false;
            }
            //}
        }

        appletProfile.dependenciesLoaded = true;

        if (appletInstance) {
            // Disable popover saying dependencies are being loaded
            popOverBox.innerHTML = "";
            $(appletInstance.windowParts.popover).fadeOut();
        }

        return true;
    }

    async PreloadAppletDependencies() {
        let thisVDMDesktop = this;
        for (const [appletName, appletModule] of Object.entries(thisVDMDesktop.appletModules)) {
            // If the preloadDeps flag is set, load dependencies
            if (appletModule.AppletProfile.preloadDeps) {
                await thisVDMDesktop.LoadAppletDependencies(appletModule.AppletProfile);
            }
        }
        thisVDMDesktop.loaded = true;
    }

    FetchURLResource(url) {
        let thisVDMDesktop = this;
        return new Promise(function (resolve, reject) {
            let xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send();
        });
    }

    // Add Item to Drop down menu
    AddDropDownMenuItem(onClickAction, iconClass, itemLabel) {
        let thisVDMDesktop = this;

        let itemLI = document.createElement("li");
        let itemA = document.createElement("span");
        itemA.onclick = onClickAction;
        let itemI = document.createElement("i");
        itemI.className = `fa ${iconClass}`
        let itemSpan = document.createElement("span");
        itemSpan.className = `link-title`;
        itemSpan.innerHTML = `&nbsp;${itemLabel}`
        itemA.appendChild(itemI);
        itemA.appendChild(itemSpan);
        itemLI.appendChild(itemA);
        thisVDMDesktop.vdmTopBarMenuUL.append(itemLI);
    }

    /**
     * Instantiate an applet using a registered profile name and parameters
     * @param {VDMAppletModule} appletModule
     * @param {any} parameters
     */
    async OpenApplet(appletModule, parameters) {
        let thisVDMDesktop = this;

        // Sender should be sending a module - was a string sent instead?
        if (typeof appletModule === "string") {
            // Yes - get a registered applet by name
            let appletModuleName = appletModule;
            appletModule = thisVDMDesktop.appletModules[appletModuleName];
            if (!appletModule) {
                throw new Error(`Applet name is not registered - '${appletModuleName}'`);
            }
        }

        // Create new instance of applet
        let newApplet = new appletModule.AppletClass(appletModule.AppletProfile, parameters);

        // Link back to VDM Desktop
        newApplet.vdmDesktop = thisVDMDesktop;

        // This is essentially a 'pid' within the VDMDesktop
        newApplet.appletIndex = this.appletCreateIndex;

        // Increment the window create index
        this.appletCreateIndex++;

        // Create new Window DIV
        let thisWindowDiv = document.createElement("div");
        thisWindowDiv.id = `vdmWindow-${this.appletCreateIndex}`;
        thisWindowDiv.className = "vdmWindow";
        newApplet.windowDiv = thisWindowDiv;
        newApplet.windowID = thisWindowDiv.id;
        thisVDMDesktop.vdmWindowsDiv.appendChild(thisWindowDiv);

        // Set position, index, height and width
        thisWindowDiv.style.top = ((thisVDMDesktop.appletCreateIndex & 7) + 1) * 10 + 'px';
        thisWindowDiv.style.left = ((thisVDMDesktop.appletCreateIndex & 7) + 1) * 10 + 'px';
        thisWindowDiv.style.zIndex = 1;
        thisWindowDiv.style.width = newApplet.sizeX + 'px';
        thisWindowDiv.style.height = newApplet.sizeY + 'px';

        // See if we have menuItems
        let haveMenuItems = newApplet.menu && Object.keys(newApplet.menu).length > 0;

        // Add member elements to windowDiv
        thisWindowDiv.innerHTML = `
<div class="vdmWindowHeader">
    <span class="title">${newApplet.title}</span>
    <span class="ctrls">
        <span class="maximize"><i class="fa fa-square-o fa-lg" style="font-weight: bold; color: #c3af73; top: 2px; right: 5px; position: relative;"></i></span>
        <span class="close"><i class="fa fa-times fa-lg" style="top: 1px; right: 0px; position: relative;"></i></span>
    </span></div>
<div class="vdmWindowMenu"></div>
<div class="vdmWindowData"></div>
<div class="vdmWindowFooter"></div>
<div class="vdmWindowPopover"><div class="popoverbox" tabindex=0></div></div>
`;

        // Assign elements to windowObj
        newApplet.windowParts = {
            "header": newApplet.windowDiv.querySelector(".vdmWindowHeader"),
            "menu": newApplet.windowDiv.querySelector(".vdmWindowMenu"),
            "data": newApplet.windowDiv.querySelector(".vdmWindowData"),
            "footer": newApplet.windowDiv.querySelector(".vdmWindowFooter"),
            "popover": newApplet.windowDiv.querySelector(".vdmWindowPopover"),
            "maximize": newApplet.windowDiv.querySelector(".maximize"),
            "close": newApplet.windowDiv.querySelector(".close")
        };

        // Shortcut for applet devs to access data pane
        newApplet.dataPane = newApplet.windowParts.data;

        if (!haveMenuItems) {
            newApplet.windowParts.data.style.top = "18px";
            newApplet.windowParts.menu.style.display = "none";
        }

        // Assign action to Maximize button
        newApplet.windowParts.maximize.onclick = async function () {
            let elem = newApplet.windowParts.data;

            // Define fullscreen exit handler
            let exitHandler = () => {
                if (elem.requestFullscreen) {
                    document.removeEventListener('fullscreenchange', exitHandler, false);
                } else if (elem.webkitRequestFullscreen) { /* Safari */
                    document.removeEventListener('webkitfullscreenchange', exitHandler, false);
                } else if (elem.msRequestFullscreen) { /* IE11 */
                    document.removeEventListener('msfullscreenchange', exitHandler, false);
                }

                // Call resizing hook if set
                if (typeof newApplet.resizeMovingHook !== "undefined") {
                    newApplet.resizeMovingHook();
                }
            }

            // Execute relevant fullscreen request
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) { /* IE11 */
                await elem.msRequestFullscreen();
            }

            // Insert delay.  The following event listeners were firing prematurely
            // when called immediately after the requestFullscreen functions.  Works
            // as low as 1ms on Skylake PC, but upping to 100 in case slower systems
            // need the extra time.
            await new Promise(res => setTimeout(res, 100));

            // Add fullscreenchange event listener so we know when to resize
            if (elem.requestFullscreen) {
                document.addEventListener('fullscreenchange', exitHandler, false);
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                document.addEventListener('webkitfullscreenchange', exitHandler, false);
            } else if (elem.msRequestFullscreen) { /* IE11 */
                document.addEventListener('msfullscreenchange', exitHandler, false);
            }

            // Call resizing hook if set
            if (typeof newApplet.resizeMovingHook !== "undefined") {
                newApplet.resizeMovingHook();
            }
        };

        // Assign action to Close button
        newApplet.windowParts.close.onclick = async function () {
            thisVDMDesktop.CloseApplet(newApplet);
        };

        // If we have an HTML template file, retrieve and copy to the data window
        if (typeof newApplet.htmlFile !== "undefined") {
            let resourceText = await thisVDMDesktop.FetchURLResource(newApplet.htmlFile);
            newApplet.windowParts.data.innerHTML = resourceText;
        }

        // If we have a Startup Script, run it
        if (newApplet.appletName && thisVDMDesktop.appletModules[newApplet.appletName] && thisVDMDesktop.appletModules[newApplet.appletName].startupScript !== '') {
            thisVDMDesktop.EvalWithinContext(newApplet, thisVDMDesktop.appletModules[newApplet.appletName].startupScript);
        }

        // Create and populate menu element
        newApplet.CreateTopMenu();

        // Populate footer element with Size Report and Resize button
        newApplet.windowParts.footer.innerHTML = `
            <div class="sizeReport">${thisWindowDiv.clientWidth},${thisWindowDiv.clientHeight}</div>
            <div class="resize"><i class="fa fa-angle-double-right fa-lg"></i></div>
        `;

        // Make Window draggable
        $(thisWindowDiv).draggable({
            handle: '.vdmWindowHeader',
            containment: [0, thisVDMDesktop.vdmTopBarDiv.offsetHeight, $(window).width() - 50, $(window).height() - 50],
            //zIndex: 1,
            start: function (event, ui) {
                thisWindowDiv.style["z-index-cur"] = thisWindowDiv.style["z-index"];
                thisWindowDiv.style["z-index"] = "999999";
                thisWindowDiv.style["cursor"] = "pointer";
                //$(this).css("z-index-cur", $(this).css("z-index"));
                //$(this).css("z-index", "999999");
                //$(this).css("cursor", "pointer");
            },
            stop: function (event, ui) {
                thisWindowDiv.style["z-index"] = thisWindowDiv.style["z-index-cur"];
                thisWindowDiv.style["cursor"] = "auto";
                //$(this).css("z-index", $(this).css("z-index-cur"));
                //$(this).css("cursor", "auto");
                if (typeof newApplet.resizeMovingHook !== "undefined") {
                    newApplet.resizeMovingHook();
                }
            }
        });

        // Set default drag/drop actions
        thisWindowDiv.ondragover = function (event) {
            event.preventDefault();
        }

        thisWindowDiv.ondragleave = function (event) {
            event.preventDefault();
        }

        thisWindowDiv.ondrop = async (event) => {
            event.preventDefault();
        }

        // Make Window active on mouse down (if not already selected)
        $(thisWindowDiv).bind("mousedown", function (e) {
            if (newApplet !== thisVDMDesktop.currentActiveWindow) {
                thisVDMDesktop.SwitchActiveWindow(newApplet);
            }
        });

        // Apply controls to Resize button
        let divResize = $(thisWindowDiv).find('.resize');
        $(divResize).mousedown(function (e) {
            let resizeDiv = $(this).parent().parent();
            let containerDiv = $(resizeDiv).parent().parent();
            let divSizeOut = $(resizeDiv).find('.sizeReport');
            let mouseStartX = e.pageX;
            let mouseStartY = e.pageY;
            let pageStartX = $(resizeDiv).width();
            let pageStartY = $(resizeDiv).height();
            $(containerDiv).bind('mousemove', function (e) {
                let gParentDiv = resizeDiv;
                let gParentWidth = pageStartX - (mouseStartX - e.pageX);
                let gParentHeight = pageStartY - (mouseStartY - e.pageY);
                $(gParentDiv).width(gParentWidth);
                $(gParentDiv).height(gParentHeight);
                $(divSizeOut).html(gParentWidth + ',' + gParentHeight);
                if (typeof newApplet.resizeMovingHook !== "undefined") {
                    newApplet.resizeMovingHook();
                }
            });
            $(containerDiv).bind('mouseup', function (e) {
                $(this).unbind('mousemove');
            });
        });

        // Add to vdmWindows array
        this.vdmWindows.push(newApplet);

        // Add to Applet list
        thisVDMDesktop.appletInstances[newApplet.appletIndex] = newApplet;

        // Make Window active now
        thisVDMDesktop.SwitchActiveWindow(newApplet);

        // Load prerequisites
        let allLoaded = await this.LoadAppletDependencies(appletModule.AppletProfile, newApplet);

        // Run startup script
        if (allLoaded && newApplet.RunStartup) {
            newApplet.RunStartup();
        }
    }

    /**
     * Close an Applet
     * @param {VDMApplet} appletObj
     */
    CloseApplet(appletObj) {
        let thisVDMDesktop = this;

        // Run Pre Close Handler if it exists
        if (typeof appletObj.preCloseHandler !== "undefined" && typeof appletObj.preCloseHandler === 'function') {
            appletObj.preCloseHandler();
        }

        // Delete Window Element
        let element = document.getElementById(appletObj.windowID);
        element.parentNode.removeChild(element);

        // Run Post Close
        if (typeof appletObj.postCloseHandler !== "undefined" && typeof appletObj.postCloseHandler === 'function') {
            appletObj.postCloseHandler();
        }

        // Remove from vdmWindows array
        let windowIndex = thisVDMDesktop.vdmWindows.indexOf(appletObj);
        thisVDMDesktop.vdmWindows.splice(windowIndex, 1);

        // Remove applet instance
        delete thisVDMDesktop.appletInstances[appletObj.appletIndex];
    }

    /**
     * 
     * @param {VDMWindow} newActiveWindow
     */
    SwitchActiveWindow(newActiveWindow) {
        let thisVDMDesktop = this;

        // Note previous active window and update the current active window
        let previousActiveWindow = thisVDMDesktop.currentActiveWindow;
        thisVDMDesktop.currentActiveWindow = newActiveWindow;

        // Set to HTMLElement to inactive class
        if (previousActiveWindow) {
            previousActiveWindow.windowDiv.classList.remove('active');
        }

        // Set to HTMLElement to active class
        newActiveWindow.windowDiv.classList.add('active');

        // If there's more than one window, move the current one to the end
        if (thisVDMDesktop.vdmWindows.length > 1) {

            // Pull this VDMWindow from the window array and move to the end
            let windowIndex = thisVDMDesktop.vdmWindows.indexOf(newActiveWindow);
            thisVDMDesktop.vdmWindows.splice(windowIndex, 1);
            thisVDMDesktop.vdmWindows.push(newActiveWindow);
        }

        // Reapply zIndexes
        for (let i = 0; i < thisVDMDesktop.vdmWindows.length; i++) {
            let thisVDMWindow = thisVDMDesktop.vdmWindows[i];

            // Set the zIndex on the VDMWindow DIV
            thisVDMWindow.windowDiv.style.zIndex = i + 1;
        }
    }
}

/**
 * Base Window attributes
 * @param {string} title Window title
 * @param {number} sizeX Window width
 * @param {number} sizeY Window height
 */
class BaseWindowDef {
    constructor(title, sizeX, sizeY) {
        this.title = title;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
    }
}

/**
 * VDM Desktop manager
 * @param {string} appletName Applet Name
 * @param {string} appletIcon Applet Icon
 */
class VDMAppletProfile {
    constructor() {
        this.appletName = "";
        this.appletIcon = "";
        this.appletPath = "";
        this.appletScript = "";
        this.appletClassText = "";
        this.showInMenu = true;
        this.preloadDeps = false;
        this.dependencies = [];
        this.dependenciesLoaded = false;
        this.startupScript = "";
        this.title = "";
        this.sizeX = 300;
        this.sizeY = 250;
    }
}

class VDMAppletModule {
    /**
     * Create a new VDM Applet module
     */
    constructor() {
        /** @type VDMAppletProfile */
        this.AppletProfile = null;

        /** @type VDMApplet */
        this.AppletClass = null;

        /** @type string */
        this.ModuleCode = null;

        /** @type string */
        this.ClassCode = null;
    }

    async LoadFromString(appletModuleCode) {
        let blob = new Blob([appletModuleCode], { type: 'text/javascript' })
        let url = URL.createObjectURL(blob)
        let module = await import(url);
        URL.revokeObjectURL(url) // GC objectURLs

        // Validate module format
        let appletPackagePattern = /^(class AppletClass extends (?:VDMApplet|DRPApplet) {(?:.|\r?\n)*})\r?\n\r?\nlet AppletProfile = ({(?:\s+.*\r?\n)+})\r?\n\r?\n?export { AppletProfile, AppletClass };?\r?\n\/\/# sourceURL=vdm-app-\w+\.js$/gm;
        let appletPackageParts = appletPackagePattern.exec(appletModuleCode);

        if (!appletPackageParts) {
            throw new Error(`Module code does not pass regex check`);
        }

        this.AppletProfile = module.AppletProfile;
        this.AppletClass = module.AppletClass;
        this.ModuleCode = appletModuleCode;
        this.ClassCode = appletPackageParts[1];
    }
}

/**
 * VDM Window
 * @param {BaseWindowDef} windowProfile Profile describing new Window
 */
class VDMWindow {
    constructor(windowProfile) {

        // Assigned on newWindow
        this.vdmDesktop = null;

        // Attributes from profile
        this.title = windowProfile.title;
        this.sizeX = windowProfile.sizeX;
        this.sizeY = windowProfile.sizeY;

        // Attributes which will be assigned upon window DIV creation
        this.windowID = null;

        /** @type HTMLElement */
        this.windowDiv = null;

        this.windowParts = {
            /** @type HTMLElement */
            header: null,
            /** @type HTMLElement */
            menu: null,
            /** @type HTMLElement */
            data: null,
            /** @type HTMLElement */
            footer: null,
            /** @type HTMLElement */
            popover: null
        };

        /** @type HTMLElement */
        this.dataPane = null;

        this.menu = {};

        this.menuSearch = null;

        this.menuQuery = null;
    }

    RunStartup() {
    }

    CreateTopMenu() {
        let mainMenu = document.createElement("ul");
        this.windowParts.mainMenu = mainMenu;
        for (const [menuHeader, menuItems] of Object.entries(this.menu)) {
            this.AddTopMenuEntry(menuHeader, menuItems);
        }

        // If the applet has a menuSearch defined, display the box
        if (this.menuSearch) {
            let menuCol = document.createElement("li");
            menuCol.className = "searchBox";
            let searchTag = document.createElement("div");
            searchTag.innerHTML = `&nbsp;&nbsp;&nbsp;&nbsp;Search&nbsp;`;
            let inputBox = document.createElement("input");
            this.menuSearch.searchField = inputBox;
            menuCol.appendChild(searchTag);
            menuCol.appendChild(inputBox);
            mainMenu.appendChild(menuCol);
        }

        // If the applet has a menuQuery defined, display the box
        if (this.menuQuery) {
            let menuCol = document.createElement("li");
            menuCol.className = "queryBox";
            let queryTag = document.createElement("div");
            queryTag.innerHTML = `&nbsp;&nbsp;&nbsp;&nbsp;Query&nbsp;`;
            let inputBox = document.createElement("textarea");
            this.menuQuery.queryField = inputBox;
            menuCol.appendChild(queryTag);
            menuCol.appendChild(inputBox);
            mainMenu.appendChild(menuCol);
        }

        // Add the menu
        this.windowParts.menu.appendChild(mainMenu);
    }

    AddTopMenuEntry(menuHeader, menuItems) {
        // Create new top entry (File, Edit, etc.)
        let menuCol = document.createElement("li");
        let menuTop = document.createElement("span");
        menuTop.tabIndex = 1;
        menuTop.append(menuHeader);
        let menuOptionList = document.createElement("ul");
        for (const [optionName, optionValue] of Object.entries(menuItems)) {
            let optRef = document.createElement("span");
            optRef.onclick = optionValue;
            optRef.append(optionName);
            let optLi = document.createElement("li");
            optLi.appendChild(optRef);
            menuOptionList.appendChild(optLi);
        }
        menuCol.appendChild(menuTop);
        menuCol.appendChild(menuOptionList);
        this.windowParts.mainMenu.appendChild(menuCol);
    }

    /**
     * Split paneDiv into left and right panes
     * @param {HTMLDivElement} paneDiv DIV to split
     * @param {number} splitOffset Offset from left
     * @param {boolean} scrollLeft Offer scroll on returned left pane
     * @param {boolean} scrollRight Offer scroll on returned right pane
     * @return {HTMLDivElement[]} Array of return elements [leftPane, divider, rightPane]
     */
    SplitPaneHorizontal(paneDiv, splitOffset, scrollLeft, scrollRight) {
        let thisVDMWindow = this;
        let a = document.createElement("div");
        a.className = "dwData dwData-LeftPane";
        let b = document.createElement("div");
        b.className = "dwData dwData-VDiv";
        let c = document.createElement("div");
        c.className = "dwData dwData-RightPane";
        paneDiv.appendChild(a);
        paneDiv.appendChild(b);
        paneDiv.appendChild(c);
        b.style.left = splitOffset + 'px';
        a.style.width = splitOffset - 1 + 'px';
        c.style.left = splitOffset + 4 + 'px';

        if (scrollLeft) { a.style.overflowY = "auto" } else { a.style.overflowY = "hidden" };
        if (scrollRight) { c.style.overflowY = "auto" } else { c.style.overflowY = "hidden" };

        $(b).mousedown(function (e) {
            let mouseStartX = e.pageX;
            let pageStartX = parseInt(b.style.left);
            $(paneDiv).bind('mousemove', function (e) {
                let newOffset = pageStartX + (e.pageX - mouseStartX);
                b.style.left = newOffset + 'px';
                a.style.width = newOffset - 1 + 'px';
                c.style.left = newOffset + 4 + 'px';
            });
            $(paneDiv).bind('mouseup', function (e) {
                $(this).unbind('mousemove');
                if (typeof thisVDMWindow.resizeMovingHook !== "undefined") {
                    thisVDMWindow.resizeMovingHook();
                }
            });
        });
        return [a, b, c];
    }

    /**
     * Split paneDiv into top and bottom panes
     * @param {HTMLDivElement} paneDiv DIV to split
     * @param {number} splitOffset Offset from top
     * @param {boolean} scrollTop Offer scroll on returned top pane
     * @param {boolean} scrollBottom Offer scroll on returned bottom pane
     * @return {HTMLDivElement[]} Array of return elements [topPane, divider, bottomPane]
     */
    SplitPaneVertical(paneDiv, splitOffset, scrollTop, scrollBottom) {
        let thisVDMWindow = this;
        let a = document.createElement("div");
        a.className = "dwData dwData-TopPane";
        let b = document.createElement("div");
        b.className = "dwData dwData-HDiv";
        let c = document.createElement("div");
        c.className = "dwData dwData-BottomPane";
        paneDiv.appendChild(a);
        paneDiv.appendChild(b);
        paneDiv.appendChild(c);
        b.style.top = splitOffset + 'px';
        a.style.height = splitOffset - 1 + 'px';
        c.style.top = splitOffset + 4 + 'px';

        if (scrollTop) { a.style.overflowY = "auto" } else { a.style.overflowY = "hidden" };
        if (scrollBottom) { c.style.overflowY = "auto" } else { c.style.overflowY = "hidden" };

        $(b).mousedown(function (e) {
            let mouseStartY = e.pageY;
            let pageStartY = parseInt($(b).css('top'));
            $(paneDiv).bind('mousemove', function (e) {
                let newOffset = pageStartY + (e.pageY - mouseStartY);
                b.style.top = newOffset + 'px';
                a.style.height = newOffset - 1 + 'px';
                c.style.top = newOffset + 4 + 'px';
            });
            $(paneDiv).bind('mouseup', function (e) {
                $(this).unbind('mousemove');
                if (typeof thisVDMWindow.resizeMovingHook !== "undefined") {
                    thisVDMWindow.resizeMovingHook();
                }
            });
        });
        return [a, b, c];
    }
}

class VDMApplet extends VDMWindow {
    constructor(appletProfile) {
        super(appletProfile);

        let thisVDMApplet = this;

        // Attributes from profile
        this.appletName = appletProfile.appletName;
        this.appletPath = appletProfile.appletPath;

        // Attributes which will be assigned upon window DIV creation
        this.appletIndex = 0;
    }
}

class VDMCollapseTree {
    constructor(menuParentDiv) {
        //let thisTreeMenu = this;
        this.parentDiv = menuParentDiv;
        this.parentDiv.innerHTML = '';
        this.menuTopUL = document.createElement("ul");
        this.menuTopUL.className = "vdm-CollapseTree";
        this.parentDiv.appendChild(this.menuTopUL);
    }

    addItem(parentObjRef, newItemTag, newItemClass, newItemRef, isParent, clickFunction) {
        // First use subMenuArr to find the target UL
        let targetUL = null;
        if (parentObjRef) {
            targetUL = parentObjRef.leftMenuUL;
        } else {
            targetUL = this.menuTopUL;
        }

        let newLI = document.createElement("li");
        let newSpan = document.createElement("span");
        newSpan.className = newItemClass;
        newSpan.innerHTML = newItemTag;
        newItemRef.leftMenuSpan = newSpan;
        newItemRef.leftMenuLI = newLI;
        newLI.appendChild(newSpan);
        if (isParent) {
            newLI.className = "parent";
            let newUL = document.createElement("ul");
            newLI.appendChild(newUL);
            newItemRef.leftMenuUL = newUL;
            $(newSpan).on('click', function () {
                $(this).parent().toggleClass('active');
                $(this).parent().children('ul').toggle();
                clickFunction(newItemRef);
            });
        } else {
            $(newSpan).on('click', function () {
                clickFunction(newItemRef);
            });
        }
        targetUL.appendChild(newLI);
    }
}