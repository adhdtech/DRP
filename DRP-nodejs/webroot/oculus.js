/** @type {WebVR_Client} */
var myDRPClient;
var babylonScene;
var vrHelper;

class WebVR_Client extends DRP_Client {
    constructor(postOpenCallback) {
        super();

        this.username = '';
        this.wsConn = '';
        this.postOpenCallback = postOpenCallback;

        // This allows the client's document object to be viewed remotely via DRP
        this.HTMLDocument = document;
        this.URL = this.HTMLDocument.baseURI;
        this.wsTarget = null;
        this.platform = this.HTMLDocument.defaultView.navigator.platform;
        this.userAgent = this.HTMLDocument.defaultView.navigator.userAgent;
    }

    async OpenHandler(wsConn, req) {
        let thisWebVRClient = this;
        console.log("WebVR Client to server [" + thisWebVRClient.wsTarget + "] opened");

        let response = await thisWebVRClient.SendCmd(thisWebVRClient.wsConn, "DRP", "hello", {
            platform: this.platform,
            userAgent: this.userAgent,
            URL: this.URL
        }, true, null);

        thisWebVRClient.postOpenCallback();
    }

    async CloseHandler(wsConn, closeCode) {
        //console.log("Broker to Registry client [" + wsConn._socket.remoteAddress + ":" + wsConn._socket.remotePort + "] closed with code [" + closeCode + "]");
        let thisVDMServerAgent = this;
        thisVDMServerAgent.Disconnect();
    }

    async ErrorHandler(wsConn, error) {
        console.log("Consumer to Broker client encountered error [" + error + "]");
    }

    Disconnect(isGraceful) {
        let thisWebVRClient = this;

        if (!isGraceful) {
            console.log("Unexpected connection drop, waiting 10 seconds for reconnect");
            setTimeout(function () {
                //window.location.href = "/";

                // Retry websocket connection
                thisWebVRClient.reconnect = true;
                thisWebVRClient.resetConnection();
                thisWebVRClient.connect(thisWebVRClient.wsTarget);
            }, 10000);
        }
    }

    resetConnection() {
        this.username = '';
        this.wsConn = '';
    }
}

window.onload = function () {

    // Get protocol
    var drpSvrProt = location.protocol.replace("http", "ws");
    var drpSvrHost = location.host.split(":")[0];
    var drpSvrPort = location.host.split(":")[1] || '80';
    let drpPortString = "";
    let drpPort = location.host.split(":")[1];
    if (drpPort) {
        drpPortString = ":" + drpPort;
    }
    var drpSvrWSTarget = drpSvrProt + "//" + drpSvrHost + drpPortString;

    myDRPClient = new WebVR_Client(async function () {
        myDRPClient.lastTopology = await myDRPClient.SendCmd(myDRPClient.wsConn, null, "getTopology", null, true, null);
        setInterval(function () {
            //let timeStamp = new Date().getTime();
            if (myDRPClient.VRHelper.webVRCamera.leftController && myDRPClient.VRHelper.webVRCamera.rightController) {
                let lHandPositionObj = myDRPClient.VRHelper.webVRCamera.leftController.devicePosition;
                let rHandPositionObj = myDRPClient.VRHelper.webVRCamera.rightController.devicePosition;
                let dataPacket = {
                    lHandPosition: {
                        x: lHandPositionObj.x,
                        y: lHandPositionObj.y,
                        z: lHandPositionObj.z
                    },
                    rHandPosition: {
                        x: rHandPositionObj.x,
                        y: rHandPositionObj.y,
                        z: rHandPositionObj.z
                    }
                }
                myDRPClient.SendCmd(myDRPClient.wsConn, "DRP", "sendToTopic", { topicName: "vr", topicData: dataPacket }, false, null);
            }
        }, 100);
    });
    myDRPClient.connect(drpSvrWSTarget);
    myDRPClient.BabylonScene = babylonScene;
    myDRPClient.VRHelper = vrHelper;
    console.log("Connecting VDM client...");
};

var runBabylon = function () {

    var canvas = document.getElementById("renderCanvas");
    var skyMaterial;
    var sphere;
    var globe;
    var controllerHash = {
        aPressed: false,
        bPressed: false,
        xPressed: false,
        yPressed: false,

        onAChange: function (stateObject) {
            if (!controllerHash.aPressed) {
                if (stateObject.pressed) {
                    controllerHash.aPressed = true;
                    console.log("Pressed A")
                }
            } else {
                if (!stateObject.pressed) {
                    controllerHash.aPressed = false;
                    console.log("Released A")
                }
            }
        },

        onBChange: function (stateObject) {
            if (!controllerHash.bPressed) {
                if (stateObject.pressed) {
                    controllerHash.bPressed = true;
                    console.log("Pressed B")
                }
            } else {
                if (!stateObject.pressed) {
                    controllerHash.bPressed = false;
                    console.log("Released B")
                }
            }
        },

        onXChange: function (stateObject) {
            if (!controllerHash.xPressed) {
                if (stateObject.pressed) {
                    controllerHash.xPressed = true;
                    console.log("Pressed X")
                }
            } else {
                if (!stateObject.pressed) {
                    controllerHash.xPressed = false;
                    console.log("Released X")
                }
            }
        },

        onYChange: function (stateObject) {
            if (!controllerHash.yPressed) {
                if (stateObject.pressed) {
                    controllerHash.yPressed = true;
                    console.log("Pressed Y")
                }
            } else {
                if (!stateObject.pressed) {
                    controllerHash.yPressed = false;
                    console.log("Released Y")
                }
            }
        }
    };

    var createScene = function () {

        // This creates a basic Babylon Scene object (non-mesh)

        var scene = new BABYLON.Scene(engine);
        vrHelper = scene.createDefaultVRExperience();

        skyMaterial = new BABYLON.StandardMaterial("skybox", scene);
        skyMaterial.backFaceCulling = false;
        skyMaterial.reflectionTexture = new BABYLON.CubeTexture("assets/webxr/textures/skybox02", scene, ["_px.png", "_py.png", "_pz.png", "_ax.png", "_ay.png", "_az.png"]);
        skyMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        //skyMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.CUBIC_MODE;
        skyMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        //var skybox = BABYLON.Mesh.CreateBox("skybox", 10.0, scene);
        var skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 10.0 }, scene);
        skybox.material = skyMaterial;
        skybox.position.set(0, 1, 0);

        var camera = new BABYLON.FreeCamera("", new BABYLON.Vector3(0, 0, -1), scene)
        light = new BABYLON.DirectionalLight("", new BABYLON.Vector3(0, -1, 1), scene)
        light.specular = new BABYLON.Color3(0, 0, 0);
        light.diffuse = new BABYLON.Color3(1, 1, 1);
        light.intensity = .4;
        light.position.y = 10;

        sphere = BABYLON.Mesh.CreateSphere("sphere", 100, .5, scene);
        sphere.rotation.x = Math.PI;
        sphere.position.set(0, 1.5, 2); // lateral, height, depth

        var alpha = 0;
        scene.beforeRender = function () {
            sphere.rotation.y = alpha;
            alpha -= 0.01;
        };

        //Add material to sphere
        var groundMaterial = new BABYLON.StandardMaterial("mat", scene);
        groundMaterial.emissiveTexture = new BABYLON.Texture('assets/webxr/textures/earth2-normal.jpg', scene);
        groundMaterial.bumpTexture = new BABYLON.Texture('assets/webxr/textures/earthbump.jpg', scene);
        //groundMaterial.diffuseTexture.uRotationCenter = 0;
        //groundMaterial.diffuseTexture.vRotationCenter = 0;
        //groundMaterial.diffuseTexture.wRotationCenter = 0;
        groundMaterial.emissiveTexture.level = .6;
        sphere.material = groundMaterial;

        //var ground = BABYLON.Mesh.CreateGround("ground1", 6, 6, 2, scene);

        //var leftHand = BABYLON.Mesh.CreateBox("",0.1, scene)
        //leftHand.scaling.z = 2;
        //var rightHand = leftHand.clone()
        var head = BABYLON.Mesh.CreateBox("", 0.2, scene)
        head.position.set(-0.5, 1, 0);
        console.log("hookAdded = false");

        var hookAdded = false;

        var counter = 0;
        var controllersDetected = false;
        console.dir(vrHelper.webVRCamera.controllers);

        var music = new BABYLON.Sound("Music", "assets/webxr/sounds/jg-032316-sfx-sub-pulse.mp3", scene, null, { loop: true, autoplay: true });

        // Logic to be run every frame
        scene.onBeforeRenderObservable.add(() => {
            /*
            if ((! vrHelper.webVRCamera.leftController) && vrHelper.webVRCamera.controllers[0]) {
                vrHelper.webVRCamera.leftController = vrHelper.webVRCamera.controllers[0];
                vrHelper.webVRCamera.rightController = vrHelper.webVRCamera.controllers[1];
                console.log("Added controller objects");
            }
            */
            // Left and right hand position/rotation
            /*
            if(vrHelper._leftController){
                leftHand.position = vrHelper._leftController.webVRController.devicePosition.clone()
                leftHand.rotationQuaternion = vrHelper._leftController.webVRController.deviceRotationQuaternion.clone()
            }
            if(vrHelper._rightController){
    
                if (! hookAdded) {
                    console.log("hookAdded = true");
                    hookAdded = true;
                    console.log("Hook added");
                    vrHelper._rightController.webVRController.onAButtonStateChangedObservable.add(()=>{
                        console.log("Button state changed");
                    })
                }
    
                rightHand.position = vrHelper._rightController.webVRController.devicePosition.clone()
                rightHand.rotationQuaternion = vrHelper._rightController.webVRController.deviceRotationQuaternion.clone()
            }
            */
            // Head position/rotation
            //head.position = vrHelper.webVRCamera.devicePosition.clone()
            head.rotationQuaternion = vrHelper.webVRCamera.deviceRotationQuaternion.clone()
            head.rotationQuaternion.z = 0;
            //head.position.z = 2;

            if (counter === 360) {
                if (!controllersDetected && vrHelper.webVRCamera.controllers.length > 0) {
                    controllersDetected = true;
                    console.dir(vrHelper.webVRCamera);
                    console.dir(vrHelper.webVRCamera.controllers);

                    // Button Hooks
                    vrHelper.webVRCamera.rightController.onAButtonStateChangedObservable.add(controllerHash.onAChange);
                    vrHelper.webVRCamera.rightController.onBButtonStateChangedObservable.add(controllerHash.onBChange);
                    vrHelper.webVRCamera.leftController.onXButtonStateChangedObservable.add(controllerHash.onXChange);
                    vrHelper.webVRCamera.leftController.onYButtonStateChangedObservable.add(controllerHash.onYChange);

                }
                counter = 0;
            }

            counter++;
        })
        return scene;
    };

    //var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    var engine = new BABYLON.Engine(canvas, true);
    var scene = createScene();

    engine.runRenderLoop(function () {
        if (scene) {
            scene.render();
        }
    });

    // Resize
    window.addEventListener("resize", function () {
        engine.resize();
    });

    console.log("Babylon setup complete");
    babylonScene = scene;
};

document.addEventListener("DOMContentLoaded", function () {
    // Handler when the DOM is fully loaded
    runBabylon();
});