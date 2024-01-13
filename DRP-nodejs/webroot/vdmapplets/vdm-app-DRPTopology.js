class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        // Dropdown menu items
        thisApplet.menu = {
            "View": {
                "Toggle Refresh": function () {
                    thisApplet.ToggleRefresh();
                },
                "Output JSON": async function () {
                    let fileData = JSON.stringify(thisApplet.cy.json());
                    console.log(fileData);
                    //thisApplet.msgBox.innerHTML = results;
                    //alert(results);
                }
            }
        };

        thisApplet.menuSearch = {
            "searchEmptyPlaceholder": "Search...",
            "searchField": null
        };

        thisApplet.dataStructs = {};
        thisApplet.refreshActive = false;
        thisApplet.refreshInterval = null;
        thisApplet.cy = null;
        thisApplet.linkFromObj = null;
        thisApplet.currentFile = "";
        thisApplet.nodeCursors = {
            Registry: { x: 400, y: 50, index: 0 },
            Broker: { x: 700, y: 100, index: 0 },
            Provider: { x: 200, y: 100, index: 0 },
            Logger: { x: 450, y: 250, index: 0 },
            Consumer: { x: 825, y: 100, index: 0 }
        }
        thisApplet.displayedNodeID = null
    }

    async RunStartup() {
        let thisApplet = this;

        thisApplet.dataPane = thisApplet.windowParts["data"];

        let cyBox = document.createElement("div");
        cyBox.style = `position: absolute; z-index: 0; overflow: hidden; width: 100%; height: 100%; background: #aaa`;
        thisApplet.dataPane.appendChild(cyBox);
        thisApplet.cyBox = cyBox;

        let cy = cytoscape({
            container: thisApplet.cyBox,
            wheelSensitivity: .25,
            zoom: .75,
            pan: { "x": 100, "y": 25 },

            style: [{
                selector: 'node',
                style: {
                    'font-size': '12px',
                    'text-wrap': 'wrap',
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
                    'shape': "star",
                    'background-color': 'gold'
                }
            }, {
                selector: 'node.Logger',
                style: {
                    'shape': "diamond",
                    'background-color': '#654321'
                }
            }, {
                selector: 'node.Service',
                style: {
                    'height': 20,
                    'width': 20
                }
            }, {
                selector: 'node.Consumer',
                style: {
                    'shape': "circle",
                    'background-color': '#DDD',
                    'border-width': 3,
                    'border-color': '#333',
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
                    'opacity': 0.5,
                    'curve-style': 'bezier',
                    'font-size': '10px',
                    'text-wrap': 'wrap',
                    'content': 'data(label)',
                    'text-rotation': 'autorotate'
                }
            }, {
                selector: 'edge.NodeService',
                style: {
                    'line-color': '#88f',
                    'line-style': 'dashed',
                    'target-arrow-color': '#88f',
                }
            }, {
                selector: 'edge.hover',
                style: {
                    'width': 1,
                    'opacity': 1.0
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

        thisApplet.cy = cy;

        cy.on('mouseover', 'node', async function (e) {
            // Add highlight to connected edges
            e.cyTarget.connectedEdges().addClass('hover');
            let targetNodeData = e.cyTarget.data();

            // If the node has a "ShowDetails" function, execute and display in details box
            if (targetNodeData.ShowDetails) {
                thisApplet.displayedNodeID = targetNodeData.id;
                thisApplet.detailsDiv.style['display'] = 'grid';
                try {
                    thisApplet.detailsDiv.innerHTML = await targetNodeData.ShowDetails();
                } catch (ex) {
                    thisApplet.detailsDiv.innerHTML = ex.message;
                }
            }
        });
        cy.on('mouseout', 'node', async function (e) {
            // Remove highlight from connected edges
            e.cyTarget.connectedEdges().removeClass('hover');
            let targetNodeData = e.cyTarget.data();

            // If the node has a "ShowDetails" function AND its details are currently in the detail box, remove and hide
            if (thisApplet.displayedNodeID && thisApplet.displayedNodeID === targetNodeData.id) {
                //thisApplet.detailsDiv.style['display'] = 'none';
            }
        });

        cy.on('mouseover', 'edge', function (e) {
            e.cyTarget.addClass('hover');
        });
        cy.on('mouseout', 'edge', function (e) {
            e.cyTarget.removeClass('hover');
        });

        let removed = null;

        var contextMenu = thisApplet.cy.contextMenus({
            menuItems: [
                {
                    id: 'evacuate',
                    content: 'evacuate',
                    selector: 'node.Registry',
                    onClickFunction: async function (e) {
                        let targetNodeData = e.cyTarget.data();

                        // If the node has a "ShowDetails" function, execute and display in details box
                        if (targetNodeData.Evacuate) {
                            try {
                                thisApplet.detailsDiv.innerHTML = await targetNodeData.Evacuate();
                                thisApplet.detailsDiv.style['display'] = 'block';
                                thisApplet.LoadNodeTopology();
                            } catch (ex) {
                                thisApplet.detailsDiv.innerHTML = ex.message;
                            }
                        }
                    },
                    //hasTrailingDivider: true
                }
            ]
        });

        thisApplet.resizeMovingHook = function () {
            thisApplet.cy.resize();
            //cy.fit();
        };

        thisApplet.LoadNodeTopology();

        // Add details menu
        let detailsDiv = document.createElement('div');
        detailsDiv.className = "detailsDiv";
        detailsDiv.style = `width: 400px;height: 200px;margin: 0;position: absolute;bottom: 0;right: 0;text-align: left;font-size: 14px;line-height: normal; color: khaki; background-color: black;opacity: .9; box-sizing: border-box; padding: 10px;
    display: none;
    grid-template-columns: 25% 75%;
    grid-template-rows: 25px 25px 25px 25px 25px 25px;
    border-radius: 20px;
    z-index: 1;`;
        detailsDiv.innerHTML = "&nbsp;";

        thisApplet.detailsDiv = detailsDiv;

        thisApplet.dataPane.appendChild(detailsDiv);
    }

    ToggleRefresh() {
        let thisApplet = this;
        if (!thisApplet.refreshActive) {
            thisApplet.refreshInterval = setInterval(async () => {
                thisApplet.LoadNodeTopology();
            }, 10000);
            thisApplet.refreshActive = true;
        } else {
            clearInterval(thisApplet.refreshInterval);
            thisApplet.refreshActive = false;
        }
    }

    PlaceNode(nodeClass, index, total) {
        let thisApplet = this;
        let returnPosition = { x: 0, y: 0 };
        let colsPerRow = 6;
        switch (nodeClass) {
            case "Registry":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Registry"]);
                //thisApplet.nodeCursors["Registry"].y += 75;
                let arrangeMultiple = total > 1 ? true : false;
                if (arrangeMultiple) {
                    let isEven = index % 2 === 0;
                    if (!isEven) {
                        // Put on left
                        returnPosition.x -= 75;
                    } else {
                        // Put on right
                        returnPosition.x += 75;
                    }
                }
                returnPosition.y += (75 * (Math.floor(index / 2)));
                break;
            case "Broker":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Broker"]);
                thisApplet.nodeCursors["Broker"].y += 150;
                break;
            case "Provider":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Provider"]);
                thisApplet.nodeCursors["Provider"].y += 75;
                break;
            case "Logger":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Logger"]);
                thisApplet.nodeCursors["Logger"].y += 75;
                break;
            case "Consumer":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Consumer"]);
                let column = returnPosition.index % colsPerRow;
                returnPosition.x += column * 50;
                let row = Math.floor(returnPosition.index / colsPerRow);
                returnPosition.y += row * 50;
                thisApplet.nodeCursors["Consumer"].index++;
                break;
            case "Service":
                returnPosition = Object.assign(returnPosition, thisApplet.nodeCursors["Service"]);
                thisApplet.nodeCursors["Service"].y += 50;
                thisApplet.nodeCursors["Service"].index++;
                break;
            default:
        }
        return returnPosition;
    }

    /**
     * 
     * @param {Object.<string, TopologyNode>} topologyObj DRP Topology
     */
    async ImportMeshTopology(topologyObj) {
        let thisApplet = this;

        let typeStyle = "grid-column: 1/ span 2;text-align: center; font-size: large;";
        let headerStyle = "text-align: right; padding-right: 10px;";
        let dataStyle = "color: lightseagreen; font-weight: bold; user-select: text; overflow-wrap: break-word;";

        let zones = {};
        let nodeIDs = Object.keys(topologyObj);

        // Loop over DRP Nodes, assign Nodes to Zones
        for (let i = 0; i < nodeIDs.length; i++) {
            let drpNodeID = nodeIDs[i];
            let drpNode = topologyObj[drpNodeID];
            if (!zones[drpNode.Zone]) {
                zones[drpNode.Zone] = {
                    Registry: [],
                    Broker: [],
                    Provider: [],
                    Logger: [],
                    allnodes: []
                }
            }
            if (drpNode.Roles.includes("Registry")) {
                zones[drpNode.Zone].Registry.push(drpNode);
            } else if (drpNode.Roles.includes("Broker")) {
                zones[drpNode.Zone].Broker.push(drpNode);
            } else if (drpNode.Roles.includes("Provider")) {
                zones[drpNode.Zone].Provider.push(drpNode);
            } else if (drpNode.Roles.includes("Logger")) {
                zones[drpNode.Zone].Logger.push(drpNode);
            }

            zones[drpNode.Zone].allnodes.push(drpNode);
        }

        // Get Zone names
        let zoneNames = Object.keys(zones);

        let zoneVerticalOffset = 75;
        let zoneHorizontalOffset = 0;

        // Loop over Zones
        for (let i = 0; i < zoneNames.length; i++) {
            let zoneName = zoneNames[i];

            let maxZoneHeight = Math.max(
                zones[zoneName].Registry.length,
                zones[zoneName].Broker.length,
                zones[zoneName].Provider.length,
                zones[zoneName].Logger.length
            );

            thisApplet.nodeCursors["Registry"].y = zoneVerticalOffset + ((maxZoneHeight - 1) * 75) / 2
            thisApplet.nodeCursors["Broker"].y = zoneVerticalOffset
            thisApplet.nodeCursors["Provider"].y = zoneVerticalOffset
            thisApplet.nodeCursors["Logger"].y = zoneVerticalOffset + 75
            thisApplet.nodeCursors["Consumer"].y = zoneVerticalOffset

            thisApplet.nodeCursors["Registry"].index = 0;
            thisApplet.nodeCursors["Broker"].index = 0;
            thisApplet.nodeCursors["Provider"].index = 0;
            thisApplet.nodeCursors["Logger"].index = 0;
            thisApplet.nodeCursors["Consumer"].index = 0;

            let zoneWidth = 1000;

            thisApplet.cy.add({
                group: 'nodes',
                data: {
                    id: zoneName
                },
                classes: "Zone",
                //position: { x: zoneWidth/2, y: zoneVerticalOffset + 150},
                style: {
                    'shape': "square",
                    'background-color': '#FFF',
                    'font-size': '30px',
                    'content': 'data(label)',
                    'opacity': 1,
                    'events': 'no'
                },
                //grabbable: false
            });

            thisApplet.cy.add({
                group: 'nodes',
                data: {
                    id: `${zoneName}-label`,
                    label: zoneName,
                    parent: zoneName,
                },
                classes: "Zone",
                //position: { x: zoneWidth/2, y: zoneVerticalOffset + 150},
                style: {
                    'shape': "square",
                    'background-color': '#FFF',
                    'font-size': '30px',
                    'content': 'data(label)',
                    'opacity': 1,
                    'events': 'no'
                },
                position: { x: 400, y: zoneVerticalOffset - 25 }
                //grabbable: false
            });

            // Loop over DRP Nodes in Zone
            for (let drpNode of zones[zoneName].allnodes) {

                let labelData = `${drpNode.NodeID}\n[${drpNode.HostID}]`;
                if (drpNode.NodeURL) labelData = `${labelData}\n${drpNode.NodeURL}`;
                let primaryRole = drpNode.Roles[0];
                let nodeIDs = zones[zoneName][primaryRole].map((nodeObj) => {
                    return nodeObj.NodeID
                });
                let index = nodeIDs.indexOf(drpNode.NodeID);
                let nodePosition = thisApplet.PlaceNode(primaryRole, index, nodeIDs.length);

                // Add DRP Node as Cytoscape node
                thisApplet.cy.add({
                    group: 'nodes',
                    data: {
                        id: drpNode.NodeID,
                        label: labelData,
                        parent: zoneName,
                        drpNode: drpNode,
                        ShowDetails: async () => {
                            let returnVal = `<span style="${typeStyle}">Mesh Node</span>` +
                                `<span style="${headerStyle}">Node ID:</span><span style="${dataStyle}">${drpNode.NodeID}</span>` +
                                `<span style="${headerStyle}">Host ID:</span><span style="${dataStyle}">${drpNode.HostID}</span>`;
                            if (drpNode.NodeURL) {
                                returnVal += `<span style="${headerStyle}">URL:</span><span style="${dataStyle}">${drpNode.NodeURL}</span>`;
                            } else {
                                returnVal += `<span style="${headerStyle}">URL:</span><span style="${dataStyle}">(non-listening)</span>`;
                            }
                            returnVal += `<span style="${headerStyle}">Scope:</span><span style="${dataStyle}">${drpNode.Scope}</span>` +
                                `<span style="${headerStyle}">Zone:</span><span style="${dataStyle}">${drpNode.Zone}</span>` +
                                `<span style="${headerStyle}">Roles:</span><span style="${dataStyle}">${drpNode.Roles}</span>`;
                            return returnVal;
                        },
                        Evacuate: async () => {
                            let response = await thisApplet.Evacuate(drpNode.NodeID);
                            return response;
                        }
                    },
                    classes: drpNode.Roles.join(" "),
                    position: nodePosition
                });

                // Get list of Node services
                let serviceNameList = Object.keys(drpNode.Services);

                // The service count will exclude DRP
                let serviceCount = serviceNameList.length - 1;
                let arrangeMultiple = serviceCount > 1 ? true : false;

                // Loop over Node Services
                for (let j = 0; j < serviceNameList.length; j++) {

                    let serviceName = serviceNameList[j];
                    if (serviceName === "DRP") {
                        continue;
                    }
                    let serviceObj = drpNode.Services[serviceName];
                    let serviceNodeID = serviceObj.InstanceID;

                    let servicePosition = { x: 0, y: 0 };
                    Object.assign(servicePosition, nodePosition);

                    if (arrangeMultiple) {
                        let isEven = j % 2 === 0;
                        if (!isEven) {
                            // Put on top
                            servicePosition.y -= 20;
                        } else {
                            // Put on bottom
                            servicePosition.y += 20;
                        }
                        servicePosition.x -= (125 + 100 * (Math.floor((j - 1) / 2)));
                    } else {
                        servicePosition.x -= 125;
                    }

                    // See if service node exists
                    let svcNodeObj = thisApplet.cy.getElementById(serviceNodeID);
                    if (svcNodeObj.length === 0) {
                        // No - create it
                        thisApplet.cy.add({
                            group: 'nodes',
                            data: {
                                id: serviceNodeID,
                                label: serviceName,
                                parent: zoneName,
                                ShowDetails: async () => {
                                    let returnVal = `<span style="${typeStyle}">Mesh Service</span>` +
                                        `<span style="${headerStyle}">Name:</span><span style="${dataStyle}">${serviceName}</span>` +
                                        `<span style="${headerStyle}">Instance ID:</span><span style="${dataStyle}">${serviceObj.InstanceID}</span>` +
                                        `<span style="${headerStyle}">Node ID:</span><span style="${dataStyle}">${drpNode.NodeID}</span>` +
                                        `<span style="${headerStyle}">Scope:</span><span style="${dataStyle}">${serviceObj.Scope}</span>` +
                                        `<span style="${headerStyle}">Zone:</span><span style="${dataStyle}">${serviceObj.Zone}</span>`;
                                    return returnVal;
                                }
                            },
                            classes: "Service",
                            position: servicePosition
                        });
                    }

                    // Create edge
                    thisApplet.cy.add({
                        group: 'edges',
                        data: {
                            id: `${serviceNodeID}_${drpNode.NodeID}`,
                            source: serviceNodeID,
                            target: drpNode.NodeID
                        },
                        classes: "NodeService"
                    });
                }
            }

            zoneVerticalOffset += maxZoneHeight * 75 + 150;
        }

        // Loop over DRP Nodes again; create Edges
        for (let i = 0; i < nodeIDs.length; i++) {
            let drpNodeID = nodeIDs[i];
            let drpNode = topologyObj[drpNodeID];
            thisApplet.nodeCursors["Consumer"].index = 0;
            let nodeObj = thisApplet.cy.getElementById(drpNodeID);
            thisApplet.nodeCursors["Consumer"].y = nodeObj.position().y;

            // Loop over nodeClients
            let nodeClientIDs = Object.keys(drpNode.NodeClients);
            for (let j = 0; j < nodeClientIDs.length; j++) {
                let targetNodeID = nodeClientIDs[j];

                thisApplet.cy.add({
                    group: 'edges',
                    data: {
                        id: `${drpNodeID}_${targetNodeID}`,
                        source: targetNodeID,
                        target: drpNodeID,
                        label: drpNode.NodeClients[nodeClientIDs[j]]['pingTimeMs'] + " ms"
                    }
                });
            }

            // Loop over consumerClients
            let consumerClientIDs = Object.keys(drpNode.ConsumerClients);
            for (let j = 0; j < consumerClientIDs.length; j++) {
                let consumerID = consumerClientIDs[j];
                let consumerNodeID = `${drpNodeID}-c:${consumerID}`;
                let consumerObj = drpNode.ConsumerClients[consumerID];

                thisApplet.cy.add({
                    group: 'nodes',
                    data: {
                        id: consumerNodeID,
                        label: `${consumerClientIDs[j]}`,
                        parent: drpNode.Zone,
                        ShowDetails: async () => {
                            // Get User Details
                            return `<span style="${typeStyle}">Consumer</span>` +
                                `<span style="${headerStyle}">User ID:</span><span style="${dataStyle}">${consumerObj.UserName}</span>` +
                                `<span style="${headerStyle}">Name:</span><span style="${dataStyle}">${consumerObj.FullName}</span>`;
                        }
                    },
                    classes: "Consumer",
                    position: thisApplet.PlaceNode("Consumer")
                });

                thisApplet.cy.add({
                    group: 'edges',
                    data: {
                        id: `${consumerNodeID}_${drpNodeID}`,
                        source: consumerNodeID,
                        target: drpNodeID,
                        label: consumerObj.pingTimeMs + " ms"
                    }
                });
            }
        }
    }

    async LoadNodeTopology() {
        let thisApplet = this;

        thisApplet.cy.elements().remove();

        thisApplet.nodeCursors = {
            Registry: { x: 400, y: 50, index: 0 },
            Broker: { x: 700, y: 100, index: 0 },
            Provider: { x: 200, y: 100, index: 0 },
            Logger: { x: 450, y: 250, index: 0 },
            Consumer: { x: 825, y: 100, index: 0 },
            Service: { x: 50, y: 100, index: 0 }
        };

        /** @type {Object.<string, topologyNode>}} */
        let topologyObj = await thisApplet.sendCmd("DRP", "getTopology", null, true);
        thisApplet.ImportMeshTopology(topologyObj);
    }

    async Evacuate(nodeID) {
        let thisApplet = this;

        let pathListArray = ['Mesh', 'Nodes', nodeID, 'DRPNode', 'Evacuate'];
        let evacuateResponse = await thisApplet.sendCmd("DRP", "pathCmd", { method: "exec", pathList: pathListArray }, true);
        return evacuateResponse;
    }
}

class TopologyNode {
    constructor() {
        /** @type {string} */
        this.NodeID = "";
        /** @type {string} */
        this.ProxyNodeID = "";
        /** @type {string} */
        this.Scope = "";
        /** @type {string} */
        this.Zone = "";
        /** @type {string} */
        this.LearnedFrom = "";
        /** @type {string[]} */
        this.Roles = [];
        /** @type {string} */
        this.NodeURL = "";
        /** @type {string} */
        this.HostID = "";
        /** @type {string[]} */
        this.ConsumerClients = [];
        /** @type {string[]} */
        this.NodeClients = [];
        /** @type {Object.<string,Object>} */
        this.Services = {};
    }
}

let AppletProfile = {
    "appletName": "DRPTopology",
    "title": "DRP Topology",
    "sizeX": 950,
    "sizeY": 600,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preloadDeps": true,
    "dependencies": [
        { "JS": "assets/cytoscape/js/cytoscape.min.js" },
        { "JS": "assets/cytoscape/js/cytoscape-context-menus.js" },
        { "CSS": "assets/cytoscape/css/cytoscape-context-menus.css" }
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-DRPTopology.js