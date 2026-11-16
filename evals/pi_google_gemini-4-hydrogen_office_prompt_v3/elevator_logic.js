(function (root) {
    const SPOTS = [
        { index: 0, x: -0.65, y: 0, z: -0.55 },
        { index: 1, x:  0.65, y: 0, z: -0.55 },
        { index: 2, x: -0.65, y: 0, z:  0.35 },
        { index: 3, x:  0.65, y: 0, z:  0.35 }
    ];

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;

            this.SPEED = 3.4;
            this.DOOR_ANIM_S = 0.5;
            this.MIN_DOOR_OPEN_S = 1.2;
            this.MAX_DOOR_OPEN_S = 8.0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotAssignments = new Map();
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);

            this.reset();
        }

        reset() {
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotAssignments.clear();
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);

            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.carY = 0;
            this.targetFloor = 0;
            this.doorProgress = 0;
            this.doorTimer = 0;
            this.lastServedFloor = null;
            this.servedThisDoorCycle = false;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.destinations.add(floor);
            }
        }

        currentCapacityFree() {
            return Math.max(0, this.maxCapacity - (this.passengers.size + this.pendingBoarders.size));
        }

        hasWorkAbove(floor) {
            for (const d of this.destinations) {
                if (d > floor) return true;
            }
            for (const u of this.upCalls) {
                if (u > floor) return true;
            }
            for (const dn of this.downCalls) {
                if (dn > floor) return true;
            }
            return false;
        }

        hasWorkBelow(floor) {
            for (const d of this.destinations) {
                if (d < floor) return true;
            }
            for (const u of this.upCalls) {
                if (u < floor) return true;
            }
            for (const dn of this.downCalls) {
                if (dn < floor) return true;
            }
            return false;
        }

        hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) {
                return false;
            }
            if (this.direction === 0) return true;
            if (dir === this.direction) return true;
            if (this.direction > 0 && !this.hasWorkAbove(floor) && this.destinations.size === 0) {
                return true;
            }
            if (this.direction < 0 && !this.hasWorkBelow(floor) && this.destinations.size === 0) {
                return true;
            }
            return false;
        }

        reserveBoardingSpot(person) {
            if (this.spotAssignments.has(person)) {
                const idx = this.spotAssignments.get(person);
                const s = SPOTS[idx % SPOTS.length];
                return { index: idx, x: s.x, y: s.y, z: s.z };
            }
            if (this.currentCapacityFree() <= 0) {
                return null;
            }
            let freeIdx = -1;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    freeIdx = i;
                    break;
                }
            }
            if (freeIdx === -1) return null;

            this.spotOccupancy[freeIdx] = person;
            this.spotAssignments.set(person, freeIdx);
            this.pendingBoarders.add(person);
            const s = SPOTS[freeIdx % SPOTS.length];
            return { index: freeIdx, x: s.x, y: s.y, z: s.z };
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
            if (this.spotAssignments.has(person)) {
                const idx = this.spotAssignments.get(person);
                this.spotAssignments.delete(person);
                if (idx >= 0 && idx < this.spotOccupancy.length && this.spotOccupancy[idx] === person) {
                    this.spotOccupancy[idx] = null;
                }
            }
        }

        _findBestInDir(fromFloor, dir) {
            if (dir > 0) {
                let bestSame = Infinity;
                for (const d of this.destinations) {
                    if (d > fromFloor && d < bestSame) bestSame = d;
                }
                for (const u of this.upCalls) {
                    if (u > fromFloor && u < bestSame) bestSame = u;
                }
                if (bestSame !== Infinity) return bestSame;

                let highestOpp = -Infinity;
                for (const dn of this.downCalls) {
                    if (dn > fromFloor && dn > highestOpp) highestOpp = dn;
                }
                return highestOpp !== -Infinity ? highestOpp : null;
            }
            if (dir < 0) {
                let bestSame = -Infinity;
                for (const d of this.destinations) {
                    if (d < fromFloor && d > bestSame) bestSame = d;
                }
                for (const dn of this.downCalls) {
                    if (dn < fromFloor && dn > bestSame) bestSame = dn;
                }
                if (bestSame !== -Infinity) return bestSame;

                let lowestOpp = Infinity;
                for (const u of this.upCalls) {
                    if (u < fromFloor && u < lowestOpp) lowestOpp = u;
                }
                return lowestOpp !== Infinity ? lowestOpp : null;
            }
            return null;
        }

        _pickNextTarget(fromDoorClose) {
            if (!this.hasAnyWork()) {
                this.direction = 0;
                this.targetFloor = this.currentFloor;
                return null;
            }

            const hasRiderWork = this.passengers.size > 0 && this.destinations.size > 0;

            if (this.direction > 0) {
                const upTarget = this._findBestInDir(this.currentFloor, 1);
                if (upTarget !== null) {
                    this.targetFloor = upTarget;
                    return upTarget;
                }
                const downTarget = this._findBestInDir(this.currentFloor, -1);
                if (downTarget !== null) {
                    this.direction = -1;
                    this.targetFloor = downTarget;
                    return downTarget;
                }
            } else if (this.direction < 0) {
                const downTarget = this._findBestInDir(this.currentFloor, -1);
                if (downTarget !== null) {
                    this.targetFloor = downTarget;
                    return downTarget;
                }
                const upTarget = this._findBestInDir(this.currentFloor, 1);
                if (upTarget !== null) {
                    this.direction = 1;
                    this.targetFloor = upTarget;
                    return upTarget;
                }
            } else {
                // Idle / direction 0: find nearest floor
                let nearest = null;
                let bestDist = Infinity;
                const consider = (f) => {
                    if ((fromDoorClose || hasRiderWork) && f === this.currentFloor) return;
                    const dist = Math.abs(f - this.currentFloor);
                    if (dist < bestDist) {
                        bestDist = dist;
                        nearest = f;
                    }
                };
                for (const d of this.destinations) consider(d);
                for (const u of this.upCalls) consider(u);
                for (const dn of this.downCalls) consider(dn);

                if (nearest !== null) {
                    if (nearest > this.currentFloor) this.direction = 1;
                    else if (nearest < this.currentFloor) this.direction = -1;
                    this.targetFloor = nearest;
                    return nearest;
                }
            }

            // Fallback: only current-floor hall call exists and no riders with destinations
            if (!hasRiderWork && !fromDoorClose) {
                if (this.upCalls.has(this.currentFloor)) {
                    this.direction = 1;
                    this.targetFloor = this.currentFloor;
                    return this.currentFloor;
                }
                if (this.downCalls.has(this.currentFloor)) {
                    this.direction = -1;
                    this.targetFloor = this.currentFloor;
                    return this.currentFloor;
                }
            }

            this.direction = 0;
            this.targetFloor = this.currentFloor;
            return null;
        }

        _onDoorsOpenedAtCurrentFloor() {
            const f = this.currentFloor;
            this.destinations.delete(f);

            if (this.direction > 0) {
                this.upCalls.delete(f);
                if (!this.hasWorkAbove(f) && this.destinations.size === 0) {
                    if (this.downCalls.has(f)) {
                        this.downCalls.delete(f);
                        this.direction = this.hasWorkBelow(f) ? -1 : 0;
                    } else if (!this.hasWorkBelow(f)) {
                        this.direction = 0;
                    }
                }
            } else if (this.direction < 0) {
                this.downCalls.delete(f);
                if (!this.hasWorkBelow(f) && this.destinations.size === 0) {
                    if (this.upCalls.has(f)) {
                        this.upCalls.delete(f);
                        this.direction = this.hasWorkAbove(f) ? 1 : 0;
                    } else if (!this.hasWorkAbove(f)) {
                        this.direction = 0;
                    }
                }
            } else {
                const hadUp = this.upCalls.has(f);
                const hadDown = this.downCalls.has(f);
                this.upCalls.delete(f);
                this.downCalls.delete(f);
                if (hadUp && !hadDown) this.direction = 1;
                else if (hadDown && !hadUp) this.direction = -1;
            }

            this.servedThisDoorCycle = true;
            this.lastServedFloor = f;
        }

        _reevaluateMovingTarget() {
            const fNow = this.carY / this.floorHeight;
            if (this.direction > 0) {
                for (const d of this.destinations) {
                    if (d > fNow + 0.05 && d < this.targetFloor) {
                        this.targetFloor = d;
                    }
                }
                for (const u of this.upCalls) {
                    if (u > fNow + 0.05 && u < this.targetFloor) {
                        this.targetFloor = u;
                    }
                }
            } else if (this.direction < 0) {
                for (const d of this.destinations) {
                    if (d < fNow - 0.05 && d > this.targetFloor) {
                        this.targetFloor = d;
                    }
                }
                for (const dn of this.downCalls) {
                    if (dn < fNow - 0.05 && dn > this.targetFloor) {
                        this.targetFloor = dn;
                    }
                }
            }
        }

        tick(dt) {
            if (!dt || dt <= 0) return;

            if (this.state === "IDLE") {
                this.servedThisDoorCycle = false;
                const next = this._pickNextTarget(false);
                if (next !== null) {
                    if (next === this.currentFloor) {
                        if (this.direction === 0) {
                            if (this.upCalls.has(this.currentFloor)) this.direction = 1;
                            else if (this.downCalls.has(this.currentFloor)) this.direction = -1;
                        }
                        this.state = "DOOR_OPENING";
                        this.doorTimer = 0;
                    } else {
                        this.state = "MOVING";
                    }
                }
            } else if (this.state === "MOVING") {
                this._reevaluateMovingTarget();
                const targetY = this.targetFloor * this.floorHeight;
                const diff = targetY - this.carY;
                const step = this.SPEED * dt;
                if (Math.abs(diff) <= step) {
                    this.carY = targetY;
                    this.currentFloor = this.targetFloor;
                    this.state = "DOOR_OPENING";
                    this.doorTimer = 0;
                    this.servedThisDoorCycle = false;
                } else {
                    this.carY += Math.sign(diff) * step;
                    this.currentFloor = Math.round(this.carY / this.floorHeight);
                }
            } else if (this.state === "DOOR_OPENING") {
                this.doorProgress += dt / this.DOOR_ANIM_S;
                if (this.doorProgress >= 1) {
                    this.doorProgress = 1;
                    this.state = "DOOR_OPEN";
                    this.doorTimer = 0;
                    this._onDoorsOpenedAtCurrentFloor();
                }
            } else if (this.state === "DOOR_OPEN") {
                this.doorTimer += dt;
                const noPending = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                if (this.doorTimer >= this.MAX_DOOR_OPEN_S || (this.doorTimer >= this.MIN_DOOR_OPEN_S && noPending)) {
                    this.state = "DOOR_CLOSING";
                }
            } else if (this.state === "DOOR_CLOSING") {
                this.doorProgress -= dt / this.DOOR_ANIM_S;
                if (this.doorProgress <= 0) {
                    this.doorProgress = 0;
                    const next = this._pickNextTarget(true);
                    if (next !== null && next !== this.currentFloor) {
                        this.state = "MOVING";
                    } else {
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
