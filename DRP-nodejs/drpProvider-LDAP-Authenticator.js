'use strict';
const DRP_Node = require('drp-mesh').Node;
const DRP_LDAP = require('drp-service-ldap');

const os = require("os");

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || null;
let domainKey = process.env.DOMAINKEY || null;
let zoneName = process.env.ZONENAME || "MyZone";
let registryURL = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let testMode = process.env.TESTMODE || false;
let authenticatorService = process.env.AUTHENTICATORSERVICE || null;

// Service specific variables
let ldapURL = process.env.LDAPURL;
let userBase = process.env.USERBASE;
let userContainerType = process.env.USERCONTAINERTYPE || "cn";

// Create Node
console.log(`Starting DRP Node...`);
let roleList = ["Provider"];
let myNode = new DRP_Node(roleList, hostID, null, null, null, null, domainName, domainKey, zoneName, debug, testMode, authenticatorService);

// Test Authentication Service
let myAuthenticator = new DRP_LDAP("LDAPAuthenticator", myNode, ldapURL, userBase, userContainerType, null, null, null);
myNode.AddService(myAuthenticator);

// Connect to Registry manually if no domainName was specified
if (!domainName && registryURL) {
    myNode.ConnectToRegistry(registryURL, async () => {
        myNode.log("Connected to Registry");
    });
}
