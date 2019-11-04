'use strict';
var drpService = require('drp-service');
var os = require("os");

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

var protocol = "ws";
if (process.env.SSL_ENABLED) {
    protocol = "wss";
}
var port = process.env.PORT || 8081;
var hostname = process.env.HOSTNAME || os.hostname();
var registryURL = process.env.REGISTRYURL || "ws://localhost:8080";

let drpWSRoute = "";

// Set config
let myServerConfig = {
    "NodeURL": `${protocol}://${hostname}:${port}${drpWSRoute}`,
    "Port": port,
    "SSLEnabled": process.env.SSL_ENABLED || false,
    "SSLKeyFile": process.env.SSL_KEYFILE || "",
    "SSLCrtFile": process.env.SSL_CRTFILE || "",
    "SSLCrtFilePwd": process.env.SSL_CRTFILEPWD || "",
    "WebRoot": process.env.WEBROOT || "webroot"
};

// Create a test service to expose
class testService extends drpService.Service {
    /**
     * 
     * @param {string} serviceName Service Name
     * @param {drpNode} drpNode DRP Node
     */
    constructor(serviceName, drpNode) {
        super(serviceName, drpNode);
        this.ClientCmds = {
            sayHi: async function () { return { pathItem: "Hello!" }; },
            sayBye: async function () { return { pathItem: "Goodbye..." }; }
        };
    }
}

// Create expressApp
let myWebServer = new drpService.WebServer(myServerConfig);
myWebServer.start();

// Create Node
console.log(`Starting DRP Node...`);
let myNode = new drpService.Node(["Provider"], myWebServer, drpWSRoute, myServerConfig.NodeURL);

if (myNode.nodeURL) {
    myNode.log(`Listening at: ${myNode.nodeURL}`);
}

// Add dummy stream
myNode.AddStream("dummy", "FakeData");

// Add a test service
myNode.AddService(new testService("TestService", myNode));

// Start sending data to dummy topic
setInterval(function () {
	let timeStamp = new Date().getTime();
    myNode.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + myServerConfig["Name"] + "]");
}, 3000);

// Connect to Registry
myNode.ConnectToRegistry(registryURL);
