/* elevator_logic.js - pure elevator scheduler / state machine.
   No THREE, no DOM, no browser-only APIs: runs identically in Node.
   Dual environment export: window.ElevatorLogic in the browser,
   module.exports for Node tests. */

(function (root) {
    "use strict";

    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_DOOR_OPENING = "DOOR_OPENING";
    const STATE_DOOR_OPEN = "DOOR_OPEN";
    const STATE_DOOR_CLOSING = "DOOR_CLOSING";

    const DEFAULT_SPOTS = [
        { x: -0.62, z: -0.55 },
        { x: 0.62, z: -0.55 },
        { x: -0.62, z: 0.55 },
        { x: 0.62, z: 0.55 }
    ];

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;
            this.speed = opts.speed !== undefined ? opts.speed : 2.4;
            this.doorTime = opts.doorTime !== undefined ? opts.doorTime : 1.2;
            this.MIN_DOOR_OPEN_S = opts.minDoorOpen !== undefined ? opts.minDoorOpen : 2.5;
            this.MAX_DOOR_OPEN_S = opts.maxDoorOpen !== undefined ? opts.maxDoorOpen : 9.0;
            this.spotPositions = (opts.spotPositions || DEFAULT_SPOTS).map(function (spot) {
                return { x: spot.x, z: spot.z };
            });
            this.reset();
        }

        reset() {
            this.state = STATE_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.carY = 0;
            this.doorPos = 0;
            this.doorTimer = 0;
            this.doorOpenElapsed = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [];
            for (let i = 0; i < this.spotPositions.length; i += 1) {
                this.spotOccupancy.push(false);
            }
            this.spotByPerson = new Map();
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
            this.justDepartedFloor = -1;
        }

        /* ---------------- calls & destinations ---------------- */

        callUp(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            if (floor === this.floorCount - 1) return;
            this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor <= 0 || floor >= this.floorCount) return;
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.destinations.add(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE_DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (!direction) return true;
            if (this.direction === 0 || this.direction === direction) return true;
            return !this.hasWorkAhead(this.direction);
        }

        /* ---------------- boarding / leaving ---------------- */

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let index = -1;
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (!this.spotOccupancy[i]) {
                    index = i;
                    break;
                }
            }
            if (index < 0) return null;
            this.spotOccupancy[index] = true;
            this.spotByPerson.set(person, index);
            this.pendingBoarders.add(person);
            const spot = this.spotPositions[index];
            return { index: index, x: spot.x, y: 0, z: spot.z };
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
                return true;
            }
            if (!this.passengers.has(person) && this.currentCapacityFree() > 0) {
                this.passengers.add(person);
                return true;
            }
            return false;
        }

        cancelBoarding(person) {
            if (this.pendingBoarders.has(person)) this.pendingBoarders.delete(person);
            this.releaseSpotFor(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this.releaseSpotFor(person);
        }

        releaseSpotFor(person) {
            const index = this.spotByPerson.get(person);
            if (index !== undefined && index !== null) {
                this.spotOccupancy[index] = false;
                this.spotByPerson.delete(person);
            }
        }

        /* ---------------- scheduling helpers ---------------- */

        floorY(floor) {
            return floor * this.floorHeight;
        }

        shouldStopAt(floor, direction) {
            if (this.destinations.has(floor)) return true;
            if (direction > 0 && this.upCalls.has(floor)) return true;
            if (direction < 0 && this.downCalls.has(floor)) return true;
            return false;
        }

        hasWorkAhead(direction) {
            const here = this.currentFloor;
            if (direction > 0) {
                for (let f = here + 1; f < this.floorCount; f += 1) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            } else if (direction < 0) {
                for (let f = here - 1; f >= 0; f -= 1) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            }
            return false;
        }

        nearestStop(direction) {
            const here = this.currentFloor;
            if (direction > 0) {
                for (let f = here + 1; f < this.floorCount; f += 1) {
                    if (this.shouldStopAt(f, 1)) return f;
                }
                return null;
            }
            if (direction < 0) {
                for (let f = here - 1; f >= 0; f -= 1) {
                    if (this.shouldStopAt(f, -1)) return f;
                }
                return null;
            }
            let best = null;
            let bestDist = Infinity;
            for (let f = 0; f < this.floorCount; f += 1) {
                if (f === here) continue;
                if (this.shouldStopAt(f, f > here ? 1 : -1)) {
                    const dist = Math.abs(f - here);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = f;
                    }
                }
            }
            return best;
        }

        /* Passenger destinations always outrank a same-floor hall call: the
           returned target is never the floor the car is already on while a
           destination exists. */
        /* Any pending request anywhere (used when no request matches the
           current travel direction, e.g. a DOWN call above an empty car). */
        anyPendingFloor() {
            const here = this.currentFloor;
            let best = null;
            let bestDist = Infinity;
            for (let f = 0; f < this.floorCount; f += 1) {
                if (f === here) continue;
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    const dist = Math.abs(f - here);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = f;
                    }
                }
            }
            return best;
        }

        chooseTarget() {
            const here = this.currentFloor;
            let target = null;
            if (this.direction !== 0) target = this.nearestStop(this.direction);
            if (target === null && this.direction !== 0) {
                const other = this.direction > 0 ? -1 : 1;
                target = this.nearestStop(other);
                if (target !== null) this.direction = target > here ? 1 : -1;
            } else if (target !== null) {
                this.direction = target > here ? 1 : -1;
            }
            if (target === null) {
                target = this.nearestStop(0);
                if (target !== null) this.direction = target > here ? 1 : -1;
            }
            if (target === null) {
                target = this.anyPendingFloor();
                if (target !== null) this.direction = target > here ? 1 : -1;
            }
            if (target !== null) return target;
            if (this.upCalls.has(here) || this.downCalls.has(here)) {
                this.direction = this.upCalls.has(here) ? 1 : -1;
                return here;
            }
            this.direction = 0;
            return null;
        }

        nextStopAhead(direction) {
            let best = null;
            let bestDist = Infinity;
            for (let f = 0; f < this.floorCount; f += 1) {
                const y = this.floorY(f);
                const ahead = (y - this.carY) * direction;
                if (ahead <= 0.000000001) continue;
                const dist = Math.abs(y - this.carY);
                const isTarget = f === this.targetFloor;
                if (!isTarget && !this.shouldStopAt(f, direction)) continue;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = f;
                }
            }
            if (best === null) return null;
            return { floor: best, dist: bestDist };
        }

        forceCompletePending() {
            const self = this;
            this.pendingBoarders.forEach(function (person) {
                self.passengers.add(person);
            });
            this.pendingBoarders.clear();
            this.pendingDisembark.forEach(function (person) {
                self.passengers.delete(person);
                self.releaseSpotFor(person);
            });
            this.pendingDisembark.clear();
        }

        /* ---------------- state machine ---------------- */

        arriveAt(floor, direction) {
            this.currentFloor = floor;
            this.carY = this.floorY(floor);
            this.targetFloor = null;
            this.direction = direction;
            this.state = STATE_DOOR_OPENING;
            this.doorTimer = 0;
        }

        onArrive() {
            const floor = this.currentFloor;
            this.destinations.delete(floor);
            if (this.direction > 0) this.upCalls.delete(floor);
            else if (this.direction < 0) this.downCalls.delete(floor);
            if (!this.hasWorkAhead(this.direction)) {
                if (this.direction >= 0) this.downCalls.delete(floor);
                if (this.direction <= 0) this.upCalls.delete(floor);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = floor;
        }

        advanceAfterClose() {
            const target = this.chooseTarget();
            this.justDepartedFloor = this.currentFloor;
            this.servedThisDoorCycle = false;
            if (target === null) {
                this.state = STATE_IDLE;
                this.direction = 0;
                this.targetFloor = null;
                return;
            }
            if (target === this.currentFloor) {
                this.state = STATE_DOOR_OPENING;
                this.doorTimer = 0;
                return;
            }
            this.targetFloor = target;
            this.state = STATE_MOVING;
        }

        tick(dt) {
            const step = Math.max(0, dt);
            if (this.state === STATE_IDLE) {
                const target = this.chooseTarget();
                if (target === null) return;
                if (target === this.currentFloor) {
                    this.state = STATE_DOOR_OPENING;
                    this.doorTimer = 0;
                    this.onArrive();
                    return;
                }
                this.targetFloor = target;
                this.state = STATE_MOVING;
                return;
            }

            if (this.state === STATE_MOVING) {
                if (this.targetFloor === null) {
                    this.advanceAfterClose();
                    return;
                }
                const targetY = this.floorY(this.targetFloor);
                const direction = targetY > this.carY ? 1 : -1;
                this.direction = direction;
                const move = this.speed * step;
                const stop = this.nextStopAhead(direction);
                if (stop && stop.dist <= move + 0.000001) {
                    this.arriveAt(stop.floor, direction);
                    this.onArrive();
                    return;
                }
                this.carY += direction * move;
                const remaining = (targetY - this.carY) * direction;
                if (remaining <= 0.000001) {
                    this.arriveAt(this.targetFloor, direction);
                    this.onArrive();
                }
                return;
            }

            if (this.state === STATE_DOOR_OPENING) {
                this.doorTimer += step;
                this.doorPos = Math.min(1, this.doorPos + step / this.doorTime);
                if (this.doorPos >= 1) {
                    this.doorPos = 1;
                    this.state = STATE_DOOR_OPEN;
                    this.doorOpenElapsed = 0;
                }
                return;
            }

            if (this.state === STATE_DOOR_OPEN) {
                this.doorOpenElapsed += step;
                const pending = this.pendingBoarders.size + this.pendingDisembark.size;
                if (this.doorOpenElapsed >= this.MAX_DOOR_OPEN_S) {
                    this.forceCompletePending();
                    this.state = STATE_DOOR_CLOSING;
                    return;
                }
                if (pending === 0 && this.doorOpenElapsed >= this.MIN_DOOR_OPEN_S) {
                    this.state = STATE_DOOR_CLOSING;
                }
                return;
            }

            if (this.state === STATE_DOOR_CLOSING) {
                this.doorPos = Math.max(0, this.doorPos - step / this.doorTime);
                if (this.doorPos <= 0) {
                    this.doorPos = 0;
                    this.advanceAfterClose();
                }
            }
        }

        /* ---------------- read-only helpers for HUDs ---------------- */

        directionLabel() {
            if (this.direction > 0) return "^";
            if (this.direction < 0) return "v";
            return "-";
        }

        floorLabel() {
            return `${this.currentFloor}${this.direction > 0 ? "^" : this.direction < 0 ? "v" : ""}`;
        }
    }

    ElevatorLogic.STATES = {
        IDLE: STATE_IDLE,
        MOVING: STATE_MOVING,
        DOOR_OPENING: STATE_DOOR_OPENING,
        DOOR_OPEN: STATE_DOOR_OPEN,
        DOOR_CLOSING: STATE_DOOR_CLOSING
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
