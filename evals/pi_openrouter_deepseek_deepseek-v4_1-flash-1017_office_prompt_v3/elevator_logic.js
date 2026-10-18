/* elevator_logic.js - pure, deterministic elevator scheduler (no DOM / Three.js). */
(function (root) {
    "use strict";

    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_OPENING = "DOOR_OPENING";
    const STATE_OPEN = "DOOR_OPEN";
    const STATE_CLOSING = "DOOR_CLOSING";

    const MIN_DOOR_OPEN_S = 3.0;
    const MAX_DOOR_OPEN_S = 18.0;
    const DOOR_OPEN_TIME = 1.2;
    const DOOR_CLOSE_TIME = 1.0;
    const FLOOR_TRAVEL_SPEED = 2.6;

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;
            this.spotCount = Math.min(4, this.maxCapacity);
            this.minDoorOpenS = opts.minDoorOpenS !== undefined ? opts.minDoorOpenS : MIN_DOOR_OPEN_S;
            this.maxDoorOpenS = opts.maxDoorOpenS !== undefined ? opts.maxDoorOpenS : MAX_DOOR_OPEN_S;
            this.doorOpenTime = opts.doorOpenTime !== undefined ? opts.doorOpenTime : DOOR_OPEN_TIME;
            this.doorCloseTime = opts.doorCloseTime !== undefined ? opts.doorCloseTime : DOOR_CLOSE_TIME;
            this.travelSpeed = opts.travelSpeed !== undefined ? opts.travelSpeed : FLOOR_TRAVEL_SPEED;
            this.reset();
        }

        reset() {
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(this.spotCount).fill(null);
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.carY = 0;
            this.state = STATE_IDLE;
            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
        }

        callUp(floor) {
            if (!Number.isFinite(floor)) return;
            const f = Math.round(floor);
            if (f < 0 || f >= this.floorCount) return;
            this.upCalls.add(f);
        }

        callDown(floor) {
            if (!Number.isFinite(floor)) return;
            const f = Math.round(floor);
            if (f < 0 || f >= this.floorCount) return;
            this.downCalls.add(f);
        }

        pressDestination(floor) {
            if (!Number.isFinite(floor)) return;
            const f = Math.round(floor);
            if (f < 0 || f >= this.floorCount) return;
            this.destinations.add(f);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let freeIndex = -1;
            for (let i = 0; i < this.spotCount; i += 1) {
                if (this.spotOccupancy[i] === null || this.spotOccupancy[i] === undefined) {
                    freeIndex = i;
                    break;
                }
            }
            if (freeIndex < 0) return null;
            const spots = [
                { x: -0.58, y: 0, z: 0.56 },
                { x: 0.58, y: 0, z: 0.56 },
                { x: -0.58, y: 0, z: -0.56 },
                { x: 0.58, y: 0, z: -0.56 }
            ];
            const base = spots[freeIndex];
            const spot = { index: freeIndex, x: base.x, y: base.y, z: base.z };
            this.spotOccupancy[freeIndex] = person;
            this.pendingBoarders.set(person, spot);
            return spot;
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
                return true;
            }
            if (this.currentCapacityFree() > 0) {
                this.passengers.add(person);
                return true;
            }
            return false;
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.passengers.delete(person);
            this.pendingDisembark.delete(person);
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        _hasStopsAhead(direction) {
            if (direction === 0) return false;
            const current = this.currentFloor;
            for (const floor of this.destinations) {
                if (direction > 0 && floor > current) return true;
                if (direction < 0 && floor < current) return true;
            }
            const calls = direction > 0 ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                if (direction > 0 && floor > current) return true;
                if (direction < 0 && floor < current) return true;
            }
            return false;
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE_OPEN || this.currentFloor !== floor) return false;
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            return !this._hasStopsAhead(this.direction);
        }

        _candidates() {
            const list = [];
            for (const floor of this.destinations) {
                list.push({ floor: floor, kind: "dest" });
            }
            for (const floor of this.upCalls) {
                list.push({ floor: floor, kind: "up" });
            }
            for (const floor of this.downCalls) {
                list.push({ floor: floor, kind: "down" });
            }
            return list;
        }

        _nearest(list, current) {
            let best = null;
            let bestDist = Infinity;
            for (let i = 0; i < list.length; i += 1) {
                const item = list[i];
                const dist = Math.abs(item.floor - current);
                if (dist < bestDist || (dist === bestDist && item.kind === "dest" && best && best.kind !== "dest")) {
                    best = item;
                    bestDist = dist;
                }
            }
            return best;
        }

        _setTarget(floor, kind) {
            this.targetFloor = floor;
            if (floor > this.currentFloor) this.direction = 1;
            else if (floor < this.currentFloor) this.direction = -1;
            else if (kind === "up") this.direction = 1;
            else if (kind === "down") this.direction = -1;

            if (floor === this.currentFloor) {
                this.state = STATE_OPENING;
                this.doorTimer = 0;
            } else {
                this.state = STATE_MOVING;
            }
        }

        _pickNextTarget() {
            const current = this.currentFloor;
            const all = this._candidates();
            if (!all.length) {
                this.direction = 0;
                this.targetFloor = current;
                this.state = STATE_IDLE;
                return;
            }

            const dests = all.filter(function (item) { return item.kind === "dest"; });

            // Riders already inside outrank hall calls at the current floor, but
            // matching-direction hall calls ahead are still served along the way
            // (otherwise a rider going to the lobby can starve every down call).
            if (this.passengers.size > 0 && dests.length > 0) {
                const canTakeHall = this.currentCapacityFree() > 0;
                let ahead = [];
                if (this.direction > 0) {
                    ahead = all.filter(function (item) {
                        return item.floor > current &&
                            (item.kind === "dest" || (canTakeHall && item.kind === "up"));
                    });
                } else if (this.direction < 0) {
                    ahead = all.filter(function (item) {
                        return item.floor < current &&
                            (item.kind === "dest" || (canTakeHall && item.kind === "down"));
                    });
                } else {
                    ahead = dests;
                }
                if (!ahead.length) ahead = dests;
                const choice = this._nearest(ahead, current);
                this._setTarget(choice.floor, choice.kind);
                return;
            }

            let pool = all;
            if (this.direction !== 0) {
                const dir = this.direction;
                const ahead = all.filter(function (item) {
                    if (dir > 0 && item.floor <= current) return false;
                    if (dir < 0 && item.floor >= current) return false;
                    if (item.kind === "dest") return true;
                    return dir > 0 ? item.kind === "up" : item.kind === "down";
                });
                if (ahead.length) {
                    pool = ahead;
                } else {
                    this.direction = -this.direction;
                    pool = all;
                }
            }

            const choice = this._nearest(pool, current);
            if (!choice) {
                this.direction = 0;
                this.targetFloor = current;
                this.state = STATE_IDLE;
                return;
            }
            this._setTarget(choice.floor, choice.kind);
        }

        _onDoorsOpen() {
            this.state = STATE_OPEN;
            this.doorTimer = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            const floor = this.currentFloor;
            this.destinations.delete(floor);
            if (this.direction > 0) {
                this.upCalls.delete(floor);
            } else if (this.direction < 0) {
                this.downCalls.delete(floor);
            } else {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
            if (!this._hasStopsAhead(this.direction)) {
                if (this.direction > 0) this.downCalls.delete(floor);
                else if (this.direction < 0) this.upCalls.delete(floor);
                else {
                    this.upCalls.delete(floor);
                    this.downCalls.delete(floor);
                }
            }
        }

        _reconsiderWhileMoving() {
            if (this.state !== STATE_MOVING) return;
            const dir = this.direction;
            if (dir === 0) return;
            const y = this.carY;
            let bestFloor = this.targetFloor;
            let bestDist = Math.abs(this.targetFloor - y);
            const consider = (floor) => {
                if (dir > 0 && floor <= y) return;
                if (dir < 0 && floor >= y) return;
                const dist = Math.abs(floor - y);
                if (dist < bestDist - 1e-6) {
                    bestDist = dist;
                    bestFloor = floor;
                }
            };
            for (const floor of this.destinations) consider(floor);
            if (this.currentCapacityFree() > 0) {
                const calls = dir > 0 ? this.upCalls : this.downCalls;
                for (const floor of calls) consider(floor);
            }
            if (bestFloor !== this.targetFloor) this.targetFloor = bestFloor;
        }

        tick(dt) {
            const step = Math.max(0, Number(dt) || 0);
            if (this.state === STATE_IDLE) {
                this._pickNextTarget();
                return;
            }

            if (this.state === STATE_OPENING) {
                this.doorTimer += step;
                if (this.doorTimer >= this.doorOpenTime) this._onDoorsOpen();
                return;
            }

            if (this.state === STATE_OPEN) {
                this.doorTimer += step;
                const pending = this.pendingBoarders.size + this.pendingDisembark.size;
                if (this.doorTimer >= this.maxDoorOpenS) {
                    // Safety cap: never hold the doors forever for an incomplete handshake.
                    const self = this;
                    this.pendingBoarders.forEach(function (spot, person) {
                        if (self.spotOccupancy[spot.index] === person) self.spotOccupancy[spot.index] = null;
                    });
                    this.pendingBoarders.clear();
                    this.pendingDisembark.clear();
                    this.state = STATE_CLOSING;
                    this.doorTimer = 0;
                } else if (pending === 0 && this.doorTimer >= this.minDoorOpenS) {
                    this.state = STATE_CLOSING;
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.state === STATE_CLOSING) {
                this.doorTimer += step;
                if (this.doorTimer >= this.doorCloseTime) {
                    this.state = STATE_IDLE;
                    this.doorTimer = 0;
                    this.servedThisDoorCycle = false;
                    this._pickNextTarget();
                }
                return;
            }

            if (this.state === STATE_MOVING) {
                this._reconsiderWhileMoving();
                const delta = this.targetFloor - this.carY;
                const maxStep = this.travelSpeed * step;
                if (Math.abs(delta) <= maxStep) {
                    this.carY = this.targetFloor;
                    this.currentFloor = this.targetFloor;
                    this.state = STATE_OPENING;
                    this.doorTimer = 0;
                } else {
                    this.carY += Math.sign(delta) * maxStep;
                }
            }
        }
    }

    ElevatorLogic.STATE_IDLE = STATE_IDLE;
    ElevatorLogic.STATE_MOVING = STATE_MOVING;
    ElevatorLogic.STATE_OPENING = STATE_OPENING;
    ElevatorLogic.STATE_OPEN = STATE_OPEN;
    ElevatorLogic.STATE_CLOSING = STATE_CLOSING;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
