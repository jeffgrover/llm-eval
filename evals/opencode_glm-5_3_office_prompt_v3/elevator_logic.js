(function (root) {
    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_OPENING = "DOOR_OPENING";
    const STATE_OPEN = "DOOR_OPEN";
    const STATE_CLOSING = "DOOR_CLOSING";

    class ElevatorLogic {
        constructor(opts) {
            const o = opts || {};
            this.floorCount = o.floorCount !== undefined ? o.floorCount : 6;
            this.maxCapacity = o.maxCapacity !== undefined ? o.maxCapacity : 4;
            this.floorHeight = o.floorHeight !== undefined ? o.floorHeight : 3.4;
            this.speed = o.speed !== undefined ? o.speed : 0.9;
            this.doorTime = o.doorTime !== undefined ? o.doorTime : 1.0;
            this.minOpenTime = o.minOpenTime !== undefined ? o.minOpenTime : 1.5;
            this.maxOpenTime = o.maxOpenTime !== undefined ? o.maxOpenTime : 45;
            this.reopenCooldown = o.reopenCooldown !== undefined ? o.reopenCooldown : 6;
            this.spotCoords = [[-0.65, 0.55], [0.65, 0.55], [-0.65, -0.55], [0.65, -0.55]];
            this.reset();
        }

        reset() {
            this.state = STATE_IDLE;
            this.position = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.upCalls = this.upCalls || new Set();
            this.downCalls = this.downCalls || new Set();
            this.destinations = this.destinations || new Set();
            this.passengers = this.passengers || new Set();
            this.pendingBoarders = this.pendingBoarders || new Set();
            this.pendingDisembark = this.pendingDisembark || new Set();
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = [null, null, null, null];
            this.personSpots = new Map();
            this.doorTimer = 0;
            this.elapsed = 0;
            this.lastServedFloor = -1;
            this.closedAt = -Infinity;
        }

        getDoorOpenness() {
            if (this.state === STATE_OPENING) {
                return Math.max(0, Math.min(1, this.doorTimer / this.doorTime));
            }
            if (this.state === STATE_OPEN) return 1;
            if (this.state === STATE_CLOSING) {
                return Math.max(0, Math.min(1, 1 - this.doorTimer / this.doorTime));
            }
            return 0;
        }

        validFloor(floor) {
            return floor >= 0 && floor < this.floorCount;
        }

        callUp(floor) {
            if (this.validFloor(floor)) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (this.validFloor(floor)) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (this.validFloor(floor)) this.destinations.add(floor);
        }

        hasAnyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0 || this.passengers.size > 0;
        }

        workAhead(dir) {
            if (dir === 0) return this.hasAnyWork();
            for (const f of this.destinations) {
                if ((f - this.currentFloor) * dir > 0) return true;
            }
            if (dir > 0) {
                for (const f of this.upCalls) {
                    if (f > this.currentFloor) return true;
                }
                if (this.upCalls.has(this.currentFloor)) return true;
            } else {
                for (const f of this.downCalls) {
                    if (f < this.currentFloor) return true;
                }
                if (this.downCalls.has(this.currentFloor)) return true;
            }
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== STATE_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (dir === 0 || this.direction === 0) return true;
            if (dir === this.direction) return true;
            return !this.workAhead(this.direction);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            const idx = this.spotOccupancy.indexOf(null);
            if (idx === -1) return null;
            this.spotOccupancy[idx] = person;
            this.personSpots.set(person, idx);
            this.pendingBoarders.add(person);
            const coords = this.spotCoords[idx];
            return { index: idx, x: coords[0], y: 0, z: coords[1] };
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        cancelBoarding(person) {
            this.pendingBoarders.delete(person);
            const idx = this.personSpots.get(person);
            if (idx !== undefined) {
                this.spotOccupancy[idx] = null;
                this.personSpots.delete(person);
            }
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            const idx = this.personSpots.get(person);
            if (idx !== undefined) {
                this.spotOccupancy[idx] = null;
                this.personSpots.delete(person);
            }
        }

        nearestStopInDirection(dir, refFloor) {
            let best = null;
            let bestDist = Infinity;
            const self = this;
            const consider = (f, isHall) => {
                if (isHall && self.currentCapacityFree() <= 0 && !self.destinations.has(f)) return;
                const rel = (f - refFloor) * dir;
                if (rel <= 0) return;
                if (rel < bestDist) {
                    bestDist = rel;
                    best = f;
                }
            };
            for (const f of this.destinations) consider(f, false);
            const calls = dir === 1 ? this.upCalls : this.downCalls;
            for (const f of calls) consider(f, true);
            return best;
        }

        furthestWorkInDirection(dir) {
            let best = null;
            let bestDist = -Infinity;
            const sets = [this.destinations, this.upCalls, this.downCalls];
            for (let s = 0; s < sets.length; s++) {
                for (const f of sets[s]) {
                    const rel = (f - this.currentFloor) * dir;
                    if (rel > 0 && rel > bestDist) {
                        bestDist = rel;
                        best = f;
                    }
                }
            }
            return best;
        }

        beginArrival() {
            this.state = STATE_OPENING;
            this.doorTimer = 0;
            this.targetFloor = this.currentFloor;
            this.destinations.delete(this.currentFloor);
            const d = this.direction;
            if (d === 1) this.upCalls.delete(this.currentFloor);
            else if (d === -1) this.downCalls.delete(this.currentFloor);
            if (!this.workAhead(d)) {
                if (d === 1) this.downCalls.delete(this.currentFloor);
                else if (d === -1) this.upCalls.delete(this.currentFloor);
                else {
                    this.upCalls.delete(this.currentFloor);
                    this.downCalls.delete(this.currentFloor);
                }
            }
            this.lastServedFloor = this.currentFloor;
        }

        pickNextTarget() {
            const cur = this.currentFloor;
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                let best = null;
                for (const f of this.destinations) {
                    if (best === null) {
                        best = f;
                        continue;
                    }
                    if (this.direction !== 0) {
                        const bestAhead = (best - cur) * this.direction > 0;
                        const fAhead = (f - cur) * this.direction > 0;
                        if (fAhead && !bestAhead) {
                            best = f;
                        } else if (fAhead === bestAhead && Math.abs(f - cur) < Math.abs(best - cur)) {
                            best = f;
                        }
                    } else if (Math.abs(f - cur) < Math.abs(best - cur)) {
                        best = f;
                    }
                }
                this.targetFloor = best;
                if (best === cur) {
                    if (this.direction === 0) this.direction = 1;
                    this.beginArrival();
                    return;
                }
                this.direction = best > cur ? 1 : -1;
                this.state = STATE_MOVING;
                return;
            }
            const candidates = [];
            for (const f of this.destinations) candidates.push({ floor: f, kind: "dest" });
            for (const f of this.upCalls) candidates.push({ floor: f, kind: "up" });
            for (const f of this.downCalls) candidates.push({ floor: f, kind: "down" });
            if (candidates.length === 0) {
                this.state = STATE_IDLE;
                return;
            }
            const d = this.direction;
            let choice = null;
            if (d !== 0) {
                for (let i = 0; i < candidates.length; i++) {
                    const c = candidates[i];
                    if (c.floor !== cur) continue;
                    const matching = (d === 1 && c.kind === "up") || (d === -1 && c.kind === "down") || c.kind === "dest";
                    if (matching) {
                        if (this.lastServedFloor !== cur || this.elapsed - this.closedAt >= this.reopenCooldown) {
                            choice = c;
                        }
                        break;
                    }
                }
                if (!choice) {
                    let bestDist = Infinity;
                    for (let i = 0; i < candidates.length; i++) {
                        const c = candidates[i];
                        const rel = (c.floor - cur) * d;
                        if (rel <= 0) continue;
                        const matching = c.kind === "dest" || (d === 1 && c.kind === "up") || (d === -1 && c.kind === "down");
                        if (matching && rel < bestDist) {
                            bestDist = rel;
                            choice = c;
                        }
                    }
                }
                if (!choice) {
                    let bestDist = Infinity;
                    for (let i = 0; i < candidates.length; i++) {
                        const c = candidates[i];
                        const rel = (c.floor - cur) * d;
                        if (rel <= 0) continue;
                        if (rel < bestDist) {
                            bestDist = rel;
                            choice = c;
                        }
                    }
                }
            }
            if (!choice) {
                let bestDist = Infinity;
                for (let i = 0; i < candidates.length; i++) {
                    const c = candidates[i];
                    if (c.floor === cur) {
                        if (this.lastServedFloor !== cur || this.elapsed - this.closedAt >= this.reopenCooldown) {
                            choice = c;
                            bestDist = 0;
                        }
                        continue;
                    }
                    const rel = Math.abs(c.floor - cur);
                    if (rel < bestDist) {
                        bestDist = rel;
                        choice = c;
                    }
                }
            }
            if (!choice) {
                this.state = STATE_IDLE;
                return;
            }
            if (choice.floor === cur) {
                if (choice.kind === "down") this.direction = -1;
                else this.direction = 1;
                this.beginArrival();
                return;
            }
            this.targetFloor = choice.floor;
            this.direction = choice.floor > cur ? 1 : -1;
            this.state = STATE_MOVING;
        }

        stepIdle() {
            if (this.hasAnyWork()) this.pickNextTarget();
        }

        stepMoving(dt) {
            if (this.direction !== 0) {
                const closer = this.nearestStopInDirection(this.direction, this.position);
                if (closer !== null && closer !== this.targetFloor && (closer - this.targetFloor) * this.direction < 0) {
                    this.targetFloor = closer;
                }
            }
            const travel = this.speed * dt;
            const remaining = Math.abs(this.targetFloor - this.position);
            if (travel >= remaining) {
                this.position = this.targetFloor;
                this.currentFloor = this.targetFloor;
                this.beginArrival();
            } else {
                this.position += this.direction * travel;
            }
        }

        stepOpening(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.doorTime) {
                this.state = STATE_OPEN;
                this.doorTimer = 0;
            }
        }

        stepOpen(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.maxOpenTime) {
                this.state = STATE_CLOSING;
                this.doorTimer = 0;
                return;
            }
            const held = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
            if (!held && this.doorTimer >= this.minOpenTime) {
                this.state = STATE_CLOSING;
                this.doorTimer = 0;
            }
        }

        stepClosing(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.doorTime) {
                this.closedAt = this.elapsed;
                this.pickNextTarget();
            }
        }

        tick(dt) {
            let remaining = Math.max(0, dt);
            let guard = 0;
            while (remaining > 0.000000001 && guard < 4000) {
                guard += 1;
                const step = Math.min(remaining, 0.2);
                this.elapsed += step;
                if (this.state === STATE_IDLE) this.stepIdle();
                else if (this.state === STATE_MOVING) this.stepMoving(step);
                else if (this.state === STATE_OPENING) this.stepOpening(step);
                else if (this.state === STATE_OPEN) this.stepOpen(step);
                else if (this.state === STATE_CLOSING) this.stepClosing(step);
                remaining -= step;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
