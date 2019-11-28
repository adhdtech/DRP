(class extends rSageApplet {
    constructor(appletProfile, vdmClient) {
        super(appletProfile, vdmClient);
        let myApp = this;

        class topologyNode {
            constructor() {
                /** @type {string[]} */
                this.consumerClients = [];
                /** @type {string[]} */
                this.nodeClients = [];
                /** @type {string[]} */
                this.roles = [];
            }
        }

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
            "View": {
                "Node Topology": async function () {
                    myApp.appFuncs.loadNodeTopology();
                },
                "Output JSON": async function () {
                    let fileData = JSON.stringify(myApp.appVars.cy.json());
                    console.log(fileData);
                    //myApp.appVars.msgBox.innerHTML = results;
                    //alert(results);
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
            "placeNode": function (nodeClass) {
                let returnPosition = { x: 0, y: 0 };
                let colsPerRow = 6;
                switch (nodeClass) {
                    case "Registry":
                        returnPosition = Object.assign(returnPosition, myApp.appVars.nodeCursors["Registry"]);
                        myApp.appVars.nodeCursors["Registry"].y += 50;
                        break;
                    case "Broker":
                        returnPosition = Object.assign(returnPosition, myApp.appVars.nodeCursors["Broker"]);
                        returnPosition.y += myApp.appVars.nodeCursors["Broker"].index * 250;
                        myApp.appVars.nodeCursors["Broker"].index++;
                        break;
                    case "Provider":
                        returnPosition = Object.assign(returnPosition, myApp.appVars.nodeCursors["Provider"]);
                        myApp.appVars.nodeCursors["Provider"].y += 50;
                        break;
                    case "Logger":
                        returnPosition = Object.assign(returnPosition, myApp.appVars.nodeCursors["Logger"]);
                        myApp.appVars.nodeCursors["Logger"].y += 50;
                        break;
                    case "Consumer":
                        returnPosition = Object.assign(returnPosition, myApp.appVars.nodeCursors["Consumer"]);
                        let column = returnPosition.index % colsPerRow;
                        returnPosition.x += column * 50;
                        let row = Math.floor(returnPosition.index / colsPerRow);
                        returnPosition.y += row * 50;
                        myApp.appVars.nodeCursors["Consumer"].index++;
                        break;
                    default:
                }
                return returnPosition;
            },
            /**
             * 
             * @param {Object.<string, topologyNode>} topologyObj DRP Topology
             */
            "importMeshTopology": async function (topologyObj) {
                //let jsonText = `{"elements":{"nodes":[{"data":{"group":"nodes","id":"49d895b6-1953-4139-bbd4-7a9d40afb6f9","label":"node1"},"position":{"x":119,"y":133},"group":"nodes","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""},{"data":{"group":"nodes","id":"d1ba0134-5ed1-46be-8a65-1ea0b0183642","label":"node2"},"position":{"x":270,"y":202},"group":"nodes","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""}],"edges":[{"data":{"source":"49d895b6-1953-4139-bbd4-7a9d40afb6f9","target":"d1ba0134-5ed1-46be-8a65-1ea0b0183642","label":"dynamic","id":"ed551066-37f6-453e-a08c-ca2b571a7357"},"position":{},"group":"edges","removed":false,"selected":false,"selectable":true,"locked":false,"grabbable":true,"classes":""}]},"style":[{"selector":"node","style":{"label":"data(label)"}},{"selector":"edge","style":{"target-arrow-shape":"triangle"}},{"selector":":selected","style":{}}],"zoomingEnabled":true,"userZoomingEnabled":true,"zoom":1,"minZoom":1e-50,"maxZoom":1e+50,"panningEnabled":true,"userPanningEnabled":true,"pan":{"x":47,"y":-24},"boxSelectionEnabled":true,"renderer":{"name":"canvas"},"wheelSensitivity":0.25}`;
                //let jsonParsed = JSON.parse(jsonText);
                //myApp.appVars.cy.json(jsonParsed);

                // Clear existing nodes and edges

                // Loop over DRP Nodes in topology
                let nodeIDs = Object.keys(topologyObj);
                for (let i = 0; i < nodeIDs.length; i++) {
                    let nodeID = nodeIDs[i];
                    let drpNode = topologyObj[nodeID];

                    // Add DRP Node as Cytoscape node
                    myApp.appVars.cy.add({
                        group: 'nodes',
                        data: {
                            id: nodeID,
                            label: nodeID,
                            drpNode: drpNode
                        },
                        classes: drpNode.roles.join(" "),
                        position: myApp.appFuncs.placeNode(drpNode.roles[0])
                    });
                }

                // Loop over DRP Nodes again; create Edges
                for (let i = 0; i < nodeIDs.length; i++) {
                    let nodeID = nodeIDs[i];
                    let drpNode = topologyObj[nodeID];
                    myApp.appVars.nodeCursors["Consumer"].index = 0;
                    let nodeObj = myApp.appVars.cy.getElementById(nodeID);
                    myApp.appVars.nodeCursors["Consumer"].y = nodeObj.position().y;

                    // Loop over nodeClients
                    let nodeClientIDs = Object.keys(drpNode.nodeClients);
                    for (let j = 0; j < nodeClientIDs.length; j++) {
                        let targetNodeID = nodeClientIDs[j];

                        myApp.appVars.cy.add({
                            group: 'edges',
                            data: {
                                id: `${nodeID}_${targetNodeID}`,
                                source: targetNodeID,
                                target: nodeID,
                                label: drpNode.nodeClients[nodeClientIDs[j]]['pingTimeMs'] + " ms"
                            }
                        });
                    }

                    // Loop over consumerClients
                    let consumerClientIDs = Object.keys(drpNode.consumerClients);
                    for (let j = 0; j < consumerClientIDs.length; j++) {
                        let consumerID = `${nodeID}-c:${consumerClientIDs[j]}`;

                        myApp.appVars.cy.add({
                            group: 'nodes',
                            data: {
                                id: consumerID,
                                label: `${consumerClientIDs[j]}`
                            },
                            classes: ["Consumer"],
                            position: myApp.appFuncs.placeNode("Consumer")
                        });

                        myApp.appVars.cy.add({
                            group: 'edges',
                            data: {
                                id: `${consumerID}_${nodeID}`,
                                source: consumerID,
                                target: nodeID,
                                label: drpNode.consumerClients[consumerClientIDs[j]]['pingTimeMs'] + " ms"
                            }
                        });
                    }
                }
            },
            "loadNodeTopology": async function () {
                myApp.appVars.cy.elements().remove();

                myApp.appVars.nodeCursors = {
                    Registry: { x: 400, y: 50, index: 0 },
                    Broker: { x: 550, y: 100, index: 0 },
                    Provider: { x: 200, y: 100, index: 0 },
                    Logger: { x: 450, y: 250, index: 0 },
                    Consumer: { x: 725, y: 100, index: 0 }
                };

                /** @type {Object.<string, topologyNode>}} */
                let topologyObj = await myApp.sendCmd(null, "getTopology", null, true);
                myApp.appFuncs.importMeshTopology(topologyObj);
            }
        };

        myApp.appVars = {
            dataStructs: {},
            cy: null,
            linkFromObj: null,
            currentFile: "",
            nodeCursors: {
                Registry: { x: 400, y: 50, index: 0 },
                Broker: { x: 550, y: 100, index: 0 },
                Provider: { x: 200, y: 100, index: 0 },
                Logger: { x: 450, y: 250, index: 0 },
                Consumer: { x: 725, y: 100, index: 0 }
            }
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
            zoom: .8,
            //pan: { "x": 300, "y": 160 },

            style: [{
                selector: 'node',
                style: {
                    //'font-family' : 'FontAwesome',
                    //'content' : '\uf099  twitter'
                    'content': 'data(label)',
                    'opacity': 1
                }
            }, {
                selector: 'node.Provider',
                style: {
                    'shape': "triangle",
                    'background-color': '#AADDAA'
                }
            }, {
                selector: 'node.Broker',
                style: {
                    'shape': "square",
                    'background-color': '#AAAADD'
                }
            }, {
                selector: 'node.Registry',
                style: {
                    'shape': "circle",
                    'background-color': '#654321'
                }
            }, {
                selector: 'node.Logger',
                style: {
                    'shape': "star",
                    'background-color': 'gold'
                }
            }, {
                selector: 'node.Consumer',
                style: {
                    'shape': "circle",
                    'background-color': 'black',
                    'text-valign': 'center',
                    'text-halign': 'center'
                }
            }, {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#fcc',
                    'target-arrow-color': '#fcc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'content' : 'data(label)'
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

        myApp.appFuncs.loadNodeTopology();
    }
});
//# sourceURL=vdm-app-DRPTopology.js