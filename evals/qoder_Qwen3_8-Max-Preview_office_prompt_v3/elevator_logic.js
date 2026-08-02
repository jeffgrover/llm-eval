// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, DOM, or browser-only dependencies. Runs in browser and Node.

(function (root) {
    "use strict";

    const STATES = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING",
    };

    const DOOR_OPEN_S = 1.0;
    const DOOR_CLOSE_S = 1.0;
    const MIN_DOOR_OPEN_S = 2.5;
    const MAX_DOOR_OPEN_S = 8.0;
    const ELEV_SPEED = 1.5; // floors per simulated second

    // Logical interior spots (car-local coordinates, y at car floor).
    const SPOTS = [
        { x: -0.65, z: -0.55 },
        { x: 0.65, z: -0.55 },
        { x: -0.65, z: 0.55 },
        { x: 0.65, z: 0.55 },
    ];

    class ElevatorLogic {
        constructor(opts) {
            const options = opts || {};
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;

            this.STATES = STATES;
            this.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
            this.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.reset();
        }

        reset() {
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = [false, false, false, false];
            this.state = STATES.IDLE;
            this.direction = 0;
            this.position = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.doorOpenAmount = 0;
            this.doorTimer = 0;
            this.doorOpenTimer = 0;
            this.lastServedFloor = null;
            this.reopensAtFloor = 0;
        }

        callUp(floor) {
            if (floor < 0 || floor > this.floorCount - 1) return;
            this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor < 0 || floor > this.floorCount - 1) return;
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor < 0 || floor > this.floorCount - 1) return;
            this.destinations.add(floor);
        }

        loadFactor() {
            return this.passengers.size + this.pendingBoarders.size;
        }

        currentCapacityFree() {
            return this.maxCapacity - this.loadFactor();
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            return !this.hasWorkInDirection(this.direction);
        }

        hasWorkInDirection(dir) {
            const cur = this.position;
            for (const f of this.destinations) {
                if (dir > 0 ? f > cur + 0.000001 : f < cur - 0.000001) return true;
            }
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const f of calls) {
                if (dir > 0 ? f > cur + 0.000001 : f < cur - 0.000001) return true;
            }
            return false;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < SPOTS.length; i += 1) {
                if (this.spotOccupancy[i]) continue;
                this.spotOccupancy[i] = true;
                this.pendingBoarders.add(person);
                person._spotIndex = i;
                return { index: i, x: SPOTS[i].x, y: 0, z: SPOTS[i].z };
            }
            return null;
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            const idx = person._spotIndex;
            if (typeof idx === "number" && idx >= 0 && idx < this.spotOccupancy.length) {
                this.spotOccupancy[idx] = false;
            }
            person._spotIndex = -1;
        }

        // Recovery path for a rider who is physically in the car but fell out
        // of bookkeeping (e.g. the door safety cap aborted their reservation
        // while they were still walking to their spot).
        ensurePassenger(person, floor) {
            this.pendingBoarders.delete(person);
            if (this.passengers.has(person)) {
                this.destinations.add(floor);
                return;
            }
            const prev = person._spotIndex;
            if (typeof prev === "number" && prev >= 0 && !this.spotOccupancy[prev]) {
                this.spotOccupancy[prev] = true;
            } else {
                let idx = this.spotOccupancy.indexOf(false);
                if (idx === -1) idx = 0;
                this.spotOccupancy[idx] = true;
                person._spotIndex = idx;
            }
            this.passengers.add(person);
            this.destinations.add(floor);
        }

        nearestStopInDirection(dir) {
            const cur = this.position;
            let best = null;
            let bestDist = Infinity;
            const consider = (f) => {
                const d = dir > 0 ? f - cur : cur - f;
                if (d > 0.000001 && d < bestDist) {
                    bestDist = d;
                    best = f;
                }
            };
            for (const f of this.destinations) consider(f);
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const f of calls) consider(f);
            return best;
        }

        // Used when reversing: behind the car, any destination and any hall
        // call (both directions) is reachable work - an opposite-direction
        // caller is picked up when the car arrives and runs out of work.
        nearestWorkBehind(dir) {
            const cur = this.position;
            let best = null;
            let bestDist = Infinity;
            const consider = (f) => {
                const d = dir > 0 ? f - cur : cur - f;
                if (d > 0.000001 && d < bestDist) {
                    bestDist = d;
                    best = f;
                }
            };
            for (const f of this.destinations) consider(f);
            for (const f of this.upCalls) consider(f);
            for (const f of this.downCalls) consider(f);
            return best;
        }

        anyStop() {
            let best = null;
            let bestDist = Infinity;
            const consider = (f) => {
                const d = Math.abs(f - this.position);
                if (d < bestDist) {
                    bestDist = d;
                    best = f;
                }
            };
            for (const f of this.destinations) consider(f);
            for (const f of this.upCalls) consider(f);
            for (const f of this.downCalls) consider(f);
            return best;
        }

        // Passenger destinations outrank same-floor hall calls: while riders
        // are aboard with destinations (or the car is full), a re-pressed call
        // at the current floor stays queued for the next trip instead of
        // forcing the doors back open.
        mustSkipSameFloor() {
            return (
                (this.passengers.size > 0 && this.destinations.size > 0) ||
                this.currentCapacityFree() <= 0 ||
                this.reopensAtFloor >= 1
            );
        }

        pickNextTarget() {
            const cur = this.currentFloor;
            const dir = this.direction;
            const skipSameFloor = this.mustSkipSameFloor();

            const scan = (d) => {
                let best = null;
                let bestDist = Infinity;
                const consider = (f, isHallCall) => {
                    if (isHallCall && f === cur && skipSameFloor) return;
                    const dist = d > 0 ? f - cur : cur - f;
                    if (dist < (d > 0 ? -0.000001 : 0.000001)) return;
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = f;
                    }
                };
                for (const f of this.destinations) consider(f, false);
                const calls = d > 0 ? this.upCalls : this.downCalls;
                for (const f of calls) consider(f, true);
                return best;
            };

            if (dir !== 0) {
                const ahead = scan(dir);
                if (ahead !== null) return { floor: ahead, dir: dir };
                const behind = this.nearestWorkBehind(-dir);
                if (behind !== null) return { floor: behind, dir: -dir };
                return null;
            }

            let best = null;
            let bestDist = Infinity;
            let bestDir = 0;
            const considerIdle = (f, isHallCall) => {
                if (isHallCall && f === cur && skipSameFloor) return;
                const d = Math.abs(f - cur);
                if (d < bestDist) {
                    bestDist = d;
                    best = f;
                    bestDir = f > cur ? 1 : f < cur ? -1 : dir;
                }
            };
            for (const f of this.destinations) considerIdle(f, false);
            for (const f of this.upCalls) considerIdle(f, true);
            for (const f of this.downCalls) considerIdle(f, true);
            if (best === null) return null;
            return { floor: best, dir: bestDir };
        }

        onArrival() {
            const f = this.currentFloor;
            if (this.lastServedFloor !== f) this.reopensAtFloor = 0;
            this.destinations.delete(f);
            if (this.direction === 0) {
                this.upCalls.delete(f);
                this.downCalls.delete(f);
            } else {
                if (this.direction > 0) this.upCalls.delete(f);
                else this.downCalls.delete(f);
                if (!this.hasWorkInDirection(this.direction)) {
                    this.upCalls.delete(f);
                    this.downCalls.delete(f);
                }
            }
            this.lastServedFloor = f;
        }

        startDoorOpening() {
            if (this.state === STATES.DOOR_CLOSING && this.currentFloor === this.targetFloor) {
                this.reopensAtFloor += 1;
            }
            this.state = STATES.DOOR_OPENING;
            this.doorTimer = 0;
        }

        tick(dt) {
            switch (this.state) {
                case STATES.IDLE: {
                    const next = this.pickNextTarget();
                    if (next && next.floor !== this.currentFloor) {
                        this.targetFloor = next.floor;
                        this.direction = next.dir;
                        this.state = STATES.MOVING;
                    } else if (next && next.floor === this.currentFloor) {
                        this.targetFloor = next.floor;
                        this.direction = next.dir || this.direction;
                        this.onArrival();
                        this.startDoorOpening();
                    }
                    break;
                }
                case STATES.MOVING: {
                    // Re-evaluate every frame so a closer same-direction stop
                    // shortens the trip instead of being overshot.
                    const closer = this.nearestStopInDirection(this.direction);
                    if (closer !== null) {
                        const curDist = Math.abs(this.targetFloor - this.position);
                        const newDist = Math.abs(closer - this.position);
                        if (newDist < curDist - 0.000000001) this.targetFloor = closer;
                    }
                    const delta = this.direction * ELEV_SPEED * dt;
                    this.position += delta;
                    const arrived =
                        (this.direction > 0 && this.position >= this.targetFloor - 0.000000001) ||
                        (this.direction < 0 && this.position <= this.targetFloor + 0.000000001);
                    if (arrived) {
                        this.position = this.targetFloor;
                        this.currentFloor = this.targetFloor;
                        this.onArrival();
                        this.startDoorOpening();
                    }
                    break;
                }
                case STATES.DOOR_OPENING: {
                    this.doorTimer += dt;
                    this.doorOpenAmount = Math.min(1, this.doorTimer / DOOR_OPEN_S);
                    if (this.doorTimer >= DOOR_OPEN_S) {
                        this.doorOpenAmount = 1;
                        this.state = STATES.DOOR_OPEN;
                        this.doorOpenTimer = 0;
                    }
                    break;
                }
                case STATES.DOOR_OPEN: {
                    this.doorOpenTimer += dt;
                    const pendingClear =
                        this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                    const safetyCap =
                        this.doorOpenTimer >= MAX_DOOR_OPEN_S && this.pendingDisembark.size === 0;
                    if ((pendingClear && this.doorOpenTimer >= MIN_DOOR_OPEN_S) || safetyCap) {
                        if (this.pendingBoarders.size > 0) {
                            // Stragglers never made it in: free their spots so
                            // they can queue for the next car visit.
                            for (const p of this.pendingBoarders) {
                                const idx = p._spotIndex;
                                if (typeof idx === "number" && idx >= 0) this.spotOccupancy[idx] = false;
                                p._spotIndex = -1;
                            }
                            this.pendingBoarders.clear();
                        }
                        this.state = STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;
                }
                case STATES.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    this.doorOpenAmount = Math.max(0, 1 - this.doorTimer / DOOR_CLOSE_S);
                    if (this.pendingDisembark.size > 0) {
                        // Never trap a disembarker: reopen and let them out.
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        break;
                    }
                    if (this.doorTimer >= DOOR_CLOSE_S) {
                        this.doorOpenAmount = 0;
                        const next = this.pickNextTarget();
                        if (next && next.floor !== this.currentFloor) {
                            this.targetFloor = next.floor;
                            this.direction = next.dir;
                            this.state = STATES.MOVING;
                        } else if (next && next.floor === this.currentFloor) {
                            this.targetFloor = next.floor;
                            this.direction = next.dir || this.direction;
                            this.onArrival();
                            this.startDoorOpening();
                        } else {
                            this.state = STATES.IDLE;
                            this.direction = 0;
                            this.targetFloor = null;
                            this.reopensAtFloor = 0;
                        }
                    }
                    break;
                }
                default:
                    this.state = STATES.IDLE;
            }
        }
    }

    ElevatorLogic.STATES = STATES;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
