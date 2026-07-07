(function(root) {
    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.reset();
        }

        reset() {
            this.state = 'IDLE';
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(4).fill(null);
            this.doorState = 'CLOSED';
            this.doorTimer = 0;
            this.lastServedFloor = -1;
            this.servedThisCycle = false;
        }

        callUp(floor) {
            this.upCalls.add(floor);
            this.updateDirection();
        }

        callDown(floor) {
            this.downCalls.add(floor);
            this.updateDirection();
        }

        pressDestination(floor) {
            this.destinations.add(floor);
            this.updateDirection();
        }

        isAcceptingAt(floor, direction) {
            if (this.doorState !== 'OPEN') return false;
            if (this.direction !== direction) return false;
            if (this.currentFloor !== floor) return false;
            if (this.passengers.size + this.pendingBoarders.size >= this.maxCapacity) return false;
            return true;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    return { index: i, x: (i < 2 ? -0.8 : 0.8), y: 0, z: (i % 2 === 0 ? -0.8 : 0.8) };
                }
            }
            return null;
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (let i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
        }

        tick(dt) {
            const MIN_DOOR_OPEN_S = 1.5;
            const MAX_DOOR_OPEN_S = 8.0;

            if (this.doorState === 'OPENING') {
                this.doorTimer += dt;
                if (this.doorTimer >= MIN_DOOR_OPEN_S) {
                    this.doorState = 'OPEN';
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.doorState === 'CLOSING') {
                this.doorTimer += dt;
                if (this.doorTimer >= MIN_DOOR_OPEN_S) {
                    this.doorState = 'OPEN';
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.doorState === 'OPEN') {
                this.doorTimer += dt;
                if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                    this.doorState = 'CLOSING';
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.doorState === 'IDLE') {
                this.doorState = 'CLOSING';
                this.doorTimer = 0;
                return;
            }

            if (this.doorState === 'MOVING') {
                const speed = this.floorHeight / 2;
                if (this.direction > 0) {
                    this.currentFloor += speed / this.floorHeight;
                    if (this.currentFloor >= this.targetFloor) {
                        this.currentFloor = this.targetFloor;
                        this.state = 'DOOR_OPENING';
                        this.doorState = 'OPENING';
                        this.doorTimer = 0;
                        this.servedThisCycle = false;
                    }
                } else if (this.direction < 0) {
                    this.currentFloor -= speed / this.floorHeight;
                    if (this.currentFloor <= this.targetFloor) {
                        this.currentFloor = this.targetFloor;
                        this.state = 'DOOR_OPENING';
                        this.doorState = 'OPENING';
                        this.doorTimer = 0;
                        this.servedThisCycle = false;
                    }
                }
                return;
            }
        }

        updateDirection() {
            if (this.direction === 0) {
                if (this.upCalls.size > 0) {
                    this.direction = 1;
                } else if (this.downCalls.size > 0) {
                    this.direction = -1;
                }
            }
        }

        pickNextTarget() {
            if (this.direction === 1) {
                for (let floor = this.currentFloor + 1; floor < this.floorCount; floor++) {
                    if (this.upCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
                for (let floor = this.currentFloor - 1; floor >= 0; floor--) {
                    if (this.downCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
            } else if (this.direction === -1) {
                for (let floor = this.currentFloor - 1; floor >= 0; floor--) {
                    if (this.downCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
                for (let floor = this.currentFloor + 1; floor < this.floorCount; floor++) {
                    if (this.upCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
            } else {
                for (let floor = 0; floor < this.floorCount; floor++) {
                    if (this.upCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
                for (let floor = this.floorCount - 1; floor >= 0; floor--) {
                    if (this.downCalls.has(floor) || this.destinations.has(floor)) {
                        return floor;
                    }
                }
            }
            return 0;
        }

        setTargetFloor(floor) {
            this.targetFloor = floor;
            this.direction = floor > this.currentFloor ? 1 : (floor < this.currentFloor ? -1 : 0);
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);