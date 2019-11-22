'use strict';

const DRP_Service = require('drp-mesh').Service;
const DRP_Node = require('drp-mesh').Node;
const DRP_Subscription = require('drp-mesh').Subscription;

const mssql = require('mssql');

class LogManager extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {{string:object}} sqlConfig SQL Config
     */
    constructor(serviceName, drpNode, sqlConfig) {
        super(serviceName, drpNode);

        /** @type {string} */
        this.BrokerNodeID = null;

        /** @type {DRP_Client} */
        this.BrokerNodeClient = null;

        this.SQLConfig = sqlConfig;

        this.Start();
    }

    async Start() {
        // Connect to SQL
        this.SQLConnPool = await new mssql.ConnectionPool(this.SQLConfig).connect();
    }

    async LogStream(streamName, callback) {
        let thisService = this;
        thisService.drpNode.AddSubscription(streamName, new DRP_Subscription(null, streamName, "local", null, callback));
    }
}

module.exports = LogManager;