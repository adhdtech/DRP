class AppletClass extends XRApplet {
    constructor(appletProfile, xrSession) {
        super(appletProfile, xrSession);
        let thisApplet = this;
    }

    async RunStartup() {
        let thisApplet = this;
        let engine = thisApplet.xrSession.babylonEngine;

        let multimediaRoot = ".";

        let canvas = document.getElementById("renderCanvas");
        let skyMaterial;
        var sphere;
        let globe;
        let controllerHash = {
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

        // This creates a basic Babylon Scene object (non-mesh)

        let scene = new BABYLON.Scene(engine);
        let xr = await scene.createDefaultXRExperienceAsync();

        skyMaterial = new BABYLON.StandardMaterial("skybox", scene);
        skyMaterial.backFaceCulling = false;
        skyMaterial.reflectionTexture = new BABYLON.CubeTexture("assets/webxr/textures/skybox02", scene, ["_px.png", "_py.png", "_pz.png", "_ax.png", "_ay.png", "_az.png"]);
        skyMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        //skyMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.CUBIC_MODE;
        skyMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        //let skybox = BABYLON.Mesh.CreateBox("skybox", 10.0, scene);
        let skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 10.0 }, scene);
        skybox.material = skyMaterial;
        skybox.position.set(0, 1, 0);

        let camera = new BABYLON.FreeCamera("", new BABYLON.Vector3(0, 0, -1), scene)
        let light = new BABYLON.DirectionalLight("", new BABYLON.Vector3(0, -1, 1), scene)
        light.specular = new BABYLON.Color3(0, 0, 0);
        light.diffuse = new BABYLON.Color3(1, 1, 1);
        light.intensity = .4;
        light.position.y = 10;

        sphere = BABYLON.Mesh.CreateSphere("sphere", 100, .5, scene);
        sphere.rotation.x = Math.PI;
        sphere.position.set(0, 1.5, 2); // lateral, height, depth

        let alpha = 0;
        scene.beforeRender = function () {
            sphere.rotation.y = alpha;
            alpha -= 0.01;
        };

        //Add material to sphere
        let groundMaterial = new BABYLON.StandardMaterial("mat", scene);
        groundMaterial.emissiveTexture = new BABYLON.Texture('assets/webxr/textures/earth2-normal.jpg', scene);
        groundMaterial.bumpTexture = new BABYLON.Texture('assets/webxr/textures/earthbump.jpg', scene);
        groundMaterial.emissiveTexture.level = .6;
        sphere.material = groundMaterial;

        let head = BABYLON.Mesh.CreateBox("", 0.2, scene)
        head.position.set(-0.5, 1, 0);
        console.log("hookAdded = false");

        let hookAdded = false;

        let counter = 0;
        let controllersDetected = false;

        let music = new BABYLON.Sound("Music", "assets/webxr/sounds/jg-032316-sfx-sub-pulse.mp3", scene, null, { loop: true, autoplay: true });

        // Logic to be run every frame
        scene.onBeforeRenderObservable.add(() => {

            if (0 && counter === 360) {
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

        thisApplet.BabylonScene = scene;
        thisApplet.xr = xr;

        engine.runRenderLoop(function () {
            scene.render();
            for (let i = 0; i < xr.input.controllers.length; i++) {
                if (!xr.input.controllers[i].motionController) continue;
                let gamepad = xr.input.controllers[i].motionController.gamepadObject;
                if ("hapticActuators" in gamepad && gamepad.hapticActuators.length > 0) {
                    for (let j = 0; j < gamepad.buttons.length; ++j) {
                        if (gamepad.buttons[j].pressed) {
                            // Vibrate the gamepad using to the value of the button as
                            // the vibration intensity, normalized to 0.0..1.0 range.
                            gamepad.hapticActuators[0].pulse((j + 1.0) / (gamepad.buttons.length + 1), 1000);
                            break;
                        }
                    }
                }
            }
        });
    }
}

let AppletProfile = {
    "appletName": "Grid",
    "title": "Grid",
    "appletIcon": "fa-book",
    "showInMenu": true,
    "dependencies": []
}

export { AppletProfile, AppletClass }
//# sourceURL=xr-app-Grid.js