'use strict';
var drpEndpoint = require('drp-endpoint');
var os = require("os");

var hostname = os.hostname();

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
    }
}

let brokerURL = `ws://${hostname}:8080/broker`;
var paramBrokerURL = process.argv[2];
if (paramBrokerURL) {
	brokerURL = paramBrokerURL;
}

console.log(`Starting Test Client, connecting to Broker @ ${brokerURL}`);

let myClient = new DRPConsumer_BrokerClient(brokerURL, async function () {
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
    //myClient.WatchStream("dummy", (payload) => console.log(" STREAM -> " + payload));

    // Execute a service command
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "Hive", "method": "listStereoTypes" }, false, (payload) => { console.dir(payload) });

    // List Files
    //myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "listFiles" }, false, (payload) => { console.dir(payload) });

    // Load a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "loadFile", "fileName": "newFile.json" }, true, null);

    // Save a file
    //response = await myClient.SendCmd(this.wsConn, "serviceCommand", { "serviceName": "JSONDocMgr", "method": "saveFile", "fileName": "newFile.json", "fileData": JSON.stringify({"someKey":"someVal"}) }, true, null);
	
	response = (await myClient.SendCmd(this.wsConn, "Greeter", "showParams", {"pathList":["asdf","ijkl"]}, true, null)).payload.pathItem;

    console.dir(response, { "depth": 10 });
});