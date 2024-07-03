'use strict';

const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const DRP_WebServerConfig = require('drp-mesh').WebServer.DRP_WebServerConfig;
const { DRP_CmdError, DRP_ErrorCode } = require('drp-mesh/lib/packet');
const vdmServer = require('drp-service-rsage').VDM;

const DRP_AuthRequest = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_AuthResponse = require('drp-mesh').Auth.DRP_AuthResponse;
const DRP_Authenticator = require('drp-mesh').Auth.DRP_Authenticator;

const os = require("os");
const fs = require('fs').promises;
const util = require('util');
//const { exec } = require('child_process');
const exec = util.promisify(require('child_process').exec);

require('dotenv').config()

let testConfigFull = `#	DRP Language Independent Node Config
#	------------------------------------
#	- Used by drpLinc.js* to join a DRP Mesh
#	- Allows non-DRP scripts and static data to be called across the mesh
#	- Uses a configuration to declare:
#	- Node settings
#		- Service configurations
#			- Routes to static data
#			- Routes to streams
#			- Client RPC commands
#		- Subscriptions
#
#	(* Need to port from Javascript to Go or another modern language)

# Global Node settings
global
	#hostid	%{HOSTID}					# Override hostname to advertise to mesh
	#domain	foo.local   				# Mesh domain to join
	zone	Test						# Zone this node will be in
    meshkey	%{MESHKEY}					# Use a security key to join the mesh (use ENV variable MESHKEY)
	#mtlscert	idfile.crt				# Use mTLS cert to join the mesh (Not yet implemented)
	#mtlskey	idfile.key
	roles	Provider,Registry,Broker	# Declare one or more node roles [registry,broker,provider,sidecar,consumer]
	ignoresslerrors	yes			    	# Directive to ignore SSL client errors
    debug	yes							# Enable debugging for node
	standalone	yes						# Force standalone mode, no inbound or outbound connections allowed
    #authenticator  SomeAuthSvc         # Force a specific authenticator service for Consumers
    usetestauth yes                     # Enable test authentication (any user pass allowed)
	#registries	ws://somehost1:8080		# Force the use of a fixed set of Registry nodes (comma delimited)

# Web interface required for Registry,Broker roles
webserver
	enable	no
	#bindip	10.0.0.10					# Bind to a specific IP
	port	%{PORT}
	listeningurl	http://%{HOSTID}:%{PORT}	# Use ENV variable HOSTNAME to construct listeningurl
	#certfile	somefile.crt
	#keyfile	somefile.key
	#keypass	supersecretkey				# Password to use encrypted key file if encrypted
	webroot webroot                         # Local filesystem path to VDM UI web root
	vdmappletspath	vdmapplets				# Used by VDM UI to load applets (relative to webroot)
	enablerest	no
	enablevdm	no
	enableswagger	no
    logrest no                              # Should REST calls be sent to a logger?

# Sample service spawns children on demand and sends input via pipe
service TestService1
	scope global
    attribute Description
        type string							# Valid types: string, number, bool, table, function
		value This is a sample service		# Set static value
	attribute Version
		type number
		value 1.2
	attribute TableData1
		type table
		source file somefile.csv			# Get data from this file (must have header row)
		delimiter ','						# Specify delimiter
		headerrow yes						# File has header row
		headers	"col1","col2","col3"		# Set or override headers
		allowgroup "Some LDAP group"
		allowgroup "Another LDAP group"
	attribute SomeRawFile					# Accessing this attribute returns raw file contents
		type string
		source file somefile.csv
	attribute AnotherRawFile				# Accessing this attribute returns raw file contents (explicit cat)
		type string
		exec cat somefile.csv
	attribute CompleteFlag
		type boolean
		source exec cat /path/to/flagfile  # Get data from a function
		exec cat /path/to/flagfile
	clientcmd sayHi
		paramList userName
		exec node sayHi.js *				# Execute command and send parameters in JSON format (modern)
	clientcmd sayBye
		paramList userName
		exec sayBye.py -var1=\${userName}					# Execute command and send single named parameter (legacy)
	stream News
		fifo /path/to/FIFO								# Listen to input from FIFO
	stream Sports
		exec persistentstreamingapp.py %{PARAM}			# Listen to input from persistent process (uses ENV variable PARAM)
	stream CheckIns
		cron "*/5 * * *" scheduledtaskapp.py %{PARAM}	# Listen to input from a job kicked off every 5 minutes (uses ENV variable PARAM)
	healthcheck PersistentCheck
		exec checkservice.py							# Checks the status of the service
	healthcheck ScheduledCheck
		cron "*/5 * * *"  checkservice.py				# Checks the status of the service

# Sample service spawns persistent child
service TestService2
	scope zone
	priority 5
	weight 20
	child node somechild.js								# Client automatically sets attributes, clientcmds and streams
	attribute Version
		exclude											# Do not use attribute from child
	attribute TableData2								# Add/override attribute, presents as array of objects
		table SomeDatabase1.Users
		allowuser "asdf"
	attribute lookupStuff
		paramList userName								# Executes query using parameter 'params.userName'
		query SomeDatabase1 "SELECT * FROM USERS WHERE UserName='\${userName}'"

# Sample service gets config from Service definition file
service TestService3
	config file TestService3.cfg						# TestService1.cfg contains contents similar to other service defs

# Sample service gets config from web path
service TestService4
	config web https://somehost/svccfgpath				# URL contains contents similar to other service defs

# Sample service gets config from db
service TestService5
	config db 											# DB contains contents similar to other service defs
	query LogDB "SELECT * FROM ServiceConfig WHERE Name='TestService5'"

# Set up subscription, write to file
subscribe News
	scope zone
	file newsEvents.json
	rotateSizeMB 10
	rotateMinutes 60
	maxFiles 10

# Set up subscription, write to web service
subscribe Sports
	scope global
	post https://somehost/rest/v1/event
	forwardheaders userid

# Set up subscription, write to database
subscribe Sports
	scope global
	query LogDB "INSERT INTO SomeTable (EventType, TimeStamp, AttendeeCount) VALUES ('\${eventType}', '\${timestamp}', \${attendeeCount})"

# Enable sidecar
sidecar
	enable yes
	bindip 127.0.0.1								# Bind to a specific IP
	port 8080
	listeningurl http://127.0.0.1:8080				# Use static listeningurl
	apikey supersecretkey							# Key the client must use (optional)
	target http://127.0.0.2:80						# Forwards calls to another local host
	forwardheaders *								# Allow all headers to be forwarded
	setheader x-api-key supersecretkey				# Set x-api-key to call another local host

# Configure some databases
db SomeDatabase1
	provider mssql
	host somesqlserver.autozone.com
	defaultdb SomeRandomDB
	user abcdef
	pass blah

db SomeDatabase2
	provider sqlite
	file /path/to/sqlitefile1

db LogDB
	provider sqlite
	file /path/to/sqlitefile2`;

let testConfigProvider = `
# Global Node settings
global
	domain	%DOMAINNAME%  				# Mesh domain to join
	zone	%ZONENAME%					# Zone this node will be in
    meshkey	%MESHKEY%					# Use a security key to join the mesh (use ENV variable MESHKEY)
    registries  %REGISTRYURL%           # Specify a Registry
	roles	Provider                	# Declare one or more node roles [registry,broker,provider,sidecar,consumer]
    debug	yes							# Enable debugging for node

# Sample service spawns children on demand and sends input via pipe
service TestService1
	scope global
	attribute Description               # Accessing this attribute returns raw file contents
		type string
		value This is a test service
	attribute SomeNumber                # Accessing this attribute returns raw file contents
		type number
		value 3.000001
	attribute SomeRawFile               # Accessing this attribute returns raw file contents
		type string
		source file somefile.txt
        preload yes
	attribute SomeObject               # Accessing this attribute returns raw file contents
		type object
		source file package.json
        preload yes
	attribute GetComputername           # Accessing this attribute returns raw file contents
		type string
		source exec echo %COMPUTERNAME%
        preload yes
        trim yes
	clientcmd sayHiSpecifiedUser
		paramList userName
		exec echo Hi, \${userName}		# Execute command using DRP params
	clientcmd sayHiENVUser
		exec echo Hi, %USERNAME%		# Execute command using ENV param
`;

class DRPLinkConfig {
    ParseSection_Global = {
        domain: (data) => {
            // Set domain name
            this.Global.domain = data;
            console.log(`Set global.domain to ${data}`);
        },
        hostid: (data) => {
            // Set hostid
            this.Global.hostid = data;
            console.log(`Set global.hostid to ${data}`);
        },
        zone: (data) => {
            // Set zone name
            this.Global.zone = data;
            console.log(`Set global.zone to ${data}`);
        },
        meshkey: (data) => {
            // Set mesh key
            this.Global.meshkey = data;
            console.log(`Set global.meshkey to ${data}`);
        },
        roles: (data) => {
            // Set roles
            this.Global.roles = data.split(',');
            console.log(`Set global.roles to ${data}`);
        },
        ignoresslerrors: (data) => {
            // Set ignoresslerrors
            this.Global.ignoresslerrors = data;
            console.log(`Set global.ignoresslerrors to ${data}`);
        },
        debug: (data) => {
            // Set debug
            this.Global.debug = data;
            console.log(`Set global.debug to ${data}`);
        },
        standalone: (data) => {
            // Set standalone
            this.Global.standalone = data;
            console.log(`Set global.standalone to ${data}`);
        },
        authenticator: (data) => {
            // Set authenticator
            this.Global.authenticator = data;
            console.log(`Set global.authenticator to ${data}`);
        },
        usetestauth: (data) => {
            // Set usetestauth
            this.Global.usetestauth = data;
            console.log(`Set global.usetestauth to ${data}`);
        },
        registries: (data) => {
            // Set registries
            this.Global.registries = data.split(',');
            console.log(`Set global.registries to ${data}`);
        }
    }
    ParseSection_WebServer = {
        enable: (data) => {
            // Set domain name
            this.WebServer.enable = data;
            console.log(`Set webserver.enable to ${data}`);
        },
        bindip: (data) => {
            // Set domain name
            this.WebServer.bindip = data;
            console.log(`Set webserver.bindip to ${data}`);
        },
        port: (data) => {
            // Set domain name
            this.WebServer.port = data;
            console.log(`Set webserver.port to ${data}`);
        },
        listeningurl: (data) => {
            // Set domain name
            this.WebServer.listeningurl = data;
            console.log(`Set webserver.listeningurl to ${data}`);
        },
        certfile: (data) => {
            // Set domain name
            this.WebServer.certfile = data;
            console.log(`Set webserver.certfile to ${data}`);
        },
        keyfile: (data) => {
            // Set domain name
            this.WebServer.keyfile = data;
            console.log(`Set webserver.keyfile to ${data}`);
        },
        keypass: (data) => {
            // Set domain name
            this.WebServer.keypass = data;
            console.log(`Set webserver.keypass to ${data}`);
        },
        webroot: (data) => {
            // Set domain name
            this.WebServer.webroot = data;
            console.log(`Set webserver.webroot to ${data}`);
        },
        vdmappletspath: (data) => {
            // Set domain name
            this.WebServer.vdmappletspath = data;
            console.log(`Set webserver.vdmappletspath to ${data}`);
        },
        bindip: (data) => {
            // Set domain name
            this.WebServer.bindip = data;
            console.log(`Set webserver.bindip to ${data}`);
        },
        enablerest: (data) => {
            // Set enablerest
            this.WebServer.enablerest = data;
            console.log(`Set webserver.enablerest to ${data}`);
        },
        enablevdm: (data) => {
            // Set enablevdm
            this.WebServer.enablevdm = data;
            console.log(`Set webserver.enablevdm to ${data}`);
        },
        enableswagger: (data) => {
            // Set enableswagger
            this.WebServer.enableswagger = data;
            console.log(`Set webserver.enableswagger to ${data}`);
        },
        logrest: (data) => {
            // Set logrest
            this.WebServer.logrest = data;
            console.log(`Set webserver.logrest to ${data}`);
        }
    }
    ParseSection_Service = {
        scope: (data, childDirectiveObj, sectionTypeTag) => {
            // Set scope
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].scope = data;
            console.log(`Set services[${sectionTypeTag}].scope to ${data}`);
        },
        priority: (data, childDirectiveObj, sectionTypeTag) => {
            // Set priority
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].priority = data;
            console.log(`Set services[${sectionTypeTag}].priority to ${data}`);
        },
        weight: (data, childDirectiveObj, sectionTypeTag) => {
            // Set weight
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].weight = data;
            console.log(`Set services[${sectionTypeTag}].weight to ${data}`);
        },
        child: (data, childDirectiveObj, sectionTypeTag) => {
            // Set child
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].child = data;
            console.log(`Set services[${sectionTypeTag}].child to ${data}`);
        },
        attribute: (data, childDirectiveObj, sectionTypeTag) => {
            // Set attribute
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].attributes[data] = childDirectiveObj;
            console.log(`Set services[${sectionTypeTag}].attributes[${data}] to:`);
            console.dir(childDirectiveObj);
        },
        clientcmd: (data, childDirectiveObj, sectionTypeTag) => {
            // Set clientcmd
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].clientcmds[data] = childDirectiveObj;
            console.log(`Set services[${sectionTypeTag}].clientcmds[${data}] to:`);
            console.dir(childDirectiveObj);
        },
        stream: (data, childDirectiveObj, sectionTypeTag) => {
            // Set stream
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].streams[data] = childDirectiveObj;
            console.log(`Set services[${sectionTypeTag}].streams[${data}] to:`);
            console.dir(childDirectiveObj);
        },
        healthcheck: (data, childDirectiveObj, sectionTypeTag) => {
            // Set healthcheck
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].healthchecks[data] = childDirectiveObj;
            console.log(`Set services[${sectionTypeTag}].healthchecks[${data}] to ${childDirectiveObj}`);
        },
        config: (data, childDirectiveObj, sectionTypeTag) => {
            // Set child
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].config = data;
            console.log(`Set services[${sectionTypeTag}].config to ${data}`);
        },
        query: (data, childDirectiveObj, sectionTypeTag) => {
            // Set query
            this.InitService(sectionTypeTag);
            this.Services[sectionTypeTag].query = data;
            console.log(`Set services[${sectionTypeTag}].query to ${data}`);
        }
    }
    ParseSection_Subscribe = {
        scope: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].scope = data;
            console.log(`Set subscriptions[${sectionTypeTag}].scope to ${data}`);
        },
        file: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].file = data;
            console.log(`Set subscriptions[${sectionTypeTag}].file to ${data}`);
        },
        rotateSizeMB: (data, childDirectiveObj, sectionTypeTag) => {
            // Set rotateSizeMB
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].rotateSizeMB = data;
            console.log(`Set subscriptions[${sectionTypeTag}].rotateSizeMB to ${data}`);
        },
        rotateMinutes: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].rotateMinutes = data;
            console.log(`Set subscriptions[${sectionTypeTag}].rotateMinutes to ${data}`);
        },
        maxFiles: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].maxFiles = data;
            console.log(`Set subscriptions[${sectionTypeTag}].maxFiles to ${data}`);
        },
        post: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].post = data;
            console.log(`Set subscriptions[${sectionTypeTag}].post to ${data}`);
        },
        forwardheaders: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].forwardheaders = data;
            console.log(`Set subscriptions[${sectionTypeTag}].forwardheaders to ${data}`);
        },
        query: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitSubscription(sectionTypeTag);
            this.Subscriptions[sectionTypeTag].query = data;
            console.log(`Set subscriptions[${sectionTypeTag}].query to ${data}`);
        }
    }
    ParseSection_SideCar = {
        enable: (data, childDirectiveObj, sectionTypeTag) => {
            // Set enable
            this.SideCar.enable = data;
            console.log(`Set sidecar.enable to ${data}`);
        },
        bindip: (data, childDirectiveObj, sectionTypeTag) => {
            // Set bindip
            this.SideCar.bindip = data;
            console.log(`Set sidecar.bindip to ${data}`);
        },
        port: (data, childDirectiveObj, sectionTypeTag) => {
            // Set port
            this.SideCar.port = data;
            console.log(`Set sidecar.port to ${data}`);
        },
        listeningurl: (data, childDirectiveObj, sectionTypeTag) => {
            // Set listeningUrl
            this.SideCar.listeningurl = data;
            console.log(`Set sidecar.listeningurl to ${data}`);
        },
        apikey: (data, childDirectiveObj, sectionTypeTag) => {
            // Set apiKey
            this.SideCar.apikey = data;
            console.log(`Set sidecar.apikey to ${data}`);
        },
        target: (data, childDirectiveObj, sectionTypeTag) => {
            // Set target
            this.SideCar.target = data;
            console.log(`Set sidecar.target to ${data}`);
        },
        forwardheaders: (data, childDirectiveObj, sectionTypeTag) => {
            // Set forwardheaders
            this.SideCar.forwardheaders = data;
            console.log(`Set sidecar.forwardheaders to ${data}`);
        },
        setheader: (data, childDirectiveObj, sectionTypeTag) => {
            // Set setheader
            this.SideCar.setheader = data;
            console.log(`Set sidecar.setheader to ${data}`);
        }
    }
    ParseSection_DB = {
        provider: (data, childDirectiveObj, sectionTypeTag) => {
            // Set provider
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].provider = data;
            console.log(`Set DBs[${sectionTypeTag}].provider to ${data}`);
        },
        host: (data, childDirectiveObj, sectionTypeTag) => {
            // Set host
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].host = data;
            console.log(`Set DBs[${sectionTypeTag}].host to ${data}`);
        },
        defaultdb: (data, childDirectiveObj, sectionTypeTag) => {
            // Set defaultdb
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].defaultdb = data;
            console.log(`Set DBs[${sectionTypeTag}].defaultdb to ${data}`);
        },
        user: (data, childDirectiveObj, sectionTypeTag) => {
            // Set user
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].user = data;
            console.log(`Set DBs[${sectionTypeTag}].user to ${data}`);
        },
        pass: (data, childDirectiveObj, sectionTypeTag) => {
            // Set pass
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].pass = data;
            console.log(`Set DBs[${sectionTypeTag}].pass to ${data}`);
        },
        file: (data, childDirectiveObj, sectionTypeTag) => {
            // Set file
            this.InitDB(sectionTypeTag);
            this.DBs[sectionTypeTag].file = data;
            console.log(`Set DBs[${sectionTypeTag}].file to ${data}`);
        }
    }
    SectionParsers = {
        global: this.ParseSection_Global,
        webserver: this.ParseSection_WebServer,
        service: this.ParseSection_Service,
        subscribe: this.ParseSection_Subscribe,
        sidecar: this.ParseSection_SideCar,
        db: this.ParseSection_DB
    }
    constructor(configText) {
        this.Global = {};
        this.WebServer = {};
        /** @type {string, */
        this.Services = {};
        this.Streams = {};
        this.Subscriptions = {};
        this.SideCar = {};
        this.DBs = {};
        this.rawConfig = configText;
        this.ParseConfig(configText);
    }
    ParseConfig(configText) {
        let configRegex = /\w[\w ]+\r?\n+(?:[\t ]+[^\r\n]+\r?\n*)+/gm;
        let sectionText;
        while ((sectionText = configRegex.exec(configText)) !== null) {
            this.ParseSection(sectionText[0]);
        }
    }
    ParseSection(sectionText) {
        let sectionRegex = /(\w[\w ]+)\r?\n+((?:[\t ]+[^\r\n]+\r?\n*)+)/m;
        let headerAndLines = sectionRegex.exec(sectionText);
        let sectionHeader = headerAndLines[1];
        let sectionLines = headerAndLines[2];

        let sectionHeaderMatch = /(\w+)(?: (\w+))?/.exec(sectionHeader);
        if (!sectionHeaderMatch) {
            console.log(`Unrecognized section pattern - ${sectionHeader}`);
            return;
        }

        let sectionType = sectionHeaderMatch[1];
        let sectionTypeTag = sectionHeaderMatch[2];

        if (!this.SectionParsers[sectionType]) {
            console.log(`Unrecognized section type ${sectionType}`)
            return;
        }

        // Split and process lines
        let directiveRegex = /^(?:\t| {4})(\w.+)((?:\r?\n(?:\t\t| {8}).*)+)?/gm;
        let directiveLines;
        while (directiveLines = directiveRegex.exec(sectionLines)) {
            let directiveParentLine = directiveLines[1];
            let directiveChildLinesText = directiveLines[2];

            let directiveParentLineMatch = /(\w+)(?:[ \t]+([^#\r\n]*[\w'"+-{}()%]))?(?:[\t\s]+#.*)?/.exec(directiveParentLine);
            let directiveName = directiveParentLineMatch[1];
            let directiveData = directiveParentLineMatch[2];
            let envVarCheck = null;
            while ((envVarCheck = /%(\w+)%/g.exec(directiveData)) !== null) {
                let newVal = process.env[envVarCheck[1]] || "";
                directiveData = directiveData.replace(`%${envVarCheck[1]}%`, newVal);
            }
            if (!this.SectionParsers[sectionType][directiveName]) {
                console.log(`Unrecognized directive type [${sectionType}] ${directiveName}`)
                continue;
            }
            let childDirectiveObj = {};
            if (directiveChildLinesText) {
                let directiveChildLines = directiveChildLinesText.split(/\r?\n/);
                for (let i = 0; i < directiveChildLines.length; i++) {
                    let directiveChildLine = directiveChildLines[i];
                    let directiveChildLineMatch = /(?:\t\t| {8})(\w+)(?:[ \t]+([^#\r\n]+[\w'"+-{}()*.%]))?(?:[ \t]*#.*)?/.exec(directiveChildLine);
                    if (directiveChildLineMatch) {
                        let childDirectiveName = directiveChildLineMatch[1];
                        let childDirectiveData = directiveChildLineMatch[2];
                        childDirectiveObj[childDirectiveName] = childDirectiveData;
                    }
                }
            } else {
                let bob = 1;
            }
            this.SectionParsers[sectionType][directiveName](directiveData, childDirectiveObj, sectionTypeTag);
        }
    }
    InitService(serviceName) {
        if (!this.Services[serviceName]) {
            this.Services[serviceName] = {
                name: serviceName,
                type: "Linc",
                scope: null,
                priority: null,
                weight: null,
                attributes: {},
                clientcmds: {},
                streams: {},
                healthchecks: {}
            }
        }
    }
    InitSubscription(subscriptionName) {
        if (!this.Subscriptions[subscriptionName]) {
            this.Subscriptions[subscriptionName] = {
                scope: null,
                file: null,
                rotateSizeMB: null,
                rotateMinutes: null,
                maxFiles: null,
                post: null,
                forwardheaders: [],
                query: null
            }
        }
    }
    InitDB(dbName) {
        if (!this.DBs[dbName]) {
            this.DBs[dbName] = {
                provider: null,
                host: null,
                defaultdb: null,
                user: null,
                pass: null,
                file: null
            }
        }
    }
    ConfigCheck() {
        // Analyze config data for startup

        // If this is a Registry or Broker, webserver must be configured as well
    }
    CreateNode() {
        let thisLinkConfig = this;
        let drpWSRoute = '';

        // Set config
        /** @type {DRP_WebServerConfig} */
        let webServerConfig = {
            "ListeningURL": this.WebServer.listeningurl,
            "BindingIP": this.WebServer.bindip || null,
            "Port": this.WebServer.port,
            "SSLEnabled": (this.WebServer.certfile && this.WebServer.keyfile) || false,
            "SSLKeyFile": this.WebServer.keyfile || null,
            "SSLCrtFile": this.WebServer.certfile || null,
            "SSLCrtFilePwd": this.WebServer.keypass || null,
            "WebRoot": this.WebServer.webroot || "webroot"
        };

        // Create Node
        console.log(`Starting DRP Node`);
        let newNode = new DRP_Node(this.Global.roles, this.Global.hostid || os.hostname(), this.Global.domain, this.Global.meshkey, this.Global.zone, webServerConfig, drpWSRoute);
        newNode.Debug = this.Global.debug;
        newNode.AuthenticationServiceName = this.Global.authenticator;
        newNode.RegistryUrl = (this.Global.registries && this.Global.registries.length > 0) ? this.Global.registries[0] : null;
        if (this.Global.usetestauth) {
            // Test Authentication Service
            let myAuthenticator = new DRP_Authenticator("TestAuthenticator", newNode, 10, 10, "global", 1);
            /**
             * Authenticate User
             * @param {DRP_AuthRequest} authRequest Parameters to authentication function
             * @returns {DRP_AuthResponse} Response from authentication function
             */
            myAuthenticator.Authenticate = async function (authRequest) {
                let thisService = this;
                let authResponse = null;
                //console.dir(authRequest);
                if (authRequest.UserName) {
                    // For demo purposes; accept any user/password or token
                    switch (authRequest.UserName) {
                        case 'admin':
                        case 'Admin':
                            authResponse = new DRP_AuthResponse(thisService.GetToken(), authRequest.UserName, "Admin User", ["Admins"], null, thisService.serviceName, thisService.DRPNode.getTimestamp());
                            break;
                        default:
                            authResponse = new DRP_AuthResponse(thisService.GetToken(), authRequest.UserName, "Random User", ["Users"], null, thisService.serviceName, thisService.DRPNode.getTimestamp());
                    }

                    if (thisService.DRPNode.Debug) thisService.DRPNode.log(`Authenticate [${authRequest.UserName}] -> SUCCEEDED`);
                    thisService.DRPNode.TopicManager.SendToTopic("AuthLogs", authResponse);
                    thisService.DRPNode.ServiceCmd("Logger", "writeLog", { serviceName: thisService.serviceName, logData: authResponse }, {
                        sendOnly: true
                    });
                }
                return authResponse;
            };

            newNode.AddService(myAuthenticator);
        }

        if (this.WebServer.enablevdm) {
            // Create VDM Server on node
            let myVDMServer = new vdmServer("VDM", newNode, this.WebServer.webroot, this.WebServer.vdmappletspath, this.WebServer.xrappletspath, null, this.WebServer.vdmtitle);
            newNode.AddService(myVDMServer);
        }

        if (this.WebServer.enablerest) {
            newNode.EnableREST(newNode.WebServer, "/Mesh", "Mesh", newNode.IsTrue(this.WebServer.logrest));
        }

        if (this.WebServer.enableswagger) {
            let DRP_SwaggerUI = require('drp-swaggerui')
            new DRP_SwaggerUI(newNode, '/api-doc');
        }

        if (newNode.ListeningURL) {
            newNode.log(`Listening at: ${newNode.ListeningURL}`);
        }

        newNode.ConnectToMesh(async () => {
            // Do this after connecting to the control plane for the first time

            // Process service definitions
            for (let thisServiceDef of Object.values(thisLinkConfig.Services)) {
                let thisService = new DRP_Service(
                    thisServiceDef.name,
                    newNode,
                    thisServiceDef.type,
                    thisServiceDef.instanceID,
                    thisLinkConfig.IsTrue(thisServiceDef.sticky),
                    thisServiceDef.priority,
                    thisServiceDef.weight,
                    thisLinkConfig.Global.zone,
                    thisServiceDef.scope,
                    thisServiceDef.dependencies,
                    thisServiceDef.streams,
                    1
                );

                // Loop over attributes
                for (let [attrName, attrDef] of Object.entries(thisServiceDef.attributes)) {
                    await thisLinkConfig.ProcessAttribute(thisService, attrName, attrDef)
                }

                // Loop over clientcmds
                for (let [cmdName, cmdDef] of Object.entries(thisServiceDef.clientcmds)) {
                    thisLinkConfig.ProcessClientCmd(thisService, cmdName, cmdDef)
                }

                newNode.AddService(thisService);
            }
        });

        return newNode;
    }
    IsTrue(value) {
        if (typeof (value) === 'string') {
            value = value.trim().toLowerCase();
        }
        switch (value) {
            case true:
            case "true":
            case 1:
            case "1":
            case "on":
            case "y":
            case "yes":
                return true;
            default:
                return false;
        }
    }
    async ProcessAttribute(serviceObj, attrName, attrDef) {
        let thisLinkConfig = this;

        // Determine source of attribute
        if (attrDef.value) {
            serviceObj[attrName] = thisLinkConfig.ProcessValue(attrDef.type, attrDef.value);
        } else if (attrDef.source) {
            let sourceRegex = /^(\S+) (.*)$/m;
            let sourceMatch = sourceRegex.exec(attrDef.source);
            let sourceType = sourceMatch[1];
            let sourceVal = sourceMatch[2];
            let preload = thisLinkConfig.IsTrue(attrDef.preload);
            let trim = thisLinkConfig.IsTrue(attrDef.trim);

            switch (sourceType) {
                case 'file':
                    if (preload) {
                        try {
                            let fileContents = await fs.readFile(sourceVal, 'utf8');
                            serviceObj[attrName] = thisLinkConfig.ProcessValue(attrDef.type, fileContents);
                        } catch (ex) {
                            // Could not read file
                        }
                    } else {
                        serviceObj[attrName] = async () => {
                            let fileContents = await fs.readFile(sourceVal, 'utf8')
                            return thisLinkConfig.ProcessValue(attrDef.type, fileContents);
                        };
                    }
                    break;
                case 'exec':
                    if (preload) {
                        try {
                            let cmdStdOut = (await exec(sourceVal)).stdout;
                            if (trim) {
                                cmdStdOut = cmdStdOut.trim();
                            }
                            serviceObj[attrName] = thisLinkConfig.ProcessValue(attrDef.type, cmdStdOut);
                        } catch (ex) {
                            // Error running command
                        }
                    } else {
                        serviceObj[attrName] = async () => {
                            let cmdStdOut = (await exec(sourceVal)).stdout;
                            if (trim) {
                                cmdStdOut = cmdStdOut.trim();
                            }
                            return thisLinkConfig.ProcessValue(attrDef.type, cmdStdOut);
                        };
                    }
                    break;
                default:
                    console.log(`Attribute '${attrName}' - unrecognized source type: [${sourceType}]`)
                    return;
            }
        }
    }

    ProcessClientCmd(serviceObj, cmdName, cmdDef) {
        let thisLinkConfig = this;

        serviceObj.ClientCmds[cmdName] = async (paramsObj) => {
            let params = {};
            let currentCmdDef = cmdDef.exec;
            if (cmdDef.paramList) {
                // Get parameters
                let paramList = cmdDef.paramList.split(/[\s,]+/);
                params = serviceObj.GetParams(paramsObj, paramList);
            }
            for (let [paramName, paramVal] of Object.entries(params)) {
                currentCmdDef = currentCmdDef.replaceAll(`\${${paramName}}`, paramVal);
            }
            const { stdout, stderr } = await exec(currentCmdDef);
            return stdout;
        };
    }

    ProcessValue(valueType, valueData) {
        let returnValue;
        switch (valueType) {
            case 'string':
                returnValue = valueData;
                break;
            case 'number':
                returnValue = Number.parseFloat(valueData);
                break;
            case 'boolean':
                returnValue = thisLinkConfig.IsTrue(valueData);
                break;
            case 'object':
                returnValue = JSON.parse(valueData);
                break;
        }
        return returnValue;
    }
}

// DRP Linc Daemon Startup
(async () => {
    let configFile = process.argv[2] || process.env['LINCCFG'];
    let configData = null;

    if (!configFile) {
        throw Error("Config file not provided");
    }

    configData = await fs.readFile(configFile, 'utf8');

    //let thisServerConfig = new DRPLinkConfig(testConfigFull);
    let thisServerConfig = new DRPLinkConfig(configData);
    let thisDRPNode = thisServerConfig.CreateNode();
})()


