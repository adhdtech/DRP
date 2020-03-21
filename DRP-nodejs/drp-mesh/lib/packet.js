class DRP_Packet {
    constructor(type, routeOptions) {
        this.type = type;
        this.routeOptions = routeOptions || null;
    }
}

class DRP_Cmd extends DRP_Packet {
    /**
     * 
     * @param {string} serviceName DRP Service Name
     * @param {string} cmd Service Method
     * @param {Object} params Method Parameters
     * @param {string} replytoken Reply Token
     * @param {DRP_RouteOptions} routeOptions Route Options
     * @param {string} runNodeID Execute on specific Node
     */
    constructor(serviceName, cmd, params, replytoken, routeOptions, runNodeID) {
        super("cmd", routeOptions);
        this.cmd = cmd;
        this.params = params;
        this.serviceName = serviceName;
        this.replytoken = replytoken;
        this.runNodeID = runNodeID;
    }
}

class DRP_Reply extends DRP_Packet {
    constructor(token, status, payload, routeOptions) {
        super("reply", routeOptions);
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}

class DRP_Stream extends DRP_Packet {
    constructor(token, status, payload, routeOptions) {
        super("stream", routeOptions);
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}

class DRP_RouteOptions {
    /**
     * 
     * @param {string} srcNodeID Source Node ID
     * @param {string} tgtNodeID Target Node ID
     * @param {string[]} routeHistory List of Nodes used as proxies; could be used to calculate TTL
     */
    constructor(srcNodeID, tgtNodeID, routeHistory) {
        this.srcNodeID = srcNodeID;
        this.tgtNodeID = tgtNodeID;
        this.routeHistory = routeHistory || [];
    }
}

module.exports = {
    DRP_Packet: DRP_Packet,
    DRP_Cmd: DRP_Cmd,
    DRP_Reply: DRP_Reply,
    DRP_Stream: DRP_Stream,
    DRP_RouteOptions: DRP_RouteOptions
};