'use strict';

const UMLClass = require('./uml').Class;
const DRP_Command = require('./command');

class DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} type Service Type
     * @param {string} instanceID Instance ID
     * @param {boolean} persistence Stickiness
     * @param {number} priority Lower better
     * @param {number} weight Higher better
     * @param {string} zone Declared zone
     * @param {string} scope Availability Local|Zone|Global
     * @param {string[]} dependencies Peer service dependencies
     */
    constructor(serviceName, drpNode, type, instanceID, persistence, priority, weight, zone, scope, dependencies) {
        this.serviceName = serviceName;
        this.drpNode = drpNode;
        this.ClientCmds = {};
        /** @type Object.<string,UMLClass> */
        this.Classes = {};
        this.Type = type;
        this.InstanceID = instanceID;
        this.Persistence = persistence;
        this.Priority = priority;
        this.Weight = weight;
        this.Zone = zone;
        this.Scope = scope || "zone";
        this.Dependencies = dependencies || [];
        this.Status = 0;
        this.isCacheable = false;
        this.lastSnapTime = null;
        this.snapIsRunning = false;
        this.snapStartTime = null;
        this.snapEndTime = null;
        this.snapEndStatus = null;
    }

    /**
     * 
     * @param {UMLClass} umlClass New Class definition
     */
    AddClass(umlClass) {
        this.Classes[umlClass.Name] = umlClass;
    }

    InitiateSnap() {
        let thisService = this;
        let returnData = {
            'status': null,
            'data': null
        };
        if (!thisService.isCacheable) {
            // Not marked as cacheable, don't bother executing RunSnap
            returnData = {
                'status': 'SERVICE NOT CACHEABLE',
                'data': null
            };
        } else if (thisService.snapIsRunning) {
            // Already running, kick back an error
            returnData = {
                'status': 'SNAP ALREADY RUNNING',
                'data': { 'snapStartTime': thisService.snapStartTime }
            };
        } else {

            let runSnap = async () => {
                thisService.snapStartTime = new Date().toISOString();
                thisService.snapIsRunning = true;
                thisService.snapEndStatus = null;

                // Run the provider specific snap logic
                try {
                    await thisService.RunSnap();
                    thisService.snapEndMsg = "OK";
                } catch (ex) {
                    thisService.snapEndMsg = ex;
                }

                thisService.snapEndTime = new Date().toISOString();
                thisService.lastSnapTime = thisService.snapStartTime;
                thisService.snapIsRunning = false;
            };

            runSnap();

            // Return output from collector
            returnData = {
                'status': 'SNAP INITIATED',
                'data': { 'snapStartTime': thisService.snapStartTime }
            };
        }
        return returnData;
    }

    async RunSnap() {
        // This is a placeholder; derived classes should override this method
    }

    async ReadClassCacheFromService(className) {
        let thisService = this;
        let replyObj = await thisService.drpNode.ServiceCommand(new DRP_Command("CacheManager", "readClassCache", { "serviceName": thisService.serviceName, "className": className }));
        if (replyObj.err) {
            thisService.drpNode.log("Could not read cached objects for " + thisService.serviceName + "\\" + className + " -> " + replyObj.err);
            thisService.Classes[className].records = {};
            thisService.Classes[className].loadedCache = false;
        } else {
            thisService.lastSnapTime = replyObj.lastSnapTime;
            for (let objIdx in replyObj.docs) {
                let classObj = replyObj.docs[objIdx];
                let classObjPK = classObj['_objPK'];
                thisService.Classes[className].cache[classObjPK] = classObj;
            }

            thisService.drpNode.log("Done reading cached objects for " + thisService.serviceName + "\\" + className);
        }
        thisService.Classes[className].loadedCache = true;
        return null;
    }

    async WriteClassCacheToService(className, cacheData) {
        let thisService = this;

        // Reject if no data
        if (Object.keys(cacheData).length === 0) {
            thisService.drpNode.log("No collector records to insert for  " + thisService.serviceName + "/" + className);
            return null;
        } else {
            let replyObj = await thisService.drpNode.ServiceCommand(new DRP_Command("CacheManager", "writeClassCache", {
                "serviceName": thisService.serviceName,
                "className": className,
                "cacheData": cacheData,
                "snapTime": thisService.snapStartTime
            }));
            return replyObj;
        }
    }

    async LoadClassCaches() {
        let thisService = this;
        let classNames = Object.keys(thisService.Classes);
        for (let i = 0; i < classNames.length; i++) {
            await thisService.ReadClassCacheFromService(classNames[i]);
        }
    }
}

module.exports = DRP_Service;