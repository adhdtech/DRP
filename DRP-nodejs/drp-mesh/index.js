'use strict';

const DRPMesh = {};

DRPMesh.Client = require('./lib/client');
DRPMesh.Consumer = require('./lib/consumer');
DRPMesh.Endpoint = require('./lib/endpoint');
DRPMesh.Node = require('./lib/node');
DRPMesh.WebServer = require('./lib/webserver');
DRPMesh.RouteHandler = require('./lib/routehandler');
DRPMesh.Service = require('./lib/service');
DRPMesh.TopicManager = require('./lib/topicmanager');
DRPMesh.Subscription = require('./lib/subscription');
DRPMesh.UMLClass = require('./lib/umlclass');
DRPMesh.Command = class DRP_Command {
    constructor(serviceName, cmd, params, targetNodeID) {
        this.serviceName = serviceName;
        this.cmd = cmd;
        this.params = params;
        this.targetNodeID = targetNodeID;
    }
};

module.exports = DRPMesh;
