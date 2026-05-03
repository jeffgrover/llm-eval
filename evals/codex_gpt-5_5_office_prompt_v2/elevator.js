(function(root) {
    "use strict";

    function mat(color, opacity) {
        return new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });
    }

    function box(group, x, y, z, w, h, d, material) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z);
        m.renderOrder = 1;
        group.add(m);
        return m;
    }

    class Elevator {
        constructor(scene, world) {
            this.world = world;
            this.logic = new ElevatorLogic({ floorCount: WORLD.FLOOR_COUNT, maxCapacity: 4, floorHeight: WORLD.FLOOR_HEIGHT });
            this.group = new THREE.Group();
            this.group.renderOrder = 1;
            scene.add(this.group);
            this.buttons = [];

            const frame = mat(0xf2c94c, 0.5);
            const opaque = new THREE.MeshLambertMaterial({ color: 0xd6a928 });
            box(this.group, 0, 0.04, 0, 2.75, 0.08, 2.75, frame);
            box(this.group, 0, 2.32, 0, 2.75, 0.08, 2.75, frame);
            box(this.group, -1.37, 1.18, 0, 0.08, 2.28, 2.75, frame);
            box(this.group, 1.37, 1.18, 0, 0.08, 2.28, 2.75, frame);
            box(this.group, 0, 1.18, -1.37, 2.75, 2.28, 0.08, opaque);
            this.leftDoor = box(this.group, -0.68, 1.05, 1.38, 1.34, 2.1, 0.08, mat(0xffd95a, 0.7));
            this.rightDoor = box(this.group, 0.68, 1.05, 1.38, 1.34, 2.1, 0.08, mat(0xffd95a, 0.7));

            const panel = box(this.group, 1.18, 1.25, -0.55, 0.08, 1.25, 0.7, new THREE.MeshLambertMaterial({ color: 0x222222 }));
            panel.rotation.y = 0;
            const buttonMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
            const litMat = new THREE.MeshBasicMaterial({ color: 0xffbb22 });
            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 16), buttonMat);
                b.rotation.z = Math.PI / 2;
                b.position.set(1.125, 0.75 + f * 0.18, -0.82);
                b.userData.dark = buttonMat;
                b.userData.lit = litMat;
                b.renderOrder = 1;
                this.group.add(b);
                this.buttons[f] = b;
            }
            this.indicator = createIndicator(0.6, 0.6, "0");
            this.indicator.position.set(0, 2.06, 1.43);
            this.group.add(this.indicator);
            this.syncAliases();
        }

        syncAliases() {
            const l = this.logic;
            this.state = l.state;
            this.direction = l.direction;
            this.currentFloor = l.currentFloor;
            this.targetFloor = l.targetFloor;
            this.upCalls = l.upCalls;
            this.downCalls = l.downCalls;
            this.destinations = l.destinations;
            this.passengers = l.passengers;
            this.pendingBoarders = l.pendingBoarders;
            this.pendingDisembark = l.pendingDisembark;
            this.spotOccupancy = l.spotOccupancy;
        }

        callUp(floor) { this.logic.callUp(floor); this.syncAliases(); }
        callDown(floor) { this.logic.callDown(floor); this.syncAliases(); }
        pressDestination(floor) { this.logic.pressDestination(floor); this.syncAliases(); }
        isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { const s = this.logic.reserveBoardingSpot(person); this.syncAliases(); return s; }
        completeBoard(person) { this.logic.completeBoard(person); this.syncAliases(); }
        registerDisembark(person) { this.logic.registerDisembark(person); this.syncAliases(); }
        completeDisembark(person) { this.logic.completeDisembark(person); this.syncAliases(); }
        reset() { this.logic.reset(); this.updateVisuals(); this.syncAliases(); }

        localSpotToWorld(spot) {
            return this.group.localToWorld(new THREE.Vector3(spot.x, spot.y, spot.z));
        }

        doorOpenAmount() {
            const l = this.logic;
            if (l.state === "DOOR_OPEN" || l.state === "IDLE") return l.state === "DOOR_OPEN" ? 1 : 0;
            if (l.state === "DOOR_OPENING") return Math.min(1, l.doorTimer / l.DOOR_OPENING_S);
            if (l.state === "DOOR_CLOSING") return 1 - Math.min(1, l.doorTimer / l.DOOR_CLOSING_S);
            return 0;
        }

        updateVisuals() {
            const l = this.logic;
            this.group.position.y = l.positionY;
            const open = this.doorOpenAmount();
            this.leftDoor.position.x = -0.68 - open * 0.62;
            this.rightDoor.position.x = 0.68 + open * 0.62;
            for (let f = 0; f < this.buttons.length; f++) {
                this.buttons[f].material = l.destinations.has(f) ? this.buttons[f].userData.lit : this.buttons[f].userData.dark;
            }
            const dir = l.direction > 0 ? "^" : l.direction < 0 ? "v" : "";
            const text = String(l.currentFloor) + dir;
            this.indicator.userData.setIndicator(text);
            this.world.floors.forEach((floor, i) => {
                floor.callPanel.userData.setUp(l.upCalls.has(i));
                floor.callPanel.userData.setDown(l.downCalls.has(i));
                floor.callPanel.userData.setIndicator(String(l.currentFloor));
                floor.shaftIndicator.userData.setIndicator(text);
            });
        }

        tick(dt) {
            this.logic.tick(dt);
            this.updateVisuals();
            this.syncAliases();
        }
    }

    root.Elevator = Elevator;
})(window);
