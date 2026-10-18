/* elevator.js - Three.js car and adapter around the pure ElevatorLogic. */
(function () {
    "use strict";

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });

            const carGroup = new THREE.Group();
            carGroup.name = "elevatorCar";
            carGroup.renderOrder = 1;
            this.carGroup = carGroup;
            this.group = carGroup;
            scene.add(carGroup);

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xf0c43a, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide
            });
            const backMat = new THREE.MeshLambertMaterial({ color: 0xd8a92c });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffd85c, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide
            });
            const trimMat = new THREE.MeshLambertMaterial({ color: 0x8b741e });
            const panelMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });

            function addCarMesh(mesh) {
                mesh.renderOrder = 1;
                carGroup.add(mesh);
                return mesh;
            }

            const floorMesh = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.2), frameMat));
            floorMesh.position.y = -0.05;
            const ceiling = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.2), frameMat));
            ceiling.position.y = 2.7;
            const leftWall = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 2.2), frameMat));
            leftWall.position.set(-1.2, 1.35, 0);
            const rightWall = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 2.2), frameMat));
            rightWall.position.set(1.2, 1.35, 0);
            const backWall = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.7, 0.12), backMat));
            backWall.position.set(0, 1.35, -1.1);

            const doorTop = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.16), trimMat));
            doorTop.position.set(0, 2.58, 1.1);

            const leftDoor = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.45, 0.08), doorMat));
            leftDoor.position.set(-0.6, 1.22, 1.1);
            const rightDoor = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.45, 0.08), doorMat));
            rightDoor.position.set(0.6, 1.22, 1.1);
            carGroup.leftDoor = leftDoor;
            carGroup.rightDoor = rightDoor;

            // Destination panel with one button per floor.
            const panel = addCarMesh(new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.55, 0.08), panelMat));
            panel.position.set(0.72, 1.4, -1.02);
            this.buttons = [];
            const buttonGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12);
            for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
                const row = Math.floor(f / 2);
                const col = f % 2;
                const button = new THREE.Mesh(
                    buttonGeo,
                    new THREE.MeshBasicMaterial({ color: 0x444444 })
                );
                button.rotation.x = Math.PI / 2;
                button.position.set(0.55 + col * 0.34, 2.0 - row * 0.3, -0.96);
                button.userData.floor = f;
                button.renderOrder = 1;
                carGroup.add(button);
                this.buttons.push(button);
            }

            const inCarTex = window.createDisplayTexture(256);
            const inCarIndicator = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: inCarTex })
            );
            inCarIndicator.position.set(0, 2.32, 1.035);
            inCarIndicator.rotation.y = Math.PI;
            inCarIndicator.renderOrder = 1;
            carGroup.add(inCarIndicator);
            this.inCarTexture = inCarTex;
            this.inCarIndicator = inCarIndicator;

            this.doorOpenness = 0;
            this._syncVisuals();
        }

        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }
        get doorTimer() { return this.logic.doorTimer; }

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
        completeBoard(person) { return this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }
        reset() {
            this.logic.reset();
            this.doorOpenness = 0;
            this._syncVisuals();
        }

        tick(dt) {
            this.logic.tick(dt);
            this._syncVisuals();
        }

        _syncVisuals() {
            const logic = this.logic;
            this.carGroup.position.set(0, logic.carY * WORLD.FLOOR_HEIGHT, 0);

            let openness = 0;
            if (logic.state === "DOOR_OPEN") {
                openness = 1;
            } else if (logic.state === "DOOR_OPENING") {
                openness = Math.min(1, logic.doorTimer / logic.doorOpenTime);
            } else if (logic.state === "DOOR_CLOSING") {
                openness = Math.max(0, 1 - logic.doorTimer / logic.doorCloseTime);
            }
            this.doorOpenness = openness;
            const shift = 0.6 + openness * 1.05;
            this.carGroup.leftDoor.position.x = -shift;
            this.carGroup.rightDoor.position.x = shift;

            const arrow = logic.direction > 0 ? "^" : (logic.direction < 0 ? "v" : "-");
            const label = String(logic.currentFloor) + arrow;
            window.updateDisplayTexture(this.inCarTexture, label);

            for (let i = 0; i < this.buttons.length; i += 1) {
                const button = this.buttons[i];
                const lit = logic.destinations.has(button.userData.floor) ||
                    (logic.state === "DOOR_OPEN" && logic.currentFloor === button.userData.floor);
                button.material.color.setHex(lit ? 0xffcc33 : 0x444444);
            }

            for (let f = 0; f < this.world.floors.length; f += 1) {
                const floor = this.world.floors[f];
                if (floor.callPanel && floor.callPanel.userData) {
                    floor.callPanel.userData.setUp(logic.upCalls.has(f));
                    floor.callPanel.userData.setDown(logic.downCalls.has(f));
                    floor.callPanel.userData.setIndicator(label);
                }
                if (floor.shaftIndicator && floor.shaftIndicator.userData) {
                    floor.shaftIndicator.userData.setIndicator(label);
                }
            }
        }
    }

    window.Elevator = Elevator;
})();
