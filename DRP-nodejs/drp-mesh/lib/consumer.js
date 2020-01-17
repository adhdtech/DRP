'use strict';

const DRP_Node = require("./node");
const DRP_Client = require("./client");

class DRP_Consumer extends DRP_Node {
    /**
     * 
     * @param {string} wsTarget WebSocket target
     * @param {string} proxy Proxy URL
     * @param {function} openHandler Callback after open
     */
    constructor(wsTarget, proxy, openHandler) {
        super();
        this.brokerURL = wsTarget;
        this.webProxyURL = proxy;
        /** @type {DRP_Client} */
        this.BrokerClient = null;
        this.Start(openHandler);
    }

    async Start(openHandler) {
        this.BrokerClient = new DRP_ConsumerClient(this.brokerURL, openHandler);
        this.BrokerClient.drpNode = this;
    }
}

class DRP_ConsumerClient extends DRP_Client {
    constructor(wsTarget, callback) {
        super(wsTarget);
        this.postOpenCallback = callback;
    }

    async OpenHandler() {
        let thisNodeClient = this;
        await thisNodeClient.SendCmd("DRP", "hello", { "userAgent": "nodejs" }, true, null); 
        thisNodeClient.postOpenCallback();
    }

    async CloseHandler(closeCode) {
        console.log("Consumer to Node client [" + this.RemoteAddress() + ":" + this.RemotePort() + "] closed with code [" + closeCode + "]");
    }

    async ErrorHandler(error) {
        console.log("Consumer to Node client encountered error [" + error + "]");
    }
}

module.exports = DRP_Consumer;