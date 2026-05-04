(function(root) {
    const STATES = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.minDoorOpen = options.minDoorOpen || 2.5;
            this.maxDoorOpen = options.maxDoorOpen || 15.0;

            this.reset();
        }

        reset() {
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // +1 up, -1 down, 0 idle
            this.state = STATES.IDLE;
            this.doorTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(4).fill(null);
            this.servedThisCycle = false;
            this.lastServedFloor = -1;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            if (this.currentFloor !== floor || this.state !== STATES.DOOR_OPEN) return false;
            if (this.pendingBoarders.size + this.pendingDisembark.size > 0) return true;
            
            const hasPendingInDirection = this._hasWorkInDirection(direction);
            if (!hasPendingInDirection) return true;
            
            return this.direction === direction || this.direction === 0;
        }

        _hasWorkInDirection(dir) {
            if (dir > 0) {
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) return true;
                }
            } else if (dir < 0) {
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) return true;
                }
            }
            return false;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) {
                    this.pendingBoarders.add(person);
                    this.spotOccupancy[i] = person;
                    const x = (i % 2 === 0 ? -0.7 : 0.7);
                    const z = (i < 2 ? -0.7 : 0.7);
                    return { index: i, x: x, y: 0.8, z: z };
                }
            }
            return null;
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.pendingDisembark.add(person);
                this.passengers.delete(person);
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            for (let i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
        }

        tick(dt) {
            this.doorTimer += dt;

            switch (this.state) {
                case STATES.IDLE:
                    if (this._shouldMove()) {
                        this._chooseTarget();
                        if (this.targetFloor !== this.currentFloor) {
                            this.state = STATES.MOVING;
                            this.doorTimer = 0;
                        } else {
                            this.state = STATES.DOOR_OPENING;
                            this.doorTimer = 0;
                        }
                    }
                    break;

                case STATES.MOVING:
                    const moveDir = Math.sign(this.targetFloor - this.currentFloor);
                    if (moveDir !== 0) this.direction = moveDir;

                    const distance = Math.abs(this.targetFloor - this.currentFloor);
                    const speed = 4.0;
                    const progress = Math.min(dt * speed / this.floorHeight, distance);
                    
                    this.currentFloor += progress * moveDir;

                    if (Math.abs(this.currentFloor - this.targetFloor) < 0.01) {
                        this.currentFloor = Math.round(this.targetFloor);
                        this.targetFloor = this.currentFloor;
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        this.servedThisCycle = false;
                    }

                    // Re-evaluate for closer stops
                    this._recalculateTargetDuringMove();
                    break;

                case STATES.DOOR_OPENING:
                    if (this.doorTimer > 1.0) {
                        this.state = STATES.DOOR_OPEN;
                        this.doorTimer = 0;
                        this._clearCallsAtCurrentFloor();
                    }
                    break;

                case STATES.DOOR_OPEN:
                    if ((this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0 && 
                         this.doorTimer > this.minDoorOpen) || this.doorTimer > this.maxDoorOpen) {
                        this.state = STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;

                case STATES.DOOR_CLOSING:
                    if (this.doorTimer > 1.2) {
                        this.state = STATES.IDLE;
                        this.servedThisCycle = true;
                        this.lastServedFloor = this.currentFloor;
                        if (this._shouldMove()) {
                            this._chooseTarget();
                            if (this.targetFloor !== this.currentFloor) {
                                this.state = STATES.MOVING;
                            }
                        }
                    }
                    break;
            }
        }

        _shouldMove() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        _chooseTarget() {
            let bestFloor = this.currentFloor;
            let bestDist = Infinity;

            // Prefer passenger destinations first - this prevents lobby starvation
            for (let f of this.destinations) {
                const d = Math.abs(f - this.currentFloor);
                if (d > 0 && d < bestDist) {
                    bestDist = d;
                    bestFloor = f;
                }
            }

            if (bestFloor !== this.currentFloor) {
                this.targetFloor = bestFloor;
                this.direction = Math.sign(bestFloor - this.currentFloor) || 1;
                return;
            }

            // Hall calls in current direction
            let dir = this.direction || 1;
            let calls = dir > 0 ? this.upCalls : this.downCalls;
            
            for (let f of calls) {
                if ((dir > 0 && f > this.currentFloor) || (dir < 0 && f < this.currentFloor)) {
                    const d = Math.abs(f - this.currentFloor);
                    if (d < bestDist) {
                        bestDist = d;
                        bestFloor = f;
                    }
                }
            }

            if (bestFloor !== this.currentFloor) {
                this.targetFloor = bestFloor;
                this.direction = dir;
                return;
            }

            // Reverse direction if nothing ahead
            dir = -dir;
            this.direction = dir;
            calls = dir > 0 ? this.upCalls : this.downCalls;
            bestDist = Infinity;
            bestFloor = -1;
            
            for (let f of calls) {
                const d = Math.abs(f - this.currentFloor);
                if (d > 0 && d < bestDist) {
                    bestDist = d;
                    bestFloor = f;
                }
            }
            
            if (bestFloor !== -1) {
                this.targetFloor = bestFloor;
                return;
            }

            // Final fallback - nearest any call
            for (let f of this.upCalls) {
                const d = Math.abs(f - this.currentFloor);
                if (d > 0 && d < bestDist) {
                    bestDist = d;
                    bestFloor = f;
                }
            }
            for (let f of this.downCalls) {
                const d = Math.abs(f - this.currentFloor);
                if (d > 0 && d < bestDist) {
                    bestDist = d;
                    bestFloor = f;
                }
            }
            if (bestFloor !== -1) {
                this.targetFloor = bestFloor;
                this.direction = Math.sign(bestFloor - this.currentFloor) || 1;
            }
        }

        _recalculateTargetDuringMove() {
            if (this.state !== STATES.MOVING) return;
            
            const dir = Math.sign(this.targetFloor - this.currentFloor);
            if (dir === 0) return;

            let closer = this.targetFloor;
            
            // Check destinations
            for (let f of this.destinations) {
                if ((dir > 0 && f > this.currentFloor && f < this.targetFloor) || 
                    (dir < 0 && f < this.currentFloor && f > this.targetFloor)) {
                    closer = f;
                }
            }
            
            // Check matching direction calls
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (let f of calls) {
                if ((dir > 0 && f > this.currentFloor && f < this.targetFloor) || 
                    (dir < 0 && f < this.currentFloor && f > this.targetFloor)) {
                    closer = f;
                }
            }

            if (closer !== this.targetFloor) {
                this.targetFloor = closer;
            }
        }

        _clearCallsAtCurrentFloor() {
            this.destinations.delete(this.currentFloor);
            
            if (this.direction > 0) {
                this.upCalls.delete(this.currentFloor);
                if (!this._hasWorkInDirection(1)) this.downCalls.delete(this.currentFloor);
            } else if (this.direction < 0) {
                this.downCalls.delete(this.currentFloor);
                if (!this._hasWorkInDirection(-1)) this.upCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
