class AppletClass extends DRPApplet {
    constructor(appletProfile) {
        super(appletProfile);
        let thisApplet = this;

        // Dropdown menu items
        thisApplet.menu = {
            "General":
            {
                "Properties": function () { }
            }
        };

        thisApplet.menuSearch = {
            "searchEmptyPlaceholder": "Search...",
            "searchField": null
        };

        thisApplet.menuQuery = {
            "queryEmptyPlaceholder": "Query...",
            "queryField": null
        };

        thisApplet.selectedScreen = "";
        thisApplet.rightPaneScreens = {
            "ObjDisplay": {
                itemClass: 'objDisplay',
                fields: [],
                screenDiv: null
            }
        }
        thisApplet.lastSearch = null;
        thisApplet.searchHistory = [];
        thisApplet.leftMenu = null;
        thisApplet.leftPane = null;
        thisApplet.vDiv = null;
        thisApplet.rightPane = null;
        thisApplet.dataStructs = {
            'StereoTypes': {},
            'ClassTypes': {}
        }
    }

    async RunStartup() {
        let thisApplet = this;

        // Split data pane horizontally
        let newPanes = thisApplet.SplitPaneHorizontal(thisApplet.dataPane, 175, true, true);
        thisApplet.leftPane = newPanes[0];
        thisApplet.vDiv = newPanes[1];
        thisApplet.rightPane = newPanes[2];
        $(thisApplet.dataPane).addClass("vdmApp-HiveBrowser");

        $.each(thisApplet.rightPaneScreens, function (itemName, itemValue) {
            let ca = document.createElement("div");
            ca.className = itemValue.itemClass;
            for (let i = 0; i < itemValue.fields.length; i++) {
                let thisItem = itemValue.fields[i];
                let caa = document.createElement("div");
                caa.style.cssText = thisItem.fieldStyle;
                switch (thisItem.fieldType) {
                    case 'tag':
                        caa.innerHTML = thisItem.fieldValue;
                        break;
                    case 'txtData':
                        break;
                    case 'input':
                        let caaa = document.createElement("input");
                        caaa.type = "text";
                        caa.appendChild(caaa);
                        break;
                    case 'table':
                        let caab = document.createElement("table");
                        caab.className = 'table table-bordered table-condensed table-striped2';
                        caab.style.cssText = 'margin-bottom: 0;';
                        let caaaa = document.createElement("tbody");
                        caab.appendChild(caaaa);
                        caa.appendChild(caab);
                        // Untested -> LEFT OFF HERE
                        //              caaa.tabIndex = 0;
                        thisApplet.dataStructs[thisItem.structName].outputTable = caab;
                        break;
                    default:
                        break;
                }
                ca.appendChild(caa);
                thisItem.fieldDiv = caa;
            }
            thisApplet.rightPane.appendChild(ca);
            itemValue.screenDiv = ca;
        });

        thisApplet.rightPane.tabIndex = 0;
        $(thisApplet.rightPane).keydown(function (e) {
            if (e.keyCode === 8) {
                thisApplet.GoBack();
            }
        });

        thisApplet.dataStructs['StereoTypes'] = await thisApplet.sendCmd("Hive", "listStereoTypes", null, true);
        thisApplet.dataStructs['ClassTypes'] = await thisApplet.sendCmd("Hive", "getClassDefinitions", null, true);
        let classDataTypes = await thisApplet.sendCmd("Hive", "listClassDataTypes", null, true);
        if (classDataTypes) {
            let classDataTypeKeys = Object.keys(classDataTypes);
            for (let i = 0; i < classDataTypeKeys.length; i++) {
                let recKey = classDataTypeKeys[i];
                thisApplet.dataStructs['ClassTypes'][recKey].recCount = classDataTypes[recKey].recCount;
            }
        }

        thisApplet.RecvDone();

        if (thisApplet.menuSearch) {
            $(thisApplet.menuSearch.searchField).keyup(function (e) {
                if (e.keyCode === 13) {
                    let searchKey = $(thisApplet.menuSearch.searchField).val().replace(/(\r\n|\n|\r)/gm, "");
                    //let searchKey = $(thisApplet.menuSearch.searchField).val().trim();
                    $(thisApplet.menuSearch.searchField).val(searchKey);
                    thisApplet.SearchIndexes(searchKey, null);
                }
            });
        }

        if (thisApplet.menuQuery) {
            $(thisApplet.menuQuery.queryField).keyup(async function (e) {
                if (e.keyCode === 13) {
                    let queryText = $(thisApplet.menuQuery.queryField).val().replace(/(\r\n|\n|\r)/gm, "");
                    //let queryText = $(thisApplet.menuQuery.queryField).val().trim();
                    $(thisApplet.menuQuery.queryField).val(queryText);
                    let recvData = await thisApplet.sendCmd("Hive", "runHiveQuery", { "query": queryText }, true);
                    thisApplet.ChangeDataScreen('ObjDisplay');
                    thisApplet.DisplayHiveQuery(recvData, thisApplet.rightPaneScreens['ObjDisplay'].screenDiv);
                }
            });
        }
    }

    SetCaretPosition(elem, caretPos) {
        let thisApplet = this;
        if (elem !== null) {
            if (elem.createTextRange) {
                let range = elem.createTextRange();
                range.move('character', caretPos);
                range.select();
            }
            else {
                if (elem.selectionStart) {
                    elem.focus();
                    elem.setSelectionRange(caretPos, caretPos);
                }
                else
                    elem.focus();
            }
        }
    }

    ChangeDataScreen(newSelectedScreen) {
        let thisApplet = this;
        if (thisApplet.selectedScreen !== newSelectedScreen) {
            if (thisApplet.selectedScreen) {
                $(thisApplet.rightPaneScreens[thisApplet.selectedScreen].screenDiv).removeClass('selected');
            }
            $(thisApplet.rightPaneScreens[newSelectedScreen].screenDiv).addClass('selected');
            thisApplet.selectedScreen = newSelectedScreen;
        }
    }

    async GoBack() {
        let thisApplet = this;
        if (thisApplet.searchHistory.length) {
            let searchPacket = thisApplet.searchHistory.pop();
            while (searchPacket === thisApplet.lastSearch) {
                searchPacket = thisApplet.searchHistory.pop();
            }
            thisApplet.lastSearch = searchPacket;
            if (searchPacket) {
                thisApplet.lastSearch = searchPacket;
                console.log("Search history entries: " + thisApplet.searchHistory.length);
                let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysNested", { "Key": searchPacket["Key"], "Stereotype": searchPacket["Stereotype"] }, true);
                thisApplet.ChangeDataScreen('ObjDisplay');
                thisApplet.DisplayObjectArrayNested(recvData.records, thisApplet.rightPaneScreens['ObjDisplay'].screenDiv);
            }
        }
    }

    async SearchIndexes(keyVal, sTypeName) {
        let thisApplet = this;
        let searchPacket = { "Key": keyVal, "Stereotype": sTypeName };
        thisApplet.lastSearch = searchPacket;
        thisApplet.searchHistory.push(searchPacket);
        console.log("Search history entries: " + thisApplet.searchHistory.length);
        let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysChildren", { "Key": keyVal, "Stereotype": sTypeName }, true);
        thisApplet.ChangeDataScreen('ObjDisplay');
        thisApplet.DisplayObjectArrayNested(recvData.records, thisApplet.rightPaneScreens['ObjDisplay'].screenDiv);
    }

    async GetIndexKey(keyVal, sTypeName) {
        let thisApplet = this;
        let searchPacket = { "Key": keyVal, "Stereotype": sTypeName };
        thisApplet.lastSearch = searchPacket;
        thisApplet.searchHistory.push(searchPacket);
        console.log("Search history entries: " + thisApplet.searchHistory.length);
        let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysNested", { "Key": keyVal, "Stereotype": sTypeName }, true);
        thisApplet.ChangeDataScreen('ObjDisplay');
        thisApplet.DisplayObjectArrayNested(recvData.records, thisApplet.rightPaneScreens['ObjDisplay'].screenDiv);
    }

    DisplayHiveQuery(recvObject, targetDiv) {
        let thisApplet = this;
        targetDiv.innerHTML = '';

        if (recvObject.records.length && recvObject.icrQuery) {
            let resultTable = thisApplet.MakeTableQueryResults(
                recvObject.records,
                recvObject.icrQuery.classType,
                recvObject.icrQuery.classTypeSub,
                recvObject.icrQuery.classKeySub
            );
            targetDiv.appendChild(resultTable);
        } else {
            let outputMsg = document.createElement("span");
            outputMsg.className = 'errorMsg';
            outputMsg.innerHTML = 'No results received.';
            targetDiv.appendChild(outputMsg);
        }
    }

    MakeTableQueryResults(records, idxSType, recClassName, recColName) {
        let thisApplet = this;
        if (recClassName) {
            let pkFieldName = thisApplet.dataStructs['ClassTypes'][recClassName].PrimaryKey;
            let pkSType = thisApplet.FieldStereotype(recClassName, pkFieldName);
            let valueSType = thisApplet.FieldStereotype(recClassName, recColName);

            let tableObj = document.createElement("table");
            tableObj.className = 'QR';

            let tblHead = document.createElement("thead");
            let tblHeadRow = document.createElement("tr");
            let tblHeadCol1 = document.createElement("th");
            tblHeadCol1.innerHTML = "(Stereotype) " + idxSType;
            let tblHeadCol2 = document.createElement("th");
            tblHeadCol2.innerHTML = "(Class Key) " + pkFieldName;
            let tblHeadCol3 = document.createElement("th");
            tblHeadCol3.innerHTML = "(Class Field) " + recColName;
            tblHeadRow.appendChild(tblHeadCol1);
            tblHeadRow.appendChild(tblHeadCol2);
            tblHeadRow.appendChild(tblHeadCol3);
            tblHead.appendChild(tblHeadRow);
            tableObj.appendChild(tblHead);

            let tableBody = document.createElement("tbody");

            for (let h = 0; h < records.length; h++) {
                let record = records[h];
                Object.keys(record).forEach(function (idxKey) {
                    let valueArray = record[idxKey];

                    // Loop over each data class PK/value pair under the idx root key
                    for (let i = 0; i < valueArray.length; i++) {
                        let valueHash = valueArray[i];
                        Object.keys(valueHash).forEach(function (valKey) {
                            // Create new row
                            let recRow = document.createElement("tr");

                            // Populate left TD
                            let recNameTD = document.createElement("td");
                            if (idxKey !== 'null') {
                                let objValA = document.createElement("a");
                                objValA.innerHTML = idxKey;
                                $(objValA).on('click', function () {
                                    // Send command to search for this index value
                                    thisApplet.GetIndexKey(idxKey, idxSType);
                                });
                                recNameTD.appendChild(objValA);
                            } else {
                                recNameTD.innerHTML = idxKey;
                            }

                            // Populate middle TD
                            let recKeyTD = document.createElement("td");

                            // Get class PK; if it's indexed, make it linkable
                            if (pkSType) {
                                let objValA = document.createElement("a");
                                objValA.innerHTML = valKey;
                                $(objValA).on('click', function () {
                                    // Send command
                                    thisApplet.GetIndexKey(valKey, pkSType);
                                });
                                recKeyTD.appendChild(objValA);
                            } else {
                                recKeyTD.innerHTML = valKey;
                            }

                            // Populate right TD
                            let recValTD = document.createElement("td");

                            // Add an entry to the TD for each result
                            let entrySpan = document.createElement("div");
                            entrySpan.className = 'entryContainer';

                            // Set Value field
                            let entryValue = valueHash[valKey];
                            let entryValSpan = document.createElement("span");
                            entryValSpan.className = 'entryVal';
                            // If val is indexed, make it linkable
                            if (valueSType) {
                                let objValA = document.createElement("a");
                                objValA.innerHTML = entryValue;
                                $(objValA).on('click', function () {
                                    // Send command
                                    thisApplet.GetIndexKey(entryValue, valueSType);
                                    console.log("Sending index search for '" + entryValue + "'");
                                });
                                entryValSpan.appendChild(objValA);
                            } else {
                                entryValSpan.innerHTML = entryValue;
                            }

                            // Append to right TD
                            entrySpan.appendChild(entryValSpan);
                            recValTD.appendChild(entrySpan);

                            recRow.appendChild(recNameTD);
                            recRow.appendChild(recKeyTD);
                            recRow.appendChild(recValTD);
                            tableBody.appendChild(recRow);
                        });
                    }
                });
            }
            tableObj.appendChild(tableBody);
            return tableObj;
        } else {
            let tableObj = document.createElement("table");
            tableObj.className = 'QR';

            let tblHead = document.createElement("thead");
            let tblHeadRow = document.createElement("tr");
            let tblHeadCol1 = document.createElement("th");
            tblHeadCol1.innerHTML = "(Stereotype) " + idxSType;
            tblHeadRow.appendChild(tblHeadCol1);
            tblHead.appendChild(tblHeadRow);
            tableObj.appendChild(tblHead);

            let tableBody = document.createElement("tbody");

            for (let h = 0; h < records.length; h++) {
                let record = records[h];
                Object.keys(record).forEach(function (idxKey) {
                    valueArray = record[idxKey];

                    // Loop over each data class PK/value pair under the idx root key
                    for (let i = 0; i < valueArray.length; i++) {
                        valKey = valueArray[i];

                        // Create new row
                        let recRow = document.createElement("tr");

                        // Populate left TD
                        let recNameTD = document.createElement("td");
                        if (idxKey !== 'null') {
                            let objValA = document.createElement("a");
                            objValA.innerHTML = idxKey;
                            $(objValA).on('click', function () {
                                // Send command to search for this index value
                                thisApplet.GetIndexKey(idxKey, idxSType);
                            });
                            recNameTD.appendChild(objValA);
                        } else {
                            recNameTD.innerHTML = idxKey;
                        }

                        recRow.appendChild(recNameTD);
                        tableBody.appendChild(recRow);
                    }
                });
            }
            tableObj.appendChild(tableBody);
            return tableObj;
        }
    }

    DisplayObjectArrayNested(recvObjectArray, targetDiv) {
        let thisApplet = this;
        targetDiv.innerHTML = '<br>';
        for (let i = 0; i < recvObjectArray.length; i++) {
            let recvObject = recvObjectArray[i];
            let objUpstream = recvObject.parents;
            let objThis = recvObject;
            let objChildren = recvObject.children;

            for (let h = 0; h < objUpstream.length; h++) {
                let upstreamObj = objUpstream[h];
                let upstreamTable = thisApplet.MakeTable('UK', upstreamObj);
                targetDiv.appendChild(upstreamTable);
            }

            if (objThis.data) {
                let parentObj = objThis;
                let parentTable = thisApplet.MakeTable('MK', parentObj);
                targetDiv.appendChild(parentTable);
            }

            for (let h = 0; h < objChildren.length; h++) {
                let childObj = objChildren[h];
                let childTable = thisApplet.MakeTable('FK', childObj);
                targetDiv.appendChild(childTable);
                let objGrandChildren = objChildren[h].children;

                for (let j = 0; j < objGrandChildren.length; j++) {
                    let grandChildObj = objGrandChildren[j];
                    let grandChildTable = thisApplet.MakeTable('GC', grandChildObj);
                    targetDiv.appendChild(grandChildTable);
                }
            }

            if (i + 1 < recvObjectArray.length) {
                targetDiv.appendChild(document.createElement("br"));
            }
        }
    }

    FieldStereotype(className, fieldName) {
        let thisApplet = this;
        let sTypeName = null;
        //let patt = /^_/;
        //if (fieldName == "ObjectType" || patt.test(fieldName)) return sTypeName;
        let attributeDef = thisApplet.dataStructs['ClassTypes'][className].Attributes[fieldName];
        if (attributeDef && attributeDef.Restrictions) {
            let attrConstr = attributeDef.Restrictions;
            let keyArr = attrConstr.split(",");
            for (let k = 0; k < keyArr.length; k++) {
                switch (keyArr[k]) {
                    case 'MK':
                        sTypeName = attributeDef.Stereotype;
                        break;
                    case 'FK':
                        sTypeName = attributeDef.Stereotype;
                        break;
                    case 'PK':
                        break;
                    default:
                        break;
                }

            }
        }
        return sTypeName;
    }

    MakeTable(tableClass, dataObj) {
        let thisApplet = this;
        let tableObj = document.createElement("table");
        tableObj.className = tableClass;
        Object.keys(dataObj.data).forEach(function (fieldName) {
            let recRow = document.createElement("tr");
            let recNameTD = document.createElement("td");
            recNameTD.innerHTML = fieldName;
            let recValTD = document.createElement("td");

            // Add value - make link if item is indexed
            let objVal = dataObj.data[fieldName];
            let fieldSType = thisApplet.FieldStereotype(dataObj['classType'], fieldName);
            if (fieldSType) {
                if (Object.prototype.toString.call(objVal) === '[object Array]') {
                    for (let q = 0; q < objVal.length; q++) {
                        let objValSub = objVal[q];
                        let objValA = document.createElement("a");
                        objValA.innerHTML = objValSub;
                        $(objValA).on('click', function () {
                            // Send command
                            let recVal = this.innerHTML;
                            thisApplet.GetIndexKey(recVal, fieldSType);
                            console.log("Sending index search for '" + recVal + "'");
                        });
                        recValTD.appendChild(objValA);
                        if (q + 1 !== objVal.length) {
                            recValTD.appendChild(document.createElement("br"));
                        }
                    }
                } else {
                    let objValA = document.createElement("a");
                    objValA.innerHTML = objVal;
                    $(objValA).on('click', function () {
                        // Send command
                        thisApplet.GetIndexKey(objVal, fieldSType);
                    });
                    recValTD.appendChild(objValA);
                }
            } else {
                let outText = '';
                if (Object.prototype.toString.call(objVal) === '[object Array]') {
                    for (let q = 0; q < objVal.length; q++) {
                        let objValSub = objVal[q];
                        outText += objValSub;
                        if (q + 1 !== objVal.length) {
                            outText += "<br>";
                        }
                    }
                } else {
                    outText += objVal;
                }
                recValTD.innerHTML = outText;
            }

            recRow.appendChild(recNameTD);
            recRow.appendChild(recValTD);
            tableObj.appendChild(recRow);
        });
        return tableObj;
    }

    RecvDone() {
        let thisApplet = this;
        thisApplet.leftMenu = new VDMCollapseTree(thisApplet.leftPane);
        $.each(thisApplet.dataStructs['ClassTypes'], function (itemCheck, itemValue) {
            let objClassName = itemCheck;
            let objClassRef = thisApplet.dataStructs['ClassTypes'][objClassName];
            if (!objClassRef.recCount) {
                objClassRef.recCount = 0;
            }
            //if (objClassRef.recCount > -1) {
            // Add to menu
            let recCountText = '';
            //if (objClassRef.recCount) {
            recCountText = " [" + objClassRef.recCount + "]";
            //}
            thisApplet.leftMenu.addItem(null, objClassName + recCountText, '', objClassRef, true, function () {
                thisApplet.lastClickedLI = $(this).parent();
            });

            Object.keys(objClassRef.Attributes).forEach(function (fieldName) {
                let patt = /^_/;
                if (!(fieldName === "ObjectType" || patt.test(fieldName))) {
                    let itemTag = fieldName;
                    if (objClassRef.Attributes[fieldName].Restrictions) {
                        itemTag += "(" + objClassRef.Attributes[fieldName].Stereotype + ":" + objClassRef.Attributes[fieldName].Restrictions + ")";
                    }
                    thisApplet.leftMenu.addItem(objClassRef, itemTag, '', objClassRef.Attributes[fieldName], false, function () {
                        let pkAttr = objClassRef.Attributes[objClassRef.PrimaryKey];
                        let keyType = "FK";
                        let mkPattern = new RegExp("MK");
                        if (mkPattern.test(pkAttr.Restrictions)) {
                            keyType = "MK";
                        }
                        let queryText = "LIST STEREOTYPE['" + pkAttr.Stereotype + "']." + keyType + "['" + objClassName + "']['ObjectType'] WHERE " + keyType + "['" + objClassName + "']['" + fieldName + "'] = \"\"";
                        $(thisApplet.menuQuery.queryField).val(queryText);
                        thisApplet.SetCaretPosition(thisApplet.menuQuery.queryField, thisApplet.menuQuery.queryField.value.length - 1);
                    });
                }
            });
        });
    }
}

let AppletProfile = {
    "appletName": "HiveBrowser",
    "title": "Hive Browser",
    "sizeX": 800,
    "sizeY": 400,
    "appletIcon": "fa-book",
    "showInMenu": true,
    "preloadDeps": true,
    "dependencies": [
        { "CSS": "vdmapplets/vdm-app-HiveBrowser.css" }
    ]
}

export { AppletProfile, AppletClass }
//# sourceURL=vdm-app-HiveBrowser.js
