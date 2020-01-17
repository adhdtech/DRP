'use strict';
const DRP_Consumer = require('drp-mesh').Consumer;
const DRP_Subscription = require('drp-mesh').Subscription;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var brokerURL = process.env.BROKERURL || "ws://localhost:8080";

console.log(`Starting Test Consumer, connecting to Broker Node @ ${brokerURL}`);
let myConsumer = new DRP_Consumer(brokerURL, null, async function () {
    // Connection established - let's do stuff
    let response = null;

    // See what commands are available;
    //response = await myClient.SendCmd("getCmds", null, true, null);
    //console.dir(response, { "depth": 10 });
    //myClient.SendCmd("getCmds", null, false, (response) => { console.dir(response) });

    // Execute a pathCmd
    //myClient.SendCmd("pathCmd", { "method": "cliGetPath", "pathList": ["Providers", "JSONDocMgr1", "Services", "JSONDocMgr", "ClientCmds", "listFiles"], "params": {}, "listOnly": true }, false, (payload) => { console.dir(payload, { "depth": 10 }) });
    
    // Get data for a class
    //myClient.GetClassRecords("SomeDataClass", (payload) => console.dir(payload) );

    // Subscribe to a stream
    myConsumer.BrokerClient.WatchStream("dummy", "global", (payload) => console.log(" STREAM -> " + payload));
    myConsumer.BrokerClient.WatchStream("RegistryUpdate", "global", (payload) => console.log(" STREAM -> " + payload));

    // Execute a service command
    //myClient.SendCmd("serviceCommand", { "serviceName": "Hive", "method": "listStereoTypes" }, false, (payload) => { console.dir(payload) });

    // List Files
    //myClient.SendCmd("serviceCommand", { "serviceName": "JSONDocMgr", "method": "listFiles" }, false, (payload) => { console.dir(payload) });

    // Load a file
    //response = await myClient.SendCmd("serviceCommand", { "serviceName": "JSONDocMgr", "method": "loadFile", "fileName": "newFile.json" }, true, null);

    // Save a file
    //response = await myClient.SendCmd("serviceCommand", { "serviceName": "JSONDocMgr", "method": "saveFile", "fileName": "newFile.json", "fileData": JSON.stringify({"someKey":"someVal"}) }, true, null);
	
	//response = (await myClient.SendCmd("Greeter", "showParams", {"pathList":["asdf","ijkl"]}, true, null)).payload.pathItem;

    console.dir(response, { "depth": 10 });
});