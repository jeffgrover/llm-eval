// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, DOM, or browser-only dependencies. Dual environment:
// browser global window.ElevatorLogic + Node module.exports.

(function(root) {

    var MIN_DOOR_OPEN_S = 1.6;
    var MAX_DOOR_OPEN_S = 8.0;
    var DOOR_MOVE_S = 0.9;
    var CAR_SPEED = 2.2; // units per second

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = (options.floorCount !== undefined) ? options.floorCount : 6;
            this.maxCapacity = (options.maxCapacity !== undefined) ? options.maxCapacity : 4;
            this.floorHeight = (options.floorHeight !== undefined) ? options.floorHeight : 3.4;
            this.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
            this.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
            this.DOOR_MOVE_S = DOOR_MOVE_S;
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.y = 0;
            this.doorProgress = 0; // 0 closed .. 1 open
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
            if (floor >= 0 && floor < this.floorCount && floor !== null) {
                if (!(this.state !== "MOVING" && floor === this.currentFloor && this.doorProgress > 0.5)) {
                    this.destinations.add(floor);
                }
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN") { return false; }
            if (this.currentFloor !== floor) { return false; }
            if (this.direction === 0) { return true; }
            if (this.direction === direction) { return true; }
            // accept opposite direction only when no more work in current direction
            return !this._hasWorkInDirection(this.direction);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) { return null; }
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    var sx = (i % 2 === 0) ? -0.7 : 0.7;
                    var sz = (i < 2) ? -0.7 : 0.5;
                    return { index: i, x: sx, y: 0, z: sz };
                }
            }
            return null;
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
            }
        }

        cancelBoarding(person) {
            this.pendingBoarders.delete(person);
            this._releaseSpot(person);
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.pendingDisembark.add(person);
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this._releaseSpot(person);
        }

        _releaseSpot(person) {
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) { this.spotOccupancy[i] = null; }
            }
        }

        _hasWorkInDirection(dir) {
            var f;
            if (dir > 0) {
                for (f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { return true; }
                }
            } else if (dir < 0) {
                for (f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { return true; }
                }
            }
            return false;
        }

        _nearestStopInDirection(dir) {
            // Prefer passenger destinations and matching-direction calls ahead.
            var f;
            if (dir > 0) {
                for (f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) { return f; }
                }
                // farthest down-call above (to serve it turning around)
                for (f = this.floorCount - 1; f > this.currentFloor; f--) {
                    if (this.downCalls.has(f)) { return f; }
                }
            } else if (dir < 0) {
                for (f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) { return f; }
                }
                for (f = 0; f < this.currentFloor; f++) {
                    if (this.upCalls.has(f)) { return f; }
                }
            }
            return null;
        }

        _nearestAnyStop() {
            var best = null;
            var bestDist = Infinity;
            for (var f = 0; f < this.floorCount; f++) {
                if (f === this.currentFloor) { continue; }
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    var d = Math.abs(f - this.currentFloor);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            return best;
        }

        _currentFloorHasCall() {
            return this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor) ||
                this.destinations.has(this.currentFloor);
        }

        _pickNextTarget() {
            // Passenger destinations outrank same-floor hall calls.
            var next = null;
            if (this.direction !== 0) {
                next = this._nearestStopInDirection(this.direction);
                if (next === null) {
                    next = this._nearestStopInDirection(-this.direction);
                    if (next !== null) { this.direction = -this.direction; }
                }
            }
            if (next === null) {
                next = this._nearestAnyStop();
                if (next !== null) {
                    this.direction = (next > this.currentFloor) ? 1 : -1;
                }
            }
            if (next !== null) {
                return next;
            }
            // Only same-floor call remains (and no destinations / passengers en route).
            if (this._currentFloorHasCall() && this.passengers.size === 0 &&
                this.destinations.size === 0 &&
                !(this.servedThisDoorCycle && this.lastServedFloor === this.currentFloor)) {
                return this.currentFloor;
            }
            return null;
        }

        _arriveOpenDoors() {
            this.state = "DOOR_OPENING";
            this.doorOpenTimer = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) {
                this.upCalls.delete(this.currentFloor);
                if (!this._hasWorkInDirection(1)) {
                    this.downCalls.delete(this.currentFloor);
                }
            } else if (this.direction < 0) {
                this.downCalls.delete(this.currentFloor);
                if (!this._hasWorkInDirection(-1)) {
                    this.upCalls.delete(this.currentFloor);
                }
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
        }

        tick(dt) {
            if (dt <= 0) { return; }
            // cap dt for stability at high time scales; loop internally
            var remaining = dt;
            while (remaining > 0) {
                var step = Math.min(remaining, 0.1);
                this._step(step);
                remaining -= step;
            }
        }

        _step(dt) {
            switch (this.state) {
                case "IDLE": {
                    var target = this._pickNextTarget();
                    if (target !== null) {
                        if (target === this.currentFloor) {
                            this.direction = this.upCalls.has(this.currentFloor) ? 1 :
                                (this.downCalls.has(this.currentFloor) ? -1 : 0);
                            this._arriveOpenDoors();
                        } else {
                            this.targetFloor = target;
                            this.direction = (target > this.currentFloor) ? 1 : -1;
                            this.state = "MOVING";
                            this.servedThisDoorCycle = false;
                        }
                    }
                    break;
                }
                case "MOVING": {
                    // Re-evaluate: closer stop in the same direction?
                    var better = this._nearestStopInDirection(this.direction);
                    if (better !== null) {
                        var by = better * this.floorHeight;
                        if (this.direction > 0 && better < this.targetFloor && this.y < by - 0.6) {
                            this.targetFloor = better;
                        } else if (this.direction < 0 && better > this.targetFloor && this.y > by + 0.6) {
                            this.targetFloor = better;
                        }
                    }
                    var targetY = this.targetFloor * this.floorHeight;
                    var dy = targetY - this.y;
                    var move = CAR_SPEED * dt;
                    if (Math.abs(dy) <= move) {
                        this.y = targetY;
                        this.currentFloor = this.targetFloor;
                        this.targetFloor = null;
                        this._arriveOpenDoors();
                    } else {
                        this.y += Math.sign(dy) * move;
                        var nf = Math.round(this.y / this.floorHeight);
                        if (nf < 0) { nf = 0; }
                        if (nf >= this.floorCount) { nf = this.floorCount - 1; }
                        this.currentFloor = nf;
                    }
                    break;
                }
                case "DOOR_OPENING": {
                    this.doorProgress += dt / DOOR_MOVE_S;
                    if (this.doorProgress >= 1) {
                        this.doorProgress = 1;
                        this.state = "DOOR_OPEN";
                        this.doorOpenTimer = 0;
                    }
                    break;
                }
                case "DOOR_OPEN": {
                    this.doorOpenTimer += dt;
                    var mustHold = (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0);
                    var minElapsed = this.doorOpenTimer >= MIN_DOOR_OPEN_S;
                    var maxElapsed = this.doorOpenTimer >= MAX_DOOR_OPEN_S;
                    if ((minElapsed && !mustHold) || maxElapsed) {
                        if (maxElapsed && mustHold) {
                            // Safety cap: force-clear stuck pending boarders (they lose reservation).
                            var self = this;
                            this.pendingBoarders.forEach(function(p) { self._releaseSpot(p); });
                            this.pendingBoarders.clear();
                            this.pendingDisembark.forEach(function(p) {
                                self.passengers.delete(p);
                                self._releaseSpot(p);
                            });
                            this.pendingDisembark.clear();
                        }
                        this.state = "DOOR_CLOSING";
                    }
                    break;
                }
                case "DOOR_CLOSING": {
                    this.doorProgress -= dt / DOOR_MOVE_S;
                    if (this.doorProgress <= 0) {
                        this.doorProgress = 0;
                        var next = this._pickNextTarget();
                        if (next === null) {
                            this.direction = 0;
                            this.state = "IDLE";
                            this.servedThisDoorCycle = false;
                        } else if (next === this.currentFloor) {
                            // Guard: never reopen at the same floor while passengers/destinations exist.
                            if (this.passengers.size > 0 || this.destinations.size > 0) {
                                this.direction = 0;
                                this.state = "IDLE";
                            } else {
                                this.direction = this.upCalls.has(this.currentFloor) ? 1 :
                                    (this.downCalls.has(this.currentFloor) ? -1 : 0);
                                this._arriveOpenDoors();
                            }
                        } else {
                            this.targetFloor = next;
                            this.direction = (next > this.currentFloor) ? 1 : -1;
                            this.state = "MOVING";
                            this.servedThisDoorCycle = false;
                        }
                    }
                    break;
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
