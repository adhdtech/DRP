'use strict';

const { DRP_MethodParams, DRP_GetParams } = require("./params");
const { DRP_CmdError, DRP_ErrorCode } = require("./packet");

let IsTrue = function (value) {
    if (typeof (value) === 'string') {
        value = value.trim().toLowerCase();
    }
    switch (value) {
        case true:
        case "true":
        case 1:
        case "1":
        case "on":
        case "y":
        case "yes":
            return true;
        default:
            return false;
    }
}

class DRP_AuthInfo {
    /**
     * 
     * @param {string} type
     * @param {string} value
     * @param {any} userInfo
     */
    constructor(type, value, userInfo) {
        this.type = type || null;
        this.value = value || null;
        this.userInfo = userInfo || null;
    }
}

class DRP_Permission {
    /**
     * 
     * @param {boolean} read
     * @param {boolean} write
     * @param {boolean} execute
     */
    constructor(read, write, execute) {
        this.read = IsTrue(read);
        this.write = IsTrue(write);
        this.execute = IsTrue(execute);
    }
}

class DRP_PermissionSet {
    /**
     * 
     * @param {Object<string,DRP_Permission>} keys
     * @param {Object<string,DRP_Permission>} users
     * @param {Object<string,DRP_Permission>} groups
     */
    constructor(keys, users, groups) {
        this.Keys = keys || {};
        this.Users = users || {};
        this.Groups = groups || {};
    }
}

class DRP_Securable {
    /**
     * 
     * @param {DRP_PermissionSet} permissionSet Permission set for accessing object
     */
    constructor(permissionSet) {
        this.__permissionSet = permissionSet;
    }

    /**
     * 
     * @param {DRP_AuthInfo} callerAuthInfo
     * @param {string} operationType
     */
    CheckPermission(callerAuthInfo, operationType) {
        try {
            // If no permission set is in place, default to allowed
            if (!this.__permissionSet) {
                return true;
            }
            if (callerAuthInfo && callerAuthInfo.type) {
                // Is it a token or a key?
                switch (callerAuthInfo.type) {
                    case 'key':
                        // Check API key permissions
                        return this.#IsOperationAllowed(this.__permissionSet.Keys[callerAuthInfo.value], operationType);
                        break;
                    case 'token':
                        // Check individual permissions
                        if (this.#IsOperationAllowed(this.__permissionSet.Users[callerAuthInfo.userInfo.UserName], operationType)) return true;

                        // Check group permissions
                        for (let i = 0; i < callerAuthInfo.userInfo.Groups.length; i++) {
                            let userGroupName = callerAuthInfo.userInfo.Groups[i];
                            if (this.#IsOperationAllowed(this.__permissionSet.Groups[userGroupName], operationType)) return true;
                        }
                        break;
                    default:
                }
            }
            return false;
        } catch (ex) {
            return false;
        }
    }

    /**
     * 
     * @param {DRP_Permission} thisPermission
     * @param {string} operationType
     */
    #IsOperationAllowed(thisPermission, operationType) {
        if (!thisPermission) return false;
        let isAllowed = false;
        switch (operationType) {
            case 'read':
                if (thisPermission.read) isAllowed = true;
                break;
            case 'write':
                if (thisPermission.write) isAllowed = true;
                break;
            case 'execute':
                if (thisPermission.execute) isAllowed = true;
                break;
            default:
        }
        return isAllowed;
    }
}

class DRP_VirtualDirectory extends DRP_Securable {
    #listFunc
    #getItemFunc
    constructor(listFunc, getItemFunc, permissionSet) {
        super(permissionSet);
        this.#listFunc = listFunc;
        this.#getItemFunc = getItemFunc;
    }

    /**
     * List contents of virtual directory
     * @param {DRP_MethodParams} params
     */
    async List(params) {
        if (!this.CheckPermission(params.__authInfo, "read")) {
            throw new DRP_CmdError("Unauthorized", DRP_ErrorCode.UNAUTHORIZED, "VirtualDirectory");
        }

        return await this.#listFunc(params);
    }
    /**
     * Get item of virtual directory
     * @param {DRP_MethodParams} params
     */
    async GetItem(params) {
        if (!this.CheckPermission(params.__authInfo, "read")) {
            throw new DRP_CmdError("Unauthorized", DRP_ErrorCode.UNAUTHORIZED, "VirtualDirectory");
        }

        return await this.#getItemFunc(params);
    }
}

class DRP_VirtualObject extends DRP_Securable {
    constructor(securedObject, permissionSet) {
        super(permissionSet);
        this.securedObject = securedObject;
    }
}

class DRP_VirtualFunction_Switch {
    constructor(switchName, dataType, description) {
        this.switchName = switchName;
        this.dataType = dataType;
        this.description = description;
    }
}

class DRP_VirtualFunction extends DRP_Securable {
    /**
     * Virtual Functions should translate to Swagger Routes
     * @param {string} name Function name
     * @param {string} description Description
     * @param {string} usage Usage describing how function is to be called
     * @param {Object.<string,DRP_VirtualFunction_Switch>} switches Optional switches
     * @param {Function} securedFunction Function to execute
     * @param {DRP_PermissionSet} permissionSet Permissions assigned to function
     */
    constructor(name, description, usage, switches, securedFunction, permissionSet) {
        super(permissionSet);

        this.name = name;
        this.description = description || '';
        this.usage = usage || '';
        this.switches = switches || {};
        this.function = securedFunction;
    }

    /**
     * Execute Virtual Function
     * @param {DRP_MethodParams} params
     */
    async Execute(params) {
        let results = null;

        // Check permissions
        if (!this.CheckPermission(params.__authInfo, "execute")) {
            throw new DRP_CmdError("Unauthorized", DRP_ErrorCode.UNAUTHORIZED, "VirtualFunction");
        }

        // If the user wants info on the function, return ShowHelp
        if (params.__verb === "man") {
            return this.ShowHelp();
        }

        // Verify that the user is making a call to execute
        if (params.__verb !== "exec" && params.__verb !== "SetItem") {
            throw new DRP_CmdError(`Invalid operation (${params.__verb})`, DRP_ErrorCode.BADREQUEST, "VirtualFunction");
        }

        // Parse parameters and pass to function
        results = await this.function(params);

        return results;
    }

    ShowHelp() {
        let output = `Usage: ${this.name} ${this.usage}\r\n`;
        output += `${this.description}\r\n\r\n`;
        output += "Optional arguments:\r\n";
        let switchesKeys = Object.keys(this.switches);
        if (switchesKeys.length > 0) {
            for (let i = 0; i < switchesKeys.length; i++) {
                output += `  -${switchesKeys[i]}\t${this.switches[switchesKeys[i]].description}\r\n`;
            }
        } else {
            output += "  (none)\r\n";
        }
        return output;
    }

    ParseSwitchesAndData(switchesAndData, skipVarEval) {
        let returnObj = {
            switches: {},
            data: ""
        }
        if (!switchesAndData) return returnObj;
        // Built regex
        /**
         * 1. Define empty array for switch regex patterns
         * 2. Iterate over switches, add switch regex to array
         * 3. Join with OR into string
         * 4. Add to template
         * 5. Evaluate
         **/

        /** List containing  */
        let switchDataRegExList = [];
        if (this.switches) {
            let switchList = Object.keys(this.switches);
            for (let i = 0; i < switchList.length; i++) {
                let thisSwitchDataRegEx;
                let thisParameter = this.switches[switchList[i]];
                if (thisParameter.dataType) {
                    thisSwitchDataRegEx = `(?: ?-(?:${thisParameter.switchName}) (?:(?:".*?")|(?:'.*?')|(?:[^-][^ ?]*)))`
                } else {
                    thisSwitchDataRegEx = `(?: ?-(?:${thisParameter.switchName}))`
                }
                switchDataRegExList.push(thisSwitchDataRegEx);
            }
        }
        let switchDataRegEx = new RegExp('^((?:' + switchDataRegExList.join('|') + ')*)?(?: ?([^-].*))?$');
        try {
            let switchRegEx = / ?-(\w)(?: ((?:".*?")|(?:'.*?')|(?:[^-][^ ?]*)))?/g;
            let switchDataMatch = switchesAndData.match(switchDataRegEx);
            if (switchDataMatch) {
                let switchHash = {};
                let switchMatch;
                while (switchMatch = switchRegEx.exec(switchDataMatch[1])) {
                    let varName = switchMatch[1];
                    let varValue = switchMatch[2] || null;
                    if (skipVarEval) {
                        switchHash[varName] = varValue;
                    } else {
                        switchHash[varName] = this.EvaluateStringForVariables(varValue);
                    }
                }
                returnObj.switches = switchHash;
                if (skipVarEval) {
                    returnObj.data = switchDataMatch[2] || "";
                } else {
                    returnObj.data = this.EvaluateStringForVariables(switchDataMatch[2]) || "";
                }
            }
        } catch (ex) {
            let ted = 1;
        }
        return returnObj;
    }

    // Function will be used as part of a service's Swagger doc.  The route will
    // be derived by a previous function which scans the service's structure and
    // looks for virtual functions.  Global ones will be in ClientCmds.
    TranslateToSwagger() {
    }
}

module.exports = {
    DRP_Permission: DRP_Permission,
    DRP_PermissionSet: DRP_PermissionSet,
    DRP_Securable: DRP_Securable,
    DRP_VirtualDirectory: DRP_VirtualDirectory,
    DRP_VirtualObject: DRP_VirtualObject,
    DRP_VirtualFunction: DRP_VirtualFunction,
    DRP_VirtualFunction_Switch: DRP_VirtualFunction_Switch
}