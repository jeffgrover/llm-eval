(function(root) {
    const INTERIOR_SPOTS = [
        { index: 0, x: -0.65, y: 0, z: -0.55 },
        { index: 1, x: 0.65, y: 0, z: -0.55 },
        { index: 2, x: -0.65, y: 0, z: 0.45 },
        { index: 3, x: 0.65, y: 0, z: 0.45 }
    ];

    class ElevatorLogic {
        constructor(opts) {
            const o = opts || {};
            this.floorCount = o.floorCount !== undefined ? o.floorCount : 6;
            this.maxCapacity = o.maxCapacity !== undefined ? o.maxCapacity : 4;
            this.floorHeight = o.floorHeight !== undefined ? o.floorHeight : 3.4;
            this.speed = o.speed !== undefined ? o.speed : 4.5;
            this.doorSpeed = o.doorSpeed !== undefined ? o.doorSpeed : 2.5;
            this.MIN_DOOR_OPEN_S = o.minDoorOpenS !== undefined ? o.minDoorOpenS : 1.0;
            this.MAX_DOOR_OPEN_S = o.maxDoorOpenS !== undefined ? o.maxDoorOpenS : 6.0;
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.y = 0;
            this.doorOpenProgress = 0;
            this.doorOpenTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);
            this.personSpots = new Map();
            this.lastServedFloor = null;
            this.servedThisDoorCycle = false;
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

        currentCapacityFree() {
            return Math.max(0, this.maxCapacity - (this.passengers.size + this.pendingBoarders.size));
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (this.direction === 0 || !direction) return true;
            if (direction === this.direction) return true;
            return !this._hasStopsInDirection(this.direction, floor);
        }

        reserveBoardingSpot(person) {
            if (this.personSpots.has(person)) {
                const idx = this.personSpots.get(person);
                this.pendingBoarders.add(person);
                return Object.assign({}, INTERIOR_SPOTS[idx]);
            }
            if (this.currentCapacityFree() <= 0) return null;
            let spotIdx = -1;
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === null) {
                    spotIdx = i;
                    break;
                }
            }
            if (spotIdx === -1) return null;
            this.spotOccupancy[spotIdx] = person;
            this.personSpots.set(person, spotIdx);
            this.pendingBoarders.add(person);
            return Object.assign({}, INTERIOR_SPOTS[spotIdx]);
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this.pendingBoarders.delete(person);
            if (this.personSpots.has(person)) {
                const idx = this.personSpots.get(person);
                this.spotOccupancy[idx] = null;
                this.personSpots.delete(person);
            }
        }

        _hasStopsInDirection(dir, fromFloor) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            }
            return false;
        }

        _hasPassengerDestinations() {
            for (const f of this.destinations) {
                if (f !== this.currentFloor) return true;
            }
            return false;
        }

        _canAcceptHallCalls() {
            return (this.passengers.size + this.pendingBoarders.size) < this.maxCapacity;
        }

        _pickNextTarget(afterDoorClose) {
            const cur = this.currentFloor;
            const hasPassDest = this.passengers.size > 0 && this._hasPassengerDestinations();
            const canHall = this._canAcceptHallCalls();

            if (!afterDoorClose && !hasPassDest) {
                if (this.destinations.has(cur)) return cur;
                if (canHall && (this.upCalls.has(cur) || this.downCalls.has(cur))) return cur;
            }

            const searchDir = (dir) => {
                if (dir > 0) {
                    for (let f = cur + 1; f < this.floorCount; f++) {
                        if (this.destinations.has(f) || (canHall && this.upCalls.has(f))) return f;
                    }
                    for (let f = this.floorCount - 1; f > cur; f--) {
                        if (canHall && this.downCalls.has(f)) return f;
                    }
                } else if (dir < 0) {
                    for (let f = cur - 1; f >= 0; f--) {
                        if (this.destinations.has(f) || (canHall && this.downCalls.has(f))) return f;
                    }
                    for (let f = 0; f < cur; f++) {
                        if (canHall && this.upCalls.has(f)) return f;
                    }
                }
                return null;
            };

            const dir = this.direction !== 0 ? this.direction : 1;
            let next = searchDir(dir);
            if (next !== null) {
                this.direction = next > cur ? 1 : -1;
                return next;
            }
            next = searchDir(-dir);
            if (next !== null) {
                this.direction = next > cur ? 1 : -1;
                return next;
            }
            if (!afterDoorClose && !hasPassDest && canHall && (this.upCalls.has(cur) || this.downCalls.has(cur))) {
                return cur;
            }
            this.direction = 0;
            return null;
        }

        _onArriveAtFloor(floor) {
            this.currentFloor = floor;
            this.y = floor * this.floorHeight;
            this.destinations.delete(floor);
            this.lastServedFloor = floor;
            this.servedThisDoorCycle = true;

            if (this.direction > 0) {
                this.upCalls.delete(floor);
                if (!this._hasStopsInDirection(1, floor)) {
                    if (this.downCalls.has(floor)) {
                        this.downCalls.delete(floor);
                        this.direction = -1;
                    } else if (this._hasStopsInDirection(-1, floor)) {
                        this.direction = -1;
                    } else {
                        this.direction = 0;
                    }
                }
            } else if (this.direction < 0) {
                this.downCalls.delete(floor);
                if (!this._hasStopsInDirection(-1, floor)) {
                    if (this.upCalls.has(floor)) {
                        this.upCalls.delete(floor);
                        this.direction = 1;
                    } else if (this._hasStopsInDirection(1, floor)) {
                        this.direction = 1;
                    } else {
                        this.direction = 0;
                    }
                }
            } else {
                if (this.upCalls.has(floor)) {
                    this.upCalls.delete(floor);
                    this.direction = 1;
                } else if (this.downCalls.has(floor)) {
                    this.downCalls.delete(floor);
                    this.direction = -1;
                }
            }
        }

        _reevaluateMovingTarget() {
            if (this.targetFloor === null || this.direction === 0) return;
            const canHall = this._canAcceptHallCalls();
            if (this.direction > 0) {
                const minF = Math.max(this.currentFloor + 1, Math.ceil(this.y / this.floorHeight + 0.05));
                for (let f = minF; f < this.targetFloor; f++) {
                    if (this.destinations.has(f) || (canHall && this.upCalls.has(f))) {
                        this.targetFloor = f;
                        break;
                    }
                }
            } else if (this.direction < 0) {
                const maxF = Math.min(this.currentFloor - 1, Math.floor(this.y / this.floorHeight - 0.05));
                for (let f = maxF; f > this.targetFloor; f--) {
                    if (this.destinations.has(f) || (canHall && this.downCalls.has(f))) {
                        this.targetFloor = f;
                        break;
                    }
                }
            }
        }

        tick(dt) {
            if (dt <= 0) return;
            if (this.state === "IDLE") {
                this.servedThisDoorCycle = false;
                const next = this._pickNextTarget(false);
                if (next !== null) {
                    this.targetFloor = next;
                    if (next === this.currentFloor) {
                        this._onArriveAtFloor(this.currentFloor);
                        this.state = "DOOR_OPENING";
                    } else {
                        this.direction = next > this.currentFloor ? 1 : -1;
                        this.state = "MOVING";
                    }
                }
            } else if (this.state === "MOVING") {
                this._reevaluateMovingTarget();
                if (this.targetFloor === null) {
                    this.state = "IDLE";
                    return;
                }
                const targetY = this.targetFloor * this.floorHeight;
                const diff = targetY - this.y;
                const step = this.speed * dt;
                if (Math.abs(diff) <= step) {
                    this._onArriveAtFloor(this.targetFloor);
                    this.state = "DOOR_OPENING";
                } else {
                    this.y += Math.sign(diff) * step;
                    this.currentFloor = Math.round(this.y / this.floorHeight);
                }
            } else if (this.state === "DOOR_OPENING") {
                this.doorOpenProgress = Math.min(1, this.doorOpenProgress + this.doorSpeed * dt);
                if (this.doorOpenProgress >= 1) {
                    this.state = "DOOR_OPEN";
                    this.doorOpenTimer = 0;
                }
            } else if (this.state === "DOOR_OPEN") {
                this.doorOpenTimer += dt;
                const hasPending = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                if (this.doorOpenTimer >= this.MAX_DOOR_OPEN_S) {
                    this.pendingBoarders.clear();
                    this.pendingDisembark.clear();
                    this.state = "DOOR_CLOSING";
                } else if (this.doorOpenTimer >= this.MIN_DOOR_OPEN_S && !hasPending) {
                    this.state = "DOOR_CLOSING";
                }
            } else if (this.state === "DOOR_CLOSING") {
                this.doorOpenProgress = Math.max(0, this.doorOpenProgress - this.doorSpeed * dt);
                if (this.doorOpenProgress <= 0) {
                    const next = this._pickNextTarget(true);
                    if (next !== null && next !== this.currentFloor) {
                        this.targetFloor = next;
                        this.direction = next > this.currentFloor ? 1 : -1;
                        this.state = "MOVING";
                    } else if (next === this.currentFloor) {
                        this._onArriveAtFloor(this.currentFloor);
                        this.state = "DOOR_OPENING";
                    } else {
                        this.targetFloor = null;
                        this.direction = 0;
                        this.state = "IDLE";
                    }
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
