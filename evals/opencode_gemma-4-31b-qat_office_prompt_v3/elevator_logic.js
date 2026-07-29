(function(root) {
    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 }) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;
            this.reset();
        }

        reset() {
            this.state = 'IDLE';
            this.direction = 0;
            this.currentFloor = 0;
            this.currentY = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);
            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
            this.MIN_DOOR_OPEN_S = 2.0;
            this.MAX_DOOR_OPEN_S = 8.0;
            this.DOOR_SPEED = 1.0;
            this.ELEVATOR_SPEED = 1.5;
        }

        callUp(floor) { this.upCalls.add(floor); }
        callDown(floor) { this.downCalls.add(floor); }
        pressDestination(floor) { this.destinations.add(floor); }

        isAcceptingAt(floor, direction) {
            if (this.state !== 'DOOR_OPEN' || this.currentFloor !== floor) return false;
            if (this.passengers.size + this.pendingBoarders.size >= this.maxCapacity) return false;
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            if (!this.hasWorkAhead()) return true;
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            const idx = this.spotOccupancy.findIndex(s => s === null);
            if (idx === -1) return null;
            this.spotOccupancy[idx] = person;
            this.pendingBoarders.add(person);
            const spots = [
                { index: 0, x: -0.6, y: 0, z: -0.6 },
                { index: 1, x: 0.6, y: 0, z: -0.6 },
                { index: 2, x: -0.6, y: 0, z: 0.6 },
                { index: 3, x: 0.6, y: 0, z: 0.6 },
            ];
            return spots[idx];
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
            const idx = this.spotOccupancy.indexOf(person);
            if (idx !== -1) this.spotOccupancy[idx] = null;
        }

        hasWorkAhead() {
            if (this.direction === 0) return false;
            if (this.direction === 1) {
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.upCalls.has(f) || this.destinations.has(f)) return true;
                }
            } else {
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.downCalls.has(f) || this.destinations.has(f)) return true;
                }
            }
            return false;
        }

        tick(dt) {
            switch (this.state) {
                case 'IDLE':
                    this.pickNextTarget();
                    if (this.targetFloor !== this.currentFloor) {
                        this.direction = this.targetFloor > this.currentFloor ? 1 : -1;
                        this.state = 'MOVING';
                    } else if (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor) || this.destinations.has(this.currentFloor)) {
                        this.state = 'DOOR_OPENING';
                    }
                    break;
                case 'MOVING':
                    this.currentY += this.direction * this.ELEVATOR_SPEED * dt;
                    this.currentFloor = Math.round(this.currentY / this.floorHeight);
                    if (this.direction === 1) {
                        for (let f = this.currentFloor + 1; f < this.targetFloor; f++) {
                            if (this.upCalls.has(f) || this.destinations.has(f)) { this.targetFloor = f; break; }
                        }
                    } else {
                        for (let f = this.currentFloor - 1; f > this.targetFloor; f--) {
                            if (this.downCalls.has(f) || this.destinations.has(f)) { this.targetFloor = f; break; }
                        }
                    }
                    if (Math.abs(this.currentY - this.targetFloor * this.floorHeight) < 0.1) {
                        this.currentY = this.targetFloor * this.floorHeight;
                        this.state = 'DOOR_OPENING';
                    }
                    break;
                case 'DOOR_OPENING':
                    this.doorTimer += dt;
                    if (this.doorTimer >= 1.0) {
                        this.doorTimer = 0;
                        this.state = 'DOOR_OPEN';
                        this.destinations.delete(this.currentFloor);
                        if (this.direction === 1) this.upCalls.delete(this.currentFloor);
                        else if (this.direction === -1) this.downCalls.delete(this.currentFloor);
                        if (this.direction === 0 || !this.hasWorkAhead()) {
                            this.upCalls.delete(this.currentFloor);
                            this.downCalls.delete(this.currentFloor);
                        }
                        this.lastServedFloor = this.currentFloor;
                        this.servedThisDoorCycle = true;
                    }
                    break;
                case 'DOOR_OPEN':
                    this.doorTimer += dt;
                    if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) {
                        if (this.doorTimer >= this.MIN_DOOR_OPEN_S || this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                            this.state = 'DOOR_CLOSING';
                        }
                    } else if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                        this.state = 'DOOR_CLOSING';
                    }
                    break;
                case 'DOOR_CLOSING':
                    this.doorTimer += dt;
                    if (this.doorTimer >= 1.0) {
                        this.doorTimer = 0;
                        this.state = 'IDLE';
                        this.servedThisDoorCycle = false;
                    }
                    break;
            }
        }

        pickNextTarget() {
            if (this.direction === 1) {
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f)) { this.targetFloor = f; return; }
                }
            } else if (this.direction === -1) {
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.downCalls.has(f)) { this.targetFloor = f; return; }
                }
            }

            let hasUp = false;
            for (let f = 0; f < this.floorCount; f++) if (this.destinations.has(f) || this.upCalls.has(f)) { hasUp = true; break; }
            let hasDown = false;
            for (let f = 0; f < this.floorCount; f++) if (this.destinations.has(f) || this.downCalls.has(f)) { hasDown = true; break; }

            if (hasUp && !hasDown) {
                this.direction = 1;
                const targets = [...this.destinations, ...this.upCalls].filter(f => f > this.currentFloor);
                this.targetFloor = targets.length ? Math.min(...targets) : this.currentFloor;
            } else if (hasDown && !hasUp) {
                this.direction = -1;
                const targets = [...this.destinations, ...this.downCalls].filter(f => f < this.currentFloor);
                this.targetFloor = targets.length ? Math.max(...targets) : this.currentFloor;
            } else if (hasUp && hasDown) {
                this.direction = 1;
                const targets = [...this.destinations, ...this.upCalls].filter(f => f > this.currentFloor);
                this.targetFloor = targets.length ? Math.min(...targets) : this.currentFloor;
            } else {
                this.targetFloor = this.currentFloor;
                this.direction = 0;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
