'use strict';
var drpService = require('drp-service');
var cucmsql = require('cucm-sql-async');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

var proxyURL = process.argv[4];

//let proxy = null;

// Load Provider
console.log(`Loading Provider [${providerID}]`);
let myProvider = new drpService.Provider(providerID);

myProvider.CUCMProfiles = {
};

// Set CUCM AXL Clients
let profileNames = Object.keys(myProvider.CUCMProfiles);
for (let i = 0; i < profileNames.length; i++) {
    let thisProfile = myProvider.CUCMProfiles[profileNames[i]];
    thisProfile.axlClient = cucmsql(thisProfile.host, thisProfile.user, thisProfile.password);
}

myProvider.GetDevices = function (cucmProfile, params) {
    var thisProvider = this;
    return new Promise(async function (resolve, reject) {
        //var axlResults = null;
        var deviceHash = {};
        var phoneExtensionLists = {};
        let axlSqlQuery;
        try {
            axlSqlQuery = "select limit 1000 d.pkid, d.name, d.description, tm.name as model, tdp.name as deviceprotocol, d.fkenduser, d.isactive from device d left outer join typemodel tm on d.tkmodel = tm.enum left outer join typedeviceprotocol  tdp on d.tkdeviceprotocol = tdp.enum";
            if (params.pathList.length) {
                axlSqlQuery = axlSqlQuery + ` where d.name = '${params.pathList[0]}'`;
                //console.log(`EXECUTING AXLSQL: '${axlSqlQuery}'`);
                let deviceList = await cucmProfile.axlClient.queryPromise(axlSqlQuery);
                for (let i = 0; i < deviceList.length; i++) {
                    let thisDevice = deviceList[i];
                    deviceHash = thisDevice;
                    axlSqlQuery = `select np.dnorpattern, dnpm.numplanindex, rp.name as partition from devicenumplanmap dnpm, numplan np, routepartition rp where dnpm.fknumplan = np.pkid and dnpm.fkdevice = '${deviceHash.pkid}' and np.fkroutepartition = rp.pkid order by dnpm.numplanindex asc`;
                    //axlSqlQuery = `select np.*, dnpm.*, rp.name as partition from devicenumplanmap dnpm, numplan np, routepartition rp where dnpm.fknumplan = np.pkid and dnpm.fkdevice = '${deviceHash.pkid}' and np.fkroutepartition = rp.pkid order by dnpm.numplanindex asc`;
                    //console.log(`EXECUTING AXLSQL: '${axlSqlQuery}'`);
                    let extensionRecordList = await cucmProfile.axlClient.queryPromise(axlSqlQuery);
                    deviceHash['extensions'] = extensionRecordList;
                    /*
                    let extensionPatternList = [];
                    for (let i = 0; i < extensionRecordList.length; i++) {
                        let thisExtensionObj = extensionRecordList[i];
                        extensionPatternList.push(thisExtensionObj['dnorpattern']);
                    }
                    deviceHash['extensions'] = extensionPatternList.join("|");
                    */
                }
            } else {
                // Query extensions
                /*
                let extensionList = await thisProvider.axlClient.queryPromise("select dnpm.fkdevice, np.dnorpattern, dnpm.numplanindex from devicenumplanmap dnpm, numplan np where dnpm.fknumplan = np.pkid order by dnpm.fkdevice, dnpm.numplanindex asc");
                for (let i = 0; i < extensionList.length; i++) {
                    let thisExtension = extensionList[i];
                    if (!phoneExtensionLists[thisExtension['fkdevice']]) {
                        phoneExtensionLists[thisExtension['fkdevice']] = [];
                    }
                    phoneExtensionLists[thisExtension['fkdevice']].push(thisExtension['dnorpattern']);
                }
                */
                // Query devices; add to deviceHash
                let deviceList = await cucmProfile.axlClient.queryPromise(axlSqlQuery);
                for (let i = 0; i < deviceList.length; i++) {
                    let thisDevice = deviceList[i];
                    let devicePK = thisDevice['name'];
                    deviceHash[devicePK] = thisDevice;
                    /*
                    let extensions = "";
                    if (phoneExtensionLists[devicePK]) {
                        extensions = phoneExtensionLists[devicePK].join("|");
                    }
                    deviceHash[devicePK]['extensions'] = extensions;
                    */
                }
            }

            // Done
            //console.log("Found [" + deviceList.length + "] devices and [" + extensionList.length + "] numplan map entries");
            resolve(deviceHash);
        } catch (ex) {
            console.log(`FAILED EXECUTING AXLSQL Query... '${axlSqlQuery}'`)
            console.dir(ex);
            reject(ex);
        }
    });
}

myProvider.GetUsers = function (cucmProfile, params) {
    var thisProvider = this;
    return new Promise(async function (resolve, reject) {
        //var axlResults = null;
        var userHash = {};
        //console.dir(remainingPath);
        try {
            //console.log("RUNNING AXL QUERY...");
            // Query users
            let axlSqlQuery = "select limit 1000 pkid, firstname, lastname, userid, status, islocaluser, enablecups from enduser";
            if (params.pathList.length) {
                axlSqlQuery = axlSqlQuery + ` where userid = '${params.pathList[0]}'`;
                let userList = await cucmProfile.axlClient.queryPromise(axlSqlQuery);
                for (let i = 0; i < userList.length; i++) {
                    let thisUser = userList[i];
                    userHash = thisUser;
                }
            } else {
                let userList = await cucmProfile.axlClient.queryPromise(axlSqlQuery);
                for (let i = 0; i < userList.length; i++) {
                    let thisUser = userList[i];
                    userHash[thisUser['userid']] = thisUser;
                }
            }
            //console.log("RETURNING AXL QUERY RESULTS...");
            resolve(userHash);
        } catch (ex) {
            reject(ex);
        }
    });
}

// Add a test service
/*
myProvider.AddService("Greeter", {
    ClientCmds : {
        sayHi: async function () { return { pathItem: "Hello!" }; },
        sayBye: async function () { return { pathItem: "Goodbye..." }; },
        showParams: async function (params) { return { pathItem: params} }
    }
});
*/

myProvider.Structure = function (params) { return myProvider.ListProfiles(params); }
myProvider.SubStructure = {
    "Devices": async function (profileName, params) { return myProvider.GetDevices(myProvider.CUCMProfiles[profileName], params); },
    "Users": async function (profileName, params) { return myProvider.GetUsers(myProvider.CUCMProfiles[profileName], params); },
    "Servers": async function (profileName, params) { return [] }
};

myProvider.ListProfiles = function (params) {
    let myProvider = this;
    let returnObj = {};
    if (params.pathList.length) {
        let profileName = params.pathList.shift();
        if (myProvider.CUCMProfiles[profileName]) {
            let routeName = params.pathList.shift();
            if (routeName && myProvider.SubStructure[routeName]) {
                returnObj = myProvider.SubStructure[routeName](profileName, params);
            } else {
                returnObj = myProvider.SubStructure;
            }
        }
    } else {
        returnObj = myProvider.CUCMProfiles;
    }
    return returnObj;
}

// Connect to Registry
myProvider.ConnectToRegistry(registryURL, proxyURL);



