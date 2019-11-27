/*
$.ajaxSetup({
    cache: false
});
*/

window.onload = function () {
    // Get target DIV
    var mainPage = document.getElementById('vdmDesktop');

    // Get protocol
    var vdmSvrProt = location.protocol.replace("http", "ws");
    var vdmSvrHost = location.host.split(":")[0];
    let vdmPortString = "";
    let vdmPort = location.host.split(":")[1];
    if (vdmPort) {
        vdmPortString = ":" + vdmPort;
    }
    //var vdmSvrRoute = 'drpnode';
    //var vdmSvrWSTarget = vdmSvrProt + "//" + vdmSvrHost + vdmPortString + "/" + vdmSvrRoute;
    var vdmSvrWSTarget = vdmSvrProt + "//" + vdmSvrHost + vdmPortString;

    // Set applets path
    var vdmAppletsPath = "vdmapplets";

    var myVDMDesktop = new VDMDesktop(mainPage, "rSage Desktop", {});

    var vdmClient = new VDMClient(myVDMDesktop);

    myVDMDesktop.addAppletProfile({
        appletName: 'CommandTesting',
        window: {
            title: 'Command Testing',
            sizeX: 850,
            sizeY: 400
        },
        appletIcon: 'fa-book',
        showInMenu: true,
        appletPath: vdmAppletsPath,
        appletScript: 'vdm-app-CommandTesting.js',
        vdmClient: vdmClient
    });

    myVDMDesktop.addAppletProfile({
        appletName: 'DRPTopology',
        window: {
            title: 'DRP Topology',
            sizeX: 800,
            sizeY: 400
        },
        appletIcon: 'fa-list-alt',
        showInMenu: true,
        appletPath: vdmAppletsPath,
        appletScript: 'vdm-app-DRPTopology.js',
        vdmClient: vdmClient
    });

    myVDMDesktop.addAppletProfile({
        appletName: 'RickRoll',
        window: {
            title: 'RickRoll',
            sizeX: 620,
            sizeY: 400
        },
        appletIcon: 'fa-list-alt',
        showInMenu: false,
        appletPath: vdmAppletsPath,
        appletScript: 'vdm-app-RickRoll.js',
        vdmClient: vdmClient
    });

	/*
    myVDMDesktop.addAppletProfile({
        appletName: 'Blank',
        window: {
            title: 'Blank Template',
            sizeX: 850,
            sizeY: 400
        },
        appletIcon: 'fa-book',
        showInMenu: true,
        appletPath: vdmAppletsPath,
        appletScript: 'vdm-app-Blank.js',
        vdmClient: vdmClient
    });
	*/
    vdmClient.startSession(vdmSvrWSTarget);
};

$(document).ready(function () {
});

