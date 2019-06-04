class CortexServer {
    constructor(drpService, postHiveLoad) {
        var thisCortex = this;

        // Set DRP Broker client
        this.drpService = drpService;

        // Initialize Managed Object Types Hash
        this.ObjectTypes = {};

        // Instantiate Hive
        this.Hive = new Hive();

        // Start VDM Hive
        this.Hive.Start({
            Cortex: thisCortex
        }, function () {
            // After Hive finishes initializing....
            postHiveLoad();
            // Start add on modules
            //myModule.Start();
        });

        this.ClientCmds = {};
    }

    LogEvent(logMsg, source) {
        var dateTimeStamp = this.GetTimestamp();
        if (!source) {
            source = "CORTEX";
        }
        console.log(dateTimeStamp + " " + source + " - " + logMsg);
    }

    GetTimestamp() {
        var date = new Date();

        var hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;

        var min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;

        var sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;

        var year = date.getFullYear();

        var month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;

        var day = date.getDate();
        day = (day < 10 ? "0" : "") + day;

        return year + "" + month + "" + day + "" + hour + "" + min + "" + sec;
    }

    ListObjectTypes() {
        var thisCortex = this;
        let returnObj = {};
        let objectTypeList = Object.keys(thisCortex.ObjectTypes);
        for (let i = 0; i < objectTypeList.length; i++) {
            //returnObj[objectTypeList[i]] = thisCortex.ObjectTypes[objectTypeList[i]].Name;
            let objectType = objectTypeList[i];
            let objectManager = thisCortex.ObjectTypes[objectType];
            returnObj[objectTypeList[i]] = {
                "ManagedBy": objectManager.Name,
                "Count": Object.keys(objectManager.ManagedObjects[objectType]).length
            }
        }
        return returnObj;
    }

    ListObjectsOfType(objectType) {
        var thisCortex = this;
        let returnObj = {};
        let objectTypeMgr = thisCortex.ObjectTypes[objectType];
        if (objectTypeMgr && objectTypeMgr.ManagedObjects[objectType]) {
            let objectKeyList = Object.keys(objectTypeMgr.ManagedObjects[objectType]);

            for (let i = 0; i < objectKeyList.length; i++) {
                returnObj[objectKeyList[i]] = objectTypeMgr.ManagedObjects[objectType][objectKeyList[i]].ToPacket();

                // Only return the first 10
                if (i == 9) {
                    i = objectKeyList.length;
                }
            }
        }
        return returnObj;
    }

    GetObject(objectType, objectID) {
        var thisCortex = this;
        let returnObj = {};
        let objectTypeMgr = thisCortex.ObjectTypes[objectType];
        if (objectTypeMgr && objectTypeMgr.ManagedObjects[objectType] && objectTypeMgr.ManagedObjects[objectType][objectID]) {
            returnObj = objectTypeMgr.ManagedObjects[objectType][objectID].ToPacket();
        }
        return returnObj;
    }

    CLIGetPath(cmdData) {
        /*
         cmdData = {
            Filter: {attr: val},
            PathParts: [module, objtype, objid, ...]
         }
         */
        let thisCortex = this;
        let returnObj = [];
        let objectHash = {};
        let objectKeyList = [];
        let recordLimit = 250;

        let pathParts = cmdData.split("\\");

        if (pathParts && pathParts.length > 0 && pathParts[0].length > 0) {
            switch (pathParts[0]) {
                case "Cortex":
                    if (pathParts[1]) {
                        switch (pathParts[1]) {
                            case "ObjectTypes":
                                if (pathParts[2]) {
                                    // Get specific Object type
                                    objectHash = thisCortex.ObjectTypes[pathParts[2]];
                                    if (objectHash) {

                                        if (pathParts[3]) {
                                            // Get Object instance
                                            let targetObject = objectHash.ManagedObjects[pathParts[2]][pathParts[3]];
                                            if (targetObject) {
                                                if (pathParts[4]) {
                                                    // Get sub record
                                                    let subRecord = true // objectHash.ManagedObjects[pathParts[2]][pathParts[3]];
                                                    if (subRecord) {
                                                        returnObj.push({
                                                            "Name": pathParts[4],
                                                            "MyVal": 12345
                                                        });
                                                        let test = 1;
                                                    } else {
                                                        // Record does not exist
                                                    }
                                                } else {
                                                    returnObj.push(targetObject.ToPacket());
                                                    let test = 1;
                                                }
                                            } else {
                                                // Record does not exist
                                            }

                                        } else {
                                            // Get IndexRecords
                                            let indexRecordKeyList = Object.keys(objectHash.ManagedObjects[pathParts[2]]);
                                            for (let i = 0; i < indexRecordKeyList.length && i < recordLimit; i++) {
                                                let objectKey = indexRecordKeyList[i];
                                                //let objectInstance = objectHash[objectKey];
                                                returnObj.push({
                                                    "Name": objectKey
                                                });
                                            }
                                        }
                                    } else {
                                        // Record does not exist
                                    }
                                } else {
                                    let objectTypeList = Object.keys(thisCortex.ObjectTypes);
                                    for (let i = 0; i < objectTypeList.length && i < recordLimit; i++) {
                                        //returnObj[objectTypeList[i]] = thisCortex.ObjectTypes[objectTypeList[i]].Name;
                                        let objectType = objectTypeList[i];
                                        let objectManager = thisCortex.ObjectTypes[objectType];
                                        returnObj.push({
                                            "Name": objectType,
                                            "ManagedBy": objectManager.Name,
                                            "Count": Object.keys(objectManager.ManagedObjects[objectType]).length
                                        });
                                    }
                                }
                                break;
                            case "ObjectManagers":
                                returnObj = [];
                                break;
                            default:
                        }
                    } else {
                        // Return List of Cortex Objects
                        returnObj = [
                            { "Name": "ObjectTypes", "ChildObjects": 5 },
                            { "Name": "ObjectManagers", "ChildObjects": 5 }
                        ];
                    }
                    break;
                case "Hive":
                    if (pathParts[1]) {
                        switch (pathParts[1]) {
                            case "Data":
                                if (pathParts[2]) {
                                    // Get specific Data class
                                } else {
                                    objectHash = thisCortex.Hive.HiveData;
                                    objectKeyList = Object.keys(objectHash);
                                    for (let i = 0; i < objectKeyList.length && i < recordLimit; i++) {
                                        let objectKey = objectKeyList[i];
                                        let objectInstance = objectHash[objectKey];
                                        returnObj.push({
                                            "Name": objectKey,
                                            "CollectorCount": Object.keys(objectInstance).length
                                        });
                                    }
                                }
                                break;
                            case "Classes":
                                returnObj = Object.keys(thisCortex.Hive.HiveClasses);
                                if (pathPaths[2]) {
                                    // Get specific Class
                                } else {
                                    objectHash = thisCortex.Hive.HiveClasses;
                                    objectKeyList = Object.keys(objectHash);
                                    for (let i = 0; i < objectKeyList.length && i < recordLimit; i++) {
                                        let objectKey = objectKeyList[i];
                                        let objectInstance = objectHash[objectKey];
                                        returnObj.push({
                                            "Name": objectKey,
                                            "PrimaryKey": objectInstance.PrimaryKey
                                        });
                                    }
                                }
                                break;
                            case "Indexes":
                                if (pathParts[2]) {
                                    // Get specific Stereotype
                                    objectHash = thisCortex.Hive.HiveIndexes[pathParts[2]];
                                    if (objectHash) {
                                        // Get IndexRecords
                                        let indexRecordKeyList = Object.keys(objectHash.IndexRecords);
                                        for (let i = 0; i < indexRecordKeyList.length && i < recordLimit; i++) {
                                            let objectKey = indexRecordKeyList[i];
                                            //let objectInstance = objectHash[objectKey];
                                            returnObj.push({
                                                "Name": objectKey
                                            });
                                        }
                                    } else {
                                        // Record does not exist
                                    }
                                } else {
                                    objectHash = thisCortex.Hive.HiveIndexes;
                                    objectKeyList = Object.keys(objectHash);
                                    for (let i = 0; i < objectKeyList.length && i < recordLimit; i++) {
                                        let objectKey = objectKeyList[i];
                                        let objectInstance = objectHash[objectKey];
                                        returnObj.push({
                                            "Name": objectKey,
                                            "RecordCount": Object.keys(objectInstance.IndexRecords).length
                                        });
                                    }
                                }
                                break;
                            default:
                        }
                    } else {
                        // Return List of Hive Objects
                        returnObj = [
                            { "Name": "Data", "ChildObjects": 5 },
                            { "Name": "Classes", "ChildObjects": 5 },
                            { "Name": "Indexes", "ChildObjects": 5 }
                        ];
                    }
                    break;
                case "VDM":
                    if (pathParts[1]) {
                        switch (pathParts[1]) {
                        }
                    } else {
                        // Return List of VDM Objects
                    }
                    break;
                case "Collectors":
                    if (pathParts[1]) {
                        switch (pathParts[1]) {
                        }
                    } else {
                        // Return List of Collector Objects
                    }
                    break;
                case "Topics":
                    if (pathParts[1]) {
                        switch (pathParts[1]) {
                        }
                    } else {
                        // Return List of Topic Objects
                    }
                    break;
                default:
                // Unknown
            }
        } else {
            // Return list of rSage modules
            returnObj = [
                { "Name": "Cortex", "ChildObjects": 5 },
                { "Name": "Hive", "ChildObjects": 5 },
                { "Name": "VDM", "ChildObjects": 5 },
                { "Name": "Collectors", "ChildObjects": 5 },
                { "Name": "Topics", "ChildObjects": 5 }
            ];
        }

        return { "Records": returnObj };
    }
}

// Define parent Cortex Object class
class CortexObject {
    constructor(objectID, objectManager) {
        this.key = objectID;
        this.ObjectManager = objectManager;
        if (this.key) {
            this.RunHiveMapQueries();
        }
    }

    RunHiveMapQueries() {
        let objectMapAttributes = Object.keys(this.HiveObjectMaps);
        for (let i = 0; i < objectMapAttributes.length; i++) {
            let thisAttribute = objectMapAttributes[i];
            let mapQuery = new HiveMapQuery(this.ObjectManager.CortexServer.Hive, this.HiveObjectMaps[thisAttribute].query, this.HiveObjectMaps[thisAttribute].multiplicity);
            let mapQueryRunOutput = mapQuery.Run(this.KeyStereotype, this.key);

            this[thisAttribute] = mapQueryRunOutput;
        }
    }

    ToJSON() {
        return JSON.stringify(this.ToPacket());
    }

    ToPacket() {
        var returnData = {};

        if (this.BaseAttributes) {
            // Add attributes
            for (var i = 0; i < this.BaseAttributes.length; i++) {
                var thisAttribute = this.BaseAttributes[i];
                returnData[thisAttribute] = this[thisAttribute];
            }
        }

        if (this.HiveObjectMaps) {
            // Add Linked Objects
            let keys = Object.keys(this.HiveObjectMaps);
            for (var i = 0; i < keys.length; i++) {

                // key = variable name to store object list
                let key = keys[i];

                // Add object array
                returnData[key] = [];

                // Loop over array items
                for (var j = 0; j < this[key].length; j++) {
                    returnData[key].push(this[key][j].data);
                }
            }
        }

        // Return object
        return returnData;
    }

    GetKeyObjAttr(attrName) {
        let returnVal = null;
        if (this.HasKeyObj()) {
            let keyObj = this[this.KeyClassName][0];
            if (keyObj.data.hasOwnProperty(attrName)) {
                returnVal = keyObj.data[attrName];
            }
        } else {
            let i = 0;
        }
        return returnVal;
    }

    HasKeyObj() {
        return (this.KeyClassName && this[this.KeyClassName] && this[this.KeyClassName].length > 0);
    }
}

Object.defineProperties(CortexObject.prototype, {
    "KeyStereotype": { get: function () { return null } },
    "BaseAttributes": { get: function () { return [] } },
    "HiveObjectMaps": { get: function () { return {} } }
});

class CortexObjectQuery {

    // Define constructor
    constructor(matchType) {
        this.Conditions = [];
        this.MatchType = matchType;
        if (typeof (this.MatchType) === 'undefined') this.MatchType = 'ALL';
    }

    AddCondition(checkValue1, operator, checkValue2) {
        var conditionAdded = false;

        // See if we have an evaluator for the suppled operator
        if (this.ConditionEvaluators.hasOwnProperty(operator)) {
            let newCondition = new CortexObjectQuery_Condition(checkValue1, operator, checkValue2);
            this.Conditions.push(newCondition);
            conditionAdded = true;
        }
    }

    Evaluate(targetObject) {
        // Evaluate Conditions
        var returnVal = false;

        // The goal is to eval the condition values and autodetect literal vs object attribute values, but
        // for now we have to assume the left value is an object parameter and the right value is literal

        switch (this.MatchType) {
            case 'ANY':
                // On first match, return success
                returnVal = false;
                for (var i = 0; i < this.Conditions.length; i++) {
                    var thisCondition = this.Conditions[i];
                    var tmpLeftValue = this.GetValueFromObj(thisCondition.CheckValue1, targetObject);
                    var tmpRightValue = this.GetValueFromLiteral(thisCondition.CheckValue2);
                    if (this.ConditionEvaluators[thisCondition.Operator](tmpLeftValue, tmpRightValue)) {
                        returnVal = true;
                        break;
                    };
                }
                break;
            case 'ALL':
                // If match all, return success
                returnVal = false;
                for (var i = 0; i < this.Conditions.length; i++) {
                    var thisCondition = this.Conditions[i];
                    var tmpLeftValue = this.GetValueFromObj(thisCondition.CheckValue1, targetObject);
                    var tmpRightValue = this.GetValueFromLiteral(thisCondition.CheckValue2);

                    if (this.ConditionEvaluators[thisCondition.Operator](tmpLeftValue, tmpRightValue)) {
                        returnVal = true;
                    } else {
                        returnVal = false;
                        break;
                    }
                }
                break;
            case 'NONE':
                // If match none, return success
                returnVal = true;
                for (var i = 0; i < this.Conditions.length; i++) {
                    var thisCondition = this.Conditions[i];
                    var tmpLeftValue = this.GetValueFromObj(thisCondition.CheckValue1, targetObject);
                    var tmpRightValue = this.GetValueFromLiteral(thisCondition.CheckValue2);
                    if (this.ConditionEvaluators[thisCondition.Operator](tmpLeftValue, tmpRightValue)) {
                        returnVal = false;
                        break;
                    }
                }
                break;
            default:
                return false;
        }

        return returnVal;
    }

    GetValueFromObj(checkValue, targetObject) {
        var returnVal = null;
        if (checkValue != null && checkValue != "" && typeof targetObject[checkValue] != 'undefined') {
            returnVal = targetObject[checkValue];
        }
        return returnVal;
    }

    GetValueFromLiteral(checkValue) {
        var returnVal = null;
        if (typeof checkValue === 'string') {
            if (checkValue.toLowerCase() === 'null') {
                // Set to null
                returnVal = null;
            } else if (checkValue.toLowerCase() === 'true') {
                // Set to bool true
                returnVal = true;
            } else if (checkValue.toLowerCase() === 'false') {
                // Set to bool false
                returnVal = false;
            } else {
                if (checkValue.match(/^\"/)) {
                    // Remove any enclosing double quotes, return remaining string
                    returnVal = checkValue.replace(/^\"|\"$/g, '');
                } else {
                    if (!(isNaN(checkValue))) {
                        // Return number
                        returnVal = parseInt(checkValue);
                    } else {
                        // Return string
                        returnVal = checkValue;
                    }
                }
            }
        } else if (typeof checkValue === 'object') {
            returnVal = checkValue;
        }
        return returnVal;
    }
}

CortexObjectQuery.prototype.ConditionEvaluators = {
    '==': function (checkValue1, checkValue2) { return (checkValue1 != null && checkValue1.toLowerCase() == checkValue2.toLowerCase()) },
    '!=': function (checkValue1, checkValue2) { return (checkValue1 != checkValue2) },
    '<': function (checkValue1, checkValue2) { return (checkValue1 < checkValue2) },
    '>': function (checkValue1, checkValue2) { return (checkValue1 > checkValue2) },
    'in': function (checkValue1, checkValue2) { return (checkValue2.contains(checkValue1)) },
    'REGEX': function (checkValue1, checkValue2) {
        return (checkValue1 != null && checkValue1.match(checkValue2))
    }
};

class CortexObjectQuery_Condition {

    // Define constructor
    constructor(checkValue1, operator, checkValue2) {
        this.CheckValue1 = checkValue1;
        this.Operator = operator;
        this.CheckValue2 = checkValue2;
        return this;
    }
}

class HiveMapQuery {
    constructor(hive, queryString, multiplicity) {
        this.hive = hive;
        this.queryString = queryString;
        this.query = queryString.split('|');
        this.multiplicity = multiplicity;
        this.returnVal = null;
        this.returnArray = [];
    }

    Run(objectKeyType, objectKey) {

        this.returnVal = null;
        this.returnArray = [];
        this.rootIdxObj = this.GetIndexObj(objectKeyType, objectKey);
        this.candidates = [this.rootIdxObj];
        this.KeyStereotype = objectKeyType;
        this.KeyValue = objectKey;

        this.lastIndexType = objectKeyType;
        this.lastIndexKey = objectKey;

        // Loop over each query section
        for (var i = 0; i < this.query.length; i++) {
            //console.log("Check -> " + this.query[i]);
            this.Evaluate(this.query[i]);
            if (objectKey == "10707972") {
                var bob = 1;
            }
        }

        return this.candidates;
    }

    Evaluate(queryPart) {
        var returnCandidates = [];
        var results = /^(MK|FK|IDX)\(([^\)]*)?\)$/.exec(queryPart);
        if (!results) {
            // Query not formatted properly
            return returnCandidates;
        }
        let evalCmd = results[1];   // MK, FK or IDX
        let qualifiers = this.ParseQualifiers(results[2]);   // class or linkedby
        //console.log("  Parsing check -> " + evalCmd + ":" + results[2]);
        switch (evalCmd) {
            case 'MK':
                returnCandidates = this.Evaluate_KEY('MK', qualifiers);
                break;
            case 'FK':
                returnCandidates = this.Evaluate_KEY('FK', qualifiers);
                break;
            case 'IDX':
                returnCandidates = this.Evaluate_IDX(qualifiers);
                break;
            default:
        }

        this.candidates = returnCandidates;
    }

    Evaluate_KEY(keyType, qualifiers) {
        var qualifiedList = [];
        var checkObjectList = [];
        // Loop over candidates
        for (let i = 0; i < this.candidates.length; i++) {
            let candidate = this.candidates[i];

            let compareIndex = candidate;

            // Get the keytype; is it an array?
            if (candidate[keyType].constructor === Array) {
                // It's an array; copy to out check list
                checkObjectList = candidate[keyType];
            } else {
                // Either single object or null
                if (candidate[keyType]) {
                    checkObjectList.push(candidate[keyType]);
                }
            }

            // Loop over object instances
            for (let j = 0; j < checkObjectList.length; j++) {
                let checkObject = checkObjectList[j];
                let qualified = true;
                for (let k = 0; k < qualifiers.length; k++) {
                    let qualifier = qualifiers[k];
                    qualified = this.EvaluateQualifier(checkObject, qualifier, compareIndex);
                    if (!qualified) {
                        break;
                    }
                }
                if (qualified) {
                    qualifiedList.push(checkObject);
                }
            }
        }
        return qualifiedList;
    }

    Evaluate_IDX(qualifiers) {
        var qualifiedList = [];
        var checkObjectList = this.candidates;

        // Loop over object instances
        for (let j = 0; j < checkObjectList.length; j++) {
            let checkObject = checkObjectList[j];
            let qualified = true;
            let linkedbyAttr = null;
            for (let k = 0; k < qualifiers.length; k++) {
                let qualifier = qualifiers[k];
                qualified = this.EvaluateQualifier(checkObject, qualifier, null);
                if (qualifier.type == "linkedby") {
                    linkedbyAttr = qualifier.value;
                }
                if (!qualified) {
                    break;
                }
            }
            if (qualified) {
                // If qualified, push the target index object instead of the candidate
                var classDef = this.hive.HiveClasses[checkObject.data['_objClass']];
                var attrDef = classDef.Attributes[linkedbyAttr];
                var sTypeName = attrDef['Stereotype'];
                qualifiedList.push(this.hive.HiveIndexes[sTypeName].IndexRecords[checkObject.data[linkedbyAttr]]);
            }
        }
        return qualifiedList;
    }


    EvaluateQualifier(candidate, qualifier, compareIndex) {
        var returnVal = false;
        var objType = "";
        if (candidate.data) {
            var objType = "dataObj [" + candidate.data['_objClass'] + "]";
        } else {
            objType = "indexObj [" + candidate.sType + "]";
        }
        //console.log("    Evaluating for " + qualifier.type + ":" + qualifier.value + " against " + objType);
        switch (qualifier.type) {
            case 'class':
                if (!candidate.data) {
                    var bob = 1;
                }
                if (candidate.data['_objClass'] == qualifier.value) {
                    returnVal = true;
                }
                break;
            case 'linkedby':

                // Are we evaluating an index of data object?
                if (candidate.hasOwnProperty('data')) {
                    // The candidate is a data object; see if it backlinks to the compareIndex by the given attribute

                    // back to the index via this value
                    // ( FROM IDX )
                    // 1. Get the field stereotype and value
                    var classDef = this.hive.HiveClasses[candidate.data['_objClass']];
                    if (!classDef) {
                        return false;
                    }
                    var attrDef = classDef.Attributes[qualifier.value];
                    if (!attrDef) {
                        return false;
                    }
                    var sTypeName = attrDef['Stereotype'];
                    if (!sTypeName) {
                        return false;
                    }
                    if (!this.hive.HiveIndexes[sTypeName]) {
                        return false;
                    }
                    if (!candidate.data[qualifier.value]) {
                        return false;
                    }
                    if (compareIndex) {
                        if (candidate.data[qualifier.value].constructor === Array) {
                            for (let i = 0; i < candidate.data[qualifier.value].length; i++) {
                                if (candidate.data[qualifier.value][i].toLowerCase() === compareIndex.key) {
                                    return true;
                                }
                            }
                            return false;
                        } else {
                            if (candidate.data[qualifier.value].toLowerCase() === compareIndex.key) {
                                return true;
                            } else {
                                return false;
                            }
                        }
                    }
                    // We verified that the class exists, field is stereotyped with a valid MK/FK type and data is present
                    if (qualifier.value == "MemberIp") {
                        let myvar = 1;
                    }
                    return true;

                } else {
                    // This is starting from an index object; candidate is a data object.  We need to see if the candidate attribute
                    // has a stereotype and is not null or empty
                    // ( FROM MK/FK )
                    // 1. Get the field stereotype and value
                    if (candidate.data[qualifier.value] && candidate.data[qualifier.value].toLowerCase() === compareIndex.key) {
                        return true;
                    } else {
                        return false;
                    }

                    var classDef = this.hive.HiveClasses[candidate.data['_objClass']];
                    if (!classDef) {
                        return false;
                    }
                    var attrDef = classDef.Attributes[qualifier.value];
                    if (!attrDef) {
                        return false;
                    }
                    var sTypeName = attrDef['Stereotype'];
                    if (!sTypeName) {
                        return false;
                    }
                    if (!this.hive.HiveIndexes[sTypeName]) {
                        return false;
                    }
                    if (!candidate.data[qualifier.value]) {
                        return false;
                    }
                }

                break;
            default:
                var bob = 1;
        }
        return returnVal;
    }

    ParseQualifiers(qualifierText) {
        // Like JSON, the qualifiers should be "field:val" and comma separated
        let parsedQualifierList = [];
        if (qualifierText) {
            let rawQualifierList = qualifierText.split(',');
            for (var i = 0; i < rawQualifierList.length; i++) {
                let qualifierTypeValue = rawQualifierList[i].split(':');
                parsedQualifierList.push({ type: qualifierTypeValue[0], value: qualifierTypeValue[1] });
            }
        }
        return parsedQualifierList;
    }

    GetIndexObj(objectKeyType, objectKey) {
        let returnObj = null;
        if (this.hive.HiveIndexes[objectKeyType].IndexRecords[objectKey]) {
            returnObj = this.hive.HiveIndexes[objectKeyType].IndexRecords[objectKey];
        }
        return returnObj;
    }
}

class CortexObjectManager {
    constructor(CortexServer, ObjectManagerName) {
        var thisObjMgr = this;

        // Set CortexServer
        thisObjMgr.CortexServer = CortexServer;
        thisObjMgr.subscribeTo = [];
        thisObjMgr.ManagedObjects = {};
        thisObjMgr.InitializeManagedObjects();
        thisObjMgr.Name = ObjectManagerName;
        //thisObjMgr.ManagedObjectTypes = [];
        //thisObjMgr.SanityChecks = {};
        //thisObjMgr.OnObjectUpdate = {};
    }

    // Stub Start function
    Start() { }

    // Stub ReceiveMonitorPacket
    ReceiveMonitorPacket(packetObj) {
        // N/A
    }

    SendJSONCmd(conn, cmd, data) {
        conn.send(JSON.stringify({
            'cmd': cmd,
            'data': data
        }));
    }

    InitializeManagedObjects() {
        var thisObjMgr = this;
        for (var i = 0; i < thisObjMgr.ManagedObjectTypes.length; i++) {

            // Get ObjectType
            let objectType = thisObjMgr.ManagedObjectTypes[i];

            // Initialize ManagedObject set
            thisObjMgr.ManagedObjects[objectType] = {};

            // Register Object Type Association
            thisObjMgr.CortexServer.ObjectTypes[objectType] = thisObjMgr;
        };
    }

    PopulateObjects(objectType, objectClass) {
        var thisObjMgr = this;
        var referenceObj = new objectClass();
        var keyStereotype = referenceObj.KeyStereotype;
        let keyList = thisObjMgr.CortexServer.Hive.GetIndexKeys(keyStereotype);
        for (var i = 0, l = keyList.length; i < l; i++) {

            // Get Key
            let key = keyList[i];

            // Create new object
            let newObject = new objectClass(key, thisObjMgr);
            if (newObject.key) {
                thisObjMgr.ManagedObjects[objectType][key] = newObject;
            }
        };
        console.log("Populating Objects - " + objectType + " [" + keyList.length + "]");
    }
}

Object.defineProperties(CortexObjectManager.prototype, {
    "ManagedObjectTypes": { get: function () { return []; } },
    "SanityChecks": { get: function () { return []; } }
});

// Hive code
function hiveClass(umlClassObj) {
    this.Name = "";
    this.Stereotype = "";
    this.Attributes = {};
    this.Functions = {};
    this.PrimaryKey = "";

    this.Name = umlClassObj.Name;
    if (umlClassObj.Stereotypes[0]) {
        this.Stereotype = umlClassObj.Stereotypes[0];
    }

    this.colsRef = {
        "ObjectType": 0
    };

    this.colsArr = ["ObjectType"];

    for (var i = 0; i < umlClassObj.Attributes.length; i++) {
        thisAttr = umlClassObj.Attributes[i];
        this.Attributes[thisAttr.Name] = new hiveClass_Attribute(thisAttr, i + 1, umlClassObj);
        this.colsRef[thisAttr.Name] = this.Attributes[thisAttr.Name].colRef;
        this.colsArr.push(thisAttr.Name);
    }

    this.Functions = umlClassObj.Functions;
	/*
	for (var i = 0; i < umlClassObj.Functions.length; i++) {
	thisFunc = umlClassObj.Functions[i];
	this.Functions[thisFunc.Name] = new hiveClass_Function(thisFunc);
	}
	 */
};

function hiveClass_Attribute(umlAttr, colref, parentClass) {
    this.Name = umlAttr.Name || "";
    this.Stereotype = umlAttr.Stereotype || "";
    this.Visibility = umlAttr.Visibility || "";
    this.Derived = umlAttr.Derived || "";
    this.Type = umlAttr.Type || "";
    this.Default = umlAttr.Default || "";
    this.Multiplicity = umlAttr.Multiplicity || "";
    this.Restrictions = umlAttr.Restrictions || "";
    this.colRef = colref || 0;
    this.parentClass = parentClass || null;
}

function hiveClass_Function(umlFunc) {
    this.Name = umlFunc.Name || "";
    this.Visibility = umlFunc.Visibility || "";
    this.Parameters = umlFunc.Parameters || "";
    this.Return = umlFunc.Return || "";
}

class HiveClassLoader {

    constructor() {
        this.HiveClasses = {};
    }

    LoadClasses(umlClasses) {
        // Translate UMLClasses objects

        /*
        var classKeys = Object.keys(umlClasses);
        for (var i = 0; i < classKeys.length; i++) {
            var umlClass = umlClasses[classKeys[i]];
            var thisHiveClass = new hiveClass(umlClass);
            this.HiveClasses[thisHiveClass.Stereotype] = thisHiveClass;
        }
        */

        this.HiveClasses = umlClasses;

        // Set PK's
        /*
        var classKeys = Object.keys(this.HiveClasses);
        for (var i = 0; i < classKeys.length; i++) {
            var thisClass = this.HiveClasses[classKeys[i]];
            var attributeKeys = Object.keys(thisClass.Attributes);
            for (var j = 0; j < attributeKeys.length; j++) {
                var thisAttribute = thisClass.Attributes[attributeKeys[j]];
                var keyArr = thisAttribute.Restrictions.split(",");
                // Loop over keys of attribute
                for (var k = 0; k < keyArr.length; k++) {
                    switch (keyArr[k]) {
                        case 'MK':
                            break;
                        case 'FK':
                            break;
                        case 'PK':
                            this.HiveClasses[classKeys[i]].PrimaryKey = thisAttribute.Name;
                            break;
                        default:
                            break;
                    }
                }
            }
        }
        */
    }

    GenerateIndexes() {
        // Get Index structure
        var HiveIndexes = {};
        var classKeys = Object.keys(this.HiveClasses);
        for (var i = 0; i < classKeys.length; i++) {
            var thisClass = this.HiveClasses[classKeys[i]];
            var attributeKeys = Object.keys(thisClass.Attributes);
            for (var j = 0; j < attributeKeys.length; j++) {
                var thisAttribute = thisClass.Attributes[attributeKeys[j]];
                var keyArr = thisAttribute.Restrictions.split(",");
                // Loop over keys of attribute
                for (var k = 0; k < keyArr.length; k++) {
                    switch (keyArr[k]) {
                        case 'MK':
                            this.CheckIdxEntry(HiveIndexes, thisAttribute.Stereotype);
                            HiveIndexes[thisAttribute.Stereotype].MKAttributes.push(thisAttribute);
                            break;
                        case 'FK':
                            this.CheckIdxEntry(HiveIndexes, thisAttribute.Stereotype);
                            HiveIndexes[thisAttribute.Stereotype].FKAttributes.push(thisAttribute);
                            break;
                        case 'PK':
                            break;
                        default:
                            break;
                    }
                }
            }
        }
        return HiveIndexes;
    }

    CheckIdxEntry(thisIdx, key) {
        if (typeof thisIdx[key] === "undefined") {
            thisIdx[key] = {
                MKAttributes: [],
                FKAttributes: [],
                IndexRecords: {}
            };
        }
    }
}

class Hive {
    constructor() {
        var thisHive = this;
        this.cfgOpts = {};
        this.HiveClasses = {};
        this.HiveData = {};
        this.HiveIndexes = {};

        this.wsConn = [];

        this.collectorProfiles = {};
        this.CollectorClients = {};
        this.UnityClients = {};
        this.CollectorInstances = {};
        this.collectorsProcessed = 0;
        this.IsReady = false;
        this.HiveClassLoader = null;

        this.ClientCmds = {
            // Old Hive client commands
            listStereoTypes: function (params) {
                //var thisHive = this;
                return Object.keys(thisHive.HiveIndexes);
                //console.log("Sent stereotype list");
            },
            listStereoTypeKeys: function (params) {
                //var thisHive = this;
                return Object.keys(thisHive.HiveIndexes[params['StereoType']].IndexRecords);
                //console.log("Sent keys for stereotype '" + appData['StereoType'] + "'");
            },
            getStereoTypeAssocObj: function (params) {
                //var thisHive = this;
                let returnObj = {};
                var checkKey = params['Key'];
                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }
                //console.log("Getting stereotype " + params['StereoType'] + "[" + checkKey + "]");
                if (typeof thisHive.HiveIndexes[params['StereoType']] === "undefined" || typeof thisHive.HiveIndexes[params['StereoType']].IndexRecords[checkKey] === "undefined") {
                    //console.log("    ...no index for item");
                } else {
                    // console.log("    ...found index");
                    var assocRoot = thisHive.HiveIndexes[params['StereoType']].IndexRecords[checkKey];
                    returnObj = {
                        MK: "",
                        FK: []
                    };
                    if (assocRoot.MK !== '') {
                        returnObj.MK = assocRoot.MK.data;
                    }
                    Object.keys(assocRoot.FK).forEach(function (fkKey) {
                        returnObj.FK.push(assocRoot.FK[fkKey].data);
                    });

                    returnObj['Key'] = params['Key'];
                    returnObj['StereoType'] = params['StereoType'];
                    return returnObj;
                }
            },
            getParentAssocObj: function (params) {
                //var thisHive = this;
                let returnObj = {};
                var checkKey = params['Key'];
                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }
                //console.log("Getting parents of " + appData['StereoType'] + "[" + checkKey + "]");
                if (typeof thisHive.HiveIndexes[params['StereoType']] === "undefined" || typeof thisHive.HiveIndexes[params['StereoType']].IndexRecords[checkKey] === "undefined") {
                    //console.log("    ...no index for item");
                } else {
                    //console.log("    ...found index");
                    var assocRoot = thisHive.HiveIndexes[params['StereoType']].IndexRecords[checkKey];
                    returnObj = {
                        UK: []
                    };
                    if (assocRoot.MK !== '' && assocRoot.MK.FK) {
                        Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                            var assocParentRoot = assocRoot.MK.FK[fkKey];
                            if (assocParentRoot.MK !== '') {
                                returnObj.UK.push(assocParentRoot.MK.data);
                            }
                        });
                    }

                    returnObj['Key'] = appData['Key'];
                    returnObj['StereoType'] = appData['StereoType'];
                    return returnObj;
                }
            },
            getUKMKFKObj: function (params) {
                //var thisHive = this;
                var returnObj = {
                    params: params,
                    records: {},
                    err: null
                };
                let checkKey = null;
                let stereoType = null;

                if (params['Key'] && params['StereoType']) {
                    checkKey = params['Key'];
                    stereoType = params['StereoType'];
                }

                if (params['pathList'] && params['pathList'].length > 1) {
                    stereoType = params['pathList'][0];
                    checkKey = params['pathList'][1];
                }

                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }

                //console.log("Getting UKMKFK " + appData['StereoType'] + "[" + checkKey + "]");

                if (!checkKey || !stereoType || typeof thisHive.HiveIndexes[stereoType] === "undefined" || typeof thisHive.HiveIndexes[stereoType].IndexRecords[checkKey] === "undefined") {
                    //console.log("    ...no index for item");
                    returnObj["err"] = `No index for (${stereoType})[${checkKey}]`;
                } else {
                    //console.log("    ...found index");
                    var assocRoot = thisHive.HiveIndexes[stereoType].IndexRecords[checkKey];
                    returnObj.records = {
                        UK: [],
                        MK: "",
                        FK: []
                    };
                    if (assocRoot.MK !== '') {
                        returnObj.records.MK = assocRoot.MK.data;
                        if (assocRoot.MK.FK) {
                            Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                                var assocParentRoot = assocRoot.MK.FK[fkKey];
                                if (assocParentRoot.MK !== '') {
                                    returnObj.records.UK.push(assocParentRoot.MK.data);
                                }
                            });
                        }
                    }
                    Object.keys(assocRoot.FK).forEach(function (fkKey) {
                        returnObj.records.FK.push(assocRoot.FK[fkKey].data);
                    });

                    returnObj.records['Key'] = checkKey;
                    returnObj.records['StereoType'] = stereoType;
                }
                return returnObj;
            },
            getUKMKFKGCObj: function (params) {
                //var thisHive = this;
                var returnObj = {
                    params: params,
                    records: {},
                    err: null
                };

                let checkKey = null;
                let stereoType = null;

                if (params['Key'] && params['StereoType']) {
                    checkKey = params['Key'];
                    stereoType = params['StereoType'];
                }

                if (params['pathList'] && params['pathList'].length > 1) {
                    stereoType = params['pathList'][0];
                    checkKey = params['pathList'][1];
                }

                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }
                //console.log("Getting UKMKFKGC " + appData['StereoType'] + "[" + checkKey + "]");
                if (!checkKey || !stereoType || typeof thisHive.HiveIndexes[stereoType] === "undefined" || typeof thisHive.HiveIndexes[stereoType].IndexRecords[checkKey] === "undefined") {
                    //console.log("    ...no index for item");
                    returnObj["err"] = `No index for (${stereoType})[${checkKey}]`;
                } else {
                    //console.log("    ...found index");
                    var assocRoot = thisHive.HiveIndexes[stereoType].IndexRecords[checkKey];
                    returnObj.records = {
                        UK: [],
                        MK: "",
                        FK: [],
                        GC: []
                    };
                    if (assocRoot.MK !== '') {
                        returnObj.records.MK = assocRoot.MK.data;
                        if (assocRoot.MK.FK) {
                            Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                                var assocParentRoot = assocRoot.MK.FK[fkKey];
                                if (assocParentRoot.MK !== '') {
                                    returnObj.records.UK.push(assocParentRoot.MK.data);
                                }
                            });
                        }
                    }
                    Object.keys(assocRoot.FK).forEach(function (fkKey) {
                        returnObj.records.FK.push(assocRoot.FK[fkKey].data);
                        if (assocRoot.FK[fkKey].MK) {
                            Object.keys(assocRoot.FK[fkKey].MK).forEach(function (mkKey) {
                                var assocChildRoot = assocRoot.FK[fkKey].MK[mkKey];
                                Object.keys(assocChildRoot.FK).forEach(function (gcKey) {
                                    returnObj.records.GC.push(assocChildRoot.FK[gcKey].data);
                                });
                            });
                        }
                    });

                    returnObj.records['Key'] = checkKey;
                    returnObj.records['StereoType'] = stereoType;
                }
                return returnObj;
            },
            searchStereotypeKeys: function (params) {
                //var thisHive = this;
                var returnObj = {
                    StereoType: params["StereoType"],
                    Key: params['Key'],
                    records: []
                };

                var checkKey = params['Key'];
                var sTypeKey = params['Stereotype'];
                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }

                var checkIndexList = [];
                if (sTypeKey && thisHive.HiveIndexes[sTypeKey]) {
                    checkIndexList.push(sTypeKey);
                } else {
                    Object.keys(thisHive.HiveIndexes).forEach(function (idxKey) {
                        checkIndexList.push(idxKey);
                    });
                }

                for (var i = 0; i < checkIndexList.length; i++) {
                    var checkIdxKey = checkIndexList[i];
                    if (thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey]) {
                        var assocRoot = thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey];
                        var matchObj = {
                            UK: [],
                            MK: "",
                            FK: [],
                            GC: []
                        };
                        if (assocRoot.MK !== '') {
                            matchObj.MK = assocRoot.MK.data;
                            if (assocRoot.MK.FK) {
                                Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                                    var assocParentRoot = assocRoot.MK.FK[fkKey];
                                    if (assocParentRoot.MK !== '') {
                                        matchObj.UK.push(assocParentRoot.MK.data);
                                    }
                                });
                            }
                        }
                        Object.keys(assocRoot.FK).forEach(function (fkKey) {
                            matchObj.FK.push(assocRoot.FK[fkKey].data);
                            if (assocRoot.FK[fkKey].MK) {
                                Object.keys(assocRoot.FK[fkKey].MK).forEach(function (mkKey) {
                                    var assocChildRoot = assocRoot.FK[fkKey].MK[mkKey];
                                    Object.keys(assocChildRoot.FK).forEach(function (gcKey) {
                                        matchObj.GC.push(assocChildRoot.FK[gcKey].data);
                                    });
                                });
                            }
                        });

                        matchObj['Key'] = params['Key'];
                        matchObj['StereoType'] = sTypeKey;

                        returnObj.records.push(matchObj);
                    }
                }

                return returnObj;
            },
            searchStereotypeKeysNested: function (params) {
                //var thisHive = this;
                var returnObj = {
                    StereoType: params["StereoType"],
                    Key: params['Key'],
                    records: []
                };

                var checkKey = params['Key'];
                var sTypeKey = params['Stereotype'];
                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }

                var checkIndexList = [];
                if (sTypeKey && thisHive.HiveIndexes[sTypeKey]) {
                    checkIndexList.push(sTypeKey);
                } else {
                    Object.keys(thisHive.HiveIndexes).forEach(function (idxKey) {
                        checkIndexList.push(idxKey);
                    });
                }

                for (var i = 0; i < checkIndexList.length; i++) {
                    var checkIdxKey = checkIndexList[i];
                    if (thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey]) {
                        var assocRoot = thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey];
                        var rootObj = {
                            'classType': null,
                            'data': null,
                            'children': [],
                            'parents': []
                        };
                        if (assocRoot.MK !== '') {
                            rootObj.classType = assocRoot.MK.classType;
                            rootObj.data = assocRoot.MK.data;
                            if (assocRoot.MK.FK) {
                                Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                                    var assocParentRoot = assocRoot.MK.FK[fkKey];
                                    if (assocParentRoot.MK !== '') {
                                        var ukObj = {
                                            'classType': assocParentRoot.MK.classType,
                                            'data': assocParentRoot.MK.data,
                                            'children': [],
                                            'parents': []
                                        };
                                        rootObj.parents.push(ukObj);
                                    }
                                });
                            }
                        }
                        Object.keys(assocRoot.FK).forEach(function (fkKey) {
                            var fkObj = {
                                'classType': assocRoot.FK[fkKey].classType,
                                'data': assocRoot.FK[fkKey].data,
                                'children': []
                            };
                            if (assocRoot.FK[fkKey].MK) {
                                Object.keys(assocRoot.FK[fkKey].MK).forEach(function (mkKey) {
                                    var assocChildRoot = assocRoot.FK[fkKey].MK[mkKey];
                                    Object.keys(assocChildRoot.FK).forEach(function (gcKey) {
                                        var valFound = 0;
                                        for (var i = 0; i < fkObj.children.length; i++) {
                                            var tmpObj = fkObj.children[i];
                                            if (tmpObj.data == assocChildRoot.FK[gcKey].data) {
                                                valFound = 1;
                                            }
                                        }
                                        if (!valFound) {
                                            var gcObj = {
                                                'classType': assocChildRoot.FK[gcKey].classType,
                                                'data': assocChildRoot.FK[gcKey].data,
                                                'children': [],
                                                'parents': []
                                            };
                                            fkObj.children.push(gcObj);
                                        }
                                    });
                                });
                            }
                            rootObj.children.push(fkObj);
                        });

                        rootObj['Key'] = params['Key'];
                        rootObj['StereoType'] = sTypeKey;

                        returnObj.records.push(rootObj);
                    }
                }
                return returnObj;
            },
            searchStereotypeKeysChildren: function (params) {
                //var thisHive = this;
                var returnObj = {
                    StereoType: params["StereoType"],
                    Key: params['Key'],
                    records: []
                };

                var checkKey = params['Key'];
                var sTypeKey = params['Stereotype'];
                if (typeof checkKey === "string") {
                    var tmpString = checkKey.toLowerCase();
                    checkKey = tmpString;
                }

                var checkIndexList = [];
                if (sTypeKey && thisHive.HiveIndexes[sTypeKey]) {
                    checkIndexList.push(sTypeKey);
                } else {
                    Object.keys(thisHive.HiveIndexes).forEach(function (idxKey) {
                        checkIndexList.push(idxKey);
                    });
                }

                for (var i = 0; i < checkIndexList.length; i++) {
                    var checkIdxKey = checkIndexList[i];
                    if (thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey]) {
                        var assocRoot = thisHive.HiveIndexes[checkIdxKey].IndexRecords[checkKey];
                        var rootObj = {
                            'classType': null,
                            'data': null,
                            'children': [],
                            'parents': []
                        };
                        if (assocRoot.MK !== '') {
                            rootObj['classType'] = assocRoot.MK.classType;
                            rootObj['data'] = assocRoot.MK.data;
                            if (assocRoot.MK.FK) {
                                Object.keys(assocRoot.MK.FK).forEach(function (fkKey) {
                                    var assocParentRoot = assocRoot.MK.FK[fkKey];
                                    if (assocParentRoot.MK !== '') {
                                        var ukObj = {
                                            'classType': assocParentRoot.MK.classType,
                                            'data': assocParentRoot.MK.data,
                                            'children': [],
                                            'parents': []
                                        };
                                        rootObj.parents.push(ukObj);
                                    }
                                });
                            }
                        }
                        Object.keys(assocRoot.FK).forEach(function (fkKey) {
                            var fkObj = {
                                'classType': assocRoot.FK[fkKey].classType,
                                'data': assocRoot.FK[fkKey].data,
                                'children': []
                            };
							/*
							if (assocRoot.FK[fkKey].MK) {
							Object.keys(assocRoot.FK[fkKey].MK).forEach(function (mkKey) {
							var assocChildRoot = assocRoot.FK[fkKey].MK[mkKey];
							Object.keys(assocChildRoot.FK).forEach(function (gcKey) {
							var gcObj = { 'data': assocChildRoot.FK[gcKey].data, 'children': [], 'parents': [] };
							fkObj.children.push(gcObj);
							});
							});
							}
							 */
                            rootObj.children.push(fkObj);
                        });

                        rootObj['Key'] = params['Key'];
                        rootObj['StereoType'] = sTypeKey;

                        returnObj.records.push(rootObj);
                    }
                }
                return returnObj;
            },
            listClassDataTypes: function (params) {
                //var thisHive = this;
                var returnObj = {};
                Object.keys(thisHive.HiveData).forEach(function (dataClass) {
                    returnObj[dataClass] = {
                        //colsRef: thisHive.HiveClasses[dataClass].colsRef,
                        //colsArr: thisHive.HiveClasses[dataClass].colsArr,
                        recCount: 0
                    };
                    Object.keys(thisHive.HiveData[dataClass]).forEach(function (collectorName) {
                        returnObj[dataClass].recCount = returnObj[dataClass].recCount + Object.keys(thisHive.HiveData[dataClass][collectorName].records).length;
                    });
                });
                return returnObj;
            },
            listClassDataKeys: function (params) {
                //var thisHive = this;
                var returnObj = {
                    ClassType: params['ClassType'],
                    records: []
                };
                if (thisHive.HiveData[params['ClassType']]) {
                    returnObj.records = Object.keys(thisHive.HiveData[params['ClassType']]);
                }
                
                //console.log("Sent keys for class '" + appData['ClassType'] + "'");
                return returnObj;
            },
            listClassDataObj: function (params) {
                //var thisHive = this;
                var returnObj = {
                    ClassType: params['ClassType'],
                    records: {}
                };
                if (typeof thisHive.HiveData[params['ClassType']] === "undefined") {
                    //console.log("No data list for class '" + appData['ClassType'] + "'");
                } else {
                    Object.keys(thisHive.HiveData[params['ClassType']]).forEach(function (collectorKey) {
                        Object.keys(thisHive.HiveData[params['ClassType']][collectorKey].records).forEach(function (recordKey) {
                            returnObj.records[recordKey] = thisHive.HiveData[params['ClassType']][collectorKey].records[recordKey].data;
                        });
                    });
                }

                return returnObj;
            },
            getClassDataObj: function (params) {
                //var thisHive = this;
                var returnObj = {
                    StereoType: params["ClassType"],
                    Key: params['Key'],
                    records: []
                };
                // Is this a valid ClassType?
                if (thisHive.HiveData[params['ClassType']]) {
                    // Loop over instances
                    Object.keys(thisHive.HiveData[params['ClassType']]).forEach(function (collectorKey) {
                        // Does this record exist?
                        if (thisHive.HiveData[params['ClassType']][collectorKey].records[params['Key']]) {
                            returnObj.records.push(thisHive.HiveData[params['ClassType']][collectorKey].records[params['Key']].data);
                        }
                    });
                }
                return returnObj;
            },
            getClassDataInstObj: function (params) {
                //var thisHive = this;
                var returnObj = {
                    objName: params['ClassType'],
                    instance: params['ClassInst'],
                    records: {}
                };
                returnObj.records = thisHive.HiveData[params['ClassType']][params['ClassInst']].records[params['Key']];
                return returnObj;
            },
            getClassDefinitions: function (params) {
                //var thisHive = this;
                return thisHive.HiveClasses;
            },
            runHiveQuery: function (params) {
                //var thisHive = this;
                var returnObj = {
                    query: params["query"],
                    records: []
                };
                //var icrQuery = new thisSvr.ICRQuery("LIST STEREOTYPE['ipAddress'] WHERE FK['SW.Nodes']['DeviceName'] = 'MEM0BIZDC04'");
                var icrQuery = new ICRQuery(params.query, thisHive);
                icrQuery.Run();
                if (icrQuery.errorStatus) {
                    //console.log("ICRQuery Error: [" + icrQuery.errorStatus + "]");
                    thisHive.vdmServer.LogHiveEvent("ICRQuery Error: [" + icrQuery.errorStatus + "] --> " + params.query);
                } else {
                    returnObj.icrQuery = icrQuery.returnObj.icrQuery;
                    returnObj.records = icrQuery.returnObj.results;
                }
                return returnObj;
            }
        }
    }

    async Start(cfgOpts, callback) {
        var thisHive = this;
        this.cfgOpts = cfgOpts;
        this.Cortex = cfgOpts.Cortex;

        this.RunAfterHiveLoad = callback;

        this.IsReady = false;
        this.HiveClasses = {};
        this.HiveData = {};
        this.HiveIndexes = {};
        //this.collectorProfiles = {};
        this.collectorsProcessed = 0;
        this.classLoader = new HiveClassLoader();

        // Wait until DRPService is connected... (static 5 seconds for now)
        await new Promise(resolve => {
            setTimeout(resolve, 5000)
        })

        let classDefs = await this.Cortex.drpService.GetClassDefinitions();
        //let response = await registryClient.SendCmd(registryClient.wsConn, "getClassDefinitions", null, true, null);

        this.classLoader.LoadClasses(classDefs);

        thisHive.HiveClasses = thisHive.classLoader.HiveClasses;
        thisHive.HiveIndexes = thisHive.classLoader.GenerateIndexes();
        console.log("Loaded class definitions");
        await thisHive.LoadCollectorInstances(this.Cortex.drpService);
        console.log("Loaded collector data");
        callback();
    }

    // May need to define a new collectorClient object with a state machine
    OpenCollectors() {
        var thisHive = this;

        let collectorNameList = Object.keys(thisHive.collectorProfiles);

        if (collectorNameList.length > 0) {

            // Open connections to collector hosts
            for (let k = 0; k < collectorNameList.length; k++) {
                let collectorName = collectorNameList[k];

                // Set thisCollectorProfile (shortcut)
                var thisCollectorProfile = thisHive.collectorProfiles[collectorName];
                var thisCollectorServer = thisHive.collectorServers[thisCollectorProfile.server];
                thisCollectorProfile.runHost = thisCollectorServer.FQDN;
                thisCollectorProfile.runPort = thisCollectorServer.Port;
                thisCollectorProfile.StreamHandlers = [];

                // Non-streaming collectors will have 'classes' array; streaming will have single 'class'
                if (thisCollectorProfile.hasOwnProperty('classes')) {
                    for (var i = 0; i < thisCollectorProfile['classes'].length; i++) {
                        var classType = thisCollectorProfile['classes'][i]['name'];

                        if (typeof thisHive.HiveClasses[classType] === "undefined") {
                            console.log("Class stereotype not defined -> [" + classType + "]...");
                            console.dir(thisHive.HiveClasses);
                            console.dir(thisHive.HiveIndexes);
                            process.exit(1);
                        }
                        var sTypeClass = thisHive.HiveClasses[classType];
                        if (typeof thisHive.HiveData[classType] === "undefined") {
                            thisHive.HiveData[classType] = {};
                            console.log("Set: HiveData[", classType, "]");
                        } else {
                            //console.log("Already set: HiveData[", classType, "]");
                        }

                        thisCollectorProfile.queryOpts.GetFields = [];
                        thisCollectorProfile.queryOpts.GetFields.push('ObjectType');
                        Object.keys(sTypeClass.Attributes).forEach(function (attrKey) {
                            thisCollectorProfile.queryOpts.GetFields.push(sTypeClass.Attributes[attrKey].Name);
                        });
                    }
                } else {
                    console.log("CollectorProfile [", collectorName, "] does not have 'classes' attribute");
                }

                // Construct wsTarget variable
                var wsTarget = "ws://" + thisCollectorProfile['runHost'] + ":" + thisCollectorProfile['runPort'] + "/cortex";

                // If we haven't already created a client for this target host, do so
                if (!(thisHive.CollectorClients[wsTarget])) {
                    thisHive.CollectorClients[wsTarget] = new CollectorClient(thisCollectorProfile, thisHive);
                }
                thisCollectorProfile.collectorClient = thisHive.CollectorClients[wsTarget];
                var collectorClient = thisHive.CollectorClients[wsTarget];
                if (!(collectorClient.hasOwnProperty('collectorList'))) {
                    collectorClient.collectorList = [];
                }
                collectorClient.collectorList.push(thisCollectorProfile);
            }
        } else {
            // No collectors defined
            thisHive.AllCollectorsLoaded();
        }
    }

    async LoadCollectorInstances(drpService) {
        var thisHive = this;

        // We need to get a list of all distinct class INSTANCES along with the best source for each
        let classInstances = drpService.ListClassInstances();
        // Loop over classes
        let classNames = Object.keys(classInstances);
        for (let i = 0; i < classNames.length; i++) {
            let thisClassName = classNames[i];
            let thisClassObj = classInstances[thisClassName];

            // Loop over sourceInstances
            let sourceInstanceNames = Object.keys(thisClassObj);
            for (let j = 0; j < sourceInstanceNames.length; j++) {
                let thisSourceInstanceName = sourceInstanceNames[j];
                let thisSourceInstanceObj = thisClassObj[thisSourceInstanceName];

                // Loop over providers; get the best precedence (lower is better)
                let bestProviderObj = null;
                let bestProviderName = null;
                let providerNames = Object.keys(thisSourceInstanceObj.providers);
                for (let k = 0; k < providerNames.length; k++) {
                    let thisProviderName = providerNames[k];
                    let thisProviderObj = thisSourceInstanceObj.providers[thisProviderName];
                    if (!bestProviderObj || thisProviderObj.Precedence < bestProviderObj.Precedence) {
                        bestProviderObj = thisProviderObj;
                        bestProviderName = thisProviderName;
                    }
                }

                // We have the best provider for this class instance
                if (!thisHive.CollectorInstances[thisSourceInstanceName]) {
                    thisHive.CollectorInstances[thisSourceInstanceName] = {}
                }
                thisHive.CollectorInstances[thisSourceInstanceName][thisClassName] = {
                    ProviderName: bestProviderName,
                    RecordPath: bestProviderObj.RecordPath,
                    Loaded: false
                }
            }


        }

        // Start querying INSTANCES in parallel and the CLASSES in each sequentially

        // dir drp:\Registry\rSageCollectors\SourceInstances\AZ_ESN\VOIP.NortelCDP\Definition
        // dir drp:\Registry\{PROVIDER}\SourceInstances\{INSTANCE}\{CLASS}\Definition
        let sourceInstanceNames = Object.keys(thisHive.CollectorInstances);
        for (let i = 0; i < sourceInstanceNames.length; i++) {
            let thisSourceInstanceName = sourceInstanceNames[i];
            let thisSourceInstanceObj = thisHive.CollectorInstances[thisSourceInstanceName];
            
            let classNames = Object.keys(thisSourceInstanceObj);
            for (let j = 0; j < classNames.length; j++) {
                let thisClassName = classNames[j];
                let thisClassObj = thisSourceInstanceObj[thisClassName];

                let recordPath = ["Providers", thisClassObj.ProviderName].concat(thisClassObj.RecordPath);

                // Find a suitable Broker - maybe add "Brokers" to Registry?
                // Send cmd to broker for info
                let returnData = await drpService.sendBrokerRequest("pathCmd", { method: "cliGetPath", pathList: recordPath, listOnly: false });
                let classInstanceRecords = returnData.pathItem;

                // Add data to Hive
                console.log(`Retrieved [${thisClassName}] from ${thisSourceInstanceName}@${thisClassObj.ProviderName}, Length: ${Object.keys(classInstanceRecords).length}`);
                var newRecordHash = {};
                Object.keys(classInstanceRecords).forEach(function (objPK) {
                    newRecordHash[objPK] = {
                        'classType': thisClassName,
                        'MK': [],
                        'FK': [],
                        'data': classInstanceRecords[objPK]
                    }
                    newRecordHash[objPK].data['_collectorID'] = thisSourceInstanceName;
                });
                // Add data to Hive
                if (!thisHive.HiveData[thisClassName]) {
                    thisHive.HiveData[thisClassName] = {};
                }
                thisHive.HiveData[thisClassName][thisSourceInstanceName] = {
                    'records': newRecordHash,
                    'classDef': thisHive.HiveClasses[thisClassName]
                }
                thisHive.BuildStereotypeIndexes_ClassDataInstance(thisHive.HiveData[thisClassName][thisSourceInstanceName]);

                let bob = 1;
            }
        }
    }

    ProcessSnapData(snapData) {
        var thisHive = this;
        //console.log("Processing snap data...");
        if (snapData && snapData['status']) {
            switch (snapData['status']) {
                case 'OKAY':
                    // Successful snap transfer
                    //console.log("Successful snap transfer!");

                    // Loop over classes in snap
                    Object.keys(snapData['data']).forEach(function (classType) {
                        console.log("Retrieved [", classType, "] from ", snapData['source'], ", Length: " + Object.keys(snapData['data'][classType].records).length);
                        var newRecordHash = {};
                        var recordsRef = snapData['data'][classType]['records'];
                        Object.keys(snapData['data'][classType]['records']).forEach(function (objPK) {
                            newRecordHash[objPK] = {
                                'classType': classType,
                                'MK': [],
                                'FK': [],
                                'data': recordsRef[objPK]
                            }
                            newRecordHash[objPK].data['_collectorID'] = snapData['source'];
                        });
                        // Add data to Hive
                        if (!thisHive.HiveData[classType]) {
                            thisHive.HiveData[classType] = {};
                        }
                        thisHive.HiveData[classType][snapData['source']] = {
                            'records': newRecordHash,
                            'classDef': thisHive.HiveClasses[classType]
                        }
                        thisHive.BuildStereotypeIndexes_ClassDataInstance(thisHive.HiveData[classType][snapData['source']]);
                    });
                    //thisHive.CollectorLoaded();
                    break;
                case 'SNAP CURRENTLY RUNNING':
                    console.log("Snap currently running, will retry shortly...");
                    // TODO - Add retry logic
                    break;
                default:
                    console.log("Unrecognized snap status: [", snapData['status'], "]");
                    break;
            }
        } else {
            console.log("Could not process snap data; incorrect object structure");
        }
        //console.log("Processed snap data.");
    }

    CollectorLoaded() {

        var thisHive = this;
        thisHive.collectorsProcessed++;
        if (thisHive.collectorsProcessed === Object.keys(thisHive.collectorProfiles).length) {
            //console.log("Finished loaded collectors.  Let's find data associations based on stereotypes...");
            //thisHive.BuildStereotypeIndexes();
            thisHive.AllCollectorsLoaded();
        }
    }

    AllCollectorsLoaded() {
        var thisHive = this;
        thisHive.IsReady = true;
        console.log("Finished loading collectors, Hive is ready");
        if (thisHive.RunAfterHiveLoad) {
            thisHive.RunAfterHiveLoad();
        }
    }

    BuildStereotypeIndexes_ClassDataInstance(thisClassDataInstance) {
        var thisHive = this;

        // Get Class definition
        let thisClassDefinition = thisClassDataInstance.classDef;

        // Get list of records
        let recordKeyList = Object.keys(thisClassDataInstance.records);

        // Get hash of index fields with KeyType & Stereotype
        let indexKeyHash = thisHive.GetClassIndexKeys(thisClassDefinition);

        // Loop through all items in instance - add to index
        for (let m = 0; m < recordKeyList.length; m++) {

            // Get record reference
            let thisRecord = thisClassDataInstance.records[recordKeyList[m]];

            // Process index key fields
            thisHive.ProcessKeyFields(indexKeyHash, thisRecord);
        }
    }

    AddClassDataValue(collectorName, thisRecord) {
        var thisHive = this;

        // Class Type & Data Shortcuts
        var className = thisRecord.data["_objClass"];

        // Initialize HiveData[className] if it doesn't exist
        if (typeof (thisHive.HiveData[className]) === "undefined") {
            thisHive.HiveData[className] = {};
        }

        // Initialize HiveData[className][collectorName] if it doesn't exist
        if (typeof (thisHive.HiveData[className][collectorName]) === "undefined") {
            thisHive.HiveData[className][collectorName] = {
                'records': {},
                'classDef': thisHive.HiveClasses[className]
            };
        }

        let thisClassDataInstance = thisHive.HiveData[className][collectorName];

        // Get Class definition
        let thisClassDefinition = thisClassDataInstance.classDef;

        // Get PK value
        var pkFieldName = thisClassDefinition.PrimaryKey;
        var recordKey = thisRecord.data[pkFieldName];

        // Create Record Object
        thisClassDataInstance.records[recordKey] = thisRecord;

        // Get hash of index fields with KeyType & Stereotype
        let indexKeyHash = thisHive.GetClassIndexKeys(thisClassDefinition);

        // Process index key fields
        thisHive.ProcessKeyFields(indexKeyHash, thisRecord);
    }

    DeleteClassDataValue(csInst, csType, csRecordKey) {
        var thisHive = this;
        // If a data set has a field with MK, create...
        //  HiveIndexes[field stype].IndexRecords[value] = {MK:recordPtr, FK:[]}

        // Class Type & Data Shortcuts
        var thisClassType = thisHive.HiveClasses[csType];
        var thisClassData = thisHive.HiveData[csType];

        // Class Data Instance Shortcut
        var thisInst = thisClassData[csInst];

        // Get Record Object
        var thisRecord = thisInst.records[csRecordKey];
        if (!thisRecord)
            return null

        // Remove references in Index objects
        for (var i = 0; i < thisRecord.MK.length; i++) {
            // Assign mkIdxObj and remove index
            var mkIdxObj = thisRecord.MK[i];
            mkIdxObj.MK = '';
        }

        for (var i = 0; i < thisRecord.FK.length; i++) {
            // Assign mkIdxObj and remove index
            var mkIdxObj = thisRecord.FK[i];
            for (var j = 0; j < mkIdxObj.FK.length; j++) {
                if (mkIdxObj.FK[j] == thisRecord) {
                    mkIdxObj.FK.splice(j, 1);
                }
            }
        }

        // Purge key/value pair from hash
        delete thisInst.records[csRecordKey];

        // 2018-01-31 : We need to add logic to handle Cortex object references pointing to this object!
    }

    GetClassIndexKeys(thisClassDefinition) {
        var thisHive = this;

        var fieldIndexKeys = {};

        // Loop over fields in class type definition - find MK,FK
        let attributeKeyList = Object.keys(thisClassDefinition.Attributes);
        for (let a = 0; a < attributeKeyList.length; a++) {

            // Get attribute key
            let attrKey = attributeKeyList[a];

            // Assign values as necessary
            var thisAttrDef = thisClassDefinition.Attributes[attrKey];
            var keyArr = thisAttrDef.Restrictions.split(",");
            for (var k = 0; k < keyArr.length; k++) {
                switch (keyArr[k]) {
                    case 'MK':
                        fieldIndexKeys[attrKey] = {
                            'KeyType': 'MK',
                            'Stereotype': thisAttrDef.Stereotype
                        };
                        break;
                    case 'FK':
                        fieldIndexKeys[attrKey] = {
                            'KeyType': 'FK',
                            'Stereotype': thisAttrDef.Stereotype
                        };
                        break;
                    case 'PK':
                        // Special case - this IS the object's array key
                        break;
                    default:
                        break;
                }
            }
        }

        return fieldIndexKeys;
    }

    ProcessKeyFields(indexKeyHash, thisRecord) {
        var thisHive = this;

        let indexKeyList = Object.keys(indexKeyHash);

        // Loop over fields in class type definition that are MK or FK
        for (let a = 0; a < indexKeyList.length; a++) {

            // Get attribute name
            let attrKey = indexKeyList[a];

            // Get KeyType & Stereotype
            let attrKeyDef = indexKeyHash[attrKey];

            // Get Field Value
            let fieldValue = thisRecord.data[attrKey];

            // Process
            if (toString.call(fieldValue) == '[object Array]') {
                for (var q = 0; q < fieldValue.length; q++) {
                    thisHive.ProcessKeyField(attrKeyDef.KeyType, thisRecord, attrKeyDef.Stereotype, fieldValue[q]);
                }
            } else {
                thisHive.ProcessKeyField(attrKeyDef.KeyType, thisRecord, attrKeyDef.Stereotype, fieldValue);
            }

        }
    }

    ProcessKeyField(keyType, recordRef, sTypeOfField, fieldValue) {
        var thisHive = this;

        if (fieldValue == null)
            return;

        // Check string values; reject if empty or set to literal 'null'
        if (typeof fieldValue === "string") {
            var tmpString = fieldValue.toLowerCase();
            fieldValue = tmpString;
            if (fieldValue == 'null' || fieldValue == '')
                return;
        }

        // See if the index key already exists
        if (typeof thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue] === "undefined") {
            // New index key; let's set the base attributes
            thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue] = {
                key: fieldValue,
                sType: sTypeOfField,
                MK: '',
                FK: []
            }
        }

        switch (keyType) {
            case 'MK':
                thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue].MK = recordRef;
                recordRef.MK.push(thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue]);
                break;
            case 'FK':
                thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue].FK.push(recordRef);
                recordRef.FK.push(thisHive.HiveIndexes[sTypeOfField].IndexRecords[fieldValue]);
                break;
        }

    }

    GetIndexKeys(sTypeOfField) {
        var thisHive = this;
        var returnVal = null;
        if (typeof thisHive.HiveIndexes[sTypeOfField] === "undefined") {
            returnVal = [];
        } else {
            returnVal = Object.keys(thisHive.HiveIndexes[sTypeOfField].IndexRecords);
        }
        return returnVal;
    }

    GetIndexEntry(sTypeOfField, key) {
        var thisHive = this;
        var returnVal = null;
        if (typeof thisHive.HiveIndexes[sTypeOfField] !== "undefined" && typeof thisHive.HiveIndexes[sTypeOfField].IndexRecords[key] !== "undefined") {
            returnVal = thisHive.HiveIndexes[sTypeOfField].IndexRecords[key];
        }
        return returnVal;
    }

    GetIndexEntries(sTypeOfField) {
        var thisHive = this;
        var returnVal = null;
        if (typeof thisHive.HiveIndexes[sTypeOfField] !== "undefined") {
            returnVal = thisHive.HiveIndexes[sTypeOfField].IndexRecords;
        }
        return returnVal;
    }
    /*
    DataArrayToObject(record) {
        var thisHive = this;
        sTypeClass = thisHive.HiveClasses[record[0]];
        var classAttrs = sTypeClass.Attributes;

        Object.keys(sTypeClass.Functions).forEach(function (key) {
            thisFunc = sTypeClass.Functions[key];
            switch (key) {
                case 'getNBLogin':
                    record[classAttrs[thisFunc.outputAttr].colRef] = record[classAttrs[thisFunc.funcAttrs[0]].colRef] + "\\" + record[classAttrs[thisFunc.funcAttrs[1]].colRef];
                    break;
                case 'getSMTPAddrs':
                    record[classAttrs[thisFunc.outputAttr].colRef] = [];
                    var tmpArr = record[classAttrs[thisFunc.funcAttrs[0]].colRef].split('|');
                    for (var i = 0; i < tmpArr.length; i++) {
                        var matchArray = [];
                        if (matchArray = tmpArr[i].match(/^smtp:(.*)$/i)) {
                            record[classAttrs[thisFunc.outputAttr].colRef].push(matchArray[1]);
                        }
                    }
                    break;
                case 'split':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    var splitChar = ',';
                    if (thisFunc.funcAttrs[1]) {
                        splitChar = thisFunc.funcAttrs[1];
                    }
                    if (tmpVal) {
                        record[classAttrs[thisFunc.outputAttr].colRef] = tmpVal.split(splitChar);
                    }
                    break;
                case 'trim':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    if (tmpVal) {
                        record[classAttrs[thisFunc.funcAttrs[0]].colRef] = tmpVal.trim();
                    };
                    break;
                case 'splitPBXID':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    if (tmpVal) {
                        var tmpArr = tmpVal.split('^');
                        var newArr = [];
                        for (var i = 0; i < tmpArr.length; i += 2) {
                            newArr[i / 2] = tmpArr[i] + '^' + tmpArr[i + 1];
                        }
                        record[classAttrs[thisFunc.outputAttr].colRef] = newArr;
                    }
                    break;
                case 'standardizeMAC':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    var results = /^(\w{2})(?:[\:\-])?(\w{2})(?:[\:\-\.])?(\w{2})(?:[\:\-])?(\w{2})(?:[\:\-\.])?(\w{2})(?:[\:\-])?(\w{2})$/.exec(tmpVal);
                    if (results) {
                        var correctedMac = results[1] + ':' + results[2] + ':' + results[3] + ':' + results[4] + ':' + results[5] + ':' + results[6];
                        record[classAttrs[thisFunc.funcAttrs[0]].colRef] = correctedMac.toLowerCase();
                    }
                    break;
                case 'standardizeDID':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    var results = /^(?:[\+1\s\(]+)?(\d{3})(?:[\-\.\s\)]+)?(\d{3})(?:[\-\.\s]+)?(\d{4})$/.exec(tmpVal);
                    if (results) {
                        var correctedDID = results[1] + '' + results[2] + '' + results[3];
                        record[classAttrs[thisFunc.funcAttrs[0]].colRef] = correctedDID.toLowerCase();
                    }
                    break;
                case 'parseBranchFromDevice':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    var results = /^[A-z](\d{4})\-[A-z]{2,3}\d{1,3}\.net\.svm\.com$/.exec(tmpVal.toLowerCase());
                    if (results) {
                        record[classAttrs[thisFunc.outputAttr].colRef] = results[1];
                    }
                    break;
                case 'parseBranchFromSubnetName':
                    var tmpVal = record[classAttrs[thisFunc.funcAttrs[0]].colRef];
                    var results = /^[A-z]?(\d{4})[\s\-]/.exec(tmpVal.toLowerCase());
                    if (results) {
                        record[classAttrs[thisFunc.outputAttr].colRef] = results[1];
                    }
                    break;
                default:
                    break;
            }
        });
        var pkFieldName = sTypeClass.PrimaryKey;
        var pkFieldNum = classAttrs[pkFieldName].colRef;
        var thisRowPK = record[pkFieldNum];
        return {
            MK: [],
            FK: [],
            data: record
        };
        //return { Key : thisRowPK, Value : { MK: [], FK: [], data: record }};
    }
    */
}

class ICRQuery {
    constructor(queryText, hive) {
        this.queryText = queryText;
        this.Hive = hive;
        this.cmdParts = {};
        this.queryFunc = {};
        this.targetObj = {};
        this.returnObj = {};
        this.collectorName = null;
    }
    Run() {
        var thisQueryObj = this;
        this.errorStatus = 0;
        this.cmdParts = {};
        var cmdArr = /^(\w+) (\w+)(?:\[\'([\w\.]+)\'\])?(?:\[\'([\w\.]+)\'\])?(?:\.(FK|MK)\[\'([\w\.]+)\'\])?(?:\.KEY)?(?:\[\'([\w\.]+)\'\])?(?: KEY (\'[\w]+\'))?(?: (WHERE) (KEY|FK|MK)(?:\[\'([\w\.]+)\'\])?(?:\[\'([\w\.\s]+)\'\])?(?:\s?(\!)?(EXISTS|LIKE|=) ?(\"?[\w\.\*\%\s\,\=\(\)\@\'\-\_]+\"?)?))?$/.exec(thisQueryObj.queryText);

        if (cmdArr) {
            this.cmdParts = {
                verb: cmdArr[1],
                objType: cmdArr[2],
                classType: cmdArr[3],
                classKey: cmdArr[4],
                precedence1: cmdArr[5],
                classTypeSub: cmdArr[6],
                classKeySub: cmdArr[7],
                keyVal: cmdArr[8],
                filterName: cmdArr[9],
                precedence2: cmdArr[10],
                tgtClassType: cmdArr[11],
                tgtClassField: cmdArr[12],
                negate: cmdArr[13],
                comparator: cmdArr[14],
                compVal: cmdArr[15]
            };

            if (this.cmdParts.compVal) {
                this.cmdParts.compVal = this.cmdParts.compVal.replace(/^['"]/g, "")
                this.cmdParts.compVal = this.cmdParts.compVal.replace(/['"]$/g, "")
            }

            // Check Verb
            var verbName = this.cmdParts.verb;
            if (this.Verbs.hasOwnProperty(verbName)) {
                this.queryFunc = this.Verbs[verbName];
            } else {
                this.errorStatus = 2;
                return;
            }

            // Check Object Type
            var objType = this.cmdParts.objType;
            if (this.ObjectTypes.hasOwnProperty(objType)) {
                this.dataStructReader = this.ObjectTypes[objType];
                this.dataStructReader();
            } else {
                this.errorStatus = 3;
                return;
            }

            // Add checks that validate the target object classtype and value keys if passed

            // Check target classType
            var classType = this.cmdParts.classType;
            if (typeof classType !== undefined) {
                //console.dir(this);
                if (this.objRoot.hasOwnProperty(classType)) {
                    this.rootSType = classType;
                    if (typeof this.cmdParts.classKey !== 'undefined') {
                        this.rootSTypeKey = this.cmdParts.classKey;
                    }
                } else {
                    this.errorStatus = 4;
                    return;
                }
            } else {
                // Missing classType - this means we simply want to list the object's classTypes
            }

            // Run Query
            this.queryFunc();

        } else {
            this.errorStatus = 1;
        }
    };

    MatchGetParts(thisDataKey, thisDataObj, evalVar, doEval) {
        var thisQueryObj = this;
        // This function evaluates the selection portion of queries...
        // LIST STEREOTYPE['ipAddress'].FK['IP.ProtDNS']['absoluteName'] {WHERE ...}
        var returnList = [];

        if (!doEval || thisQueryObj.Evaluate(evalVar, thisQueryObj.cmdParts.negate, thisQueryObj.cmdParts.comparator, thisQueryObj.cmdParts.compVal)) {
            // Are we specifying a subpart to get?
            if (thisQueryObj.cmdParts.precedence1) {
                // Yes - see if we want the key, MK or FK
                switch (thisQueryObj.cmdParts.precedence1) {
                    case 'KEY':
                        // Return only the KEY
                        returnList.push(thisDataKey);
                        break;
                    case 'MK':
                        // See if the MK matches the classTypeSub
                        var thisItemObj = thisDataObj['MK'];
                        if (thisItemObj && thisItemObj.data['_objClass'] == thisQueryObj.cmdParts.classTypeSub) {
                            var thisItemClass = thisItemObj.data['_objClass'];
                            var pkFieldName = thisQueryObj.Hive.HiveClasses[thisItemClass].PrimaryKey;
                            var pkValue = thisItemObj.data[pkFieldName];
                            var returnItem = {};
                            // See if we have a specific field to return
                            if (thisQueryObj.cmdParts.classKeySub) {
                                // Yes - return only one field
                                var dataFieldName = '_objClass';
                                if (thisQueryObj.Hive.HiveClasses[thisItemClass].Attributes[thisQueryObj.cmdParts.classKeySub]) {
                                    dataFieldName = thisQueryObj.cmdParts.classKeySub;
                                }
                                returnItem[pkValue] = thisItemObj.data[dataFieldName];
                            } else {
                                // No - return the whole object
                                returnItem[pkValue] = thisItemObj.data;
                            }
                            returnList.push(returnItem);
                        }
                        break;
                    case 'FK':
                        // See if the FK matches the classTypeSub
                        Object.keys(thisDataObj['FK']).forEach(function (itemKey2) {
                            var thisItemObj = thisDataObj['FK'][itemKey2];
                            var thisItemClass = thisItemObj.data['_objClass'];
                            if (thisItemClass == thisQueryObj.cmdParts.classTypeSub) {
                                var pkFieldName = thisQueryObj.Hive.HiveClasses[thisItemClass].PrimaryKey;
                                var pkValue = thisItemObj.data[pkFieldName];
                                var returnItem = {};
                                // See if we have a specific field to return
                                if (thisQueryObj.cmdParts.classKeySub) {
                                    // Yes - return only one field
                                    var thisDataClass = thisQueryObj.Hive.HiveData[thisItemClass];
                                    var dataFieldName = '_objClass';
                                    if (thisQueryObj.Hive.HiveClasses[thisItemClass].Attributes[thisQueryObj.cmdParts.classKeySub]) {
                                        dataFieldName = thisQueryObj.cmdParts.classKeySub;
                                    }
                                    returnItem[pkValue] = thisItemObj.data[dataFieldName];
                                } else {
                                    // No - return the whole object
                                    returnItem[pkValue] = thisItemObj.data;
                                }
                                returnList.push(returnItem);
                            }
                        });
                        break;
                    default:
                }
            } else {
                returnList.push(thisDataKey);
            }
        }
        return returnList;
    }

    //        this.CheckReturn = function () {
    //            // If the classTypeSub and tgtClassType are the same, let's return only matching items
    //        }

    Evaluate_Item(value, negate, comparator, compVal) {
        var thisQueryObj = this;
        //console.log("Evaluating: " + value);
        var returnVal = false;

        switch (comparator) {
            case '=':
                if (thisQueryObj.cmdParts.compVal == 'null') {
                    if (!value) {
                        returnVal = true
                    }
                } else {
                    if (typeof compVal === "string" && typeof value === "string") {
                        if (compVal.toUpperCase() == value.toUpperCase()) {
                            returnVal = true;
                        }
                    } else if (compVal == value) {
                        returnVal = true;
                    }
                }
                break;
            case '>':
                if (compVal > value) {
                    returnVal = true;
                }
                break;
            case '<':
                if (compVal < value) {
                    returnVal = true;
                }
                break;
            case 'EXISTS':
                if (value) {
                    if (typeof value === "string") {
                        if (value != "") {
                            returnVal = true;
                        }
                    } else if (value) {
                        returnVal = true;
                    }
                }
                break;
            case 'LIKE':
                if (value) {
                    if (typeof compVal === "string" && typeof value === "string") {
                        var tmpPattern = compVal.replace('*', '.*');
                        tmpPattern = tmpPattern.replace('+', '\\+');
                        var matchPattern = '^' + tmpPattern + '$';
                        var regexObj = new RegExp(matchPattern, "i");

                        if (value.match(regexObj)) {
                            returnVal = true;
                        }
                    }
                }
                break;
            default:
                break;
        }

        if (negate) {
            if (returnVal == true) {
                returnVal = false;
            } else {
                returnVal = true;
            }
        }

        return returnVal;
    }

    Evaluate(value, negate, comparator, compVal) {
        var thisQueryObj = this;
        var returnVal = false;
        if (toString.call(value) == '[object Array]') {
            for (var i = 0; i < value.length; i++) {
                if (thisQueryObj.Evaluate_Item(value[i], negate, comparator, compVal)) {
                    returnVal = true;
                }
            }

        } else {
            return thisQueryObj.Evaluate_Item(value, negate, comparator, compVal);
        }
        return returnVal;
    }
}

ICRQuery.prototype.ObjectTypes = {
    STEREOTYPE: function () {
        var thisQueryObj = this;
        this.objRoot = thisQueryObj.Hive.HiveIndexes;
        this.objRecs = 'IndexRecords';
        this.rootSType = null;
        this.rootSTypeKey = null;
        this.ListSTypes = function () {
            var tmpList = [];
            Object.keys(objRoot).forEach(function (itemKey) {
                tmpList.push(itemKey);
            });
            return tmpList;
        }
        this.ListObjectsInScope = function () {
            var tmpList = [];
            var objBase = this.objRoot[this.rootSType][this.objRecs];
            if (this.rootSTypeKey) {
                if (typeof this.rootSTypeKey === "string") {
                    var tmpString = this.rootSTypeKey.toLowerCase();
                    this.rootSTypeKey = tmpString;
                }
                var pushVal = {
                    'objKey': this.rootSTypeKey,
                    'objRef': objBase[this.rootSTypeKey]
                };
                tmpList.push(pushVal);
            } else {
                // Loop over items
                Object.keys(objBase).forEach(function (itemKey) {
                    var pushVal = {
                        'objKey': itemKey,
                        'objRef': objBase[itemKey]
                    };
                    tmpList.push(pushVal);
                });
            }
            return tmpList;
        }
    },
    CLASSDATA: function () {
        var thisQueryObj = this;
        this.objRoot = thisQueryObj.Hive.HiveData;
        this.objRecs = 'records';
        this.objBase = null;
        this.rootSType = null;
        this.rootSTypeKey = null;
        this.ListSTypes = function () {
            var tmpList = [];
            Object.keys(objRoot).forEach(function (itemKey) {
                tmpList.push(itemKey);
            });
            return tmpList;
        }
        this.ListObjectsInScope = function () {
            var tmpList = [];
            // Loop over Collectors
            Object.keys(objRoot[rootSType]).forEach(function (collectorKey) {
                objBase = objRoot[rootSType][collectorKey][objRecs];
                if (rootSTypeKey) {
                    if (typeof rootSTypeKey === "string") {
                        var tmpString = fieldValue.toLowerCase();
                        rootSTypeKey = tmpString;
                    }
                    var pushVal = {
                        'objKey': rootSTypeKey,
                        'objRef': objBase[rootSTypeKey]
                    };
                    if (objBase[rootSTypeKey]) {
                        tmpList.push(pushVal);
                    }
                } else {
                    // Loop over items
                    Object.keys(objBase).forEach(function (itemKey) {
                        var pushVal = {
                            'objKey': itemKey,
                            'objRef': objBase[itemKey]
                        };
                        tmpList.push(pushVal);
                    });
                }
            });
            return tmpList;
        }
    }
}

ICRQuery.prototype.Verbs = {
    LIST: function () {
        var thisQueryObj = this;
        //console.log("Running a LIST command!");
        //console.dir(this.cmdParts);

        // We'll be returning a list of variables; instantiate array
        var returnList = [];
        var tmpList = [];
        var whereScope = {};

        // See if we just need to list the keys of the object
        if (!this.rootSType) {
            this.returnObj = this.ListSTypes();
            return;
        }

        tmpList = this.ListObjectsInScope();

        // Do we have a WHERE clause? If so we need to search on that.  Loop over the target scope elements and test each.
        if (typeof thisQueryObj.cmdParts.filterName !== 'undefined' && typeof tmpList[0] !== 'undefined') {
            for (var i = 0; i < tmpList.length; i++) {
                // Set key
                var thisKey = tmpList[i]['objKey'];

                // Set object
                var thisObj = tmpList[i]['objRef'];

                // Debug
				/*
				if (thisKey == '10707972') {
				var testVar = 1;
				}
				 */

                // Check compare scope
                switch (thisQueryObj.cmdParts.precedence2) {
                    case 'KEY':
                        var evalVar = thisKey;
                        // RunBigMatch - WITH_EVAL
                        var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, evalVar, true);
                        if (tmpArr.length) {
                            var tmpItem = {};
                            tmpItem[thisKey] = tmpArr;
                            returnList.push(tmpItem);
                        }

                        break;
                    case 'MK':
                        if (thisObj['MK'] !== '' && thisObj['MK'].data['_objClass'] == thisQueryObj.cmdParts.tgtClassType) {
                            // Get class field number using class type
                            var collectorName = '';
                            Object.keys(thisQueryObj.Hive.HiveData[thisQueryObj.cmdParts.tgtClassType]).forEach(function (itemKey) {
                                collectorName = itemKey;
                            });
                            var tgtCollector = thisQueryObj.Hive.HiveData[thisQueryObj.cmdParts.tgtClassType][collectorName];
                            var evalVar = thisObj['MK'].data[thisQueryObj.cmdParts.tgtClassField];
                            // RunBigMatch - WITH_EVAL
                            var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, evalVar, true);
                            if (tmpArr.length) {
                                var tmpItem = {};
                                tmpItem[thisKey] = tmpArr;
                                returnList.push(tmpItem);
                            }
                        } else if (thisObj['MK'] == '' && !thisQueryObj.cmdParts.tgtClassType && thisQueryObj.cmdParts.compVal == 'null' && !thisQueryObj.cmdParts.negate) {
                            // Handle MK = null
                            var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, evalVar, false);
                            if (tmpArr.length) {
                                var tmpItem = {};
                                tmpItem[thisKey] = tmpArr;
                                returnList.push(tmpItem);
                            }
                        } else if (thisObj['MK'] !== '' && !thisQueryObj.cmdParts.tgtClassType && thisQueryObj.cmdParts.compVal == 'null' && thisQueryObj.cmdParts.negate) {
                            // Handle MK = null
                            var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, evalVar, false);
                            if (tmpArr.length) {
                                var tmpItem = {};
                                tmpItem[thisKey] = tmpArr;
                                returnList.push(tmpItem);
                            }
                        } else {
                            var testVar = 0;
                        }
                        break;
                    case 'FK':
                        if (thisObj['FK'].length > 0) {
                            var thisKeyMatch = false;
                            Object.keys(thisObj['FK']).forEach(function (itemKey) {
                                if (thisKeyMatch == false && thisObj['FK'][itemKey].data['_objClass'] == thisQueryObj.cmdParts.tgtClassType) {
                                    var collectorName = '';
                                    Object.keys(thisQueryObj.Hive.HiveData[thisQueryObj.cmdParts.tgtClassType]).forEach(function (itemKey) {
                                        collectorName = itemKey;
                                    });
                                    var tgtCollector = thisQueryObj.Hive.HiveData[thisQueryObj.cmdParts.tgtClassType][collectorName];
                                    var evalVar = thisObj['FK'][itemKey].data[thisQueryObj.cmdParts.tgtClassField];
                                    // RunBigMatch - WITH_EVAL
                                    var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, evalVar, true);
                                    if (tmpArr.length) {
                                        var tmpItem = {};
                                        tmpItem[thisKey] = tmpArr;
                                        returnList.push(tmpItem);
                                    }
                                }
                            });
                        }
                        break;
                    default:
                        break;
                }
            }
        } else {
            // No WHERE clause
            for (var i = 0; i < tmpList.length; i++) {
                // Set key
                var thisKey = tmpList[i]['objKey'];

                // Set object
                var thisObj = tmpList[i]['objRef'];

                // RunBigMatch - WITHOUT_EVAL
                var tmpArr = thisQueryObj.MatchGetParts(thisKey, thisObj, null, false);
                if (tmpArr.length) {
                    var tmpItem = {};
                    tmpItem[thisKey] = tmpArr;
                    returnList.push(tmpItem);
                }
            }
        }

        // Finally, evaluate the classTypeSub and classKeySub.  If these are present we need to loop over the key result
        // set and find children matching these.
        if (typeof this.cmdParts.classTypeSub !== undefined && typeof this.cmdParts.classKeySub !== undefined) { }

        this.returnObj = {
            'icrQuery': this.cmdParts,
            'results': returnList
        };
    }
}

module.exports = {
    CortexServer: CortexServer,
    CortexObjectManager: CortexObjectManager,
    CortexObject: CortexObject,
    CortexObjectQuery: CortexObjectQuery,
    HiveMapQuery: HiveMapQuery
}
