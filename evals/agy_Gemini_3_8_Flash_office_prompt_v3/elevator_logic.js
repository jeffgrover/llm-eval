/**
 * elevator_logic.js
 * Authoritative elevator scheduler and state machine.
 * Dual-environment: supports browser globals (window.ElevatorLogic) and Node.js (module.exports).
 * No Three.js or DOM dependencies.
 */
(function(root) {
    // Exact five states required:
    const STATE = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.speed = options.speed || 2.5; // floors per second

            // Timing constants
            this.DOOR_OPEN_TIME = 0.8;
            this.DOOR_CLOSE_TIME = 0.8;
            this.MIN_DOOR_OPEN_S = 1.5;
            this.MAX_DOOR_OPEN_S = 6.0;

            // 4 logical interior spots (2x2 grid in car-local coordinates)
            this.interiorSpots = [
                { index: 0, x: -0.6, y: 0, z: -0.5 },
                { index: 1, x: 0.6, y: 0, z: -0.5 },
                { index: 2, x: -0.6, y: 0, z: 0.5 },
                { index: 3, x: 0.6, y: 0, z: 0.5 }
            ];

            this.reset();
        }

        reset() {
            this.state = STATE.IDLE;
            this.direction = 0; // +1 = UP, -1 = DOWN, 0 = IDLE
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.currentY = 0.0;
            this.doorProgress = 0.0; // 0.0 = closed, 1.0 = fully open
            this.doorTimer = 0.0;
            this.lastServedFloor = -1;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            // spotOccupancy: array of size 4 matching interiorSpots
            this.spotOccupancy = [null, null, null, null];
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
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) {
                return null;
            }
            // Find first unoccupied spot
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    return Object.assign({}, this.interiorSpots[i]);
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
            if (this.pendingDisembark.has(person)) {
                this.pendingDisembark.delete(person);
            }
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                }
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;

            // Direction check
            if (this.direction === 0) return true;
            if (this.direction === direction) return true;

            // If no further stops pending in current direction, car can accept / reverse
            if (!this.hasWorkInDirection(this.direction, this.currentFloor)) {
                return true;
            }
            return false;
        }

        hasWorkInDirection(dir, floor) {
            if (dir > 0) {
                for (let f = floor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                        return true;
                    }
                }
            } else if (dir < 0) {
                for (let f = floor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f) || this.upCalls.has(f)) {
                        return true;
                    }
                }
            }
            return false;
        }

        hasStopsAhead(dir, floor) {
            if (dir > 0) {
                for (let f = floor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) return true;
                }
                for (let f = this.floorCount - 1; f > floor; f--) {
                    if (this.downCalls.has(f)) return true;
                }
            } else if (dir < 0) {
                for (let f = floor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) return true;
                }
                for (let f = 0; f < floor; f++) {
                    if (this.upCalls.has(f)) return true;
                }
            }
            return false;
        }

        selectNextTarget() {
            const hasDestinations = this.destinations.size > 0;
            const current = this.currentFloor;

            // 1. If we have destinations, passenger destinations outrank same-floor hall calls!
            if (hasDestinations) {
                // Look for nearest destination ahead in current direction
                if (this.direction > 0) {
                    for (let f = current + 1; f < this.floorCount; f++) {
                        if (this.destinations.has(f)) return f;
                    }
                } else if (this.direction < 0) {
                    for (let f = current - 1; f >= 0; f--) {
                        if (this.destinations.has(f)) return f;
                    }
                }
                // If none ahead in current direction, check behind
                let nearest = -1;
                let minDist = 999;
                for (const d of this.destinations) {
                    const dist = Math.abs(d - current);
                    if (dist < minDist && d !== current) {
                        minDist = dist;
                        nearest = d;
                    }
                }
                if (nearest !== -1) return nearest;
            }

            // 2. SCAN: Prefer continuing in current direction
            if (this.direction > 0) {
                // Matching destination or up call ahead
                for (let f = current + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) return f;
                }
                // Down calls ahead (serve from top down)
                for (let f = this.floorCount - 1; f > current; f--) {
                    if (this.downCalls.has(f)) return f;
                }
            } else if (this.direction < 0) {
                // Matching destination or down call ahead
                for (let f = current - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) return f;
                }
                // Up calls ahead (serve from bottom up)
                for (let f = 0; f < current; f++) {
                    if (this.upCalls.has(f)) return f;
                }
            }

            // 3. Reverse direction and look for work
            const oppDir = this.direction === 0 ? 1 : -this.direction;
            if (oppDir > 0) {
                for (let f = current + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return f;
                }
            } else {
                for (let f = current - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f) || this.upCalls.has(f)) return f;
                }
            }

            // 4. Same floor hall calls: ONLY if no destinations exist and wasn't just served
            if (!hasDestinations) {
                if (this.upCalls.has(current) || this.downCalls.has(current)) {
                    if (this.lastServedFloor !== current) {
                        return current;
                    }
                }
            }

            // 5. Look globally for any active call
            let bestFloor = -1;
            let bestDist = 999;
            const allCalls = new Set([...this.upCalls, ...this.downCalls, ...this.destinations]);
            for (const f of allCalls) {
                if (f === current && (hasDestinations || this.lastServedFloor === current)) continue;
                const dist = Math.abs(f - current);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestFloor = f;
                }
            }
            if (bestFloor !== -1) return bestFloor;

            // If only current floor has a call and no other calls exist anywhere
            if (this.upCalls.has(current) || this.downCalls.has(current)) {
                return current;
            }

            return -1;
        }

        tick(dt) {
            if (dt <= 0) return;

            switch (this.state) {
                case STATE.IDLE: {
                    this.doorProgress = 0.0;
                    this.doorTimer = 0.0;
                    const next = this.selectNextTarget();
                    if (next !== -1) {
                        if (next === this.currentFloor) {
                            this.state = STATE.DOOR_OPENING;
                            this.doorTimer = 0.0;
                        } else {
                            this.targetFloor = next;
                            this.direction = next > this.currentFloor ? 1 : -1;
                            this.state = STATE.MOVING;
                        }
                    } else {
                        this.direction = 0;
                    }
                    break;
                }

                case STATE.MOVING: {
                    this.doorProgress = 0.0;
                    const targetY = this.targetFloor * this.floorHeight;
                    const moveDist = this.speed * this.floorHeight * dt;

                    // Re-evaluate target during MOVING:
                    // Scan for closer stop in the same direction and shorten targetFloor
                    if (this.direction > 0) {
                        for (let f = this.currentFloor + 1; f < this.targetFloor; f++) {
                            const floorY = f * this.floorHeight;
                            if (this.currentY < floorY - 0.1) {
                                if (this.destinations.has(f) || this.upCalls.has(f)) {
                                    this.targetFloor = f;
                                    break;
                                }
                            }
                        }
                    } else if (this.direction < 0) {
                        for (let f = this.currentFloor - 1; f > this.targetFloor; f--) {
                            const floorY = f * this.floorHeight;
                            if (this.currentY > floorY + 0.1) {
                                if (this.destinations.has(f) || this.downCalls.has(f)) {
                                    this.targetFloor = f;
                                    break;
                                }
                            }
                        }
                    }

                    // Move toward target
                    const diff = targetY - this.currentY;
                    if (Math.abs(diff) <= moveDist) {
                        this.currentY = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = STATE.DOOR_OPENING;
                        this.doorTimer = 0.0;
                    } else {
                        this.currentY += Math.sign(diff) * moveDist;
                        this.currentFloor = Math.round(this.currentY / this.floorHeight);
                    }
                    break;
                }

                case STATE.DOOR_OPENING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.min(1.0, this.doorTimer / this.DOOR_OPEN_TIME);
                    if (this.doorProgress >= 1.0) {
                        this.doorProgress = 1.0;
                        this.state = STATE.DOOR_OPEN;
                        this.doorTimer = 0.0;
                        this.lastServedFloor = this.currentFloor;

                        // Clear served calls upon arrival
                        this.destinations.delete(this.currentFloor);
                        if (this.direction > 0) {
                            this.upCalls.delete(this.currentFloor);
                            if (!this.hasStopsAhead(1, this.currentFloor)) {
                                this.downCalls.delete(this.currentFloor);
                                if (this.downCalls.size > 0 || this.hasWorkInDirection(-1, this.currentFloor)) {
                                    this.direction = -1;
                                } else {
                                    this.direction = 0;
                                }
                            }
                        } else if (this.direction < 0) {
                            this.downCalls.delete(this.currentFloor);
                            if (!this.hasStopsAhead(-1, this.currentFloor)) {
                                this.upCalls.delete(this.currentFloor);
                                if (this.upCalls.size > 0 || this.hasWorkInDirection(1, this.currentFloor)) {
                                    this.direction = 1;
                                } else {
                                    this.direction = 0;
                                }
                            }
                        } else {
                            this.upCalls.delete(this.currentFloor);
                            this.downCalls.delete(this.currentFloor);
                        }
                    }
                    break;
                }

                case STATE.DOOR_OPEN: {
                    this.doorProgress = 1.0;
                    this.doorTimer += dt;

                    // Clear destination again if someone pressed it while here
                    this.destinations.delete(this.currentFloor);

                    // Door open logic:
                    // doors only close when both pending sets are empty and MIN_DOOR_OPEN_S elapsed,
                    // or MAX_DOOR_OPEN_S safety cap reached
                    const pendingEmpty = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                    const minMet = this.doorTimer >= this.MIN_DOOR_OPEN_S;
                    const maxCap = this.doorTimer >= this.MAX_DOOR_OPEN_S;

                    if ((minMet && pendingEmpty) || maxCap) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0.0;
                    }
                    break;
                }

                case STATE.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.max(0.0, 1.0 - this.doorTimer / this.DOOR_CLOSE_TIME);
                    if (this.doorProgress <= 0.0) {
                        this.doorProgress = 0.0;
                        const next = this.selectNextTarget();
                        if (next !== -1) {
                            if (next === this.currentFloor) {
                                this.state = STATE.DOOR_OPENING;
                                this.doorTimer = 0.0;
                            } else {
                                this.targetFloor = next;
                                this.direction = next > this.currentFloor ? 1 : -1;
                                this.state = STATE.MOVING;
                            }
                        } else {
                            this.direction = 0;
                            this.state = STATE.IDLE;
                        }
                    }
                    break;
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
