const DRP_Service = require('drp-mesh').Service;
const DRP_Node = require('drp-mesh').Node;
const MongoClient = require('mongodb').MongoClient;

const assert = require('assert');

require('events').EventEmitter.prototype._maxListeners = 100;

class DRP_CacheManager extends DRP_Service {
    /**
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(serviceName, drpNode) {
        super(serviceName, drpNode, "CacheManager", `${drpNode.nodeID}-${serviceName}`, false, 10, 10, drpNode.Zone, "global", null, 1);
        let thisService = this;
        this.mongoDBurl = null;
        this.mongoConn = null;

        this.TestCache = null;

        this.ClientCmds = {
            "readClassCache": async (params) => {
                return await thisService.ReadClassCacheFromMongo(params.serviceName, params.className);
            },
            "writeClassCache": async (params) => {
                return await thisService.WriteClassCacheToMongo(params.serviceName, params.className, params.cacheData, params.snapTime);
            }
        };
    }
	
    async Connect(mongoDBurl) {
        let thisService = this;
        // Connect to Mongo
		this.mongoDBurl = mongoDBurl;
        this.mongoConn = await MongoClient.connect(this.mongoDBurl, { useNewUrlParser: true, useUnifiedTopology: true });
        this.drpNode.log("Connected to Mongo");
    }
	
    async ReadClassCacheFromMongo(serviceName, className) {
        let thisService = this;
        return new Promise(function (resolve, reject) {
            // Open the collector DB 
            var serviceDB = thisService.mongoConn.db(serviceName);
            // Connect to class collection
            var classCollection = serviceDB.collection(className);

            var configCollection = serviceDB.collection('collectorInfo');

            configCollection.findOne({ 'className': className }, function (err, document) {
                assert.equal(err, null);
                //assert.equal(1, docs.length);
                thisService.drpNode.log('className: ' + className + ", data: " + JSON.stringify(document));

                if (document) {
                    classCollection.find({ '_snapTime': document.lastSnapTime }).toArray(function (err, docs) {
                        resolve({ "err": err, "className": className, "docs": docs, "lastSnapTime": document.lastSnapTime });
                    });
                } else {
                    // No snap exists!
                    resolve({ "err": "No snap exists for className: " + className, "className": className });
                }
            });
        });
    }

    async WriteClassCacheToMongo(serviceName, className, cacheData, snapTime) {
        let thisService = this;
        return new Promise(function (resolve, reject) {
            // Reject if no data
            if (Object.keys(cacheData).length === 0) {
                thisService.drpNode.log("No collector records to insert for  " + serviceName + "/" + className);
                resolve();
            } else {

                // Open the collector DB 
                let collectorDB = thisService.drpNode.MongoConn.db(serviceName);
                // Connect to class collection
                let classCollection = collectorDB.collection(className);
                // Convert class data from hash to array
                let classDataAsArray = [];
                for (let objPK in cacheData) {
                    classDataAsArray.push(cacheData[objPK]);
                }

                let configCollection = collectorDB.collection('collectorInfo');

                configCollection.update({ 'className': className }, { 'className': className, 'lastSnapTime': snapTime }, { upsert: true }, function (err, result) {
                    if (err) {
                        reject(err);
                    }
                    classCollection.insert(classDataAsArray, { checkKeys: false }, function (err, result) {
                        if (err) {
                            thisService.drpNode.log("Error inserting collector records: " + err);
                            reject(err);
                        } else {
                            thisService.drpNode.log("Inserted collector records for  " + serviceName + "/" + className);
                            resolve();
                        }
                    });
                });
            }
        });
    }
}

module.exports = DRP_CacheManager;