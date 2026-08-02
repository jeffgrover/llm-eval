// elevator.js - Three.js elevator car, doors, indicators, adapter around ElevatorLogic
// Classic browser script. Exposes window.Elevator.

const ECAR_W = 2.4;
const ECAR_D = 2.4;
const ECAR_H = 2.6;

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
        scene.add(this.carGroup);
        this._destButtons = [];
        this._buildCar();
        this._buildDestPanel();
        this.inCarIndicator = makeIndicator(0.6);
        this.inCarIndicator.position.set(0, ECAR_H - 0.35, ECAR_D / 2 - 0.05);
        this.inCarIndicator.rotation.y = Math.PI;
        this.inCarIndicator.renderOrder = 1;
        this.carGroup.add(this.inCarIndicator);
    }

    _buildCar() {
        const frameMat = new THREE.MeshLambertMaterial({ color: 0xffcc33, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xddaa22 });
        const doorMat = new THREE.MeshLambertMaterial({ color: 0xffcc33, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        this._frameMat = frameMat;
        this._doorMat = doorMat;

        const floor = new THREE.Mesh(new THREE.BoxGeometry(ECAR_W, 0.1, ECAR_D), frameMat);
        floor.position.y = 0.05; floor.renderOrder = 1; this.carGroup.add(floor);
        const ceil = new THREE.Mesh(new THREE.BoxGeometry(ECAR_W, 0.1, ECAR_D), frameMat);
        ceil.position.y = ECAR_H - 0.05; ceil.renderOrder = 1; this.carGroup.add(ceil);
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, ECAR_H, ECAR_D), frameMat);
        left.position.set(-ECAR_W / 2, ECAR_H / 2, 0); left.renderOrder = 1; this.carGroup.add(left);
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, ECAR_H, ECAR_D), frameMat);
        right.position.set(ECAR_W / 2, ECAR_H / 2, 0); right.renderOrder = 1; this.carGroup.add(right);
        const back = new THREE.Mesh(new THREE.BoxGeometry(ECAR_W, ECAR_H, 0.08), backMat);
        back.position.set(0, ECAR_H / 2, -ECAR_D / 2); back.renderOrder = 1; this.carGroup.add(back);

        const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(ECAR_W / 2 - 0.02, ECAR_H - 0.2, 0.06), doorMat);
        leftDoor.position.set(-ECAR_W / 4, ECAR_H / 2, ECAR_D / 2); leftDoor.renderOrder = 1; this.carGroup.add(leftDoor);
        const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(ECAR_W / 2 - 0.02, ECAR_H - 0.2, 0.06), doorMat);
        rightDoor.position.set(ECAR_W / 4, ECAR_H / 2, ECAR_D / 2); rightDoor.renderOrder = 1; this.carGroup.add(rightDoor);
        this.leftDoor = leftDoor;
        this.rightDoor = rightDoor;
    }

    _buildDestPanel() {
        const plateMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.05), plateMat);
        plate.position.set(ECAR_W / 2 - 0.2, ECAR_H / 2 + 0.1, -ECAR_D / 2 + 0.3);
        plate.renderOrder = 1; this.carGroup.add(plate);
        this._destBtnOff = new THREE.MeshLambertMaterial({ color: 0x333322 });
        this._destBtnOn = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), this._destBtnOff);
            btn.rotation.x = Math.PI / 2;
            const y = ECAR_H - 0.5 - f * 0.22;
            btn.position.set(ECAR_W / 2 - 0.2, y, -ECAR_D / 2 + 0.33);
            btn.renderOrder = 1; this.carGroup.add(btn);
            this._destButtons.push(btn);
        }
    }

    _doorProgress() {
        const L = this.logic;
        if (L.state === "DOOR_OPEN") return 1;
        if (L.state === "DOOR_OPENING") return Math.min(1, L.doorTimer / L.DOOR_OPENING_S);
        if (L.state === "DOOR_CLOSING") return Math.max(0, 1 - L.doorTimer / L.DOOR_CLOSING_S);
        return 0;
    }

    tick(dt) {
        this.logic.tick(dt);
        this.carGroup.position.y = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
        const p = this._doorProgress();
        this.leftDoor.position.x = -ECAR_W / 4 - p * (ECAR_W / 4);
        this.rightDoor.position.x = ECAR_W / 4 + p * (ECAR_W / 4);

        const floors = this.world.floors;
        const curTxt = String(Math.round(this.logic.currentFloor));
        for (let f = 0; f < floors.length; f += 1) {
            const fl = floors[f];
            fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
            fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
            fl.callPanel.userData.setIndicator(curTxt);
            let shaftTxt = curTxt;
            if (this.logic.direction > 0) shaftTxt += "^";
            else if (this.logic.direction < 0) shaftTxt += "v";
            fl.shaftIndicator.userData.setText(shaftTxt);
        }
        for (let f = 0; f < this._destButtons.length; f += 1) {
            this._destButtons[f].material = this.logic.destinations.has(f) ? this._destBtnOn : this._destBtnOff;
        }
        this.inCarIndicator.userData.setText(curTxt);
    }

    // Delegating API
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
    reset() { this.logic.reset(); }

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
}

window.Elevator = Elevator;
