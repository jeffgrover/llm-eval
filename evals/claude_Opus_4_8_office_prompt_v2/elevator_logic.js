// elevator_logic.js — pure scheduler / state machine for the elevator.
// NO Three.js, DOM, canvas, or browser-only deps: must run under Node for tests.
// elevator.js is only the visual adapter around this class.
(function (root) {
    "use strict";

    // Logical interior spots (car-local coords). Four lanes so boarders don't pile up.
    const SPOT_POS = [
        { x: -0.7, z: -0.55 },
        { x: 0.7, z: -0.55 },
        { x: -0.7, z: 0.6 },
        { x: 0.7, z: 0.6 },
    ];

    const STATES = ["IDLE", "MOVING", "DOOR_OPENING", "DOOR_OPEN", "DOOR_CLOSING"];

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount != null ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity != null ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight != null ? opts.floorHeight : 3.4;

            // Tunables (seconds). Door phases scale with the lockstep clock via dt.
            this.speed = 1.3;            // floor-units per second
            this.DOOR_MOVE_S = 0.7;      // open/close animation time
            this.MIN_DOOR_OPEN_S = 2.2;  // minimum dwell with doors open
            this.MAX_DOOR_OPEN_S = 8.0;  // safety cap so a stuck boarder can't hold forever

            this.reset();
        }

        reset() {
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spots = [null, null, null, null];     // person ref per logical spot
            this.spotByPerson = new Map();

            this.state = "IDLE";
            this.direction = 0;          // +1 up, 0 idle, -1 down
            this.position = 0;           // float, in floor-index units
            this.currentFloor = 0;       // integer floor when stopped
            this.targetFloor = 0;

            this.doorTimer = 0;          // time in current opening/closing phase
            this.openTimer = 0;          // time doors have been fully open
            this.doorPos = 0;            // 0 closed .. 1 open (read by adapter)
            this.lastServedFloor = -1;
        }

        // ---- Call / destination registration -------------------------------
        callUp(floor) { if (this._valid(floor)) this.upCalls.add(floor); }
        callDown(floor) { if (this._valid(floor)) this.downCalls.add(floor); }
        pressDestination(floor) { if (this._valid(floor)) this.destinations.add(floor); }

        _valid(f) { return Number.isInteger(f) && f >= 0 && f < this.floorCount; }

        // ---- Capacity & boarding -------------------------------------------
        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let idx = -1;
            for (let i = 0; i < this.spots.length; i++) {
                if (this.spots[i] === null) { idx = i; break; }
            }
            if (idx === -1) return null;
            this.spots[idx] = person;
            this.spotByPerson.set(person, idx);
            this.pendingBoarders.add(person);
            const p = SPOT_POS[idx];
            return { index: idx, x: p.x, y: 0, z: p.z };
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
            const idx = this.spotByPerson.get(person);
            if (idx !== undefined) {
                this.spots[idx] = null;
                this.spotByPerson.delete(person);
            }
        }

        // ---- Acceptance ----------------------------------------------------
        // True only when the car is DOOR_OPEN at `floor` AND either there are no
        // more stops pending in the current direction OR the caller's direction
        // matches the car's.
        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN") return false;
            if (this.currentFloor !== floor) return false;
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            return this._sameDirStops(this.currentFloor, this.direction).length === 0;
        }

        // ---- SCAN helpers --------------------------------------------------
        _destAhead(from, dir) {
            const out = [];
            this.destinations.forEach(function (f) {
                if (dir > 0 ? f > from + 1e-6 : f < from - 1e-6) out.push(f);
            });
            return out;
        }
        _sameDirCallsAhead(from, dir) {
            const out = [];
            const set = dir > 0 ? this.upCalls : this.downCalls;
            set.forEach(function (f) {
                if (dir > 0 ? f > from + 1e-6 : f < from - 1e-6) out.push(f);
            });
            return out;
        }
        _oppDirCallsAhead(from, dir) {
            const out = [];
            const set = dir > 0 ? this.downCalls : this.upCalls;
            set.forEach(function (f) {
                if (dir > 0 ? f > from + 1e-6 : f < from - 1e-6) out.push(f);
            });
            return out;
        }
        // Stops we make while travelling in `dir`: passenger destinations plus
        // same-direction hall calls strictly ahead of `from`.
        _sameDirStops(from, dir) {
            const a = this._destAhead(from, dir).concat(this._sameDirCallsAhead(from, dir));
            return Array.from(new Set(a));
        }
        _allStopFloors() {
            const s = new Set();
            this.upCalls.forEach(function (f) { s.add(f); });
            this.downCalls.forEach(function (f) { s.add(f); });
            this.destinations.forEach(function (f) { s.add(f); });
            return Array.from(s);
        }
        _nearestInDir(list, from, dir) {
            let best = null;
            for (const f of list) {
                if (best === null || Math.abs(f - from) < Math.abs(best - from)) best = f;
            }
            return best;
        }
        _farthestInDir(list, from, dir) {
            let best = null;
            for (const f of list) {
                if (best === null || Math.abs(f - from) > Math.abs(best - from)) best = f;
            }
            return best;
        }

        // Choose the next targetFloor + direction from a stopped floor.
        // Implements SCAN: keep going in the current direction while work remains
        // ahead; otherwise reverse; otherwise idle.
        _selectTarget(from) {
            const stops = this._allStopFloors();
            if (stops.length === 0) { this.direction = 0; this.targetFloor = from; return; }

            if (this.direction === 0) {
                const others = stops.filter(function (f) { return f !== from; });
                if (others.length === 0) { this.targetFloor = from; this.direction = 0; return; }
                let nearest = others[0];
                for (const f of others) {
                    if (Math.abs(f - from) < Math.abs(nearest - from)) nearest = f;
                }
                this.direction = nearest > from ? 1 : -1;
            }

            // Same-direction work ahead → nearest such stop.
            let s = this._sameDirStops(from, this.direction);
            if (s.length) { this.targetFloor = this._nearestInDir(s, from, this.direction); return; }

            // Only opposite-direction calls ahead → run to the extremity, then reverse there.
            let opp = this._oppDirCallsAhead(from, this.direction);
            if (opp.length) { this.targetFloor = this._farthestInDir(opp, from, this.direction); return; }

            // Nothing ahead — reverse and look behind.
            this.direction = -this.direction;
            s = this._sameDirStops(from, this.direction);
            if (s.length) { this.targetFloor = this._nearestInDir(s, from, this.direction); return; }
            opp = this._oppDirCallsAhead(from, this.direction);
            if (opp.length) { this.targetFloor = this._farthestInDir(opp, from, this.direction); return; }

            this.direction = 0;
            this.targetFloor = from;
        }

        // While MOVING, shorten the target if a closer same-direction stop appeared.
        _reconsiderTarget() {
            if (this.direction === 0) return;
            const s = this._sameDirStops(this.position, this.direction);
            let best = this.targetFloor;
            for (const f of s) {
                if (this.direction > 0) {
                    if (f > this.position + 1e-6 && f < best) best = f;
                } else {
                    if (f < this.position - 1e-6 && f > best) best = f;
                }
            }
            this.targetFloor = best;
        }

        // On arrival, clear the served destination and hall call(s) for this floor.
        _onArrive() {
            const cf = this.currentFloor;
            this.destinations.delete(cf);
            if (this.direction > 0) this.upCalls.delete(cf);
            else if (this.direction < 0) this.downCalls.delete(cf);
            else { this.upCalls.delete(cf); this.downCalls.delete(cf); }

            // If there is no more same-direction work ahead we are about to reverse,
            // so also clear the opposite-direction call here and let it board now.
            if (this.direction !== 0 && this._sameDirStops(cf, this.direction).length === 0) {
                if (this.direction > 0) this.downCalls.delete(cf);
                else this.upCalls.delete(cf);
            }
        }

        // ---- Main tick -----------------------------------------------------
        tick(dt) {
            switch (this.state) {
                case "IDLE": this._tickIdle(); break;
                case "MOVING": this._tickMoving(dt); break;
                case "DOOR_OPENING": this._tickOpening(dt); break;
                case "DOOR_OPEN": this._tickOpen(dt); break;
                case "DOOR_CLOSING": this._tickClosing(dt); break;
            }
        }

        _tickIdle() {
            this._selectTarget(this.currentFloor);
            if (this.direction !== 0 && this.targetFloor !== this.currentFloor) {
                this.state = "MOVING";
            } else {
                // A stop exists at our own floor → open up for it.
                const here = this.upCalls.has(this.currentFloor) ||
                    this.downCalls.has(this.currentFloor) ||
                    this.destinations.has(this.currentFloor);
                if (here) { this.state = "DOOR_OPENING"; this.doorTimer = 0; }
            }
        }

        _tickMoving(dt) {
            this._reconsiderTarget();
            const step = this.speed * dt;
            const dist = this.targetFloor - this.position;
            if (Math.abs(dist) <= step || step <= 0 && dist === 0) {
                this.position = this.targetFloor;
                this.currentFloor = Math.round(this.position);
                this._onArrive();
                this.state = "DOOR_OPENING";
                this.doorTimer = 0;
            } else {
                this.position += Math.sign(dist) * step;
            }
        }

        _tickOpening(dt) {
            this.doorTimer += dt;
            this.doorPos = Math.min(1, this.doorTimer / this.DOOR_MOVE_S);
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorPos = 1;
                this.state = "DOOR_OPEN";
                this.openTimer = 0;
            }
        }

        _tickOpen(dt) {
            this.openTimer += dt;
            const minElapsed = this.openTimer >= this.MIN_DOOR_OPEN_S;
            const noPending = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            const forceClose = this.openTimer >= this.MAX_DOOR_OPEN_S;
            if ((minElapsed && noPending) || forceClose) {
                this.lastServedFloor = this.currentFloor;
                this.state = "DOOR_CLOSING";
                this.doorTimer = 0;
                // Decide the next target now so direction is known while closing.
                this._selectTarget(this.currentFloor);
            }
        }

        _tickClosing(dt) {
            // Safety reopen: a disembarker still needs out, or a fresh boarder with a
            // genuinely reserved spot showed up (capacity-gated, so bounded — no
            // full-car lobby starvation possible).
            if (this.pendingDisembark.size > 0 || this.pendingBoarders.size > 0) {
                this.state = "DOOR_OPENING";
                this.doorTimer = (1 - this.doorPos) * this.DOOR_MOVE_S;
                return;
            }
            this.doorTimer += dt;
            this.doorPos = Math.max(0, 1 - this.doorTimer / this.DOOR_MOVE_S);
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorPos = 0;
                if (this.direction !== 0 && this.targetFloor !== this.currentFloor) {
                    this.state = "MOVING";
                } else {
                    this.state = "IDLE";
                }
            }
        }
    }

    ElevatorLogic.STATES = STATES;
    ElevatorLogic.SPOT_POS = SPOT_POS;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
