'use strict';

const DRP_Service = require('drp-mesh').Service;

const fs = require('fs').promises;

let openAPIDoc = {
    "openapi": "3.0.1",
    "info": {
        "title": "JSONDocMgr",
        "description": "This API is used to store JSON documents",
        "version": "1.0.1"
    },
    "servers": [
        {
            "url": "/Mesh/Services/JSONDocMgr"
        }
    ],
    "tags": [
        {
            "name": "ClientCmds",
            "description": "Service ClientCmds"
        }
    ],
    "paths": {
        "/ClientCmds/listFiles": {
            "get": {
                "tags": [
                    "ClientCmds"
                ],
                "summary": "List JSON documents",
                "description": "Returns list of JSON documents",
                "operationId": "listFiles",
                "responses": {
                    "200": {
                        "description": "Found list of JSON documents",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object"
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid query",
                        "content": {}
                    },
                    "404": {
                        "description": "No JSON documents",
                        "content": {}
                    }
                },
                "x-swagger-router-controller": "JSONDocMgr"
            }
        },
        "/ClientCmds/loadFile/{fileName}": {
            "get": {
                "tags": [
                    "ClientCmds"
                ],
                "summary": "Get JSON document",
                "description": "Returns JSON document",
                "operationId": "loadFile",
                "parameters": [
                    {
                        "name": "fileName",
                        "in": "path",
                        "description": "File name to retrieve",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "successful operation",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object"
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid document name supplied",
                        "content": {}
                    },
                    "404": {
                        "description": "JSON document not found",
                        "content": {}
                    }
                },
                "x-swagger-router-controller": "JSONDocMgr"
            }
        }
    },
    "components": {
        "securitySchemes": {
            "x-api-key": {
                "type": "apiKey",
                "name": "x-api-key",
                "in": "header"
            },
            "x-api-token": {
                "type": "apiKey",
                "name": "x-api-token",
                "in": "header"
            }
        }
    },
    "security": [
        { "x-api-key": [] },
        { "x-api-token": [] }
    ]
};

class JSONDocManager extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {drpNode} drpNode DRP Node
     * @param {string} basePath Base path
     */
    constructor(serviceName, drpNode, basePath) {
        super(serviceName, drpNode, "JSONDocManager", `${drpNode.NodeID}-${serviceName}`, false, 10, 10, drpNode.Zone, "global", null, null, 1);
        var thisDocMgr = this;
        this.basePath = basePath;

        this.ClientCmds = {
            getOpenAPIDoc: async function (cmdObj) {
                return openAPIDoc;
            },
            listFiles: async function (cmdObj) {
                //console.log("Listing directory - '" + thisDocMgr.basePath + "'");
                let fileList = await thisDocMgr.ListFiles(thisDocMgr.basePath);
                return fileList;
            },
            loadFile: async function (cmdObj) {
                //console.log("Loading JSON File - '" + appData.fileName + "'");
                let fileName = null;
                if (cmdObj.fileName) {
                    fileName = cmdObj.fileName;
                } else if (cmdObj.pathList && cmdObj.pathList.length > 0) {
                    fileName = cmdObj.pathList[0];
                } else if (cmdObj.payload && cmdObj.payload.fileName) {
                    fileName = cmdObj.payload.fileName;
                } else {
                    return null;
                }
                let fileData = await thisDocMgr.LoadFile(thisDocMgr.basePath + fileName);
                //console.log("Loaded JSON File - '" + appData.fileName + "'");
                return fileData;
            },
            saveFile: async function (cmdObj) {
                //console.log("Saving JSON File - '" + appData.fileName + "'");
                await thisDocMgr.SaveFile(thisDocMgr.basePath + cmdObj.fileName, cmdObj.fileData);
                //console.log("Saved JSON File - '" + appData.fileName + "'");
                return "Saved";
            }
        };
    }

    /**
     * 
     * @param {string} basePath File base path
     * @returns {Object.<string,object>} Dictionary of files and attributes
     */
    async ListFiles(basePath) {
        let thisDocMgr = this;
        let returnData = {};
        // Load file data
        let dirData = await fs.readdir(basePath);
        for (var i = 0; i < dirData.length; i++) {
            let fileName = dirData[i];

            // Make sure this is a JSON file
            let pathStat = await fs.stat(basePath + fileName);
            if (!pathStat.isDirectory()) {
                returnData[fileName] = pathStat;
            }
        }
        return returnData;
    }

    async LoadFile(fileName) {
        // Load file data
        let fileData = await fs.readFile(fileName, 'utf8');
        return fileData;
    }

    async SaveFile(fileName, fileData) {
        // Save file data
        let saveResults = await fs.writeFile(fileName, fileData);
        return saveResults;
    }
}

module.exports = JSONDocManager;