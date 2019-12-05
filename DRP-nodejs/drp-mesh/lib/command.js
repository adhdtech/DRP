class DRP_Command {
    constructor(serviceName, cmd, params, targetNodeID) {
        this.serviceName = serviceName;
        this.cmd = cmd;
        this.params = params;
        this.targetNodeID = targetNodeID;
    }
}

module.exports = DRP_Command;