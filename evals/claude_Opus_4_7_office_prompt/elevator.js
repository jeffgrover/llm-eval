// elevator.js — elevator car + SCAN-style scheduler + in-car destination panel

(function () {
    const FH = window.WORLD_CONST.FLOOR_HEIGHT;
    const FLOOR_COUNT = window.WORLD_CONST.FLOOR_COUNT;

    const MAX_CAPACITY = 4;
    const MIN_DOOR_OPEN_S = 3.5;
    const MAX_DOOR_OPEN_S = 18;
    const MOVE_SPEED = 3.0;      // m/s (simulation-seconds)
    const DOOR_TIME = 1.2;       // seconds to slide open/close

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;

            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;      // -1 | 0 | +1
            this.state = 'IDLE';     // IDLE | MOVING | DOOR_OPENING | DOOR_OPEN | DOOR_CLOSING
            this.y = 0;
            this.doorT = 0;          // 0 = closed, 1 = open
            this.doorTimer = 0;

            this.MAX_CAPACITY = MAX_CAPACITY;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotAssignments = new Map();
            this.spotOccupancy = [null, null, null, null];

            // 4 interior local-space spots
            this.spots = [
                { x: -0.6, z: -0.6 },   // back-left
                { x:  0.6, z: -0.6 },   // back-right
                { x: -0.6, z:  0.35 },  // front-left
                { x:  0.6, z:  0.35 }   // front-right
            ];

            this._buildCar();
            this._updateCarPosition();
            this._updateDoors();
            this._updateIndicators();
        }

        // --- Car geometry ---
        _buildCar() {
            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            this.scene.add(this.carGroup);

            const carW = 2.6, carD = 2.6, carH = 2.8;
            this.carW = carW; this.carD = carD; this.carH = carH;

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc22, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide
            });
            const solidBackMat = new THREE.MeshLambertMaterial({ color: 0xd9a91f });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffcc22, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide
            });
            const panelBodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
            this.buttonUnlitMat = new THREE.MeshBasicMaterial({ color: 0x333338 });
            this.buttonLitMat = new THREE.MeshBasicMaterial({ color: 0xffee55 });

            const add = (w, h, d, mat, x, y, z) => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                m.position.set(x, y, z);
                this.carGroup.add(m);
                return m;
            };

            // Floor
            add(carW, 0.08, carD, frameMat, 0, 0.04, 0);
            // Ceiling
            add(carW, 0.08, carD, frameMat, 0, carH - 0.04, 0);
            // Solid back wall (opaque yellow)
            add(carW, carH - 0.16, 0.08, solidBackMat, 0, carH / 2, -carD / 2 + 0.04);
            // Side walls (transparent yellow)
            add(0.08, carH - 0.16, carD, frameMat, -carW / 2 + 0.04, carH / 2, 0);
            add(0.08, carH - 0.16, carD, frameMat, carW / 2 - 0.04, carH / 2, 0);
            // Top beam above doors (across +Z face)
            add(carW, 0.4, 0.08, frameMat, 0, carH - 0.28, carD / 2 - 0.04);
            // Floor sill at +Z
            add(carW, 0.05, 0.08, frameMat, 0, 0.08, carD / 2 - 0.04);

            // Doors: each half car width. Closed positions meet at x=0.
            const doorW = carW / 2;
            const doorH = carH - 0.7;
            const doorY = 0.1 + doorH / 2;
            this.doorClosedXL = -doorW / 2;
            this.doorClosedXR = doorW / 2;
            this.doorOpenOffset = doorW - 0.12;  // slide outward

            this.leftDoor = add(doorW, doorH, 0.05, doorMat,
                this.doorClosedXL, doorY, carD / 2 - 0.02);
            this.rightDoor = add(doorW, doorH, 0.05, doorMat,
                this.doorClosedXR, doorY, carD / 2 - 0.02);

            // Destination panel on back-right (right wall, near back)
            const panelX = carW / 2 - 0.09;
            const panelZ = -carD / 2 + 0.35;
            const panel = add(0.03, 1.7, 0.4, panelBodyMat, panelX, 1.2, panelZ);

            this.buttons = {};
            for (let f = 0; f < FLOOR_COUNT; f++) {
                const bGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
                const b = new THREE.Mesh(bGeom, this.buttonUnlitMat);
                b.rotation.z = Math.PI / 2;
                b.position.set(panelX - 0.025, 0.55 + f * 0.22, panelZ);
                this.carGroup.add(b);
                this.buttons[f] = b;
            }

            // In-car floor indicator above doors (facing passenger / -Z)
            const tex = window.createDigitalTexture('L', 256);
            const indGeom = new THREE.PlaneGeometry(0.6, 0.6);
            const indMat = new THREE.MeshBasicMaterial({
                map: tex, transparent: false, side: THREE.DoubleSide
            });
            const ind = new THREE.Mesh(indGeom, indMat);
            ind.position.set(0, carH - 0.65, carD / 2 - 0.2);
            ind.rotation.y = Math.PI;  // face -Z (into car)
            this.inCarIndicator = ind;
            this.inCarIndicator.userData.tex = tex;
            this.inCarIndicator.userData.setText = t => window.updateDigitalTexture(tex, String(t));
            this.carGroup.add(ind);

            // Apply renderOrder=1 to all car children
            this.carGroup.traverse(o => { o.renderOrder = 1; });
        }

        // --- Public API ---
        callUp(floor) {
            if (floor < 0 || floor >= FLOOR_COUNT) return;
            if (floor === FLOOR_COUNT - 1) return;   // no up call from top
            this.upCalls.add(floor);
            this._refreshPanel(floor);
        }

        callDown(floor) {
            if (floor <= 0 || floor >= FLOOR_COUNT) return;  // no down call from lobby
            this.downCalls.add(floor);
            this._refreshPanel(floor);
        }

        pressDestination(floor) {
            if (floor < 0 || floor >= FLOOR_COUNT) return;
            this.destinations.add(floor);
            if (this.buttons[floor]) this.buttons[floor].material = this.buttonLitMat;
        }

        isAcceptingAt(floor, direction) {
            if (this.currentFloor !== floor) return false;
            if (this.state !== 'DOOR_OPEN') return false;
            const hasMore = this._hasMoreStopsInDirection(this.direction);
            if (!hasMore) return true;
            if (direction === this.direction) return true;
            return false;
        }

        currentCapacityFree() {
            return this.MAX_CAPACITY - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let idx = -1;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) { idx = i; break; }
            }
            if (idx < 0) return null;
            this.spotOccupancy[idx] = person;
            this.spotAssignments.set(person, idx);
            this.pendingBoarders.add(person);
            const s = this.spots[idx];
            return new THREE.Vector3(s.x, 0, s.z);
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.passengers.delete(person);
            this.pendingDisembark.delete(person);
            const idx = this.spotAssignments.get(person);
            if (idx !== undefined) {
                this.spotOccupancy[idx] = null;
                this.spotAssignments.delete(person);
            }
        }

        // Convert a local-space car position to world space.
        localToWorld(x, y, z) {
            return new THREE.Vector3(x, y + this.y, z);
        }

        getDoorWorldZ() {
            return this.carD / 2;
        }

        // --- Tick ---
        tick(dt) {
            if (this.state === 'IDLE')          this._tickIdle();
            else if (this.state === 'MOVING')   this._tickMoving(dt);
            else if (this.state === 'DOOR_OPENING') this._tickDoorOpening(dt);
            else if (this.state === 'DOOR_OPEN')    this._tickDoorOpen(dt);
            else if (this.state === 'DOOR_CLOSING') this._tickDoorClosing(dt);
            this._updateDoors();
            this._updateCarPosition();
            this._updateIndicators();
        }

        _tickIdle() {
            if (!this._anyWork()) return;
            const next = this._chooseNextTarget();
            if (next === null) return;
            this.targetFloor = next;
            const dir = Math.sign(next - this.currentFloor);
            if (dir === 0) {
                this._beginOpeningDoors();
            } else {
                this.direction = dir;
                this.state = 'MOVING';
            }
        }

        _tickMoving(dt) {
            // Re-evaluate target every frame — shorten if a closer stop appeared.
            const closer = this._closestStopInDirection();
            if (closer !== null) {
                const targetDist = Math.abs(this.targetFloor * FH - this.y);
                const closerDist = Math.abs(closer * FH - this.y);
                if (closerDist < targetDist) {
                    this.targetFloor = closer;
                }
            }

            const targetY = this.targetFloor * FH;
            const dy = this.direction * MOVE_SPEED * dt;
            const newY = this.y + dy;

            if ((this.direction > 0 && newY >= targetY) ||
                (this.direction < 0 && newY <= targetY)) {
                this.y = targetY;
                this.currentFloor = this.targetFloor;
                this._beginOpeningDoors();
            } else {
                this.y = newY;
            }
        }

        _tickDoorOpening(dt) {
            this.doorT += dt / DOOR_TIME;
            if (this.doorT >= 1) {
                this.doorT = 1;
                this.state = 'DOOR_OPEN';
                this.doorTimer = 0;
                this._clearServedCalls();
            }
        }

        _tickDoorOpen(dt) {
            this.doorTimer += dt;
            // Hold the doors until min time AND no pending boarders/disembarkers;
            // safety cap MAX_DOOR_OPEN_S.
            if (this.doorTimer < MIN_DOOR_OPEN_S) return;
            const busy = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
            if (busy && this.doorTimer < MAX_DOOR_OPEN_S) return;
            this.state = 'DOOR_CLOSING';
        }

        _tickDoorClosing(dt) {
            this.doorT -= dt / DOOR_TIME;
            if (this.doorT <= 0) {
                this.doorT = 0;
                this._pickNextTarget();
            }
        }

        _pickNextTarget() {
            const next = this._chooseNextTarget();
            if (next === null) {
                this.direction = 0;
                this.state = 'IDLE';
                return;
            }
            const dir = Math.sign(next - this.currentFloor);
            this.targetFloor = next;
            if (dir === 0) {
                this._beginOpeningDoors();
            } else {
                this.direction = dir;
                this.state = 'MOVING';
            }
        }

        _beginOpeningDoors() {
            this.state = 'DOOR_OPENING';
            this.doorTimer = 0;
        }

        _chooseNextTarget() {
            // Same-floor call / destination takes priority.
            if (this.destinations.has(this.currentFloor) ||
                this.upCalls.has(this.currentFloor) ||
                this.downCalls.has(this.currentFloor)) {
                return this.currentFloor;
            }

            if (this.direction === 1) {
                const up = this._stopsAbove(this.currentFloor);
                if (up.length) return Math.min.apply(null, up);
                const dn = this._stopsBelow(this.currentFloor);
                if (dn.length) return Math.max.apply(null, dn);
            } else if (this.direction === -1) {
                const dn = this._stopsBelow(this.currentFloor);
                if (dn.length) return Math.max.apply(null, dn);
                const up = this._stopsAbove(this.currentFloor);
                if (up.length) return Math.min.apply(null, up);
            } else {
                // IDLE: pick nearest stop of any kind.
                const all = [].concat(
                    this._stopsAbove(this.currentFloor),
                    this._stopsBelow(this.currentFloor)
                );
                if (all.length) {
                    let best = all[0];
                    let bestD = Math.abs(best - this.currentFloor);
                    for (let i = 1; i < all.length; i++) {
                        const d = Math.abs(all[i] - this.currentFloor);
                        if (d < bestD) { best = all[i]; bestD = d; }
                    }
                    return best;
                }
            }
            return null;
        }

        _stopsAbove(floor) {
            const s = new Set();
            this.destinations.forEach(f => { if (f > floor) s.add(f); });
            this.upCalls.forEach(f => { if (f > floor) s.add(f); });
            return Array.from(s);
        }

        _stopsBelow(floor) {
            const s = new Set();
            this.destinations.forEach(f => { if (f < floor) s.add(f); });
            this.downCalls.forEach(f => { if (f < floor) s.add(f); });
            return Array.from(s);
        }

        _closestStopInDirection() {
            if (this.direction === 1) {
                // Any stop strictly above our current position (in floor units).
                const floorHere = Math.floor(this.y / FH + 0.001);
                const above = this._stopsAbove(floorHere);
                if (above.length === 0) return null;
                let best = above[0];
                for (let i = 1; i < above.length; i++) if (above[i] < best) best = above[i];
                return best;
            } else if (this.direction === -1) {
                const floorHere = Math.ceil(this.y / FH - 0.001);
                const below = this._stopsBelow(floorHere);
                if (below.length === 0) return null;
                let best = below[0];
                for (let i = 1; i < below.length; i++) if (below[i] > best) best = below[i];
                return best;
            }
            return null;
        }

        _hasMoreStopsInDirection(dir) {
            if (dir === 1)  return this._stopsAbove(this.currentFloor).length > 0;
            if (dir === -1) return this._stopsBelow(this.currentFloor).length > 0;
            return false;
        }

        _anyWork() {
            return this.destinations.size > 0 ||
                   this.upCalls.size > 0 ||
                   this.downCalls.size > 0;
        }

        _clearServedCalls() {
            this.destinations.delete(this.currentFloor);
            if (this.buttons[this.currentFloor]) {
                this.buttons[this.currentFloor].material = this.buttonUnlitMat;
            }
            if (this.direction === 1) {
                this.upCalls.delete(this.currentFloor);
            } else if (this.direction === -1) {
                this.downCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            // If no more stops in current direction, clear the opposite-direction call
            // at this floor so we can serve it before leaving.
            if (!this._hasMoreStopsInDirection(this.direction)) {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            this._refreshPanel(this.currentFloor);
        }

        _refreshPanel(floor) {
            const fd = this.world.floors[floor];
            if (!fd || !fd.callPanel) return;
            fd.callPanel.userData.setUp(this.upCalls.has(floor));
            fd.callPanel.userData.setDown(this.downCalls.has(floor));
        }

        // --- Rendering updates ---
        _updateDoors() {
            const t = this.doorT;
            this.leftDoor.position.x = this.doorClosedXL - t * this.doorOpenOffset;
            this.rightDoor.position.x = this.doorClosedXR + t * this.doorOpenOffset;
        }

        _updateCarPosition() {
            this.carGroup.position.y = this.y;
        }

        _displayFloor() {
            if (this.state === 'MOVING') {
                if (this.direction === 1)  return Math.min(FLOOR_COUNT - 1, Math.ceil(this.y / FH - 0.1));
                if (this.direction === -1) return Math.max(0, Math.floor(this.y / FH + 0.1));
            }
            return this.currentFloor;
        }

        _updateIndicators() {
            const f = this._displayFloor();
            const label = f === 0 ? 'L' : String(f);
            const arrow = this.direction === 1 ? '^'
                        : this.direction === -1 ? 'v' : '';
            const text = label + arrow;
            this.inCarIndicator.userData.setText(text);
            for (let i = 0; i < this.world.floors.length; i++) {
                const fd = this.world.floors[i];
                if (fd && fd.shaftIndicator) fd.shaftIndicator.userData.setText(text);
                if (fd && fd.callPanel) fd.callPanel.userData.setIndicator(text);
            }
        }

        // --- Day-wrap reset ---
        reset() {
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotAssignments = new Map();
            this.spotOccupancy = [null, null, null, null];
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.state = 'IDLE';
            this.y = 0;
            this.doorT = 0;
            this.doorTimer = 0;
            for (let f = 0; f < FLOOR_COUNT; f++) {
                if (this.buttons[f]) this.buttons[f].material = this.buttonUnlitMat;
                this._refreshPanel(f);
            }
            this._updateCarPosition();
            this._updateDoors();
            this._updateIndicators();
        }
    }

    window.Elevator = Elevator;
})();
