// elevator.js - Three.js elevator car, doors, indicators and a thin adapter
// around ElevatorLogic.  All scheduling decisions live in elevator_logic.js.

const ELEV_CAR_W = 2.6;
const ELEV_CAR_D = 2.6;
const ELEV_CAR_H = 2.55;
const ELEV_DOOR_H = 2.25;
const ELEV_DOOR_SLIDE = 1.05;
const ELEV_CAPACITY = 4;
const ELEV_SPEED_FLOORS = 0.6;   // ~2 m/s: fast enough to serve, slow enough to queue

const ELEV_MAT_FRAME = new THREE.MeshLambertMaterial({
    color: 0xffdd44, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide
});
const ELEV_MAT_BACK = new THREE.MeshLambertMaterial({ color: 0xe8c033, side: THREE.DoubleSide });
const ELEV_MAT_DOOR = new THREE.MeshLambertMaterial({
    color: 0xffd633, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide
});
const ELEV_MAT_PANEL = new THREE.MeshLambertMaterial({ color: 0x33363c });
const ELEV_MAT_BTN_OFF = new THREE.MeshBasicMaterial({ color: 0x555a63 });
const ELEV_MAT_BTN_ON = new THREE.MeshBasicMaterial({ color: 0xffcc44 });

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.floorHeight = WORLD.FLOOR_HEIGHT;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: ELEV_CAPACITY,
            floorHeight: WORLD.FLOOR_HEIGHT,
            speed: ELEV_SPEED_FLOORS
        });

        this.group = new THREE.Group();
        this.group.position.set(0, 0, 0);
        this._buildCar();
        scene.add(this.group);
        this.group.traverse((child) => {
            child.renderOrder = 1;
        });

        this._panelText = [];
        this._indicatorText = [];
        this.tick(0);
    }

    // -----------------------------------------------------------------
    // geometry
    // -----------------------------------------------------------------
    _buildCar() {
        const hw = ELEV_CAR_W / 2;
        const hd = ELEV_CAR_D / 2;

        const floor = new THREE.Mesh(new THREE.BoxGeometry(ELEV_CAR_W, 0.08, ELEV_CAR_D), ELEV_MAT_BACK);
        floor.position.y = -0.04;
        this.group.add(floor);

        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(ELEV_CAR_W, 0.08, ELEV_CAR_D), ELEV_MAT_FRAME);
        ceiling.position.y = ELEV_CAR_H;
        this.group.add(ceiling);

        const sideGeo = new THREE.BoxGeometry(0.07, ELEV_CAR_H, ELEV_CAR_D);
        const leftWall = new THREE.Mesh(sideGeo, ELEV_MAT_FRAME);
        leftWall.position.set(-hw, ELEV_CAR_H / 2, 0);
        this.group.add(leftWall);
        const rightWall = new THREE.Mesh(sideGeo, ELEV_MAT_FRAME);
        rightWall.position.set(hw, ELEV_CAR_H / 2, 0);
        this.group.add(rightWall);

        const backWall = new THREE.Mesh(new THREE.BoxGeometry(ELEV_CAR_W, ELEV_CAR_H, 0.07), ELEV_MAT_BACK);
        backWall.position.set(0, ELEV_CAR_H / 2, -hd);
        this.group.add(backWall);

        // header above the doors
        const header = new THREE.Mesh(new THREE.BoxGeometry(ELEV_CAR_W, ELEV_CAR_H - ELEV_DOOR_H, 0.07), ELEV_MAT_FRAME);
        header.position.set(0, ELEV_DOOR_H + (ELEV_CAR_H - ELEV_DOOR_H) / 2, hd);
        this.group.add(header);

        // ---- sliding doors on the +Z face ----------------------------
        const doorGeo = new THREE.BoxGeometry(ELEV_CAR_W / 2, ELEV_DOOR_H, 0.07);
        this.leftDoor = new THREE.Mesh(doorGeo, ELEV_MAT_DOOR);
        this.leftDoor.position.set(-ELEV_CAR_W / 4, ELEV_DOOR_H / 2, hd);
        this.group.add(this.leftDoor);
        this.rightDoor = new THREE.Mesh(doorGeo, ELEV_MAT_DOOR);
        this.rightDoor.position.set(ELEV_CAR_W / 4, ELEV_DOOR_H / 2, hd);
        this.group.add(this.rightDoor);

        // ---- destination panel on the back-right wall -----------------
        const panelPlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.35, 0.34), ELEV_MAT_PANEL);
        panelPlate.position.set(hw - 0.06, 1.25, -0.75);
        this.group.add(panelPlate);
        this.buttons = [];
        const btnGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10);
        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const btn = new THREE.Mesh(btnGeo, ELEV_MAT_BTN_OFF);
            btn.rotation.z = Math.PI / 2;
            btn.position.set(hw - 0.1, 0.72 + f * 0.2, -0.75);
            this.group.add(btn);
            this.buttons.push(btn);
        }

        // ---- in-car floor indicator above the doors, facing the riders -
        this.carIndicator = makeIndicatorPlane(0.6);
        this.carIndicator.position.set(0, ELEV_DOOR_H + 0.15, hd - 0.06);
        this.carIndicator.rotation.y = Math.PI;
        this.group.add(this.carIndicator);
    }

    // -----------------------------------------------------------------
    // mirrored logic state (read-only pass-through for the HUD)
    // -----------------------------------------------------------------
    get state() { return this.logic.state; }
    get direction() { return this.logic.direction; }
    get currentFloor() { return this.logic.currentFloor; }
    get targetFloor() { return this.logic.targetFloor; }
    get exactFloor() { return this.logic.exactFloor; }
    get upCalls() { return this.logic.upCalls; }
    get downCalls() { return this.logic.downCalls; }
    get destinations() { return this.logic.destinations; }
    get passengers() { return this.logic.passengers; }
    get pendingBoarders() { return this.logic.pendingBoarders; }
    get pendingDisembark() { return this.logic.pendingDisembark; }
    get strandedBoarders() { return this.logic.strandedBoarders; }
    get maxCapacity() { return this.logic.maxCapacity; }
    get doorPosition() { return this.logic.doorPosition; }

    // -----------------------------------------------------------------
    // delegated API
    // -----------------------------------------------------------------
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    cancelBoarding(person) { return this.logic.cancelBoarding(person); }
    registerDisembark(person) { return this.logic.registerDisembark(person); }
    completeDisembark(person) { return this.logic.completeDisembark(person); }

    // Converts the logic's abstract interior spot into Three.js vectors.
    reserveBoardingSpot(person) {
        const spot = this.logic.reserveBoardingSpot(person);
        if (!spot) return null;
        const local = new THREE.Vector3(spot.x, spot.y, spot.z);
        return { index: spot.index, local: local, world: this.localToWorld(local) };
    }

    localToWorld(local) {
        return new THREE.Vector3(
            this.group.position.x + local.x,
            this.group.position.y + local.y,
            this.group.position.z + local.z
        );
    }

    // Where a boarder should aim while still walking in world space: their own
    // lane at the door threshold, so four boarders do not fight over x = 0.
    doorThresholdWorld(local) {
        return new THREE.Vector3(
            this.group.position.x + local.x,
            this.group.position.y,
            this.group.position.z + ELEV_CAR_D / 2 + 0.35
        );
    }

    reset() {
        this.logic.reset();
        this.group.position.y = 0;
        this.leftDoor.position.x = -ELEV_CAR_W / 4;
        this.rightDoor.position.x = ELEV_CAR_W / 4;
        this._syncIndicators(true);
    }

    // -----------------------------------------------------------------
    // per-frame
    // -----------------------------------------------------------------
    tick(dt) {
        this.logic.tick(dt);

        this.group.position.y = this.logic.exactFloor * this.floorHeight;

        const slide = this.logic.doorPosition * ELEV_DOOR_SLIDE;
        this.leftDoor.position.x = -ELEV_CAR_W / 4 - slide;
        this.rightDoor.position.x = ELEV_CAR_W / 4 + slide;

        for (let f = 0; f < this.buttons.length; f += 1) {
            const lit = this.logic.destinations.has(f);
            const wanted = lit ? ELEV_MAT_BTN_ON : ELEV_MAT_BTN_OFF;
            if (this.buttons[f].material !== wanted) this.buttons[f].material = wanted;
        }

        this._syncIndicators(false);
    }

    _syncIndicators(force) {
        const floors = this.world.floors;
        const dir = this.logic.direction;
        const arrow = dir > 0 ? "^" : (dir < 0 ? "v" : "-");
        const shaftText = String(this.logic.currentFloor) + arrow;
        for (let f = 0; f < floors.length; f += 1) {
            const record = floors[f];
            record.callPanel.userData.setUp(this.logic.upCalls.has(f));
            record.callPanel.userData.setDown(this.logic.downCalls.has(f));
            if (force || this._panelText[f] !== shaftText) {
                record.callPanel.userData.setIndicator(String(this.logic.currentFloor));
                record.shaftIndicator.userData.setIndicator(shaftText);
                this._panelText[f] = shaftText;
            }
        }
        if (force || this._indicatorText[0] !== shaftText) {
            this.carIndicator.userData.setIndicator(shaftText);
            this._indicatorText[0] = shaftText;
        }
    }
}

window.Elevator = Elevator;
window.ELEV_CAR_W = ELEV_CAR_W;
window.ELEV_CAR_D = ELEV_CAR_D;
