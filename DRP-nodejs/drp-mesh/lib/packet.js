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
     * @param {string} serviceInstanceID Execute on specific Service Instance
     */
    constructor(serviceName, method, params, token, routeOptions, serviceInstanceID) {
        super("cmd", routeOptions);
        this.method = method;
        this.params = params;
        this.serviceName = serviceName;
        this.token = token;
        this.serviceInstanceID = serviceInstanceID;
    }
}

class DRP_Reply extends DRP_Packet {
    /**
     * 
     * @param {string} token Reply Token
     * @param {number} status Status [0=failed,1=final packet,2=continue]
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
    DRP_RouteOptions: DRP_RouteOptions
};