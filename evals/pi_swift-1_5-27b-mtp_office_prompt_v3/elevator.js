/*
 * elevator.js - visual elevator car, sliding doors, floor call panels.
 * Reads the pure ElevatorLogic state each frame. Browser globals only.
 */
(function () {
    "use strict";

    var carGroup = null;
    var leftDoor = null;
    var rightDoor = null;
    var logic = null;

    var carMat = new THREE.MeshLambertMaterial({ color: 0xb9c2d0 });
    var carInnerMat = new THREE.MeshLambertMaterial({ color: 0x8f99aa });
    var doorMat = new THREE.MeshLambertMaterial({ color: 0x6f7a8c, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    var trimMat = new THREE.MeshLambertMaterial({ color: 0x454d5e });

    function createElevator(carGroupRef, elevLogic, world) {
        carGroup = new THREE.Group();
        logic = elevLogic;

        // interior: floor, ceiling, back + side walls (front open toward doors)
        var floorM = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 2.7), carInnerMat);
        floorM.position.set(0, 0.05, 0);
        carGroup.add(floorM);

        var ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 2.7), carMat);
        ceiling.position.set(0, 2.65, 0);
        carGroup.add(ceiling);

        var back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.5, 0.1), carMat);
        back.position.set(0, 1.4, -1.3);
        carGroup.add(back);

        var sideL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 2.7), carMat);
        sideL.position.set(-1.3, 1.4, 0);
        carGroup.add(sideL);

        var sideR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 2.7), carMat);
        sideR.position.set(1.3, 1.4, 0);
        carGroup.add(sideR);

        // sliding doors at the front face (z = +1.3)
        leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.5, 0.08), doorMat);
        leftDoor.position.set(-0.675, 1.4, 1.3);
        carGroup.add(leftDoor);

        rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.5, 0.08), doorMat);
        rightDoor.position.set(0.675, 1.4, 1.3);
        carGroup.add(rightDoor);

        // door frame
        var frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.12), trimMat);
        frame.position.set(0, 2.72, 1.3);
        carGroup.add(frame);

        carGroup.traverse(function (o) { if (o.isMesh) o.renderOrder = 1; });
        carGroup.position.y = 0.05;
        scene_add(carGroup);

        return {
            update: function (dt) {
                if (!logic) return;
                var FH = window.WORLD.FLOOR_HEIGHT;
                carGroup.position.y = logic.position * FH + 0.05;

                // door fraction
                var frac = 0;
                var T = window.ElevatorLogic.DOOR_TRANSIT_S;
                if (logic.state === "DOOR_OPENING") frac = Math.min(1, logic.doorTimer / T);
                else if (logic.state === "DOOR_OPEN") frac = 1;
                else if (logic.state === "DOOR_CLOSING") frac = Math.max(0, 1 - logic.doorTimer / T);
                leftDoor.position.x = -0.675 - 1.35 * frac;
                rightDoor.position.x = 0.675 + 1.35 * frac;

                updatePanels();
            }
        };
    }

    function scene_add(obj) {
        if (window.scene) window.scene.add(obj);
    }

    function updatePanels() {
        if (!logic || !window.world) return;
        var floors = window.world.floors;
        var carFloor = Math.round(logic.position);
        var doorsOpen = logic.state === "DOOR_OPEN" || logic.state === "DOOR_OPENING" || logic.state === "DOOR_CLOSING";
        for (var f = 0; f < floors.length; f++) {
            var panel = floors[f].callPanel;
            if (panel && panel.userData) {
                panel.userData.setUp(logic.upCalls.has(f));
                panel.userData.setDown(logic.downCalls.has(f));
                var label = (carFloor === f) ? (f === 0 ? "L" : String(f)) : "\u00B7";
                panel.userData.setIndicator(label);
            }
            var shaft = floors[f].shaftIndicator;
            if (shaft) {
                var sLabel = (carFloor === f) ? (f === 0 ? "L" : String(f)) : "\u00B7";
                if (doorsOpen && carFloor === f) sLabel = (f === 0 ? "L" : String(f)) + " \u25CF";
                window.updateTextTexture(shaft, sLabel, 190);
            }
        }
    }

    window.createElevator = createElevator;
})();
