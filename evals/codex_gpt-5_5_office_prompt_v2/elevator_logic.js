(function(root) {
    "use strict";

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;
            this.speed = opts.speed || 1.7;
            this.DOOR_OPENING_S = opts.doorOpeningS || 1.0;
            this.DOOR_CLOSING_S = opts.doorClosingS || 1.0;
            this.MIN_DOOR_OPEN_S = opts.minDoorOpenS || 1.8;
            this.MAX_DOOR_OPEN_S = opts.maxDoorOpenS || 7.0;
            this.spots = [
                { index: 0, x: -0.65, y: 0, z: 0.35 },
                { index: 1, x: 0.65, y: 0, z: 0.35 },
                { index: 2, x: -0.65, y: 0, z: -0.55 },
                { index: 3, x: 0.65, y: 0, z: -0.55 }
            ];
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.positionY = 0;
            this.targetFloor = null;
            this.doorTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Map();
            this.personSpot = new Map();
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
        }

        clampFloor(floor) {
            return Math.max(0, Math.min(this.floorCount - 1, Math.round(floor)));
        }

        callUp(floor) {
            floor = this.clampFloor(floor);
            if (floor < this.floorCount - 1) this.upCalls.add(floor);
            this.ensureRunning();
        }

        callDown(floor) {
            floor = this.clampFloor(floor);
            if (floor > 0) this.downCalls.add(floor);
            this.ensureRunning();
        }

        pressDestination(floor) {
            floor = this.clampFloor(floor);
            if (floor !== this.currentFloor || this.state !== "DOOR_OPEN") {
                this.destinations.add(floor);
            }
            this.ensureRunning();
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            floor = this.clampFloor(floor);
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction === 0) return true;
            if (!this.hasStopsAhead(this.direction)) return true;
            return direction === this.direction;
        }

        reserveBoardingSpot(person) {
            if (this.pendingBoarders.has(person) || this.passengers.has(person)) {
                return this.personSpot.get(person) || null;
            }
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spots.length; i++) {
                const spot = this.spots[i];
                if (!this.spotOccupancy.has(spot.index)) {
                    this.spotOccupancy.set(spot.index, person);
                    this.personSpot.set(person, spot);
                    this.pendingBoarders.add(person);
                    return { index: spot.index, x: spot.x, y: spot.y, z: spot.z };
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

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.passengers.delete(person);
                this.pendingDisembark.add(person);
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            const spot = this.personSpot.get(person);
            if (spot) this.spotOccupancy.delete(spot.index);
            this.personSpot.delete(person);
        }

        ensureRunning() {
            if (this.state !== "IDLE") return;
            const next = this.pickNextTarget();
            if (next !== null && next !== undefined) this.startMovingTo(next);
        }

        startMovingTo(floor) {
            floor = this.clampFloor(floor);
            if (floor === this.currentFloor) {
                if (this.canOpenForSameFloor()) {
                    this.state = "DOOR_OPENING";
                    this.targetFloor = floor;
                    this.doorTimer = 0;
                }
                return;
            }
            this.targetFloor = floor;
            this.direction = floor > this.currentFloor ? 1 : -1;
            this.state = "MOVING";
        }

        canOpenForSameFloor() {
            if (this.passengers.size > 0 && this.destinations.size > 0) return false;
            if (this.servedThisDoorCycle && this.lastServedFloor === this.currentFloor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            return this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor) || this.destinations.has(this.currentFloor);
        }

        hasStopsAhead(dir) {
            const f = this.currentFloor;
            const ahead = (x) => dir > 0 ? x > f : x < f;
            for (const d of this.destinations) if (ahead(d)) return true;
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const c of calls) if (ahead(c)) return true;
            return false;
        }

        nearestInDirection(set, dir, includeSame) {
            let best = null, bestDist = Infinity;
            for (const floor of set) {
                const delta = floor - this.currentFloor;
                if ((includeSame && delta === 0) || (dir > 0 && delta > 0) || (dir < 0 && delta < 0)) {
                    const dist = Math.abs(delta);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = floor;
                    }
                }
            }
            return best;
        }

        nearestAny() {
            const all = [];
            this.destinations.forEach(f => all.push({ f, rank: 0 }));
            this.upCalls.forEach(f => all.push({ f, rank: 1 }));
            this.downCalls.forEach(f => all.push({ f, rank: 1 }));
            let best = null, bestDist = Infinity, bestRank = Infinity;
            for (const item of all) {
                if (item.f === this.currentFloor && !this.canOpenForSameFloor()) continue;
                const dist = Math.abs(item.f - this.currentFloor);
                if (dist < bestDist || (dist === bestDist && item.rank < bestRank)) {
                    bestDist = dist;
                    bestRank = item.rank;
                    best = item.f;
                }
            }
            return best;
        }

        pickNextTarget() {
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                const dir = this.direction || this.inferDirectionFromDestinations();
                const primary = this.nearestInDirection(this.destinations, dir, false);
                if (primary !== null) return primary;
                const opposite = this.nearestInDirection(this.destinations, -dir, false);
                if (opposite !== null) return opposite;
                const same = this.nearestInDirection(this.destinations, dir || 1, true);
                if (same !== null && this.canOpenForSameFloor()) return same;
            }

            if (this.direction !== 0) {
                const dirCalls = this.direction > 0 ? this.upCalls : this.downCalls;
                let best = this.nearestInDirection(this.destinations, this.direction, false);
                const call = this.nearestInDirection(dirCalls, this.direction, false);
                if (best === null || (call !== null && Math.abs(call - this.currentFloor) < Math.abs(best - this.currentFloor))) best = call;
                if (best !== null) return best;

                const otherDir = -this.direction;
                const otherCalls = otherDir > 0 ? this.upCalls : this.downCalls;
                best = this.nearestInDirection(this.destinations, otherDir, false);
                const otherCall = this.nearestInDirection(otherCalls, otherDir, false);
                if (best === null || (otherCall !== null && Math.abs(otherCall - this.currentFloor) < Math.abs(best - this.currentFloor))) best = otherCall;
                if (best !== null) {
                    this.direction = otherDir;
                    return best;
                }
            }

            const sameFloorDest = this.destinations.has(this.currentFloor);
            if (sameFloorDest && this.canOpenForSameFloor()) return this.currentFloor;
            const any = this.nearestAny();
            if (any !== null && any !== undefined) {
                if (any !== this.currentFloor) this.direction = any > this.currentFloor ? 1 : -1;
                return any;
            }
            return null;
        }

        inferDirectionFromDestinations() {
            let up = Infinity, down = Infinity;
            for (const d of this.destinations) {
                if (d > this.currentFloor) up = Math.min(up, d - this.currentFloor);
                if (d < this.currentFloor) down = Math.min(down, this.currentFloor - d);
            }
            if (up < down) return 1;
            if (down < up) return -1;
            return this.direction || 1;
        }

        reevaluateMovingTarget() {
            if (this.direction === 0 || this.targetFloor === null) return;
            const dirCalls = this.direction > 0 ? this.upCalls : this.downCalls;
            let best = this.nearestInDirection(this.destinations, this.direction, false);
            const call = this.nearestInDirection(dirCalls, this.direction, false);
            if (best === null || (call !== null && Math.abs(call - this.currentFloor) < Math.abs(best - this.currentFloor))) best = call;
            if (best !== null && Math.abs(best - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                this.targetFloor = best;
            }
        }

        arriveAtFloor(floor) {
            this.currentFloor = this.clampFloor(floor);
            this.positionY = this.currentFloor * this.floorHeight;
            this.targetFloor = this.currentFloor;
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) this.upCalls.delete(this.currentFloor);
            if (this.direction < 0) this.downCalls.delete(this.currentFloor);
            if (!this.hasStopsAhead(this.direction)) {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this.state = "DOOR_OPENING";
            this.doorTimer = 0;
        }

        tick(dt) {
            dt = Math.max(0, dt || 0);
            if (this.state === "IDLE") {
                const next = this.pickNextTarget();
                if (next !== null && next !== undefined) this.startMovingTo(next);
                return;
            }
            if (this.state === "MOVING") {
                this.reevaluateMovingTarget();
                const targetY = (this.targetFloor || 0) * this.floorHeight;
                const step = this.speed * dt * this.direction;
                if ((this.direction > 0 && this.positionY + step >= targetY) || (this.direction < 0 && this.positionY + step <= targetY)) {
                    this.arriveAtFloor(this.targetFloor);
                } else {
                    this.positionY += step;
                    this.currentFloor = Math.round(this.positionY / this.floorHeight);
                }
                return;
            }
            if (this.state === "DOOR_OPENING") {
                this.doorTimer += dt;
                if (this.doorTimer >= this.DOOR_OPENING_S) {
                    this.state = "DOOR_OPEN";
                    this.doorTimer = 0;
                }
                return;
            }
            if (this.state === "DOOR_OPEN") {
                this.doorTimer += dt;
                const waiting = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                if ((!waiting && this.doorTimer >= this.MIN_DOOR_OPEN_S) || this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                    this.state = "DOOR_CLOSING";
                    this.doorTimer = 0;
                }
                return;
            }
            if (this.state === "DOOR_CLOSING") {
                this.doorTimer += dt;
                if (this.doorTimer >= this.DOOR_CLOSING_S) {
                    this.doorTimer = 0;
                    const next = this.pickNextTarget();
                    if (next !== null && next !== undefined) {
                        if (next === this.currentFloor && this.canOpenForSameFloor()) {
                            this.state = "DOOR_OPENING";
                        } else if (next !== this.currentFloor) {
                            this.servedThisDoorCycle = false;
                            this.startMovingTo(next);
                        } else {
                            this.state = "IDLE";
                            this.direction = 0;
                            this.targetFloor = null;
                        }
                    } else {
                        this.state = "IDLE";
                        this.direction = 0;
                        this.targetFloor = null;
                        this.servedThisDoorCycle = false;
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
