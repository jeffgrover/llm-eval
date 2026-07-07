// elevator_logic.js - Pure elevator scheduler/state machine, no Three.js or DOM

(function(root) {
    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 } = {}) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;

            // State machine states
            this.IDLE = 0;
            this.MOVING = 1;
            this.DOOR_OPENING = 2;
            this.DOOR_OPEN = 3;
            this.DOOR_CLOSING = 4;

            // Current state
            this.state = this.IDLE;

            // Position and direction
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // +1 up, -1 down, 0 idle

            // Calls and destinations
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            // Passengers and boarding
            this.passengers = new Set();      // People inside car
            this.pendingBoarders = new Set(); // People waiting to board
            this.pendingDisembark = new Set(); // People waiting to exit

            // Interior boarding spots (4 logical positions)
            this.spotOccupancy = [false, false, false, false];

            // Door timing
            this.doorOpenTimer = 0;
            this.MIN_DOOR_OPEN_S = 1.0;
            this.MAX_DOOR_OPEN_S = 5.0;

            // Anti-starvation tracking
            this.servedThisDoorCycle = new Set();
            this.lastServedFloor = null;

            // Reset to initial state
            this.reset();
        }

        reset() {
            this.state = this.IDLE;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = [false, false, false, false];
            this.doorOpenTimer = 0;
            this.servedThisDoorCycle.clear();
            this.lastServedFloor = null;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
                this.destinations.add(floor);
            }
        }

        isAcceptingAt(floor, direction) {
            // True only when car is at floor in DOOR_OPEN state AND
            // either no more stops pending in current direction OR caller's direction matches car's
            if (this.state !== this.DOOR_OPEN || this.currentFloor !== floor) {
                return false;
            }

            const hasStopsInDirection = this.hasStopsInDirection(direction);
            return !hasStopsInDirection || direction === this.direction;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            const free = this.currentCapacityFree();
            if (free <= 0) return null;

            // Find first available spot
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = true;
                    this.pendingBoarders.add(person);
                    return { index: i, x: (i % 2) * 0.8 - 0.4, y: 0, z: 0.5 }; // Car-local positions
                }
            }

            return null;
        }

        completeBoard(person) {
            if (this.pendingBoarders.has(person)) {
                this.passengers.add(person);
                this.pendingBoarders.delete(person);
                
                // Find and free the spot
                for (let i = 0; i < this.spotOccupancy.length; i++) {
                    if (person.boardingSpotIndex === i) {
                        this.spotOccupancy[i] = false;
                        break;
                    }
                }
            }
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.pendingDisembark.add(person);
                this.passengers.delete(person);
                
                // Free the spot
                for (let i = 0; i < this.spotOccupancy.length; i++) {
                    if (person.boardingSpotIndex === i) {
                        this.spotOccupancy[i] = false;
                        break;
                    }
                }
            }
        }

        completeDisembark(person) {
            if (this.pendingDisembark.has(person)) {
                this.pendingDisembark.delete(person);
            }
        }

        tick(dt) {
            // State machine transitions
            switch (this.state) {
                case this.IDLE:
                    this.handleIdleState(dt);
                    break;
                case this.MOVING:
                    this.handleMovingState(dt);
                    break;
                case this.DOOR_OPENING:
                    this.handleDoorOpening(dt);
                    break;
                case this.DOOR_OPEN:
                    this.handleDoorOpen(dt);
                    break;
                case this.DOOR_CLOSING:
                    this.handleDoorClosing(dt);
                    break;
            }
        }

        handleIdleState(dt) {
            // Check if there's work to do
            const nextTarget = this.findNextTarget();
            if (nextTarget !== null) {
                this.targetFloor = nextTarget;
                this.direction = nextTarget > this.currentFloor ? 1 : nextTarget < this.currentFloor ? -1 : 0;
                this.state = this.MOVING;
            }
        }

        handleMovingState(dt) {
            // Move towards target floor
            const moveSpeed = 3.4 * dt; // One floor per second at 1x
            
            if (this.direction > 0) {
                this.currentFloor += moveSpeed;
                if (this.currentFloor >= this.targetFloor) {
                    this.currentFloor = this.targetFloor;
                    this.state = this.DOOR_OPENING;
                    this.doorOpenTimer = 0;
                }
            } else if (this.direction < 0) {
                this.currentFloor -= moveSpeed;
                if (this.currentFloor <= this.targetFloor) {
                    this.currentFloor = this.targetFloor;
                    this.state = this.DOOR_OPENING;
                    this.doorOpenTimer = 0;
                }
            }

            // Re-evaluate target during movement - look for closer same-direction stop
            const closerTarget = this.findCloserStopInDirection();
            if (closerTarget !== null && Math.abs(closerTarget - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                this.targetFloor = closerTarget;
            }
        }

        handleDoorOpening(dt) {
            // Transition to DOOR_OPEN after short delay
            this.doorOpenTimer += dt;
            if (this.doorOpenTimer >= 0.5) {
                this.state = this.DOOR_OPEN;
                this.doorOpenTimer = 0;
            }
        }

        handleDoorOpen(dt) {
            this.doorOpenTimer += dt;

            // Keep doors open while there are pending boarders or disembarkers
            if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                // Reset timer to keep open
                this.doorOpenTimer = 0;
            } else if (this.doorOpenTimer >= this.MIN_DOOR_OPEN_S) {
                // Minimum open time met and no one waiting - start closing
                this.state = this.DOOR_CLOSING;
                this.doorOpenTimer = 0;
            }

            // Safety cap: force close after MAX_DOOR_OPEN_S
            if (this.doorOpenTimer >= this.MAX_DOOR_OPEN_S) {
                this.state = this.DOOR_CLOSING;
                this.doorOpenTimer = 0;
            }
        }

        handleDoorClosing(dt) {
            // Transition to IDLE or MOVING after short delay
            this.doorOpenTimer += dt;
            if (this.doorOpenTimer >= 0.5) {
                if (this.hasWork()) {
                    this.state = this.MOVING;
                } else {
                    this.state = this.IDLE;
                    this.direction = 0;
                    this.targetFloor = this.currentFloor;
                }
            }
        }

        findNextTarget() {
            // Combine all pending requests
            const candidates = new Set();
            
            // Add destinations (passengers inside car)
            for (const dest of this.destinations) {
                candidates.add(dest);
            }

            // Add hall calls based on current direction
            if (this.direction === 1 || this.direction === 0) {
                for (const floor of this.upCalls) {
                    if (floor > this.currentFloor) {
                        candidates.add(floor);
                    }
                }
            }
            if (this.direction === -1 || this.direction === 0) {
                for (const floor of this.downCalls) {
                    if (floor < this.currentFloor) {
                        candidates.add(floor);
                    }
                }
            }

            // If no candidates in current direction, reverse
            if (candidates.size === 0) {
                // Look for any remaining calls/destinations
                for (const floor of this.destinations) {
                    candidates.add(floor);
                }
                for (const floor of this.upCalls) {
                    candidates.add(floor);
                }
                for (const floor of this.downCalls) {
                    candidates.add(floor);
                }

                if (candidates.size > 0) {
                    // Pick nearest regardless of direction
                    let nearest = null;
                    let minDist = Infinity;
                    for (const floor of candidates) {
                        const dist = Math.abs(floor - this.currentFloor);
                        if (dist < minDist) {
                            minDist = dist;
                            nearest = floor;
                        }
                    }
                    return nearest;
                }

                // No work at all - stay idle
                return null;
            }

            // Pick nearest in current direction
            let best = null;
            let minDist = Infinity;
            
            for (const floor of candidates) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < minDist) {
                    minDist = dist;
                    best = floor;
                }
            }

            return best;
        }

        findCloserStopInDirection() {
            // Called during MOVING state to see if we can shorten target
            let closer = null;
            let minDist = Infinity;

            const checkFloor = (floor) => {
                if (floor === this.currentFloor) return;
                
                let shouldCheck = false;
                if (this.direction === 1 && floor > this.currentFloor) shouldCheck = true;
                if (this.direction === -1 && floor < this.currentFloor) shouldCheck = true;

                if (shouldCheck) {
                    const dist = Math.abs(floor - this.currentFloor);
                    if (dist < minDist) {
                        minDist = dist;
                        closer = floor;
                    }
                }
            };

            for (const floor of this.destinations) checkFloor(floor);
            for (const floor of this.upCalls) checkFloor(floor);
            for (const floor of this.downCalls) checkFloor(floor);

            return closer;
        }

        hasStopsInDirection(dir) {
            const check = (set, condition) => {
                for (const floor of set) {
                    if (condition(floor)) return true;
                }
                return false;
            };

            if (dir === 1) {
                return check(this.destinations, f => f > this.currentFloor) ||
                       check(this.upCalls, f => f > this.currentFloor);
            } else if (dir === -1) {
                return check(this.destinations, f => f < this.currentFloor) ||
                       check(this.downCalls, f => f < this.currentFloor);
            }

            return false;
        }

        hasWork() {
            return this.destinations.size > 0 || 
                   this.upCalls.size > 0 || 
                   this.downCalls.size > 0 ||
                   this.pendingBoarders.size > 0 ||
                   this.pendingDisembark.size > 0;
        }

        // Expose state for debugging/monitoring
        getState() {
            return {
                state: this.state,
                currentFloor: this.currentFloor,
                targetFloor: this.targetFloor,
                direction: this.direction,
                upCalls: Array.from(this.upCalls),
                downCalls: Array.from(this.downCalls),
                destinations: Array.from(this.destinations),
                passengers: this.passengers.size,
                pendingBoarders: this.pendingBoarders.size,
                pendingDisembark: this.pendingDisembark.size,
                capacityFree: this.currentCapacityFree()
            };
        }
    }

    // Export for both browser and Node.js
    root.ElevatorLogic = ElevatorLogic;
    
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
