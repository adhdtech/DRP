'use strict';
var drpService = require('drp-service');
var os = require("os");

var hostname = os.hostname();

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

console.log(`Starting Test Client, connecting to Node @ ${registryURL}`);

let myClient = new drpService.ConsumerClient(registryURL, async function () {
    // Connection established - let's do stuff
    let response = null;

    // See what commands are available;
    //response = await myClient.SendCmd(this.wsConn, "getCmds", null, true, null);
    //console.dir(response, { "depth": 10 });
    //myClient.SendCmd(this.wsConn, "getCmds", null, false, (response) => { console.dir(response) });

    // Execute a pathCmd
    //myClient.SendCmd(this.wsConn, "pathCmd", { "method": "cliGetPath", "pathList": ["Providers", "JSONDocMgr1", "Services", "JSONDocMgr", "ClientCmds", "listFiles"], "params": {}, "listOnly": true }, false, (payload) => { console.dir(payload, { "depth": 10 }) });
    
    // Get data for a class
    //myClient.GetClassRecords("SomeDataClass", (payload) => console.dir(payload) );

    // Subscribe to a stream
    myClient.WatchStream("dummy", "global", (payload) => console.log(" STREAM -> " + payload));
    myClient.WatchStream("RegistryUpdate", null, (payload) => console.log(" STREAM -> " + payload));

    // Execute a service command
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "Hive", "method": "listStereoTypes" }, false, (payload) => { console.dir(payload) });

    // List Files
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "listFiles" }, false, (payload) => { console.dir(payload) });

    // Load a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "loadFile", "fileName": "newFile.json" }, true, null);

    // Save a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "saveFile", "fileName": "newFile.json", "fileData": JSON.stringify({"someKey":"someVal"}) }, true, null);
	
	//response = (await myClient.SendCmd(this.wsConn, "Greeter", "showParams", {"pathList":["asdf","ijkl"]}, true, null)).payload.pathItem;

    console.dir(response, { "depth": 10 });
});