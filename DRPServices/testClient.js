'use strict';
var drpEndpoint = require('drp-endpoint');

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

class DRPConsumer_BrokerClient extends drpEndpoint.Client {
    constructor(wsTarget, callback) {
        super(wsTarget);
        this.postOpenCallback = callback;
    }

    async OpenHandler(wsConn, req) {
        let thisBrokerClient = this;

        thisBrokerClient.postOpenCallback();
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }

    // Watch a stream
    async WatchStream(streamName, callback) {
        let thisBrokerClient = this;
        let streamToken = thisBrokerClient.AddStreamHandler(thisBrokerClient.wsConn, function (message) {
            if (message && message.payload) {
                callback(message.payload);
            }
        });
        
        let response = await thisBrokerClient.SendCmd(thisBrokerClient.wsConn, "subscribe", { "topicName": streamName, "streamToken": streamToken }, true, null);

        if (response.status === 0) {
            this.DeleteCmdHandler(this.wsConn, streamToken);
            console.log("Subscribe failed, deleted handler");
        } else {
            console.log("Subscribe succeeded");
        }
    }

    // Get Class records
    async GetClassRecords(className, callback) {
        //response = await this.SendCmd(this.wsConn, "getClassRecords", { "className": "LDAP.Person" }, true, null);
        let response = await this.SendCmd(this.wsConn, "getClassRecords", { "className": className }, true, null);

        if (response && response.payload) {
            callback(response.payload);
        }

        //console.log("Records...");
        /*
        if (!response.payload) return;

        // Loop over providers offering class data
        let providerList = Object.keys(response.payload);
        for (let i = 0; i < providerList.length; i++) {
            let thisProviderObj = response.payload[providerList[i]];

            // Loop over records in class
            let objectKeyList = Object.keys(thisProviderObj);
            for (let k = 0; k < objectKeyList.length; k++) {
                let thisRecord = thisProviderObj[objectKeyList[k]];

                // Output object details
                //console.log(`${thisRecord.employeeNumber}\t${thisRecord.sn}\t${thisRecord.givenName}\t${thisRecord.azNickName || ""}\t${thisRecord.title}\t${thisRecord.azLocCode}\t${thisRecord.azLocPhysAddress || ""}`);
                console.log(objectKeyList[k]);
            }
        }
        */
        //console.log("Done.");
    }
}

console.log("Starting Test Client...");

//let myClient = new DRPConsumer_BrokerClient("wss://rsage.autozone.com/broker", async function () {
let myClient = new DRPConsumer_BrokerClient("ws://localhost:8080/broker", async function () {
    // Connection established - let's do stuff
    let response = null;

    // See what commands are available;
    //response = await myClient.SendCmd(this.wsConn, "getCmds", null, true, null);
    //console.dir(response, { "depth": 10 });
    //myClient.SendCmd(this.wsConn, "getCmds", null, false, (response) => { console.dir(response) });

    // Execute a pathCmd
    //myClient.SendCmd(this.wsConn, "pathCmd", { "method": "cliGetPath", "pathList": ["Providers", "rSageCortex1", "Services", "Hive", "HiveData", "LDAP.Person", "AZPEOPLE_LDAP", "records", "10707972", "data"], "params": {}, "listOnly": true }, false, (payload) => { console.dir(payload, { "depth": 10 }) });
    //myClient.SendCmd(this.wsConn, "pathCmd", { "method": "cliGetPath", "pathList": ["Providers", "rSageCollector1", "Structure", "Collectors", "AZPEOPLE_LDAP", "CollectorData", "LDAP.Person", "records", "10707972"], "params": {}, "listOnly": true }, false, (payload) => { console.dir(payload, { "depth": 10 }) });
    
    // Get data for a class
    //myClient.GetClassRecords("IP.BalancerProfile", (payload) => console.dir(payload) );

    // Subscribe to a stream
    myClient.WatchStream("dummy", (payload) => console.log(" STREAM -> " + payload));
    //myClient.WatchStream("CCAuthLogs", (payload) => console.log(`<CCAUTHLOG> -> [${payload}]`));

    // Execute a service command
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "Hive", "method": "listStereoTypes" }, false, (payload) => { console.dir(payload) });

    // List Files
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "listFiles" }, false, (payload) => { console.dir(payload) });

    // Load a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "loadFile", "fileName": "newFile.json" }, true, null);

    // Save a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "saveFile", "fileName": "newFile.json", "fileData": JSON.stringify({"someKey":"someVal"}) }, true, null);

    //console.dir(response, { "depth": 10 });
});