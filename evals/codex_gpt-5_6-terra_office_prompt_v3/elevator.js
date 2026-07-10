(function () {
    "use strict";

    function carMaterial(color, opacity) {
        return new THREE.MeshStandardMaterial({
            color: color,
            transparent: opacity < 1,
            opacity: opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            roughness: 0.46,
            metalness: 0.18
        });
    }

    function addCarBox(parent, width, height, depth, x, y, z, material) {
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        parent.add(mesh);
        return mesh;
    }

    function setCarRenderOrder(group) {
        group.traverse(function (mesh) {
            if (mesh.isMesh) mesh.renderOrder = 1;
        });
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });
            this.car = new THREE.Group();
            this.car.name = "Yellow elevator car";
            this.car.position.set(0, 0, 0);
            this.doorLeft = null;
            this.doorRight = null;
            this.destinationButtons = [];
            this.indicatorTexture = null;
            this._makeCar();
            scene.add(this.car);
            this._sync();
            this._updateVisuals();
        }

        _makeCar() {
            var frame = carMaterial(0xf2c64d, 0.5);
            var rear = carMaterial(0xd7a526, 1);
            var doorMat = carMaterial(0xf2c64d, 0.7);
            var dark = carMaterial(0x27323d, 1);
            var buttonMat;
            var button;
            var label;
            var index;
            var indicator;
            addCarBox(this.car, 2.8, 0.16, 2.8, 0, 0.08, 0, frame);
            addCarBox(this.car, 2.8, 0.12, 2.8, 0, 2.88, 0, frame);
            addCarBox(this.car, 0.12, 2.8, 2.8, -1.4, 1.45, 0, frame);
            addCarBox(this.car, 0.12, 2.8, 2.8, 1.4, 1.45, 0, frame);
            addCarBox(this.car, 2.8, 2.8, 0.14, 0, 1.45, -1.4, rear);
            this.doorLeft = addCarBox(this.car, 1.38, 2.55, 0.1, -0.69, 1.36, 1.4, doorMat);
            this.doorRight = addCarBox(this.car, 1.38, 2.55, 0.1, 0.69, 1.36, 1.4, doorMat);
            addCarBox(this.car, 0.55, 2.05, 0.08, 0.96, 1.5, -1.31, dark);
            for (index = 0; index < WORLD.FLOOR_COUNT; index += 1) {
                buttonMat = new THREE.MeshStandardMaterial({ color: 0x4b4e50, emissive: 0x000000, roughness: 0.35, metalness: 0.2 });
                button = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 12), buttonMat);
                button.position.set(0.84, 2.25 - index * 0.29, -1.25);
                button.rotation.x = Math.PI / 2;
                button.renderOrder = 1;
                this.car.add(button);
                label = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd36c }));
                label.scale.set(0.16, 0.16, 1);
                label.position.set(1.07, 2.25 - index * 0.29, -1.22);
                label.renderOrder = 1;
                this.car.add(label);
                this.destinationButtons.push(button);
            }
            this.indicatorTexture = createDigitalTexture("0");
            indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: this.indicatorTexture, side: THREE.DoubleSide }));
            indicator.position.set(0, 2.39, 1.33);
            indicator.rotation.y = Math.PI;
            indicator.renderOrder = 1;
            this.car.add(indicator);
            setCarRenderOrder(this.car);
        }

        _sync() {
            this.state = this.logic.state;
            this.direction = this.logic.direction;
            this.currentFloor = this.logic.currentFloor;
            this.targetFloor = this.logic.targetFloor;
            this.upCalls = this.logic.upCalls;
            this.downCalls = this.logic.downCalls;
            this.destinations = this.logic.destinations;
            this.passengers = this.logic.passengers;
            this.pendingBoarders = this.logic.pendingBoarders;
            this.pendingDisembark = this.logic.pendingDisembark;
            this.spotOccupancy = this.logic.spotOccupancy;
        }

        _updateVisuals() {
            var open = this.logic.doorProgress;
            var display = String(this.logic.currentFloor) + (this.logic.direction > 0 ? "^" : this.logic.direction < 0 ? "v" : "");
            var index;
            var floor;
            this.car.position.y = this.logic.positionFloor * WORLD.FLOOR_HEIGHT;
            this.doorLeft.position.x = -0.69 - open * 0.64;
            this.doorRight.position.x = 0.69 + open * 0.64;
            updateDigitalTexture(this.indicatorTexture, display);
            for (index = 0; index < this.destinationButtons.length; index += 1) {
                this.destinationButtons[index].material.emissive.setHex(this.logic.destinations.has(index) ? 0xff9c00 : 0x000000);
                this.destinationButtons[index].material.color.setHex(this.logic.destinations.has(index) ? 0xffcc50 : 0x4b4e50);
            }
            for (floor = 0; floor < this.world.floors.length; floor += 1) {
                this.world.floors[floor].callPanel.userData.setUp(this.logic.upCalls.has(floor));
                this.world.floors[floor].callPanel.userData.setDown(this.logic.downCalls.has(floor));
                this.world.floors[floor].callPanel.userData.setIndicator(String(this.logic.currentFloor));
                this.world.floors[floor].shaftIndicator.userData.setIndicator(display);
            }
        }

        callUp(floor) { this.logic.callUp(floor); this._sync(); }
        callDown(floor) { this.logic.callDown(floor); this._sync(); }
        pressDestination(floor) { this.logic.pressDestination(floor); this._sync(); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { var spot = this.logic.reserveBoardingSpot(person); this._sync(); return spot; }
        completeBoard(person) { var result = this.logic.completeBoard(person); this._sync(); return result; }
        registerDisembark(person) { var result = this.logic.registerDisembark(person); this._sync(); return result; }
        completeDisembark(person) { var result = this.logic.completeDisembark(person); this._sync(); return result; }

        getSpotWorld(spot) {
            var target = new THREE.Vector3(spot.x, 0, spot.z);
            this.car.localToWorld(target);
            return target;
        }

        worldToCarLocal(vector) {
            return this.car.worldToLocal(vector.clone());
        }

        tick(dt) {
            this.logic.tick(dt);
            this._sync();
            this._updateVisuals();
        }

        reset() {
            this.logic.reset();
            this._sync();
            this._updateVisuals();
        }
    }

    window.Elevator = Elevator;
}());
