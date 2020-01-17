'use strict';

class DRP_TopicSubscription {
    /**
     * 
     * @param {DRP_Endpoint} endpoint DRP Endpoint
     * @param {string} token Subscription token
     * @param {Object} filter Subscription filter
     */
    constructor(endpoint, token, filter) {
        this.endpoint = endpoint;
        this.token = token;
        this.filter = filter;
    }
}

class DRP_TopicManager {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(drpNode) {
        let thisTopicManager = this;

        // Set DRP Node
        this.drpNode = drpNode;
        this.Topics = {};
    }

    CreateTopic(topicName) {
        // Add logic to verify topic queue name is formatted correctly and doesn't already exist
        this.Topics[topicName] = new DRP_TopicManager_Topic(this, topicName);
        this.drpNode.log("Created topic [" + topicName + "]", "TopicManager");
    }

    /**
     * 
     * @param {string} topicName Topic Name
     * @param {DRP_Endpoint} endpoint DRP Endpoint
     * @param {string} token Subscription token
     * @param {Object} filter Subscription Filter
     */
    SubscribeToTopic(topicName, endpoint, token, filter) {
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Subscribers.push(new DRP_TopicSubscription(endpoint, token, filter));

        this.drpNode.log("Subscribed to topic [" + topicName + "] with token [" + token + "]");
    }

    UnsubscribeFromTopic(topicName, endpoint, token, filter) {
        // If topic doesn't exist, create it
        if (this.Topics[topicName]) {
            let thisTopic = this.Topics[topicName];

            let i = thisTopic.Subscribers.length;
            while (i--) {
                let thisSubscriberObj = thisTopic.Subscribers[i];
                if (thisSubscriberObj.endpoint === endpoint && thisSubscriberObj.token === token) {
                    thisTopic.Subscribers.splice(i, 1);
                    //console.log("Subscription client[" + i + "] removed gracefully");
                    break;
                }
            }
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

class DRP_TopicManager_Topic {
    /**
     * 
     * @param {DRP_TopicManager} topicManager Topic Manager
     * @param {string} topicName Topic Name
     */
    constructor(topicManager, topicName) {
        var thisTopic = this;

        // Set Topic Manager
        this.TopicManager = topicManager;
        this.TopicName = topicName;
        /** @type DRP_TopicSubscription[] */
        this.Subscribers = [];
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.LastTen = [];
    }

    Send(message) {
        let thisTopic = this;

        thisTopic.ReceivedMessages++;

        if (thisTopic.LastTen.length === 10) {
            thisTopic.LastTen.shift();
        }
        thisTopic.LastTen.push(message);

        let i = thisTopic.Subscribers.length;
        while (i--) {
            let thisSubscriberObj = thisTopic.Subscribers[i];
            let sendFailed = thisSubscriberObj.endpoint.SendStream(thisSubscriberObj.token, 2, message);
            if (sendFailed) {
                thisTopic.Subscribers.splice(i, 1);
                thisTopic.TopicManager.drpNode.log("Subscription client[" + i + "] removed forcefully");
            } else {
                thisTopic.SentMessages++;
            }
        }
    }
}

module.exports = DRP_TopicManager;