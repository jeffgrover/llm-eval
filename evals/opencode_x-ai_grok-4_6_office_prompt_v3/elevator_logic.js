(function (root) {
    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount != null ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity != null ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight != null ? opts.floorHeight : 3.4;
            this.MIN_DOOR_OPEN_S = opts.minDoorOpen != null ? opts.minDoorOpen : 1.4;
            this.MAX_DOOR_OPEN_S = opts.maxDoorOpen != null ? opts.maxDoorOpen : 8.0;
            this.DOOR_ANIM_S = opts.doorAnim != null ? opts.doorAnim : 0.65;
            this.CAR_SPEED = opts.carSpeed != null ? opts.carSpeed : 2.8;
            this.policy = "SCAN";
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.y = 0;
            this.doorOpenAmount = 0;
            this.doorOpenTime = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.personSpot = new Map();
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
            this.SPOTS = [
                { index: 0, x: -0.7, y: 0, z: -0.55 },
                { index: 1, x: 0.7, y: 0, z: -0.55 },
                { index: 2, x: -0.7, y: 0, z: 0.35 },
                { index: 3, x: 0.7, y: 0, z: 0.35 }
            ];
        }

        callUp(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN") return false;
            if (this.currentFloor !== floor) return false;
            if (!this._hasStopsInDirection(this.direction, floor)) return true;
            return this.direction === 0 || this.direction === direction;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let idx = -1;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] == null) {
                    idx = i;
                    break;
                }
            }
            if (idx < 0) return null;
            this.spotOccupancy[idx] = person;
            this.personSpot.set(person, idx);
            this.pendingBoarders.add(person);
            const spec = this.SPOTS[idx];
            return { index: idx, x: spec.x, y: spec.y, z: spec.z };
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
            const idx = this.personSpot.get(person);
            if (idx != null) this.spotOccupancy[idx] = null;
            this.personSpot.delete(person);
        }

        tick(dt) {
            const step = dt > 0 ? dt : 0;
            if (this.state === "IDLE") {
                this._considerIdleWork();
            } else if (this.state === "MOVING") {
                this._tickMoving(step);
            } else if (this.state === "DOOR_OPENING") {
                this.doorOpenAmount = Math.min(1, this.doorOpenAmount + step / this.DOOR_ANIM_S);
                if (this.doorOpenAmount >= 1) {
                    this.doorOpenAmount = 1;
                    this.state = "DOOR_OPEN";
                    this.doorOpenTime = 0;
                    this._serveArrival();
                }
            } else if (this.state === "DOOR_OPEN") {
                this.doorOpenTime += step;
                const pending = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                const minElapsed = this.doorOpenTime >= this.MIN_DOOR_OPEN_S;
                const maxElapsed = this.doorOpenTime >= this.MAX_DOOR_OPEN_S;
                if ((minElapsed && !pending) || maxElapsed) {
                    this.state = "DOOR_CLOSING";
                }
            } else if (this.state === "DOOR_CLOSING") {
                this.doorOpenAmount = Math.max(0, this.doorOpenAmount - step / this.DOOR_ANIM_S);
                if (this.doorOpenAmount <= 0) {
                    this.doorOpenAmount = 0;
                    this._afterDoorsClosed();
                }
            }
        }

        _considerIdleWork() {
            const next = this._pickNextTarget();
            if (next == null) return;
            if (next === this.currentFloor) {
                this.state = "DOOR_OPENING";
                this.servedThisDoorCycle = false;
            } else {
                this.state = "MOVING";
            }
        }

        _tickMoving(dt) {
            this._reevaluateMovingTarget();
            const destY = this.targetFloor * this.floorHeight;
            const delta = destY - this.y;
            const maxStep = this.CAR_SPEED * dt;
            if (Math.abs(delta) <= maxStep || Math.abs(delta) < 0.001) {
                this.y = destY;
                this.currentFloor = this.targetFloor;
                this.state = "DOOR_OPENING";
                this.doorOpenTime = 0;
                this.servedThisDoorCycle = false;
                return;
            }
            this.y += Math.sign(delta) * maxStep;
            if (this.direction > 0) {
                this.currentFloor = Math.floor(this.y / this.floorHeight + 0.0001);
            } else if (this.direction < 0) {
                this.currentFloor = Math.ceil(this.y / this.floorHeight - 0.0001);
            }
        }

        _reevaluateMovingTarget() {
            if (this.direction === 0) return;
            const passed = this.direction > 0
                ? Math.floor(this.y / this.floorHeight + 0.0001)
                : Math.ceil(this.y / this.floorHeight - 0.0001);
            const closer = this._nearestCommittedStop(this.direction, passed);
            if (closer != null) {
                if (this.direction > 0 && closer < this.targetFloor && closer >= passed) {
                    this.targetFloor = closer;
                } else if (this.direction < 0 && closer > this.targetFloor && closer <= passed) {
                    this.targetFloor = closer;
                }
            }
        }

        _serveArrival() {
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) {
                this.upCalls.delete(this.currentFloor);
            } else if (this.direction < 0) {
                this.downCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            if (!this._hasStopsInDirection(this.direction, this.currentFloor)) {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
        }

        _afterDoorsClosed() {
            const next = this._pickNextTarget();
            if (next == null) {
                this.state = "IDLE";
                if (this.destinations.size === 0 && this.upCalls.size === 0 && this.downCalls.size === 0) {
                    this.direction = 0;
                }
                return;
            }
            if (next === this.currentFloor) {
                this.state = "DOOR_OPENING";
                this.servedThisDoorCycle = false;
            } else {
                this.state = "MOVING";
            }
        }

        _shouldIgnoreSameFloorReopen() {
            if (this.lastServedFloor !== this.currentFloor) return false;
            if (this.passengers.size > 0 && this.destinations.size > 0) return true;
            if (this.currentCapacityFree() <= 0) return true;
            if (this.destinations.size > 0) return true;
            return false;
        }

        _pickNextTarget() {
            const floor = this.currentFloor;

            if (this.passengers.size > 0 && this.destinations.size > 0) {
                let dest = this._nearestInSet(this.destinations, floor, this.direction);
                if (dest == null) dest = this._nearestAnyInSet(this.destinations, floor);
                if (dest != null && dest !== floor) {
                    this.direction = dest > floor ? 1 : -1;
                    this.targetFloor = dest;
                    return dest;
                }
                if (dest === floor && this._shouldIgnoreSameFloorReopen()) {
                    dest = this._nearestAnyInSetExcept(this.destinations, floor);
                    if (dest != null) {
                        this.direction = dest > floor ? 1 : -1;
                        this.targetFloor = dest;
                        return dest;
                    }
                }
            }

            let dir = this.direction;
            if (dir !== 0) {
                const ahead = this._nearestCommittedStop(dir, floor);
                if (ahead != null && ahead !== floor) {
                    this.targetFloor = ahead;
                    this.direction = dir;
                    return ahead;
                }
                const rev = -dir;
                const behind = this._nearestCommittedStop(rev, floor);
                if (behind != null && behind !== floor) {
                    this.direction = rev;
                    this.targetFloor = behind;
                    return behind;
                }
            }

            const nearest = this._nearestAnyWork(floor);
            if (nearest == null) {
                this.targetFloor = floor;
                return null;
            }
            if (nearest === floor) {
                if (this._shouldIgnoreSameFloorReopen()) {
                    const other = this._nearestAnyWorkExcept(floor);
                    if (other != null) {
                        this.direction = other > floor ? 1 : -1;
                        this.targetFloor = other;
                        return other;
                    }
                    this.targetFloor = floor;
                    return null;
                }
                if (this.upCalls.has(floor) && !this.downCalls.has(floor)) this.direction = 1;
                else if (this.downCalls.has(floor) && !this.upCalls.has(floor)) this.direction = -1;
                else if (this.direction === 0) this.direction = this.upCalls.has(floor) ? 1 : -1;
                this.targetFloor = floor;
                return floor;
            }
            this.direction = nearest > floor ? 1 : -1;
            this.targetFloor = nearest;
            return nearest;
        }

        _hasStopsInDirection(dir, fromFloor) {
            if (dir === 0) return false;
            const ahead = (f) => (dir > 0 ? f > fromFloor : f < fromFloor);
            for (const f of this.destinations) if (ahead(f)) return true;
            if (dir > 0) {
                for (const f of this.upCalls) if (ahead(f)) return true;
                for (const f of this.downCalls) if (ahead(f)) return true;
            } else {
                for (const f of this.downCalls) if (ahead(f)) return true;
                for (const f of this.upCalls) if (ahead(f)) return true;
            }
            return false;
        }

        _nearestCommittedStop(dir, fromFloor) {
            if (dir === 0) return null;
            let best = null;
            const consider = (f, allowed) => {
                if (!allowed) return;
                if (dir > 0 && f > fromFloor) {
                    if (best == null || f < best) best = f;
                } else if (dir < 0 && f < fromFloor) {
                    if (best == null || f > best) best = f;
                }
            };
            for (const f of this.destinations) consider(f, true);
            if (dir > 0) {
                for (const f of this.upCalls) consider(f, true);
            } else {
                for (const f of this.downCalls) consider(f, true);
            }
            return best;
        }

        _nearestInSet(setRef, fromFloor, dir) {
            let best = null;
            for (const f of setRef) {
                if (dir > 0 && f > fromFloor) {
                    if (best == null || f < best) best = f;
                } else if (dir < 0 && f < fromFloor) {
                    if (best == null || f > best) best = f;
                } else if (dir === 0 && f !== fromFloor) {
                    const d = Math.abs(f - fromFloor);
                    if (best == null || d < Math.abs(best - fromFloor)) best = f;
                }
            }
            return best;
        }

        _nearestAnyInSet(setRef, fromFloor) {
            let best = null;
            let bestD = 1000000000;
            for (const f of setRef) {
                const d = Math.abs(f - fromFloor);
                if (d < bestD || (d === bestD && (best == null || f < best))) {
                    best = f;
                    bestD = d;
                }
            }
            return best;
        }

        _nearestAnyInSetExcept(setRef, exceptFloor) {
            let best = null;
            let bestD = 1000000000;
            for (const f of setRef) {
                if (f === exceptFloor) continue;
                const d = Math.abs(f - exceptFloor);
                if (d < bestD) {
                    best = f;
                    bestD = d;
                }
            }
            return best;
        }

        _collectWorkFloors() {
            const floors = new Set();
            for (const f of this.destinations) floors.add(f);
            for (const f of this.upCalls) floors.add(f);
            for (const f of this.downCalls) floors.add(f);
            return floors;
        }

        _nearestAnyWork(fromFloor) {
            return this._nearestAnyInSet(this._collectWorkFloors(), fromFloor);
        }

        _nearestAnyWorkExcept(exceptFloor) {
            return this._nearestAnyInSetExcept(this._collectWorkFloors(), exceptFloor);
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
