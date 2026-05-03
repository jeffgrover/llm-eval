(function(root) {
    const STATE = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    const MIN_DOOR_OPEN_S = 3.0;
    const MAX_DOOR_OPEN_S = 10.0;
    const DOOR_TRANSITION_S = 1.0; // time to open or close
    const SPEED = 4.0; // units per second

    class ElevatorLogic {
        constructor(opts = {}) {
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;

            this.STATE = STATE;

            this.reset();
        }

        reset() {
            this.state = STATE.IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.carY = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = [null, null, null, null];

            this.doorTimer = 0;
            this.doorOpenDuration = 0;
            this.servedThisDoorCycle = new Set(); // Prevent immediate reopening
            
            // To track if we recently served a floor for a specific direction to prevent starvation
            this.lastServedFloor = -1;
            this.lastServedDirection = 0;
        }

        callUp(floor) { if (floor < this.floorCount - 1) this.upCalls.add(floor); }
        callDown(floor) { if (floor > 0) this.downCalls.add(floor); }
        pressDestination(floor) { if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor); }

        isAcceptingAt(floor, dir) {
            if (this.state !== STATE.DOOR_OPEN || this.currentFloor !== floor) return false;
            
            // If car is idle and doors open, it accepts anyone
            if (this.direction === 0) return true;

            // If the car has a direction, it only accepts matching direction
            // unless there are NO more requests in the current direction.
            if (this.direction === dir) return true;
            
            if (!this.hasWorkInDirection(this.currentFloor, this.direction)) {
                return true; // We are about to change direction or go idle anyway
            }

            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    
                    const spots = [
                        {x: -0.6, y: 0, z: -0.6},
                        {x:  0.6, y: 0, z: -0.6},
                        {x: -0.6, y: 0, z:  0.6},
                        {x:  0.6, y: 0, z:  0.6}
                    ];
                    return { index: i, ...spots[i] };
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
                this.pendingDisembark.add(person);
            }
        }

        completeDisembark(person) {
            this.passengers.delete(person);
            this.pendingDisembark.delete(person);
            for (let i = 0; i < this.maxCapacity; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                }
            }
        }

        tick(dt) {
            switch (this.state) {
                case STATE.IDLE:
                    this.pickNextTarget();
                    break;

                case STATE.MOVING:
                    // Re-evaluate target in case a closer one appeared
                    this.pickNextTarget(true); 

                    const targetY = this.targetFloor * this.floorHeight;
                    const dist = targetY - this.carY;
                    const step = SPEED * dt;

                    if (Math.abs(dist) <= step) {
                        this.carY = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = STATE.DOOR_OPENING;
                        this.doorTimer = 0;
                    } else {
                        this.carY += Math.sign(dist) * step;
                        this.currentFloor = Math.round(this.carY / this.floorHeight);
                    }
                    break;

                case STATE.DOOR_OPENING:
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_TRANSITION_S) {
                        this.state = STATE.DOOR_OPEN;
                        this.doorOpenDuration = 0;
                        this.servedThisDoorCycle.add(this.currentFloor);
                        this.lastServedFloor = this.currentFloor;
                        this.lastServedDirection = this.direction;
                        this.arriveAtFloor();
                    }
                    break;

                case STATE.DOOR_OPEN:
                    this.doorOpenDuration += dt;
                    
                    // Keep open if boarding/disembarking, but force close if MAX_DOOR_OPEN_S exceeded
                    const isTransferring = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    
                    if ((!isTransferring && this.doorOpenDuration >= MIN_DOOR_OPEN_S) || 
                        this.doorOpenDuration >= MAX_DOOR_OPEN_S) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;

                case STATE.DOOR_CLOSING:
                    this.doorTimer += dt;
                    if (this.doorTimer >= DOOR_TRANSITION_S) {
                        this.servedThisDoorCycle.clear();
                        this.state = STATE.IDLE; // Will immediately pick next target next tick
                    } else {
                        // Reopen if someone new presses the button while closing and we can accept them
                        // But ONLY if we don't have passengers with destinations! (Anti-starvation)
                        if (this.passengers.size === 0 || this.destinations.size === 0) {
                             if ((this.direction === 1 || this.direction === 0) && this.upCalls.has(this.currentFloor) && this.currentCapacityFree() > 0) {
                                 this.state = STATE.DOOR_OPENING;
                                 this.doorTimer = Math.max(0, DOOR_TRANSITION_S - this.doorTimer); // Reverse animation
                             } else if ((this.direction === -1 || this.direction === 0) && this.downCalls.has(this.currentFloor) && this.currentCapacityFree() > 0) {
                                 this.state = STATE.DOOR_OPENING;
                                 this.doorTimer = Math.max(0, DOOR_TRANSITION_S - this.doorTimer);
                             }
                        }
                    }
                    break;
            }
        }

        arriveAtFloor() {
            this.destinations.delete(this.currentFloor);
            
            if (this.direction === 1) {
                this.upCalls.delete(this.currentFloor);
            } else if (this.direction === -1) {
                this.downCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }

            // If no more stops in current direction, clear opposite call as well
            if (this.direction !== 0 && !this.hasWorkInDirection(this.currentFloor, this.direction)) {
                if (this.direction === 1) this.downCalls.delete(this.currentFloor);
                if (this.direction === -1) this.upCalls.delete(this.currentFloor);
            }
        }

        hasWorkInDirection(floor, dir) {
            if (dir === 1) {
                for (let i = floor + 1; i < this.floorCount; i++) {
                    if (this.destinations.has(i) || this.upCalls.has(i) || this.downCalls.has(i)) return true;
                }
            } else if (dir === -1) {
                for (let i = floor - 1; i >= 0; i--) {
                    if (this.destinations.has(i) || this.upCalls.has(i) || this.downCalls.has(i)) return true;
                }
            }
            return false;
        }

        pickNextTarget(isReevaluating = false) {
            let nextTarget = -1;

            if (this.direction !== 0) {
                // If reevaluating, we only want to see if there is a CLOSER target.
                // But we must include our current target in the search if we haven't arrived yet.
                // A simpler way: just search from current car position.
                let searchFloor = isReevaluating ? (this.direction === 1 ? Math.floor(this.carY / this.floorHeight) : Math.ceil(this.carY / this.floorHeight)) : this.currentFloor;
                
                nextTarget = this.findClosestStopInDirection(searchFloor, this.direction, isReevaluating);
                if (nextTarget !== -1) {
                    this.targetFloor = nextTarget;
                    this.state = STATE.MOVING;
                    return;
                }

                // No work ahead. Reverse direction.
                this.direction *= -1;
                
                // If we reversed and are already AT a floor with a call, open doors if we didn't just serve it
                if (!isReevaluating && this.hasCallAt(this.currentFloor, this.direction) && !this.servedThisDoorCycle.has(this.currentFloor)) {
                     this.targetFloor = this.currentFloor;
                     this.state = STATE.DOOR_OPENING;
                     this.doorTimer = 0;
                     return;
                }

                nextTarget = this.findClosestStopInDirection(this.currentFloor, this.direction, isReevaluating);
                if (nextTarget !== -1) {
                    this.targetFloor = nextTarget;
                    this.state = STATE.MOVING;
                    return;
                }

                // No work anywhere.
                this.direction = 0;
                if (!isReevaluating) this.state = STATE.IDLE;
            }

            if (this.direction === 0) {
                if (this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0) {
                    nextTarget = this.findClosestAbsoluteStop(this.currentFloor);
                    if (nextTarget !== -1) {
                        this.targetFloor = nextTarget;
                        if (this.targetFloor === this.currentFloor) {
                            if (!isReevaluating && !this.servedThisDoorCycle.has(this.currentFloor)) {
                                // Infer direction from the call at this floor
                                if (this.upCalls.has(this.currentFloor)) this.direction = 1;
                                else if (this.downCalls.has(this.currentFloor)) this.direction = -1;
                                else this.direction = 1; // Default
                                
                                this.state = STATE.DOOR_OPENING;
                                this.doorTimer = 0;
                            } else {
                                // Wait
                            }
                        } else {
                            this.direction = this.targetFloor > this.currentFloor ? 1 : -1;
                            this.state = STATE.MOVING;
                        }
                    }
                }
            }
        }

        hasCallAt(floor, dir) {
            if (this.destinations.has(floor)) return true;
            if (dir === 1 && this.upCalls.has(floor)) return true;
            if (dir === -1 && this.downCalls.has(floor)) return true;
            // Also if there's an opposite call and NO work ahead, we can serve it
            if (dir === 1 && this.downCalls.has(floor) && !this.hasWorkInDirection(floor, 1)) return true;
            if (dir === -1 && this.upCalls.has(floor) && !this.hasWorkInDirection(floor, -1)) return true;
            return false;
        }

        findClosestStopInDirection(floor, dir, isReevaluating) {
            if (dir === 1) {
                for (let i = floor + (isReevaluating ? 1 : 0); i < this.floorCount; i++) {
                    if (this.destinations.has(i) || this.upCalls.has(i)) {
                         // Passenger destinations outrank same-floor hall calls to prevent starvation.
                         if (i === floor && this.passengers.size > 0 && this.destinations.size > 0 && !this.destinations.has(floor)) {
                             // Skip same floor call if we have passengers going elsewhere
                             continue;
                         }
                         return i;
                    }
                    if (this.downCalls.has(i) && !this.hasWorkInDirection(i, 1)) return i; // Pickup top-most down call
                }
            } else if (dir === -1) {
                for (let i = floor - (isReevaluating ? 1 : 0); i >= 0; i--) {
                    if (this.destinations.has(i) || this.downCalls.has(i)) {
                         if (i === floor && this.passengers.size > 0 && this.destinations.size > 0 && !this.destinations.has(floor)) {
                             continue;
                         }
                         return i;
                    }
                    if (this.upCalls.has(i) && !this.hasWorkInDirection(i, -1)) return i; // Pickup bottom-most up call
                }
            }
            return -1;
        }

        findClosestAbsoluteStop(floor) {
            let closest = -1;
            let minDist = Infinity;

            const check = (i) => {
                if (this.destinations.has(i) || this.upCalls.has(i) || this.downCalls.has(i)) {
                    let dist = Math.abs(i - floor);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = i;
                    }
                }
            };

            for (let i = 0; i < this.floorCount; i++) {
                check(i);
            }
            
            // Anti-starvation: if at floor 0, have passengers, and they want to go UP, don't reopen at 0 just for upCalls
            if (closest === floor && this.passengers.size > 0 && this.destinations.size > 0 && !this.destinations.has(floor)) {
                 closest = -1; minDist = Infinity;
                 for (let i = 0; i < this.floorCount; i++) {
                     if (i !== floor) check(i);
                 }
            }

            return closest;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
