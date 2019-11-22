'use strict';

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
        //this.DRPServer.LogEvent("Created topic [" + topicName + "]", "TopicManager");
    }

    SubscribeToTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (!this.Topics[topicName]) {
            this.CreateTopic(topicName);
        }

        this.Topics[topicName].Subscribers.push({
            conn: conn,
            token: token,
            filter: filter
        });

        this.drpNode.log("Subscribed to topic [" + topicName + "] with token [" + token + "]");
        //this.DRPServer.VDMServer.LogWSUnityClientEvent(conn, "Subscribed to topic [" + topicName + "]");
    }

    UnsubscribeFromTopic(topicName, conn, token, filter) {
        // If topic doesn't exist, create it
        if (this.Topics[topicName]) {
            let thisTopic = this.Topics[topicName];

            let i = thisTopic.Subscribers.length;
            while (i--) {
                let thisSubscriberObj = thisTopic.Subscribers[i];
                if (thisSubscriberObj.conn === conn && thisSubscriberObj.token === token) {
                    thisTopic.Subscribers.splice(i, 1);
                    //console.log("Subscription client[" + i + "] removed gracefully");
                    break;
                }
            }
        }
    }

    UnsubscribeFromAll(conn, token) {
        let thisTopicManager = this;
        let topicKeys = Object.keys(thisTopicManager.Topics);
        for (let i = 0; i < topicKeys.length; i++) {
            thisTopicManager.UnsubscribeFromTopic(topicKeys[i], conn, token);
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
        this.Subscribers = [];
        this.ReceivedMessages = 0;
        this.SentMessages = 0;
        this.LastTen = [];

        /*
        Subscribers: [
            {
                clientObj : {clientObj},
                token: {subscriberToken},
                filter: {filter}
            }
        ]
        */
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
            let sendFailed = thisTopic.TopicManager.drpNode.RouteHandler.SendStream(thisSubscriberObj.conn, thisSubscriberObj.token, 2, message);
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