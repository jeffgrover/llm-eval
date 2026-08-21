(function (root) {
    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;
            this.carSpeed = opts.carSpeed !== undefined ? opts.carSpeed : 2.0;
            this.minDoorOpenS = 1.2;
            this.maxDoorOpenS = 6.0;
            this.doorTransitS = 0.8;
            this.interiorSpots = [
                [-0.62, 0, -0.55],
                [0.62, 0, -0.55],
                [-0.62, 0, 0.35],
                [0.62, 0, 0.35]
            ];
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.carY = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.personSpot = new Map();
            this.doorTimer = 0;
            this.doorProgress = 0;
            this.lastServedFloor = -1;
            this.servedThisDoorCycle = new Set();
        }

        callUp(floor) {
            this.upCalls.add(floor);
        }

        callDown(floor) {
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (direction === this.direction) return true;
            return !this.hasWorkBeyond(floor, this.direction);
        }

        hasWorkBeyond(floor, direction) {
            if (direction === 0) {
                return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
            }
            for (const f of this.destinations) {
                if (direction > 0 ? f > floor : f < floor) return true;
            }
            if (direction > 0) {
                for (const f of this.upCalls) {
                    if (f > floor) return true;
                }
            } else {
                for (const f of this.downCalls) {
                    if (f < floor) return true;
                }
            }
            return false;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.personSpot.set(person, i);
                    this.pendingBoarders.add(person);
                    const p = this.interiorSpots[i];
                    return { index: i, x: p[0], y: p[1], z: p[2] };
                }
            }
            return null;
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            const spot = this.personSpot.get(person);
            if (spot !== undefined) {
                this.spotOccupancy[spot] = null;
                this.personSpot.delete(person);
            }
        }

        stopsAheadNearest(direction) {
            let best = null;
            const cur = this.currentFloor;
            const consider = function (f) {
                if (direction > 0 ? f > cur : f < cur) {
                    if (best === null || Math.abs(f - cur) < Math.abs(best - cur)) best = f;
                }
            };
            for (const f of this.destinations) consider(f);
            if (direction > 0) {
                for (const f of this.upCalls) consider(f);
            } else if (direction < 0) {
                for (const f of this.downCalls) consider(f);
            }
            return best;
        }

        anyStopNearest(direction) {
            let best = null;
            const cur = this.currentFloor;
            const consider = function (f) {
                if (direction > 0 ? f > cur : f < cur) {
                    if (best === null || Math.abs(f - cur) < Math.abs(best - cur)) best = f;
                }
            };
            for (const f of this.destinations) consider(f);
            for (const f of this.upCalls) consider(f);
            for (const f of this.downCalls) consider(f);
            return best;
        }

        nearestAnyStop() {
            let best = null;
            const cur = this.currentFloor;
            const consider = function (f) {
                if (best === null || Math.abs(f - cur) < Math.abs(best - cur)) best = f;
            };
            for (const f of this.destinations) consider(f);
            for (const f of this.upCalls) consider(f);
            for (const f of this.downCalls) consider(f);
            return best;
        }

        hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        beginArrival() {
            const f = this.currentFloor;
            this.destinations.delete(f);
            if (this.direction === 1) {
                this.upCalls.delete(f);
                if (this.stopsAheadNearest(1) === null) this.downCalls.delete(f);
            } else if (this.direction === -1) {
                this.downCalls.delete(f);
                if (this.stopsAheadNearest(-1) === null) this.upCalls.delete(f);
            } else {
                if (this.upCalls.has(f) && this.downCalls.has(f)) {
                    this.upCalls.delete(f);
                } else if (this.upCalls.has(f)) {
                    this.upCalls.delete(f);
                } else if (this.downCalls.has(f)) {
                    this.downCalls.delete(f);
                }
            }
            this.state = "DOOR_OPENING";
            this.doorTimer = 0;
        }

        shortenTarget() {
            if (this.state !== "MOVING" || this.direction === 0) return;
            const ahead = this.stopsAheadNearest(this.direction);
            if (ahead !== null && ahead !== this.targetFloor) {
                const curDist = Math.abs(this.targetFloor - this.currentFloor);
                const newDist = Math.abs(ahead - this.currentFloor);
                if (newDist < curDist) this.targetFloor = ahead;
            }
        }

        pickNextTarget() {
            const cur = this.currentFloor;
            const hasRiders = this.passengers.size > 0;
            const hasDests = this.destinations.size > 0;
            if (this.direction !== 0) {
                const ahead = this.stopsAheadNearest(this.direction);
                if (ahead !== null) {
                    this.targetFloor = ahead;
                    this.state = "MOVING";
                    return;
                }
                const behind = this.anyStopNearest(-this.direction);
                if (behind !== null) {
                    this.direction = -this.direction;
                    this.targetFloor = behind;
                    this.state = "MOVING";
                    return;
                }
                const sameFloorCall = this.upCalls.has(cur) || this.downCalls.has(cur);
                const blocked = (hasRiders && hasDests) || (this.lastServedFloor === cur && hasDests);
                if (sameFloorCall && !blocked) {
                    this.direction = this.upCalls.has(cur) ? 1 : -1;
                    this.targetFloor = cur;
                    this.beginArrival();
                    return;
                }
                this.direction = 0;
                this.targetFloor = cur;
                this.state = "IDLE";
                return;
            }
            const near = this.nearestAnyStop();
            if (near === null) {
                this.targetFloor = cur;
                this.state = "IDLE";
                return;
            }
            if (near === cur) {
                this.direction = this.upCalls.has(cur) ? 1 : (this.downCalls.has(cur) ? -1 : 0);
                this.targetFloor = cur;
                this.beginArrival();
                return;
            }
            this.direction = near > cur ? 1 : -1;
            this.targetFloor = near;
            this.state = "MOVING";
        }

        finishDoorCycle() {
            const stale = Array.from(this.pendingBoarders);
            for (const p of stale) {
                const spot = this.personSpot.get(p);
                if (spot !== undefined) {
                    this.spotOccupancy[spot] = null;
                    this.personSpot.delete(p);
                }
            }
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.lastServedFloor = this.currentFloor;
            this.servedThisDoorCycle.add(this.currentFloor);
            this.pickNextTarget();
        }

        tick(dt) {
            if (!(dt > 0)) return;
            let remaining = dt;
            let guard = 0;
            while (remaining > 0.000000001 && guard < 12) {
                guard += 1;
                if (this.state === "IDLE") {
                    if (!this.hasAnyWork()) {
                        remaining = 0;
                        break;
                    }
                    this.pickNextTarget();
                    if (this.state === "IDLE") {
                        remaining = 0;
                        break;
                    }
                    continue;
                }
                if (this.state === "MOVING") {
                    this.shortenTarget();
                    const targetY = this.targetFloor * this.floorHeight;
                    const dy = targetY - this.carY;
                    if (Math.abs(dy) < 0.000000001) {
                        this.currentFloor = this.targetFloor;
                        this.beginArrival();
                        continue;
                    }
                    const travel = Math.abs(dy);
                    const step = this.carSpeed * remaining;
                    if (step >= travel) {
                        this.carY = targetY;
                        this.currentFloor = this.targetFloor;
                        remaining -= travel / this.carSpeed;
                        this.beginArrival();
                    } else {
                        this.carY += (dy > 0 ? 1 : -1) * step;
                        remaining = 0;
                    }
                    continue;
                }
                if (this.state === "DOOR_OPENING") {
                    const need = (1 - this.doorProgress) * this.doorTransitS;
                    if (remaining >= need) {
                        remaining -= need;
                        this.doorProgress = 1;
                        this.doorTimer = 0;
                        this.state = "DOOR_OPEN";
                        remaining = 0;
                    } else {
                        this.doorProgress += remaining / this.doorTransitS;
                        remaining = 0;
                    }
                    continue;
                }
                if (this.state === "DOOR_OPEN") {
                    this.doorTimer += remaining;
                    remaining = 0;
                    const held = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    const minDone = this.doorTimer >= this.minDoorOpenS;
                    const maxDone = this.doorTimer >= this.maxDoorOpenS;
                    if ((!held && minDone) || maxDone) {
                        this.state = "DOOR_CLOSING";
                    }
                    continue;
                }
                if (this.state === "DOOR_CLOSING") {
                    const need = this.doorProgress * this.doorTransitS;
                    if (remaining >= need) {
                        remaining -= need;
                        this.doorProgress = 0;
                        this.finishDoorCycle();
                    } else {
                        this.doorProgress -= remaining / this.doorTransitS;
                        remaining = 0;
                    }
                    continue;
                }
                remaining = 0;
            }
        }
    }
    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
