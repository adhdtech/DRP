//const DRP_AuthInfo = require("./auth").DRP_AuthInfo;

class DRP_MethodParams {
    /**
     * DRP Method Parameters
     * @param {string} verb
     * @param {string[]} pathList
     * @param {any} reqBody
     * @param {any} reqQuery
     * @param {string} callerType
     * @param {DRP_AuthInfo} authInfo
     */
    constructor(verb, pathList, reqBody, reqQuery, callerType, authInfo) {
        /** @type {string} */
        this.__verb = verb;
        /** @type {string[]} */
        this.__pathList = pathList;
        /** @type {object} */
        this.__reqBody = reqBody;
        /** @type {object} */
        this.__reqQuery = reqQuery;
        /** @type {string} */
        this.__callerType = callerType;
        /** @type {DRP_AuthInfo} */
        this.__authInfo = authInfo;
    }
}

/**
 * Get parameters for Service Method
 * @param {DRP_MethodParams} paramsObj Parameters object
 * @param {string[]} paramNames Ordered list of parameters to extract
 * @returns {Object.<string, any>}
 */
function DRP_GetParams(paramsObj, paramNames) {
    /*
     * Parameters can be passed four ways:
     *   - Ordered list of remaining path elements (params.__pathList[paramNames[x]])
     *   - POST or PUT body (params.__reqBody.myVar)
     *   - URL query (params.__reqQuery.myVar)
     *   - Directly in params (params.myVar)
    */
    let returnObj = {};
    if (!paramNames || !Array.isArray(paramNames)) return returnObj;
    for (let thisParamName of paramNames) {
        returnObj[thisParamName] = null;
        // First, see if the parameters were part of the remaining path (CLI or REST)
        if (paramsObj.__pathList && Array.isArray(paramsObj.__pathList)) {
            if (typeof paramsObj.__pathList[i] !== 'undefined') {
                returnObj[thisParamName] = paramsObj.__pathList[i];
            }
        }

        // Second, see if the parameters were passed in the payload (req.body)
        if (paramsObj.__reqBody && typeof paramsObj.__reqBody[thisParamName] !== 'undefined') {
            returnObj[thisParamName] = paramsObj.__reqBody[thisParamName];
        }

        // Third, see if the parameters were passed in params (req.query)
        if (paramsObj.__reqQuery && typeof paramsObj.__reqQuery[thisParamName] !== 'undefined') {
            returnObj[thisParamName] = paramsObj.__reqQuery[thisParamName];
        }

        // Fourth, see if the parameters were passed directly in the params (DRP Exec)
        if (typeof paramsObj[thisParamName] !== 'undefined') {
            returnObj[thisParamName] = paramsObj[thisParamName];
        }
    }
    return returnObj;
}

module.exports = { DRP_MethodParams, DRP_GetParams };