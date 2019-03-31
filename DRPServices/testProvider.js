'use strict';
var drpService = require('drp-service');

// Create a test service to expose
class testService {
	constructor() {
		this.ClientCmds = {
			sayHi: async function() { return {pathItem: "Hello!"} },
			sayBye: async function() { return {pathItem: "Goodbye..."} }
		}
	}
}

// Set config
let myServerConfig = {
    "Name": "testProvider1",
    "RegistryURL": "ws://localhost:8080/registry",
    "ProviderURL": "ws://localhost:8081/provider",
    "Port": "8081",
    "SSLEnabled": false,
    "SSLKeyFile": "ssl/mydomain.key",
    "SSLCrtFile": "ssl/mydomain.crt",
    "SSLCrtFilePwd": "mycertpw"
}

// Create expressApp
let myServer = new drpService.Server(myServerConfig);
myServer.start();

// Load Provider
console.log(`Loading Provider [${myServerConfig["Name"]}]`);
let myProvider = new drpService.Provider(myServerConfig["Name"], myServer.expressApp, myServerConfig["RegistryURL"], myServerConfig["ProviderURL"]);
myProvider.ProviderDeclaration.Streams = {
	"dummy": { Class : "FakeData" }
}

// Add a test service
myProvider.AddService("TestService", new testService());

// Start sending data to dummy topic
setInterval(function () {
	let timeStamp = new Date().getTime();
	myProvider.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + myServerConfig["Name"] + "]");
}, 3000);

// Connect to Registry
myProvider.ConnectToRegistry();

