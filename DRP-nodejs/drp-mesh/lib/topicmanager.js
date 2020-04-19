'use strict';

const DRP_SubscribableSource = require('./subscription').SubscribableSource;
const DRP_Subscriber = require('./subscription').Subscriber;

class DRP_TopicManager {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(drpNode) {
        let thisTopicManager = this;

        // Set DRP Node
        this.drpNode = drpNode;
        /** @type {Object.<string,DRP_TopicManager_Topic>} */
        this.Topics = {};
    }

    CreateTopic(topicName, historyLength) {
        // Add logic to verify topic queue name is formatted correctly and doesn't already exist
        this.Topics[topicName] = new DRP_TopicManager_Topic(this, topicName, historyLength);
        this.drpNode.log("Created topic [" + topicName + "]", "TopicManager");
    }

    GetTopic(topicName) {
        if (!this.Topics[topicName]) { this.CreateTopic(topicName); }
        return this.Topics[topicName];
    }

    /**
     * 
     * @param {DRP_SubscriptionDeclaration} subscription Subscription
     */
    SubscribeToTopic(subscription) {
        // If topic doesn't exist, create it
        if (!this.Topics[subscription.topicName]) {
            this.CreateTopic(subscription.topicName);
        }

        this.Topics[subscription.topicName].AddSubscription(subscription);

        //this.drpNode.log("Subscribed to topic [" + topicName + "] with token [" + token + "]");
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

    SendToTopic(topicName, message) {
        let thisTopicManager = this;
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Send(message);
    }

    GetTopicCounts() {
        let thisTopicManager = this;
        let responseObject = {};
        let topicKeyList = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeyList.length; i++) {
            let thisTopic = thisTopicManager.Topics[topicKeyList[i]];
            responseObject[topicKeyList[i]] = {
                SubscriberCount: thisTopic.Subscribers.length,
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
     * @param {string} topicName Topic Name
     * @param {number} historyLength History Length
     */
    constructor(topicManager, topicName, historyLength) {
        super();
        let thisTopic = this;

        // Set Topic Manager
        this.TopicManager = topicManager;
        this.TopicName = topicName;
        /** @type Set<DRP_Subscriber> */
        this.Subscribers = {};
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.HistoryLength = historyLength || 10;
        /** @type Array<DRP_TopicMessage> */
        this.History = [];
    }

    async Send(message) {
        let thisTopic = this;

        let nodeID = thisTopic.TopicManager.drpNode.nodeID;
        let timeStamp = thisTopic.TopicManager.drpNode.getTimestamp();
        let topicEntry = new DRP_TopicMessage(nodeID, timeStamp, message);

        thisTopic.ReceivedMessages++;

        if (thisTopic.History.length === thisTopic.HistoryLength) {
            thisTopic.History.shift();
        }
        thisTopic.History.push(topicEntry);

        super.Send(topicEntry,
            () => { thisTopic.SentMessages++; },
            (sendFailed) => { thisTopic.TopicManager.drpNode.log(`Topic[${thisTopic.TopicName}] subscriber removed forcefully, failure response -> ${sendFailed}`); }
        );

    }
}

class DRP_TopicMessage {

    constructor(nodeID, timeStamp, message) {
        this.TimeStamp = timeStamp;
        this.Message = message;
        this.Route = [nodeID];
    }
}

module.exports = DRP_TopicManager;