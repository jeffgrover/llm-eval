class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
            carSpeed: 2.0
        });
        this.carGroup = new THREE.Group();
        this.carGroup.position.set(0, 0, 0);
        scene.add(this.carGroup);

        const matCar = new THREE.MeshLambertMaterial({ color: 0xe8c832, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const matDoor = new THREE.MeshLambertMaterial({ color: 0xefd24a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        const matBack = new THREE.MeshLambertMaterial({ color: 0xcfae2c });
        const matTrim = new THREE.MeshLambertMaterial({ color: 0x8f7a1e });
        const matPanel = new THREE.MeshLambertMaterial({ color: 0x33383f });
        this.buttonOffMat = new THREE.MeshBasicMaterial({ color: 0x5b636e });
        this.buttonOnMat = new THREE.MeshBasicMaterial({ color: 0xffa02e });

        const self = this;
        function add(mesh) {
            mesh.renderOrder = 1;
            self.carGroup.add(mesh);
            return mesh;
        }
        function box(w, h, d, x, y, z, material) {
            return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)).position.set(x, y, z);
        }

        box(2.6, 0.1, 2.6, 0, -0.05, 0, matCar);
        box(2.6, 0.1, 2.6, 0, 2.5, 0, matCar);
        box(0.08, 2.5, 2.6, -1.3, 1.25, 0, matCar);
        box(0.08, 2.5, 2.6, 1.3, 1.25, 0, matCar);
        box(2.6, 2.5, 0.08, 0, 1.25, -1.3, matBack);
        box(0.12, 2.5, 0.12, -1.28, 1.25, -1.28, matTrim);
        box(0.12, 2.5, 0.12, 1.28, 1.25, -1.28, matTrim);
        box(0.12, 2.5, 0.12, -1.28, 1.25, 1.28, matTrim);
        box(0.12, 2.5, 0.12, 1.28, 1.25, 1.28, matTrim);
        box(2.7, 0.22, 0.12, 0, 2.4, 1.3, matTrim);

        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.06), matDoor);
        this.leftDoor.position.set(-0.65, 1.15, 1.31);
        this.leftDoor.renderOrder = 1;
        this.carGroup.add(this.leftDoor);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.06), matDoor);
        this.rightDoor.position.set(0.65, 1.15, 1.31);
        this.rightDoor.renderOrder = 1;
        this.carGroup.add(this.rightDoor);

        box(0.36, 1.2, 0.05, 0.85, 1.5, -1.22, matPanel);
        this.destButtons = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const col = f % 2;
            const row = Math.floor(f / 2);
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), this.buttonOffMat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(0.85 + (col === 0 ? -0.09 : 0.09), 1.92 - row * 0.42, -1.18);
            btn.renderOrder = 1;
            this.carGroup.add(btn);
            this.destButtons.push(btn);
        }

        this.carIndicator = makeTextTexture();
        const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: this.carIndicator.texture }));
        ind.position.set(0, 2.25, 1.24);
        ind.rotation.y = Math.PI;
        ind.renderOrder = 1;
        this.carGroup.add(ind);

        this.syncVisuals();
    }

    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }

    reset() {
        this.logic.reset();
        this.syncVisuals();
    }

    tick(dt) {
        this.logic.tick(dt);
        this.syncVisuals();
    }

    get state() { return this.logic.state; }
    get direction() { return this.logic.direction; }
    get currentFloor() { return this.logic.currentFloor; }
    get targetFloor() { return this.logic.targetFloor; }
    get carY() { return this.logic.carY; }
    get doorProgress() { return this.logic.doorProgress; }
    get upCalls() { return this.logic.upCalls; }
    get downCalls() { return this.logic.downCalls; }
    get destinations() { return this.logic.destinations; }
    get passengers() { return this.logic.passengers; }
    get pendingBoarders() { return this.logic.pendingBoarders; }
    get pendingDisembark() { return this.logic.pendingDisembark; }

    syncVisuals() {
        this.carGroup.position.y = this.logic.carY;
        const p = this.logic.doorProgress;
        this.leftDoor.position.x = -0.65 - 1.25 * p;
        this.rightDoor.position.x = 0.65 + 1.25 * p;
        const dfloor = Math.max(0, Math.min(this.logic.floorCount - 1, Math.round(this.logic.carY / WORLD.FLOOR_HEIGHT)));
        const dirCh = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
        const text = String(dfloor) + dirCh;
        this.carIndicator.update(text);
        const floors = this.world.floors;
        for (let f = 0; f < floors.length; f++) {
            const fl = floors[f];
            fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
            fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
            fl.shaftIndicator.userData.setIndicator(text);
            fl.callPanel.userData.setIndicator(text);
        }
        for (let f = 0; f < this.destButtons.length; f++) {
            this.destButtons[f].material = this.logic.destinations.has(f) ? this.buttonOnMat : this.buttonOffMat;
        }
    }
}

window.Elevator = Elevator;
