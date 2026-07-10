(function (root) {
    "use strict";

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = options.floorCount === undefined ? 6 : options.floorCount;
            this.maxCapacity = options.maxCapacity === undefined ? 4 : options.maxCapacity;
            this.floorHeight = options.floorHeight === undefined ? 3.4 : options.floorHeight;
            this.travelSpeed = options.travelSpeed === undefined ? 0.92 : options.travelSpeed;
            this.DOOR_OPENING_S = options.doorOpeningS === undefined ? 0.5 : options.doorOpeningS;
            this.DOOR_CLOSING_S = options.doorClosingS === undefined ? 0.5 : options.doorClosingS;
            this.MIN_DOOR_OPEN_S = options.minDoorOpenS === undefined ? 1.15 : options.minDoorOpenS;
            this.MAX_DOOR_OPEN_S = options.maxDoorOpenS === undefined ? 6.5 : options.maxDoorOpenS;
            this._spots = [
                { index: 0, x: -0.62, y: 0, z: 0.34 },
                { index: 1, x: 0.62, y: 0, z: 0.34 },
                { index: 2, x: -0.62, y: 0, z: -0.46 },
                { index: 3, x: 0.62, y: 0, z: -0.46 }
            ];
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.positionFloor = 0;
            this.targetFloor = null;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Map();
            this.personSpots = new Map();
            this.doorTimer = 0;
            this.doorOpenElapsed = 0;
            this.doorProgress = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
            return this;
        }

        _validFloor(floor) {
            return Number.isInteger(floor) && floor >= 0 && floor < this.floorCount;
        }

        callUp(floor) {
            if (this._validFloor(floor) && floor < this.floorCount - 1) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (this._validFloor(floor) && floor > 0) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (this._validFloor(floor) && floor !== this.currentFloor) this.destinations.add(floor);
        }

        currentCapacityFree() {
            return Math.max(0, this.maxCapacity - (this.passengers.size + this.pendingBoarders.size));
        }

        reserveBoardingSpot(person) {
            var index;
            var spot;
            if (!person || this.currentCapacityFree() <= 0 || this.personSpots.has(person)) return null;
            for (index = 0; index < this._spots.length; index += 1) {
                spot = this._spots[index];
                if (!this.spotOccupancy.has(spot.index)) {
                    this.spotOccupancy.set(spot.index, person);
                    this.personSpots.set(person, spot);
                    this.pendingBoarders.add(person);
                    return { index: spot.index, x: spot.x, y: spot.y, z: spot.z };
                }
            }
            return null;
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
            var spot = this.personSpots.get(person);
            this.pendingDisembark.delete(person);
            this.pendingBoarders.delete(person);
            this.passengers.delete(person);
            if (spot) this.spotOccupancy.delete(spot.index);
            this.personSpots.delete(person);
            return Boolean(spot);
        }

        getSpot(person) {
            var spot = this.personSpots.get(person);
            return spot ? { index: spot.index, x: spot.x, y: spot.y, z: spot.z } : null;
        }

        _hasForwardWork(direction, floor) {
            var destination;
            var call;
            if (!direction) return false;
            for (destination of this.destinations) {
                if ((destination - floor) * direction > 0) return true;
            }
            for (call of (direction > 0 ? this.upCalls : this.downCalls)) {
                if ((call - floor) * direction > 0) return true;
            }
            return false;
        }

        _candidatesInDirection(direction, floor) {
            var candidates = [];
            var destination;
            var call;
            for (destination of this.destinations) {
                if ((destination - floor) * direction > 0) candidates.push(destination);
            }
            for (call of (direction > 0 ? this.upCalls : this.downCalls)) {
                if ((call - floor) * direction > 0) candidates.push(call);
            }
            candidates.sort(function (a, b) { return direction > 0 ? a - b : b - a; });
            return candidates;
        }

        _allActiveFloors(includeCurrent) {
            var floors = [];
            var seen = new Set();
            var add = function (floor) {
                if ((includeCurrent || floor !== this.currentFloor) && !seen.has(floor)) {
                    seen.add(floor);
                    floors.push(floor);
                }
            }.bind(this);
            this.destinations.forEach(add);
            this.upCalls.forEach(add);
            this.downCalls.forEach(add);
            return floors;
        }

        _chooseNearest(candidates) {
            var chosen = null;
            var distance = Infinity;
            var index;
            var candidate;
            for (index = 0; index < candidates.length; index += 1) {
                candidate = candidates[index];
                if (Math.abs(candidate - this.positionFloor) < distance) {
                    chosen = candidate;
                    distance = Math.abs(candidate - this.positionFloor);
                }
            }
            return chosen;
        }

        _pickNextTarget() {
            var candidates;
            var target;
            var opposite;
            var all;
            if (this.direction) {
                candidates = this._candidatesInDirection(this.direction, this.currentFloor);
                if (candidates.length) return candidates[0];
                opposite = -this.direction;
                candidates = this._candidatesInDirection(opposite, this.currentFloor);
                if (candidates.length) {
                    this.direction = opposite;
                    return candidates[0];
                }
            }
            if (!this.direction && this.destinations.size) {
                target = this._chooseNearest(Array.from(this.destinations).filter(function (floor) { return floor !== this.currentFloor; }.bind(this)));
                if (target !== null) {
                    this.direction = target > this.currentFloor ? 1 : -1;
                    return target;
                }
            }
            all = this._allActiveFloors(this.passengers.size === 0 && this.destinations.size === 0 && this.pendingBoarders.size === 0);
            if (!all.length) {
                this.direction = 0;
                return null;
            }
            target = this._chooseNearest(all);
            if (target > this.currentFloor) this.direction = 1;
            else if (target < this.currentFloor) this.direction = -1;
            else this.direction = 0;
            return target;
        }

        _serveArrivalCalls() {
            var floor = this.currentFloor;
            if (this.direction > 0) {
                this.upCalls.delete(floor);
                if (!this._hasForwardWork(this.direction, floor)) this.downCalls.delete(floor);
            } else if (this.direction < 0) {
                this.downCalls.delete(floor);
                if (!this._hasForwardWork(this.direction, floor)) this.upCalls.delete(floor);
            } else {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
            this.destinations.delete(floor);
            this.lastServedFloor = floor;
            this.servedThisDoorCycle = true;
        }

        _startOpening() {
            this.state = "DOOR_OPENING";
            this.doorTimer = 0;
            this.doorProgress = 0;
            this._serveArrivalCalls();
        }

        _arrive() {
            this.positionFloor = this.targetFloor;
            this.currentFloor = this.targetFloor;
            this.targetFloor = null;
            this._startOpening();
        }

        _canReopenAtCurrentFloor() {
            var currentHasCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
            if (!currentHasCall) return false;
            if (this.passengers.size > 0 || this.destinations.size > 0 || this.pendingBoarders.size > 0) return false;
            if (this.currentCapacityFree() <= 0) return false;
            return true;
        }

        _leaveClosedDoors() {
            var next = this._pickNextTarget();
            this.servedThisDoorCycle = false;
            this.targetFloor = next;
            if (next === null) {
                this.state = "IDLE";
                this.direction = 0;
                return;
            }
            if (next === this.currentFloor) {
                if (this._canReopenAtCurrentFloor()) this._startOpening();
                else {
                    this.state = "IDLE";
                    this.targetFloor = null;
                    if (this.passengers.size || this.destinations.size) {
                        this.direction = this.destinations.size ? (Math.min.apply(null, Array.from(this.destinations)) > this.currentFloor ? 1 : -1) : this.direction;
                    }
                }
                return;
            }
            this.direction = next > this.currentFloor ? 1 : -1;
            this.state = "MOVING";
        }

        _reconsiderTarget() {
            var candidates;
            var candidate;
            if (!this.direction || this.targetFloor === null) return;
            candidates = this._candidatesInDirection(this.direction, this.positionFloor);
            if (!candidates.length) return;
            candidate = candidates[0];
            if ((candidate - this.positionFloor) * this.direction > 0 && (candidate - this.targetFloor) * this.direction < 0) {
                this.targetFloor = candidate;
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor || this.currentCapacityFree() <= 0) return false;
            if (!this.direction) return true;
            return !this._hasForwardWork(this.direction, floor) || this.direction === direction;
        }

        tick(dt) {
            var remaining = Math.max(0, Number(dt) || 0);
            var guard = 0;
            var amount;
            var distance;
            var travelTime;
            while (remaining > 0 && guard < 32) {
                guard += 1;
                if (this.state === "IDLE") {
                    this._leaveClosedDoors();
                    if (this.state === "IDLE") break;
                    continue;
                }
                if (this.state === "MOVING") {
                    this._reconsiderTarget();
                    if (this.targetFloor === null) {
                        this.state = "IDLE";
                        continue;
                    }
                    distance = Math.abs(this.targetFloor - this.positionFloor);
                    travelTime = distance / this.travelSpeed;
                    if (remaining >= travelTime) {
                        remaining -= travelTime;
                        this._arrive();
                    } else {
                        this.positionFloor += this.direction * this.travelSpeed * remaining;
                        remaining = 0;
                    }
                    continue;
                }
                if (this.state === "DOOR_OPENING") {
                    amount = Math.min(remaining, this.DOOR_OPENING_S - this.doorTimer);
                    this.doorTimer += amount;
                    remaining -= amount;
                    this.doorProgress = Math.min(1, this.doorTimer / this.DOOR_OPENING_S);
                    if (this.doorTimer >= this.DOOR_OPENING_S - 0.00000001) {
                        this.state = "DOOR_OPEN";
                        this.doorTimer = 0;
                        this.doorOpenElapsed = 0;
                        this.doorProgress = 1;
                        // Let browser-side agents observe at least one open-door frame.
                        // This matters when one render frame represents several motion seconds.
                        remaining = 0;
                    }
                    continue;
                }
                if (this.state === "DOOR_OPEN") {
                    amount = remaining;
                    this.doorOpenElapsed += amount;
                    remaining = 0;
                    if (this.doorOpenElapsed >= this.MAX_DOOR_OPEN_S || (this.doorOpenElapsed >= this.MIN_DOOR_OPEN_S && this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0)) {
                        this.state = "DOOR_CLOSING";
                        this.doorTimer = 0;
                    }
                    continue;
                }
                if (this.state === "DOOR_CLOSING") {
                    amount = Math.min(remaining, this.DOOR_CLOSING_S - this.doorTimer);
                    this.doorTimer += amount;
                    remaining -= amount;
                    this.doorProgress = Math.max(0, 1 - this.doorTimer / this.DOOR_CLOSING_S);
                    if (this.doorTimer >= this.DOOR_CLOSING_S - 0.00000001) {
                        this.doorTimer = 0;
                        this.doorProgress = 0;
                        this._leaveClosedDoors();
                    }
                }
            }
            return this.state;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
}(typeof window !== "undefined" ? window : globalThis));
