(class extends XRApplet {
    constructor(appletProfile, xrSession) {
        super(appletProfile, xrSession);
        let thisApplet = this;
    }

    async runStartup() {
        let thisApplet = this;
        let engine = thisApplet.xrSession.babylonEngine;

        let multimediaRoot = ".";

        function setupCameraForCollisions(camera) {
            camera.checkCollisions = true;
            camera.applyGravity = true;
            camera.ellipsoid = new BABYLON.Vector3(1, 1, 1);
        }

        BABYLON.SceneLoader.Load("", `${multimediaRoot}/testscene.babylon`, engine, function (scene) {
            // Wait for textures and shaders to be ready
            scene.executeWhenReady(async function () {

                /*
                var camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 2.5, -6), scene);
                camera.setTarget(BABYLON.Vector3.Zero());
                camera.attachControl(canvas, true);
                setupCameraForCollisions(camera);
                */

                let musicFile = `${multimediaRoot}/forest-loop.mp3`;

                // Attach camera to canvas inputs
                scene.activeCamera.attachControl(thisApplet.xrSession.renderCanvas);
                setupCameraForCollisions(scene.activeCamera);
                let ground = scene.getMeshByID("Plane");
                let tree1 = scene.getMeshByID("Tree1");
                let tree2 = scene.getMeshByID("Tree2");

                // here we add XR support
                let xr = await scene.createDefaultXRExperienceAsync({
                    floorMeshes: [ground],
                    //disableDefaultUI: true,
                    disableTeleportation: true
                });
                //xr.teleportation.teleportationEnabled = false;

                ground.checkCollisions = true;

                const featureManager = xr.baseExperience.featuresManager;

                setupCameraForCollisions(xr.input.xrCamera);

                let turnHoldover = false;

                let customRegistrationConfigurations = [
                    {
                        allowedComponentTypes: [BABYLON.WebXRControllerComponent.THUMBSTICK_TYPE, BABYLON.WebXRControllerComponent.TOUCHPAD_TYPE],
                        forceHandedness: "right",
                        axisChangedHandler: (
                            axes,
                            movementState,
                            featureContext,
                            xrInput
                        ) => {
                            movementState.rotateX = Math.abs(axes.x) > featureContext.rotationThreshold ? axes.x : 0;
                            movementState.rotateY = Math.abs(axes.y) > featureContext.rotationThreshold ? axes.y : 0;

                            /*
                            // The rotation threshold has not been met and turnHoldover is set; reset it
                            if (Math.abs(axes.x) <= featureContext.rotationThreshold && turnHoldover) {
                                turnHoldover = false;
                            }

                            // We want to snap turn
                            if (Math.abs(axes.x) > featureContext.rotationThreshold && !turnHoldover) {
                                let snapTurnAmount = 30; //Math.PI/4;
                                movementState.rotateX = axes.x < 0 ? -snapTurnAmount : snapTurnAmount;
                                turnHoldover = true;
                            } else {
                                movementState.rotateX = 0;
                            }
                            */
                        },
                    },
                    {
                        allowedComponentTypes: [BABYLON.WebXRControllerComponent.THUMBSTICK_TYPE, BABYLON.WebXRControllerComponent.TOUCHPAD_TYPE],
                        forceHandedness: "left",
                        axisChangedHandler: (
                            axes,
                            movementState,
                            featureContext,
                            xrInput
                        ) => {
                            movementState.moveX = Math.abs(axes.x) > featureContext.movementThreshold ? axes.x : 0;
                            movementState.moveY = Math.abs(axes.y) > featureContext.movementThreshold ? axes.y : 0;
                        },
                    }
                ];

                const movementFeature = featureManager.enableFeature(BABYLON.WebXRFeatureName.MOVEMENT, 'latest', {
                    xrInput: xr.input,
                    // add options here
                    movementOrientationFollowsViewerPose: true, // default true
                    movementSpeed: .18,
                    rotationSpeed: .18,
                    customRegistrationConfigurations: customRegistrationConfigurations
                });

                for (let i = 0; i < scene.lights.length; i++) {
                    scene.lights[i].intensity = .75;
                }

                let getRandomRotation = () => {
                    let randomAngle = Math.floor(Math.random() * 360);
                    let radians = BABYLON.Tools.ToRadians(randomAngle);
                    return radians;
                }

                let rows = 10;
                let cols = 10;
                for (let i = 0; i < rows; i++) {
                    for (let j = 0; j < cols; j++) {
                        let newTree = tree1.clone();
                        newTree.rotation.y = getRandomRotation();
                        newTree.position.x += i * 15 - (rows * 15 / 2);
                        newTree.position.z += j * 15;
                    }
                }

                let music = new BABYLON.Sound("Music", musicFile, scene, null, { loop: true, autoplay: true });

                let newMeshes = await BABYLON.SceneLoader.ImportMeshAsync(null, `${multimediaRoot}/hazel/`, "Hazel_01.gltf", scene);

                let mouseScaling = 0.05;
                let cowScaling = 0.25;

                let oculusTouchLeft = null;
                let oculusTouchRight = null;

                let mouse1 = newMeshes.transformNodes[0];
                mouse1.scaling.scaleInPlace(mouseScaling);
                mouse1.rotate(BABYLON.Axis.Y, BABYLON.Tools.ToRadians(180));
                mouse1.position.z -= 10;

                let mouse2 = mouse1.clone();
                mouse2.position.x += 4;
                mouse2.rotation.y = BABYLON.Tools.ToRadians(180);

                mouse1.position.x += 4;

                let newMeshes2 = await BABYLON.SceneLoader.ImportMeshAsync(null, `${multimediaRoot}/cow/`, "cow.glb", scene);
                let cow1 = newMeshes2.meshes[0];
                cow1.scaling.scaleInPlace(cowScaling);
                cow1.position.z -= 10;
                cow1.rotate(BABYLON.Axis.Y, BABYLON.Tools.ToRadians(180));

                thisApplet.BabylonScene = scene;
                thisApplet.xr = xr;

                let touchedA = false;
                let pressedA = false;
                let touchedB = false;
                let pressedB = false;

                let grabbedMesh = null;

                xr.input.onControllerAddedObservable.add((controller) => {
                    controller.onMotionControllerInitObservable.add((motionController) => {
                        /*
                        if (motionController.handness === 'left') {
                            let xr_ids = motionController.getComponentIds();
                            let triggerComponent = motionController.getComponent(xr_ids[0]);//xr-standard-trigger
                            triggerComponent.onButtonStateChangedObservable.add(() => {
                                if (triggerComponent.pressed) {
                                    Box_Left_Trigger.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);

                                } else {
                                    Box_Left_Trigger.scaling = new BABYLON.Vector3(1, 1, 1);

                                }
                            });
                            let squeezeComponent = motionController.getComponent(xr_ids[1]);//xr-standard-squeeze
                            squeezeComponent.onButtonStateChangedObservable.add(() => {
                                if (squeezeComponent.pressed) {
                                    Box_Left_Squeeze.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);

                                } else {
                                    Box_Left_Squeeze.scaling = new BABYLON.Vector3(1, 1, 1);
                                }
                            });
                            let thumbstickComponent = motionController.getComponent(xr_ids[2]);//xr-standard-thumbstick
                            thumbstickComponent.onButtonStateChangedObservable.add(() => {
                                if (thumbstickComponent.pressed) {
                                    Box_Left_ThumbStick.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);
                                } else {
                                    Box_Left_ThumbStick.scaling = new BABYLON.Vector3(1, 1, 1);
                                }
                            });
                            thumbstickComponent.onAxisValueChangedObservable.add((axes) => {
                                //https://playground.babylonjs.com/#INBVUY#87
                                //inactivate camera rotation : not working so far
                                //Box_Left_ThumbStick is moving according to stick axes but camera rotation is also changing..
                                // Box_Left_ThumbStick.position.x += (axes.x)/100;
                                //  Box_Left_ThumbStick.position.y -= (axes.y)/100;
                                // console.log(values.x, values.y);
                            });

                            let xbuttonComponent = motionController.getComponent(xr_ids[3]);//x-button
                            xbuttonComponent.onButtonStateChangedObservable.add(() => {
                                if (xbuttonComponent.pressed) {
                                    Sphere_Left_XButton.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);

                                } else {
                                    Sphere_Left_XButton.scaling = new BABYLON.Vector3(1, 1, 1);
                                }
                            });
                            let ybuttonComponent = motionController.getComponent(xr_ids[4]);//y-button
                            ybuttonComponent.onButtonStateChangedObservable.add(() => {
                                if (ybuttonComponent.pressed) {
                                    Sphere_Left_YButton.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);

                                } else {
                                    Sphere_Left_YButton.scaling = new BABYLON.Vector3(1, 1, 1);
                                }
                            });
                        }
                        */
                        if (motionController.handness === 'right') {

                            oculusTouchRight = motionController;

                            let xr_ids = motionController.getComponentIds();
                            let triggerComponent = motionController.getComponent(xr_ids[0]);//xr-standard-trigger
                            triggerComponent.onButtonStateChangedObservable.add(() => {
                                if (triggerComponent.pressed) {
                                    //mouse1.scaling.scaleInPlace(2);

                                } else {
                                    //mouse1.scaling.scaleInPlace(.5);

                                }
                            });
                            let squeezeComponent = motionController.getComponent(xr_ids[1]);//xr-standard-squeeze
                            squeezeComponent.onButtonStateChangedObservable.add(() => {
                                if (triggerComponent.pressed) {
                                    //mouse2.scaling.scaleInPlace(2);

                                } else {
                                    //mouse2.scaling.scaleInPlace(.5);

                                }
                            });
                            let thumbstickComponent = motionController.getComponent(xr_ids[2]);//xr-standard-thumbstick
                            thumbstickComponent.onButtonStateChangedObservable.add(() => {
                                if (thumbstickComponent.pressed) {
                                    //cow1.scaling.scaleInPlace(2);
                                } else {
                                    //cow1.scaling.scaleInPlace(.5);
                                }

                            });
                            thumbstickComponent.onAxisValueChangedObservable.add((axes) => {
                                //Box_Right_ThumbStick is moving according to stick axes but camera rotation is also changing..
                                // Box_Right_ThumbStick.position.x += (axes.x)/100;
                                // Box_Right_ThumbStick.position.y += (axes.y)/100;
                                // console.log(values.x, values.y);
                            });

                            let abuttonComponent = motionController.getComponent(xr_ids[3]);//a-button
                            abuttonComponent.onButtonStateChangedObservable.add(() => {
                                if (!pressedA && abuttonComponent.pressed) {
                                    pressedA = true;
                                    mouse1.scaling.scaleInPlace(2);
                                    oculusTouchRight.pulse(0.25, 100);
                                } else if (pressedA && !abuttonComponent.pressed) {
                                    pressedA = false;
                                    mouse1.scaling.scaleInPlace(.5);
                                }
                            });
                            let bbuttonComponent = motionController.getComponent(xr_ids[4]);//b-button
                            bbuttonComponent.onButtonStateChangedObservable.add(() => {
                                if (!pressedB && bbuttonComponent.pressed) {
                                    pressedB = true;
                                    mouse2.scaling.scaleInPlace(2);
                                    oculusTouchRight.pulse(0.25, 100);
                                } else if (pressedB && !bbuttonComponent.pressed) {
                                    pressedB = false;
                                    mouse2.scaling.scaleInPlace(.5);
                                }
                            });

                            /* not worked.
                            let thumbrestComponent = motionController.getComponent(xr_ids[5]);//thumrest
                            thumbrestComponent.onButtonStateChangedObservable.add(() => {
                                //not worked
                                if ((thumbrestComponent.value>0.1&&thumbrestComponent.value<0.6) {
                                    sphere1.position.y=10;
                                }
                                if(thumbrestComponent.touched){
                                     sphere1.position.y=10;
                                }

                            });
                            */

                            /*
                             const xr_ids = motionController.getComponentIds();
                             for (let i=0;i<xr_ids.length;i++){
                                 console.log("right:"+xr_ids[i]);
                             }
                            */
                        }

                    })

                });

                scene.onPointerObservable.add((pointerInfo) => {
                    //console.log('POINTER DOWN', pointerInfo)
                    if (pointerInfo.pickInfo.hit && pointerInfo.pickInfo.pickedMesh) {
                        // "Grab" it by attaching the picked mesh to the VR Controller
                        if (xr.baseExperience.state === BABYLON.WebXRState.IN_XR) {
                            let xrInput = xr.pointerSelection.getXRControllerByPointerId(pointerInfo.event.pointerId)
                            let motionController = xrInput.motionController
                            if (motionController) {
                                grabbedMesh = pointerInfo.pickInfo.pickedMesh;
                                pointerInfo.pickInfo.pickedMesh.setParent(motionController.rootMesh);
                            }
                        } else {
                            // here is the non-xr support
                        }
                    }
                }, BABYLON.PointerEventTypes.POINTERDOWN);

                scene.onPointerObservable.add((pointerInfo) => {
                    //console.log('POINTER UP', pointerInfo)
                    if (grabbedMesh) {
                        grabbedMesh.setParent(null);
                        grabbedMesh = null;
                    }
                }, BABYLON.PointerEventTypes.POINTERUP);


                engine.runRenderLoop(function () {
                    scene.render();
                    /*
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
                    */
                });

            });
        }, function (progress) {
            // To do: give progress feedback to user
        });

    }
});
//# sourceURL=xr-app-Forest.js
