/*
 * elevator_logic.js
 * Pure elevator scheduler / state machine. No Three.js, no DOM, no browser
 * dependencies. Runs in the browser (window.ElevatorLogic) and under Node
 * (module.exports = { ElevatorLogic }).
 *
 * States: IDLE -> MOVING -> DOOR_OPENING -> DOOR_OPEN -> DOOR_CLOSING -> (IDLE|MOVING)
 * Scheduling: SCAN with anti-starvation guards.
 */
(function (root) {
    "use strict";

    var DOOR_OPEN_S = 1.4;   // minimum doors-open dwell
    var MAX_DOOR_OPEN_S = 9.0; // safety cap
    var DOOR_TRANSIT_S = 1.0;  // sliding time for open/close
    var CAR_SPEED = 2.6;      // floors per second

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;

            this.state = "IDLE";
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // +1 up, -1 down, 0 idle
            this.position = 0;  // continuous floor position (for visuals)

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = [false, false, false, false];
            this.spotIndexByPerson = new Map();

            this.doorTimer = 0;
            this.servedThisDoorCycle = null; // floor already served this open/close cycle
            this._lastTravelDir = 0;
        }

        // ---------- public API ----------

        callUp(floor) {
            floor = Math.max(0, Math.min(this.floorCount - 1, floor));
            this.upCalls.add(floor);
        }

        callDown(floor) {
            floor = Math.max(0, Math.min(this.floorCount - 1, floor));
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            floor = Math.max(0, Math.min(this.floorCount - 1, floor));
            this.destinations.add(floor);
        }

        hasCall(floor, direction) {
            return direction > 0 ? this.upCalls.has(floor) : this.downCalls.has(floor);
        }

        // Only accepted while doors are open at `floor` with a matching
        // (or idle) direction.
        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (direction === 0) return true;
            if (this.direction === 0) return true;
            if (this.direction === direction) return true;
            // Car has arrived and finished all work in its travel direction:
            // it will reverse to serve the opposite call, so accept early.
            return !this._stopInDirection(direction === 1 ? -1 : 1);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            if (this.pendingBoarders.has(person)) {
                return this._spotPos(this.spotIndexByPerson.get(person));
            }
            var idx = -1;
            for (var i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) { idx = i; break; }
            }
            if (idx < 0) return null;
            this.spotOccupancy[idx] = true;
            this.spotIndexByPerson.set(person, idx);
            this.pendingBoarders.add(person);
            return this._spotPos(idx);
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.passengers.delete(person);
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            var idx = this.spotIndexByPerson.get(person);
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            if (idx !== undefined && this.spotOccupancy[idx]) {
                this.spotOccupancy[idx] = false;
            }
            this.spotIndexByPerson.delete(person);
        }

        reset() {
            this.state = "IDLE";
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.position = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            for (var i = 0; i < 4; i++) this.spotOccupancy[i] = false;
            this.spotIndexByPerson.clear();
            this.doorTimer = 0;
            this.servedThisDoorCycle = null;
            this._lastTravelDir = 0;
        }

        // ---------- internals ----------

        _spotPos(idx) {
            // 2x2 logical interior spots (car interior ~2.4 x 2.4)
            var xs = [-0.6, 0.6];
            var zs = [-0.55, -1.55];
            return {
                index: idx,
                x: xs[idx % 2],
                y: 0,
                z: zs[Math.floor(idx / 2)]
            };
        }

        _stopInDirection(dir) {
            if (dir === 0) return null;
            var best = null;
            var scan = (set) => {
                for (var f of set) {
                    var rel = f - this.currentFloor;
                    if (rel === 0) continue;
                    if ((dir > 0 && rel > 0) || (dir < 0 && rel < 0)) {
                        if (best === null || Math.abs(rel) < Math.abs(best - this.currentFloor)) {
                            best = f;
                        }
                    }
                }
            };
            scan(this.destinations);
            if (dir > 0) scan(this.upCalls); else scan(this.downCalls);
            return best;
        }

        _hasOppCall(floor) {
            return this.upCalls.has(floor) && this.downCalls.has(floor);
        }

        // Nearest floor with ANY pending work (destinations or hall calls)
        // strictly in the given direction. Used when reversing at a SCAN end
        // so the car always heads toward pending work.
        _nearestWorkInDirection(dir) {
            var best = null;
            var scan = (set) => {
                for (var f of set) {
                    var rel = f - this.currentFloor;
                    if (rel === 0) continue;
                    if ((dir > 0 && rel > 0) || (dir < 0 && rel < 0)) {
                        if (best === null || Math.abs(rel) < Math.abs(best - this.currentFloor)) {
                            best = f;
                        }
                    }
                }
            };
            scan(this.destinations);
            scan(this.upCalls);
            scan(this.downCalls);
            return best;
        }

        _arrive() {
            this.currentFloor = this.targetFloor;
            this.position = this.currentFloor;
            this.state = "DOOR_OPENING";
            this.doorTimer = 0;
            // Clear passenger destinations for this floor and the hall call
            // served in the travel direction.
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) this.upCalls.delete(this.currentFloor);
            else if (this.direction < 0) this.downCalls.delete(this.currentFloor);
            // If nothing more in travel direction, clear the opposite call too
            // so it is served before we leave (unless both directions called,
            // in which case keep the other for a later cycle).
            if (!this._stopInDirection(this.direction) && !this._hasOppCall(this.currentFloor)) {
                if (this.direction > 0) this.downCalls.delete(this.currentFloor);
                else if (this.direction < 0) this.upCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle = this.currentFloor;
            this.direction = 0;
        }

        _pickNextTarget() {
            // Guards: never reopen the floor we just served while passengers
            // with destinations exist (kills DOOR_CLOSING -> DOOR_OPENING loops).
            var aheadUp = this._stopInDirection(1);
            var aheadDown = this._stopInDirection(-1);

            // Prefer continuing in the last travel direction.
            var lastDir = this._lastTravelDir;
            var target = null, dir = 0;
            if (lastDir > 0 && aheadUp !== null) { target = aheadUp; dir = 1; }
            else if (lastDir < 0 && aheadDown !== null) { target = aheadDown; dir = -1; }
            else if (lastDir === 0) {
                // idle: nearest active work
                var bestDist = Infinity;
                var consider = (f) => {
                    var d = Math.abs(f - this.currentFloor);
                    if (d > 0 && d < bestDist) { bestDist = d; target = f; dir = f > this.currentFloor ? 1 : -1; }
                };
                for (var f of this.destinations) consider(f);
                for (var f2 of this.upCalls) consider(f2);
                for (var f3 of this.downCalls) consider(f3);
            }

            // If no work ahead in last direction, reverse and head toward the
            // nearest pending work behind (any kind: destinations, up or down
            // hall calls). This is what lets the car turn around at a SCAN end
            // and come back to serve calls in the opposite direction.
            if (target === null) {
                if (lastDir >= 0) {
                    var rev = this._nearestWorkInDirection(-1);
                    if (rev !== null) { target = rev; dir = -1; }
                } else {
                    var rev = this._nearestWorkInDirection(1);
                    if (rev !== null) { target = rev; dir = 1; }
                }
            }

            // Never immediately re-serve the floor just closed (anti-starvation).
            if (target === this.currentFloor && this.servedThisDoorCycle === this.currentFloor) {
                target = null;
            }

            if (target === null) {
                this.state = "IDLE";
                this.direction = 0;
                this.targetFloor = this.currentFloor;
                return;
            }
            this._lastTravelDir = dir;
            this.direction = dir;
            this.targetFloor = target;
            this.state = "MOVING";
        }

        tick(dt) {
            if (!isFinite(dt) || dt < 0) return;
            switch (this.state) {
                case "IDLE": {
                    // A hall call at the floor we are parked at opens the doors.
                    // Exception: if we carry riders with destinations, same-floor
                    // calls wait for the next trip (no DOOR_CLOSING->DOOR_OPENING
                    // flapping at the same floor).
                    var selfCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
                    // Anti-flap: do not re-open for same-floor hall calls while
                    // riders are aboard heading elsewhere. Exception: a rider
                    // whose destination is this floor must be able to exit.
                    var ridersAboard = this.passengers.size > 0 && this.destinations.size > 0 &&
                        !this.destinations.has(this.currentFloor);
                    if (selfCall && !ridersAboard) {
                        this.state = "DOOR_OPENING";
                        this.doorTimer = 0;
                        this.upCalls.delete(this.currentFloor);
                        this.downCalls.delete(this.currentFloor);
                        this.servedThisDoorCycle = this.currentFloor;
                        this.direction = 0;
                        break;
                    }
                    // New work appeared while idle.
                    var hasWork = this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
                    if (hasWork) this._pickNextTarget();
                    break;
                }
                case "MOVING": {
                    var dist = this.targetFloor - this.position;
                    var step = CAR_SPEED * dt;
                    if (Math.abs(dist) <= step) {
                        this.position = this.targetFloor;
                        this._arrive();
                    } else {
                        this.position += Math.sign(dist) * step;
                        // Re-evaluate: a closer stop in the same direction?
                        var closer = this._stopInDirection(this.direction);
                        if (closer !== null) {
                            var oldRel = Math.abs(this.targetFloor - this.position);
                            var newRel = Math.abs(closer - this.position);
                            if (newRel < oldRel - 0.000000001) {
                                this.targetFloor = closer;
                            }
                        }
                    }
                    break;
                }
                case "DOOR_OPENING": {
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_TRANSIT_S) {
                        this.state = "DOOR_OPEN";
                        this.doorTimer = 0;
                    }
                    break;
                }
                case "DOOR_OPEN": {
                    this.doorTimer += dt;
                    var pending = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    var canClose = (!pending) && this.doorTimer >= DOOR_OPEN_S;
                    if (canClose || this.doorTimer >= MAX_DOOR_OPEN_S) {
                        this.state = "DOOR_CLOSING";
                        this.doorTimer = 0;
                    }
                    break;
                }
                case "DOOR_CLOSING": {
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_TRANSIT_S) {
                        this.state = "IDLE";
                        this._pickNextTarget();
                    }
                    break;
                }
            }
        }
    }

    ElevatorLogic.DOOR_OPEN_S = DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
    ElevatorLogic.DOOR_TRANSIT_S = DOOR_TRANSIT_S;
    ElevatorLogic.CAR_SPEED = CAR_SPEED;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
