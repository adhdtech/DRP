'use strict';

const DRP_Service = require('drp-mesh').Service;

const fs = require('fs');

class JSONDocManager extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {drpNode} drpNode DRP Node
     * @param {string} basePath Base path
     */
    constructor(serviceName, drpNode, basePath) {
        super(serviceName, drpNode, "JSONDocManager", `${drpNode.nodeID}-${serviceName}`, false, 10, 10, drpNode.Zone, "global", null, null, 1);
        var thisDocMgr = this;
        this.basePath = basePath;

        this.ClientCmds = {
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