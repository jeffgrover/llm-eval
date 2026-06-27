(function (root) {
    const STATE = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    const MIN_DOOR_OPEN_S = 2.2;
    const MAX_DOOR_OPEN_S = 12.0;
    const DOOR_ANIM_S = 0.9;
    const CAR_SPEED = 3.0; // meters/sec

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount != null ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity != null ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight != null ? opts.floorHeight : 3.4;
            this.reset();
        }

        reset() {
            this.state = STATE.IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.y = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            // 4 logical interior spots.
            this.spotOccupancy = [null, null, null, null];

            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
        }

        // ---- request API ----
        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) this.upCalls.add(floor);
        }
        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) this.downCalls.add(floor);
        }
        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        // ---- capacity / boarding ----
        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        _firstFreeSpot() {
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] == null) return i;
            }
            return -1;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            const idx = this._firstFreeSpot();
            if (idx < 0) return null;
            this.spotOccupancy[idx] = person;
            this.pendingBoarders.add(person);
            return this._spotInfo(idx);
        }

        _spotInfo(idx) {
            // Local interior offsets (2x2 grid) within the 3x3 car.
            const offs = [
                { x: -0.7, z: -0.55 },
                { x: 0.7, z: -0.55 },
                { x: -0.7, z: 0.45 },
                { x: 0.7, z: 0.45 }
            ];
            const o = offs[idx];
            return { index: idx, x: o.x, y: 0, z: o.z };
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
            }
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        // ---- acceptance ----
        isAcceptingAt(floor, direction) {
            if (this.state !== STATE.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            // Accept if no more stops in current direction, or matching dir, or idle dir.
            if (this.direction === 0) return true;
            if (this.direction === direction) return true;
            if (!this._hasWorkAhead(this.direction)) return true;
            return false;
        }

        // ---- scheduling helpers ----
        _allStops() {
            const s = new Set();
            this.destinations.forEach((f) => s.add(f));
            this.upCalls.forEach((f) => s.add(f));
            this.downCalls.forEach((f) => s.add(f));
            return s;
        }

        _hasWorkAhead(dir) {
            const stops = this._allStops();
            let found = false;
            stops.forEach((f) => {
                if (dir > 0 && f > this.currentFloor) found = true;
                if (dir < 0 && f < this.currentFloor) found = true;
            });
            return found;
        }

        _hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        // Pick next target floor; may set this.direction. Returns null if no work.
        pickNextTarget() {
            const stops = Array.from(this._allStops());
            const others = stops.filter((f) => f !== this.currentFloor);
            if (others.length === 0) {
                // Maybe a same-floor call still pending but we already served it.
                return null;
            }

            let dir = this.direction;
            if (dir === 0) {
                // Choose nearest stop and infer direction.
                let best = null, bestD = Infinity;
                for (const f of others) {
                    const d = Math.abs(f - this.currentFloor);
                    if (d < bestD) { bestD = d; best = f; }
                }
                this.direction = best > this.currentFloor ? 1 : -1;
                return best;
            }

            // Prefer continuing in current direction.
            const ahead = others.filter((f) => (dir > 0 ? f > this.currentFloor : f < this.currentFloor));
            if (ahead.length > 0) {
                return dir > 0 ? Math.min.apply(null, ahead) : Math.max.apply(null, ahead);
            }

            // Nothing ahead: reverse (single flip, non-recursive).
            const behind = others.filter((f) => (dir > 0 ? f < this.currentFloor : f > this.currentFloor));
            if (behind.length > 0) {
                this.direction = -dir;
                dir = this.direction;
                return dir > 0 ? Math.min.apply(null, behind) : Math.max.apply(null, behind);
            }

            return null;
        }

        // Should we stop (open doors) at currentFloor right now?
        _shouldStopHere() {
            const f = this.currentFloor;
            // Passenger wants off here -> always stop.
            if (this.destinations.has(f)) return true;
            // Full car: only stop for alighting (handled above), not new hall calls.
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction > 0 && this.upCalls.has(f)) return true;
            if (this.direction < 0 && this.downCalls.has(f)) return true;
            // Terminal of run: serve an opposite call here before leaving.
            if (!this._hasWorkAhead(this.direction)) {
                if (this.upCalls.has(f) || this.downCalls.has(f)) return true;
            }
            return false;
        }

        _serviceStop() {
            const f = this.currentFloor;
            // Clear destinations for this floor.
            this.destinations.delete(f);
            // Clear served hall call for current direction.
            if (this.direction > 0) this.upCalls.delete(f);
            else if (this.direction < 0) this.downCalls.delete(f);
            else { this.upCalls.delete(f); this.downCalls.delete(f); }
            // If no more stops in current direction, also clear opposite call here.
            if (!this._hasWorkAhead(this.direction)) {
                this.upCalls.delete(f);
                this.downCalls.delete(f);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = f;
        }

        _beginOpening() {
            this.state = STATE.DOOR_OPENING;
            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
        }

        tick(dt) {
            switch (this.state) {
                case STATE.IDLE: {
                    if (this._shouldStopHere()) {
                        this._beginOpening();
                        break;
                    }
                    const t = this.pickNextTarget();
                    if (t == null) {
                        this.direction = 0;
                        break;
                    }
                    this.targetFloor = t;
                    if (t === this.currentFloor) {
                        this._beginOpening();
                    } else {
                        this.direction = t > this.currentFloor ? 1 : -1;
                        this.state = STATE.MOVING;
                    }
                    break;
                }

                case STATE.MOVING: {
                    // Re-evaluate for a closer stop in same direction.
                    const ahead = Array.from(this._allStops()).filter((f) =>
                        this.direction > 0 ? f > this.currentFloor : f < this.currentFloor
                    );
                    if (ahead.length > 0) {
                        const closer = this.direction > 0 ? Math.min.apply(null, ahead) : Math.max.apply(null, ahead);
                        if (this.direction > 0 && closer < this.targetFloor) this.targetFloor = closer;
                        if (this.direction < 0 && closer > this.targetFloor) this.targetFloor = closer;
                    }

                    const targetY = this.targetFloor * this.floorHeight;
                    const step = CAR_SPEED * dt;
                    if (Math.abs(targetY - this.y) <= step) {
                        this.y = targetY;
                        this.currentFloor = this.targetFloor;
                        if (this._shouldStopHere()) {
                            this._beginOpening();
                        } else {
                            const t = this.pickNextTarget();
                            if (t == null) {
                                this.state = STATE.IDLE;
                                this.direction = 0;
                            } else {
                                this.targetFloor = t;
                                this.direction = t > this.currentFloor ? 1 : (t < this.currentFloor ? -1 : this.direction);
                            }
                        }
                    } else {
                        this.y += Math.sign(targetY - this.y) * step;
                        this.currentFloor = Math.round(this.y / this.floorHeight);
                    }
                    break;
                }

                case STATE.DOOR_OPENING: {
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_ANIM_S) {
                        this.state = STATE.DOOR_OPEN;
                        this.doorTimer = 0;
                        this._serviceStop();
                    }
                    break;
                }

                case STATE.DOOR_OPEN: {
                    this.doorTimer += dt;
                    const busy = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0;
                    } else if (this.doorTimer >= MIN_DOOR_OPEN_S && !busy) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case STATE.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_ANIM_S) {
                        this.doorTimer = 0;
                        // Pick next target. Passenger destinations outrank a same-floor
                        // hall call: pickNextTarget excludes currentFloor, so we won't
                        // reopen here while destinations elsewhere remain.
                        const t = this.pickNextTarget();
                        if (t == null) {
                            this.state = STATE.IDLE;
                            this.direction = 0;
                        } else {
                            this.targetFloor = t;
                            if (t === this.currentFloor) {
                                // Only happens if a fresh call is exactly here and nothing else.
                                this._beginOpening();
                            } else {
                                this.direction = t > this.currentFloor ? 1 : -1;
                                this.state = STATE.MOVING;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    ElevatorLogic.STATE = STATE;
    ElevatorLogic.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
    ElevatorLogic.DOOR_ANIM_S = DOOR_ANIM_S;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
