// elevator.js - Three.js elevator car, doors, indicators; adapter around ElevatorLogic.

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.CAR_W = 2.7;
        this.CAR_D = 2.7;
        this.CAR_H = 2.8;

        this.carGroup = new THREE.Group();
        this.carGroup.position.set(0, 0, 0);
        scene.add(this.carGroup);

        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xf2c530, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xd9ae1f });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xf2c530, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });

        const W = this.CAR_W, D = this.CAR_D, H = this.CAR_H;
        // Floor and ceiling.
        this._mesh(new THREE.BoxGeometry(W, 0.1, D), frameMat, 0, 0.05, 0);
        this._mesh(new THREE.BoxGeometry(W, 0.08, D), frameMat, 0, H, 0);
        // Side walls.
        this._mesh(new THREE.BoxGeometry(0.08, H, D), frameMat, -W / 2, H / 2, 0);
        this._mesh(new THREE.BoxGeometry(0.08, H, D), frameMat, W / 2, H / 2, 0);
        // Solid back wall.
        this._mesh(new THREE.BoxGeometry(W, H, 0.08), backMat, 0, H / 2, -D / 2);

        // Sliding doors on +Z, each half the car width.
        this.doorHalf = W / 2;
        this.doorL = this._mesh(new THREE.BoxGeometry(this.doorHalf, H - 0.15, 0.07), doorMat, -this.doorHalf / 2, (H - 0.15) / 2 + 0.1, D / 2);
        this.doorR = this._mesh(new THREE.BoxGeometry(this.doorHalf, H - 0.15, 0.07), doorMat, this.doorHalf / 2, (H - 0.15) / 2 + 0.1, D / 2);
        this.doorSlide = this.doorHalf - 0.12;

        // Destination panel on the back-right wall: one button per floor.
        this.floorButtons = [];
        const panelPlate = this._mesh(new THREE.BoxGeometry(0.3, 1.3, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x333a44 }), W / 2 - 0.2, 1.5, -D / 2 + 0.35);
        panelPlate.rotation.y = -Math.PI / 2;
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const btn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10),
                new THREE.MeshBasicMaterial({ color: 0x556066 }));
            btn.rotation.z = Math.PI / 2;
            btn.position.set(W / 2 - 0.16, 0.95 + f * 0.2, -D / 2 + 0.35);
            this.carGroup.add(btn);
            this.floorButtons.push(btn);
        }

        // In-car floor indicator above the doors, facing back into the car.
        this.carIndicatorTex = makeTextTexture("0");
        const carInd = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.carIndicatorTex }));
        carInd.position.set(0, H - 0.5, D / 2 - 0.1);
        carInd.rotation.y = Math.PI;
        this.carGroup.add(carInd);

        this.carGroup.traverse(function(obj) { obj.renderOrder = 1; });
        this.carGroup.renderOrder = 1;
    }

    _mesh(geo, mat, x, y, z) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        this.carGroup.add(m);
        return m;
    }

    // ---- delegated API ----
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    cancelBoard(person) { this.logic.cancelBoard(person); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
    reset() { this.logic.reset(); this._syncVisuals(); }

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

    // World-space position of a reserved interior spot.
    spotWorldPosition(spot) {
        return new THREE.Vector3(spot.x, this.logic.y, spot.z);
    }

    // World-space point just outside the doors on the current floor.
    doorThresholdWorld(xLane) {
        const x = (xLane !== undefined) ? xLane : 0;
        return new THREE.Vector3(x, this.logic.y, this.CAR_D / 2 + 0.55);
    }

    tick(dt) {
        this.logic.tick(dt);
        this._syncVisuals();
    }

    _syncVisuals() {
        const logic = this.logic;
        this.carGroup.position.y = logic.y;

        // Doors.
        const slide = logic.doorProgress * this.doorSlide;
        this.doorL.position.x = -this.doorHalf / 2 - slide;
        this.doorR.position.x = this.doorHalf / 2 + slide;

        // Destination buttons.
        for (let f = 0; f < this.floorButtons.length; f++) {
            this.floorButtons[f].material.color.setHex(
                logic.destinations.has(f) ? 0x44ff77 : 0x556066);
        }

        // Indicators + call-panel lamps on every floor.
        const dirChar = (logic.direction > 0) ? "^" : (logic.direction < 0) ? "v" : "";
        const txt = String(logic.currentFloor) + dirChar;
        updateTextTexture(this.carIndicatorTex, txt);
        const floors = this.world.floors;
        for (let i = 0; i < floors.length; i++) {
            const fl = floors[i];
            if (fl.shaftIndicator) { fl.shaftIndicator.userData.setIndicator(txt); }
            if (fl.callPanel) {
                fl.callPanel.userData.setIndicator(String(logic.currentFloor));
                fl.callPanel.userData.setUp(logic.upCalls.has(fl.floorNumber));
                fl.callPanel.userData.setDown(logic.downCalls.has(fl.floorNumber));
            }
        }
    }
}
window.Elevator = Elevator;
