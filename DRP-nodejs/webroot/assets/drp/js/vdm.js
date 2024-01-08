// VDM Desktop
/**
 * VDM Desktop manager
 * @param {HTMLDivElement} parentDiv Parent div for the VDM
 * @param {string} vdmTitle Title on top bar
 * @param {string} statusLightColor Initial status light color
 * @param {Object.<string,VDMAppletProfile>} appletProfiles Dictionary of applet profiles
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

        // App Profiles
        this.appletProfiles = {};

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

                    this.OpenApp(droppedApplet);
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
     * @param {VDMAppletProfile} appletProfile Profile describing new Window
     * @param {boolean} override Force VDM to override the existing appletProfile
     */
    AddAppletProfile(appletProfile, override) {
        let thisVDMDesktop = this;

        // Check to see if we have a name and the necessary attributes
        if (!appletProfile) {
            console.log("Cannot add app - No app definition");
        } else if (!appletProfile.appletName) {
            console.log("Cannot add app - App definition does not contain 'name' parameter");
        } else if (!appletProfile.appletClass && !appletProfile.appletClassFile && !appletProfile.appletClassText) {
            console.log("Cannot add app '" + appletProfile.appletName + "' - App definition does not contain 'appletClass', 'appletClassFile' or 'appletClassText' values");
        } else {
            thisVDMDesktop.appletProfiles[appletProfile.appletName] = appletProfile;
        }

        //thisVDMDesktop.loadAppletResources(appletProfile, override);

        if (appletProfile.showInMenu) {
            thisVDMDesktop.AddDropDownMenuItem(function () {
                thisVDMDesktop.OpenApp(appletProfile, null);
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
     * Retrieve applet class code from URL, eval and assign the class object
    * @param {VDMAppletProfile} appletProfile
    */
    async LoadAppletClassObject(appletProfile) {
        let thisVDMDesktop = this;
        let appletClassText = null;
        if (appletProfile.appletClassText) {
            appletClassText = appletProfile.appletClassText;
        } else {
            let classScriptURL = thisVDMDesktop.appletPath + '/' + appletProfile.appletClassFile;
            appletClassText = await thisVDMDesktop.FetchURLResource(classScriptURL);
        }
        appletProfile.appletClass = eval(appletClassText);
    }

    /**
     * Load applet prerequisites
     * @param {VDMAppletProfile} appletProfile
     */
    async LoadAppletPreReqs(appletProfile) {
        let thisVDMDesktop = this;

        // Load prerequisites
        for (let i = 0; i < appletProfile.preReqs.length; i++) {
            let preReqHash = appletProfile.preReqs[i];
            let preReqKeys = Object.keys(preReqHash);
            for (let j = 0; j < preReqKeys.length; j++) {
                let preReqType = preReqKeys[j];
                let preReqValue = preReqHash[preReqType];

                switch (preReqType) {
                    case 'CSS':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqValue) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqValue);

                            // Append it to HEAD
                            let resourceText = await thisVDMDesktop.FetchURLResource(preReqValue);
                            let styleNode = document.createElement("style");
                            styleNode.innerHTML = resourceText;
                            document.head.appendChild(styleNode);
                        }
                        break;
                    case 'CSS-Link':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqValue) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqValue);

                            const template = document.createElement('template');
                            template.innerHTML = preReqValue;
                            document.head.appendChild(template.content.children[0]);
                        }
                        break;
                    case 'JS':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqValue) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqValue);

                            // Run it globally now
                            let resourceText = await thisVDMDesktop.FetchURLResource(preReqValue);
                            jQuery.globalEval(resourceText);
                        }
                        break;
                    case 'JS-Runtime':

                        // Cache for execution at runtime (executes before runStartup)
                        let resourceText = await thisVDMDesktop.FetchURLResource(preReqValue);
                        appletProfile.startupScript = resourceText;

                        break;
                    case 'JS-Head':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqValue) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqValue);

                            // Run it globally now
                            let script = document.createElement('script');
                            script.src = preReqValue;
                            script.defer = true;

                            document.head.appendChild(script);
                        }
                        break;
                    case 'JSON':
                        if (thisVDMDesktop.loadedResources.indexOf(preReqValue) === -1) {
                            thisVDMDesktop.loadedResources.push(preReqValue);

                            // Cache for use at runtime
                            let resourceText = await thisVDMDesktop.FetchURLResource(preReqValue);
                            thisVDMDesktop.sharedJSON[preReqValue] = resourceText;

                        }
                        break;
                    default:
                        alert("Unknown prerequisite type: '" + preReqType + "'");
                        return false;
                }
            }
        }
    }

    /**
     * Load class code and dependencies
     * @param {VDMAppletProfile} appletProfile
     * @param {boolean} override
     */
    async LoadAppletResources(appletProfile, override) {
        let thisVDMDesktop = this;

        // Skip if already loaded
        if (!override && appletProfile.resourcesLoaded) {
            return;
        }

        // If class object isn't set, fetch class code and eval to assign to profile
        if (!appletProfile.appletClass) {
            await thisVDMDesktop.LoadAppletClassObject(appletProfile);
        }

        // Fetch any prerequisites
        await thisVDMDesktop.LoadAppletPreReqs(appletProfile);

        // Set resourcesLoaded to true so we don't try to load them again
        appletProfile.resourcesLoaded = true;
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

    // Instantiate an applet using a registered profile name and parameters
    async OpenApp(appDefinition, parameters) {
        let thisVDMDesktop = this;

        // Load prerequisites
        await this.LoadAppletPreReqs(appDefinition);

        // Create new instance of applet
        let newApp = new appDefinition.appletClass(appDefinition, parameters);

        // Attach window to applet
        await thisVDMDesktop.NewWindow(newApp);

        // Add to Applet list
        thisVDMDesktop.appletInstances[newApp.appletIndex] = newApp;
    }

    // Create a new window using the provided profile (not necessarily registered)
    async NewWindow(newAppletObj) {
        let thisVDMDesktop = this;

        // Link back to VDM Desktop
        newAppletObj.vdmDesktop = thisVDMDesktop;

        // This is essentially a 'pid' within the VDMDesktop
        newAppletObj.appletIndex = this.appletCreateIndex;

        // Increment the window create index
        this.appletCreateIndex++;

        // Create new Window DIV
        let thisWindowDiv = document.createElement("div");
        thisWindowDiv.id = `vdmWindow-${this.appletCreateIndex}`;
        thisWindowDiv.className = "vdmWindow";
        newAppletObj.windowDiv = thisWindowDiv;
        newAppletObj.windowID = thisWindowDiv.id;
        thisVDMDesktop.vdmWindowsDiv.appendChild(thisWindowDiv);

        // Set position, index, height and width
        thisWindowDiv.style.top = ((thisVDMDesktop.appletCreateIndex & 7) + 1) * 10 + 'px';
        thisWindowDiv.style.left = ((thisVDMDesktop.appletCreateIndex & 7) + 1) * 10 + 'px';
        thisWindowDiv.style.zIndex = 1;
        thisWindowDiv.style.width = newAppletObj.sizeX + 'px';
        thisWindowDiv.style.height = newAppletObj.sizeY + 'px';

        // See if we have menuItems
        let haveMenuItems = newAppletObj.menu && Object.keys(newAppletObj.menu).length > 0;

        // Add member elements to windowDiv
        thisWindowDiv.innerHTML = `
<div class="vdmWindowHeader">
    <span class="title">${newAppletObj.title}</span>
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
        newAppletObj.windowParts = {
            "header": newAppletObj.windowDiv.querySelector(".vdmWindowHeader"),
            "menu": newAppletObj.windowDiv.querySelector(".vdmWindowMenu"),
            "data": newAppletObj.windowDiv.querySelector(".vdmWindowData"),
            "footer": newAppletObj.windowDiv.querySelector(".vdmWindowFooter"),
            "popover": newAppletObj.windowDiv.querySelector(".vdmWindowPopover"),
            "maximize": newAppletObj.windowDiv.querySelector(".maximize"),
            "close": newAppletObj.windowDiv.querySelector(".close")
        };

        if (!haveMenuItems) {
            newAppletObj.windowParts.data.style.top = "18px";
            newAppletObj.windowParts.menu.style.display = "none";
        }

        // Assign action to Maximize button
        newAppletObj.windowParts.maximize.onclick = async function () {
            let elem = newAppletObj.windowParts.data;

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
                if (typeof newAppletObj.resizeMovingHook !== "undefined") {
                    newAppletObj.resizeMovingHook();
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
            if (typeof newAppletObj.resizeMovingHook !== "undefined") {
                newAppletObj.resizeMovingHook();
            }
        };

        // Assign action to Close button
        newAppletObj.windowParts.close.onclick = async function () {
            thisVDMDesktop.CloseWindow(newAppletObj);
        };

        // If we have an HTML template file, retrieve and copy to the data window
        if (typeof newAppletObj.htmlFile !== "undefined") {
            let resourceText = await thisVDMDesktop.FetchURLResource(newAppletObj.htmlFile);
            newAppletObj.windowParts.data.innerHTML = resourceText;
        }

        // If we have a Startup Script, run it
        if (newAppletObj.appletName && thisVDMDesktop.appletProfiles[newAppletObj.appletName] && thisVDMDesktop.appletProfiles[newAppletObj.appletName].startupScript !== '') {
            thisVDMDesktop.EvalWithinContext(newAppletObj, thisVDMDesktop.appletProfiles[newAppletObj.appletName].startupScript);
        }

        // Create and populate menu element
        let mainMenu = document.createElement("ul");
        for (const [menuHeader, menuItems] of Object.entries(newAppletObj.menu)) {
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
            mainMenu.appendChild(menuCol);
        }

        // If the applet has a menuSearch defined, display the box
        if (newAppletObj.menuSearch) {
            let menuCol = document.createElement("li");
            menuCol.className = "searchBox";
            let searchTag = document.createElement("div");
            searchTag.innerHTML = `&nbsp;&nbsp;&nbsp;&nbsp;Search&nbsp;`;
            let inputBox = document.createElement("input");
            newAppletObj.menuSearch.searchField = inputBox;
            menuCol.appendChild(searchTag);
            menuCol.appendChild(inputBox);
            mainMenu.appendChild(menuCol);
        }

        // If the applet has a menuQuery defined, display the box
        if (newAppletObj.menuQuery) {
            let menuCol = document.createElement("li");
            menuCol.className = "queryBox";
            let queryTag = document.createElement("div");
            queryTag.innerHTML = `&nbsp;&nbsp;&nbsp;&nbsp;Query&nbsp;`;
            let inputBox = document.createElement("textarea");
            newAppletObj.menuQuery.queryField = inputBox;
            menuCol.appendChild(queryTag);
            menuCol.appendChild(inputBox);
            mainMenu.appendChild(menuCol);
        }

        // Add the menu
        newAppletObj.windowParts.menu.appendChild(mainMenu);

        // Populate footer element with Size Report and Resize button
        newAppletObj.windowParts.footer.innerHTML = `
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
                if (typeof newAppletObj.resizeMovingHook !== "undefined") {
                    newAppletObj.resizeMovingHook();
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
            if (newAppletObj !== thisVDMDesktop.currentActiveWindow) {
                thisVDMDesktop.SwitchActiveWindow(newAppletObj);
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
                if (typeof newAppletObj.resizeMovingHook !== "undefined") {
                    newAppletObj.resizeMovingHook();
                }
            });
            $(containerDiv).bind('mouseup', function (e) {
                $(this).unbind('mousemove');
            });
        });

        // Run post open handler
        if (newAppletObj.PostOpenHandler) {
            newAppletObj.PostOpenHandler();
        }

        // Run startup script
        if (newAppletObj.RunStartup) {
            newAppletObj.RunStartup();
        }

        // Add to vdmWindows array
        this.vdmWindows.push(newAppletObj);

        // Make Window active now
        thisVDMDesktop.SwitchActiveWindow(newAppletObj);
    }

    CloseWindow(closeWindow) {
        let thisVDMDesktop = this;

        // Run Pre Close Handler if it exists
        if (typeof closeWindow.preCloseHandler !== "undefined" && typeof closeWindow.preCloseHandler === 'function') {
            closeWindow.preCloseHandler();
        }

        // Delete Window Element
        let element = document.getElementById(closeWindow.windowID);
        element.parentNode.removeChild(element);

        // Run Post Close
        if (typeof closeWindow.postCloseHandler !== "undefined" && typeof closeWindow.postCloseHandler === 'function') {
            closeWindow.postCloseHandler();
        }

        // Remove from vdmWindows array
        let windowIndex = thisVDMDesktop.vdmWindows.indexOf(closeWindow);
        thisVDMDesktop.vdmWindows.splice(windowIndex, 1);
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
        this.appletClassFile = "";
        this.appletClassText = "";
        this.appletClass = null;
        this.showInMenu = true;
        this.resourcesLoaded = false;
        this.startupScript = "";
        this.title = "";
        this.sizeX = 300;
        this.sizeY = 250;
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
            "header": null,
            "menu": null,
            "data": null,
            "footer": null,
            "popover": null
        };

        // Attributes which should be specified in each applet definition
        this.preReqs = [];

        this.menu = {};

        this.menuSearch = null;

        this.menuQuery = null;

        this.appFuncs = {};

        this.appVars = {};
    }

    RunStartup() {
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
        paneDiv.classList.add("parent");
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
        $(paneDiv).addClass("parent");
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

export { VDMDesktop, VDMWindow, VDMApplet, VDMAppletProfile };