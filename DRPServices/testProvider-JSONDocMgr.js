'use strict';
var drpService = require('drp-service');
var fs = require('fs');

// Create a JSONDocMgr service to expose
class JSONDocMgr {
    constructor(basePath) {
        var thisDocMgr = this;
        this.Name = "JSONDocMgr";
        this.basePath = basePath;

        this.ClientCmds = {
            listFiles: async function (appData) {
                console.log("Listing directory - '" + thisDocMgr.basePath + "'");
                let fileList = await thisDocMgr.ListFiles(thisDocMgr.basePath);
                console.log("Listed directory - '" + thisDocMgr.basePath + "'");
                return fileList;
            },
            loadFile: async function (appData) {
                let fileName = null;
                if (appData.constructor === Array) {
                    fileName = appData[0];
                } else if (appData && appData["fileName"]) {
                    fileName = appData["fileName"];
                } else return null;

                console.log("Loading JSON File - '" + fileName + "'");
                let fileData = await thisDocMgr.LoadFile(thisDocMgr.basePath + fileName);
                console.log("Loaded JSON File - '" + fileName + "'");
                return fileData;
            },
            saveFile: async function (appData) {
                console.log("Saving JSON File - '" + appData.fileName + "'");
                await thisDocMgr.SaveFile(thisDocMgr.basePath + appData.fileName, appData.fileData);
                console.log("Saved JSON File - '" + appData.fileName + "'");
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

                        // Make sure this is a file
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

// Set Name
let myProviderName = "testJSONDocMgr1";

// Set Registry URL
let myRegistryURL = "ws://localhost:8080/registry";
let myProviderURL = null;
let myServer = null;
let myProxy = null;
let expressApp = null;


// This section exposes a web service for Brokers.  If the Provider
// passes through a proxy to hit the Broker and the Broker cannot
// directly reach this service, comment this section out.  The
// provider will attempt to call the Broker when needed
myServer = new drpService.Server({
    "Port": "8081",
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"});
myServer.start();
expressApp = myServer.expressApp;
myProviderURL = "ws://localhost:8081/provider";

// Necessary if your proxy does SSL interception and the certs aren't loaded
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Load Provider
console.log(`Loading Provider [${myProviderName}]`);
let myProvider = new drpService.Provider(myProviderName, expressApp, myRegistryURL, myProviderURL, myProxy);

// Add JSONDocMgr Service
myProvider.AddService("JSONDocMgr", new JSONDocMgr("jsondocs\\"));

// Connect to Registry
myProvider.ConnectToRegistry();
