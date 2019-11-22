'use strict';

const https = require('https');
const bodyParser = require('body-parser');
const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors');
const fs = require('fs');

// Instantiate Express instance
class DRP_WebServer {
    constructor(webServerConfig) {

        // Setup the Express web server
        this.webServerConfig = webServerConfig;

        this.server = null;
        this.expressApp = express();
        this.expressApp.use(cors());

        let wsMaxPayload = 512 * 1024 * 1024;

        // Is SSL enabled?
        if (webServerConfig.SSLEnabled) {
            var optionsExpress = {
                key: fs.readFileSync(webServerConfig.SSLKeyFile),
                cert: fs.readFileSync(webServerConfig.SSLCrtFile),
                passphrase: webServerConfig.SSLCrtFilePwd
            };
            let httpsServer = https.createServer(optionsExpress, this.expressApp);
            expressWs(this.expressApp, httpsServer, { wsOptions: { maxPayload: wsMaxPayload } });
            this.server = httpsServer;

        } else {
            expressWs(this.expressApp, null, { wsOptions: { maxPayload: wsMaxPayload } });
            this.server = this.expressApp;
        }

        this.expressApp.get('env');
        this.expressApp.use(bodyParser.urlencoded({
            extended: true
        }));
        this.expressApp.use(bodyParser.json());
    }

    start() {
        let thiswebServer = this;
        return new Promise(function (resolve, reject) {
            try {
                thiswebServer.server.listen(thiswebServer.webServerConfig.Port, function () {
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    AddRouteHandler(route) {

    }
}

module.exports = DRP_WebServer;