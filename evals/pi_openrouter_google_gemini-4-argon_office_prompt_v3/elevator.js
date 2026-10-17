class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;
        this.carWidth = 2.7;
        this.carDepth = 2.7;
        this.carHeight = 2.95;

        this._buildCarGeometry();
        this._syncStateFromLogic();
        this.scene.add(this.carGroup);
    }

    _buildCarGeometry() {
        const w = this.carWidth;
        const d = this.carDepth;
        const h = this.carHeight;

        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xeab308, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide
        });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xca8a04 });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xfacc15, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide
        });

        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), backMat);
        floorMesh.position.set(0, 0.05, 0);
        const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), frameMat);
        ceilMesh.position.set(0, h - 0.04, 0);
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), backMat);
        backWall.position.set(0, h / 2, -d / 2);
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d), frameMat);
        leftWall.position.set(-w / 2, h / 2, 0);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d), frameMat);
        rightWall.position.set(w / 2, h / 2, 0);
        this.carGroup.add(floorMesh, ceilMesh, backWall, leftWall, rightWall);

        const doorW = w / 2 - 0.02;
        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, h - 0.12, 0.06), doorMat);
        this.leftDoor.position.set(-doorW / 2, h / 2, d / 2);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, h - 0.12, 0.06), doorMat);
        this.rightDoor.position.set(doorW / 2, h / 2, d / 2);
        this.carGroup.add(this.leftDoor, this.rightDoor);

        const panelBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.95, 0.32),
            new THREE.MeshLambertMaterial({ color: 0x1f2937 })
        );
        panelBox.position.set(w / 2 - 0.06, 1.35, 0.55);
        this.carGroup.add(panelBox);

        this.btnOffMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
        this.btnOnMat = new THREE.MeshBasicMaterial({ color: 0xffbb22 });
        this.destButtons = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), this.btnOffMat);
            btn.rotation.z = Math.PI / 2;
            btn.position.set(w / 2 - 0.08, 1.0 + f * 0.13, 0.55);
            this.carGroup.add(btn);
            this.destButtons.push(btn);
        }

        this.inCarIndicator = createTextIndicator(0.6, "0");
        this.inCarIndicator.position.set(0, h - 0.38, d / 2 - 0.05);
        this.inCarIndicator.rotation.y = Math.PI;
        this.carGroup.add(this.inCarIndicator);

        this.carGroup.traverse((obj) => {
            if (obj.isMesh) obj.renderOrder = 1;
        });
    }

    _syncStateFromLogic() {
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
    }

    callUp(floor) {
        this.logic.callUp(floor);
        this._updateVisuals();
    }

    callDown(floor) {
        this.logic.callDown(floor);
        this._updateVisuals();
    }

    pressDestination(floor) {
        this.logic.pressDestination(floor);
        this._updateVisuals();
    }

    isAcceptingAt(floor, direction) {
        return this.logic.isAcceptingAt(floor, direction);
    }

    currentCapacityFree() {
        return this.logic.currentCapacityFree();
    }

    reserveBoardingSpot(person) {
        const spot = this.logic.reserveBoardingSpot(person);
        if (!spot) return null;
        return {
            index: spot.index,
            localPos: new THREE.Vector3(spot.x, spot.y, spot.z),
            worldPos: new THREE.Vector3(spot.x, this.logic.y + spot.y, spot.z)
        };
    }

    completeBoard(person) {
        this.logic.completeBoard(person);
    }

    registerDisembark(person) {
        this.logic.registerDisembark(person);
    }

    completeDisembark(person) {
        this.logic.completeDisembark(person);
    }

    reset() {
        this.logic.reset();
        this._syncStateFromLogic();
        this._updateVisuals();
    }

    _updateVisuals() {
        this.carGroup.position.y = this.logic.y;
        const doorW = this.carWidth / 2 - 0.02;
        const slide = this.logic.doorOpenProgress * (doorW - 0.08);
        this.leftDoor.position.x = -doorW / 2 - slide;
        this.rightDoor.position.x = doorW / 2 + slide;

        const dirGlyph = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
        const indicatorText = String(this.logic.currentFloor) + dirGlyph;
        this.inCarIndicator.userData.setIndicator(indicatorText);

        for (let f = 0; f < this.destButtons.length; f++) {
            this.destButtons[f].material = this.logic.destinations.has(f) ? this.btnOnMat : this.btnOffMat;
        }

        if (this.world && this.world.floors) {
            for (let f = 0; f < this.world.floors.length; f++) {
                const fl = this.world.floors[f];
                if (fl.callPanel && fl.callPanel.userData) {
                    fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
                    fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
                    fl.callPanel.userData.setIndicator(String(this.logic.currentFloor));
                }
                if (fl.shaftIndicator && fl.shaftIndicator.userData) {
                    fl.shaftIndicator.userData.setIndicator(indicatorText);
                }
            }
        }
    }

    tick(dt) {
        this.logic.tick(dt);
        this._syncStateFromLogic();
        this._updateVisuals();
    }
}

window.Elevator = Elevator;
