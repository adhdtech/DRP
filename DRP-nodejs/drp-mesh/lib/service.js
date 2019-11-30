'use strict';

const UMLClass = require('./uml').Class;

class DRP_Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {DRP_Node} drpNode DRP Node
     */
    constructor(serviceName, drpNode) {
        this.serviceName = serviceName;
        this.drpNode = drpNode;
        this.ClientCmds = {};
        /** @type Object.<string,UMLClass> */
        this.Classes = {};
    }

    /**
     * 
     * @param {UMLClass} umlClass New Class definition
     */
    AddClass(umlClass) {
        this.Classes[umlClass.Name] = umlClass;
    }
}

module.exports = DRP_Service;