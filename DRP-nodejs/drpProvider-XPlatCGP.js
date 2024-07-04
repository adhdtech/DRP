'use strict';

const path = require('path');
const mysql = require('mysql');
const mysql2 = require('mysql2/promise');

const sys = require('sys');
const dgram = require('dgram');

const https = require('https');
const express = require('express');
const expressWs = require('express-ws');

const DRP_Node = require('drp-mesh').Node;
const DRP_Service = require('drp-mesh').Service;
const os = require("os");

require('dotenv').config()

// Create sample service class
class MapService extends DRP_Service {
    constructor(serviceName, drpNode, priority, weight, scope, dbParams) {
        super(serviceName, drpNode, "MapService", null, false, priority, weight, drpNode.Zone, scope, null, ["SampleStream"], 1);
        let thisService = this;

        // Define global methods, called via HTTP POST, URL path or direct RPC call
        // GET https://<brokerURL>/Mesh/Services/<serviceName>/ClientCmds/<methodName>/:param1/:param2/...
        // dsh> exec <serviceName>.<methodName>(:param1,:param2,...)
        this.ClientCmds = {

            // Get parameters from HTTP POST, URL path or direct DRP RPC call
            getWorldDefs: async (paramsObj) => {
                // Get world defs
                let returnObj = await this.GetWorldDefs();
                return returnObj;
            },
            getMaps: async (paramsObj) => {
                let returnObj = await this.GetMaps();
                return returnObj;
            }
            /*
                this.SendTileListToWSClient(conn);
                this.SendMapTypeListToWSClient(conn);
                this.SendMapListToWSClient(conn);
                this.SendNPCListToWSClient(conn);
                console.log("Sent map data.");
                break;
            case 'getPlayer':
                this.SendPlayerToWSClient(conn, message.playerID);
                break;
            case 'updateMapChunk':
                let MapNum = this.GetMapNumForMapID(message.mapID);
                this.mapArray[MapNum].MapData[message.mapY][message.mapX] = message.newValue;
                for (let c = 0; c < this.wsClients.length; c++) {
                    if (conn != this.wsClients[c]) {
                        this.wsClients[c].send(jsonMessage);
                    }
                }
                break;
            case 'removeJump':
                this.RemoveJump(conn, message.mapID, message.mapY, message.mapX);
                break;
            case 'addMapJump':
                this.AddJump(conn, message.mapID, message.mapY, message.mapX, message.targetMapID, message.targetMapY, message.targetMapX);
                break;
            case 'saveMap':
                this.SaveMap(message.mapID);
                break;
            case 'addNewMap':
                this.AddMap(conn, message.mapName, message.mapX, message.mapY, message.mapTypeID);
                break;
            */
        };

        this.sqlConn = mysql2.createPool(dbParams);
    }

    async GetWorldDefs() {
        let thisService = this;
        let worldDefs = {};

        // Get WorldTypes
        let worldQuery = "SELECT * FROM WorldTypes";
        let worldRows = await this.sqlConn.query(worldQuery);

        // Loop over WorldTypes
        for (let thisWorldRow of worldRows[0]) {
            let thisWorldDef = {
                Name: thisWorldRow.WorldTypeName,
                Description: thisWorldRow.Description,
                MapTypes: {}
            }

            // Get MapTypes
            let mapQuery = `SELECT * FROM MapTypes WHERE WorldTypeID = ${thisWorldRow.WorldTypeID}`;
            let mapRows = await this.sqlConn.query(mapQuery);

            // Loop over MapTypes
            for (let thisMapRow of mapRows[0]) {
                let thisMapDef = {
                    MapTypeID: thisMapRow.MapTypeID,
                    Name: thisMapRow.MapTypeName,
                    Description: thisMapRow.Description,
                    WrapAround: thisMapRow.WrapAround,
                    Tiles: {},
                    TileCharMap: {},
                    TileOrder: []
                }

                // Get MapTiles
                let mapTileQuery = `SELECT MTI.WorldType, WT.Description AS WorldDescription, MT.MapTypeName, MT.MapTypeID, MTI.DisplayName AS TileShortDescription, MTI.TileName AS TileDescription, MTA.TileOrder, MTI.ImgFile, MTI.TileChar
FROM MapTypeTileAssoc MTA,
MapTiles MTI,
MapTypes MT,
WorldTypes WT
WHERE MTA.MapTileID = MTI.MapTileID
AND MTA.MapTypeID = MT.MapTypeID
AND WT.WorldTypeID = MT.WorldTypeID
AND MT.MapTypeName = '${thisMapDef.Name}'
ORDER BY MTI.WorldType ASC, MT.MapTypeID ASC, MTA.TileOrder ASC`
                let mapTileRows = await this.sqlConn.query(mapTileQuery);

                // Loop over MapTiles
                for (let thisMapTileRow of mapTileRows[0]) {
                    let thisMapTileDef = {
                        Name: thisMapTileRow.TileShortDescription,
                        Description: thisMapTileRow.TileDescription,
                        Order: thisMapTileRow.TileOrder,
                        ImgFile: thisMapTileRow.ImgFile,
                        Char: thisMapTileRow.TileChar
                    }

                    thisMapDef.Tiles[thisMapTileDef.Name] = thisMapTileDef;
                    thisMapDef.TileCharMap[thisMapTileDef.Char] = thisMapTileDef.Name;
                    thisMapDef.TileOrder[thisMapTileDef.Order] = thisMapTileDef.Name;
                }

                let shortMapTypeName = thisMapDef.Name.substring(4)
                thisWorldDef.MapTypes[shortMapTypeName] = thisMapDef;
            }

            worldDefs[thisWorldDef.Name] = thisWorldDef;
        }

        return worldDefs;
    }

    async GetMaps() {
        // Get MapTypes
        let mapQuery = `SELECT * FROM Maps`;
        let mapRows = await this.sqlConn.query(mapQuery);

        let mapObj = mapRows[0].reduce(function (acc, thisMap) {
            thisMap.MapData = thisMap.MapData.toString().split(/\r?\n/);
            thisMap.MapJumpData = JSON.parse(thisMap.MapJumpData.toString());
            acc[thisMap.MapID] = thisMap;
            return acc;
        }, {});

        // Return Maps
        return mapObj;
    }
}

class PlayerObject {
    constructor() {
        this.Active = 0;
        this.PlayerID = 0;
        this.PlayerName = '';
        this.PlayerPass = '';
        this.MapID = 0;
        this.xPos = 0;
        this.yPos = 0;
        this.MapNum = 0;
        this.MapBufRows = 0;
        this.MapBufCols = 0;
        this.HP = 0;
        this.MP = 0;
        this.ClientIP = '';
        this.ClientPort = '';
    }
}

class NPCObject {
    constructor() {
        this.NPCID = 0;
        this.Description = '';
        this.CharTypeID = 0;
        this.MapID = 0;
        this.MapNum = 0;
        this.xPos = 0;
        this.yPos = 0;
        this.Direction = 0;
        this.Mobile = 0;
    }
}

class TileObject {
    constructor() {
        this.DisplayName = '';
        this.ImgFile = '';
        this.TileChar = '';
    }
}

class MapTypeObject {
    constructor() {
        this.MapTypeID = 0;
        this.Description = '';
        this.WorldTypeID = 0;
        this.WrapAround = 0;
    }
};

class MapObject {
    constructor() {
        this.Active = 0;
        this.MapID = 0;
        this.MapName = '<none>';
        this.MapWidth = 0;
        this.MapHeight = 0;
        this.MapTypeID = 0;
        this.WrapAround = 0;
        this.ParentMapID = 0;
        this.ParentMapX = 0;
        this.ParentMapY = 0;
        this.FillTile = '';
        this.Song = 0;
        this.MapData = [];
        this.MapJumpCount = 0;
        this.MapJumpData = [];

        for (let loopY = 0; loopY < 256; loopY++) {
            this.MapData[loopY] = [];
            for (let loopX = 0; loopX < 256; loopX++) {
                this.MapData[loopY][loopX] = 32;
            }
        }
    }
}

class MapJumpObject {
    constructor() {
        this.MapJumpX = 0;
        this.MapJumpY = 0;
        this.TargetMapID = 0;
        this.TargetMapX = 0;
        this.TargetMapY = 0;
    }
}

class XPlatCGPServer {
    constructor() {
        this.mapArray = [];
        this.mapTypeArray = [];
        this.playerArray = [];
        this.npcArray = [];
        this.tileArray = [];
        this.send_data = [];
        this.wsClients = [];
        this.cgpClients = [];
        this.authTokens = [];
        this.mapArrayLoaded = 0;
        this.mapTypeArrayLoaded = 0;
        this.playerArrayLoaded = 0;
        this.tileArrayLoaded = 0;
        this.wsPort = 0;
        this.cgpPort = 0;
        this.sqlAuth = [];
        this.sqlconn = null;
        this.cgpServer = null;
        this.wsServer = null;
    }

    GetMapNumForMapID(mapID) {
        let rtnMapIndex = 0;
        for (let tmpMapIndex = 0; tmpMapIndex < this.mapArray.length; tmpMapIndex++) {
            if (this.mapArray[tmpMapIndex].MapID == mapID) {
                rtnMapIndex = tmpMapIndex;
                break;
            }
        }
        return rtnMapIndex;
    }

    GetPlayerNumForPlayerID(playerID) {
        let rtnPlayerIndex = 0;
        for (let tmpPlayerIndex = 0; tmpPlayerIndex < this.playerArray.length; tmpPlayerIndex++) {
            if (this.playerArray[tmpPlayerIndex].PlayerID === playerID) {
                rtnPlayerIndex = tmpPlayerIndex;
                break;
            }
        }
        return rtnPlayerIndex;
    }

    CheckPlayerArrayConnection(checkIP, checkPort) {
        let rtnPlayerID = 0;
        for (let p = 0; p < this.playerArray.length; p++) {
            if ((this.playerArray[p].ClientIP === checkIP) && (this.playerArray[p].ClientPort === checkPort)) {
                rtnPlayerID = this.playerArray[p].PlayerID;
            }
        }
        return rtnPlayerID;
    }

    CheckPlayerArrayCredentials(checkName, checkPass) {
        let rtnPlayerID = 0;
        for (let p = 0; p < this.playerArray.length; p++) {
            //    console.log("Comparing [" + playerArray[p].PlayerName + "] to [" + checkName+ "]" +
            //    " and [" + playerArray[p].PlayerPass + "] to [" + checkPass + "]");
            if ((this.playerArray[p].PlayerName === checkName) && (this.playerArray[p].PlayerPass === checkPass)) {
                //      console.log("Matched PlayerID " );
                rtnPlayerID = this.playerArray[p].PlayerID;
            }
        }
        return rtnPlayerID;
    }

    DisplayLoadedMaps() {
        // console.log('');
        for (let i = 0; i < this.mapArray.length; i++) {
            console.log('mapArray[' + i + '] MapID ' + this.mapArray[i].MapID + ' ' + this.mapArray[i].MapName + ' X,Y = ' + this.mapArray[i].MapWidth + ',' + this.mapArray[i].MapHeight);
        }
        console.log('');
    }

    DisplayLoadedPlayers() {
        for (let p = 0; p < this.playerArray.length; p++) {
            let MapName = '';
            if (this.playerArray[p].MapID) {
                MapName = this.mapArray[this.GetMapNumForMapID(this.playerArray[p].MapID)].MapName;
            }
            console.log('playerArray[' + p + '] PlayerID ' + this.playerArray[p].PlayerID + ' ' + this.playerArray[p].PlayerName + ' "' + MapName + '" X,Y = ' + this.playerArray[p].xPos + ',' + this.playerArray[p].yPos + ' @' + this.playerArray[p].ClientIP + ':' + this.playerArray[p].ClientPort);
        }
        console.log('');
    }

    DisplayLoadedNPCs() {
        for (let p = 0; p < this.npcArray.length; p++) {
            let MapName = '';
            if (this.npcArray[p].MapID) {
                MapName = this.mapArray[this.GetMapNumForMapID(this.npcArray[p].MapID)].MapName;
            }
            console.log('npcArray[' + p + '] NPCID ' + this.npcArray[p].NPCID + ' ' + this.npcArray[p].Description + ' "' + MapName + '" X,Y = ' + this.npcArray[p].xPos + ',' + this.npcArray[p].yPos);
        }
        console.log('');
    }

    LoadTiles() {
        let thisXCS = this;
        thisXCS.tileArrayLoaded = 0;
        thisXCS.tileArray = [];
        let sqlQuery = "SELECT MTTA.MapTypeID, MTTA.TileOrder, MT.DisplayName, MT.ImgFile, MT.TileChar"
            + " FROM XPlatCGP.MapTiles MT, XPlatCGP.MapTypeTileAssoc MTTA"
            + " WHERE MTTA.MapTileID = MT.MapTileID"
            + " ORDER BY MTTA.MapTypeID, MTTA.TileOrder ASC";
        thisXCS.sqlconn.query(sqlQuery, function (err, rows) {
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                // Populate tile array
                let mapTypeIndex = 0;
                let mapTileIndex = 0;
                let lastMapTypeID = 0;
                let totalTiles = 0;
                for (let record = 0; record < rows.length; record++) {
                    let MapTypeID = rows[record].MapTypeID;
                    let TileOrder = rows[record].TileOrder;
                    if (MapTypeID !== lastMapTypeID) {
                        //if (typeof thisXCS.tileArray[MapTypeID] === 'undefined') {
                        //if (!this.tileArray[MapTypeID]) {
                        lastMapTypeID = MapTypeID;
                        if (totalTiles) {
                            mapTypeIndex++;
                        }
                        mapTileIndex = 0;
                        thisXCS.tileArray[mapTypeIndex] = [];
                        for (let i = 0; i < thisXCS.mapArray.length; i++) {
                            if (thisXCS.mapArray[i].MapTypeID === rows[record].MapTypeID) {
                                thisXCS.mapArray[i].TileArrayIndex = mapTypeIndex;
                                //console.log("Tile Array [" + mapTypeIndex + "] = Map [" + i + "]");
                            }
                        }
                    }
                    //console.log("TileArray[" + mapTypeIndex + "][" + mapTileIndex + "] " + rows[record].DisplayName);
                    thisXCS.tileArray[mapTypeIndex][mapTileIndex] = new TileObject();
                    thisXCS.tileArray[mapTypeIndex][mapTileIndex].DisplayName = rows[record].DisplayName;
                    thisXCS.tileArray[mapTypeIndex][mapTileIndex].ImgFile = rows[record].ImgFile;
                    thisXCS.tileArray[mapTypeIndex][mapTileIndex].TileChar = rows[record].TileChar;
                    totalTiles++;
                    mapTileIndex++;
                }
                //for (j=0; j<thisXCS.tileArray.length; j++) {
                //  console.log("TileArray[" + j + "].length = " + thisXCS.tileArray[j].length);
                //  for (k=0; k<thisXCS.tileArray[j].length; k++) {
                //    console.log("  [" + k + "].DisplayName = " + thisXCS.tileArray[j][k].DisplayName);
                //  }
                //}
                thisXCS.tileArrayLoaded = 1;
            }
        });
    }

    LoadMapTypes() {
        let thisXCS = this;
        thisXCS.mapTypeArrayLoaded = 0;
        thisXCS.mapTypeArray = [];
        let sqlQuery = "SELECT MTY.MapTypeID, MTY.Description, MTY.WorldTypeID, MTY.WrapAround"
            + " FROM XPlatCGP.MapTypes MTY"
            + " ORDER BY MTY.MapTypeID ASC";
        thisXCS.sqlconn.query(sqlQuery, function (err, rows) {
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                // Populate map type array
                for (let record = 0; record < rows.length; record++) {
                    thisXCS.mapTypeArray[record] = new MapTypeObject();
                    thisXCS.mapTypeArray[record].MapTypeID = rows[record].MapTypeID;
                    thisXCS.mapTypeArray[record].Description = rows[record].Description;
                    thisXCS.mapTypeArray[record].WorldTypeID = rows[record].WorldTypeID;
                    thisXCS.mapTypeArray[record].WrapAround = rows[record].WrapAround;

                    for (let t = 0; t < thisXCS.mapArray.length; t++) {
                        if (thisXCS.mapArray[t].MapTypeID === thisXCS.mapTypeArray[record].MapTypeID) {
                            thisXCS.mapArray[t].WrapAround = thisXCS.mapTypeArray[record].WrapAround;
                        }
                    }
                }
                thisXCS.mapTypeArrayLoaded = 1;
            }
        });
    }

    LoadMaps() {
        let thisXCS = this;
        thisXCS.mapArrayLoaded = 0;
        thisXCS.mapArray = [];
        thisXCS.sqlconn.query("SELECT MapID, MapName, MapX, MapY, ParentMapID, ParentMapX, ParentMapY, MapTypeID, FillTile, Song, MapData, MapJumpData, MapJumpCount FROM Maps ORDER BY MapID ASC", function (err, rows) {

            // There was a error or not?
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                for (let record = 0; record < rows.length; record++) {
                    thisXCS.mapArray[record] = new MapObject();
                    thisXCS.mapArray[record].MapID = rows[record].MapID;
                    thisXCS.mapArray[record].MapName = rows[record].MapName;
                    thisXCS.mapArray[record].MapWidth = rows[record].MapX;
                    thisXCS.mapArray[record].MapHeight = rows[record].MapY;
                    thisXCS.mapArray[record].ParentMapID = rows[record].ParentMapID;
                    thisXCS.mapArray[record].ParentMapX = rows[record].ParentMapX;
                    thisXCS.mapArray[record].ParentMapY = rows[record].ParentMapY;
                    thisXCS.mapArray[record].FillTile = rows[record].FillTile;
                    thisXCS.mapArray[record].Song = rows[record].Song;
                    thisXCS.mapArray[record].MapTypeID = rows[record].MapTypeID;
                    thisXCS.mapArray[record].MapJumpData = JSON.parse(rows[record].MapJumpData);
                    thisXCS.mapArray[record].MapJumpCount = rows[record].MapJumpCount;
                    thisXCS.mapArray[record].TileArrayIndex = 0;
                    //        MapData = MapData.replace(/[\r\n]/g, "");

                    let byteCounter = 0;
                    for (let loopY = 0; loopY < thisXCS.mapArray[record].MapHeight; loopY++) {
                        for (let loopX = 0; loopX < thisXCS.mapArray[record].MapWidth; loopX++) {
                            //              let mapTileCode = mapRawData.charCodeAt(byteCounter);
                            while (rows[record].MapData[byteCounter] === 10 || rows[record].MapData[byteCounter] === 13) {
                                byteCounter++;
                            }
                            thisXCS.mapArray[record].MapData[loopY][loopX] = rows[record].MapData[byteCounter];
                            byteCounter++;
                        }
                        //          console.log('START' + mapArray[record].MapData[i] + 'END');
                    }
                }
                //      LoadMapJumps();
                thisXCS.mapArrayLoaded = 1;
                thisXCS.LoadTiles();
                thisXCS.LoadMapTypes();
                thisXCS.DisplayLoadedMaps();
            }
        });
    }

    LoadPlayers() {
        let thisXCS = this;
        thisXCS.playerArrayLoaded = 0;
        thisXCS.playerArray = [];
        thisXCS.sqlconn.query("SELECT PlayerID, PlayerName, PlayerPassword, LastMapID, LastMapX, LastMapY, HP, MP, EXP FROM Players", function (err, rows) {

            // There was a error or not?
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                for (let record = 0; record < rows.length; record++) {
                    thisXCS.playerArray[record] = new PlayerObject();
                    thisXCS.playerArray[record].PlayerID = rows[record].PlayerID;
                    thisXCS.playerArray[record].PlayerName = rows[record].PlayerName;
                    thisXCS.playerArray[record].PlayerPass = rows[record].PlayerPassword;
                    thisXCS.playerArray[record].MapID = rows[record].LastMapID;
                    thisXCS.playerArray[record].MapNum = thisXCS.GetMapNumForMapID(thisXCS.playerArray[record].MapID);
                    thisXCS.playerArray[record].xPos = rows[record].LastMapX;
                    thisXCS.playerArray[record].yPos = rows[record].LastMapY;
                }
                thisXCS.playerArrayLoaded = 1;
                thisXCS.DisplayLoadedPlayers();
            }
        });
    }

    LoadNPCs() {
        let thisXCS = this;
        thisXCS.npcArrayLoaded = 0;
        thisXCS.npcArray = [];
        thisXCS.sqlconn.query("SELECT NPCID, Description, CharTypeID, MapID, MapStartX, MapStartY, MapStartDirection, Mobile FROM NPCs", function (err, rows) {

            // There was a error or not?
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                for (let record = 0; record < rows.length; record++) {
                    thisXCS.npcArray[record] = new NPCObject();
                    thisXCS.npcArray[record].NPCID = rows[record].NPCID;
                    thisXCS.npcArray[record].Description = rows[record].Description;
                    thisXCS.npcArray[record].CharTypeID = rows[record].CharTypeID;
                    thisXCS.npcArray[record].MapID = rows[record].MapID;
                    thisXCS.npcArray[record].MapNum = thisXCS.GetMapNumForMapID(thisXCS.npcArray[record].MapID);
                    thisXCS.npcArray[record].xPos = rows[record].MapStartX;
                    thisXCS.npcArray[record].yPos = rows[record].MapStartY;
                    thisXCS.npcArray[record].Direction = rows[record].MapStartDirection;
                    thisXCS.npcArray[record].Mobile = rows[record].Mobile;
                }
                thisXCS.npcArrayLoaded = 1;
                thisXCS.DisplayLoadedNPCs();
            }
        });
    }

    ProcessCGPCommands(playerNum, cgpData, cgpDataLen) {
        let bytes_read_cur = 0;
        let cmdLen = 0;
        let cmdType = 0;
        let cmdData = [];

        console.log('Processing CGP commands...');

        while (bytes_read_cur < cgpDataLen) {
            cmdLen = cgpData[0 + bytes_read_cur] << 8 | cgpData[1 + bytes_read_cur];
            cmdType = cgpData[2 + bytes_read_cur];
            for (let d = 0; d < cmdLen; d++) {
                cmdData[d] = cgpData[3 + bytes_read_cur + d];
            }
            this.ExecuteCGP(playerNum, cmdLen, cmdType, cmdData);
            bytes_read_cur += (cmdLen + 2);
        }
    }

    GetMapData(playerNum, screenRow, Orientation) {
        let xCoord = 0;
        let yCoord = 0;
        let tmpX = 0;
        let tmpY = 0;
        let tmpX2 = 0;
        let tmpY2 = 0;
        let forLimit = 0;

        let mapNum = this.playerArray[playerNum].MapNum;
        let wrapAround = this.mapArray[mapNum].WrapAround;

        xCoord = this.playerArray[playerNum].xPos - (this.playerArray[playerNum].MapBufRows / 2);
        if (wrapAround && xCoord >= this.mapArray[mapNum].MapWidth) {
            xCoord = (this.mapArray[mapNum].MapWidth - (0xFF - xCoord + 1));
        }
        if (wrapAround && xCoord < 0) {
            xCoord += this.mapArray[mapNum].MapWidth;
        }

        yCoord = this.playerArray[playerNum].yPos - (this.playerArray[playerNum].MapBufCols / 2);
        if (wrapAround && yCoord >= this.mapArray[mapNum].MapHeight) {
            yCoord = (this.mapArray[mapNum].MapHeight - (0xFF - yCoord + 1));
        }
        if (wrapAround && yCoord < 0) {
            yCoord += this.mapArray[mapNum].MapHeight;
        }

        //  printf("\t\t\tGot yCoord %u, xCoord %u, screenRow %u...\n", yCoord, xCoord, screenRow);

        if (Orientation === 1) {
            // Get Row
            yCoord += screenRow;
            forLimit = this.playerArray[playerNum].MapBufRows;
            if (wrapAround && yCoord >= this.mapArray[mapNum].MapHeight) {
                yCoord -= this.mapArray[mapNum].MapHeight;
            }
            if (wrapAround && yCoord < 0) {
                yCoord += this.mapArray[mapNum].MapHeight;
            }
        } else {
            // Get Column
            xCoord += screenRow;
            forLimit = this.playerArray[playerNum].MapBufCols;
            if (wrapAround && xCoord >= this.mapArray[mapNum].MapWidth) {
                xCoord -= this.mapArray[mapNum].MapWidth;
            }
            if (wrapAround && xCoord < 0) {
                xCoord += this.mapArray[mapNum].MapWidth;
            }
        }

        this.send_data[0] = yCoord;
        this.send_data[1] = xCoord;
        let outString = [];

        outString += " ";
        outString += this.send_data[0].toString();

        outString += " ";
        outString += this.send_data[1].toString();

        console.log("Getting MapNum [" + mapNum + "] row starting " + xCoord + "," + yCoord);
        for (let i = 0; i < forLimit; i++) {

            if (Orientation === 1) {
                if (xCoord >= 0 && xCoord < this.mapArray[mapNum].MapWidth && yCoord >= 0 && yCoord < this.mapArray[mapNum].MapHeight) {
                    this.send_data[i + 2] = this.mapArray[mapNum].MapData[yCoord][xCoord];
                } else {
                    this.send_data[i + 2] = this.mapArray[mapNum].FillTile.charCodeAt();
                }
                //          printf("%c",mapArray[mapNum].MapData[yCoord][xCoord]);
                outString += " ";
                outString += this.send_data[i + 2].toString();

                xCoord++;
                if (wrapAround && xCoord >= this.mapArray[mapNum].MapWidth) {
                    xCoord = 0;
                }

            } else {
                if (xCoord >= 0 && xCoord < this.mapArray[mapNum].MapWidth && yCoord >= 0 && yCoord < this.mapArray[mapNum].MapHeight) {
                    this.send_data[i + 2] = this.mapArray[mapNum].MapData[yCoord][xCoord];
                } else {
                    this.send_data[i + 2] = this.mapArray[mapNum].FillTile.charCodeAt();
                }
                //          printf("%c",mapArray[mapNum].MapData[yCoord][xCoord]);
                outString += " ";
                outString += this.send_data[i + 2].toString();

                yCoord++;
                if (wrapAround && yCoord >= this.mapArray[mapNum].MapHeight) {
                    yCoord = 0;
                }
            }
        }
        //console.log("{" + outString + "}");
    }

    ExecuteCGP(playerNum, cmdLen, cgpCmdType, cmdData) {
        console.log("\tCmdLen " + cmdLen + ", CmdType " + cgpCmdType);

        let i2 = 0;
        let send_cgp = new Buffer(2048);
        let send_cgp_count = 0;
        let MapNum = this.playerArray[playerNum].MapNum;
        let jumpToMapID = 0;
        let jumpToMapX = 0;
        let jumpToMapY = 0;
        let justMoved = 0;

        switch (String.fromCharCode(cgpCmdType)) {
            case 'u':
                // User moved up
                if (this.playerArray[playerNum].yPos == 0 && this.mapArray[MapNum].ParentMapID) {
                    jumpToMapID = this.mapArray[MapNum].ParentMapID;
                    jumpToMapX = this.mapArray[MapNum].ParentMapX;
                    jumpToMapY = this.mapArray[MapNum].ParentMapY;
                    break;
                }
                justMoved = 1;
                this.playerArray[playerNum].yPos--;
                if (this.playerArray[playerNum].yPos >= this.mapArray[MapNum].MapHeight) {
                    this.playerArray[playerNum].yPos = this.mapArray[MapNum].MapHeight - 1;
                }
                if (this.playerArray[playerNum].yPos < 0) {
                    this.playerArray[playerNum].yPos = this.mapArray[MapNum].MapHeight - 1;
                }

                send_cgp[send_cgp_count] = 0x07;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x43;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].xPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].yPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapHeight & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufRows) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                }
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapWidth & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufCols) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                }
                send_cgp_count++;

                //            getMapData (numMaps, this.mapArray, MapNum, numPlayers, playerArray, playerNum, this.send_data, 0, 0, 1);
                this.GetMapData(playerNum, 0, 1);

                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols + 3;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x41;
                send_cgp_count++;
                for (i2 = 0; i2 < this.playerArray[playerNum].MapBufCols + 2; i2++) {
                    send_cgp[send_cgp_count] = this.send_data[i2];
                    send_cgp_count++;
                }
                console.log("Processed UP command\n");
                break;
            case 'd':
                // User moved down
                if (this.playerArray[playerNum].yPos == (this.mapArray[MapNum].MapHeight - 1) && this.mapArray[MapNum].ParentMapID) {
                    jumpToMapID = this.mapArray[MapNum].ParentMapID;
                    jumpToMapX = this.mapArray[MapNum].ParentMapX;
                    jumpToMapY = this.mapArray[MapNum].ParentMapY;
                    break;
                }
                justMoved = 1;
                this.playerArray[playerNum].yPos++;
                if (this.playerArray[playerNum].yPos >= this.mapArray[MapNum].MapHeight) {
                    this.playerArray[playerNum].yPos = 0;
                }

                send_cgp[send_cgp_count] = 0x07;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x43;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].xPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].yPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapHeight & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufRows) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                }
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapWidth & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufCols) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                }
                send_cgp_count++;

                //            getMapData (numMaps, this.mapArray, MapNum, numPlayers, this.playerArray, playerNum, this.send_data, 0, (this.playerArray[playerNum].MapBufRows - 1), 1);
                this.GetMapData(playerNum, (this.playerArray[playerNum].MapBufRows - 1), 1);

                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols + 3;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x41;
                send_cgp_count++;
                for (i2 = 0; i2 < this.playerArray[playerNum].MapBufCols + 2; i2++) {
                    send_cgp[send_cgp_count] = this.send_data[i2];
                    send_cgp_count++;
                }
                console.log("Processed DOWN command\n");
                break;
            case 'l':
                // User moved left
                if (this.playerArray[playerNum].xPos == 0 && this.mapArray[MapNum].ParentMapID) {
                    jumpToMapID = this.mapArray[MapNum].ParentMapID;
                    jumpToMapX = this.mapArray[MapNum].ParentMapX;
                    jumpToMapY = this.mapArray[MapNum].ParentMapY;
                    break;
                }
                justMoved = 1;
                this.playerArray[playerNum].xPos--;
                if (this.playerArray[playerNum].xPos >= this.mapArray[MapNum].MapWidth) {
                    this.playerArray[playerNum].xPos = this.mapArray[MapNum].MapWidth - 1;
                }
                if (this.playerArray[playerNum].xPos < 0) {
                    this.playerArray[playerNum].xPos = this.mapArray[MapNum].MapWidth - 1;
                }

                send_cgp[send_cgp_count] = 0x07;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x43;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].xPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].yPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapHeight & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufRows) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                }
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapWidth & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufCols) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                }
                send_cgp_count++;

                //            getMapData (numMaps, this.mapArray, MapNum, numPlayers, this.playerArray, playerNum, this.send_data, 0, 0, 0);
                this.GetMapData(playerNum, 0, 0);

                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols + 3;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x42;
                send_cgp_count++;
                for (i2 = 0; i2 < this.playerArray[playerNum].MapBufCols + 2; i2++) {
                    send_cgp[send_cgp_count] = this.send_data[i2];
                    send_cgp_count++;
                }
                console.log("Processed LEFT command\n");
                break;
            case 'r':
                // User moved right
                if (this.playerArray[playerNum].xPos == (this.mapArray[MapNum].MapWidth - 1) && this.mapArray[MapNum].ParentMapID) {
                    jumpToMapID = this.mapArray[MapNum].ParentMapID;
                    jumpToMapX = this.mapArray[MapNum].ParentMapX;
                    jumpToMapY = this.mapArray[MapNum].ParentMapY;
                    break;
                }
                justMoved = 1;
                this.playerArray[playerNum].xPos++;
                if (this.playerArray[playerNum].xPos >= this.mapArray[MapNum].MapWidth) {
                    this.playerArray[playerNum].xPos = 0;
                }

                send_cgp[send_cgp_count] = 0x07;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x43;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].xPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].yPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapHeight & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufRows) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                }
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapWidth & 0xFF;
                if (send_cgp[send_cgp_count] < this.playerArray[playerNum].MapBufCols) {
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                }
                send_cgp_count++;

                //            getMapData (numMaps, this.mapArray, MapNum, numPlayers, this.playerArray, playerNum, this.send_data, 0, (this.playerArray[playerNum].MapBufCols - 1), 0);
                this.GetMapData(playerNum, (this.playerArray[playerNum].MapBufCols - 1), 0);

                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols + 3;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x42;
                send_cgp_count++;
                for (i2 = 0; i2 < this.playerArray[playerNum].MapBufCols + 2; i2++) {
                    send_cgp[send_cgp_count] = this.send_data[i2];
                    send_cgp_count++;
                }

                console.log("Processed RIGHT command\n");
                break;
            case 'j':
                send_cgp[send_cgp_count] = 0x01;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x44;
                send_cgp_count++;
                break;
            case 's':
                // User started

                // Next send a position command
                send_cgp[send_cgp_count] = 0x09;
                send_cgp_count++;
                send_cgp[send_cgp_count] = 0x43;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].xPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].yPos;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufCols;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapHeight & 0xFF;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapWidth & 0xFF;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].MapTypeID;
                send_cgp_count++;
                send_cgp[send_cgp_count] = this.mapArray[MapNum].Song;
                send_cgp_count++;

                console.log("\t\tProcessing START command - this.playerArray[" + playerNum + "].MapNum = " + MapNum);
                console.log("\t\tMapTypeID = {" + this.mapArray[MapNum].MapTypeID + "}");
                //            console.log("\t\tProcessing START command - this.playerArray[" + playerNum + "].MapNum = " + MapNum + ", type = '" + this.mapArray[MapNum].MapTypeID & 0xFF + "'");

                // Now start pulling map row data
                for (let tmpRowCount = 0; tmpRowCount < this.playerArray[playerNum].MapBufRows; tmpRowCount++) {
                    //                getMapData (numMaps, this.mapArray, MapNum, numPlayers, this.playerArray, playerNum, this.send_data, 0, tmpRowCount, 1);
                    this.GetMapData(playerNum, tmpRowCount, 1);
                    send_cgp[send_cgp_count] = this.playerArray[playerNum].MapBufRows + 3;
                    send_cgp_count++;
                    send_cgp[send_cgp_count] = 0x41;
                    send_cgp_count++;
                    for (i2 = 0; i2 < this.playerArray[playerNum].MapBufRows + 2; i2++) {
                        send_cgp[send_cgp_count] = this.send_data[i2];
                        send_cgp_count++;
                    }
                }
                console.log("Processed START command");
                break;
            case 'p':
                this.send_data[0] = this.playerArray[playerNum].xPos;
                this.send_data[1] = this.playerArray[playerNum].yPos;
                this.send_data[2] = this.playerArray[playerNum].MapBufRows;
                this.send_data[3] = this.playerArray[playerNum].MapBufCols;
                this.send_data[4] = '\0';
                break;
            case 'm':
                // This is a dummy command, sent to get initial position data
                break;
            case 'q':
                // Player quit - remove ClientConnection
                this.playerArray[playerNum].Active = 0;
                break;

            default:
            //            printf("Unknown command!\n");

        }

        if (justMoved) {
            for (let m = 0; m < this.mapArray[MapNum].MapJumpData.length; m++) {
                if ((this.playerArray[playerNum].yPos == this.mapArray[MapNum].MapJumpData[m].MapJumpY) && (this.playerArray[playerNum].xPos == this.mapArray[MapNum].MapJumpData[m].MapJumpX)) {
                    jumpToMapID = this.mapArray[MapNum].MapJumpData[m].TargetMapID;
                    jumpToMapX = this.mapArray[MapNum].MapJumpData[m].TargetMapX;
                    jumpToMapY = this.mapArray[MapNum].MapJumpData[m].TargetMapY;
                }
            }
        }

        if (jumpToMapID) {
            if (this.playerArray[playerNum].MapID != jumpToMapID) {
                this.playerArray[playerNum].MapID = jumpToMapID;
                this.playerArray[playerNum].MapNum = this.GetMapNumForMapID(this.playerArray[playerNum].MapID);
            }
            this.playerArray[playerNum].yPos = jumpToMapY;
            this.playerArray[playerNum].xPos = jumpToMapX;

            jumpToMapID = 0;
            jumpToMapX = 0;
            jumpToMapY = 0;

            send_cgp_count = 0;

            // Send Jump Command
            this.ExecuteCGP(playerNum, 1, 0x6a, this.send_data);

            // Send Start Command
            this.ExecuteCGP(playerNum, 1, 0x73, this.send_data);
            //} else {
            //    console.log("Jump " + this.mapArray[MapNum].MapJumpData[m].MapJumpX + "," + this.mapArray[MapNum].MapJumpData[m].MapJumpY + " != " + this.playerArray[playerNum].xPos + "," + this.playerArray[playerNum].yPos);
            //}
        }

        if (send_cgp_count) {
            let outString = String;

            this.cgpServer.send(send_cgp, 0, send_cgp_count, this.playerArray[playerNum].ClientPort, this.playerArray[playerNum].ClientIP);

            //printf("\nSent %u bytes to playerNum key: %d | Active: %d | Player key: %d | IP: %s Port: %d | MEM: %u\n", send_cgp_count, playerNum, this.playerArray[playerNum].Active, playerArray[playerNum].PlayerID, inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port), (struct sockaddr *) &client_addr);

            console.log("Sent " + send_cgp_count + " bytes to " + this.playerArray[playerNum].ClientIP + ":" + this.playerArray[playerNum].ClientPort);

            //        if (monitorClient) {
            //          SendPlayerToWSClient(monitorClient, this.playerArray[playerNum].PlayerID);
            //        }

            // Add handler to format CGP output
            let cgpLen = 0;

            for (i2 = 0; i2 < send_cgp_count; i2++) {
                if (!cgpLen) {
                    cgpLen = send_cgp[i2];
                } else {
                    cgpLen--;
                }

                outString += " ";
                outString += send_cgp[i2].toString(16).toUpperCase();
                //            printf("0x%02x ",(uint8)send_cgp[i2]);
                //            if (! cgpLen) printf("\n");
            }
            //        console.log(outString);
            //        printf("\n");
        }
    }

    SendMapToWSClient(conn, MapID) {
        let sendChunk = {};
        let MapNum = this.GetMapNumForMapID(MapID);

        sendChunk.mapCommand = 'map';
        sendChunk.DataObject = this.mapArray[MapNum];
        sendChunk.MapNum = MapNum;

        conn.send(JSON.stringify(sendChunk));
    }

    SendTileListToWSClient(conn) {
        let sendChunk = {};
        sendChunk.DataObject = [];
        sendChunk.DataObject = this.tileArray;
        sendChunk.mapCommand = 'tileList';

        conn.send(JSON.stringify(sendChunk));
    }

    SendMapTypeListToWSClient(conn) {
        let sendChunk = {};
        sendChunk.DataObject = [];
        sendChunk.DataObject = this.mapTypeArray;
        sendChunk.mapCommand = 'mapTypeList';

        conn.send(JSON.stringify(sendChunk));
    }

    SendMapListToWSClient(conn) {
        let sendChunk = {};
        sendChunk.DataObject = [];
        sendChunk.DataObject = this.mapArray;
        sendChunk.mapCommand = 'mapList';

        conn.send(JSON.stringify(sendChunk));
    }

    SendNPCListToWSClient(conn) {
        let sendChunk = {};
        sendChunk.DataObject = [];
        sendChunk.DataObject = this.npcArray;
        sendChunk.mapCommand = 'npcList';

        conn.send(JSON.stringify(sendChunk));
    }

    SendPlayerToWSClient(conn, PlayerID) {
        let sendChunk = {};
        let PlayerNum = this.GetPlayerNumForPlayerID(PlayerID);

        sendChunk.mapCommand = 'player';
        sendChunk.DataObject = this.playerArray[PlayerNum];
        sendChunk.PlayerNum = PlayerNum;

        conn.send(JSON.stringify(sendChunk));
    }

    RemoveJump(conn, mapID, mapY, mapX) {
        let sendChunk = {};
        let MapNum = this.GetMapNumForMapID(mapID);
        let OldMapJumpCount = this.mapArray[MapNum].MapJumpCount;

        sendChunk.DataObject = new MapObject();

        // Remove Jump from map
        let NewMapJumpIndex = 0;
        this.mapArray[MapNum].MapJumpCount = 0;

        for (let MapJumpIndex = 0; MapJumpIndex < OldMapJumpCount; MapJumpIndex++) {
            if (!((this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpX == mapX) && (this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpY == mapY))) {
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex] = new MapJumpObject();
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex].MapJumpX = this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpX;
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex].MapJumpY = this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpY;
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex].TargetMapID = this.mapArray[MapNum].MapJumpData[MapJumpIndex].TargetMapID;
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex].TargetMapX = this.mapArray[MapNum].MapJumpData[MapJumpIndex].TargetMapX;
                sendChunk.DataObject.MapJumpData[NewMapJumpIndex].TargetMapY = this.mapArray[MapNum].MapJumpData[MapJumpIndex].TargetMapY;

                NewMapJumpIndex++;
                this.mapArray[MapNum].MapJumpCount++;
            } else {
                console.log("Removed jump at mapArray[" + MapNum + "].MapJumpData[" + MapJumpIndex + "]");
            }
        }

        sendChunk.mapCommand = 'mapJumpData';
        this.mapArray[MapNum].MapJumpData = sendChunk.DataObject.MapJumpData;
        sendChunk.DataObject.MapJumpCount = this.mapArray[MapNum].MapJumpCount;
        sendChunk.DataObject.MapID = mapID;

        for (let c = 0; c < this.wsClients.length; c++) {
            this.wsClients[c].send(JSON.stringify(sendChunk));
        }

        console.log("Sent updated jump block with [" + this.mapArray[MapNum].MapJumpCount + "] jumps");
    }

    AddJump(conn, mapID, mapY, mapX, targetMapID, targetMapY, targetMapX) {
        let sendChunk = {};
        sendChunk.DataObject = new MapObject();
        let MapNum = this.GetMapNumForMapID(mapID);
        let MapJumpCount = this.mapArray[MapNum].MapJumpCount;
        let tgtMapJump = MapJumpCount;
        let MapJumpNew = 1;

        for (let MapJumpIndex = 0; MapJumpIndex < MapJumpCount; MapJumpIndex++) {
            if ((this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpX === mapX) && (this.mapArray[MapNum].MapJumpData[MapJumpIndex].MapJumpY === mapY)) {
                tgtMapJump = MapJumpIndex;
                MapJumpNew = 0;
            }
        }

        if (MapJumpNew) {
            this.mapArray[MapNum].MapJumpData[MapJumpCount] = new MapJumpObject();
            this.mapArray[MapNum].MapJumpCount++;
            console.log("  Adding new map jump");
        } else {
            console.log("  Updating map jump");
        }

        this.mapArray[MapNum].MapJumpData[tgtMapJump].MapJumpX = mapX;
        this.mapArray[MapNum].MapJumpData[tgtMapJump].MapJumpY = mapY;
        this.mapArray[MapNum].MapJumpData[tgtMapJump].TargetMapID = targetMapID;
        this.mapArray[MapNum].MapJumpData[tgtMapJump].TargetMapX = targetMapX;
        this.mapArray[MapNum].MapJumpData[tgtMapJump].TargetMapY = targetMapY;

        sendChunk.mapCommand = 'mapJumpData';
        sendChunk.DataObject.MapJumpData = this.mapArray[MapNum].MapJumpData;
        sendChunk.DataObject.MapJumpCount = this.mapArray[MapNum].MapJumpCount;
        sendChunk.DataObject.MapID = mapID;

        for (let c = 0; c < this.wsClients.length; c++) {
            this.wsClients[c].send(JSON.stringify(sendChunk));
        }

        console.log("Sent updated jump block with [" + this.mapArray[MapNum].MapJumpCount + "] jumps");
    }

    AddMap(conn, mapName, mapX, mapY, mapTypeID) {
        let MapDataString = '';
        let song = 3;
        let fillTile = 'D';
        let mapCount = this.mapArray.length;

        if (mapTypeID > 0) {
            song = 1;
            fillTile = '@';
        }

        for (let i = 0; i < mapY; i++) {
            for (let j = 0; j < mapX; j++) {
                MapDataString += fillTile;
            }
            MapDataString += "\n";
        }

        this.sqlconn.query("INSERT INTO Maps (MapName, MapX, MapY, MapTypeID, FillTile, Song, MapJumpCount, MapData, MapJumpData) VALUES ('" + mapName + "'," + mapX + "," + mapY + "," + mapTypeID + ",'" + fillTile + "'," + song + ",0,?,'[]')", [MapDataString], function (err, result) {

            // There was a error or not?
            if (err !== null) {
                console.log("Query error:" + err);
            } else {

                this.sqlconn.query("SELECT MapID, MapName, MapX, MapY, MapTypeID, FillTile, Song, MapData, MapJumpData, MapJumpCount FROM Maps WHERE MapName='" + mapName + "'", function (err, rows) {

                    // There was a error or not?
                    if (err !== null) {
                        console.log("Query error:" + err);
                    } else {

                        this.mapArray[mapCount] = new MapObject();
                        let MapData = [];

                        this.mapArray[mapCount].MapID = rows[0].MapID;
                        this.mapArray[mapCount].MapName = rows[0].MapName;
                        this.mapArray[mapCount].MapWidth = rows[0].MapX;
                        this.mapArray[mapCount].MapHeight = rows[0].MapY;
                        this.mapArray[mapCount].FillTile = rows[0].FillTile;
                        this.mapArray[mapCount].Song = rows[0].Song;
                        this.mapArray[mapCount].MapTypeID = rows[0].MapTypeID;
                        this.mapArray[mapCount].MapJumpData = JSON.parse(rows[0].MapJumpData);
                        this.mapArray[mapCount].MapJumpCount = rows[0].MapJumpCount;

                        let byteCounter = 0;
                        for (i = 0; i < this.mapArray[mapCount].MapHeight; i++) {
                            for (j = 0; j < this.mapArray[mapCount].MapWidth; j++) {
                                while (rows[0].MapData[byteCounter] === 10 || rows[0].MapData[byteCounter] === 13) {
                                    byteCounter++;
                                }
                                this.mapArray[mapCount].MapData[i][j] = rows[0].MapData[byteCounter];
                                byteCounter++;
                            }
                        }
                        mapCount++;
                        this.SendMapListToWSClient(conn);
                        console.log("Added Map '" + mapName + "'");
                    }
                });
            }
        });
    }

    SaveMap(MapID) {
        let MapData = '';
        let MapJumpData = '';
        let MapNum = this.GetMapNumForMapID(MapID);
        for (let i = 0; i < this.mapArray[MapNum].MapHeight; i++) {
            for (let j = 0; j < this.mapArray[MapNum].MapWidth; j++) {
                MapData += String.fromCharCode(this.mapArray[MapNum].MapData[i][j]);
            }
            MapData += "\n";
        }

        MapJumpData = JSON.stringify(this.mapArray[MapNum].MapJumpData);

        this.sqlconn.query("UPDATE Maps SET MapData = ?, MapJumpData = ?, MapJumpCount = " + this.mapArray[MapNum].MapJumpCount + " WHERE MapID = " + MapID, [MapData, MapJumpData], function (err, rows) {

            // There was a error or not?
            if (err !== null) {
                console.log("Query error:" + err);
            } else {
                console.log("Saved MapID " + MapID);
            }
        });
    }

    ParseJSONCGP(conn, jsonMessage) {
        //  conn.send("Got data - " + message);
        let message = JSON.parse(jsonMessage);
        let authTokenGood = 1;
        //for (let i=0; i<this.authTokens.length; i++) {
        //  if authToken authTokenGood = 1;
        //}
        if (authTokenGood && message.mapCommand) {
            //for (let i=0; i<) {
            //}
            switch (message.mapCommand) {
                case 'getMap':
                    this.SendMapToWSClient(conn, message.mapID);
                    break;
                case 'getMapList':
                    this.SendTileListToWSClient(conn);
                    this.SendMapTypeListToWSClient(conn);
                    this.SendMapListToWSClient(conn);
                    this.SendNPCListToWSClient(conn);
                    console.log("Sent map data.");
                    break;
                case 'getPlayer':
                    this.SendPlayerToWSClient(conn, message.playerID);
                    break;
                case 'updateMapChunk':
                    let MapNum = this.GetMapNumForMapID(message.mapID);
                    this.mapArray[MapNum].MapData[message.mapY][message.mapX] = message.newValue;
                    for (let c = 0; c < this.wsClients.length; c++) {
                        if (conn != this.wsClients[c]) {
                            this.wsClients[c].send(jsonMessage);
                        }
                    }
                    break;
                case 'removeJump':
                    this.RemoveJump(conn, message.mapID, message.mapY, message.mapX);
                    break;
                case 'addMapJump':
                    this.AddJump(conn, message.mapID, message.mapY, message.mapX, message.targetMapID, message.targetMapY, message.targetMapX);
                    break;
                case 'saveMap':
                    this.SaveMap(message.mapID);
                    break;
                case 'addNewMap':
                    this.AddMap(conn, message.mapName, message.mapX, message.mapY, message.mapTypeID);
                    break;
                default:
            }
        } else {
            conn.send("Bad command.  Here's the parsed JSON data..." + message);
        }
    }

    DBKeepAlive() {
        this.sqlconn.query('select 1', [], function (err, result) {
            if (err) {
                console.log(err);
            }
            // Successul keepalive
        });
    }

    OpenDB(connArray) {
        this.sqlconn = mysql.createConnection(connArray);
        this.sqlconn.connect(function (err) {
            if (err !== null) {
                console.log('Error connecting to mysql:' + err + '\n');
            }
        });
    }

    StartWSListener() {
        let thisXCS = this;

        let clientDirectory = "webroot";

        this.expressApp = express();
        expressWs(this.expressApp);

        this.expressApp.listen("8880");

        this.expressApp.use(express.static(clientDirectory));

        this.expressApp.get("/", (req, res) => {
            res.sendFile("mapeditclient.html", { root: clientDirectory });
        });

        //thisXCS.wsServer = Websocket.createServer({port: thisXCS.wsPort});
        this.expressApp.ws('/', async function (wsConn, req) {
            thisXCS.wsClients.push(wsConn);
            console.log("Now have " + thisXCS.wsClients.length + " web users connected.");

            wsConn.on("message", function (message) {
                // Process command
                console.log("message: " + message);
                thisXCS.ParseJSONCGP(wsConn, message);
            });

            wsConn.on("close", function (closeCode, reason) {
                for (let i = 0; i < thisXCS.wsClients.length; i++) {
                    if (thisXCS.wsClients[i] == wsConn) {
                        thisXCS.wsClients.splice(i);
                        console.log("Now have " + thisXCS.wsClients.length + " web users connected.");
                        break;
                    }
                }
            });

            wsConn.on("error", function (error) {
                remoteEndpoint.ErrorHandler(error);
            });
        });
    }

    StartCGPListener() {
        let thisXCS = this;
        thisXCS.cgpServer = dgram.createSocket("udp4");
        thisXCS.cgpServer.on("message", function (msg, rinfo) {

            // Process incoming CGP packet
            let playerID = 0;
            let playerNum = 0;
            let cmdType = '';
            let cmdSize = 0;
            let msgLen = 0;
            msgLen = msg.length;
            cmdSize = msg[0] << 8 | msg[1];

            if (msgLen >= cmdSize + 2) {
                // Good CGP Command length

                // Check to see if we have an existing connection match
                playerID = thisXCS.CheckPlayerArrayConnection(rinfo.address, rinfo.port);
                if (playerID) {
                    // Player already has an established connection
                    playerNum = thisXCS.GetPlayerNumForPlayerID(playerID);
                    thisXCS.ProcessCGPCommands(playerNum, msg, msgLen);
                    thisXCS.DisplayLoadedPlayers();
                } else {
                    // Unknown connection - ONLY accept a HELLO
                    if (msg[2] === 1) {
                        let userName = '';
                        let userPass = '';
                        let tabChar = 0;
                        for (let m = 5; m < msgLen; m++) {
                            if (!tabChar) {
                                if (msg[m] === 9) {
                                    tabChar = m;
                                } else {
                                    userName += String.fromCharCode(msg[m]);
                                }
                            } else {
                                userPass += String.fromCharCode(msg[m]);
                            }
                        }
                        //            console.log("[" + userName + "] [" + userPass + "] Delimiter [" + tabChar + "]");
                        playerID = thisXCS.CheckPlayerArrayCredentials(userName, userPass);
                        if (playerID) {
                            playerNum = thisXCS.GetPlayerNumForPlayerID(playerID);
                            thisXCS.playerArray[playerNum].ClientIP = rinfo.address;
                            thisXCS.playerArray[playerNum].ClientPort = rinfo.port;
                            thisXCS.playerArray[playerNum].MapBufRows = msg[3];
                            thisXCS.playerArray[playerNum].MapBufCols = msg[4];
                            thisXCS.playerArray[playerNum].Active = 1;
                            thisXCS.DisplayLoadedPlayers();
                        }
                        //          } else {
                        //            console.log("Cannot accept command [" + msg[2] + "] until a HELLO is accepted from " + rinfo.address + ":" + rinfo.port);
                    }
                }
            } else {
                // Bad CGP Command length
            }
        });
        thisXCS.cgpServer.bind(thisXCS.cgpPort);
    }

    SetWSPort(wsPort) {
        this.wsPort = wsPort;
    }

    SetCGPPort(cgpPort) {
        this.cgpPort = cgpPort;
    }

    Run() {
        let thisXCS = this;
        console.log("Starting server....");
        thisXCS.LoadMaps();
        thisXCS.LoadPlayers();
        thisXCS.LoadNPCs();

        setInterval(function () {
            thisXCS.DBKeepAlive(thisXCS)
        }, 1000 * 60 * 5);
        console.log("Started DB keepalive.");

        thisXCS.StartWSListener();
        console.log("Started WS listener.");

        thisXCS.StartCGPListener();
        console.log("Started CGP listener.");

        console.log('');
    }
};

let xcs = new XPlatCGPServer();
xcs.OpenDB({
    host: '127.0.0.1',
    port: 3306,
    database: 'XPlatCGP',
    user: 'cgpserver',
    password: 'aardvark'
});
xcs.SetWSPort(8880);
xcs.SetCGPPort(7135);
xcs.Run();

let hostID = process.env.HOSTID || os.hostname();
let domainName = process.env.DOMAINNAME || "";
let meshKey = process.env.MESHKEY || "supersecretkey";
let zoneName = process.env.ZONENAME || "MyZone";
let registryUrl = process.env.REGISTRYURL || null;
let debug = process.env.DEBUG || false;
let registrySet = process.env.REGISTRYSET || null;

// Set one or more roles for the Node.  Provider nodes can be non-listening, but Registry and Broker nodes must listen for inbound connections.
let roleList = ["Provider"];

/**
 * Set config options for the service to be advertised to the mesh.
 */

let serviceName = process.env.SERVICENAME || "MapService";
let priority = process.env.PRIORITY || null; // Default = 10, lowest available priorities will be selected
let weight = process.env.WEIGHT || null; // Default = 10, higher is more likely to be selected in the same priority level
let scope = process.env.SCOPE || null; // (local, zone or global)

// Set DB Params
let dbParams = {
    host: 'localhost',
    user: 'cgpserver',
    password: 'aardvark',
    database: 'XPlatCGP',
    waitForConnections: true,
    connectionLimit: 100,
    queueLimit: 0
}

// Create Node
console.log(`Starting DRP Node`);
let myNode = new DRP_Node(roleList, hostID, domainName, meshKey, zoneName);
myNode.Debug = debug;
myNode.RegistrySet = registrySet;
myNode.RegistryUrl = registryUrl;
myNode.ConnectToMesh(async () => {

    // After the node has connected to the mesh, create a new service instance and advertise it to the mesh
    let sampleServiceInstance = new MapService(serviceName, myNode, priority, weight, scope, dbParams);
    myNode.AddService(sampleServiceInstance);

});
