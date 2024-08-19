'use strict';

const { DRP_CmdError, DRP_ErrorCode } = require("./packet");
const { DRP_MethodParams, DRP_GetParams } = require("./params");
const { DRP_SubscribableSource, DRP_Subscriber } = require('./subscription');

class DRP_TopicManager {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(drpNode) {
        let thisTopicManager = this;

        // Set DRP Node
        this.DRPNode = drpNode;
        /** @type {Object.<string,DRP_TopicManager_Topic>} */
        this.Topics = {};
    }

    GetTopicID(serviceName, topicName, path) {
        switch (true) {
            case (topicName && topicName.length > 0):
                return (serviceName && serviceName.length) ? `${serviceName}.${topicName}` : topicName;
            case (path && path.length > 0):
                return path.replaceAll(/\/\\/, '_');
            default:
                throw new DRP_CmdError("No serviceName/topicName or path provided", DRP_ErrorCode.BADREQUEST);
        }
    }

    CreateTopic(serviceName, topicName, historyLength) {
        // Add logic to verify topic queue name is formatted correctly and doesn't already exist
        let topicID = this.GetTopicID(serviceName, topicName);
        let newTopic = new DRP_TopicManager_Topic(this, serviceName, topicName, historyLength);
        this.Topics[topicID] = newTopic;
        this.DRPNode.log("Created topic [" + topicName + "]", "TopicManager");
        return newTopic;
    }

    GetTopic(serviceName, topicName) {
        let topicID = this.GetTopicID(serviceName, topicName);
        if (!this.Topics[topicID]) {
            return;
            //this.CreateTopic(serviceName, topicName);
        }
        return this.Topics[topicID];
    }

    /**
     * 
     * @param {DRP_Subscriber} subscription Subscription
     */
    SubscribeToTopic(subscription) {
        let topicID = this.GetTopicID(subscription.serviceName, subscription.topicName);

        // If topic doesn't exist, exit
        if (!this.Topics[topicID]) {
            //this.CreateTopic(subscription.serviceName, subscription.topicName, 1000);
            return;
        }

        this.Topics[topicID].AddSubscription(subscription);
    }

    UnsubscribeFromTopic(topicName, subscriberID) {
        if (this.Topics[topicName]) {
            let thisTopic = this.Topics[topicName];
            thisTopic.RemoveSubscriber(subscriberID);
        }
    }

    UnsubscribeFromAll(endpoint, token) {
        let thisTopicManager = this;
        let topicKeys = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeys.length; i++) {
            thisTopicManager.UnsubscribeFromTopic(topicKeys[i], endpoint, token);
        }
    }

    SendToTopic(serviceName, topicName, message) {
        let thisTopicManager = this;

        let topicID = this.GetTopicID(serviceName, topicName);

        // If topic doesn't exist, return
        if (!this.Topics[topicID]) {
            return;
            //this.CreateTopic(serviceName, topicName);
        }

        this.Topics[topicID].Send(message);
    }

    GetTopicCounts() {
        let thisTopicManager = this;
        let responseObject = {};
        let topicKeyList = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeyList.length; i++) {
            let thisTopic = thisTopicManager.Topics[topicKeyList[i]];
            responseObject[topicKeyList[i]] = {
                SubscriberCount: thisTopic.Subscriptions.length,
                ReceivedMessages: thisTopic.ReceivedMessages,
                SentMessages: thisTopic.SentMessages
            };
        }
        return responseObject;
    }
}

class DRP_TopicManager_Topic extends DRP_SubscribableSource {
    /**
     * 
     * @param {DRP_TopicManager} topicManager Topic Manager
     * @param {string} serviceName Topic Name
     * @param {string} topicName Topic Name
     * @param {number} maxHistoryLength History Length
     */
    constructor(topicManager, serviceName, topicName, maxHistoryLength) {
        super(topicManager.DRPNode.NodeID, serviceName, topicName);
        let thisTopic = this;

        // Set Topic Manager
        this.__TopicManager = topicManager;
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.MaxHistoryLength = maxHistoryLength || 10;
        /** @type Array<DRP_TopicMessage> */
        this.History = [];
        this.GetHistory = this.GetHistory;
    }

    async Send(message) {
        let thisTopic = this;

        let nodeID = thisTopic.__TopicManager.DRPNode.NodeID;
        let timeStamp = thisTopic.__TopicManager.DRPNode.getTimestamp();
        let topicEntry = new DRP_TopicMessage(nodeID, timeStamp, message);

        thisTopic.ReceivedMessages++;

        if (thisTopic.History.length === thisTopic.MaxHistoryLength) {
            thisTopic.History.shift();
        }
        thisTopic.History.push(topicEntry);

        super.Send(topicEntry,
            () => { thisTopic.SentMessages++; },
            (sendFailed) => { thisTopic.__TopicManager.DRPNode.log(`Topic[${thisTopic.__TopicName}] subscriber removed forcefully, failure response -> ${sendFailed}`); }
        );

    }

    /**
     * Get topic history
     * @param {DRP_MethodParams} paramsObj
     */
    GetHistory(paramsObj) {
        let thisTopic = this;
        let returnObj = null;
        let outputMsgOnly = false;

        let params = DRP_GetParams(paramsObj, ['outputMsgOnly']);

        if (params.outputMsgOnly) {
            outputMsgOnly = thisTopic.__TopicManager.DRPNode.IsTrue(params.outputMsgOnly)
        }

        if (outputMsgOnly) {
            returnObj = thisTopic.History.map(thisEntry => thisEntry.Message);
        } else {
            returnObj = thisTopic.History;
        }
        return returnObj;
    }
}

class DRP_TopicMessage {

    constructor(nodeID, timeStamp, message) {
        this.TimeStamp = timeStamp;
        this.Message = message;
        this.Route = [nodeID];
    }
}

module.exports = {
    DRP_TopicManager: DRP_TopicManager,
    DRP_TopicManager_Topic: DRP_TopicManager_Topic
}