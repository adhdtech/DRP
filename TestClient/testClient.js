'use strict';
var drpEndpoint = require('drp-endpoint');

class DRPConsumer_BrokerClient extends drpEndpoint.Client {
    constructor(wsTarget) {
        super(wsTarget);
    }

    async OpenHandler(wsConn, req) {
        console.log("Consumer to Broker client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] opened");

        let response = await this.SendCmd(this.wsConn, "getCmds", null, true, null);
        //console.dir(response, { "depth": 10 });

        let streamToken = this.AddCmdHandler(this.wsConn, function (message) {
            console.log(" STREAM -> " + message.payload);
        });

        response = await this.SendCmd(this.wsConn, "subscribe", streamToken, true, null);

        if (response.status === 0) {
            this.DeleteCmdHandler(this.wsConn, streamToken);
            console.log("Subscribe failed, deleted handler");
        } else {
            console.log("Subscribe succeeded");
        }
        //console.dir(response, { "depth": 10 });

        response = await this.SendCmd(this.wsConn, "blah", null, true, null);

        console.log(response);
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }
}

console.log("Starting Test Client...");

let myClient = new DRPConsumer_BrokerClient("ws://localhost:8082/consumer");