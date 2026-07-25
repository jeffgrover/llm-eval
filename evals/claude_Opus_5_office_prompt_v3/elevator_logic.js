// elevator_logic.js - pure elevator scheduler / state machine.
// No Three.js, no DOM, no canvas: runs identically in the browser and Node.
// Browser: window.ElevatorLogic.  Node: require("./elevator_logic.js").

(function (root) {
    "use strict";

    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_DOOR_OPENING = "DOOR_OPENING";
    const STATE_DOOR_OPEN = "DOOR_OPEN";
    const STATE_DOOR_CLOSING = "DOOR_CLOSING";

    // Logical interior standing spots (car-local metres, car floor at y=0).
    const INTERIOR_SPOTS = [
        { x: -0.62, y: 0, z: -0.58 },
        { x: 0.62, y: 0, z: -0.58 },
        { x: -0.62, y: 0, z: 0.48 },
        { x: 0.62, y: 0, z: 0.48 }
    ];

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;
            this.speed = opts.speed !== undefined ? opts.speed : 1.15; // floors / second

            this.DOOR_TIME_S = opts.doorTime !== undefined ? opts.doorTime : 0.9;
            this.MIN_DOOR_OPEN_S = opts.minDoorOpen !== undefined ? opts.minDoorOpen : 2.6;
            this.MAX_DOOR_OPEN_S = opts.maxDoorOpen !== undefined ? opts.maxDoorOpen : 9.0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = [null, null, null, null];

            this.state = STATE_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.exactFloor = 0;
            this.targetFloor = 0;
            this.doorPosition = 0; // 0 = closed, 1 = fully open
            this.doorTimer = 0;
            this.lastServedFloor = -1;
            this.servedThisDoorCycle = false;
            this.forceClose = false;
            this.strandedBoarders = new Set();
        }

        // ---------------------------------------------------------------
        // public API used by the visual adapter
        // ---------------------------------------------------------------
        callUp(floor) {
            if (!this._validFloor(floor)) return;
            if (floor >= this.floorCount - 1) return;
            this.upCalls.add(floor);
        }

        callDown(floor) {
            if (!this._validFloor(floor)) return;
            if (floor <= 0) return;
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (!this._validFloor(floor)) return;
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE_DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (!this.hasWorkInDirection(this.direction)) return true;
            if (this.direction === 0) return true;
            return direction === this.direction;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    return {
                        index: i,
                        x: INTERIOR_SPOTS[i].x,
                        y: INTERIOR_SPOTS[i].y,
                        z: INTERIOR_SPOTS[i].z
                    };
                }
            }
            return null;
        }

        cancelBoarding(person) {
            this.pendingBoarders.delete(person);
            this._releaseSpot(person);
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return false;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
            return true;
        }

        registerDisembark(person) {
            if (!this.passengers.has(person)) return false;
            this.pendingDisembark.add(person);
            return true;
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this._releaseSpot(person);
            return true;
        }

        hasWorkInDirection(dir) {
            if (!dir) return false;
            const floors = this._allWorkFloors();
            for (let i = 0; i < floors.length; i += 1) {
                if ((floors[i] - this.currentFloor) * dir > 0) return true;
            }
            return false;
        }

        reset() {
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.strandedBoarders.clear();
            for (let i = 0; i < this.spotOccupancy.length; i += 1) this.spotOccupancy[i] = null;
            this.state = STATE_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.exactFloor = 0;
            this.targetFloor = 0;
            this.doorPosition = 0;
            this.doorTimer = 0;
            this.lastServedFloor = -1;
            this.servedThisDoorCycle = false;
            this.forceClose = false;
        }

        // ---------------------------------------------------------------
        // per-frame advance
        // ---------------------------------------------------------------
        tick(dt) {
            const step = dt > 0 ? dt : 0;

            if (this.state === STATE_IDLE) {
                this._tickIdle();
                return;
            }
            if (this.state === STATE_MOVING) {
                this._tickMoving(step);
                return;
            }
            if (this.state === STATE_DOOR_OPENING) {
                this.doorPosition += step / this.DOOR_TIME_S;
                if (this.doorPosition >= 1) {
                    this.doorPosition = 1;
                    this.state = STATE_DOOR_OPEN;
                    this.doorTimer = 0;
                }
                return;
            }
            if (this.state === STATE_DOOR_OPEN) {
                this.doorTimer += step;
                const holding = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                const minElapsed = this.doorTimer >= this.MIN_DOOR_OPEN_S;
                const capped = this.doorTimer >= this.MAX_DOOR_OPEN_S;
                if (capped) {
                    this.forceClose = true;
                    this.state = STATE_DOOR_CLOSING;
                } else if (minElapsed && !holding) {
                    this.state = STATE_DOOR_CLOSING;
                }
                return;
            }
            if (this.state === STATE_DOOR_CLOSING) {
                // A late arrival at the doors re-opens them (real elevator courtesy)
                // unless the safety cap already forced this cycle to end.
                if (!this.forceClose && (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0)) {
                    this.state = STATE_DOOR_OPENING;
                    return;
                }
                this.doorPosition -= step / this.DOOR_TIME_S;
                if (this.doorPosition <= 0) {
                    this.doorPosition = 0;
                    this._afterDoorsClosed();
                }
            }
        }

        // ---------------------------------------------------------------
        // internals
        // ---------------------------------------------------------------
        _validFloor(floor) {
            return typeof floor === "number" && floor >= 0 && floor < this.floorCount && Math.floor(floor) === floor;
        }

        _releaseSpot(person) {
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        _allWorkFloors() {
            const out = [];
            this.destinations.forEach((floor) => out.push(floor));
            this.upCalls.forEach((floor) => out.push(floor));
            this.downCalls.forEach((floor) => out.push(floor));
            return out;
        }

        _hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        // Passenger destinations outrank hall calls whenever anyone is aboard.
        _destinationsOnly() {
            return this.passengers.size > 0 && this.destinations.size > 0;
        }

        _candidateFloors(dir, matchingCallsOnly) {
            const out = [];
            this.destinations.forEach((floor) => out.push(floor));
            if (this._destinationsOnly()) return out;
            const primary = dir > 0 ? this.upCalls : this.downCalls;
            const secondary = dir > 0 ? this.downCalls : this.upCalls;
            primary.forEach((floor) => out.push(floor));
            if (!matchingCallsOnly) secondary.forEach((floor) => out.push(floor));
            return out;
        }

        // nearest stop strictly ahead of currentFloor in direction dir
        _nearestStopAhead(dir) {
            let best = null;
            const matching = this._candidateFloors(dir, true);
            for (let i = 0; i < matching.length; i += 1) {
                const floor = matching[i];
                const delta = (floor - this.currentFloor) * dir;
                if (delta <= 0) continue;
                if (best === null || delta < (best - this.currentFloor) * dir) best = floor;
            }
            if (best !== null) return best;
            // Nothing matching our travel direction ahead: an opposite-direction
            // hall call further along still deserves a trip (classic SCAN).
            const any = this._candidateFloors(dir, false);
            for (let i = 0; i < any.length; i += 1) {
                const floor = any[i];
                const delta = (floor - this.currentFloor) * dir;
                if (delta <= 0) continue;
                if (best === null || delta < (best - this.currentFloor) * dir) best = floor;
            }
            return best;
        }

        _anyWorkAwayFromHere() {
            const floors = this._allWorkFloors();
            for (let i = 0; i < floors.length; i += 1) {
                if (floors[i] !== this.currentFloor) return true;
            }
            return false;
        }

        // Re-opening at the floor we just served is only allowed when there is
        // genuinely nothing else to do; this is what stops leftover lobby
        // callers from pinning a loaded car on floor 0 during the morning rush.
        _mayReopenHere() {
            if (this._destinationsOnly()) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this._anyWorkAwayFromHere()) return false;
            const here = this.currentFloor;
            return this.upCalls.has(here) || this.downCalls.has(here) || this.destinations.has(here);
        }

        _pickNextTarget() {
            if (this.direction !== 0) {
                const ahead = this._nearestStopAhead(this.direction);
                if (ahead !== null) {
                    this.targetFloor = ahead;
                    return true;
                }
                const behind = this._nearestStopAhead(-this.direction);
                if (behind !== null) {
                    this.direction = -this.direction;
                    this.targetFloor = behind;
                    return true;
                }
            } else {
                const up = this._nearestStopAhead(1);
                const down = this._nearestStopAhead(-1);
                let chosen = null;
                if (up !== null && down !== null) {
                    chosen = Math.abs(up - this.currentFloor) <= Math.abs(down - this.currentFloor) ? up : down;
                } else if (up !== null) {
                    chosen = up;
                } else if (down !== null) {
                    chosen = down;
                }
                if (chosen !== null) {
                    this.direction = chosen > this.currentFloor ? 1 : -1;
                    this.targetFloor = chosen;
                    return true;
                }
            }
            if (this._mayReopenHere()) {
                this.targetFloor = this.currentFloor;
                return true;
            }
            this.direction = 0;
            this.targetFloor = this.currentFloor;
            return false;
        }

        _tickIdle() {
            if (!this._hasAnyWork()) return;
            if (!this._pickNextTarget()) return;
            if (this.targetFloor === this.currentFloor) {
                this._beginDoorOpen();
            } else {
                this.servedThisDoorCycle = false;
                this.state = STATE_MOVING;
            }
        }

        _tickMoving(step) {
            this._reevaluateTarget();
            let dir = 0;
            if (this.targetFloor > this.exactFloor) dir = 1;
            else if (this.targetFloor < this.exactFloor) dir = -1;
            if (dir === 0) {
                this.exactFloor = this.targetFloor;
                this.currentFloor = this.targetFloor;
                this._beginDoorOpen();
                return;
            }
            this.direction = dir;
            this.exactFloor += dir * this.speed * step;
            if ((dir > 0 && this.exactFloor >= this.targetFloor) || (dir < 0 && this.exactFloor <= this.targetFloor)) {
                this.exactFloor = this.targetFloor;
                this.currentFloor = this.targetFloor;
                this._beginDoorOpen();
                return;
            }
            this.currentFloor = Math.round(this.exactFloor);
        }

        // While travelling, take a closer stop in the same direction if one
        // appears (and we can still brake for it).
        _reevaluateTarget() {
            const dir = this.direction;
            if (!dir) return;
            const candidates = this._candidateFloors(dir, true);
            let best = null;
            for (let i = 0; i < candidates.length; i += 1) {
                const floor = candidates[i];
                const delta = (floor - this.exactFloor) * dir;
                if (delta < 0.15) continue;
                if (best === null || delta < (best - this.exactFloor) * dir) best = floor;
            }
            if (best === null) return;
            if ((best - this.exactFloor) * dir < (this.targetFloor - this.exactFloor) * dir) {
                this.targetFloor = best;
            }
        }

        _beginDoorOpen() {
            const here = this.currentFloor;
            if (this.direction === 0) {
                if (this.upCalls.has(here)) this.direction = 1;
                else if (this.downCalls.has(here)) this.direction = -1;
                else if (here === 0) this.direction = 1;
                else if (here === this.floorCount - 1) this.direction = -1;
            }
            this.destinations.delete(here);
            if (this.direction > 0) this.upCalls.delete(here);
            else if (this.direction < 0) this.downCalls.delete(here);
            // Nothing further this way? Then also take the opposite-direction
            // call here before we leave.
            if (!this.hasWorkInDirection(this.direction)) {
                this.upCalls.delete(here);
                this.downCalls.delete(here);
            }
            this.lastServedFloor = here;
            this.servedThisDoorCycle = true;
            this.doorTimer = 0;
            this.forceClose = false;
            this.state = STATE_DOOR_OPENING;
        }

        // Anyone who never finished boarding when the doors finally shut is
        // released (spot freed) and flagged so the caller can recover them.
        _evictPendingBoarders() {
            if (this.pendingBoarders.size === 0) return;
            const stranded = [];
            this.pendingBoarders.forEach((person) => stranded.push(person));
            for (let i = 0; i < stranded.length; i += 1) {
                this.pendingBoarders.delete(stranded[i]);
                this._releaseSpot(stranded[i]);
                this.strandedBoarders.add(stranded[i]);
            }
        }

        _afterDoorsClosed() {
            this.forceClose = false;
            this._evictPendingBoarders();
            const moved = this._pickNextTarget();
            if (!moved) {
                this.state = STATE_IDLE;
                return;
            }
            if (this.targetFloor === this.currentFloor) {
                this._beginDoorOpen();
                return;
            }
            this.servedThisDoorCycle = false;
            this.state = STATE_MOVING;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    root.ELEVATOR_INTERIOR_SPOTS = INTERIOR_SPOTS;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic, INTERIOR_SPOTS: INTERIOR_SPOTS };
    }
})(typeof window !== "undefined" ? window : globalThis);
