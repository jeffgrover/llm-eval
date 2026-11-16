// elevator.js — Elevator car + SCAN-style scheduler + in-car destination panel

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;

        this.MAX_CAPACITY = 4;
        this.MIN_DOOR_OPEN_S = 3.5;
        this.MAX_DOOR_OPEN_S = 18.0;
        this.DOOR_ANIM_S = 0.75;
        this.CAR_SPEED = 4.0; // m/s (~0.85s per floor)

        this.CAR_W = 2.6;
        this.CAR_D = 2.6;
        this.CAR_H = 2.55;

        this.state = 'IDLE'; // IDLE | MOVING | DOOR_OPENING | DOOR_OPEN | DOOR_CLOSING
        this.direction = 0;  // +1 up, -1 down, 0 idle
        this.currentFloor = 0;
        this.targetFloor = 0;

        this.doorOpenFrac = 0;
        this.doorTimer = 0;

        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();

        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();

        // 4 interior local-space spots (feet at y = 0)
        this.spots = [
            new THREE.Vector3(-0.62, 0, -0.55), // back-left
            new THREE.Vector3(0.62, 0, -0.55),  // back-right
            new THREE.Vector3(-0.62, 0, 0.42),  // front-left
            new THREE.Vector3(0.62, 0, 0.42)    // front-right
        ];
        this.spotOccupancy = [null, null, null, null];
        this.personSpots = new Map();

        this._buildCarMesh();
        this.scene.add(this.group);
        this._refreshPanels();
        this._refreshDestButtons();
        this._updateIndicators();
    }

    _buildCarMesh() {
        this.group = new THREE.Group();
        this.group.renderOrder = 1;

        const W = this.CAR_W;
        const D = this.CAR_D;
        const H = this.CAR_H;
        const wallT = 0.05;

        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xfacc15,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const backWallMat = new THREE.MeshLambertMaterial({
            color: 0xeab308
        });

        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xfde047,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const panelMat = new THREE.MeshLambertMaterial({ color: 0x1f242d });
        this.btnOffMat = new THREE.MeshBasicMaterial({ color: 0x4b5563 });
        this.btnOnMat = new THREE.MeshBasicMaterial({ color: 0xffdd33 });

        // Floor (top surface at local y = 0)
        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, D), frameMat);
        floorMesh.position.set(0, -0.04, 0);
        this.group.add(floorMesh);

        // Ceiling
        const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, D), frameMat);
        ceilMesh.position.set(0, H + 0.04, 0);
        this.group.add(ceilMesh);

        // Opaque yellow back wall (-Z)
        const backMesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, wallT), backWallMat);
        backMesh.position.set(0, H / 2, -D / 2 + wallT / 2);
        this.group.add(backMesh);

        // Semi-transparent side walls
        const leftMesh = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, D), frameMat);
        leftMesh.position.set(-W / 2 + wallT / 2, H / 2, 0);
        this.group.add(leftMesh);

        const rightMesh = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, D), frameMat);
        rightMesh.position.set(W / 2 - wallT / 2, H / 2, 0);
        this.group.add(rightMesh);

        // Front header above sliding doors (+Z)
        const doorH = 2.12;
        const headerH = H - doorH;
        const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(W, headerH, wallT), frameMat);
        headerMesh.position.set(0, doorH + headerH / 2, D / 2 - wallT / 2);
        this.group.add(headerMesh);

        // Two sliding doors on +Z face
        const doorW = W / 2;
        this.doorHalfW = doorW;
        this.doorSlideDist = W / 2 - 0.14;

        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.045), doorMat);
        this.leftDoor.position.set(-doorW / 2, doorH / 2, D / 2 - 0.025);
        this.group.add(this.leftDoor);

        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.045), doorMat);
        this.rightDoor.position.set(doorW / 2, doorH / 2, D / 2 - 0.025);
        this.group.add(this.rightDoor);

        // Destination panel on the back-right wall with one glowing cylinder button per floor
        const floorCount = WORLD.FLOOR_COUNT;
        const destPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.10, 0.04), panelMat);
        destPlate.position.set(0.86, 1.28, -D / 2 + 0.06);
        this.group.add(destPlate);

        this.destButtons = [];
        const btnGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.045, 14);
        for (let f = 0; f < floorCount; f++) {
            const btn = new THREE.Mesh(btnGeo, this.btnOffMat);
            btn.rotation.x = Math.PI / 2; // cylinder faces +Z into cabin
            const by = 0.86 + f * (0.84 / Math.max(1, floorCount - 1));
            btn.position.set(0.86, by, -D / 2 + 0.095);
            this.group.add(btn);
            this.destButtons.push(btn);
        }

        // In-car floor indicator above the doors facing -Z (looking back at passengers)
        this.inCarTex = window.createTextTexture('0');
        const inCarBezel = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.04), panelMat);
        inCarBezel.position.set(0, 2.24, D / 2 - 0.09);
        this.group.add(inCarBezel);

        const inCarScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.inCarTex })
        );
        inCarScreen.rotation.y = Math.PI; // faces -Z toward riders inside the car
        inCarScreen.position.set(0, 2.24, D / 2 - 0.115);
        this.group.add(inCarScreen);

        // Ensure all car meshes have renderOrder = 1
        this.group.traverse(function (obj) {
            if (obj.isMesh) {
                obj.renderOrder = 1;
            }
        });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    callUp(floor) {
        if (floor < 0 || floor >= WORLD.FLOOR_COUNT - 1) return;
        if (!this.upCalls.has(floor)) {
            this.upCalls.add(floor);
            this._refreshPanels();
        }
    }

    callDown(floor) {
        if (floor <= 0 || floor >= WORLD.FLOOR_COUNT) return;
        if (!this.downCalls.has(floor)) {
            this.downCalls.add(floor);
            this._refreshPanels();
        }
    }

    pressDestination(floor) {
        if (floor < 0 || floor >= WORLD.FLOOR_COUNT) return;
        if (!this.destinations.has(floor)) {
            this.destinations.add(floor);
            this._refreshDestButtons();
        }
        // If car had no committed direction yet, adopt direction toward pressed floor
        if (this.direction === 0 && floor !== this.currentFloor) {
            this.direction = floor > this.currentFloor ? 1 : -1;
        } else if (
            this.direction !== 0 &&
            floor !== this.currentFloor &&
            !this._hasStopsInDirection(this.direction, this.currentFloor)
        ) {
            this.direction = floor > this.currentFloor ? 1 : -1;
        }
    }

    isAcceptingAt(floor, direction) {
        if (this.state !== 'DOOR_OPEN' || this.currentFloor !== floor) return false;
        if (this.direction === 0 || this.direction === direction) return true;
        if (!this._hasStopsInDirection(this.direction, floor)) return true;
        return false;
    }

    currentCapacityFree() {
        return this.MAX_CAPACITY - (this.passengers.size + this.pendingBoarders.size);
    }

    reserveBoardingSpot(person) {
        if (this.personSpots.has(person)) {
            return this.spots[this.personSpots.get(person)].clone();
        }
        if (this.currentCapacityFree() <= 0) return null;

        for (let i = 0; i < this.spotOccupancy.length; i++) {
            if (this.spotOccupancy[i] === null) {
                this.spotOccupancy[i] = person;
                this.personSpots.set(person, i);
                this.pendingBoarders.add(person);
                // Ensure call for adopted direction is cleared when accepting
                if (this.direction === 0) {
                    if (this.upCalls.has(this.currentFloor)) {
                        this.direction = 1;
                        this.upCalls.delete(this.currentFloor);
                        this._refreshPanels();
                    } else if (this.downCalls.has(this.currentFloor)) {
                        this.direction = -1;
                        this.downCalls.delete(this.currentFloor);
                        this._refreshPanels();
                    }
                }
                return this.spots[i].clone();
            }
        }
        return null;
    }

    cancelBoarding(person) {
        this.pendingBoarders.delete(person);
        this.passengers.delete(person);
        if (this.personSpots.has(person)) {
            const idx = this.personSpots.get(person);
            if (this.spotOccupancy[idx] === person) {
                this.spotOccupancy[idx] = null;
            }
            this.personSpots.delete(person);
        }
    }

    completeBoard(person) {
        this.pendingBoarders.delete(person);
        this.passengers.add(person);
    }

    registerDisembark(person) {
        this.passengers.delete(person);
        this.pendingBoarders.delete(person);
        this.pendingDisembark.add(person);
        if (this.personSpots.has(person)) {
            const idx = this.personSpots.get(person);
            if (this.spotOccupancy[idx] === person) {
                this.spotOccupancy[idx] = null;
            }
            this.personSpots.delete(person);
        }
    }

    completeDisembark(person) {
        this.pendingDisembark.delete(person);
        this.passengers.delete(person);
        if (this.personSpots.has(person)) {
            const idx = this.personSpots.get(person);
            if (this.spotOccupancy[idx] === person) {
                this.spotOccupancy[idx] = null;
            }
            this.personSpots.delete(person);
        }
    }

    reset() {
        // Detach any person groups still parented to the car
        const toRemove = [];
        for (let i = 0; i < this.group.children.length; i++) {
            const ch = this.group.children[i];
            if (ch.userData && ch.userData.leftLeg) {
                toRemove.push(ch);
            }
        }
        for (let i = 0; i < toRemove.length; i++) {
            this.group.remove(toRemove[i]);
        }

        this.upCalls.clear();
        this.downCalls.clear();
        this.destinations.clear();
        this.passengers.clear();
        this.pendingBoarders.clear();
        this.pendingDisembark.clear();
        this.personSpots.clear();
        this.spotOccupancy = [null, null, null, null];

        this.state = 'IDLE';
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.doorOpenFrac = 0;
        this.doorTimer = 0;

        this.group.position.y = 0;
        this._applyDoorPositions();
        this._refreshPanels();
        this._refreshDestButtons();
        this._updateIndicators();
    }

    // -------------------------------------------------------------------------
    // Internal Scheduling Helpers (SCAN)
    // -------------------------------------------------------------------------
    _hasAnyStopAbove(floor) {
        for (const f of this.destinations) if (f > floor) return true;
        for (const f of this.upCalls) if (f > floor) return true;
        for (const f of this.downCalls) if (f > floor) return true;
        return false;
    }

    _hasAnyStopBelow(floor) {
        for (const f of this.destinations) if (f < floor) return true;
        for (const f of this.upCalls) if (f < floor) return true;
        for (const f of this.downCalls) if (f < floor) return true;
        return false;
    }

    _hasStopsInDirection(dir, floor) {
        if (dir > 0) return this._hasAnyStopAbove(floor);
        if (dir < 0) return this._hasAnyStopBelow(floor);
        return false;
    }

    _findNextUpTarget(aboveFloor) {
        // 1. Lowest destination or upCall strictly above aboveFloor
        let best = Infinity;
        for (const f of this.destinations) {
            if (f > aboveFloor && f < best) best = f;
        }
        for (const f of this.upCalls) {
            if (f > aboveFloor && f < best) best = f;
        }
        if (best !== Infinity) return best;

        // 2. Highest downCall strictly above aboveFloor (sweep to top turnaround)
        let highestDown = -Infinity;
        for (const f of this.downCalls) {
            if (f > aboveFloor && f > highestDown) highestDown = f;
        }
        if (highestDown !== -Infinity) return highestDown;

        return null;
    }

    _findNextDownTarget(belowFloor) {
        // 1. Highest destination or downCall strictly below belowFloor
        let best = -Infinity;
        for (const f of this.destinations) {
            if (f < belowFloor && f > best) best = f;
        }
        for (const f of this.downCalls) {
            if (f < belowFloor && f > best) best = f;
        }
        if (best !== -Infinity) return best;

        // 2. Lowest upCall strictly below belowFloor (sweep to bottom turnaround)
        let lowestUp = Infinity;
        for (const f of this.upCalls) {
            if (f < belowFloor && f < lowestUp) lowestUp = f;
        }
        if (lowestUp !== Infinity) return lowestUp;

        return null;
    }

    _transitionAfterDoorClose() {
        const cur = this.currentFloor;

        if (this.direction >= 0) {
            // Try continuing UP first
            const upTarget = this._findNextUpTarget(cur);
            if (upTarget !== null) {
                this.direction = 1;
                this.targetFloor = upTarget;
                this.state = 'MOVING';
                return;
            }
            // Else reverse to DOWN
            const downTarget = this._findNextDownTarget(cur);
            if (downTarget !== null) {
                this.direction = -1;
                this.targetFloor = downTarget;
                this.state = 'MOVING';
                return;
            }
        } else {
            // Try continuing DOWN first
            const downTarget = this._findNextDownTarget(cur);
            if (downTarget !== null) {
                this.direction = -1;
                this.targetFloor = downTarget;
                this.state = 'MOVING';
                return;
            }
            // Else reverse to UP
            const upTarget = this._findNextUpTarget(cur);
            if (upTarget !== null) {
                this.direction = 1;
                this.targetFloor = upTarget;
                this.state = 'MOVING';
                return;
            }
        }

        // Check same-floor calls (only if capacity is available or someone inside pressed cur)
        const canBoardHere = this.currentCapacityFree() > 0;
        if (this.destinations.has(cur)) {
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }
        if (canBoardHere && this.upCalls.has(cur)) {
            this.direction = 1;
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }
        if (canBoardHere && this.downCalls.has(cur)) {
            this.direction = -1;
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }

        this.direction = 0;
        this.state = 'IDLE';
    }

    _pickTargetFromIdle() {
        const cur = this.currentFloor;

        // Same floor calls take immediate priority when IDLE
        if (this.destinations.has(cur)) {
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }
        if (this.upCalls.has(cur)) {
            this.direction = 1;
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }
        if (this.downCalls.has(cur)) {
            this.direction = -1;
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
            return;
        }

        // Find nearest call/destination across all floors
        let nearest = null;
        let bestDist = Infinity;
        const all = new Set([...this.destinations, ...this.upCalls, ...this.downCalls]);
        for (const f of all) {
            const d = Math.abs(f - cur);
            if (d < bestDist) {
                bestDist = d;
                nearest = f;
            }
        }

        if (nearest !== null) {
            this.direction = nearest > cur ? 1 : -1;
            // Once direction is chosen, pick proper SCAN stop in that direction
            if (this.direction === 1) {
                const t = this._findNextUpTarget(cur);
                this.targetFloor = t !== null ? t : nearest;
            } else {
                const t = this._findNextDownTarget(cur);
                this.targetFloor = t !== null ? t : nearest;
            }
            this.state = 'MOVING';
        }
    }

    _serveCurrentFloorOnArrival() {
        const f = this.currentFloor;
        this.destinations.delete(f);

        if (this.direction === 1) {
            if (this.upCalls.has(f)) {
                this.upCalls.delete(f);
            } else if (!this._hasAnyStopAbove(f) && this.downCalls.has(f)) {
                this.direction = -1;
                this.downCalls.delete(f);
            }
        } else if (this.direction === -1) {
            if (this.downCalls.has(f)) {
                this.downCalls.delete(f);
            } else if (!this._hasAnyStopBelow(f) && this.upCalls.has(f)) {
                this.direction = 1;
                this.upCalls.delete(f);
            }
        } else {
            if (this.upCalls.has(f)) {
                this.direction = 1;
                this.upCalls.delete(f);
            } else if (this.downCalls.has(f)) {
                this.direction = -1;
                this.downCalls.delete(f);
            }
        }

        this._refreshDestButtons();
        this._refreshPanels();
    }

    // -------------------------------------------------------------------------
    // Per-Frame State Machine Tick
    // -------------------------------------------------------------------------
    tick(dt) {
        if (dt <= 0) return;

        switch (this.state) {
            case 'IDLE':
                this._pickTargetFromIdle();
                break;

            case 'MOVING':
                this._tickMoving(dt);
                break;

            case 'DOOR_OPENING':
                this.doorOpenFrac = Math.min(1, this.doorOpenFrac + dt / this.DOOR_ANIM_S);
                this._applyDoorPositions();
                if (this.doorOpenFrac >= 1) {
                    this.doorOpenFrac = 1;
                    this.doorTimer = 0;
                    // Re-check turnaround call clearing on door fully open
                    this._serveCurrentFloorOnArrival();
                    this.state = 'DOOR_OPEN';
                }
                break;

            case 'DOOR_OPEN':
                this.doorTimer += dt;
                // Clear same-direction call if capacity is still free while open
                if (this.currentCapacityFree() > 0) {
                    if (this.direction === 1 && this.upCalls.has(this.currentFloor)) {
                        this.upCalls.delete(this.currentFloor);
                        this._refreshPanels();
                    } else if (this.direction === -1 && this.downCalls.has(this.currentFloor)) {
                        this.downCalls.delete(this.currentFloor);
                        this._refreshPanels();
                    } else if (!this._hasStopsInDirection(this.direction, this.currentFloor)) {
                        if (this.upCalls.has(this.currentFloor)) {
                            this.direction = 1;
                            this.upCalls.delete(this.currentFloor);
                            this._refreshPanels();
                        } else if (this.downCalls.has(this.currentFloor)) {
                            this.direction = -1;
                            this.downCalls.delete(this.currentFloor);
                            this._refreshPanels();
                        }
                    }
                }

                if (
                    this.doorTimer >= this.MIN_DOOR_OPEN_S &&
                    this.pendingBoarders.size === 0 &&
                    this.pendingDisembark.size === 0
                ) {
                    this.state = 'DOOR_CLOSING';
                } else if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                    // Safety cap: finalize anyone already inside car, release stalled outsiders
                    for (const p of Array.from(this.pendingBoarders)) {
                        if (p.parent === this.group) {
                            this.completeBoard(p);
                        } else {
                            this.cancelBoarding(p);
                        }
                    }
                    this.pendingDisembark.clear();
                    this.state = 'DOOR_CLOSING';
                }
                break;

            case 'DOOR_CLOSING':
                this.doorOpenFrac = Math.max(0, this.doorOpenFrac - dt / this.DOOR_ANIM_S);
                this._applyDoorPositions();
                if (this.doorOpenFrac <= 0) {
                    this.doorOpenFrac = 0;
                    this._transitionAfterDoorClose();
                }
                break;
        }

        this._updateIndicators();
    }

    _tickMoving(dt) {
        const H = WORLD.FLOOR_HEIGHT;
        const curY = this.group.position.y;

        // Critical: dynamically shorten targetFloor if a closer same-direction stop appeared
        if (this.direction === 1) {
            for (let f = 0; f < this.targetFloor; f++) {
                const fy = f * H;
                if (fy >= curY + 0.04) {
                    const wantsStop =
                        this.destinations.has(f) ||
                        (this.upCalls.has(f) && this.currentCapacityFree() > 0);
                    if (wantsStop) {
                        this.targetFloor = f;
                        break;
                    }
                }
            }
        } else if (this.direction === -1) {
            for (let f = WORLD.FLOOR_COUNT - 1; f > this.targetFloor; f--) {
                const fy = f * H;
                if (fy <= curY - 0.04) {
                    const wantsStop =
                        this.destinations.has(f) ||
                        (this.downCalls.has(f) && this.currentCapacityFree() > 0);
                    if (wantsStop) {
                        this.targetFloor = f;
                        break;
                    }
                }
            }
        }

        const targetY = this.targetFloor * H;
        const diff = targetY - curY;
        const step = this.CAR_SPEED * dt;

        if (Math.abs(diff) <= step) {
            this.group.position.y = targetY;
            this.currentFloor = this.targetFloor;
            this._serveCurrentFloorOnArrival();
            this.state = 'DOOR_OPENING';
        } else {
            this.group.position.y += Math.sign(diff) * step;
            this.currentFloor = Math.max(
                0,
                Math.min(WORLD.FLOOR_COUNT - 1, Math.round(this.group.position.y / H))
            );
        }
    }

    // -------------------------------------------------------------------------
    // Visual Updates (Doors, Lamps, Digital Displays)
    // -------------------------------------------------------------------------
    _applyDoorPositions() {
        const offset = this.doorSlideDist * this.doorOpenFrac;
        this.leftDoor.position.x = -this.doorHalfW / 2 - offset;
        this.rightDoor.position.x = this.doorHalfW / 2 + offset;
    }

    _refreshPanels() {
        const floors = this.world.floors;
        for (let f = 0; f < floors.length; f++) {
            const cp = floors[f].callPanel;
            if (cp && cp.userData) {
                cp.userData.setUp(this.upCalls.has(f));
                cp.userData.setDown(this.downCalls.has(f));
            }
        }
    }

    _refreshDestButtons() {
        for (let f = 0; f < this.destButtons.length; f++) {
            this.destButtons[f].material = this.destinations.has(f) ? this.btnOnMat : this.btnOffMat;
        }
    }

    _updateIndicators() {
        const arrow = this.direction > 0 ? '\u2191' : (this.direction < 0 ? '\u2193' : '');
        const text = String(this.currentFloor) + arrow;

        window.updateTextTexture(this.inCarTex, text);

        const floors = this.world.floors;
        for (let f = 0; f < floors.length; f++) {
            const fl = floors[f];
            if (fl.shaftIndicator && fl.shaftIndicator.userData) {
                fl.shaftIndicator.userData.setIndicator(text);
            }
            if (fl.callPanel && fl.callPanel.userData) {
                fl.callPanel.userData.setIndicator(text);
            }
        }
    }
}

window.Elevator = Elevator;
