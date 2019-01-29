'use strict';
var drpProvider = require('drp-provider');

//var port = process.env.PORT || 8081;

var providerID = process.argv[2];
if (!providerID) {
    console.error("No ProviderID specified!\n\n> node " + process.argv[1] + " <ProviderID> <listenPort>");
    process.exit(0);
}

var port = process.argv[3];
if (!port) {
    console.error("No listening port specified!\n\n> node " + process.argv[1] + " <ProviderID> <listenPort>");
    process.exit(0);
}

console.log("Loading Provider...");

let providerDeclaration =
    {
        ProviderID: providerID,
        ProviderURL: "ws://localhost:" + port + "/broker",
        Classes: {
            "Person": {
                "Attributes": {
                    "FirstName": "string(128)",
                    "LastName": "string(128)",
                    "EmployeeNumber": "string(128)[PK]<employeeNumber>"
                },
                "Methods": {}
            },
            "FakeData": {
                "Attributes": {
                    "SomeValue": "int"
                },
                "Methods": {}
            }
        },
        Structure: {
            "People": "Person"
        },
        Streams: {
            "dummy": { Class: "FakeData" }
        },
        SomeList: ['a', 'b', 'c']
    };

let myProvider = new drpProvider(port, providerDeclaration, "http://localhost:8080/provider");

// Start sending to dummy topic
setInterval(function () {
    myProvider.TopicManager.SendToTopic("dummy", "Dummy message from Provider[" + providerDeclaration.ProviderID + "]");
}, 3000);
