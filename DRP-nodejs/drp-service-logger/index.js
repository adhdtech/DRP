'use strict';

const DRP_Service = require('drp-mesh').Service;
const { DRP_MethodParams, DRP_GetParams } = require('drp-mesh').Params;
const { DRP_CmdError, DRP_ErrorCode } = require('drp-mesh').Packet;
const MongoClient = require('mongodb').MongoClient;
const MongoDB = require('mongodb').Db;

class Logger extends DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {drpNode} drpNode DRP Node
     * @param {number} priority Priority (lower better)
     * @param {number} weight Weight (higher better)
     * @param {string} scope Scope [local|zone|global(defaut)]
     * @param {string} mongoHost Mongo Host
     * @param {string} mongoUser Mongo User
     * @param {string} mongoPw Mongo Password
     */
    constructor(serviceName, drpNode, priority, weight, scope, mongoHost, mongoUser, mongoPw) {
        super(serviceName, drpNode, "Logger", null, false, priority, weight, drpNode.Zone, scope, null, ["LoggingErrors"], 1);
        let thisService = this;

        /** @type {string} Mongo URL */
        this.__MongoHost = mongoHost;
        this.__MongoUser = mongoUser;
        this.__MongoPw = mongoPw;

        /** @type {MongoClient} */
        this.__MongoClient = null;

        /** @type {MongoDB} */
        this.__LoggerDB = null;

        if (thisService.__MongoHost) {
            thisService.ConnectToMongo();
        }

        this.ClientCmds = {
            writeLog: async (paramsObj) => {
                let methodParams = ['serviceName', 'logData'];
                let params = thisService.GetParams(paramsObj, methodParams);
                let writeResult;

                try {
                    if (!params.serviceName || !params.logData) {
                        throw new DRP_CmdError("Must provide serviceName, logData");
                    }
                    writeResult = await thisService.InsertDoc(params.serviceName, params.logData);
                } catch (ex) {
                    thisService.DRPNode.TopicManager.SendToTopic("LoggingErrors", { err: ex.message, serviceName: params.serviceName, logData: params.logData });
                    throw (ex);
                }
                return writeResult;
            }
        };

        this.ListCollections = this.ListCollections;
    }

    async ConnectToMongo() {
        let thisLogger = this;
        const user = encodeURIComponent(thisLogger.__MongoUser);
        const password = encodeURIComponent(thisLogger.__MongoPw);
        const authMechanism = 'DEFAULT';
        let mongoUrl = thisLogger.__MongoUser ? `mongodb://${user}:${password}@${thisLogger.__MongoHost}:27017/?authMechanism=${authMechanism}` : `mongodb://${thisLogger.__MongoHost}:27017`;
        thisLogger.DRPNode.log(`Trying to connect to Mongo -> [${mongoUrl}]`);
        /** @type {MongoClient} */
        thisLogger.__MongoClient = await MongoClient.connect(`${mongoUrl}`, { useNewUrlParser: true, useUnifiedTopology: true });
        thisLogger.DRPNode.log(`Connected to Mongo`);

        // Open the collector DB 
        this.__LoggerDB = thisLogger.__MongoClient.db(thisLogger.serviceName);
    }

    async ListCollections() {
        let thisLogger = this;
        let returnData = [];
        // Load doc data
        let docCollectionList = await thisLogger.__LoggerDB.listCollections().toArray();
        returnData = docCollectionList.map(collectionProfile => { return collectionProfile["name"]; });
        return returnData;
    }

    /**
     * 
     * @param {string} sourceService Name of source service
     * @param {object} logData Data object to insert
     * @return {InsertOneWriteOpResult} Result of insert operation
     */
    async InsertDoc(sourceService, logData) {
        let thisLogger = this;

        // Connect to Service doc collection
        let serviceDocCollection = thisLogger.__LoggerDB.collection(sourceService);

        // Write to Mongo
        let writeResults = await serviceDocCollection.insertOne(logData);

        return writeResults;
    }
}

module.exports = Logger;