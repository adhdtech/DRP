class AppletClass extends VDMApplet {
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
                    thisApplet.RickRoll();
                }
            }
        };

        thisApplet.rickRollURL = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;autoplay=1&amp;controls=0&amp;showinfo=0"
    }

    RunStartup() {
        let thisApplet = this;
        thisApplet.RickRoll();
    }

    RickRoll() {
        let thisApplet = this;
        let iFrame = document.createElement("iframe");
        iFrame.style.width = "100%";
        iFrame.style.height = "100%";
        iFrame.allow = "autoplay";
        iFrame.src = thisApplet.rickRollURL;
        thisApplet.dataPane.appendChild(iFrame);
    }
}

let AppletProfile = {
    "appletName": "RickRoll",
    "title": "RickRoll",
    "sizeX": 620,
    "sizeY": 400,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preloadDeps": true,
    "dependencies": []
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-RickRoll.js