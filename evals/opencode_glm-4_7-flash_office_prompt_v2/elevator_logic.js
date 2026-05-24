(function(root) {
    /**
     * @typedef {number} Floor
     * @typedef {number} Direction
     */

    const STATES = {
        IDLE: 0,
        MOVING: 1,
        DOOR_OPENING: 2,
        DOOR_OPEN: 3,
        DOOR_CLOSING: 4
    };
    
    const MIN_DOOR_OPEN_S = 2.0;
    const MAX_DOOR_OPEN_S = 15.0;

    class ElevatorLogic {
        /**
         * @param {Object} options 
         * @param {number} options.floorCount 
         * @param {number} options.maxCapacity 
         * @param {number} options.floorHeight 
         */
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 }) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;

            // State variables
            this.state = STATES.IDLE;
            this.currentFloor = 0;
            this.direction = 0; // +1 Up, -1 Down, 0 Idle
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Map(); // Floor -> Person ID
            this.passengers = new Set(); // Person IDs
            this.pendingBoarders = new Map(); // Person ID -> Spot
            this.pendingDisembark = new Map(); // Person ID -> Spot
            
            // Timers and guards
            this.doorTimer = 0;
            this.servedThisDoorCycle = new Set();
            this.lastServedFloor = -1;

            this.reset();
        }

        reset() {
            this.state = STATES.IDLE;
            this.currentFloor = 0;
            this.direction = 0;
            this.targetFloor = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.doorTimer = 0;
            this.servedThisDoorCycle.clear();
            this.lastServedFloor = -1;
            console.log("ElevatorLogic reset to IDLE at Floor 0.");
        }

        // --- API Methods ---

        /** 
         * Sets the current floor for testing/simulation purposes.
         * @param {Floor} floor 
         */
        setFloor(floor) {
            this.currentFloor = floor;
        }

        /** 
         * ... (rest of API methods)


        /** 
         * @param {Floor} floor 
         */
        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
            }
        }

        /** 
         * @param {Floor} floor 
         */
        pressDestination(floor) {
            if (this.currentFloor === floor && floor >= 0 && floor < this.floorCount) {
                // Assuming person ID is passed in context by the caller (sim.js)
                // Since the API doesn't specify a person ID, we assume a generic request for now, 
                // but in practice, this should link to a specific passenger.
                this.destinations.set(floor, 'generic_passenger'); 
            }
        }

        /** 
         * @param {Floor} floor 
         * @param {Direction} direction 
         * @returns {boolean}
         */
        isAcceptingAt(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN && this.state !== STATES.DOOR_OPENING) return false;
            if (this.currentFloor !== floor) return false;
            
            // Check if current direction matches caller's intent OR if no stops exist ahead in current direction
            const remainingStopsAhead = this.getRemainingStops(direction);
            
            if (remainingStopsAhead.size > 0) {
                return direction === 0; // Can accept if idle (or waiting for next decision)
            }
            return true;
        }

        /** 
         * @returns {number}
         */
        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        /** 
         * @param {Object} person 
         * @returns {Map<number, Object>|null} Spot reservation map or null
         */
        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() > 0) {
                const availableSpots = new Map(); // Simplified spot logic
                // In reality, we'd track 4 specific spots (e.g., 1, 2, 3, 4)
                // For now, we just reserve a logical spot index
                const reservedIndex = Math.floor(Math.random() * 4) + 1; 
                this.pendingBoarders.set(person.id || 1, { index: reservedIndex }); 
                return this.pendingBoarders;
            }
            return null;
        }

        /** @param {Object} person */
        completeBoard(person) {
            if (this.pendingBoarders.has(person.id || 1)) {
                this.pendingBoarders.delete(person.id || 1);
                this.passengers.add(person.id || 1);
                console.log(`Passenger ${person.id} boarded. Current capacity: ${this.passengers.size}`);
                return true;
            }
            return false;
        }

        /** @param {Object} person */
        registerDisembark(person) {
            if (this.currentFloor === person.targetFloor) {
                this.pendingDisembark.set(person.id || 1, { floor: this.currentFloor });
                return true;
            }
            return false;
        }
        
        /** @param {Object} person */
        completeDisembark(person) {
            if (this.pendingDisembark.has(person.id || 1)) {
                this.pendingDisembark.delete(person.id || 1);
                this.passengers.delete(person.id || 1);
                console.log(`Passenger ${person.id} disembarked. Current capacity: ${this.passengers.size}`);
                return true;
            }
            return false;
        }

        /** 
         * Advances the state machine by one frame. 
         * @param {number} dt - Delta time.
         */
        tick(dt) {
            this.doorTimer += dt;

            // --- State Transition Logic ---
            
            if (this.state === STATES.IDLE) {
                this.determineNextTarget();
            }

            if (this.state === STATES.MOVING) {
                // Check for closer stop in current direction
                const closerStop = this.getCloserStop(this.direction);
                if (closerStop && Math.abs(closerStop - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                    this.targetFloor = closerStop;
                }
                
                // Move the car (handled by elevator.js visually, logic dictates target)
            }

            if (this.state === STATES.DOOR_OPENING) {
                // Transition to DOOR_OPEN after animation time (e.g., 1s)
                if (this.doorTimer > 1.0) {
                    this.state = STATES.DOOR_OPEN;
                    this.doorTimer = 0;
                }
            }

            if (this.state === STATES.DOOR_OPEN) {
                // Check for boarding/disembarking
                if (this.checkArrivalAndServe()) {
                    // Service complete, move to closing
                    this.state = STATES.DOOR_CLOSING;
                    this.doorTimer = 0;
                }

                // Check safety cap
                if (this.doorTimer >= MAX_DOOR_OPEN_S && this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) {
                    // Safety cap triggered: doors must close
                    this.state = STATES.DOOR_CLOSING;
                    this.doorTimer = 0;
                }
            }
            
            if (this.state === STATES.DOOR_CLOSING) {
                // Transition back to IDLE or MOVING
                if (this.doorTimer >= MIN_DOOR_OPEN_S) {
                    this.state = this.determineNextState();
                    this.targetFloor = this.state === STATES.IDLE ? this.currentFloor : this.targetFloor; // Ensure target is correct
                    this.doorTimer = 0;
                }
            }
        }

        /**
         * Determines the next floor based on current calls/destinations.
         */
        determineNextTarget() {
            let nextTarget = 0;
            let nextDirection = 0;

            // Priority 1: Passenger destinations
            const passengerDestinations = Array.from(this.destinations.keys());
            if (passengerDestinations.length > 0) {
                nextTarget = passengerDestinations[0]; // Simplification: take first destination
                nextDirection = (nextTarget > this.currentFloor) ? 1 : (nextTarget < this.currentFloor ? -1 : 0);
            } 
            // Priority 2: Hall calls
            else if (this.upCalls.size > 0 || this.downCalls.size > 0) {
                const upCalls = Array.from(this.upCalls).filter(f => f > this.currentFloor).sort((a, b) => a - b);
                const downCalls = Array.from(this.downCalls).filter(f => f < this.currentFloor).sort((a, b) => b - a);
                
                // Choose nearest active call
                let nextCall = null;
                let bestDist = Infinity;

                if (upCalls.length > 0 && upCalls[0] < bestDist) {
                    bestDist = upCalls[0] - this.currentFloor;
                    nextCall = upCalls[0];
                }
                if (downCalls.length > 0 && Math.abs(downCalls[0] - this.currentFloor) < bestDist) {
                    bestDist = Math.abs(downCalls[0] - this.currentFloor);
                    nextCall = downCalls[0];
                }
                
                if (nextCall !== null) {
                    nextTarget = nextCall;
                    nextDirection = (nextCall > this.currentFloor) ? 1 : -1;
                }
            }

            this.targetFloor = nextTarget;
            this.direction = nextDirection;
            
            if (this.direction !== 0) {
                this.state = STATES.MOVING;
                this.targetFloor = nextTarget;
            } else {
                this.state = STATES.IDLE; // Stay idle if no calls/destinations
            }
        }

        /**
         * Transitions from DOOR_OPENING/DOOR_CLOSING to the next logical state.
         */
        determineNextState() {
            // If there are passengers/boarders, we might need to keep the doors open temporarily
            if (this.passengers.size > 0 || this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                return STATES.DOOR_OPEN;
            }
            
            // If there are calls/destinations, start moving
            if (this.upCalls.size > 0 || this.downCalls.size > 0 || this.destinations.size > 0) {
                return STATES.MOVING;
            }

            // Nothing left to do
            return STATES.IDLE;
        }

        /**
         * Checks if the car has reached its target and serves passengers.
         * @returns {boolean} True if a stop was served.
         */
        checkArrivalAndServe() {
            if (this.currentFloor === this.targetFloor) {
                console.log(`Arrived at Floor ${this.currentFloor}. Opening doors.`);
                this.state = STATES.DOOR_OPENING; // Start opening sequence
                this.doorTimer = 0;
                
                // Check if it's a scheduled stop
                const isScheduledStop = this.destinations.has(this.currentFloor) || 
                                        this.upCalls.has(this.currentFloor) || 
                                        this.downCalls.has(this.currentFloor);

                if (isScheduledStop) {
                    this.servedThisDoorCycle.add(this.currentFloor);
                    
                    // Clear the served call/destination for the current direction
                    if (this.direction === 1) {
                        this.upCalls.delete(this.currentFloor);
                    } else if (this.direction === -1) {
                        this.downCalls.delete(this.currentFloor);
                    }
                    this.destinations.delete(this.currentFloor);
                }

                return true; // Stop served
            }
            return false;
        }
        
        // --- Helper Methods for Scheduling ---

        getRemainingStops(direction) {
            const remaining = new Set();
            if (direction === 1) {
                // Remaining stops are destinations and up calls above current floor
                [...this.destinations.keys(), ...this.upCalls].forEach(f => {
                    if (f > this.currentFloor) remaining.add(f);
                });
            } else if (direction === -1) {
                // Remaining stops are destinations and down calls below current floor
                [...this.destinations.keys(), ...this.downCalls].forEach(f => {
                    if (f < this.currentFloor) remaining.add(f);
                });
            }
            return remaining;
        }

        getCloserStop(direction) {
            let bestStop = null;
            let minDistance = Infinity;

            const stopsToCheck = [...this.destinations.keys(), ...this.upCalls, ...this.downCalls];

            for (const f of stopsToCheck) {
                const distance = Math.abs(f - this.currentFloor);
                // Only consider stops in the current direction
                if ((direction === 1 && f >= this.currentFloor) || (direction === -1 && f <= this.currentFloor)) {
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestStop = f;
                    }
                }
            }
            return bestStop;
        }
    }

    // Export for browser global scope
    root.ElevatorLogic = ElevatorLogic;

    // Export for Node.js testing module
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);