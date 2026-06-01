(function (root) {
    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount != null ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity != null ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight != null ? opts.floorHeight : 3.4;

            this.state = 'IDLE';
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Map();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Map();

            this.spotOccupancy = [false, false, false, false];

            this.doorTimer = 0;
            this.minDoorOpenS = opts.minDoorOpenS != null ? opts.minDoorOpenS : 1.5;
            this.maxDoorOpenS = opts.maxDoorOpenS != null ? opts.maxDoorOpenS : 8.0;
            this.doorProgress = 0;
            this.doorSpeed = 2.0;
            this.travelSpeed = 2.5;

            this.servedFloors = new Set();
            this._lastPickedTarget = -1;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount - 1) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (floor > 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.destinations.add(floor);
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== 'DOOR_OPEN') return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            return !this._hasMoreInDirection(this.direction);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = true;
                    const x = (i % 2 === 0 ? -0.3 : 0.3);
                    const z = (i < 2 ? -0.4 : 0.4);
                    const info = { index: i, x: x, y: 0, z: z, person: person };
                    this.pendingBoarders.set(person, info);
                    return info;
                }
            }
            return null;
        }

        completeBoard(person) {
            const info = this.pendingBoarders.get(person);
            if (info) {
                this.pendingBoarders.delete(person);
                this.passengers.set(person, info);
                return true;
            }
            return false;
        }

        registerDisembark(person) {
            const info = this.passengers.get(person);
            if (info) {
                this.passengers.delete(person);
                this.pendingDisembark.set(person, info);
                return true;
            }
            return false;
        }

        completeDisembark(person) {
            const info = this.pendingDisembark.get(person);
            if (info) {
                this.pendingDisembark.delete(person);
                this.spotOccupancy[info.index] = false;
                return true;
            }
            return false;
        }

        _hasMoreInDirection(direction) {
            for (const f of this.destinations) {
                if (direction > 0 && f > this.currentFloor) return true;
                if (direction < 0 && f < this.currentFloor) return true;
            }
            if (direction > 0) {
                for (const f of this.upCalls) if (f > this.currentFloor) return true;
            } else {
                for (const f of this.downCalls) if (f < this.currentFloor) return true;
            }
            return false;
        }

        _findClosestInDir(floor, direction, options, includeSame) {
            let best = null;
            let bestDist = Infinity;
            for (const f of options) {
                const diff = f - floor;
                if (direction > 0) {
                    if ((includeSame ? diff >= 0 : diff > 0) && diff < bestDist) {
                        best = f; bestDist = diff;
                    }
                } else if (direction < 0) {
                    if ((includeSame ? diff <= 0 : diff < 0) && -diff < bestDist) {
                        best = f; bestDist = -diff;
                    }
                }
            }
            return best;
        }

        _clearServedAtCurrentFloor() {
            this.destinations.delete(this.currentFloor);
            this.servedFloors.add(this.currentFloor);
            if (this.direction === +1) this.upCalls.delete(this.currentFloor);
            else if (this.direction === -1) this.downCalls.delete(this.currentFloor);
            else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
        }

        _pickNextTarget() {
            if (this.passengers.size > 0 && this.destinations.size > 0 && this.direction !== 0) {
                const dest = this._findClosestInDir(this.currentFloor, this.direction, [...this.destinations], false);
                if (dest != null) {
                    this.targetFloor = dest;
                    return;
                }
            }

            if (this.direction === 0) {
                this._pickIdleTarget();
                return;
            }

            const options = [...this.destinations, ...(this.direction > 0 ? this.upCalls : this.downCalls)];
            const best = this._findClosestInDir(this.currentFloor, this.direction, options, false);
            if (best != null) {
                this.targetFloor = best;
                return;
            }

            this.servedFloors.clear();
            this.direction = -this.direction;
            if (this.direction === 0) this.direction = +1;

            const newOptions = [...this.destinations, ...(this.direction > 0 ? this.upCalls : this.downCalls)];
            const newBest = this._findClosestInDir(this.currentFloor, this.direction, newOptions, true);
            if (newBest != null) {
                this.targetFloor = newBest;
                return;
            }

            this.direction = 0;
            this.servedFloors.clear();
            this._pickIdleTarget();
        }

        _pickIdleTarget() {
            let best = null;
            let bestDist = Infinity;
            const all = [...this.destinations, ...this.upCalls, ...this.downCalls];
            for (const f of all) {
                const dist = Math.abs(f - this.currentFloor);
                if (dist < bestDist) {
                    best = f; bestDist = dist;
                } else if (dist === bestDist && best != null) {
                    if (f > best) best = f;
                }
            }
            if (best != null) {
                this.targetFloor = best;
                this.direction = Math.sign(best - this.currentFloor);
                if (this.direction === 0) {
                    if (this.upCalls.has(this.currentFloor)) this.direction = +1;
                    else if (this.downCalls.has(this.currentFloor)) this.direction = -1;
                }
            } else {
                this.targetFloor = this.currentFloor;
            }
        }

        _hasWorkAtCurrentFloor() {
            return this.upCalls.has(this.currentFloor) ||
                this.downCalls.has(this.currentFloor) ||
                this.destinations.has(this.currentFloor);
        }

        tick(dt) {
            switch (this.state) {
                case 'IDLE':
                    this._pickNextTarget();
                    if (this.targetFloor !== this.currentFloor) {
                        this.state = 'MOVING';
                    } else if (this._hasWorkAtCurrentFloor()) {
                        this.state = 'DOOR_OPENING';
                        this.doorProgress = 0;
                        this.doorTimer = 0;
                    }
                    break;
                case 'MOVING': {
                    const moveDir = this.direction;
                    if (moveDir === 0) {
                        this.state = 'DOOR_OPENING';
                        this.doorProgress = 0;
                        this.doorTimer = 0;
                        break;
                    }
                    const newFloor = this.currentFloor + moveDir * this.travelSpeed * dt;
                    if ((moveDir > 0 && newFloor >= this.targetFloor) || (moveDir < 0 && newFloor <= this.targetFloor)) {
                        this.currentFloor = this.targetFloor;
                    } else {
                        this.currentFloor = newFloor;
                    }
                    this._updateTargetMoving();
                    if (Math.abs(this.currentFloor - this.targetFloor) < 0.02) {
                        this.currentFloor = this.targetFloor;
                        this.state = 'DOOR_OPENING';
                        this.doorProgress = 0;
                        this.doorTimer = 0;
                    }
                    break;
                }
                case 'DOOR_OPENING':
                    this.doorProgress += dt * this.doorSpeed;
                    if (this.doorProgress >= 1) {
                        this.doorProgress = 1;
                        this.state = 'DOOR_OPEN';
                        this.doorTimer = 0;
                        this._clearServedAtCurrentFloor();
                    }
                    break;
                case 'DOOR_OPEN':
                    this.doorTimer += dt;
                    if (this.doorTimer >= this.maxDoorOpenS) {
                        this.state = 'DOOR_CLOSING';
                    } else if (this.doorTimer >= this.minDoorOpenS) {
                        if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) {
                            this.state = 'DOOR_CLOSING';
                        }
                    }
                    break;
                case 'DOOR_CLOSING':
                    this.doorProgress -= dt * this.doorSpeed;
                    if (this.doorProgress <= 0) {
                        this.doorProgress = 0;
                        this._pickNextTarget();
                        if (this.targetFloor === this.currentFloor) {
                            this.state = 'IDLE';
                            this.direction = 0;
                        } else {
                            this.state = 'MOVING';
                        }
                    }
                    break;
            }
        }

        _updateTargetMoving() {
            if (this.direction === 0) return;
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                const dest = this._findClosestInDir(this.currentFloor, this.direction, [...this.destinations], false);
                if (dest != null && Math.abs(dest - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                    this.targetFloor = dest;
                    return;
                }
            }
            const calls = this.direction > 0 ? this.upCalls : this.downCalls;
            let best = this.targetFloor;
            let bestDist = Math.abs(this.targetFloor - this.currentFloor);
            for (const f of calls) {
                if (this.direction > 0 && f > this.currentFloor && f - this.currentFloor < bestDist) {
                    best = f; bestDist = f - this.currentFloor;
                }
                if (this.direction < 0 && f < this.currentFloor && this.currentFloor - f < bestDist) {
                    best = f; bestDist = this.currentFloor - f;
                }
            }
            this.targetFloor = best;
        }

        reset() {
            this.state = 'IDLE';
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = [false, false, false, false];
            this.doorTimer = 0;
            this.doorProgress = 0;
            this.servedFloors.clear();
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
