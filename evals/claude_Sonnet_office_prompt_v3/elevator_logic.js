// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, DOM, canvas, or browser-only dependencies - runs under Node and in the browser.

(function (root) {
    "use strict";

    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_DOOR_OPENING = "DOOR_OPENING";
    const STATE_DOOR_OPEN = "DOOR_OPEN";
    const STATE_DOOR_CLOSING = "DOOR_CLOSING";

    const DOOR_MOVE_S = 0.9;
    const MIN_DOOR_OPEN_S = 1.6;
    const MAX_DOOR_OPEN_S = 9;

    const SPOT_LOCAL = [
        { x: -0.55, y: 0, z: -0.5 },
        { x: 0.55, y: 0, z: -0.5 },
        { x: -0.55, y: 0, z: 0.5 },
        { x: 0.55, y: 0, z: 0.5 },
    ];

    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;
            this.speed = opts.speed || this.floorHeight / 1.4;
            this.reset();
        }

        reset() {
            this.state = STATE_IDLE;
            this.currentFloor = 0;
            this.currentY = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.doorTimer = 0;
            this.lastServedFloor = -1;
        }

        callUp(floor) {
            this.upCalls.add(floor);
        }

        callDown(floor) {
            this.downCalls.add(floor);
        }

        pressDestination(floor) {
            this.destinations.add(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        _candidateFloors() {
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                return new Set(this.destinations);
            }
            const all = new Set(this.destinations);
            for (const floor of this.upCalls) all.add(floor);
            for (const floor of this.downCalls) all.add(floor);
            return all;
        }

        _hasMoreWorkInDirection(dir) {
            if (dir === 0) return false;
            for (const floor of this._candidateFloors()) {
                if (dir > 0 ? floor > this.currentFloor : floor < this.currentFloor) return true;
            }
            return false;
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE_DOOR_OPEN || this.currentFloor !== floor) return false;
            if (!this._hasMoreWorkInDirection(this.direction)) return true;
            return direction === this.direction;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    const local = SPOT_LOCAL[i];
                    return { index: i, x: local.x, y: local.y, z: local.z };
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
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        _chooseTarget() {
            const candidates = Array.from(this._candidateFloors());
            if (!candidates.length) return null;

            if (this.direction !== 0) {
                const ahead = candidates.filter((floor) =>
                    this.direction > 0 ? floor > this.currentFloor : floor < this.currentFloor
                );
                if (ahead.length) {
                    ahead.sort((a, b) => (this.direction > 0 ? a - b : b - a));
                    return { floor: ahead[0], dir: this.direction };
                }
            }
            if (candidates.indexOf(this.currentFloor) !== -1) {
                return { floor: this.currentFloor, dir: this.direction };
            }
            const sorted = candidates.slice().sort((a, b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
            const nearest = sorted[0];
            return { floor: nearest, dir: nearest > this.currentFloor ? 1 : -1 };
        }

        _arriveServe() {
            const floor = this.currentFloor;
            this.destinations.delete(floor);
            if (this.direction >= 0) this.upCalls.delete(floor);
            if (this.direction <= 0) this.downCalls.delete(floor);
            if (!this._hasMoreWorkInDirection(this.direction)) {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
            this.lastServedFloor = floor;
        }

        _tryPickTarget() {
            const choice = this._chooseTarget();
            if (!choice) {
                this.direction = 0;
                return;
            }
            this.targetFloor = choice.floor;
            if (choice.floor === this.currentFloor) {
                this.direction = choice.dir || 0;
                this.state = STATE_DOOR_OPENING;
                this.doorTimer = 0;
            } else {
                this.direction = choice.floor > this.currentFloor ? 1 : -1;
                this.state = STATE_MOVING;
            }
        }

        _pickNextAfterClose() {
            const choice = this._chooseTarget();
            if (!choice) {
                this.direction = 0;
                this.state = STATE_IDLE;
                return;
            }
            this.targetFloor = choice.floor;
            if (choice.floor === this.currentFloor) {
                this.direction = choice.dir || this.direction;
                this.state = STATE_DOOR_OPENING;
                this.doorTimer = 0;
            } else {
                this.direction = choice.floor > this.currentFloor ? 1 : -1;
                this.state = STATE_MOVING;
            }
        }

        _advanceMotion(dt) {
            const choice = this._chooseTarget();
            if (choice && choice.dir === this.direction) {
                if (this.direction > 0 && choice.floor < this.targetFloor) this.targetFloor = choice.floor;
                else if (this.direction < 0 && choice.floor > this.targetFloor) this.targetFloor = choice.floor;
            }

            const targetY = this.targetFloor * this.floorHeight;
            const dy = targetY - this.currentY;
            const step = this.speed * dt;
            if (Math.abs(dy) <= step) {
                this.currentY = targetY;
                this.currentFloor = this.targetFloor;
                this.state = STATE_DOOR_OPENING;
                this.doorTimer = 0;
            } else {
                this.currentY += Math.sign(dy) * step;
                this.currentFloor = Math.round(this.currentY / this.floorHeight);
            }
        }

        tick(dt) {
            if (this.state === STATE_IDLE) {
                this._tryPickTarget();
            } else if (this.state === STATE_MOVING) {
                this._advanceMotion(dt);
            } else if (this.state === STATE_DOOR_OPENING) {
                this.doorTimer += dt;
                if (this.doorTimer >= DOOR_MOVE_S) {
                    this.doorTimer = 0;
                    this.state = STATE_DOOR_OPEN;
                    this._arriveServe();
                }
            } else if (this.state === STATE_DOOR_OPEN) {
                this.doorTimer += dt;
                const noPending = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                const minElapsed = this.doorTimer >= MIN_DOOR_OPEN_S;
                const mustClose = this.doorTimer >= MAX_DOOR_OPEN_S;
                if ((noPending && minElapsed) || mustClose) {
                    this.state = STATE_DOOR_CLOSING;
                    this.doorTimer = 0;
                }
            } else if (this.state === STATE_DOOR_CLOSING) {
                this.doorTimer += dt;
                if (this.doorTimer >= DOOR_MOVE_S) {
                    this.doorTimer = 0;
                    this._pickNextAfterClose();
                }
            }
        }
    }

    ElevatorLogic.STATES = {
        IDLE: STATE_IDLE,
        MOVING: STATE_MOVING,
        DOOR_OPENING: STATE_DOOR_OPENING,
        DOOR_OPEN: STATE_DOOR_OPEN,
        DOOR_CLOSING: STATE_DOOR_CLOSING,
    };
    ElevatorLogic.DOOR_MOVE_S = DOOR_MOVE_S;
    ElevatorLogic.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
    ElevatorLogic.SPOT_LOCAL = SPOT_LOCAL;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
