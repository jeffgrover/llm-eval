(function () {
    "use strict";

    function officeElevatorTransparent(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.48,
            metalness: 0.14
        });
    }

    function officeElevatorSolid(color, emissive) {
        return new THREE.MeshStandardMaterial({
            color: color,
            emissive: emissive || 0x000000,
            emissiveIntensity: emissive ? 1.2 : 0,
            roughness: 0.5,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
    }

    function officeElevatorBox(parent, size, position, material, name) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
        mesh.position.set(position[0], position[1], position[2]);
        mesh.name = name;
        parent.add(mesh);
        return mesh;
    }

    class Elevator {
        constructor(scene, world) {
            this.world = world;
            this.logic = new window.ElevatorLogic({
                floorCount: window.WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: window.WORLD.FLOOR_HEIGHT
            });
            this.car = new THREE.Group();
            this.car.name = "yellow-elevator-car";
            this.car.renderOrder = 1;
            this.destinationButtons = [];
            this._buildCar();
            scene.add(this.car);
            this._updateVisuals();
        }

        _buildCar() {
            var frameMaterial = officeElevatorTransparent(0xf2c84b, 0.5);
            var doorMaterial = officeElevatorTransparent(0xf5cd4f, 0.7);
            var backMaterial = officeElevatorSolid(0xc89f25, 0x2a1a00);
            officeElevatorBox(this.car, [2.9, 0.14, 2.9], [0, 0.07, 0], frameMaterial, "car-floor");
            officeElevatorBox(this.car, [2.9, 0.14, 2.9], [0, 2.86, 0], frameMaterial, "car-ceiling");
            officeElevatorBox(this.car, [0.12, 2.78, 2.9], [-1.44, 1.46, 0], frameMaterial, "car-left-wall");
            officeElevatorBox(this.car, [0.12, 2.78, 2.9], [1.44, 1.46, 0], frameMaterial, "car-right-wall");
            officeElevatorBox(this.car, [2.9, 2.78, 0.13], [0, 1.46, -1.44], backMaterial, "car-back-wall");
            this.leftDoor = officeElevatorBox(this.car, [1.42, 2.55, 0.1], [-0.71, 1.38, 1.47], doorMaterial, "left-sliding-door");
            this.rightDoor = officeElevatorBox(this.car, [1.42, 2.55, 0.1], [0.71, 1.38, 1.47], doorMaterial, "right-sliding-door");

            var panelMaterial = officeElevatorSolid(0x34383d, 0x050505);
            officeElevatorBox(this.car, [0.77, 1.76, 0.08], [0.9, 1.35, -1.35], panelMaterial, "destination-panel");
            for (var floorIndex = 0; floorIndex < window.WORLD.FLOOR_COUNT; floorIndex += 1) {
                var buttonMaterial = officeElevatorSolid(0x6f767b, 0x000000);
                var button = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.055, 16), buttonMaterial);
                button.rotation.x = Math.PI * 0.5;
                var column = floorIndex % 2;
                var row = Math.floor(floorIndex / 2);
                button.position.set(0.72 + column * 0.34, 1.82 - row * 0.45, -1.285);
                button.userData.floor = floorIndex;
                this.destinationButtons.push(button);
                this.car.add(button);
            }

            this.insideIndicatorTexture = this.world.createTextTexture("0");
            var indicatorFrame = officeElevatorBox(this.car, [0.72, 0.72, 0.07], [0, 2.47, 1.4], panelMaterial, "inside-indicator-frame");
            indicatorFrame.rotation.y = Math.PI;
            var indicator = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: this.insideIndicatorTexture, side: THREE.DoubleSide })
            );
            indicator.position.set(0, 2.47, 1.355);
            indicator.rotation.y = Math.PI;
            indicator.name = "inside-floor-indicator";
            this.car.add(indicator);
            var cabinLight = new THREE.PointLight(0xffe6a5, 0.46, 7);
            cabinLight.position.set(0, 2.58, 0);
            this.car.add(cabinLight);
            this.car.traverse(function (object) {
                object.renderOrder = 1;
                if (object.material && object.material.transparent) {
                    object.material.depthWrite = false;
                    object.material.side = THREE.DoubleSide;
                }
            });
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
        get spotOccupancy() { return this.logic.spotOccupancy; }

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }

        reserveBoardingSpot(person) {
            var spot = this.logic.reserveBoardingSpot(person);
            if (!spot) {
                return null;
            }
            spot.localTarget = new THREE.Vector3(spot.x, spot.y, spot.z);
            return spot;
        }

        completeBoard(person) { return this.logic.completeBoard(person); }
        registerDisembark(person) { return this.logic.registerDisembark(person); }
        completeDisembark(person) { return this.logic.completeDisembark(person); }

        _doorOpenAmount() {
            if (this.logic.state === "DOOR_OPEN") {
                return 1;
            }
            if (this.logic.state === "DOOR_OPENING") {
                return Math.min(1, this.logic.stateTimer / this.logic.DOOR_OPENING_S);
            }
            if (this.logic.state === "DOOR_CLOSING") {
                return Math.max(0, 1 - this.logic.stateTimer / this.logic.DOOR_CLOSING_S);
            }
            return 0;
        }

        _indicatorText() {
            var shownFloor = Math.max(0, Math.min(window.WORLD.FLOOR_COUNT - 1, Math.round(this.logic.positionY / window.WORLD.FLOOR_HEIGHT)));
            if (this.logic.direction > 0 && this.logic.state === "MOVING") {
                return String(shownFloor) + "^";
            }
            if (this.logic.direction < 0 && this.logic.state === "MOVING") {
                return String(shownFloor) + "v";
            }
            return String(this.logic.currentFloor);
        }

        _updateVisuals() {
            this.car.position.y = this.logic.positionY;
            var opening = this._doorOpenAmount();
            this.leftDoor.position.x = -0.71 - opening * 0.63;
            this.rightDoor.position.x = 0.71 + opening * 0.63;
            var indicatorText = this._indicatorText();
            this.world.updateTextTexture(this.insideIndicatorTexture, indicatorText);
            this.world.floors.forEach((floorData) => {
                floorData.callPanel.userData.setUp(this.logic.upCalls.has(floorData.floorNumber));
                floorData.callPanel.userData.setDown(this.logic.downCalls.has(floorData.floorNumber));
                floorData.callPanel.userData.setIndicator(String(floorData.floorNumber));
                floorData.shaftIndicator.userData.setIndicator(indicatorText);
            });
            this.destinationButtons.forEach((button) => {
                var active = this.logic.destinations.has(button.userData.floor);
                button.material.color.setHex(active ? 0xffd65c : 0x6f767b);
                button.material.emissive.setHex(active ? 0xff9d00 : 0x000000);
                button.material.emissiveIntensity = active ? 1.8 : 0;
            });
        }

        tick(dt) {
            this.logic.tick(dt);
            this._updateVisuals();
        }

        reset() {
            this.logic.reset();
            this._updateVisuals();
        }
    }

    window.Elevator = Elevator;
})();
