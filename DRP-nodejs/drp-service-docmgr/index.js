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
        super(serviceName, drpNode, "VDM", `${drpNode.nodeID}-${serviceName}`, false, 10, 10, drpNode.Zone, "zone", null, 1);
        var thisDocMgr = this;
        this.basePath = basePath;

        this.ClientCmds = {
            listFiles: async function (cmdObj) {
                //console.log("Listing directory - '" + thisDocMgr.basePath + "'");
                let fileList = await thisDocMgr.ListFiles(thisDocMgr.basePath);
                return fileList;
            },
            loadFile: async function (cmdObj, obj2) {
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

    ListFiles(basePath) {
        let thisDocMgr = this;
        let returnData = {};
        // Load file data
        return new Promise(function (resolve, reject) {
            fs.readdir(basePath, function (err, data) {
                if (err)
                    reject(err);
                else {
                    for (var i = 0; i < data.length; i++) {
                        let fileName = data[i];

                        // Make sure this is a JSON file
                        if (!fs.statSync(basePath + fileName).isDirectory()) {
                            returnData[fileName] = fs.statSync(basePath + fileName);
                        }
                    }
                    resolve(returnData);
                }
            });
        });
    }

    LoadFile(fileName) {
        // Load file data
        return new Promise(function (resolve, reject) {
            fs.readFile(fileName, 'utf8', function (err, data) {
                if (err)
                    reject(err);
                else
                    resolve(data);
            });
        });
    }

    SaveFile(fileName, fileData) {
        // Save file data
        return new Promise(function (resolve, reject) {
            fs.writeFile(fileName, fileData, function (err, data) {
                if (err)
                    reject(err);
                else
                    resolve(null);
            });
        });
    }
}

module.exports = JSONDocManager;