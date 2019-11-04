const MongoClient = require('mongodb').MongoClient;
var drpService = require('drp-service');

require('events').EventEmitter.prototype._maxListeners = 100;

class rSageCacheService extends drpService.Service {
    /**
     * @param {string} serviceName Service Name
     * @param {drpService.Node} drpNode DRP Node
     * @param {Function} loadCompleteCallback Load complete callback function
     */
    constructor(serviceName, drpNode, loadCompleteCallback) {
        super(serviceName);
        let thisService = this;
		this.node = drpNode;
        this.mongoDBurl = null;
        this.mongoConn = null;

        this.loadCompleteCallback = loadCompleteCallback;
    }
	
    async Connect(mongoDBurl) {
        let thisService = this;
        // Connect to Mongo
		this.mongoDBurl = mongoDBurl;
        this.mongoConn = await MongoClient.connect(this.mongoDBurl, { useNewUrlParser: true });
        this.node.log("Connected to Mongo");
    }
	
	ReadClassCacheFromMongo(serviceName, className, callback) {
        let thisService = this;
        // Open the collector DB 
        var serviceDB = thisService.mongoConn.db(serviceName);
        // Connect to class collection
        var classCollection = serviceDB.collection(className);

        var configCollection = serviceDB.collection('collectorInfo');

        configCollection.findOne({ 'className': className }, function (err, document) {
            assert.equal(err, null);
            //assert.equal(1, docs.length);
            thisService.node.log('className: ' + className + ", data: " + JSON.stringify(document));
			
            if (document) {
                classCollection.find({ '_snapTime': document.lastSnapTime }).toArray(function (err, docs) {
                    callback(err, className, docs, document.lastSnapTime);
                });
            } else {
                // No snap exists!
                callback("No snap exists for className: " + className, className);
            }
        });
    }
}

module.exports = rSageCacheService;