// elevator.js - Three.js elevator car + adapter around ElevatorLogic.
// Classic script, no ES modules. elevator.js owns geometry/meshes/indicators only;
// all scheduling lives in ElevatorLogic (elevator_logic.js).

const ELEV_CAR = {
    WIDTH: 2.6, DEPTH: 2.6, HEIGHT: 3.0,
    DOOR_HALF: 1.28, DOOR_TRAVEL: 1.22,
    FRAME_COLOR: 0xf2c500, BACK_COLOR: 0xe0b000, DOOR_COLOR: 0xf5d030
};

function carMat(color, opacity, useSolid) {
    return useSolid
        ? new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false, side: THREE.DoubleSide });
}

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        const FLOOR_COUNT = world.floors.length;
        this.logic = new ElevatorLogic({ floorCount: FLOOR_COUNT, maxCapacity: 4, floorHeight: WORLD.FLOOR_HEIGHT });

        const W = ELEV_CAR.WIDTH, D = ELEV_CAR.DEPTH, H = ELEV_CAR.HEIGHT;
        this.car = new THREE.Group();
        this.car.name = "elevatorCar";
        const f = 0.1;

        // Floor + ceiling + sides + solid back wall.
        this.car.add(this._box(W, 0.1, D, 0, 0, 0, ELEV_CAR.FRAME_COLOR, 0.5, false));
        this.car.add(this._box(W, 0.1, D, 0, H, 0, ELEV_CAR.FRAME_COLOR, 0.35, false));
        this.car.add(this._box(f, H, D, -W / 2, H / 2, 0, ELEV_CAR.FRAME_COLOR, 0.5, false));
        this.car.add(this._box(f, H, D, W / 2, H / 2, 0, ELEV_CAR.FRAME_COLOR, 0.5, false));
        this.car.add(this._box(W, H, f, 0, H / 2, -D / 2, ELEV_CAR.BACK_COLOR, 1, true));

        // Two sliding doors on the +Z face.
        this.leftDoor = this._box(ELEV_CAR.DOOR_HALF, H - 0.1, 0.08, -ELEV_CAR.DOOR_HALF / 2, (H - 0.1) / 2, D / 2, ELEV_CAR.DOOR_COLOR, 0.7, false);
        this.rightDoor = this._box(ELEV_CAR.DOOR_HALF, H - 0.1, 0.08, ELEV_CAR.DOOR_HALF / 2, (H - 0.1) / 2, D / 2, ELEV_CAR.DOOR_COLOR, 0.7, false);

        // In-car floor indicator (mounted above the doors, facing back at riders = -Z).
        const inCar = makeTextPlane(0.6, 0.6, null);
        inCar.plane.position.set(0, H - 0.35, D / 2 - 0.05);
        inCar.plane.rotation.y = Math.PI;
        this.car.add(inCar.plane);
        this.inCarIndicator = inCar.setIndicator;

        // Destination panel: one glowing cylinder button per floor on the back-right wall.
        this.destButtons = [];
        const panelX = W / 2 - 0.25;
        for (let fl = 0; fl < FLOOR_COUNT; fl++) {
            const mat = new THREE.MeshLambertMaterial({ color: 0x555555, emissive: 0x000000 });
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), mat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(panelX, H - 0.4 - fl * 0.36, -D / 2 + 0.1);
            this.car.add(btn);
            this.destButtons.push({ floor: fl, mesh: btn, mat: mat });
        }

        // Car draws after the building.
        this.car.traverse((obj) => { if (obj.isMesh) obj.renderOrder = 1; });
        this.car.position.set(0, 0, 0);
        scene.add(this.car);
    }

    _box(w, h, d, x, y, z, color, opacity, solid) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), carMat(color, opacity, solid));
        mesh.position.set(x, y, z);
        this.car.add(mesh);
        return mesh;
    }

    // ---- Public API delegated to ElevatorLogic ----
    callUp(f) { return this.logic.callUp(f); }
    callDown(f) { return this.logic.callDown(f); }
    pressDestination(f) { return this.logic.pressDestination(f); }
    isAcceptingAt(f, d) { return this.logic.isAcceptingAt(f, d); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(p) { return this.logic.reserveBoardingSpot(p); }
    completeBoard(p) { return this.logic.completeBoard(p); }
    registerDisembark(p) { return this.logic.registerDisembark(p); }
    completeDisembark(p) { return this.logic.completeDisembark(p); }
    reset() { return this.logic.reset(); }

    // ---- State mirrors for the HUD ----
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

    // ---- Advance one frame ----
    tick(dt) {
        this.logic.tick(dt);
        this.car.position.y = this.logic.y;
        const p = this.logic.doorProgress;
        const off = p * ELEV_CAR.DOOR_TRAVEL;
        this.leftDoor.position.x = -off;
        this.rightDoor.position.x = off;

        const floor = this.logic.currentFloor;
        const dir = this.logic.direction;
        const arrow = dir > 0 ? "^" : (dir < 0 ? "v" : " ");
        const floors = this.world.floors;
        for (let i = 0; i < floors.length; i++) {
            floors[i].callPanel.userData.setUp(this.logic.upCalls.has(i));
            floors[i].callPanel.userData.setDown(this.logic.downCalls.has(i));
            floors[i].callPanel.userData.setIndicator(String(floor));
            floors[i].shaftIndicator.setIndicator(floor + arrow);
        }
        this.inCarIndicator(String(floor));

        for (let i = 0; i < this.destButtons.length; i++) {
            const b = this.destButtons[i];
            const on = this.logic.destinations.has(b.floor);
            b.mat.color.set(on ? 0x113311 : 0x555555);
            b.mat.emissive.set(on ? 0x33ff55 : 0x000000);
        }
    }
}

window.Elevator = Elevator;
