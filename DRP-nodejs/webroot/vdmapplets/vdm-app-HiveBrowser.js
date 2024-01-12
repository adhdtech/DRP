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

            thisApplet.appFuncs = {
                "setCaretPosition": function (elem, caretPos) {
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
                },
                "changeDataScreen": function (newSelectedScreen) {
                    if (thisApplet.appVars.selectedScreen !== newSelectedScreen) {
                        if (thisApplet.appVars.selectedScreen) {
                            $(thisApplet.appVars.rightPaneScreens[thisApplet.appVars.selectedScreen].screenDiv).removeClass('selected');
                        }
                        $(thisApplet.appVars.rightPaneScreens[newSelectedScreen].screenDiv).addClass('selected');
                        thisApplet.appVars.selectedScreen = newSelectedScreen;
                    }
                },
                "goBack": async function () {
                    if (thisApplet.appVars.searchHistory.length) {
                        let searchPacket = thisApplet.appVars.searchHistory.pop();
                        while (searchPacket === thisApplet.appVars.lastSearch) {
                            searchPacket = thisApplet.appVars.searchHistory.pop();
                        }
                        thisApplet.appVars.lastSearch = searchPacket;
                        if (searchPacket) {
                            thisApplet.appVars.lastSearch = searchPacket;
                            console.log("Search history entries: " + thisApplet.appVars.searchHistory.length);
                            let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysNested", { "Key": searchPacket["Key"], "Stereotype": searchPacket["Stereotype"] }, true);
                            thisApplet.appFuncs.changeDataScreen('ObjDisplay');
                            thisApplet.appFuncs.displayObjectArrayNested(recvData.records, thisApplet.appVars.rightPaneScreens['ObjDisplay'].screenDiv);
                        }
                    }
                },
                "searchIndexes": async function (keyVal, sTypeName) {
                    let searchPacket = { "Key": keyVal, "Stereotype": sTypeName };
                    thisApplet.appVars.lastSearch = searchPacket;
                    thisApplet.appVars.searchHistory.push(searchPacket);
                    console.log("Search history entries: " + thisApplet.appVars.searchHistory.length);
                    let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysChildren", { "Key": keyVal, "Stereotype": sTypeName }, true);
                    thisApplet.appFuncs.changeDataScreen('ObjDisplay');
                    thisApplet.appFuncs.displayObjectArrayNested(recvData.records, thisApplet.appVars.rightPaneScreens['ObjDisplay'].screenDiv);
                },
                "getIndexKey": async function (keyVal, sTypeName) {
                    let searchPacket = { "Key": keyVal, "Stereotype": sTypeName };
                    thisApplet.appVars.lastSearch = searchPacket;
                    thisApplet.appVars.searchHistory.push(searchPacket);
                    console.log("Search history entries: " + thisApplet.appVars.searchHistory.length);
                    let recvData = await thisApplet.sendCmd("Hive", "searchStereotypeKeysNested", { "Key": keyVal, "Stereotype": sTypeName }, true);
                    thisApplet.appFuncs.changeDataScreen('ObjDisplay');
                    thisApplet.appFuncs.displayObjectArrayNested(recvData.records, thisApplet.appVars.rightPaneScreens['ObjDisplay'].screenDiv);
                },
                "displayHiveQuery": function (recvObject, targetDiv) {
                    targetDiv.innerHTML = '';

                    if (recvObject.records.length && recvObject.icrQuery) {
                        let resultTable = thisApplet.appFuncs.makeTableQueryResults(
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
                },
                "makeTableQueryResults": function (records, idxSType, recClassName, recColName) {
                    if (recClassName) {
                        let pkFieldName = thisApplet.appVars.dataStructs['ClassTypes'][recClassName].PrimaryKey;
                        let pkSType = thisApplet.appFuncs.fieldStereotype(recClassName, pkFieldName);
                        let valueSType = thisApplet.appFuncs.fieldStereotype(recClassName, recColName);

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
                                                thisApplet.appFuncs.getIndexKey(idxKey, idxSType);
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
                                                thisApplet.appFuncs.getIndexKey(valKey, pkSType);
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
                                                thisApplet.appFuncs.getIndexKey(entryValue, valueSType);
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
                                            thisApplet.appFuncs.getIndexKey(idxKey, idxSType);
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
                },
                "displayObjectArrayNested": function (recvObjectArray, targetDiv) {
                    targetDiv.innerHTML = '<br>';
                    for (let i = 0; i < recvObjectArray.length; i++) {
                        let recvObject = recvObjectArray[i];
                        let objUpstream = recvObject.parents;
                        let objThis = recvObject;
                        let objChildren = recvObject.children;

                        for (let h = 0; h < objUpstream.length; h++) {
                            let upstreamObj = objUpstream[h];
                            let upstreamTable = thisApplet.appFuncs.makeTable('UK', upstreamObj);
                            targetDiv.appendChild(upstreamTable);
                        }

                        if (objThis.data) {
                            let parentObj = objThis;
                            let parentTable = thisApplet.appFuncs.makeTable('MK', parentObj);
                            targetDiv.appendChild(parentTable);
                        }

                        for (let h = 0; h < objChildren.length; h++) {
                            let childObj = objChildren[h];
                            let childTable = thisApplet.appFuncs.makeTable('FK', childObj);
                            targetDiv.appendChild(childTable);
                            let objGrandChildren = objChildren[h].children;

                            for (let j = 0; j < objGrandChildren.length; j++) {
                                let grandChildObj = objGrandChildren[j];
                                let grandChildTable = thisApplet.appFuncs.makeTable('GC', grandChildObj);
                                targetDiv.appendChild(grandChildTable);
                            }
                        }

                        if (i + 1 < recvObjectArray.length) {
                            targetDiv.appendChild(document.createElement("br"));
                        }
                    }
                },
                "fieldStereotype": function (className, fieldName) {
                    let sTypeName = null;
                    //let patt = /^_/;
                    //if (fieldName == "ObjectType" || patt.test(fieldName)) return sTypeName;
                    let attributeDef = thisApplet.appVars.dataStructs['ClassTypes'][className].Attributes[fieldName];
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
                },
                "makeTable": function (tableClass, dataObj) {
                    let tableObj = document.createElement("table");
                    tableObj.className = tableClass;
                    Object.keys(dataObj.data).forEach(function (fieldName) {
                        let recRow = document.createElement("tr");
                        let recNameTD = document.createElement("td");
                        recNameTD.innerHTML = fieldName;
                        let recValTD = document.createElement("td");

                        // Add value - make link if item is indexed
                        let objVal = dataObj.data[fieldName];
                        let fieldSType = thisApplet.appFuncs.fieldStereotype(dataObj['classType'], fieldName);
                        if (fieldSType) {
                            if (Object.prototype.toString.call(objVal) === '[object Array]') {
                                for (let q = 0; q < objVal.length; q++) {
                                    let objValSub = objVal[q];
                                    let objValA = document.createElement("a");
                                    objValA.innerHTML = objValSub;
                                    $(objValA).on('click', function () {
                                        // Send command
                                        let recVal = this.innerHTML;
                                        thisApplet.appFuncs.getIndexKey(recVal, fieldSType);
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
                                    thisApplet.appFuncs.getIndexKey(objVal, fieldSType);
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
                },
                "recvDone": function () {
                    thisApplet.appVars.leftMenu = new VDMCollapseTree(thisApplet.appVars.leftPane);
                    $.each(thisApplet.appVars.dataStructs['ClassTypes'], function (itemCheck, itemValue) {
                        let objClassName = itemCheck;
                        let objClassRef = thisApplet.appVars.dataStructs['ClassTypes'][objClassName];
                        if (!objClassRef.recCount) {
                            objClassRef.recCount = 0;
                        }
                        //if (objClassRef.recCount > -1) {
                        // Add to menu
                        let recCountText = '';
                        //if (objClassRef.recCount) {
                        recCountText = " [" + objClassRef.recCount + "]";
                        //}
                        thisApplet.appVars.leftMenu.addItem(null, objClassName + recCountText, '', objClassRef, true, function () {
                            thisApplet.appVars.lastClickedLI = $(this).parent();
                        });

                        Object.keys(objClassRef.Attributes).forEach(function (fieldName) {
                            let patt = /^_/;
                            if (!(fieldName === "ObjectType" || patt.test(fieldName))) {
                                let itemTag = fieldName;
                                if (objClassRef.Attributes[fieldName].Restrictions) {
                                    itemTag += "(" + objClassRef.Attributes[fieldName].Stereotype + ":" + objClassRef.Attributes[fieldName].Restrictions + ")";
                                }
                                thisApplet.appVars.leftMenu.addItem(objClassRef, itemTag, '', objClassRef.Attributes[fieldName], false, function () {
                                    let pkAttr = objClassRef.Attributes[objClassRef.PrimaryKey];
                                    let keyType = "FK";
                                    let mkPattern = new RegExp("MK");
                                    if (mkPattern.test(pkAttr.Restrictions)) {
                                        keyType = "MK";
                                    }
                                    let queryText = "LIST STEREOTYPE['" + pkAttr.Stereotype + "']." + keyType + "['" + objClassName + "']['ObjectType'] WHERE " + keyType + "['" + objClassName + "']['" + fieldName + "'] = \"\"";
                                    $(thisApplet.menuQuery.queryField).val(queryText);
                                    thisApplet.appFuncs.setCaretPosition(thisApplet.menuQuery.queryField, thisApplet.menuQuery.queryField.value.length - 1);
                                });
                            }
                        });
                        //};
                    });
                }
            };

            thisApplet.appVars = {
                selectedScreen: "",
                rightPaneScreens: {
                    "ObjDisplay": {
                        itemClass: 'objDisplay',
                        fields: [],
                        screenDiv: null
                    }
                },
                lastSearch: null,
                searchHistory: [],
                leftMenu: null,
                leftPane: null,
                vDiv: null,
                rightPane: null,
                dataStructs: {
                    'StereoTypes': {},
                    'ClassTypes': {}
                }
            };
        }

        async RunStartup() {
            let thisApplet = this;

            // Split data pane horizontally
            let newPanes = thisApplet.SplitPaneHorizontal(thisApplet.windowParts["data"], 175, true, true);
            thisApplet.appVars.leftPane = newPanes[0];
            thisApplet.appVars.vDiv = newPanes[1];
            thisApplet.appVars.rightPane = newPanes[2];
            $(thisApplet.windowParts["data"]).addClass("vdmApp-HiveBrowser");

            $.each(thisApplet.appVars.rightPaneScreens, function (itemName, itemValue) {
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
                            thisApplet.appVars.dataStructs[thisItem.structName].outputTable = caab;
                            break;
                        default:
                            break;
                    }
                    ca.appendChild(caa);
                    thisItem.fieldDiv = caa;
                }
                thisApplet.appVars.rightPane.appendChild(ca);
                itemValue.screenDiv = ca;
            });

            thisApplet.appVars.rightPane.tabIndex = 0;
            $(thisApplet.appVars.rightPane).keydown(function (e) {
                if (e.keyCode === 8) {
                    thisApplet.appFuncs.goBack();
                }
            });

            thisApplet.appVars.dataStructs['StereoTypes'] = await thisApplet.sendCmd("Hive", "listStereoTypes", null, true);
            thisApplet.appVars.dataStructs['ClassTypes'] = await thisApplet.sendCmd("Hive", "getClassDefinitions", null, true);
            let classDataTypes = await thisApplet.sendCmd("Hive", "listClassDataTypes", null, true);
            if (classDataTypes) {
                let classDataTypeKeys = Object.keys(classDataTypes);
                for (let i = 0; i < classDataTypeKeys.length; i++) {
                    let recKey = classDataTypeKeys[i];
                    thisApplet.appVars.dataStructs['ClassTypes'][recKey].recCount = classDataTypes[recKey].recCount;
                }
            }

            thisApplet.appFuncs.recvDone();

            if (thisApplet.menuSearch) {
                $(thisApplet.menuSearch.searchField).keyup(function (e) {
                    if (e.keyCode === 13) {
                        let searchKey = $(thisApplet.menuSearch.searchField).val().replace(/(\r\n|\n|\r)/gm, "");
                        //let searchKey = $(thisApplet.menuSearch.searchField).val().trim();
                        $(thisApplet.menuSearch.searchField).val(searchKey);
                        thisApplet.appFuncs.searchIndexes(searchKey, null);
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
                        thisApplet.appFuncs.changeDataScreen('ObjDisplay');
                        thisApplet.appFuncs.displayHiveQuery(recvData, thisApplet.appVars.rightPaneScreens['ObjDisplay'].screenDiv);
                    }
                });
            }
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
