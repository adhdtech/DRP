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
        }
    };

let myProvider = new drpProvider(port, providerDeclaration, "http://localhost:8080/provider");

myProvider.Structure = {
    "People": function (aChildPathArray) {

        // Initial object
        let oCurrentObject = {
            "1001": {
                "FirstName": "Robert",
                "LastName": "Jones",
                "EmployeeNumber": "1001"
            },
            "1002": {
                "FirstName": "Ted",
                "LastName": "Smith",
                "EmployeeNumber": "1002"
            },
            "1003": {
                "FirstName": "John",
                "LastName": "Green",
                "EmployeeNumber": "1003"
            }
        }

        // Return object
        let oReturnObject = myProvider.GetObjFromPath(aChildPathArray, oCurrentObject);

        return oReturnObject;
    }
};

myProvider.BrokerRouteHandler.RegisterCmd("query", function(path, parameters) {
    // Query logic
    let results = null;
    return results;
});

myProvider.BrokerRouteHandler.RegisterCmd("execute", function(path, parameters) {
    // Execute logic
    let results = null;
    // See if object has method; if so, execute
    return results;
});

// Start sending to dummy topic
setInterval(function () {
    let timeStamp = new Date().getTime();
    myProvider.TopicManager.SendToTopic("dummy", timeStamp + " Dummy message from Provider[" + providerDeclaration.ProviderID + "]");
}, 3000);
