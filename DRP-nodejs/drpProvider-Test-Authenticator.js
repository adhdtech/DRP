'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_UMLAttribute = require('drp-mesh').UML.Attribute;
const DRP_UMLFunction = require('drp-mesh').UML.Function;
const DRP_UMLClass = require('drp-mesh').UML.Class;
const DRP_AuthRequest = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_AuthResponse = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_Authenticator = require('drp-mesh').Auth.DRP_Authenticator;
const os = require("os");

var port = process.env.PORT || 8080;
let hostname = process.env.HOSTNAME || os.hostname();
let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode, authenticatorService);

// Test Authentication Service
let myAuthenticator = new DRP_Authenticator("TestAuthenticator", myNode, 10, 10, "global", 1);
/**
 * Authenticate User
 * @param {DRP_AuthRequest} authRequest Parameters to authentication function
 * @returns {DRP_AuthResponse} Response from authentication function
 */
myAuthenticator.Authenticate = async function (authRequest) {
    let thisAuthenticator = this;
    let authResponse = null;
    console.dir(authRequest);
    if (authRequest.UserName && authRequest.Password || authRequest.Token) {
        // For demo purposes; accept any user/password or token
        authResponse = new DRP_AuthResponse();
        if (authRequest.UserName) {
            authResponse.UserName = authRequest.UserName;
            authResponse.Token = "ABCD1234";
            authResponse.FullName = "Authenticated User";
            authResponse.Groups = ["Users"];
        } else if (authRequest.Token) {
            authReponse.UserName = "ServiceAccount1";
            authResponse.Token = authRequest.Token;
            authResponse.FullName = "SkyNet";
            authResponse.Groups = ["Services"];
        }
    }
    return authResponse;
};

myNode.AddService(myAuthenticator);

// Connect to Registry manually if no domainName was specified
if (!domainName && registryURL) {
    myNode.ConnectToRegistry(registryURL, async () => {
        myNode.log("Connected to Registry");
    });
}
