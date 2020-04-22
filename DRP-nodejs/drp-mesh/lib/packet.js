class DRP_Packet {
    /**
     * 
     * @param {string} type Packet Type
     * @param {DRP_RouteOptions} routeOptions Route Options
     */
    constructor(type, routeOptions) {
        this.type = type;
        this.routeOptions = routeOptions || null;
    }
}

class DRP_Cmd extends DRP_Packet {
    /**
     * 
     * @param {string} serviceName DRP Service Name
     * @param {string} method Method Name
     * @param {Object} params Method Parameters
     * @param {string} token Reply Token
     * @param {DRP_RouteOptions} routeOptions Route Options
     * @param {string} runNodeID Execute on specific Node
     */
    constructor(serviceName, method, params, token, routeOptions, runNodeID) {
        super("cmd", routeOptions);
        this.method = method;
        this.params = params;
        this.serviceName = serviceName;
        this.token = token;
        this.runNodeID = runNodeID;
    }
}

class DRP_Reply extends DRP_Packet {
    /**
     * 
     * @param {string} token Reply Token
     * @param {number} status Execution Status
     * @param {any} payload Reply Payload
     * @param {DRP_RouteOptions} routeOptions Route Options
     */
    constructor(token, status, payload, routeOptions) {
        super("reply", routeOptions);
        this.token = token;
        this.status = status;
        this.payload = payload;
    }
}

class DRP_Stream extends DRP_Packet {
    /**
     * 
     * @param {string} token Stream Token
     * @param {number} status Stream Status [0=?,1=?,2=?]
     * @param {any} payload Stream Payload
     * @param {DRP_RouteOptions} routeOptions Route Options
     */
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