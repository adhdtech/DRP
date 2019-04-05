'use strict';
var drpService = require('drp-service');
var fs = require('fs');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var providerID = process.argv[2];
if (!providerID) {
    console.error("No provider ID specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL>");
    process.exit(0);
}

var registryURL = process.argv[3];
if (!registryURL) {
    console.error("No registry URL specified!\n\n> node " + process.argv[1] + " <providerID> <registryURL>");
    process.exit(0);
}

class JSONDocManager {
    constructor(basePath) {
        var thisDocMgr = this;
        this.Name = "JSONDocMgr";
        this.basePath = basePath;

        this.ClientCmds = {
            listFiles: async function (cmdObj) {
                //console.log("Listing directory - '" + thisDocMgr.basePath + "'");
                let fileList = await thisDocMgr.ListFiles(thisDocMgr.basePath);
                //console.log("Listed directory - '" + thisDocMgr.basePath + "'");
                return fileList;
            },
            loadFile: async function (cmdObj) {
                //console.log("Loading JSON File - '" + appData.fileName + "'");
                let fileName = null;
                if (cmdObj.fileName) {
                    fileName = cmdObj.fileName;
                } else if (cmdObj.pathList && cmdObj.pathList.length > 0) {
                    fileName = cmdObj.pathList[0];
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
        }
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
	
let myProvider = new drpService.Provider(providerID);
myProvider.AddService("JSONDocMgr", new JSONDocManager("jsondocs\\"));
myProvider.ConnectToRegistry(registryURL);
