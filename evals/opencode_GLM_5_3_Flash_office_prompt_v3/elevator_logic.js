// elevator_logic.js - pure elevator scheduler / state machine (no Three.js, no DOM).
// Dual environment: exposes window.ElevatorLogic in the browser, module.exports under Node.
(function (root) {
    'use strict';

    const STATE_IDLE = 'IDLE';
    const STATE_MOVING = 'MOVING';
    const STATE_OPENING = 'DOOR_OPENING';
    const STATE_OPEN = 'DOOR_OPEN';
    const STATE_CLOSING = 'DOOR_CLOSING';

    // four logical interior standing spots (car-local coordinates)
    const SPOT_X = [-0.68, 0.68, -0.68, 0.68];
    const SPOT_Z = [-0.55, -0.55, 0.55, 0.55];
    const SPOT_Y = 0.1;

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;
            this.speedFloorsPerSec = opts.speedFloorsPerSec || 2.4;
            this.doorMoveS = 0.45;
            this.minDoorOpenS = opts.minDoorOpenS || 3.0;
            this.maxDoorOpenS = opts.maxDoorOpenS || 10.0;
            this.reset();
        }

        reset() {
            this.state = STATE_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [false, false, false, false];
            this.passengerSpots = new Map();
            this.doorT = 0;
            this.doorOpenTimer = 0;
            this.doorOpenAmount = 0;
            this.yPosition = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        _hasWorkAhead(dir, fromFloor) {
            for (let i = 0; i < this.floorCount; i++) {
                if ((i - fromFloor) * dir > 0) {
                    if (this.destinations.has(i)) return true;
                    if (dir > 0 && this.upCalls.has(i)) return true;
                    if (dir < 0 && this.downCalls.has(i)) return true;
                }
            }
            return false;
        }

        _hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        // true only when the car is at `floor` in DOOR_OPEN and either there are no
        // more stops pending in the current direction or the caller matches it.
        isAcceptingAt(floor, direction) {
            if (this.state !== STATE_OPEN || this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction !== 0 && this._hasWorkAhead(this.direction, floor)) {
                return direction === this.direction;
            }
            return true;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.pendingBoarders.has(person)) {
                const idx = this.passengerSpots.get(person);
                return { index: idx, x: SPOT_X[idx], y: SPOT_Y, z: SPOT_Z[idx] };
            }
            if (this.currentCapacityFree() <= 0) return null;
            let idx = -1;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (!this.spotOccupancy[i]) { idx = i; break; }
            }
            if (idx < 0) return null;
            this.spotOccupancy[idx] = true;
            this.passengerSpots.set(person, idx);
            this.pendingBoarders.add(person);
            return { index: idx, x: SPOT_X[idx], y: SPOT_Y, z: SPOT_Z[idx] };
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        // A wider "can someone act on the door right now" test than isAcceptingAt:
        // the door counts as usable while it is visibly open (opening/open/closing)
        // at this floor. This keeps boarding reliable when one agent frame spans a
        // large slice of motion time (very high time scales).
        isDoorUsableAt(floor, direction) {
            if (this.currentFloor !== floor) return false;
            if (this.doorOpenAmount < 0.35) return false;
            if (this.state === STATE_MOVING || this.state === STATE_IDLE) return false;
            if (this.direction !== 0 && this._hasWorkAhead(this.direction, floor)) {
                return direction === this.direction;
            }
            return true;
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this._releaseSpotOf(person);
        }

        _releaseSpotOf(person) {
            const idx = this.passengerSpots.get(person);
            if (idx !== undefined) {
                this.spotOccupancy[idx] = false;
                this.passengerSpots.delete(person);
            }
        }

        // Called when the car arrives at a floor: clear destinations here, clear the
        // hall call for the served direction, and if nothing remains ahead also clear
        // the opposite-direction call at this floor so it can be served before leaving.
        _onArrival() {
            this.state = STATE_OPENING;
            this.doorT = 0;
            this.doorOpenAmount = 0;
            this.doorOpenTimer = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) this.upCalls.delete(this.currentFloor);
            else if (this.direction < 0) this.downCalls.delete(this.currentFloor);
            if (this.direction !== 0 && !this._hasWorkAhead(this.direction, this.currentFloor)) {
                if (this.direction > 0) this.downCalls.delete(this.currentFloor);
                else this.upCalls.delete(this.currentFloor);
            } else if (this.direction === 0) {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
        }

        _commitTarget(floor) {
            this.targetFloor = floor;
            if (floor > this.currentFloor) this.direction = 1;
            else if (floor < this.currentFloor) this.direction = -1;
            this.servedThisDoorCycle = false;
        }

        // SCAN scheduling. Passenger destinations outrank same-floor hall calls, and a
        // floor that was just served cannot immediately reopen while riders remain.
        _pickNextTarget() {
            const f = this.currentFloor;

            if (this.destinations.size > 0) {
                let best = -1;
                if (this.direction > 0) {
                    for (let i = f + 1; i < this.floorCount; i++) {
                        if (this.destinations.has(i)) { best = i; break; }
                    }
                } else if (this.direction < 0) {
                    for (let i = f - 1; i >= 0; i--) {
                        if (this.destinations.has(i)) { best = i; break; }
                    }
                }
                if (best < 0) {
                    let bd = Infinity;
                    for (let i = 0; i < this.floorCount; i++) {
                        if (!this.destinations.has(i)) continue;
                        const d = Math.abs(i - f);
                        if (d > 0 && d < bd) { bd = d; best = i; }
                    }
                }
                if (best >= 0) { this._commitTarget(best); return true; }
            }

            let best = -1;
            let bestScore = Infinity;
            for (let i = 0; i < this.floorCount; i++) {
                const up = this.upCalls.has(i);
                const down = this.downCalls.has(i);
                if (!up && !down) continue;
                if (i === f) {
                    // passenger destinations outrank same-floor hall calls
                    if (this.destinations.size > 0) continue;
                    // no full-car lobby starvation: a just-served floor with riders
                    // aboard (or still boarding) must not reopen for leftover calls
                    if (this.servedThisDoorCycle &&
                        (this.passengers.size > 0 || this.pendingBoarders.size > 0)) continue;
                }
                const callDir = (up && !down) ? 1 : (!up && down ? -1 : (this.direction || 1));
                let score;
                if (this.direction !== 0 && (i - f) * this.direction > 0) {
                    score = callDir === this.direction ? Math.abs(i - f) : 50 + Math.abs(i - f);
                } else if (i !== f) {
                    score = 100 + Math.abs(i - f);
                } else {
                    continue;
                }
                if (score < bestScore) {
                    bestScore = score;
                    best = i;
                }
            }
            if (best >= 0) {
                this._commitTarget(best);
                return true;
            }
            this.targetFloor = f;
            this.direction = 0;
            return false;
        }

        // While MOVING, keep watching for a closer stop in the same direction.
        _reevaluateTarget() {
            if (this.state !== STATE_MOVING || this.direction === 0) return;
            if (this.direction > 0) {
                for (let i = this.currentFloor + 1; i < this.targetFloor; i++) {
                    if (this.destinations.has(i) || this.upCalls.has(i)) {
                        this.targetFloor = i;
                        break;
                    }
                }
            } else if (this.direction < 0) {
                for (let i = this.currentFloor - 1; i > this.targetFloor; i--) {
                    if (this.destinations.has(i) || this.downCalls.has(i)) {
                        this.targetFloor = i;
                        break;
                    }
                }
            }
        }

        // Force-drop transfers that never completed before the doors closed, so
        // reserved spots and pending sets can never leak (self-healing handshake).
        _dropAbandonedTransfers() {
            if (this.pendingBoarders.size > 0) {
                const boarders = Array.from(this.pendingBoarders);
                for (let i = 0; i < boarders.length; i++) this._releaseSpotOf(boarders[i]);
                this.pendingBoarders.clear();
            }
            if (this.pendingDisembark.size > 0) {
                const leavers = Array.from(this.pendingDisembark);
                for (let i = 0; i < leavers.length; i++) {
                    this._releaseSpotOf(leavers[i]);
                    this.passengers.delete(leavers[i]);
                }
                this.pendingDisembark.clear();
            }
        }

        tick(dt) {
            if (dt <= 0) return;
            switch (this.state) {
                case STATE_IDLE:
                    if (this._hasAnyWork()) {
                        const here = this.upCalls.has(this.currentFloor) ||
                            this.downCalls.has(this.currentFloor) ||
                            this.destinations.has(this.currentFloor);
                        if (here) {
                            this.direction = 0;
                            this._onArrival();
                        } else if (this._pickNextTarget()) {
                            this.state = STATE_MOVING;
                        }
                    }
                    break;
                case STATE_MOVING: {
                    const targetY = this.targetFloor * this.floorHeight;
                    const step = this.speedFloorsPerSec * this.floorHeight * dt;
                    if (this.yPosition < targetY) {
                        this.yPosition = Math.min(targetY, this.yPosition + step);
                    } else if (this.yPosition > targetY) {
                        this.yPosition = Math.max(targetY, this.yPosition - step);
                    }
                    this._reevaluateTarget();
                    if (Math.abs(this.yPosition - this.targetFloor * this.floorHeight) < 0.000001) {
                        this.currentFloor = this.targetFloor;
                        this.yPosition = this.currentFloor * this.floorHeight;
                        this._onArrival();
                    }
                    break;
                }
                case STATE_OPENING:
                    this.doorT += dt / this.doorMoveS;
                    if (this.doorT >= 1) {
                        this.doorT = 1;
                        this.doorOpenAmount = 1;
                        this.doorOpenTimer = 0;
                        this.state = STATE_OPEN;
                    } else {
                        this.doorOpenAmount = this.doorT;
                    }
                    break;
                case STATE_OPEN: {
                    this.doorOpenTimer += dt;
                    this.doorOpenAmount = 1;
                    const busy = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    if ((!busy && this.doorOpenTimer >= this.minDoorOpenS) ||
                        this.doorOpenTimer >= this.maxDoorOpenS) {
                        this.state = STATE_CLOSING;
                        this.doorT = 1;
                    }
                    break;
                }
                case STATE_CLOSING:
                    this.doorT -= dt / this.doorMoveS;
                    this.doorOpenAmount = Math.max(0, this.doorT);
                    if (this.doorT <= 0) {
                        this.doorT = 0;
                        this.doorOpenAmount = 0;
                        this._dropAbandonedTransfers();
                        if (this._pickNextTarget()) {
                            this.state = STATE_MOVING;
                        } else {
                            this.state = STATE_IDLE;
                            this.direction = 0;
                            this.targetFloor = this.currentFloor;
                        }
                    }
                    break;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
