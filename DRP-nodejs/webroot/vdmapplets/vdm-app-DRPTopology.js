(class extends rSageApplet {
    constructor(appletProfile, vdmClient) {
        super(appletProfile, vdmClient);
        let myApp = this;

        // Prerequisites
        myApp.preReqs = [{
            "JS": "/assets/cytoscape/js/cytoscape.min.js"
        }, {
            "JS": "/assets/cytoscape/js/cytoscape-context-menus.js"
        }, {
            "CSS": "/assets/cytoscape/css/cytoscape-context-menus.css"
        }
        ];

        // Dropdown menu items
        myApp.menu = {
            "File": {
                "Load": async function () {
                    /*
                    if (myApp.appVars.currentFile.length > 0) {
                        await myApp.appFuncs.loadFile(myApp.appVars.currentFile);
                        myApp.appVars.msgBox.innerHTML = "Loaded";
                    }
                    */
                    let jsonText = `{"elements":{"nodes":[{"data":{"group":"nodes","id":"49d895b6-1953-4139-bbd4-7a9d40afb6f9","label":"node1"},"position":{"x":119,"y":133},"group":"nodes","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""},{"data":{"group":"nodes","id":"d1ba0134-5ed1-46be-8a65-1ea0b0183642","label":"node2"},"position":{"x":270,"y":202},"group":"nodes","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""}],"edges":[{"data":{"source":"49d895b6-1953-4139-bbd4-7a9d40afb6f9","target":"d1ba0134-5ed1-46be-8a65-1ea0b0183642","label":"dynamic","id":"ed551066-37f6-453e-a08c-ca2b571a7357"},"position":{},"group":"edges","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""}]},"style":[{"selector":"node","style":{"label":"data(label)"}},{"selector":"edge","style":{"target-arrow-shape":"triangle"}},{"selector":":selected","style":{}}],"zoomingEnabled":true,"userZoomingEnabled":true,"zoom":1,"minZoom":1e-50,"maxZoom":1e+50,"panningEnabled":true,"userPanningEnabled":true,"pan":{"x":47,"y":-24},"boxSelectionEnabled":true,"renderer":{"name":"canvas"},"wheelSensitivity":0.25}`;
                    let jsonParsed = JSON.parse(jsonText);
                    myApp.appVars.cy.json(jsonParsed);
                    let bob = 1;
                },
                "Save": async function () {
                    let fileData = JSON.stringify(myApp.appVars.cy.json());
                    console.log(fileData);
                    //myApp.appVars.msgBox.innerHTML = results;
                    //alert(results);
                }
            },
            "Mode": {
                "View": async function () {
                },
                "Edit": async function () {
                }
            }
        };

        myApp.menuSearch = {
            "searchEmptyPlaceholder": "Search...",
            "searchField": null
        };
		/*
		myApp.menuQuery = {
		"queryEmptyPlaceholder": "Query...",
		"queryField": null
		}
		 */

        myApp.appFuncs = {
            "listFiles": async function () {
                let fileList = await myApp.sendCmd("JSONDocMgr", "listFiles", null, true);
                return fileList;
            },
            "loadFile": async function (fileName) {
                let jsonData = await myApp.sendCmd("JSONDocMgr", "loadFile", { "fileName": fileName }, true);
                myApp.appVars.cy.elements().remove();
                myApp.appVars.jsonEditor.set(JSON.parse(jsonData));
            },
            "saveFile": async function (fileName, fileData) {
                let results = await myApp.sendCmd("JSONDocMgr", "saveFile", { "fileName": fileName, "fileData": fileData }, true);
                return results;
            }
        };

        myApp.appVars = {
            dataStructs: {},
            cy: null,
            linkFromObj: null,
            currentFile: ""
        };

        myApp.recvCmd = {
        };
    }

    async runStartup() {
        let myApp = this;

        myApp.appVars.cyBox = myApp.windowParts["data"];

        let cy = cytoscape({
            container: myApp.appVars.cyBox,
            wheelSensitivity: .25,

            style: [{
                selector: 'node',
                style: {
                    //'font-family' : 'FontAwesome',
                    //'content' : '\uf099  twitter'
                    'content': 'data(label)'
                }
            }, {
                selector: 'edge',
                style: {
                    'target-arrow-shape': 'triangle'
                    //'content' : 'data(label)'
                }
            }, {
                selector: ':selected',
                style: {}
            }
            ],
            layout: {
                name: 'preset'
            },

            elements: {
                nodes: [],
                edges: []
            }
        });

        myApp.appVars.cy = cy;

        var contextMenu = myApp.appVars.cy.contextMenus({
            menuItems: [
                {
                    id: 'remove',
                    content: 'remove',
                    selector: 'node, edge',
                    onClickFunction: function (event) {
                        var target = event.target || event.cyTarget;
                        removed = target.remove();

                        contextMenu.showMenuItem('undo-last-remove');
                    },
                    hasTrailingDivider: true
                }, {
                    id: 'undo-last-remove',
                    content: 'undo last remove',
                    selector: 'node, edge',
                    show: false,
                    coreAsWell: true,
                    onClickFunction: function (event) {
                        if (removed) {
                            removed.restore();
                        }
                        contextMenu.hideMenuItem('undo-last-remove');
                    },
                    hasTrailingDivider: true
                }, {
                    id: 'hide',
                    content: 'hide',
                    selector: '*',
                    onClickFunction: function (event) {
                        var target = event.target || event.cyTarget;
                        target.hide();
                    },
                    disabled: false
                }, {
                    id: 'add-node',
                    content: 'add node',
                    coreAsWell: true,
                    onClickFunction: function (event) {
                        var data = {
                            group: 'nodes'
                        };

                        var pos = event.position || event.cyPosition;

                        cy.add({
                            data: data,
                            position: {
                                x: pos.x,
                                y: pos.y
                            }
                        });
                    }
                }, {
                    id: 'remove-selected',
                    content: 'remove selected',
                    coreAsWell: true,
                    show: true,
                    onClickFunction: function (event) {
                        removedSelected = cy.$(':selected').remove();

                        contextMenu.hideMenuItem('remove-selected');
                        contextMenu.showMenuItem('restore-selected');
                    }
                }, {
                    id: 'restore-selected',
                    content: 'restore selected',
                    coreAsWell: true,
                    show: false,
                    onClickFunction: function (event) {
                        if (removedSelected) {
                            removedSelected.restore();
                        }
                        contextMenu.showMenuItem('remove-selected');
                        contextMenu.hideMenuItem('restore-selected');
                    }
                }, {
                    id: 'select-all-nodes',
                    content: 'select all nodes',
                    selector: 'node',
                    show: true,
                    onClickFunction: function (event) {
                        selectAllOfTheSameType(event.target || event.cyTarget);

                        contextMenu.hideMenuItem('select-all-nodes');
                        contextMenu.showMenuItem('unselect-all-nodes');
                    }
                }, {
                    id: 'unselect-all-nodes',
                    content: 'unselect all nodes',
                    selector: 'node',
                    show: false,
                    onClickFunction: function (event) {
                        unselectAllOfTheSameType(event.target || event.cyTarget);

                        contextMenu.showMenuItem('select-all-nodes');
                        contextMenu.hideMenuItem('unselect-all-nodes');
                    }
                }, {
                    id: 'select-all-edges',
                    content: 'select all edges',
                    selector: 'edge',
                    show: true,
                    onClickFunction: function (event) {
                        selectAllOfTheSameType(event.target || event.cyTarget);

                        contextMenu.hideMenuItem('select-all-edges');
                        contextMenu.showMenuItem('unselect-all-edges');
                    }
                }, {
                    id: 'unselect-all-edges',
                    content: 'unselect all edges',
                    selector: 'edge',
                    show: false,
                    onClickFunction: function (event) {
                        unselectAllOfTheSameType(event.target || event.cyTarget);

                        contextMenu.showMenuItem('select-all-edges');
                        contextMenu.hideMenuItem('unselect-all-edges');
                    }
                }, {
                    id: 'link-from',
                    content: 'link from this node',
                    selector: 'node',
                    show: true,
                    onClickFunction: function (event) {
                        //selectAllOfTheSameType(event.target || event.cyTarget);
                        myApp.appVars.linkFromObj = event.target || event.cyTarget;

                        contextMenu.showMenuItem('link-to');
                    }
                }, {
                    id: 'link-to',
                    content: 'link to',
                    selector: 'node',
                    show: false,
                    onClickFunction: function (event) {
                        //selectAllOfTheSameType(event.target || event.cyTarget);
                        //myApp.appVars.linkFromObj = event.target || event.cyTarget;
                        let linkToObj = event.target || event.cyTarget;
                        cy.add([{
                            group: 'edges',
                            data: {
                                source: myApp.appVars.linkFromObj._private.data.id,
                                target: linkToObj._private.data.id,
                                label: 'dynamic'
                            }
                        }
                        ]);

                        contextMenu.hideMenuItem('link-to');
                    }
                }
            ]
        });

        myApp.resizeMovingHook = function () {
            myApp.appVars.cy.resize();
            //cy.fit();
        };
    }
});
//# sourceURL=vdm-app-DRPTopology.js