/**
 * elevator_logic.js
 * Pure elevator state machine and scheduler.
 * Runs in browser (window.ElevatorLogic) and Node.js (module.exports).
 * No Three.js, DOM, or browser-only APIs.
 */
(function(root) {
    "use strict";

    const ELEVATOR_STATES = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.floorHeight = options.floorHeight || 3.4;
            this.maxCapacity = options.maxCapacity || 4;
            this.speed = options.speed || 3.0; // units per second (world Y)
            this.doorMoveDuration = options.doorMoveDuration || 0.8; // seconds to open/close
            this.minDoorOpenTime = options.minDoorOpenTime || 1.5; // seconds
            this.maxDoorOpenTime = options.maxDoorOpenTime || 8.0; // safety cap seconds

            // 4 logical interior spots (relative to car center)
            this.logicalSpots = [
                { index: 0, x: -0.65, z: -0.5 },
                { index: 1, x: 0.65, z: -0.5 },
                { index: 2, x: -0.65, z: 0.5 },
                { index: 3, x: 0.65, z: 0.5 }
            ];

            this.reset();
        }

        reset() {
            this.state = ELEVATOR_STATES.IDLE;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.positionY = 0; // world Y coordinate
            this.direction = 0; // +1 = UP, -1 = DOWN, 0 = IDLE
            this.doorOpenFraction = 0; // 0 = closed, 1 = fully open
            this.doorTimer = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = new Array(this.maxCapacity).fill(null);
            this.lastServedFloor = -1;
            this.servedThisDoorCycle = false;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount - 1) {
                this.upCalls.add(floor);
                this._onCallAdded();
            }
        }

        callDown(floor) {
            if (floor > 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
                this._onCallAdded();
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.destinations.add(floor);
                this._onCallAdded();
            }
        }

        _onCallAdded() {
            if (this.state === ELEVATOR_STATES.IDLE) {
                this._selectNextTarget();
            }
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== ELEVATOR_STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;

            // If car is idle (no direction) or caller direction matches car direction
            if (this.direction === 0 || this.direction === dir) {
                return true;
            }

            // If car has no further stops/destinations in its current direction, it can accept opposite
            if (!this._hasWorkInDirection(this.currentFloor, this.direction)) {
                return true;
            }

            return false;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) {
                return null;
            }
            // Find first empty spot
            let spotIndex = -1;
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === null) {
                    spotIndex = i;
                    break;
                }
            }
            if (spotIndex === -1) {
                return null;
            }

            this.spotOccupancy[spotIndex] = person;
            this.pendingBoarders.add(person);
            const spot = this.logicalSpots[spotIndex];
            return { index: spotIndex, x: spot.x, y: 0, z: spot.z };
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
            }
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
        }

        _hasWorkInDirection(fromFloor, dir) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                        return true;
                    }
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                        return true;
                    }
                }
            }
            return false;
        }

        _selectNextTarget() {
            // Anti-starvation and destination priority:
            // If car has passengers with destinations, passenger destinations must outrank same-floor hall calls.
            const hasDestinations = this.destinations.size > 0;
            const hasPassengers = this.passengers.size > 0;

            // 1. If currently moving or continuing in direction
            if (this.direction !== 0) {
                const dir = this.direction;
                // Look ahead for destinations or matching hall calls
                let nextStop = -1;

                if (dir > 0) {
                    for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                        if (this.destinations.has(f) || this.upCalls.has(f)) {
                            nextStop = f;
                            break;
                        }
                    }
                    // If no matching hall call or destination ahead, check furthest opposite call ahead
                    if (nextStop === -1) {
                        for (let f = this.floorCount - 1; f > this.currentFloor; f--) {
                            if (this.downCalls.has(f)) {
                                nextStop = f;
                                break;
                            }
                        }
                    }
                } else {
                    for (let f = this.currentFloor - 1; f >= 0; f--) {
                        if (this.destinations.has(f) || this.downCalls.has(f)) {
                            nextStop = f;
                            break;
                        }
                    }
                    if (nextStop === -1) {
                        for (let f = 0; f < this.currentFloor; f++) {
                            if (this.upCalls.has(f)) {
                                nextStop = f;
                                break;
                            }
                        }
                    }
                }

                if (nextStop !== -1) {
                    this.targetFloor = nextStop;
                    this.state = ELEVATOR_STATES.MOVING;
                    return;
                }

                // No work ahead in current direction. Can we reverse direction?
                const oppDir = -dir;
                let oppStop = -1;
                if (oppDir > 0) {
                    for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                        if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                            oppStop = f;
                            break;
                        }
                    }
                } else {
                    for (let f = this.currentFloor - 1; f >= 0; f--) {
                        if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                            oppStop = f;
                            break;
                        }
                    }
                }

                if (oppStop !== -1) {
                    this.direction = oppDir;
                    this.targetFloor = oppStop;
                    this.state = ELEVATOR_STATES.MOVING;
                    return;
                }

                // Check if current floor has unserved opposite call (if not served this cycle)
                if (!this.servedThisDoorCycle) {
                    if ((dir > 0 && this.downCalls.has(this.currentFloor)) ||
                        (dir < 0 && this.upCalls.has(this.currentFloor))) {
                        this.direction = oppDir;
                        this.targetFloor = this.currentFloor;
                        this.state = ELEVATOR_STATES.DOOR_OPENING;
                        return;
                    }
                }
            }

            // 2. If IDLE or looking for any stop
            let bestFloor = -1;
            let shortestDist = Infinity;

            // Prioritize passenger destinations first if any exist
            if (hasDestinations) {
                for (const f of this.destinations) {
                    const dist = Math.abs(f - this.currentFloor);
                    if (dist > 0 && dist < shortestDist) {
                        shortestDist = dist;
                        bestFloor = f;
                    }
                }
                if (bestFloor !== -1) {
                    this.direction = bestFloor > this.currentFloor ? 1 : -1;
                    this.targetFloor = bestFloor;
                    this.state = ELEVATOR_STATES.MOVING;
                    return;
                }
            }

            // Otherwise, scan all calls and destinations
            const allRequests = new Set([...this.destinations, ...this.upCalls, ...this.downCalls]);
            for (const f of allRequests) {
                // If it's on current floor and we just served this floor, don't instantly reopen if other floors have requests
                if (f === this.currentFloor && this.servedThisDoorCycle && allRequests.size > 1) {
                    continue;
                }
                const dist = Math.abs(f - this.currentFloor);
                if (dist < shortestDist) {
                    shortestDist = dist;
                    bestFloor = f;
                }
            }

            if (bestFloor !== -1) {
                if (bestFloor === this.currentFloor) {
                    // Open doors at current floor
                    this.direction = this.upCalls.has(bestFloor) ? 1 : (this.downCalls.has(bestFloor) ? -1 : 0);
                    this.targetFloor = bestFloor;
                    this.state = ELEVATOR_STATES.DOOR_OPENING;
                } else {
                    this.direction = bestFloor > this.currentFloor ? 1 : -1;
                    this.targetFloor = bestFloor;
                    this.state = ELEVATOR_STATES.MOVING;
                }
            } else {
                this.direction = 0;
                this.state = ELEVATOR_STATES.IDLE;
            }
        }

        tick(dt) {
            if (dt <= 0) return;

            switch (this.state) {
                case ELEVATOR_STATES.IDLE:
                    this.doorOpenFraction = 0;
                    this._selectNextTarget();
                    break;

                case ELEVATOR_STATES.MOVING:
                    this.doorOpenFraction = 0;
                    this.servedThisDoorCycle = false;
                    const targetY = this.targetFloor * this.floorHeight;
                    const diffY = targetY - this.positionY;
                    const dist = Math.abs(diffY);
                    const step = this.speed * dt;

                    // Dynamic re-evaluation while moving:
                    // Check if there is a closer stop in our current direction
                    if (this.direction > 0) {
                        for (let f = this.currentFloor + 1; f < this.targetFloor; f++) {
                            const fY = f * this.floorHeight;
                            if (this.positionY < fY && (this.destinations.has(f) || this.upCalls.has(f))) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    } else if (this.direction < 0) {
                        for (let f = this.currentFloor - 1; f > this.targetFloor; f--) {
                            const fY = f * this.floorHeight;
                            if (this.positionY > fY && (this.destinations.has(f) || this.downCalls.has(f))) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    }

                    if (dist <= step) {
                        // Arrived at target floor
                        this.positionY = this.targetFloor * this.floorHeight;
                        this.currentFloor = this.targetFloor;
                        this.state = ELEVATOR_STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                    } else {
                        this.positionY += Math.sign(diffY) * step;
                        this.currentFloor = Math.round(this.positionY / this.floorHeight);
                    }
                    break;

                case ELEVATOR_STATES.DOOR_OPENING:
                    this.doorTimer += dt;
                    this.doorOpenFraction = Math.min(1.0, this.doorTimer / this.doorMoveDuration);
                    if (this.doorOpenFraction >= 1.0) {
                        this.state = ELEVATOR_STATES.DOOR_OPEN;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle = true;
                        this.lastServedFloor = this.currentFloor;

                        // Clear served requests for this floor
                        this.destinations.delete(this.currentFloor);
                        if (this.direction >= 0) {
                            this.upCalls.delete(this.currentFloor);
                        }
                        if (this.direction <= 0) {
                            this.downCalls.delete(this.currentFloor);
                        }

                        // If no more calls in current direction, clear the other direction call too
                        if (!this._hasWorkInDirection(this.currentFloor, this.direction)) {
                            this.upCalls.delete(this.currentFloor);
                            this.downCalls.delete(this.currentFloor);
                        }
                    }
                    break;

                case ELEVATOR_STATES.DOOR_OPEN:
                    this.doorTimer += dt;
                    this.doorOpenFraction = 1.0;

                    // Doors stay open while pending passengers exist, unless maxDoorOpenTime safety cap fires
                    const canCloseMin = this.doorTimer >= this.minDoorOpenTime &&
                                       this.pendingBoarders.size === 0 &&
                                       this.pendingDisembark.size === 0;
                    const forceCloseMax = this.doorTimer >= this.maxDoorOpenTime;

                    if (canCloseMin || forceCloseMax) {
                        this.state = ELEVATOR_STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;

                case ELEVATOR_STATES.DOOR_CLOSING:
                    this.doorTimer += dt;
                    this.doorOpenFraction = Math.max(0.0, 1.0 - (this.doorTimer / this.doorMoveDuration));
                    if (this.doorOpenFraction <= 0.0) {
                        this.doorOpenFraction = 0.0;
                        this.state = ELEVATOR_STATES.IDLE;
                        this._selectNextTarget();
                    }
                    break;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
