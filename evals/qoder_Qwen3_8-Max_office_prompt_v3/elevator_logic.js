// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, no DOM. Runs in the browser (window.ElevatorLogic) and in Node
// (module.exports) for testing.
(function (root) {
    "use strict";

    var STATE = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    // Four logical interior spots in the 3x3 car (door faces +Z).
    var INTERIOR_SPOTS = [
        { x: -0.7, z: -0.6 },
        { x: 0.7, z: -0.6 },
        { x: -0.7, z: 0.45 },
        { x: 0.7, z: 0.45 }
    ];

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = options.floorCount !== undefined ? options.floorCount : 6;
            this.maxCapacity = options.maxCapacity !== undefined ? options.maxCapacity : 4;
            this.floorHeight = options.floorHeight !== undefined ? options.floorHeight : 3.4;
            // units (world meters) per simulated second
            this.moveSpeed = options.moveSpeed !== undefined ? options.moveSpeed : 1.5 * this.floorHeight;
            this.MIN_DOOR_OPEN_S = 1.0;
            this.MAX_DOOR_OPEN_S = 8.0;
            this.DOOR_MOVE_S = 0.9;
            this.reset();
        }

        reset() {
            this.state = STATE.IDLE;
            this.currentFloor = 0;
            this.carY = 0;
            this.direction = 0;
            this.targetFloor = null;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.doorOpenness = 0;
            this.doorTimer = 0;
            this.lastServedFloor = null;
            this.servedThisDoorCycle = false;
            this._callSeq = 0;
            this._upCallSeq = new Map();
            this._downCallSeq = new Map();
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.upCalls.add(floor);
                // Age is set on the FIRST press; re-presses do not refresh
                // it, or the top-up waiters would starve far floors forever.
                if (!this._upCallSeq.has(floor)) this._upCallSeq.set(floor, ++this._callSeq);
            }
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
                if (!this._downCallSeq.has(floor)) this._downCallSeq.set(floor, ++this._callSeq);
            }
        }

        _clearUpCall(floor) {
            this.upCalls.delete(floor);
            this._upCallSeq.delete(floor);
        }

        _clearDownCall(floor) {
            this.downCalls.delete(floor);
            this._downCallSeq.delete(floor);
        }

        // Floor (other than the current one) with the longest-waiting work.
        // In-car destinations always outrank hall calls.
        _oldestWorkFloor() {
            let best = null;
            let bestAge = Infinity;
            for (let f = 0; f < this.floorCount; f++) {
                if (f === this.currentFloor) continue;
                let age = Infinity;
                if (this.destinations.has(f)) age = 0;
                if (this._upCallSeq.has(f)) age = Math.min(age, this._upCallSeq.get(f));
                if (this._downCallSeq.has(f)) age = Math.min(age, this._downCallSeq.get(f));
                if (age < bestAge) {
                    bestAge = age;
                    best = f;
                }
            }
            return best;
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== STATE.DOOR_OPEN || this.currentFloor !== floor) return false;
            if (this.direction === 0 || this.direction === dir) return true;
            // Car will change direction here, so it can take the caller too.
            return !this._hasStopInDirection(this.direction);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            if (this.pendingBoarders.has(person)) {
                var existing = this.pendingBoarders.get(person);
                return { index: existing.index, x: existing.x, y: 0, z: existing.z };
            }
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    var spot = {
                        index: i,
                        x: INTERIOR_SPOTS[i].x,
                        y: 0,
                        z: INTERIOR_SPOTS[i].z
                    };
                    this.pendingBoarders.set(person, spot);
                    return { index: spot.index, x: spot.x, y: 0, z: spot.z };
                }
            }
            return null;
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
        }

        _hasStopInDirection(dir) {
            if (dir === 0) return false;
            for (var f = 0; f < this.floorCount; f++) {
                if (f === this.currentFloor) continue;
                if (dir > 0 ? f < this.currentFloor : f > this.currentFloor) continue;
                if (this.destinations.has(f)) return true;
                if (dir > 0 && this.upCalls.has(f)) return true;
                if (dir < 0 && this.downCalls.has(f)) return true;
            }
            return false;
        }

        _nearestStopInDirection(dir) {
            var best = null;
            for (var f = 0; f < this.floorCount; f++) {
                if (f === this.currentFloor) continue;
                if (dir > 0 ? f <= this.currentFloor : f >= this.currentFloor) continue;
                var isStop = this.destinations.has(f) ||
                    (dir > 0 ? this.upCalls.has(f) : this.downCalls.has(f));
                if (!isStop) continue;
                if (best === null || Math.abs(f - this.currentFloor) < Math.abs(best - this.currentFloor)) {
                    best = f;
                }
            }
            return best;
        }

        tick(dt) {
            // Substep so large frame deltas (high time scales) cannot skip
            // over door-timer thresholds or state transitions.
            let remaining = Math.max(0, dt);
            while (remaining > 0) {
                const step = Math.min(0.05, remaining);
                remaining -= step;
                this._tickStep(step);
            }
        }

        _tickStep(dt) {
            switch (this.state) {
                case STATE.IDLE:
                    this._tickIdle();
                    break;
                case STATE.MOVING:
                    this._tickMoving(dt);
                    break;
                case STATE.DOOR_OPENING:
                    this._tickDoorOpening(dt);
                    break;
                case STATE.DOOR_OPEN:
                    this._tickDoorOpen(dt);
                    break;
                case STATE.DOOR_CLOSING:
                    this._tickDoorClosing(dt);
                    break;
            }
        }

        _tickIdle() {
            // Longest-waiting work on another floor first (anti-starvation).
            var best = this._oldestWorkFloor();
            if (best !== null) {
                this.direction = best > this.currentFloor ? 1 : -1;
                this.targetFloor = best;
                this.state = STATE.MOVING;
                return;
            }
            // Work right here: open the doors (unless we just served this floor
            // and still owe riders a trip - that call stays queued).
            var callHere = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
            if (callHere &&
                (this.lastServedFloor !== this.currentFloor ||
                    (this.passengers.size === 0 && this.destinations.size === 0))) {
                this.direction = this.upCalls.has(this.currentFloor) ? 1 : -1;
                this.targetFloor = this.currentFloor;
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
            }
        }

        _tickMoving(dt) {
            // Re-evaluate target: shorten to a closer stop in the same direction.
            var progress = this.carY / this.floorHeight;
            var best = null;
            for (var f = 0; f < this.floorCount; f++) {
                var ahead = this.direction > 0 ? f > progress + 0.001 : f < progress - 0.001;
                if (!ahead) continue;
                var isStop = this.destinations.has(f) ||
                    (this.direction > 0 ? this.upCalls.has(f) : this.downCalls.has(f));
                if (!isStop) continue;
                if (best === null || Math.abs(f - progress) < Math.abs(best - progress)) best = f;
            }
            if (best !== null && this.targetFloor !== null) {
                if (this.direction > 0 ? best < this.targetFloor : best > this.targetFloor) {
                    this.targetFloor = best;
                }
            }

            var targetY = this.targetFloor * this.floorHeight;
            var step = this.moveSpeed * dt;
            var dy = targetY - this.carY;
            if (Math.abs(dy) <= step) {
                this.carY = targetY;
                this.currentFloor = this.targetFloor;
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
            } else {
                this.carY += (dy > 0 ? 1 : -1) * step;
            }
        }

        _tickDoorOpening(dt) {
            this.doorTimer += dt;
            this.doorOpenness = Math.min(1, this.doorTimer / this.DOOR_MOVE_S);
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorOpenness = 1;
                this.state = STATE.DOOR_OPEN;
                this.doorTimer = 0;
                this._handleArrival();
            }
        }

        _handleArrival() {
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) {
                this._clearUpCall(this.currentFloor);
            } else if (this.direction < 0) {
                this._clearDownCall(this.currentFloor);
            } else {
                this._clearUpCall(this.currentFloor);
                this._clearDownCall(this.currentFloor);
            }
            // If no more stops exist in the current direction, the car is
            // effectively turning around here: clear both hall calls on this
            // floor so everyone waiting can board, and drop the direction so
            // the next target is a fresh pick.
            if (!this._hasStopInDirection(this.direction)) {
                this._clearUpCall(this.currentFloor);
                this._clearDownCall(this.currentFloor);
                if (this.passengers.size === 0) this.direction = 0;
            }
            this.lastServedFloor = this.currentFloor;
            this.servedThisDoorCycle = true;
        }

        _tickDoorOpen(dt) {
            this.doorTimer += dt;
            var pendingEmpty = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                // Safety cap: something never completed its handshake. Cancel
                // the stragglers so their spot reservations don't leak.
                this._cancelPending();
                this.state = STATE.DOOR_CLOSING;
                this.doorTimer = 0;
                return;
            }
            if (this.doorTimer >= this.MIN_DOOR_OPEN_S && pendingEmpty) {
                this.state = STATE.DOOR_CLOSING;
                this.doorTimer = 0;
            }
        }

        _cancelPending() {
            var self = this;
            this.pendingBoarders.forEach(function (spot, person) {
                for (var i = 0; i < self.spotOccupancy.length; i++) {
                    if (self.spotOccupancy[i] === person) {
                        self.spotOccupancy[i] = null;
                        break;
                    }
                }
            });
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
        }

        _tickDoorClosing(dt) {
            this.doorTimer += dt;
            this.doorOpenness = Math.max(0, 1 - this.doorTimer / this.DOOR_MOVE_S);
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorOpenness = 0;
                this._pickNextTarget();
            }
        }

        _pickNextTarget() {
            // Prefer continuing in the current direction.
            if (this.direction !== 0) {
                var ahead = this._nearestStopInDirection(this.direction);
                if (ahead !== null) {
                    this.targetFloor = ahead;
                    this.state = STATE.MOVING;
                    return;
                }
                // No work ahead: reverse and look behind.
                var behind = this._nearestStopInDirection(-this.direction);
                if (behind !== null) {
                    this.direction = -this.direction;
                    this.targetFloor = behind;
                    this.state = STATE.MOVING;
                    return;
                }
            }
            // Idle pick: longest-waiting work on another floor. Passenger
            // destinations naturally outrank same-floor hall calls because
            // same-floor work is never chosen here while riders are aboard.
            var best = this._oldestWorkFloor();
            if (best !== null) {
                this.direction = best > this.currentFloor ? 1 : -1;
                this.targetFloor = best;
                this.state = STATE.MOVING;
                return;
            }
            // Only work left is a hall call on the current floor. Never reopen
            // for it while riders still have destinations (anti-starvation).
            var callHere = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
            if (callHere &&
                this.passengers.size === 0 && this.destinations.size === 0 &&
                this.lastServedFloor !== this.currentFloor) {
                this.direction = this.upCalls.has(this.currentFloor) ? 1 : -1;
                this.targetFloor = this.currentFloor;
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
                return;
            }
            this.direction = 0;
            this.targetFloor = null;
            this.state = STATE.IDLE;
            this.servedThisDoorCycle = false;
        }
    }

    ElevatorLogic.STATE = STATE;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
