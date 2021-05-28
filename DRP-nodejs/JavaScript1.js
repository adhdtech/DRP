class drpMethodSwitch {
    constructor(switchName, dataType, description) {
        this.switchName = switchName;
        this.dataType = dataType;
        this.description = description;
    }
}

class drpMethod {
    /**
     * 
     * @param {string} name
     * @param {string} showHelp
     * @param {Object.<string,drpMethodSwitch>} switches
     * @param {Function} func
     */
    constructor(name, showHelp, switches, func) {
        this.name = name;
        this.showHelp = showHelp;
        this.switches = switches;
        this.func = func;
    }

    parseSwitchesAndData(switchesAndData) {
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
        let switchDataRegExList = [];
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
        let switchDataRegEx = new RegExp('^((?:' + switchDataRegExList.join('|') + ')*)?(?: ?([^-].*))?$');
        try {
            let switchRegEx = / ?-(\w)(?: ((?:".*?")|(?:'.*?')|(?:[^-][^ ?]*)))?/g;
            let switchDataMatch = switchesAndData.match(switchDataRegEx);
            if (switchDataMatch) {
                let switchHash = {};
                let switchMatch;
                while (switchMatch = switchRegEx.exec(switchDataMatch[1])) {
                    switchHash[switchMatch[1]] = switchMatch[2] || null;
                }
                returnObj.switches = switchHash;
                returnObj.data = switchDataMatch[2] || null;
            }
        } catch (ex) {
            let ted = 1;
        }
        return returnObj;
    }

    execute(vdmApp, term, switchesAndData) {
        // Parse params
        let switchesAndDataObj = this.parseSwitchesAndData(switchesAndData);

        // If the help switch was specified, display help and return
        this.func(switchesAndDataObj);
    }
}

let myMethod = new drpMethod(
    "watch",
    () => {
        console.log("Usage: watch [OPTIONS]... TOPICNAME");
        console.log("Watch streaming data from a topic on the mesh.\n");
        console.log("Optional arguments:");
        console.log("  -s\tscope [local(default)|zone|global]\n");
    },
    {
        "s": new drpMethodSwitch("s", "string", "Scope [local(default)|zone|global]")
    }, async (switchesAndDataObj) => {
        // Watch
        let jim = 1;
    }
);

myMethod.showHelp();
myMethod.execute(null, null, "-s \"global\" somestream");
let bob = 1;