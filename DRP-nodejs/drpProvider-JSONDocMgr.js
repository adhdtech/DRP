'use strict';
var fs = require('fs');
var drpService = require('drp-service');
var drpNode = drpService.Node;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

//var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";
var registryURL = "ws://localhost:8080";

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Provider"]);

class JSONDocManager extends drpService.Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {drpNode} drpNode DRP Node
     * @param {string} basePath Base path
     */
    constructor(serviceName, drpNode, basePath) {
        super(serviceName, drpNode);
        var thisDocMgr = this;
        this.basePath = basePath;

        this.ClientCmds = {
            listFiles: async function (cmdObj) {
                //console.log("Listing directory - '" + thisDocMgr.basePath + "'");
                let fileList = await thisDocMgr.ListFiles(thisDocMgr.basePath);
                //console.log("Listed directory - '" + thisDocMgr.basePath + "'");
                return fileList;
            },
            loadFile: async function (cmdObj, obj2) {
                //console.log("Loading JSON File - '" + appData.fileName + "'");
                //console.dir(cmdObj);
                //console.dir(obj2);
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

let myService = new JSONDocManager("JSONDocMgr", myNode, "jsondocs\\");

myNode.AddService(myService);
myNode.ConnectToRegistry(registryURL);
