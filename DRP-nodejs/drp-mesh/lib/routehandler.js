'use strict';

const DRP_Node = require("./node");
const DRP_Endpoint = require("./endpoint");

class DRP_Endpoint_Server extends DRP_Endpoint {
    /**
     * 
     * @param {WebSocket} wsConn Websocket connection
     * @param {DRP_Node} drpNode DRP Node
     * @param {string} endpointID Remote Endpoint ID
     */
    constructor(wsConn, drpNode, endpointID) {
        super(wsConn, drpNode, endpointID);
        let thisEndpoint = this;

        this.RegisterCmd("hello", async function (...args) {
            return drpNode.Hello(...args);
        });
    }

    async OpenHandler(req) {
        let thisEndpoint = this;
    }

    async CloseHandler(closeCode) {
        let thisEndpoint = this;
        thisEndpoint.drpNode.RemoveEndpoint(thisEndpoint, thisEndpoint.closeCallback);
    }

    async ErrorHandler(wsConn, error) {
        this.drpNode.log("Node client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] encountered error [" + error + "]");
    }
}

// Handles incoming DRP connections
class DRP_RouteHandler {
    /**
     * 
     * @param {DRP_Node} drpNode DRP Node Object
     * @param {string} route URL Route
     */
    constructor(drpNode, route) {

        let thisWebServerRoute = this;
        this.wsPingInterval = 10000;
        this.wsPingHistoryLength = 100;
        this.drpNode = drpNode;

        if (drpNode.WebServer && drpNode.WebServer.expressApp && drpNode.WebServer.expressApp.route !== null) {
            // This may be an Express server
            if (typeof drpNode.WebServer.expressApp.ws === "undefined") {
                // Websockets aren't enabled
                throw new Error("Must enable ws on Express server");
            }
        } else {
            // Express server not present
            return;
        }

        drpNode.WebServer.expressApp.ws(route, async function drpWebsocketHandler(wsConn, req) {

            // A new Websocket client has connected - create a DRP_Endpoint and assign the wsConn
            let remoteEndpoint = new DRP_Endpoint_Server(wsConn, drpNode, null);

            await remoteEndpoint.OpenHandler(req);

            wsConn.on("message", function (message) {
                // Process command
                remoteEndpoint.ReceiveMessage(message);
            });

            wsConn.on("pong", function (message) {
                // Received pong; calculate time
                if (wsConn.pingSentTime) {
                    wsConn.pongRecvdTime = new Date().getTime();
                    wsConn.pingTimeMs = wsConn.pongRecvdTime - wsConn.pingSentTime;

                    // Clear values for next run
                    wsConn.pingSentTime = null;
                    wsConn.pongRecvdTime = null;

                    // Track ping history
                    if (wsConn.pingTimes.length >= thisWebServerRoute.wsPingHistoryLength) {
                        wsConn.pingTimes.shift();
                    }
                    wsConn.pingTimes.push(wsConn.pingTimeMs);
                }
            });

            wsConn.on("close", function (closeCode, reason) {
                remoteEndpoint.CloseHandler(closeCode);
                clearInterval(thisRollingPing);
            });

            wsConn.on("error", function (error) {
                remoteEndpoint.ErrorHandler(error);
            });

            // Note connection open time
            wsConn.openTime = new Date().getTime();

            // Set up wsPings tracking values
            wsConn.pingSentTime = null;
            wsConn.pongRecvdTime = null;
            wsConn.pingTimes = [];

            // Set up wsPing Interval
            let thisRollingPing = setInterval(async () => {
                thisWebServerRoute.SendWsPing(wsConn, thisRollingPing);
            }, thisWebServerRoute.wsPingInterval);

            // Run wsPing now to get initial value
            thisWebServerRoute.SendWsPing(wsConn, thisRollingPing);
        });
    }

    SendWsPing(wsConn, intervalObj) {
        let thisWebServerRoute = this;
        //console.dir(wsConn);
        try {
            if (wsConn.pingSentTime) {
                // Did not receive response last interval; enter null value
                if (wsConn.pingTimes.length >= thisWebServerRoute.wsPingHistoryLength) {
                    wsConn.pingTimes.shift();
                }
                wsConn.pingTimes.push(null);

                wsConn.drpEndpoint.drpNode.log(`wsPing timed out to Endpoint ${wsConn.drpEndpoint.EndpointID}`);
            }
            wsConn.pingSentTime = new Date().getTime();
            wsConn.pongRecvdTime = null;
            wsConn.ping();
        } catch (ex) {
            wsConn.drpEndpoint.drpNode.log(`Error sending wsPing to Endpoint ${wsConn.drpEndpoint.EndpointID}: ${ex}`);
        }
    }
}

module.exports = DRP_RouteHandler;