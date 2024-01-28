const DRP_AuthInfo = require("./auth").DRP_AuthInfo;

class DRP_MethodParams {
    /**
     * DRP Method Parameters
     * @param {string} verb
     * @param {string[]} pathList
     * @param {any} payload
     * @param {string} callerType
     * @param {DRP_AuthInfo} authInfo
     */
    constructor(verb, pathList, payload, callerType, authInfo) {
        /** @type {string} */
        this.__verb = verb;
        /** @type {string[]} */
        this.__pathList = pathList;
        /** @type {object} */
        this.__payload = payload;
        /** @type {string} */
        this.__callerType = callerType;
        /** @type {DRP_AuthInfo} */
        this.__authInfo = authInfo;
    }
}

module.exports = DRP_MethodParams;