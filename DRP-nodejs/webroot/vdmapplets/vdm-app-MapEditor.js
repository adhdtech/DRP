class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        this.menu = {
            "Worlds": {
                "Reload": () => {
                    thisApplet.LoadMaps();
                }
            }
        };
    }

    async RunStartup() {
        let thisApplet = this;

        $(thisApplet.dataPane).addClass("vdmApp-MapEditor");

        thisApplet.windowParts.data.innerHTML = `
        <div class="toolPane">
            <br>
            <select class="visibleMapID" style="width: 120px;"></select>
            <br>
            <div class="toolHead positionLabel">Position:</div>
            <div class="toolData positionData">X,Y = 0,0</div>
            <br>
            <div class="toolHead">Selected:</div>
            <div class="toolData toolSelected">&nbsp;</div>
            <div class="toolList">&nbsp;</div>
        </div>
        <div class="mapPane">
            <canvas class="canvas-map-tiles"  width="0" height="0" style="z-index: 1; position:absolute; left:0px; top:0px;"></canvas>
            <canvas class="canvas-map-jumps"  width="0" height="0" style="z-index: 2; position:absolute; left:0px; top:0px;"></canvas>
            <canvas class="canvas-map-cursor" width="0" height="0" style="z-index: 4; position:absolute; left:0px; top:0px;"></canvas>
            <canvas class="canvas-map-players" width="0" height="0" style="z-index: 3; position:absolute; left:0px; top:0px;"></canvas>
        </div>
`;

        thisApplet.mapSelect = thisApplet.dataPane.querySelector('.visibleMapID');
        thisApplet.toolList = thisApplet.dataPane.querySelector('.toolList');
        thisApplet.toolSelected = thisApplet.dataPane.querySelector('.toolSelected');
        thisApplet.positionData = thisApplet.dataPane.querySelector('.positionData');
        thisApplet.canvasTiles = thisApplet.dataPane.querySelector('.canvas-map-tiles');
        thisApplet.canvasJumps = thisApplet.dataPane.querySelector('.canvas-map-jumps');
        thisApplet.canvasCursor = thisApplet.dataPane.querySelector('.canvas-map-cursor');
        thisApplet.canvasPlayers = thisApplet.dataPane.querySelector('.canvas-map-players');
        thisApplet.ctxTiles = thisApplet.canvasTiles.getContext('2d');
        thisApplet.ctxCursor = thisApplet.canvasCursor.getContext('2d');
        thisApplet.ctxJumps = thisApplet.canvasJumps.getContext('2d');
        thisApplet.ctxPlayers = thisApplet.canvasPlayers.getContext('2d');

        thisApplet.curTileX = 0;
        thisApplet.curTileY = 0;
        thisApplet.originx = 0;
        thisApplet.originy = 0;
        thisApplet.tileSize = 16;
        thisApplet.zoom = 1;
        thisApplet.mapScaling = 1;

        // Add jump image
        thisApplet.jumpImage = document.createElement('img');
        //thisToolLink.href = "javascript:void(0)";
        thisApplet.jumpImage.src = `img/jump.png`;
        thisApplet.jumpImage.onclick = function () {
            thisApplet.ChangeSelectedTileIndex(32);
        }

        // Set select function
        thisApplet.mapSelect.onchange = function () {
            thisApplet.DisplayMapID(this.value)
        }

        thisApplet.canvasCursor.addEventListener('mousemove', function (e) { thisApplet.MouseMove(e) }, false);
        thisApplet.canvasCursor.addEventListener('mousedown', function (e) { thisApplet.MouseDown(e) }, false);
        thisApplet.canvasCursor.addEventListener('mouseup', function (e) { thisApplet.MouseUp(e) }, false);
        thisApplet.canvasCursor.addEventListener('mouseout', function (e) { thisApplet.MouseOut(e) }, false);

        thisApplet.canvasCursor.addEventListener('touchmove', function (e) { thisApplet.TouchMove(e) }, false);
        thisApplet.canvasCursor.addEventListener('touchstart', function (e) { thisApplet.MouseDown(e) }, false);
        thisApplet.canvasCursor.addEventListener('touchend', function (e) { thisApplet.MouseUp(e) }, false);
        thisApplet.canvasCursor.addEventListener('touchcancel', function (e) { thisApplet.MouseOut(e) }, false);

        // Load Maps
        await thisApplet.LoadMaps();
    }

    async LoadMaps() {
        let thisApplet = this;

        thisApplet.worldDefs = await thisApplet.sendCmd("MapService", "getWorldDefs", null, true);
        thisApplet.mapTypes = {};
        thisApplet.maps = await thisApplet.sendCmd("MapService", "getMaps", null, true);

        // Populate select tool options and mapTypes
        for (let thisMap of Object.values(thisApplet.maps)) {
            // Set tool option
            let newOption = new Option(thisMap.MapName, thisMap.MapID);
            thisApplet.mapSelect.appendChild(newOption);
        }

        // Lop over world types
        for (const worldObj of Object.values(thisApplet.worldDefs)) {
            // Loop over world map types
            for (const worldMapObj of Object.values(worldObj.MapTypes)) {

                for (let thisTileObj of Object.values(worldMapObj.Tiles)) {
                    thisTileObj.ImageObj = new Image();
                    thisTileObj.ImageObj.src = 'img/' + thisTileObj.ImgFile;
                }

                thisApplet.mapTypes[worldMapObj.MapTypeID] = worldMapObj;
            }
        }


        // Wait for images to load
        await thisApplet.Sleep(100);

        thisApplet.currentMap = Object.values(thisApplet.maps)[0];
        thisApplet.DisplayMapID(thisApplet.currentMap.MapID);
    }

    DisplayMapID(mapID) {
        let thisApplet = this;
        this.currentMap = thisApplet.maps[mapID];
        thisApplet.UpdateTools();
        thisApplet.UpdateMapPane();
    }

    UpdateTools() {
        let thisApplet = this;
        let mapType = thisApplet.mapTypes[thisApplet.currentMap.MapTypeID];
        thisApplet.toolIndex = [];
        thisApplet.selectedToolIndex = null;
        thisApplet.toolList.innerHTML = "";

        let tileArray = Object.values(mapType.Tiles);
        for (let i = 0; i < tileArray.length; i++) {
            let thisTile = tileArray[i];
            let thisToolLink = document.createElement('img');
            //thisToolLink.href = "javascript:void(0)";
            thisToolLink.src = `img/${thisTile.ImgFile}`;
            thisToolLink.onclick = function () {
                thisApplet.ChangeSelectedTileIndex(i);
            }
            thisApplet.toolList.appendChild(thisToolLink);
            thisApplet.toolIndex[i] = thisToolLink;
            //toolHTML += "<a href=\"javascript:void(0)\" onclick=\"updateCurrentTile(" + i + ")\"><img id=\"tile-" + i + "\" src=\"img/" + tileArray[i].ImgFile + "\"></a>\n";
        }

        //toolHTML += "<br><br><a href=\"javascript:void(0)\" onclick=\"updateCurrentTile(32)\"><img id=\"tile-32\" src=\"img/jump.png\"></a>\n"
        thisApplet.toolList.appendChild(thisApplet.jumpImage);
        thisApplet.toolIndex[32] = thisApplet.jumpImage;

        thisApplet.ChangeSelectedTileIndex(0);
    }

    ChangeSelectedTileIndex(newTileIndex) {
        let thisApplet = this;
        if (thisApplet.selectedToolIndex != newTileIndex) {

            if (thisApplet.selectedToolIndex !== null) {
                // Unflag the old tool type
                thisApplet.toolIndex[thisApplet.selectedToolIndex].style.padding = '2px';
                thisApplet.toolIndex[thisApplet.selectedToolIndex].style.border = '0px';
            }
            // Update the current tool type
            thisApplet.selectedToolIndex = newTileIndex;

            // Flag the current tool type
            thisApplet.toolIndex[thisApplet.selectedToolIndex].style.padding = '0px';
            thisApplet.toolIndex[thisApplet.selectedToolIndex].style.border = '2px solid #D00';

            // Update the selected tool text
            if (thisApplet.selectedToolIndex == 32) {
                thisApplet.toolSelected.innerText = "Jump";
                thisApplet.ctxCursor.globalAlpha = 0.4;
            } else {
                let mapTypeID = thisApplet.currentMap.MapTypeID;
                let tileName = thisApplet.mapTypes[mapTypeID].TileOrder[thisApplet.selectedToolIndex];
                let targetTile = thisApplet.mapTypes[mapTypeID].Tiles[tileName];

                thisApplet.toolSelected.innerText = targetTile.Name;
                thisApplet.ctxCursor.globalAlpha = 1.0;
            }

        }
    }

    UpdateMapPane() {
        let thisApplet = this;

        thisApplet.canvasCursor.width = thisApplet.currentMap.MapX * thisApplet.tileSize;
        thisApplet.canvasCursor.height = thisApplet.currentMap.MapY * thisApplet.tileSize;
        thisApplet.canvasTiles.width = thisApplet.currentMap.MapX * thisApplet.tileSize;
        thisApplet.canvasTiles.height = thisApplet.currentMap.MapY * thisApplet.tileSize;
        thisApplet.canvasJumps.width = thisApplet.currentMap.MapX * thisApplet.tileSize;
        thisApplet.canvasJumps.height = thisApplet.currentMap.MapY * thisApplet.tileSize;
        thisApplet.canvasPlayers.width = thisApplet.currentMap.MapX * thisApplet.tileSize;
        thisApplet.canvasPlayers.height = thisApplet.currentMap.MapY * thisApplet.tileSize;

        thisApplet.ctxTiles.globalAlpha = 1.0;
        thisApplet.ctxCursor.globalAlpha = 1.0;
        thisApplet.ctxJumps.globalAlpha = 0.4;
        thisApplet.ctxPlayers.globalAlpha = 1.0;

        if (thisApplet.zoom != 1) {
            let xPos = curTileX * thisApplet.tileSize * thisApplet.mapScaling * thisApplet.zoom;
            let yPos = curTileY * thisApplet.tileSize * thisApplet.mapScaling * thisApplet.zoom;

            let debugText = "";

            debugText += "Origin X,Y=" + thisApplet.originx + "," + thisApplet.originy;
            debugText += "<br><br>";

            //          tmpTileX = (((e.pageX - offsetX)&(0xFFFFFFFF - (16*mapScaling-1)))/16/mapScaling);
            //          tmpTileY = (((e.pageY - offsetY)&(0xFFFFFFFF - (16*mapScaling-1)))/16/mapScaling);

            //          $('#toolSelected').html("X,Y=" + xPos + "," + yPos + "<br><br>Scaling:<br>" + mapScaling * zoom + "<br>" + debugText);

            //          ctxTiles.translate(
            //              originx,
            //              originy
            //          );
            //          ctxTiles.scale(mapScaling, mapScaling);
            //          ctxTiles.translate(
            //              -( xPos / mapScaling + originx - xPos / ( mapScaling * zoom ) ),
            //              -( yPos / mapScaling + originy - yPos / ( mapScaling * zoom ) )
            //          );

            ctxTiles.translate(
                -(xPos / thisApplet.mapScaling / thisApplet.zoom),
                -(yPos / thisApplet.mapScaling / thisApplet.zoom)
            );

            thisApplet.originx = (xPos / thisApplet.mapScaling / thisApplet.zoom);
            thisApplet.originy = (yPos / thisApplet.mapScaling / thisApplet.zoom);
            thisApplet.mapScaling *= thisApplet.zoom;

            debugText += "Origin X,Y=" + thisApplet.originx + "," + thisApplet.originy;
            debugText += "<br><br>";

            $(thisApplet.toolSelected).html("X,Y=" + xPos + "," + yPos + "<br><br>Scaling:<br>" + thisApplet.mapScaling + "<br>" + debugText);

            zoom = 1;
        }

        thisApplet.ctxTiles.scale(thisApplet.mapScaling, thisApplet.mapScaling);
        thisApplet.ctxCursor.scale(thisApplet.mapScaling, thisApplet.mapScaling);
        thisApplet.ctxJumps.scale(thisApplet.mapScaling, thisApplet.mapScaling);
        thisApplet.ctxPlayers.scale(thisApplet.mapScaling, thisApplet.mapScaling);

        // Loop over map height and width, populate tiles
        for (let i = 0; i < thisApplet.currentMap.MapY; i++) {
            let yPos = i * thisApplet.tileSize;
            for (let j = 0; j < thisApplet.currentMap.MapX; j++) {
                let xPos = j * thisApplet.tileSize;
                let mapTileChar = thisApplet.currentMap.MapData[i][j];
                mapTileChar = mapTileChar.replace(/\s/g, '');
                let mapTypeID = thisApplet.currentMap.MapTypeID;
                let tileName = thisApplet.mapTypes[mapTypeID].TileCharMap[mapTileChar];
                if (!tileName) {
                    //console.log(`Could not file tile for char[${mapTileChar}]`);
                    tileName = thisApplet.mapTypes[mapTypeID].TileCharMap[thisApplet.currentMap.FillTile];
                }
                let targetTile = thisApplet.mapTypes[mapTypeID].Tiles[tileName];
                thisApplet.ctxTiles.drawImage(targetTile.ImageObj, xPos, yPos);
            }
        }

        // Loop over jump points
        for (let thisJump of thisApplet.currentMap.MapJumpData) {
            // Draw MapJumpTiles
            let xPos = thisJump.MapJumpX * thisApplet.tileSize;
            let yPos = thisJump.MapJumpY * thisApplet.tileSize;
            thisApplet.ctxJumps.drawImage(thisApplet.jumpImage, xPos, yPos);
        }
    }

    CalculateTileBlock(pageX, pageY) {
        let thisApplet = this;
        let canvasOffset = $(thisApplet.canvasTiles).offset();
        let offsetX = canvasOffset.left;
        let offsetY = canvasOffset.top;
        let tmpTileX = (((pageX - offsetX + thisApplet.originx) & (0xFFFFFFFF - (thisApplet.tileSize * thisApplet.mapScaling - 1))) / thisApplet.tileSize / thisApplet.mapScaling);
        let tmpTileY = (((pageY - offsetY + thisApplet.originy) & (0xFFFFFFFF - (thisApplet.tileSize * thisApplet.mapScaling - 1))) / thisApplet.tileSize / thisApplet.mapScaling);
        return {
            x: tmpTileX,
            y: tmpTileY
        }
    }

    ProcessPointerMove(ptrPageX, ptrPageY) {
        let thisApplet = this;
        let tileBlock = thisApplet.CalculateTileBlock(ptrPageX, ptrPageY);
        if ((tileBlock.x != thisApplet.curTileX) || (tileBlock.y != thisApplet.curTileY)) {
            thisApplet.curTileX = tileBlock.x;
            thisApplet.curTileY = tileBlock.y;
            $(thisApplet.positionData).text("X,Y = " + thisApplet.curTileX + "," + thisApplet.curTileY);
            if (thisApplet.drawNow) {
                thisApplet.DrawTile();
            }
            thisApplet.UpdateCursor();
        }
    }

    MouseMove(e) {
        let thisApplet = this;
        thisApplet.ProcessPointerMove(e.pageX, e.pageY);
    };

    TouchMove(e) {
        let thisApplet = this;
        thisApplet.ProcessPointerMove(e.touches[0].pageX, e.touches[0].pageY);
    }

    MouseDown(e) {
        let thisApplet = this;
        // Only use left button, return on others
        if (e.which > 1) {
            return;
        }
        e.preventDefault();
        this.drawNow = true;
        if (thisApplet.selectedToolIndex < 32) {
            // Loop over Map Jumps to see if we're overwriting a jump point
            for (let j = 0; j < thisApplet.currentMap.MapJumpCount; j++) {
                if ((thisApplet.currentMap.MapJumpData[j].MapJumpX == thisApplet.curTileX) && (thisApplet.currentMap.MapJumpData[j].MapJumpY == thisApplet.curTileY)) {
                    // Old code to clear jump
                }
            }
            this.DrawTile();
        } else {
            // Set draw to false; tile should be created by ShowJumpTargetForm
            this.drawNow = false;

            // Show form to add new jump
            this.ShowJumpTargetForm(thisApplet.currentMap.MapID, thisApplet.curTileX, thisApplet.curTileY);
        }
    }

    MouseUp(e) {
        let thisApplet = this;
        // Only use left button, return on others
        if (e.which > 1) {
            return;
        }
        thisApplet.drawNow = false;
    }

    MouseOut(e) {
        let thisApplet = this;
        thisApplet.drawNow = false;
        thisApplet.ctxCursor.clearRect(0, 0, this.canvasTiles.width, this.canvasTiles.height);
    }

    DrawTile() {
        let thisApplet = this;

        // Set image position on canvas
        let xPos = thisApplet.curTileX * thisApplet.tileSize;
        let yPos = thisApplet.curTileY * thisApplet.tileSize;

        if (thisApplet.selectedToolIndex == 32) {
            thisApplet.ctxJumps.drawImage(thisApplet.jumpImage, xPos, yPos);
        } else {
            // Get Image to draw
            let mapTypeID = thisApplet.currentMap.MapTypeID;
            let tileName = thisApplet.mapTypes[mapTypeID].TileOrder[thisApplet.selectedToolIndex];
            let targetTile = thisApplet.mapTypes[mapTypeID].Tiles[tileName];

            if (thisApplet.currentMap.MapData[thisApplet.curTileY][thisApplet.curTileX] === targetTile.Char) {
                return;
            }

            // Draw image on canvas
            thisApplet.ctxTiles.drawImage(targetTile.ImageObj, xPos, yPos);

            // Update local map data
            let targetRowString = thisApplet.currentMap.MapData[thisApplet.curTileY];
            thisApplet.currentMap.MapData[thisApplet.curTileY] = targetRowString.substring(0, thisApplet.curTileX) + targetTile.Char + targetRowString.substring(thisApplet.curTileX + 1);
            // Old code to send map update
            //}

            console.log('Updated tile')
        }
    }

    UpdateCursor() {
        let thisApplet = this;
        thisApplet.ctxCursor.clearRect(0, 0, thisApplet.canvasTiles.width, thisApplet.canvasTiles.height);
        let xPos = thisApplet.curTileX * thisApplet.tileSize;
        let yPos = thisApplet.curTileY * thisApplet.tileSize;
        if (thisApplet.selectedToolIndex == 32) {
            thisApplet.ctxCursor.drawImage(thisApplet.jumpImage, xPos, yPos);
        } else {
            // Get Image to draw
            let mapTypeID = thisApplet.currentMap.MapTypeID;
            let tileName = thisApplet.mapTypes[mapTypeID].TileOrder[thisApplet.selectedToolIndex];
            let targetTile = thisApplet.mapTypes[mapTypeID].Tiles[tileName];

            thisApplet.ctxCursor.drawImage(targetTile.ImageObj, xPos, yPos);
        }
    }

    async Sleep(ms) {
        await new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}

let AppletProfile = {
    "appletName": "MapEditor",
    "title": "Map Editor",
    "sizeX": 600,
    "sizeY": 400,
    "appletIcon": "fa-list-alt",
    "showInMenu": true,
    "preloadDeps": false,
    "dependencies": [{ "CSS": "vdmapplets/vdm-app-MapEditor.css" }]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-MapEditor.js