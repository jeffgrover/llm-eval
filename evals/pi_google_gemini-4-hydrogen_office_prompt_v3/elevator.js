class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.carWidth = 2.75;
        this.carDepth = 2.75;
        this.carHeight = 2.95;

        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;

        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xf1c40f,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const backMat = new THREE.MeshLambertMaterial({
            color: 0xd4ac0d,
            side: THREE.DoubleSide
        });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xf7dc6f,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const addCarMesh = (geo, mat, x, y, z) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.renderOrder = 1;
            this.carGroup.add(m);
            return m;
        };

        // Floor & Ceiling
        addCarMesh(new THREE.BoxGeometry(this.carWidth, 0.08, this.carDepth), frameMat, 0, 0.04, 0);
        addCarMesh(new THREE.BoxGeometry(this.carWidth, 0.08, this.carDepth), frameMat, 0, this.carHeight - 0.04, 0);

        // Left & Right walls
        addCarMesh(new THREE.BoxGeometry(0.06, this.carHeight, this.carDepth), frameMat, -this.carWidth / 2 + 0.03, this.carHeight / 2, 0);
        addCarMesh(new THREE.BoxGeometry(0.06, this.carHeight, this.carDepth), frameMat, this.carWidth / 2 - 0.03, this.carHeight / 2, 0);

        // Solid back wall
        addCarMesh(new THREE.BoxGeometry(this.carWidth, this.carHeight, 0.08), backMat, 0, this.carHeight / 2, -this.carDepth / 2 + 0.04);

        // Sliding doors on +Z face
        const doorW = this.carWidth / 2 - 0.04;
        const doorH = this.carHeight - 0.16;
        this.doorClosedX = doorW / 2;
        this.doorOpenShift = doorW - 0.12;
        this.leftDoor = addCarMesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat, -this.doorClosedX, doorH / 2 + 0.08, this.carDepth / 2 - 0.03);
        this.rightDoor = addCarMesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat, this.doorClosedX, doorH / 2 + 0.08, this.carDepth / 2 - 0.03);

        // Destination panel on back-right wall
        addCarMesh(new THREE.BoxGeometry(0.32, 1.3, 0.05), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }), 0.95, 1.4, -this.carDepth / 2 + 0.11);
        this.btnOffMat = new THREE.MeshBasicMaterial({ color: 0x555b66 });
        this.btnOnMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
        this.destButtons = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), this.btnOffMat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(0.95, 0.92 + f * 0.18, -this.carDepth / 2 + 0.14);
            btn.renderOrder = 1;
            this.carGroup.add(btn);
            this.destButtons.push(btn);
        }

        // In-car floor indicator mounted above doors facing -Z (toward passengers inside)
        this.inCarIndicator = createTextDisplay(0.6, 0.6);
        this.inCarIndicator.position.set(0, 2.52, this.carDepth / 2 - 0.08);
        this.inCarIndicator.rotation.y = Math.PI;
        this.inCarIndicator.renderOrder = 1;
        this.carGroup.add(this.inCarIndicator);

        scene.add(this.carGroup);
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

    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }

    reserveBoardingSpot(person) {
        const spot = this.logic.reserveBoardingSpot(person);
        if (!spot) return null;
        return {
            index: spot.index,
            x: spot.x,
            y: spot.y,
            z: spot.z,
            localPos: new THREE.Vector3(spot.x, spot.y, spot.z),
            worldPos: new THREE.Vector3(spot.x, this.carGroup.position.y + spot.y, spot.z)
        };
    }

    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }

    reset() {
        this.logic.reset();
        this._syncVisuals();
    }

    tick(dt) {
        this.logic.tick(dt);
        this._syncVisuals();
    }

    _formatIndicatorText() {
        const arrow = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
        return String(this.logic.currentFloor) + arrow;
    }

    _syncVisuals() {
        this.carGroup.position.y = this.logic.carY;

        const openOffset = this.logic.doorProgress * this.doorOpenShift;
        this.leftDoor.position.x = -(this.doorClosedX + openOffset);
        this.rightDoor.position.x = this.doorClosedX + openOffset;

        for (let f = 0; f < this.destButtons.length; f++) {
            this.destButtons[f].material = this.logic.destinations.has(f) ? this.btnOnMat : this.btnOffMat;
        }

        const label = this._formatIndicatorText();
        updateTextDisplay(this.inCarIndicator.userData.texture, label);

        if (this.world && this.world.floors) {
            for (let f = 0; f < this.world.floors.length; f++) {
                const fl = this.world.floors[f];
                if (fl.callPanel && fl.callPanel.userData) {
                    fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
                    fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
                    fl.callPanel.userData.setIndicator(label);
                }
                if (fl.shaftIndicator && fl.shaftIndicator.userData && fl.shaftIndicator.userData.setText) {
                    fl.shaftIndicator.userData.setText(label);
                }
            }
        }
    }
}

window.Elevator = Elevator;
