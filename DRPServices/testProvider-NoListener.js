'use strict';
var drpService = require('drp-service');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Create a test service to expose
class testService {
	constructor() {
        this.ClientCmds = {
            sayHi: async function () { return { pathItem: "Hello!" }; },
            sayBye: async function () { return { pathItem: "Goodbye..." }; }
        };
	}
}

let providerName = "testProvider1-NoListener";
let registryURL = "ws://localhost:8080/registry";
let proxy = null;

// Load Provider
console.log(`Loading Provider [${providerName}]`);
let myProvider = new drpService.Provider("testProvider1-NoListener");

// Add a test service
myProvider.AddService("TestService", new testService());

// Add a test stream
myProvider.AddStream("dummy", "Test stream");

// Start sending data to dummy topic
setInterval(function () {
	let timeStamp = new Date().getTime();
    myProvider.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + providerName + "]");
}, 3000);

// Connect to Registry
myProvider.ConnectToRegistry(registryURL, proxy);



