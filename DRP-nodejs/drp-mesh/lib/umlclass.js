class UMLAttribute {
    constructor() {
        this.Name = null;
        this.Stereotype = null;
        this.Visibility = null;
        this.Derived = null;
        this.Type = null;
        this.Default = null;
        this.Multiplicity = null;
        this.Restrictions = null;
    }
}

class UMLFunction {
    constructor() {
        this.Name = null;
        this.Visibility = null;
        this.Parameters = null;
        this.Return = null;
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

module.exports = UMLClass;
