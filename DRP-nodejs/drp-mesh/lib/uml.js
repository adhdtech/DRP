class UMLAttribute {
    /**
     * 
     * @param {string} name Attribute name
     * @param {string} stereotype Type of data contained
     * @param {string} visibility public|private
     * @param {bool} derived Is derived
     * @param {string} type string|int|bool
     * @param {object} defaultValue Set to this if unspecified
     * @param {string} multiplicity Number of allowed values
     * @param {string} restrictions PK,FK,MK
     */
    constructor(name, stereotype, visibility, derived, type, defaultValue, multiplicity, restrictions) {
        this.Name = name;
        this.Stereotype = stereotype;
        this.Visibility = visibility;
        this.Derived = derived;
        this.Type = type;
        this.Default = defaultValue;
        this.Multiplicity = multiplicity;
        this.Restrictions = restrictions;
    }
}

class UMLFunction {
    /**
     * 
     * @param {string} name Function name
     * @param {string} visibility public|private
     * @param {string[]} parameters Input parameters
     * @param {string} returnData Output value
     */
    constructor(name, visibility, parameters, returnData) {
        this.Name = name;
        this.Visibility = visibility;
        this.Parameters = parameters;
        this.Return = returnData;
    }
}

class UMLClass {
    /**
     * 
     * @param {string} name Class name
     * @param {string[]} stereotypes Stereotypes
     * @param {UMLAttribute[]} attributes Attributes
     * @param {UMLFunction[]} functions Functions
     */
    constructor(name, stereotypes, attributes, functions) {
        let thisClass = this;
        this.Name = name;
        this.Stereotypes = stereotypes;
        this.Attributes = {};
        attributes.map(item => { this.Attributes[item.Name] = item; });
        this.Functions = functions;
        this.PrimaryKey = null;
        this.query = null;
        this.cache = {};
        this.loadedCache = false;
        this.GetPK();
        this.GetRecords = () => {
            // If we have records cached, return cache
            return this.cache;
            // If not, query from source
        };
        this.GetDefinition = () => {
            return {
                "Name": thisClass.Name,
                "Stereotypes": thisClass.Stereotypes,
                "Attributes": thisClass.Attributes,
                "Functions": thisClass.Functions,
                "PrimaryKey": thisClass.PrimaryKey
            };
        };

        this.AddRecord = (newRecordObj, serviceName, snapTime) => {
            let thisClass = this;
            if (newRecordObj.hasOwnProperty(thisClass.PrimaryKey)) {
                let tmpObj = {
                    "_objClass": thisClass.Name,
                    "_serviceName": serviceName,
                    "_snapTime": snapTime
                };
                Object.keys(thisClass.Attributes).map(item => { if (newRecordObj.hasOwnProperty(item)) tmpObj[item] = newRecordObj[item]; });
                this.cache[tmpObj[thisClass.PrimaryKey]] = tmpObj;
            }
        };
    }

    GetPK() {
        let thisClass = this;

        let attributeKeys = Object.keys(thisClass.Attributes);
        for (let j = 0; j < attributeKeys.length; j++) {
            let thisAttribute = thisClass.Attributes[attributeKeys[j]];
            if (thisAttribute.Restrictions) {
                let keyArr = thisAttribute.Restrictions.split(",");
                // Loop over keys of attribute
                for (let k = 0; k < keyArr.length; k++) {
                    switch (keyArr[k]) {
                        case 'MK':
                            break;
                        case 'FK':
                            break;
                        case 'PK':
                            thisClass.PrimaryKey = thisAttribute.Name;
                            break;
                        default:
                            break;
                    }
                }
            }
        }
    }
}

module.exports = {
    Attribute: UMLAttribute,
    Function: UMLFunction,
    Class: UMLClass
};