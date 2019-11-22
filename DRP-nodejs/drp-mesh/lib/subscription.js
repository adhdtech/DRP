'use strict';

class DRP_Subscription {
    /**
     * @param {string} streamToken Token
     * @param {string} topicName Topic name
     * @param {string} scope global|local
     * @param {{string:object}} filter Filter
     * @param {function} streamHandler Stream handler
     */
    constructor(streamToken, topicName, scope, filter, streamHandler) {
        this.streamToken = streamToken;
        this.topicName = topicName;
        this.scope = scope || "local";
        this.filter = filter || null;
        this.subscribedTo = [];
        this.streamHandler = streamHandler;
    }
}

module.exports = DRP_Subscription;