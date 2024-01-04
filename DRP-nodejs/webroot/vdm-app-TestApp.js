({
  "appletName": "TestApp",
  "title": "Test App",
  "sizeX": 620,
  "sizeY": 400,
  "appletIcon": "fa-list-alt",
  "showInMenu": true,
  "preReqs": [
  ],
  "appletClass": class extends VDMApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let myApp = this;

        // Dropdown menu items
        myApp.menu = {
			"Test Functions": {
				"Alert": ()=> {
					alert("blah")
				}
			}
        };
		
		myApp.menuSearch = {
            "searchEmptyPlaceholder": "Search...",
            "searchField": null
        };

        myApp.appFuncs = {
        };

        myApp.appVars = {
            "videoURL": "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&amp;autoplay=1&amp;controls=0&amp;showinfo=0"
        };

        myApp.recvCmd = {
        };

    }

    runStartup() {
        let myApp = this;
        myApp.windowParts["data"].innerHTML = '<iframe width="100% " height="100% " src="' + myApp.appVars['videoURL'] + '" frameborder="0" allow="autoplay"></iframe>';
    }
  }
})
//# sourceURL=vdm-app-TestApp.js
