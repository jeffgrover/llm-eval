(function(root) {
    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 } = {}) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;
            this.reset();
        }

        reset() {
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Map();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [false, false, false, false];
            
            this.state = 'IDLE';
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            
            this.doorTimer = 0;
            this.servedThisDoorCycle = new Set();
            this.lastServedFloor = -1;
            
            this.MOVING_SPEED = 2.5;
            this.MIN_DOOR_OPEN_S = 1.5;
            this.MAX_DOOR_OPEN_S = 10.0;
            
            this.positionY = 0;
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

        isAcceptingAt(floor, direction) {
            if (this.state !== 'DOOR_OPEN') return false;
            if (this.currentFloor !== floor) return false;
            
            if (this.pendingBoarders.size >= this.maxCapacity) return false;
            
            if (this.destinations.size === 0 && this.upCalls.size === 0 && this.downCalls.size === 0) {
                return true;
            }
            
            if (this.direction === 0) return true;
            
            if (this.direction === direction) return true;
            
            if (this.direction !== 0 && this.destinations.size > 0) {
                if (this.direction === 1 && floor < this.currentFloor) return false;
                if (this.direction === -1 && floor > this.currentFloor) return false;
            }
            
            return true;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            
            const idx = this.spotOccupancy.findIndex(s => !s);
            if (idx === -1) return null;
            
            this.spotOccupancy[idx] = true;
            this.pendingBoarders.set(person, { index: idx });
            
            const offsets = [
                { x: -0.5, z: 0.3 },
                { x: 0.5, z: 0.3 },
                { x: -0.5, z: -0.3 },
                { x: 0.5, z: -0.3 }
            ];
            const off = offsets[idx];
            
            return {
                index: idx,
                x: off.x,
                y: 0,
                z: off.z
            };
        }

        completeBoard(person) {
            const spot = this.pendingBoarders.get(person);
            if (spot) {
                this.passengers.set(person, spot);
                this.pendingBoarders.delete(person);
            }
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            const spot = this.passengers.get(person);
            if (spot) {
                this.spotOccupancy[spot.index] = false;
                this.passengers.delete(person);
            }
            this.pendingDisembark.delete(person);
        }

        tick(dt) {
            switch (this.state) {
                case 'IDLE':
                    this.updateTargetAndMove(dt);
                    break;
                case 'MOVING':
                    this.move(dt);
                    break;
                case 'DOOR_OPENING':
                    this.doorTimer -= dt;
                    if (this.doorTimer <= 0) {
                        this.state = 'DOOR_OPEN';
                        this.doorTimer = 0;
                    }
                    break;
                case 'DOOR_OPEN':
                    this.doorTimer -= dt;
                    if (this.pendingBoarders.size === 0 && 
                        this.pendingDisembark.size === 0 &&
                        this.doorTimer <= -this.MIN_DOOR_OPEN_S) {
                        this.closeDoors();
                    } else if (this.doorTimer <= -this.MAX_DOOR_OPEN_S) {
                        this.closeDoors();
                    }
                    break;
                case 'DOOR_CLOSING':
                    this.doorTimer -= dt;
                    if (this.doorTimer <= 0) {
                        this.updateTargetAndMove(dt);
                    }
                    break;
            }
        }

        updateTargetAndMove(dt) {
            this.servedThisDoorCycle.clear();
            this.lastServedFloor = -1;
            
            if (this.upCalls.size === 0 && this.downCalls.size === 0 && this.destinations.size === 0) {
                this.targetFloor = 0;
                this.direction = 0;
            } else if (this.passengers.size === 0 && this.destinations.size === 0) {
                this.pickTargetForIdle();
            } else {
                this.pickTargetWithPassengers();
            }
            
            if (this.currentFloor === this.targetFloor) {
                this.openDoors();
            } else {
                this.direction = this.targetFloor > this.currentFloor ? 1 : -1;
                this.state = 'MOVING';
            }
        }

        pickTargetForIdle() {
            let bestFloor = -1;
            let bestDist = Infinity;
            
            for (const floor of this.upCalls) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestFloor = floor;
                }
            }
            for (const floor of this.downCalls) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestFloor = floor;
                }
            }
            
            this.targetFloor = bestFloor >= 0 ? bestFloor : 0;
        }

        pickTargetWithPassengers() {
            if (this.direction > 0) {
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.upCalls.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
                this.direction = -1;
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                    if (this.downCalls.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
            } else if (this.direction < 0) {
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.downCalls.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
                this.direction = 1;
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                    if (this.upCalls.has(f)) {
                        this.targetFloor = f;
                        return;
                    }
                }
            } else {
                let nearestDest = -1;
                let nearestDist = Infinity;
                for (const f of this.destinations) {
                    const dist = Math.abs(f - this.currentFloor);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestDest = f;
                    }
                }
                if (nearestDest >= 0) {
                    this.targetFloor = nearestDest;
                    this.direction = nearestDest > this.currentFloor ? 1 : (nearestDest < this.currentFloor ? -1 : 0);
                    return;
                }
                this.pickTargetForIdle();
            }
        }

        move(dt) {
            const targetY = this.targetFloor * this.floorHeight;
            const diff = targetY - this.positionY;
            
            if (Math.abs(diff) < 0.01) {
                this.positionY = targetY;
                this.currentFloor = this.targetFloor;
                this.openDoors();
            } else {
                this.positionY += Math.sign(diff) * this.MOVING_SPEED * dt;
                if (Math.abs(this.positionY - targetY) < 0.1) {
                    this.positionY = targetY;
                }
                
                const movingDir = this.direction;
                if (movingDir !== 0) {
                    if (movingDir > 0) {
                        for (let f = this.currentFloor + 1; f <= this.targetFloor; f++) {
                            if (this.destinations.has(f)) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    } else {
                        for (let f = this.currentFloor - 1; f >= this.targetFloor; f--) {
                            if (this.destinations.has(f)) {
                                this.targetFloor = f;
                                break;
                            }
                        }
                    }
                }
            }
        }

        openDoors() {
            this.state = 'DOOR_OPENING';
            this.doorTimer = 0.5;
            this.lastServedFloor = this.currentFloor;
            
            this.servedThisDoorCycle.add(this.currentFloor);
            
            this.destinations.delete(this.currentFloor);
            
            if (this.passengers.size === 0) {
                if (this.direction > 0 || (this.direction === 0 && this.upCalls.has(this.currentFloor) && 
                    !this.upCalls.has(this.currentFloor + 1) && !this.upCalls.has(this.currentFloor - 1))) {
                    this.upCalls.delete(this.currentFloor);
                }
                if (this.direction < 0 || (this.direction === 0 && this.downCalls.has(this.currentFloor) &&
                    !this.downCalls.has(this.currentFloor + 1) && !this.downCalls.has(this.currentFloor - 1))) {
                    this.downCalls.delete(this.currentFloor);
                }
            }
            
            if (this.destinations.size === 0 && this.upCalls.size === 0 && this.downCalls.size === 0) {
                this.direction = 0;
            }
        }

        closeDoors() {
            this.state = 'DOOR_CLOSING';
            this.doorTimer = 0.5;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);