/**
 * Pure elevator scheduler/state machine — no Three.js, DOM, canvas, or browser deps.
 * Compatible with both browser globals and Node.js.
 */
(function(root) {
    'use strict';

    const DOOR_STATES = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    const MIN_DOOR_OPEN_S = 1.2;
    const MAX_DOOR_OPEN_S = 4.0;

    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;

            this.state = DOOR_STATES.IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Map();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Map();

            this.spotOccupancy = new Map();
            this._nextSpotIndex = 0;

            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;

            this._resetState();
        }

        _resetState() {
            this.state = DOOR_STATES.IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy.clear();
            this._nextSpotIndex = 0;
            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = -1;
        }

        reset() {
            this._resetState();
        }

        _getSpotPositions() {
            const spots = [];
            const cols = 2;
            const rows = 2;
            const width = 1.6;
            const depth = 1.6;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = (c / (cols - 1 || 1)) * width - width / 2;
                    const z = (r / (rows - 1 || 1)) * depth - depth / 2;
                    spots.push({ x, y: this.floorHeight * 0.5, z });
                }
            }
            return spots;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount && floor < this.floorCount - 1) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (floor > 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
                this.destinations.add(floor);
            }
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== DOOR_STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;

            if (direction === 1 && !this.upCalls.has(floor)) return false;
            if (direction === -1 && !this.downCalls.has(floor)) return false;

            if (this.direction !== 0 && this.direction !== direction) return false;

            if (this.passengers.size + this.pendingBoarders.size >= this.maxCapacity) {
                return false;
            }

            return true;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;

            const spots = this._getSpotPositions();
            let spot = null;
            let attempts = 0;

            while (attempts < spots.length) {
                const idx = (this._nextSpotIndex + attempts) % spots.length;
                if (!this.spotOccupancy.has(idx)) {
                    spot = spots[idx];
                    this.spotOccupancy.set(idx, person);
                    this._nextSpotIndex = (idx + 1) % spots.length;
                    break;
                }
                attempts++;
            }

            if (!spot) return null;

            const reservation = {
                index: (this._nextSpotIndex - 1 + spots.length) % spots.length,
                x: spot.x,
                y: spot.y,
                z: spot.z,
                person
            };

            this.pendingBoarders.set(person, reservation);
            return reservation;
        }

        completeBoard(person) {
            const reservation = this.pendingBoarders.get(person);
            if (reservation) {
                this.pendingBoarders.delete(person);
                this.passengers.set(person, reservation);
                return true;
            }
            return false;
        }

        registerDisembark(person) {
            const reservation = this.passengers.get(person);
            if (reservation) {
                this.pendingDisembark.set(person, reservation);
                return true;
            }
            return false;
        }

        completeDisembark(person) {
            const reservation = this.pendingDisembark.get(person);
            if (reservation) {
                this.pendingDisembark.delete(person);
                this.passengers.delete(person);
                this.spotOccupancy.delete(reservation.index);
                return true;
            }
            return false;
        }

        _callsAtFloor(floor) {
            const up = this.upCalls.has(floor);
            const down = this.downCalls.has(floor);
            return { up, down, any: up || down };
        }

        _findNearestInDirection(dir) {
            let nearest = null;
            let nearestDist = Infinity;

            for (const dest of this.destinations) {
                const dist = (dest - this.currentFloor) * dir;
                if (dist > 0 && dist < nearestDist) {
                    nearestDist = dist;
                    nearest = dest;
                }
            }

            if (dir > 0) {
                for (const floor of this.upCalls) {
                    const dist = floor - this.currentFloor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
                for (const floor of this.downCalls) {
                    const dist = floor - this.currentFloor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
            } else if (dir < 0) {
                for (const floor of this.downCalls) {
                    const dist = this.currentFloor - floor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
                for (const floor of this.upCalls) {
                    const dist = this.currentFloor - floor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
            }

            return nearest;
        }

        _hasWorkInDirection(dir) {
            for (const dest of this.destinations) {
                const dist = (dest - this.currentFloor) * dir;
                if (dist > 0) return true;
            }

            if (dir > 0) {
                for (const floor of this.upCalls) {
                    if (floor >= this.currentFloor) return true;
                }
                for (const floor of this.downCalls) {
                    if (floor >= this.currentFloor) return true;
                }
            } else if (dir < 0) {
                for (const floor of this.downCalls) {
                    if (floor <= this.currentFloor) return true;
                }
                for (const floor of this.upCalls) {
                    if (floor <= this.currentFloor) return true;
                }
            }

            return false;
        }

        _hasWorkBehind(dir) {
            for (const dest of this.destinations) {
                const dist = (dest - this.currentFloor) * dir;
                if (dist < 0) return true;
            }

            if (dir > 0) {
                for (const floor of this.upCalls) {
                    if (floor < this.currentFloor) return true;
                }
                for (const floor of this.downCalls) {
                    if (floor < this.currentFloor) return true;
                }
            } else if (dir < 0) {
                for (const floor of this.downCalls) {
                    if (floor > this.currentFloor) return true;
                }
                for (const floor of this.upCalls) {
                    if (floor > this.currentFloor) return true;
                }
            }

            return false;
        }

        _pickNextTarget() {
            if (this.direction === 0) {
                const callsAtCurrent = this._callsAtFloor(this.currentFloor);
                if (callsAtCurrent.up && this.upCalls.size > 0) {
                    return { target: this.currentFloor, direction: 1 };
                }
                if (callsAtCurrent.down && this.downCalls.size > 0) {
                    return { target: this.currentFloor, direction: -1 };
                }
            }

            let dir = this.direction;

            if (dir === 0) {
                if (this._hasWorkInDirection(1)) {
                    dir = 1;
                } else if (this._hasWorkInDirection(-1)) {
                    dir = -1;
                }
            }

            if (dir !== 0 && this._hasWorkInDirection(dir)) {
                const target = this._findNearestInDirection(dir);
                if (target !== null) return { target, direction: dir };
            }

            dir = -dir;

            if (dir !== 0 && this._hasWorkInDirection(dir)) {
                const target = this._findNearestInDirection(dir);
                if (target !== null) return { target, direction: dir };
            }

            if (this.direction !== 0 && this._hasWorkBehind(-this.direction)) {
                const target = this._findNearestInDirection(-this.direction);
                if (target !== null) return { target, direction: -this.direction };
            }

            return null;
        }

        _clearServedCallsAtCurrentFloor() {
            const cf = this.currentFloor;

            this.destinations.delete(cf);

            if (this.direction > 0) {
                this.upCalls.delete(cf);
            } else if (this.direction < 0) {
                this.downCalls.delete(cf);
            }

            if (!this._hasWorkInDirection(this.direction)) {
                this.upCalls.delete(cf);
                this.downCalls.delete(cf);
            }
        }

        _shortenTargetIfNeeded() {
            if (this.state !== DOOR_STATES.MOVING) return;

            const dir = this.direction;
            if (dir === 0) return;

            let nearest = null;
            let nearestDist = Infinity;

            for (const dest of this.destinations) {
                const dist = (dest - this.currentFloor) * dir;
                if (dist > 0 && dist < nearestDist) {
                    nearestDist = dist;
                    nearest = dest;
                }
            }

            if (dir > 0) {
                for (const floor of this.upCalls) {
                    const dist = floor - this.currentFloor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
                for (const floor of this.downCalls) {
                    const dist = floor - this.currentFloor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
            } else if (dir < 0) {
                for (const floor of this.downCalls) {
                    const dist = this.currentFloor - floor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
                for (const floor of this.upCalls) {
                    const dist = this.currentFloor - floor;
                    if (dist > 0 && dist < nearestDist) {
                        nearestDist = dist;
                        nearest = floor;
                    }
                }
            }

            if (nearest !== null && nearestDist < Math.abs(this.targetFloor - this.currentFloor)) {
                this.targetFloor = nearest;
            }
        }

        tick(dt) {
            switch (this.state) {
                case DOOR_STATES.IDLE: {
                    if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                        this.state = DOOR_STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        break;
                    }

                    const next = this._pickNextTarget();
                    if (next) {
                        this.targetFloor = next.target;
                        this.direction = next.direction;
                        this.state = DOOR_STATES.MOVING;
                        this.servedThisDoorCycle = false;
                    }
                    break;
                }

                case DOOR_STATES.MOVING: {
                    this._shortenTargetIfNeeded();

                    const diff = this.targetFloor - this.currentFloor;
                    const step = diff > 0 ? 1 : diff < 0 ? -1 : 0;

                    if (step === 0) {
                        this.state = DOOR_STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        break;
                    }

                    const travel = dt / (this.floorHeight / 2.5);
                    this.currentFloor += step * travel;

                    const passedTarget = step > 0
                        ? this.currentFloor >= this.targetFloor
                        : this.currentFloor <= this.targetFloor;

                    if (passedTarget) {
                        this.currentFloor = Math.round(this.currentFloor);
                        this.state = DOOR_STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case DOOR_STATES.DOOR_OPENING: {
                    this.doorTimer += dt;
                    if (this.doorTimer >= 0.4) {
                        this.state = DOOR_STATES.DOOR_OPEN;
                        this.doorTimer = 0;
                        this._clearServedCallsAtCurrentFloor();
                        this.lastServedFloor = this.currentFloor;
                        this.servedThisDoorCycle = true;
                    }
                    break;
                }

                case DOOR_STATES.DOOR_OPEN: {
                    this.doorTimer += dt;

                    const pending = this.pendingBoarders.size + this.pendingDisembark.size;
                    const hasWork = pending > 0;

                    if (hasWork && this.doorTimer < MIN_DOOR_OPEN_S) {
                        break;
                    }

                    if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                        this.state = DOOR_STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                        break;
                    }

                    if (hasWork) {
                        break;
                    }

                    if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) {
                        this.state = DOOR_STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case DOOR_STATES.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    if (this.doorTimer >= 0.4) {
                        this.doorTimer = 0;

                        if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                            this.state = DOOR_STATES.DOOR_OPENING;
                            break;
                        }

                        this.state = DOOR_STATES.IDLE;
                    }
                    break;
                }
            }
        }

        getState() {
            return this.state;
        }

        getDirection() {
            return this.direction;
        }

        getCurrentFloor() {
            return Math.round(this.currentFloor);
        }

        getTargetFloor() {
            return this.targetFloor;
        }

        getPassengerCount() {
            return this.passengers.size;
        }

        getPendingBoarderCount() {
            return this.pendingBoarders.size;
        }

        getPendingDisembarkCount() {
            return this.pendingDisembark.size;
        }

        getUpCalls() {
            return new Set(this.upCalls);
        }

        getDownCalls() {
            return new Set(this.downCalls);
        }

        getDestinations() {
            return new Set(this.destinations);
        }
    }

    root.ElevatorLogic = ElevatorLogic;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
