// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, DOM, or browser dependencies. Dual environment: browser global + Node module.

(function(root) {

    const MIN_DOOR_OPEN_S = 1.6;
    const MAX_DOOR_OPEN_S = 9.0;
    const DOOR_MOVE_S = 0.9;
    const CAR_SPEED = 2.2; // world units per second of vertical travel

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = (options.floorCount !== undefined) ? options.floorCount : 6;
            this.maxCapacity = (options.maxCapacity !== undefined) ? options.maxCapacity : 4;
            this.floorHeight = (options.floorHeight !== undefined) ? options.floorHeight : 3.4;

            this.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
            this.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
            this.DOOR_MOVE_S = DOOR_MOVE_S;
            this.CAR_SPEED = CAR_SPEED;

            // Logical interior spots (car-local x/z offsets; y = 0 at car floor).
            this.spotOffsets = [
                { x: -0.7, y: 0, z: -0.7 },
                { x: 0.7, y: 0, z: -0.7 },
                { x: -0.7, y: 0, z: 0.55 },
                { x: 0.7, y: 0, z: 0.55 }
            ];
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.y = 0;
            this.doorProgress = 0;      // 0 closed .. 1 open
            this.doorOpenTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) { this.upCalls.add(floor); }
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) { this.downCalls.add(floor); }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
                this.destinations.add(floor);
            } else if (floor >= 0 && floor < this.floorCount && this.state !== "DOOR_OPEN") {
                // Pressing current floor while doors shut: still register so it opens.
                this.destinations.add(floor);
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN") { return false; }
            if (this.currentFloor !== floor) { return false; }
            if (this.direction === 0 || direction === 0) { return true; }
            if (this.direction === direction) { return true; }
            // Accept opposite-direction boarders only when no more work in current direction.
            return !this._hasWorkInDirection(this.direction, floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) { return null; }
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    const off = this.spotOffsets[i];
                    return { index: i, x: off.x, y: off.y, z: off.z };
                }
            }
            return null;
        }

        releaseSpot(person) {
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) { this.spotOccupancy[i] = null; }
            }
        }

        cancelBoard(person) {
            this.pendingBoarders.delete(person);
            this.releaseSpot(person);
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.passengers.delete(person);
                this.pendingDisembark.add(person);
            } else {
                this.pendingDisembark.add(person);
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.releaseSpot(person);
        }

        _hasWorkInDirection(dir, fromFloor) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { return true; }
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { return true; }
                }
            }
            return false;
        }

        _nearestStopInDirection(dir, fromFloor) {
            // Nearest destination or matching-direction hall call strictly ahead.
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) { return f; }
                }
                // Farthest down-call above (turnaround point).
                for (let f = this.floorCount - 1; f > fromFloor; f--) {
                    if (this.downCalls.has(f)) { return f; }
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) { return f; }
                }
                for (let f = 0; f < fromFloor; f++) {
                    if (this.upCalls.has(f)) { return f; }
                }
            }
            return null;
        }

        _nearestAnyStop(fromFloor, excludeCurrent) {
            let best = null;
            let bestDist = Infinity;
            for (let f = 0; f < this.floorCount; f++) {
                if (excludeCurrent && f === fromFloor) { continue; }
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    const d = Math.abs(f - fromFloor);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            return best;
        }

        _pickNextTarget() {
            const here = this.currentFloor;
            const hasRiderWork = this.passengers.size > 0 || this.pendingBoarders.size > 0;

            // Passenger destinations outrank everything, especially same-floor hall calls.
            if (hasRiderWork && this.destinations.size > 0) {
                let target = null;
                if (this.direction !== 0) {
                    target = this._nearestDestinationInDirection(this.direction, here);
                }
                if (target === null) {
                    // Nearest destination overall; set direction toward it.
                    let bestDist = Infinity;
                    this.destinations.forEach((f) => {
                        const d = Math.abs(f - here);
                        if (f !== here && d < bestDist) { bestDist = d; target = f; }
                    });
                }
                if (target !== null) { return target; }
            }

            // SCAN: keep going in current direction if work remains ahead.
            if (this.direction !== 0) {
                const ahead = this._nearestStopInDirection(this.direction, here);
                if (ahead !== null) { return ahead; }
                const behind = this._nearestStopInDirection(-this.direction, here);
                if (behind !== null) { return behind; }
            }
            // Idle: nearest active anything. Avoid re-serving the floor we just served
            // while destinations exist elsewhere (anti ping-pong guard).
            const excludeHere = this.servedThisDoorCycle && this.lastServedFloor === here && this.destinations.size > 0;
            const any = this._nearestAnyStop(here, excludeHere);
            if (any !== null && any !== here) { return any; }
            if (any === here && !excludeHere) { return here; }
            return null;
        }

        _nearestDestinationInDirection(dir, fromFloor) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f)) { return f; }
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f)) { return f; }
                }
            }
            return null;
        }

        _arriveAtFloor() {
            const f = this.currentFloor;
            this.destinations.delete(f);
            if (this.direction > 0) {
                this.upCalls.delete(f);
                if (!this._hasWorkInDirection(1, f)) { this.downCalls.delete(f); }
            } else if (this.direction < 0) {
                this.downCalls.delete(f);
                if (!this._hasWorkInDirection(-1, f)) { this.upCalls.delete(f); }
            } else {
                this.upCalls.delete(f);
                this.downCalls.delete(f);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = f;
        }

        tick(dt) {
            if (dt <= 0) { return; }
            // Cap a single logical step so huge dt (high time-scale frames) still
            // sequence door phases; loop consumes the full dt in slices.
            let remaining = dt;
            let guard = 0;
            while (remaining > 0 && guard < 400) {
                const step = Math.min(remaining, 0.25);
                this._tickStep(step);
                remaining -= step;
                guard++;
            }
        }

        _tickStep(dt) {
            switch (this.state) {
                case "IDLE": {
                    const target = this._pickNextTarget();
                    if (target === null) { this.direction = 0; break; }
                    if (target === this.currentFloor) {
                        this.direction = 0;
                        this.state = "DOOR_OPENING";
                        this.doorOpenTimer = 0;
                    } else {
                        this.targetFloor = target;
                        this.direction = (target > this.currentFloor) ? 1 : -1;
                        this.state = "MOVING";
                        this.servedThisDoorCycle = false;
                    }
                    break;
                }
                case "MOVING": {
                    // Re-evaluate: closer stop in same direction shortens the target.
                    if (this.direction > 0) {
                        const exactPos = this.y / this.floorHeight;
                        for (let f = Math.ceil(exactPos + 0.02); f < this.targetFloor; f++) {
                            if (this.destinations.has(f) || this.upCalls.has(f)) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    } else if (this.direction < 0) {
                        const exactPos = this.y / this.floorHeight;
                        for (let f = Math.floor(exactPos - 0.02); f > this.targetFloor; f--) {
                            if (this.destinations.has(f) || this.downCalls.has(f)) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    }
                    const targetY = this.targetFloor * this.floorHeight;
                    const dy = targetY - this.y;
                    const move = this.CAR_SPEED * dt;
                    if (Math.abs(dy) <= move) {
                        this.y = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = "DOOR_OPENING";
                        this.doorOpenTimer = 0;
                        this._arriveAtFloor();
                    } else {
                        this.y += Math.sign(dy) * move;
                        this.currentFloor = Math.round(this.y / this.floorHeight);
                    }
                    break;
                }
                case "DOOR_OPENING": {
                    this.doorProgress += dt / this.DOOR_MOVE_S;
                    if (this.doorProgress >= 1) {
                        this.doorProgress = 1;
                        this.state = "DOOR_OPEN";
                        this.doorOpenTimer = 0;
                        this._arriveAtFloor();
                    }
                    break;
                }
                case "DOOR_OPEN": {
                    this.doorOpenTimer += dt;
                    const busy = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    const minElapsed = this.doorOpenTimer >= this.MIN_DOOR_OPEN_S;
                    const capExceeded = this.doorOpenTimer >= this.MAX_DOOR_OPEN_S;
                    if ((minElapsed && !busy) || capExceeded) {
                        if (capExceeded && busy) {
                            // Safety cap: abandon whoever never completed.
                            this.pendingBoarders.forEach((person) => { this.releaseSpot(person); });
                            this.pendingBoarders.clear();
                            this.pendingDisembark.forEach((person) => { this.releaseSpot(person); });
                            this.pendingDisembark.clear();
                        }
                        this.state = "DOOR_CLOSING";
                    }
                    break;
                }
                case "DOOR_CLOSING": {
                    this.doorProgress -= dt / this.DOOR_MOVE_S;
                    if (this.doorProgress <= 0) {
                        this.doorProgress = 0;
                        const target = this._pickNextTarget();
                        if (target === null) {
                            this.state = "IDLE";
                            this.direction = 0;
                            this.targetFloor = null;
                        } else if (target === this.currentFloor) {
                            // Guard: don't reopen at the just-served floor while
                            // riders have destinations elsewhere.
                            if (this.servedThisDoorCycle && this.lastServedFloor === this.currentFloor &&
                                (this.destinations.size > 0)) {
                                this.state = "IDLE";
                                this.direction = 0;
                                this.targetFloor = null;
                            } else {
                                this.state = "DOOR_OPENING";
                                this.doorOpenTimer = 0;
                            }
                        } else {
                            this.targetFloor = target;
                            this.direction = (target > this.currentFloor) ? 1 : -1;
                            this.state = "MOVING";
                            this.servedThisDoorCycle = false;
                        }
                    }
                    break;
                }
                default:
                    this.state = "IDLE";
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
