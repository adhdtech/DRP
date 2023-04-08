const DRP_ErrorCode = {
    BADREQUEST: 400, // Bad Request - User provided bad input
    UNAUTHORIZED: 401, // Unauthorized - User doesn't have rights
    NOTFOUND: 404, // Not Found - Target object not found (use for PathCmd when object not found)
    SVCTIMEOUT: 408, // Request Timeout - Valid request, timed out
    SVCERR: 500, // Internal Server Error - Valid request, failure on server side
    UNAVAILABLE: 503, // Service Unavailable - Service unavailable to answer requests (use for RPC when service not found)
    GWTIMEOUT: 504, // Gateway Timeout - Broker sent command to service but did not receive response in time
    NOSTORAGE: 507, // Insufficient Storage - The server does not have storage to process request
    LOOP: 508, // Loop Detected - The server detected an infinite loop while processing the request
}

class DRP_CmdError extends Error {
    /**
     * DRP Command Error
     * @param {string} message
     * @param {number} code
     * @param {string} source
     */
    constructor(message, code, source) {
        super(message);
        this.name = "DRPCmdError";
        this.code = code
        this.source = source
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            source: this.source,
            stack: this.stack
        }
    }
}

class DRP_Packet {
    /**
     * 
     * @param {string} type Packet Type
     * @param {DRP_RouteOptions} routeOptions Route Options
     * @param {string} token Reply Token
     */
    constructor(type, routeOptions, token) {
        this.type = type;
        this.routeOptions = routeOptions || null;
        this.token = token;
    }
}

class DRP_Cmd extends DRP_Packet {
    /**
     * 
     * @param {string} serviceName DRP Service Name
     * @param {string} method Method Name
     * @param {Object} params Method Parameters
     * @param {number} token Reply Token
     * @param {DRP_RouteOptions} routeOptions Route Options
     * @param {string} serviceInstanceID Execute on specific Service Instance
     * @param {string} limitScope Limit execution scope (local|zone|global)
     */
    constructor(serviceName, method, params, token, routeOptions, serviceInstanceID, limitScope) {
        super("cmd", routeOptions, token);
        this.method = method;
        this.params = params;
        this.serviceName = serviceName;
        this.serviceInstanceID = serviceInstanceID;
        this.limitScope = limitScope;
    }
}

/**
 * @typedef {Object} DRP_Reply_Error
 * @property {number} code Error code
 * @property {string} msg Error message
 */

/**
 * For RPC commands, the "status" field tells whether or not the command was
 * received and processed by the target service instance.  The "err.code" contains
 * the results from the target service instance.
 */

class DRP_Reply extends DRP_Packet {
    /**
     * 
     * @param {number} token Reply Token
     * @param {number} status Status [0=failed,1=final packet,2=continue]
     * @param {DRP_Reply_Error} err Error Object
     * @param {any} payload Reply Payload
     * @param {DRP_RouteOptions} routeOptions Route Options
     */

    constructor(token, status, err, payload, routeOptions) {
        super("reply", routeOptions, token);
        this.status = status;
        this.err = err;
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
    DRP_RouteOptions: DRP_RouteOptions,
    DRP_CmdError: DRP_CmdError,
    DRP_ErrorCode: DRP_ErrorCode
};