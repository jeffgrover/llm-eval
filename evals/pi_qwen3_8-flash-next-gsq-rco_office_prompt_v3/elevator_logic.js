// elevator_logic.js - pure elevator scheduler / state machine.
// No Three.js, DOM, canvas or browser-only dependencies so it runs under Node too.

(function (root) {
    const IDLE = "IDLE";
    const MOVING = "MOVING";
    const DOOR_OPENING = "DOOR_OPENING";
    const DOOR_OPEN = "DOOR_OPEN";
    const DOOR_CLOSING = "DOOR_CLOSING";

    const STATES = [IDLE, MOVING, DOOR_OPENING, DOOR_OPEN, DOOR_CLOSING];

    function defaultSpots() {
        // Four logical interior spots, car-local coordinates (car floor at y = 0).
        return [
            { index: 0, x: -0.72, y: 0, z: -0.55 },
            { index: 1, x: 0.72, y: 0, z: -0.55 },
            { index: 2, x: -0.72, y: 0, z: 0.45 },
            { index: 3, x: 0.72, y: 0, z: 0.45 }
        ];
    }

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;

            this.minDoorOpenS = opts.minDoorOpenS !== undefined ? opts.minDoorOpenS : 2.5;
            this.maxDoorOpenS = opts.maxDoorOpenS !== undefined ? opts.maxDoorOpenS : 10;
            this.doorTravelS = opts.doorTravelS !== undefined ? opts.doorTravelS : 0.8;
            this.floorsPerSecond = opts.floorsPerSecond !== undefined ? opts.floorsPerSecond : 1.6;

            this.spots = defaultSpots();

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOf = new Map();

            this.reset();
        }

        reset() {
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOf.clear();
            for (let i = 0; i < this.spots.length; i += 1) {
                this.spots[i].occupant = null;
            }

            this.state = IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.carPos = 0;
            this.doorProgress = 0;
            this.doorTimer = 0;
            this.doorOpenElapsed = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
            this.reopenedAtSameFloor = false;
        }

        inRange(floor) {
            return floor >= 0 && floor < this.floorCount;
        }

        callUp(floor) {
            if (this.inRange(floor)) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (this.inRange(floor)) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (this.inRange(floor)) this.destinations.add(floor);
        }

        hasCallAt(floor) {
            return this.upCalls.has(floor) || this.downCalls.has(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spots.length; i += 1) {
                if (!this.spots[i].occupant) {
                    this.spots[i].occupant = person;
                    this.spotOf.set(person, i);
                    this.pendingBoarders.add(person);
                    return { index: i, x: this.spots[i].x, y: this.spots[i].y, z: this.spots[i].z };
                }
            }
            return null;
        }

        completeBoard(person) {
            const spotIndex = this.spotOf.get(person);
            if (spotIndex === undefined) return false;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
            return true;
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            const spotIndex = this.spotOf.get(person);
            if (spotIndex !== undefined) {
                this.spots[spotIndex].occupant = null;
                this.spotOf.delete(person);
            }
            return true;
        }

        spotFor(person) {
            const index = this.spotOf.get(person);
            if (index === undefined) return null;
            const spot = this.spots[index];
            return { index: spot.index, x: spot.x, y: spot.y, z: spot.z };
        }

        // True only when the car is at `floor` in DOOR_OPEN and either there are no
        // more stops pending in the current direction, or the caller's direction matches.
        isAcceptingAt(floor, direction) {
            if (this.state !== DOOR_OPEN || floor !== this.currentFloor) return false;
            if (direction === 0 || this.direction === 0 || direction === this.direction) return true;
            return !this.hasStopsAhead(this.direction);
        }

        hasStopsAhead(dir) {
            if (dir === 0) return false;
            for (const dest of this.destinations) {
                if ((dest - this.currentFloor) * dir > 0) return true;
            }
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                if ((floor - this.currentFloor) * dir > 0) return true;
            }
            return false;
        }

        // Nearest stop strictly ahead in `dir`; passenger destinations outrank hall calls.
        scanAhead(dir) {
            if (dir === 0) return null;
            let bestDest = null;
            let bestCall = null;
            for (const dest of this.destinations) {
                if ((dest - this.currentFloor) * dir <= 0) continue;
                if (bestDest === null || Math.abs(dest - this.currentFloor) < Math.abs(bestDest - this.currentFloor)) {
                    bestDest = dest;
                }
            }
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                if ((floor - this.currentFloor) * dir <= 0) continue;
                if (bestCall === null || Math.abs(floor - this.currentFloor) < Math.abs(bestCall - this.currentFloor)) {
                    bestCall = floor;
                }
            }
            if (bestDest !== null) return bestDest;
            return bestCall;
        }

        nearestAnywhere() {
            let best = null;
            const consider = (floor) => {
                if (!this.inRange(floor)) return;
                if (best === null || Math.abs(floor - this.currentFloor) < Math.abs(best - this.currentFloor)) best = floor;
            };
            for (const dest of this.destinations) consider(dest);
            for (const floor of this.upCalls) consider(floor);
            for (const floor of this.downCalls) consider(floor);
            return best;
        }

        // Target selection at the door-close -> pick-next-target transition.
        pickTarget() {
            const cur = this.currentFloor;

            if (this.destinations.size > 0) {
                let ahead = scanSetAhead(this.destinations, this.currentFloor, this.direction);
                if (ahead === null) ahead = pickNearest(this.destinations, cur);
                if (ahead !== null && ahead !== cur) return ahead;
            }

            // Hall calls in the current direction first.
            let target = this.scanAhead(this.direction);
            if (target !== null && target !== cur) return target;

            // Nothing left ahead -> reverse and look behind.
            const behind = this.scanAhead(-this.direction);
            if (behind !== null && behind !== cur) {
                this.direction = -this.direction;
                return behind;
            }

            // Same-floor work: only allowed once per door cycle, and never while riders
            // still have destinations (that is the classic lobby-starvation bug).
            if (!this.servedThisDoorCycle || !this.reopenedAtSameFloor) {
                if (hasWorkAnywhere(this)) {
                    const nearest = this.nearestAnywhere();
                    if (nearest !== null && nearest !== cur) return nearest;
                }
                if (!this.passengers.size && !this.destinations.size && this.hasCallAt(cur)) {
                    this.reopenedAtSameFloor = true;
                    return cur;
                }
            }

            const fallback = this.nearestAnywhere();
            if (fallback !== null && fallback !== cur) return fallback;
            return null;
        }

        serveCurrentFloor() {
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) {
                this.upCalls.delete(this.currentFloor);
            } else if (this.direction < 0) {
                this.downCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            if (!this.hasStopsAhead(this.direction)) {
                // Serve the opposite-direction call at this floor before leaving.
                if (this.direction >= 0) this.downCalls.delete(this.currentFloor);
                else this.upCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
        }

        arriveAt(floor) {
            this.currentFloor = floor;
            this.carPos = floor;
            this.state = DOOR_OPENING;
            this.doorTimer = 0;
            this.doorOpenElapsed = 0;
            this.servedThisDoorCycle = false;
        }

        tick(dt) {
            if (this.state === MOVING) {
                // Re-evaluate every frame: a closer stop in the same direction shortens the trip.
                const recheck = this.scanAhead(this.direction);
                if (recheck !== null && recheck !== this.currentFloor) {
                    if (Math.abs(recheck - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                        this.targetFloor = recheck;
                    }
                }
                if (this.targetFloor === this.currentFloor) {
                    this.arriveAt(this.currentFloor);
                    return;
                }
                const step = this.floorsPerSecond * dt;
                const dir = Math.sign(this.targetFloor - this.carPos);
                this.carPos += dir * step;
                if (Math.abs(this.carPos - this.targetFloor) <= 1e-6 || Math.sign(this.targetFloor - this.carPos) !== dir) {
                    this.arriveAt(this.targetFloor);
                    return;
                }
                return;
            }

            if (this.state === DOOR_OPENING) {
                this.doorTimer += dt;
                this.doorProgress = Math.min(1, this.doorTimer / this.doorTravelS);
                if (this.doorTimer >= this.doorTravelS) {
                    this.state = DOOR_OPEN;
                    this.doorOpenElapsed = 0;
                    this.serveCurrentFloor();
                }
                return;
            }

            if (this.state === DOOR_OPEN) {
                this.doorOpenElapsed += dt;
                const settled = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                if ((settled && this.doorOpenElapsed >= this.minDoorOpenS) || this.doorOpenElapsed >= this.maxDoorOpenS) {
                    this.state = DOOR_CLOSING;
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.state === DOOR_CLOSING) {
                this.doorTimer += dt;
                this.doorProgress = Math.max(0, 1 - this.doorTimer / this.doorTravelS);
                if (this.doorTimer >= this.doorTravelS) {
                    const next = this.pickTarget();
                    this.servedThisDoorCycle = false;
                    if (next === null || next === this.currentFloor) {
                        this.state = IDLE;
                        this.direction = 0;
                        this.targetFloor = this.currentFloor;
                        return;
                    }
                    this.direction = Math.sign(next - this.currentFloor);
                    this.targetFloor = next;
                    this.state = MOVING;
                }
                return;
            }

            // IDLE
            if (this.hasCallAt(this.currentFloor) || this.destinations.has(this.currentFloor)) {
                this.arriveAt(this.currentFloor);
                return;
            }
            const next = this.pickTarget();
            if (next === null) return;
            this.direction = Math.sign(next - this.currentFloor);
            this.targetFloor = next;
            this.state = MOVING;
        }

        displayText() {
            const glyph = Math.round(this.carPos);
            if (this.state === MOVING) {
                return this.direction > 0 ? glyph + "^" : this.direction < 0 ? glyph + "v" : String(glyph);
            }
            return String(glyph);
        }

        doorOpenFraction() {
            return this.doorProgress;
        }
    }

    function scanSetAhead(set, from, dir) {
        if (dir === 0) return null;
        let best = null;
        for (const floor of set) {
            if ((floor - from) * dir <= 0) continue;
            if (best === null || Math.abs(floor - from) < Math.abs(best - from)) best = floor;
        }
        return best;
    }

    function pickNearest(set, from) {
        let best = null;
        for (const floor of set) {
            if (best === null || Math.abs(floor - from) < Math.abs(best - from)) best = floor;
        }
        return best;
    }

    function hasWorkAnywhere(elevator) {
        return elevator.destinations.size > 0 || elevator.upCalls.size > 0 || elevator.downCalls.size > 0;
    }

    function hasStopsAheadFor(elevator, dir) {
        return elevator.hasStopsAhead(dir);
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof window !== "undefined") window.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
