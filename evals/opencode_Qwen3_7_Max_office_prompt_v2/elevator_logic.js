(function(root) {
    const STATES = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    const MIN_DOOR_OPEN_S = 2.0;
    const MAX_DOOR_OPEN_S = 8.0;
    const TRAVEL_SPEED = 1.3;

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;

            this.state = STATES.IDLE;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = [false, false, false, false];

            this.doorOpenTimer = 0;
            this.doorCloseTimer = 0;
            this.doorPosition = 0;

            this.servedThisDoorCycle = new Set();
            this.lastServedFloor = -1;
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
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;

            if (this.direction === 0) return true;

            if (direction === this.direction) return true;

            const hasMoreInCurrentDir = this._hasMoreStopsInDirection(this.direction);
            if (!hasMoreInCurrentDir) return true;

            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;

            let spotIndex = -1;
            for (let i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) {
                    spotIndex = i;
                    break;
                }
            }
            if (spotIndex === -1) return null;

            this.spotOccupancy[spotIndex] = true;
            this.pendingBoarders.add(person);

            const x = (spotIndex % 2 === 0) ? -0.6 : 0.6;
            const z = (spotIndex < 2) ? -0.6 : 0.6;

            return {
                index: spotIndex,
                x: x,
                y: 0,
                z: z
            };
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
            if (this.pendingDisembark.has(person)) {
                this.pendingDisembark.delete(person);
            }
            if (this.passengers.has(person)) {
                this.passengers.delete(person);
                for (let i = 0; i < 4; i++) {
                    if (this.spotOccupancy[i]) {
                        this.spotOccupancy[i] = false;
                        break;
                    }
                }
            }
        }

        tick(dt) {
            switch (this.state) {
                case STATES.IDLE:
                    this._tickIdle();
                    break;
                case STATES.MOVING:
                    this._tickMoving(dt);
                    break;
                case STATES.DOOR_OPENING:
                    this._tickDoorOpening(dt);
                    break;
                case STATES.DOOR_OPEN:
                    this._tickDoorOpen(dt);
                    break;
                case STATES.DOOR_CLOSING:
                    this._tickDoorClosing(dt);
                    break;
            }
        }

        reset() {
            this.state = STATES.IDLE;
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
            this.doorCloseTimer = 0;
            this.doorPosition = 0;

            this.servedThisDoorCycle.clear();
            this.lastServedFloor = -1;
        }

        _tickIdle() {
            const nextTarget = this._findNextTarget();
            if (nextTarget !== null) {
                this.targetFloor = nextTarget;
                if (this.targetFloor === this.currentFloor) {
                    this.state = STATES.DOOR_OPENING;
                    this.doorPosition = 0;
                } else {
                    this.direction = (this.targetFloor > this.currentFloor) ? 1 : -1;
                    this.state = STATES.MOVING;
                }
            }
        }

        _tickMoving(dt) {
            const currentY = this.currentFloor * this.floorHeight;
            const targetY = this.targetFloor * this.floorHeight;
            const dy = targetY - currentY;
            const moveAmount = TRAVEL_SPEED * dt;

            if (Math.abs(dy) <= moveAmount) {
                this.currentFloor = this.targetFloor;
                this.state = STATES.DOOR_OPENING;
                this.doorPosition = 0;
                this._clearServedCallsAtFloor(this.currentFloor);
            } else {
                const newY = currentY + Math.sign(dy) * moveAmount;
                this.currentFloor = newY / this.floorHeight;

                const closerStop = this._findCloserStopInDirection(this.direction);
                if (closerStop !== null && closerStop !== this.targetFloor) {
                    this.targetFloor = closerStop;
                }
            }
        }

        _tickDoorOpening(dt) {
            this.doorPosition += dt * 0.8;
            if (this.doorPosition >= 1.0) {
                this.doorPosition = 1.0;
                this.state = STATES.DOOR_OPEN;
                this.doorOpenTimer = 0;
                this.servedThisDoorCycle.clear();
                this.lastServedFloor = this.currentFloor;
            }
        }

        _tickDoorOpen(dt) {
            this.doorOpenTimer += dt;

            if (this.doorOpenTimer >= MIN_DOOR_OPEN_S &&
                this.pendingBoarders.size === 0 &&
                this.pendingDisembark.size === 0) {
                this.state = STATES.DOOR_CLOSING;
                this.doorCloseTimer = 0;
                return;
            }

            if (this.doorOpenTimer >= MAX_DOOR_OPEN_S) {
                this.state = STATES.DOOR_CLOSING;
                this.doorCloseTimer = 0;
                return;
            }
        }

        _tickDoorClosing(dt) {
            this.doorCloseTimer += dt;
            this.doorPosition -= dt * 0.8;
            if (this.doorPosition <= 0) {
                this.doorPosition = 0;
                const nextTarget = this._findNextTarget();
                if (nextTarget !== null) {
                    this.targetFloor = nextTarget;
                    if (this.targetFloor === this.currentFloor) {
                        this.state = STATES.DOOR_OPENING;
                        this.doorPosition = 0;
                    } else {
                        this.direction = (this.targetFloor > this.currentFloor) ? 1 : -1;
                        this.state = STATES.MOVING;
                    }
                } else {
                    this.state = STATES.IDLE;
                    this.direction = 0;
                }
            }
        }

        _findNextTarget() {
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                const dest = this._findNearestDestination();
                if (dest !== null) return dest;
            }

            if (this.direction !== 0) {
                const ahead = this._findStopInDirection(this.direction);
                if (ahead !== null) return ahead;

                const behind = this._findStopInDirection(-this.direction);
                if (behind !== null) return behind;
            } else {
                const nearest = this._findNearestActiveCall();
                if (nearest !== null) return nearest;
            }

            return null;
        }

        _findNearestDestination() {
            let nearest = null;
            let minDist = Infinity;
            for (const floor of this.destinations) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = floor;
                }
            }
            return nearest;
        }

        _findStopInDirection(dir) {
            let best = null;
            let bestDist = Infinity;

            for (const floor of this.destinations) {
                const diff = (floor - this.currentFloor) * dir;
                if (diff > 0 && diff < bestDist) {
                    bestDist = diff;
                    best = floor;
                }
            }

            const calls = (dir > 0) ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                const diff = (floor - this.currentFloor) * dir;
                if (diff > 0 && diff < bestDist) {
                    bestDist = diff;
                    best = floor;
                }
            }

            if (this.direction === 0 || !this._hasMoreStopsInDirection(dir)) {
                const oppositeCalls = (dir > 0) ? this.downCalls : this.upCalls;
                for (const floor of oppositeCalls) {
                    const diff = (floor - this.currentFloor) * dir;
                    if (diff > 0 && diff < bestDist) {
                        bestDist = diff;
                        best = floor;
                    }
                }
            }

            return best;
        }

        _findCloserStopInDirection(dir) {
            const currentTargetDist = Math.abs(this.targetFloor - this.currentFloor);
            let closer = null;
            let closerDist = currentTargetDist;

            for (const floor of this.destinations) {
                const diff = (floor - this.currentFloor) * dir;
                if (diff > 0 && diff < closerDist) {
                    closerDist = diff;
                    closer = floor;
                }
            }

            const calls = (dir > 0) ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                const diff = (floor - this.currentFloor) * dir;
                if (diff > 0 && diff < closerDist) {
                    closerDist = diff;
                    closer = floor;
                }
            }

            return closer;
        }

        _findNearestActiveCall() {
            let nearest = null;
            let minDist = Infinity;

            for (const floor of this.destinations) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = floor;
                }
            }

            for (const floor of this.upCalls) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = floor;
                }
            }

            for (const floor of this.downCalls) {
                const dist = Math.abs(floor - this.currentFloor);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = floor;
                }
            }

            return nearest;
        }

        _hasMoreStopsInDirection(dir) {
            for (const floor of this.destinations) {
                if ((floor - this.currentFloor) * dir > 0) return true;
            }

            const calls = (dir > 0) ? this.upCalls : this.downCalls;
            for (const floor of calls) {
                if ((floor - this.currentFloor) * dir > 0) return true;
            }

            return false;
        }

        _clearServedCallsAtFloor(floor) {
            this.destinations.delete(floor);

            if (this.direction > 0) {
                this.upCalls.delete(floor);
                if (!this._hasMoreStopsInDirection(1)) {
                    this.downCalls.delete(floor);
                }
            } else if (this.direction < 0) {
                this.downCalls.delete(floor);
                if (!this._hasMoreStopsInDirection(-1)) {
                    this.upCalls.delete(floor);
                }
            } else {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }

            this.servedThisDoorCycle.add(floor);
        }
    }

    ElevatorLogic.STATES = STATES;
    ElevatorLogic.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
