// Elevator — SCAN-scheduled, multi-passenger, with in-car destination panel
// and hooks into the floor call-panels / shaft indicators built in world.js.
//
// Coordinate conventions: the car is a THREE.Group whose origin sits at the
// FRONT-CENTER of the car at FLOOR LEVEL. Translating the car in Y moves the
// whole car + any children (passengers). Passengers become children of the car
// while aboard so they ride along.

const ELEVATOR = {
    SPEED:           3.2,    // world units / sec
    DOOR_SPEED:      2.5,    // world units / sec per door half
    DOOR_OPEN_DIST:  null,   // set below, = SHAFT_WIDTH/2 ish
    MIN_DOOR_OPEN_S: 3.5,    // doors stay open at least this long (in motion-time seconds)
    MAX_DOOR_OPEN_S: 18.0,   // safety cap if someone never finishes boarding
    MAX_CAPACITY:    4,
};

// Floor direction codes.
const DIR_UP = 1;
const DIR_DOWN = -1;
const DIR_IDLE = 0;

function makeElevatorCar() {
    const car = new THREE.Group();
    car.renderOrder = 1;

    const CAR_WIDTH  = WORLD.SHAFT_WIDTH - 0.1;
    const CAR_DEPTH  = WORLD.SHAFT_DEPTH - 0.1;
    const CAR_HEIGHT = WORLD.FLOOR_HEIGHT - 0.4;

    const frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide
    });
    const doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide
    });
    const solidBackMat = new THREE.MeshLambertMaterial({ color: 0xffff00, side: THREE.DoubleSide });

    // Floor + ceiling.
    const carFloor = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_DEPTH), frameMat);
    carFloor.position.y = -0.05;
    car.add(carFloor);

    const carCeil = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_DEPTH), frameMat);
    carCeil.position.y = CAR_HEIGHT - 0.05;
    car.add(carCeil);

    // Solid back wall.
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, 0.05), solidBackMat);
    backWall.position.set(0, CAR_HEIGHT / 2, -CAR_DEPTH / 2);
    car.add(backWall);

    // Transparent side walls.
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, CAR_HEIGHT, CAR_DEPTH), frameMat);
    leftSide.position.set(-CAR_WIDTH / 2, CAR_HEIGHT / 2, 0);
    car.add(leftSide);
    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, CAR_HEIGHT, CAR_DEPTH), frameMat);
    rightSide.position.set(CAR_WIDTH / 2, CAR_HEIGHT / 2, 0);
    car.add(rightSide);

    // Doors — each half-width, meeting at x = 0 when closed.
    const doorWidth = CAR_WIDTH / 2;
    const leftDoor  = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, CAR_HEIGHT, 0.05), doorMat);
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, CAR_HEIGHT, 0.05), doorMat);
    leftDoor.position.set(-doorWidth / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2);
    rightDoor.position.set( doorWidth / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2);
    car.add(leftDoor);
    car.add(rightDoor);

    ELEVATOR.DOOR_OPEN_DIST = doorWidth * 0.95;

    // In-car destination panel: 2 columns of 3 buttons on the back wall
    // (on the +X side of the back wall so it doesn't occlude passenger view).
    const panelPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.0, 0.03),
        new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    panelPlate.position.set(CAR_WIDTH/2 - 0.15, CAR_HEIGHT/2, -CAR_DEPTH/2 + 0.05);
    panelPlate.rotation.y = Math.PI / 2;  // face the +X side
    car.add(panelPlate);

    const buttons = [];
    const btnOff = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const btnOn  = new THREE.MeshLambertMaterial({ color: 0xffcc44, emissive: 0x663300 });
    for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), btnOff);
        // Arrange 2 columns × 3 rows
        const col = f % 2;
        const row = Math.floor(f / 2);
        const px = col === 0 ? -0.08 : 0.08;
        const py = 0.25 - row * 0.25;
        btn.position.set(CAR_WIDTH/2 - 0.13, CAR_HEIGHT/2 + py, -CAR_DEPTH/2 + 0.05 + px);
        btn.rotation.z = Math.PI / 2;
        btn.userData.offMat = btnOff;
        btn.userData.onMat  = btnOn;
        car.add(btn);
        buttons.push(btn);
    }

    // In-car floor indicator above doors (shows current floor while riding).
    // Doubled for legibility — faces the passengers looking at the back wall.
    const inCarTex = makeTextTexture('0', { bg: '#050505', fg: '#ffbb22' });
    const inCarInd = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({ map: inCarTex })
    );
    inCarInd.position.set(0, CAR_HEIGHT - 0.5, CAR_DEPTH/2 - 0.04);
    inCarInd.rotation.y = Math.PI;
    car.add(inCarInd);

    car.traverse(o => { if (o.isMesh) o.renderOrder = 1; });

    // Save references for animation.
    car.userData = {
        leftDoor, rightDoor,
        leftDoorClosedX:  -doorWidth / 2,
        rightDoorClosedX:  doorWidth / 2,
        buttons,
        inCarTex,
        CAR_WIDTH, CAR_DEPTH, CAR_HEIGHT,
    };

    return car;
}

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.car = makeElevatorCar();
        scene.add(this.car);

        this.car.position.set(0, 0, 0);

        this.state = 'IDLE';     // IDLE | MOVING | DOOR_OPENING | DOOR_OPEN | DOOR_CLOSING
        this.direction = DIR_IDLE;
        this.currentFloor = 0;
        this.targetFloor  = 0;

        this.upCalls   = new Set();   // floors with active up-call
        this.downCalls = new Set();   // floors with active down-call
        this.destinations = new Set();// floors selected in-car

        this.passengers      = new Set();  // persons currently riding
        this.pendingBoarders = new Set();  // persons walking in right now
        this.pendingDisembark = new Set(); // persons walking out right now

        this.doorOpenAmount = 0;     // 0 = closed, 1 = fully open
        this.doorOpenTimer  = 0;

        this.arrivalListeners = [];  // [(floor, direction) => void]

        // Interior spot layout (4 spots).
        const W = this.car.userData.CAR_WIDTH;
        const D = this.car.userData.CAR_DEPTH;
        this.spots = [
            new THREE.Vector3(-W/4, 0, -D/4),
            new THREE.Vector3( W/4, 0, -D/4),
            new THREE.Vector3(-W/4, 0,  D/4 - 0.1),
            new THREE.Vector3( W/4, 0,  D/4 - 0.1),
        ];
        this.spotOccupancy = [null, null, null, null];
    }

    // ------------------------ Public API ------------------------
    callUp(floor)     { if (floor >= 0 && floor < WORLD.FLOOR_COUNT) this.upCalls.add(floor); this._refreshCallPanels(); }
    callDown(floor)   { if (floor >= 0 && floor < WORLD.FLOOR_COUNT) this.downCalls.add(floor); this._refreshCallPanels(); }
    pressDestination(floor) {
        if (floor >= 0 && floor < WORLD.FLOOR_COUNT) this.destinations.add(floor);
        this._refreshInCarButtons();
    }

    // Doors are open AND we are accepting boarders/disembark.
    isAcceptingAt(floor, direction) {
        if (this.state !== 'DOOR_OPEN') return false;
        if (this.currentFloor !== floor) return false;
        // At terminal stops (no further calls in current direction) we accept
        // boarders from either direction so we don't strand them.
        if (this._hasMoreInDirection(this.direction)) {
            // accept matching direction only
            return direction === this.direction || direction === DIR_IDLE;
        }
        return true;
    }

    currentCapacityFree() {
        const effective = this.passengers.size + this.pendingBoarders.size;
        return ELEVATOR.MAX_CAPACITY - effective;
    }

    // Reserve a spot; returns the local Vector3 target for the agent to walk to.
    // Returns null if full.
    reserveBoardingSpot(person) {
        if (this.currentCapacityFree() <= 0) return null;
        for (let i = 0; i < this.spots.length; i++) {
            if (!this.spotOccupancy[i]) {
                this.spotOccupancy[i] = person;
                person.userData._elevatorSpotIndex = i;
                this.pendingBoarders.add(person);
                return this.spots[i].clone();
            }
        }
        return null;
    }

    // Agent finished walking into the car.
    completeBoard(person) {
        this.pendingBoarders.delete(person);
        this.passengers.add(person);
    }

    // Agent is beginning to walk out; doors must remain open.
    registerDisembark(person) {
        this.pendingDisembark.add(person);
    }

    completeDisembark(person) {
        this.pendingDisembark.delete(person);
        this.passengers.delete(person);
        const idx = person.userData._elevatorSpotIndex;
        if (idx != null) { this.spotOccupancy[idx] = null; person.userData._elevatorSpotIndex = null; }
    }

    // Fired every time doors finish opening: (floor, direction).
    onArrival(cb) { this.arrivalListeners.push(cb); }

    // ------------------------ Frame tick ------------------------
    tick(dt) {
        switch (this.state) {
            case 'IDLE':          this._tickIdle(dt); break;
            case 'MOVING':        this._tickMoving(dt); break;
            case 'DOOR_OPENING':  this._tickDoors(dt, true); break;
            case 'DOOR_OPEN':     this._tickDoorOpen(dt); break;
            case 'DOOR_CLOSING':  this._tickDoors(dt, false); break;
        }
        this._updateFloorTracker();
        this._refreshIndicators();
    }

    _tickIdle(dt) {
        const next = this._pickNextTarget();
        if (next) {
            this.targetFloor = next.floor;
            this.direction = next.direction;
            if (this.targetFloor === this.currentFloor) {
                // Same-floor call: immediately open doors.
                this.state = 'DOOR_OPENING';
                this.doorOpenTimer = 0;
            } else {
                this.state = 'MOVING';
            }
        }
    }

    _tickMoving(dt) {
        // Re-check: has a closer stop in our direction appeared since we
        // picked the current target? (E.g., someone on floor 2 pressed UP
        // while we were heading from 0 to 5.)
        const carFloorFrac = this.car.position.y / WORLD.FLOOR_HEIGHT;
        if (this.direction === DIR_UP) {
            const ups = [...this.destinations, ...this.upCalls].filter(f => f > carFloorFrac + 0.02);
            if (ups.length) {
                const closest = Math.min(...ups);
                if (closest < this.targetFloor) this.targetFloor = closest;
            }
        } else if (this.direction === DIR_DOWN) {
            const downs = [...this.destinations, ...this.downCalls].filter(f => f < carFloorFrac - 0.02);
            if (downs.length) {
                const closest = Math.max(...downs);
                if (closest > this.targetFloor) this.targetFloor = closest;
            }
        }

        const targetY = this.targetFloor * WORLD.FLOOR_HEIGHT;
        const dy = targetY - this.car.position.y;
        const dist = Math.abs(dy);
        if (dist < 0.005) {
            this.car.position.y = targetY;
            this.currentFloor = this.targetFloor;
            this.state = 'DOOR_OPENING';
            this.doorOpenTimer = 0;
            return;
        }
        const step = Math.min(dist, ELEVATOR.SPEED * dt) * Math.sign(dy);
        this.car.position.y += step;
    }

    _tickDoors(dt, opening) {
        const target = opening ? 1 : 0;
        const step = (ELEVATOR.DOOR_SPEED / ELEVATOR.DOOR_OPEN_DIST) * dt;
        this.doorOpenAmount = Math.max(0, Math.min(1, this.doorOpenAmount + step * (opening ? 1 : -1)));
        const { leftDoor, rightDoor, leftDoorClosedX, rightDoorClosedX } = this.car.userData;
        leftDoor.position.x  = leftDoorClosedX  - this.doorOpenAmount * ELEVATOR.DOOR_OPEN_DIST;
        rightDoor.position.x = rightDoorClosedX + this.doorOpenAmount * ELEVATOR.DOOR_OPEN_DIST;

        if (opening && this.doorOpenAmount >= 1 - 1e-4) {
            this.state = 'DOOR_OPEN';
            this.doorOpenTimer = 0;
            // Service call: clear matching call for this floor.
            this._clearServedCallAtCurrentFloor();
            // Notify listeners.
            for (const cb of this.arrivalListeners) cb(this.currentFloor, this.direction);
        }
        if (!opening && this.doorOpenAmount <= 1e-4) {
            // Pick next target.
            const next = this._pickNextTarget();
            if (next) {
                this.targetFloor = next.floor;
                this.direction = next.direction;
                if (this.targetFloor === this.currentFloor) {
                    this.state = 'DOOR_OPENING';
                    this.doorOpenTimer = 0;
                } else {
                    this.state = 'MOVING';
                }
            } else {
                this.state = 'IDLE';
                this.direction = DIR_IDLE;
            }
        }
    }

    _tickDoorOpen(dt) {
        this.doorOpenTimer += dt;
        // Wait for all pending to finish, then close after minimum open time.
        const ready = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
        const minMet = this.doorOpenTimer >= ELEVATOR.MIN_DOOR_OPEN_S;
        const timedOut = this.doorOpenTimer >= ELEVATOR.MAX_DOOR_OPEN_S;
        if ((ready && minMet) || timedOut) {
            this.state = 'DOOR_CLOSING';
        }
    }

    // ------------------------ Scheduling ------------------------
    _hasMoreInDirection(dir) {
        if (dir === DIR_UP) {
            for (const f of this.destinations) if (f > this.currentFloor) return true;
            for (const f of this.upCalls)      if (f > this.currentFloor) return true;
            return false;
        }
        if (dir === DIR_DOWN) {
            for (const f of this.destinations) if (f < this.currentFloor) return true;
            for (const f of this.downCalls)    if (f < this.currentFloor) return true;
            return false;
        }
        return false;
    }

    _pickNextTarget() {
        const cf = this.currentFloor;

        // While moving UP, keep going up for any stop we can serve upward.
        if (this.direction === DIR_UP) {
            const ups = [...this.destinations, ...this.upCalls].filter(f => f > cf);
            if (ups.length) return { floor: Math.min(...ups), direction: DIR_UP };
            // Reverse: look below.
            const downs = [...this.destinations, ...this.downCalls].filter(f => f < cf);
            if (downs.length) return { floor: Math.max(...downs), direction: DIR_DOWN };
            // Same-floor call?
            if (this.upCalls.has(cf) || this.destinations.has(cf)) return { floor: cf, direction: DIR_UP };
            if (this.downCalls.has(cf)) return { floor: cf, direction: DIR_DOWN };
            return null;
        }

        if (this.direction === DIR_DOWN) {
            const downs = [...this.destinations, ...this.downCalls].filter(f => f < cf);
            if (downs.length) return { floor: Math.max(...downs), direction: DIR_DOWN };
            const ups = [...this.destinations, ...this.upCalls].filter(f => f > cf);
            if (ups.length) return { floor: Math.min(...ups), direction: DIR_UP };
            if (this.downCalls.has(cf) || this.destinations.has(cf)) return { floor: cf, direction: DIR_DOWN };
            if (this.upCalls.has(cf)) return { floor: cf, direction: DIR_UP };
            return null;
        }

        // IDLE: pick nearest active call.
        const allCalls = new Set([...this.destinations, ...this.upCalls, ...this.downCalls]);
        if (allCalls.size === 0) return null;
        let nearest = null, minDist = Infinity;
        for (const f of allCalls) {
            const d = Math.abs(f - cf);
            if (d < minDist) { minDist = d; nearest = f; }
        }
        let dir;
        if (nearest > cf) dir = DIR_UP;
        else if (nearest < cf) dir = DIR_DOWN;
        else {
            // Same floor; direction depends on which button was pressed.
            if (this.upCalls.has(cf)) dir = DIR_UP;
            else if (this.downCalls.has(cf)) dir = DIR_DOWN;
            else dir = DIR_UP;  // pure destination (edge case)
        }
        return { floor: nearest, direction: dir };
    }

    _clearServedCallAtCurrentFloor() {
        const f = this.currentFloor;
        this.destinations.delete(f);
        if (this.direction === DIR_UP) {
            this.upCalls.delete(f);
            // If there is nothing more UP, also clear down-calls here (we'll service them now).
            if (!this._hasMoreInDirection(DIR_UP)) this.downCalls.delete(f);
        } else if (this.direction === DIR_DOWN) {
            this.downCalls.delete(f);
            if (!this._hasMoreInDirection(DIR_DOWN)) this.upCalls.delete(f);
        } else {
            this.upCalls.delete(f);
            this.downCalls.delete(f);
        }
        this._refreshCallPanels();
        this._refreshInCarButtons();
    }

    // ------------------------ Visual updates ------------------------
    _updateFloorTracker() {
        // If moving, show nearest integer floor so the indicator counts up.
        if (this.state === 'MOVING') {
            this.currentFloor = Math.max(0, Math.min(
                WORLD.FLOOR_COUNT - 1,
                Math.round(this.car.position.y / WORLD.FLOOR_HEIGHT)
            ));
        }
    }
    _refreshIndicators() {
        const txt = String(this.currentFloor);
        const dirSymbol = this.direction === DIR_UP ? '^' : (this.direction === DIR_DOWN ? 'v' : '');
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const floor = this.world.floors[f];
            if (floor.shaftIndicator) floor.shaftIndicator.userData.setText(txt + dirSymbol);
            if (floor.callPanel) floor.callPanel.userData.setIndicator(txt);
        }
        updateTextTexture(this.car.userData.inCarTex, txt + dirSymbol);
    }
    _refreshCallPanels() {
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const panel = this.world.floors[f].callPanel;
            if (!panel) continue;
            panel.userData.setUp(this.upCalls.has(f));
            panel.userData.setDown(this.downCalls.has(f));
        }
    }
    _refreshInCarButtons() {
        const buttons = this.car.userData.buttons;
        for (let f = 0; f < buttons.length; f++) {
            const lit = this.destinations.has(f);
            buttons[f].material = lit ? buttons[f].userData.onMat : buttons[f].userData.offMat;
        }
    }
}

window.Elevator = Elevator;
window.ELEVATOR = ELEVATOR;
window.DIR_UP = DIR_UP;
window.DIR_DOWN = DIR_DOWN;
window.DIR_IDLE = DIR_IDLE;
