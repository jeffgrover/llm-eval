// elevator.js - Three.js elevator car, doors, indicators, and a thin adapter around
// ElevatorLogic. All scheduling/state decisions live in ElevatorLogic; this file only
// converts them into meshes, positions, and lights.

function elevTranslucentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color, transparent: true, opacity: opacity,
        depthWrite: false, side: THREE.DoubleSide
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
        this.floorButtons = [];
        this._lampCache = [];
        this._buildCar();
        scene.add(this.car);
    }

    _buildCar() {
        const car = new THREE.Group();
        this.car = car;

        const frameMat = elevTranslucentMat(0xffdd44, 0.5);
        const doorMat = elevTranslucentMat(0xffee66, 0.7);
        const backMat = new THREE.MeshLambertMaterial({ color: 0xffcc33, side: THREE.DoubleSide });

        const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 2.9), frameMat);
        floorSlab.position.set(0, 0.05, 0);
        car.add(floorSlab);

        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 2.9), frameMat);
        ceiling.position.set(0, 2.62, 0);
        car.add(ceiling);

        const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.5, 2.9), frameMat);
        sideL.position.set(-1.46, 1.35, 0);
        car.add(sideL);
        const sideR = sideL.clone();
        sideR.position.x = 1.46;
        car.add(sideR);

        const back = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.5, 0.08), backMat);
        back.position.set(0, 1.35, -1.46);
        car.add(back);

        // sliding doors on the +Z face; closed they meet at x=0
        this.doorL = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.4, 0.06), doorMat);
        this.doorL.position.set(-0.74, 1.3, 1.47);
        car.add(this.doorL);
        this.doorR = new THREE.Mesh(new THREE.BoxGeometry(1.48, 2.4, 0.06), doorMat);
        this.doorR.position.set(0.74, 1.3, 1.47);
        car.add(this.doorR);

        // door frame columns just outside the opening
        const jambMat = new THREE.MeshLambertMaterial({ color: 0xd8b23a, side: THREE.DoubleSide });
        const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), jambMat);
        jambL.position.set(-1.53, 1.3, 1.47);
        car.add(jambL);
        const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), jambMat);
        jambR.position.set(1.53, 1.3, 1.47);
        car.add(jambR);

        // destination panel on the back-right wall with one button per floor
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.06), frameMat);
        panel.position.set(1.05, 1.3, -1.4);
        car.add(panel);
        const btnDim = new THREE.MeshLambertMaterial({ color: 0x666a72 });
        const btnLit = new THREE.MeshBasicMaterial({ color: 0xffcf4a });
        this._btnDim = btnDim;
        this._btnLit = btnLit;
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), btnDim);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(1.05, 0.65 + f * 0.24, -1.36);
            car.add(btn);
            this.floorButtons.push(btn);
        }

        // in-car floor indicator above the doors, seen from inside
        const carTex = wldMakeDigitTexture('0');
        this._carTex = carTex;
        const ind = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: carTex })
        );
        ind.position.set(0, 2.32, 1.4);
        ind.rotation.y = Math.PI;
        car.add(ind);

        car.traverse(function (obj) { obj.renderOrder = 1; });
        this._syncVisuals();
    }

    // ---- delegated API (sim.js talks to the car, logic decides) ----

    callUp(floor) { return this.logic.callUp(floor); }
    callDown(floor) { return this.logic.callDown(floor); }
    pressDestination(floor) { return this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    isDoorUsableAt(floor, direction) { return this.logic.isDoorUsableAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    registerDisembark(person) { return this.logic.registerDisembark(person); }
    completeDisembark(person) { return this.logic.completeDisembark(person); }
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
    get maxCapacity() { return this.logic.maxCapacity; }

    spotWorld(spot) {
        return new THREE.Vector3(spot.x, this.car.position.y + spot.y, spot.z);
    }

    tick(dt) {
        let rem = dt;
        let guard = 0;
        while (rem > 0.000001 && guard < 48) {
            const step = Math.min(0.35, rem);
            this.logic.tick(step);
            rem -= step;
            guard += 1;
        }
        this._syncVisuals();
    }

    _syncVisuals() {
        const L = this.logic;
        this.car.position.y = L.yPosition;

        const open = L.doorOpenAmount;
        this.doorL.position.x = -0.74 - open * 1.42;
        this.doorR.position.x = 0.74 + open * 1.42;

        const arrow = L.direction > 0 ? '^' : (L.direction < 0 ? 'v' : '');
        const text = String(L.currentFloor) + arrow;
        wldUpdateTextTexture(this._carTex, text);

        for (let f = 0; f < this.world.floors.length; f++) {
            const floor = this.world.floors[f];
            const upOn = L.upCalls.has(f);
            const downOn = L.downCalls.has(f);
            const cache = this._lampCache[f] || (this._lampCache[f] = { up: null, down: null, text: null });
            if (cache.up !== upOn) {
                cache.up = upOn;
                floor.callPanel.userData.setUp(upOn);
            }
            if (cache.down !== downOn) {
                cache.down = downOn;
                floor.callPanel.userData.setDown(downOn);
            }
            if (cache.text !== text) {
                cache.text = text;
                floor.callPanel.userData.setIndicator(text);
                floor.shaftIndicator.userData.setIndicator(text);
            }
            const btn = this.floorButtons[f];
            if (btn) {
                btn.material = L.destinations.has(f) ? this._btnLit : this._btnDim;
            }
        }
    }
}
window.Elevator = Elevator;
