'use strict';

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
        this.Classes = {};
    }
}

module.exports = DRP_Service;