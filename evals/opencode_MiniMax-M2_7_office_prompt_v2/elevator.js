/**
 * Three.js elevator car, doors, indicators, and adapter around ElevatorLogic.
 */
(function(root) {
    'use strict';

    const FLOOR_HEIGHT = 3.4;

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: FLOOR_HEIGHT
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;

            this._createCarGeometry();

            this.carGroup.position.y = 0;
            scene.add(this.carGroup);

            this._createDestinationButtons();

            this._inCarIndicator = createInCarIndicator(this.carGroup, 0.8, FLOOR_HEIGHT * 0.5, -0.8);
            this._updateInCarIndicator('0');
        }

        _createCarGeometry() {
            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.5
            });

            const floor_ = new THREE.Mesh(
                new THREE.BoxGeometry(2.6, 0.15, 2.6),
                frameMat
            );
            floor_.position.y = 0;
            this.carGroup.add(floor_);

            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(2.6, 0.15, 2.6),
                frameMat
            );
            ceiling.position.y = FLOOR_HEIGHT;
            this.carGroup.add(ceiling);

            const leftWall = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, 2.6),
                frameMat
            );
            leftWall.position.set(-1.25, FLOOR_HEIGHT / 2, 0);
            this.carGroup.add(leftWall);

            const rightWall = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, 2.6),
                frameMat
            );
            rightWall.position.set(1.25, FLOOR_HEIGHT / 2, 0);
            this.carGroup.add(rightWall);

            const backWall = new THREE.Mesh(
                new THREE.BoxGeometry(2.6, FLOOR_HEIGHT, 0.1),
                new THREE.MeshLambertMaterial({ color: 0xffcc00 })
            );
            backWall.position.set(0, FLOOR_HEIGHT / 2, -1.25);
            this.carGroup.add(backWall);

            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.7
            });

            this._leftDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, FLOOR_HEIGHT * 0.8, 0.1),
                doorMat
            );
            this._leftDoor.position.set(-0.65, FLOOR_HEIGHT * 0.5, 1.3);
            this.carGroup.add(this._leftDoor);

            this._rightDoor = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, FLOOR_HEIGHT * 0.8, 0.1),
                doorMat
            );
            this._rightDoor.position.set(0.65, FLOOR_HEIGHT * 0.5, 1.3);
            this.carGroup.add(this._rightDoor);

            this._leftDoorTarget = 0;
            this._rightDoorTarget = 0;
            this._leftDoorCurrent = 0;
            this._rightDoorCurrent = 0;
        }

        _createDestinationButtons() {
            this._destinationButtons = [];

            const buttonMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
            const activeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

            for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
                const y = 0.3 + i * 0.35;
                const x = 0.9;
                const z = -0.7;

                const button = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8),
                    buttonMat.clone()
                );
                button.rotation.x = Math.PI / 2;
                button.position.set(x, y, z);
                button.userData.floor = i;
                button.userData.active = false;
                this.carGroup.add(button);
                this._destinationButtons.push(button);
            }
        }

        _updateInCarIndicator(text) {
            if (this._inCarIndicator) {
                updateTextTexture(this._inCarIndicator.tex, text);
            }
        }

        _updateFloorIndicator(floor, direction) {
            for (const floorData of this.world.floors) {
                if (floorData.shaftIndicator) {
                    let text = String(floor);
                    if (direction > 0) text += '^';
                    else if (direction < 0) text += 'v';
                    floorData.shaftIndicator.mesh.visible = true;
                    updateTextTexture(floorData.shaftIndicator.tex, text);
                }
            }
        }

        _updateCallPanels() {
            for (const floorData of this.world.floors) {
                if (floorData.callPanel) {
                    const upCalls = this.logic.getUpCalls();
                    const downCalls = this.logic.getDownCalls();
                    floorData.callPanel.userData.setUp(upCalls.has(floorData.floorNumber));
                    floorData.callPanel.userData.setDown(downCalls.has(floorData.floorNumber));
                    floorData.callPanel.userData.setIndicator(String(this.logic.getCurrentFloor()));
                }
            }
        }

        _updateDestinationButtons() {
            const destinations = this.logic.getDestinations();
            for (const button of this._destinationButtons) {
                const isDest = destinations.has(button.userData.floor);
                if (isDest !== button.userData.active) {
                    button.userData.active = isDest;
                    button.material.color.setHex(isDest ? 0x00ff00 : 0x333333);
                }
            }
        }

        _updateDoors(dt) {
            const speed = 3.0;
            const threshold = 0.05;

            let targetLeft = this._leftDoorTarget;
            let targetRight = this._rightDoorTarget;

            const state = this.logic.getState();
            if (state === 'DOOR_OPENING') {
                targetLeft = -1.3;
                targetRight = 1.3;
            } else if (state === 'DOOR_OPEN') {
                targetLeft = -1.3;
                targetRight = 1.3;
            } else if (state === 'DOOR_CLOSING' || state === 'IDLE' || state === 'MOVING') {
                targetLeft = 0;
                targetRight = 0;
            }

            this._leftDoorTarget = targetLeft;
            this._rightDoorTarget = targetRight;

            const dLeft = this._leftDoorTarget - this._leftDoorCurrent;
            const dRight = this._rightDoorTarget - this._rightDoorCurrent;

            if (Math.abs(dLeft) > threshold) {
                this._leftDoorCurrent += Math.sign(dLeft) * speed * dt;
            } else {
                this._leftDoorCurrent = targetLeft;
            }

            if (Math.abs(dRight) > threshold) {
                this._rightDoorCurrent += Math.sign(dRight) * speed * dt;
            } else {
                this._rightDoorCurrent = targetRight;
            }

            this._leftDoor.position.x = -0.65 + this._leftDoorCurrent;
            this._rightDoor.position.x = 0.65 + this._rightDoorCurrent;
        }

        _updateCarPosition(dt) {
            const targetY = this.logic.getCurrentFloor() * FLOOR_HEIGHT;
            const currentY = this.carGroup.position.y;
            const diff = targetY - currentY;

            if (Math.abs(diff) > 0.01) {
                const speed = 8.0;
                const move = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
                this.carGroup.position.y += move;
            } else {
                this.carGroup.position.y = targetY;
            }
        }

        tick(dt) {
            this.logic.tick(dt);

            this._updateCarPosition(dt);
            this._updateDoors(dt);
            this._updateCallPanels();
            this._updateDestinationButtons();

            const floor = this.logic.getCurrentFloor();
            const dir = this.logic.getDirection();
            this._updateFloorIndicator(floor, dir);
            this._updateInCarIndicator(String(floor));
        }

        callUp(floor) {
            this.logic.callUp(floor);
        }

        callDown(floor) {
            this.logic.callDown(floor);
        }

        pressDestination(floor) {
            this.logic.pressDestination(floor);
        }

        isAcceptingAt(floor, direction) {
            return this.logic.isAcceptingAt(floor, direction);
        }

        currentCapacityFree() {
            return this.logic.currentCapacityFree();
        }

        reserveBoardingSpot(person) {
            return this.logic.reserveBoardingSpot(person);
        }

        completeBoard(person) {
            return this.logic.completeBoard(person);
        }

        registerDisembark(person) {
            return this.logic.registerDisembark(person);
        }

        completeDisembark(person) {
            return this.logic.completeDisembark(person);
        }

        reset() {
            this.logic.reset();
            this.carGroup.position.y = 0;
            this._leftDoorCurrent = 0;
            this._rightDoorCurrent = 0;
            this._leftDoor.position.x = -0.65;
            this._rightDoor.position.x = 0.65;
        }

        getState() {
            return this.logic.getState();
        }

        getDirection() {
            return this.logic.getDirection();
        }

        getCurrentFloor() {
            return this.logic.getCurrentFloor();
        }

        getTargetFloor() {
            return this.logic.getTargetFloor();
        }

        getPassengerCount() {
            return this.logic.getPassengerCount();
        }

        getUpCalls() {
            return this.logic.getUpCalls();
        }

        getDownCalls() {
            return this.logic.getDownCalls();
        }

        getDestinations() {
            return this.logic.getDestinations();
        }
    }

    root.Elevator = Elevator;

})(typeof window !== 'undefined' ? window : globalThis);
