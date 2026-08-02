// elevator_logic.js - Pure elevator scheduler/state machine.
// Loaded as classic <script> in browser and CommonJS module for Node tests.
// No Three.js, DOM, or browser-only dependencies.

(function (root) {
    "use strict";

    const STATE = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING",
    };

    const MIN_DOOR_OPEN_S = 1.2;
    const MAX_DOOR_OPEN_S = 6.0;
    const DOOR_TRANSIT_S = 0.9;  // opening or closing transit duration
    const MOVE_SPEED = 2.5;      // floors per second

    const PERSON_SPOTS = [
        { x: -0.45, y: 0.0, z:  0.55 },
        { x:  0.45, y: 0.0, z:  0.55 },
        { x: -0.45, y: 0.0, z: -0.55 },
        { x:  0.45, y: 0.0, z: -0.55 },
    ];

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;

            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // -1, 0, +1
            this.state = STATE.IDLE;
            this.doorTimer = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = -1;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Map();   // person -> { toFloor, spotIndex }
            this.pendingBoarders = new Map(); // person -> { spotIndex, toFloor }
            this.pendingDisembark = new Map();// person -> { spotIndex, toFloor }
            this.spotOccupancy = [null, null, null, null];
        }

        reset() {
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;
            this.state = STATE.IDLE;
            this.doorTimer = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = -1;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = [null, null, null, null];
        }

        callUp(floor) { this.upCalls.add(floor); }
        callDown(floor) { this.downCalls.add(floor); }

        pressDestination(floor) {
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATE.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            // Are we still working in this direction?
            const hasMore = this._hasMoreWorkAhead(floor, this.direction);
            if (hasMore) {
                // Only accept if caller's direction matches ours
                return this.direction === direction || this.direction === 0;
            }
            // No more in current direction; accept either direction
            return true;
        }

        _hasMoreWorkAhead(floor, dir) {
            if (dir === 0) {
                if (this.destinations.size > 0) return true;
                if (this.upCalls.size > 0) return true;
                if (this.downCalls.size > 0) return true;
                return false;
            }
            if (dir > 0) {
                const above = this._anyAbove(floor, this.destinations) ||
                               this._anyAbove(floor, this.upCalls);
                return above;
            }
            const below = this._anyBelow(floor, this.destinations) ||
                          this._anyBelow(floor, this.downCalls);
            return below;
        }

        _anyAbove(floor, set) {
            for (const f of set) if (f > floor) return true;
            return false;
        }
        _anyBelow(floor, set) {
            for (const f of set) if (f < floor) return true;
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            // Find first free spot
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = { person, state: "pending" };
                    this.pendingBoarders.set(person, { spotIndex: i, toFloor: null });
                    return { index: i, x: PERSON_SPOTS[i].x, y: PERSON_SPOTS[i].y, z: PERSON_SPOTS[i].z };
                }
            }
            return null;
        }

        completeBoard(person, toFloor) {
            const info = this.pendingBoarders.get(person);
            if (!info) return false;
            info.toFloor = toFloor;
            this.passengers.set(person, info);
            this.pendingBoarders.delete(person);
            const occ = this.spotOccupancy[info.spotIndex];
            if (occ) occ.state = "in";
            this.destinations.add(toFloor);
            return true;
        }

        registerDisembark(person) {
            const info = this.passengers.get(person);
            if (!info) return false;
            // Move from passengers to pendingDisembark
            this.pendingDisembark.set(person, info);
            this.passengers.delete(person);
            // Spot still occupied until completeDisembark
            return true;
        }

        completeDisembark(person) {
            const info = this.pendingDisembark.get(person);
            if (!info) return false;
            this.spotOccupancy[info.spotIndex] = null;
            this.pendingDisembark.delete(person);
            return true;
        }

        // Try to find the next target floor.
        _selectTarget() {
            // If passengers have destinations, those outrank same-floor hall calls
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                return this._nearestIn(this.destinations, this.currentFloor);
            }
            if (this.destinations.size > 0) {
                // Follow current direction if matching work exists in that direction.
                if (this.direction > 0 && this._anyAbove(this.currentFloor, this.destinations)) {
                    return this._nearestIn(this.destinations, this.currentFloor);
                }
                if (this.direction < 0 && this._anyBelow(this.currentFloor, this.destinations)) {
                    return this._nearestIn(this.destinations, this.currentFloor);
                }
                if (this.direction === 0) {
                    return this._nearestIn(this.destinations, this.currentFloor);
                }
            }
            // Hall calls
            if (this.direction >= 0 && this.upCalls.size > 0) {
                if (this.direction > 0 && this._anyAbove(this.currentFloor, this.upCalls)) {
                    return this._nearestIn(this.upCalls, this.currentFloor);
                }
                if (this.direction === 0) {
                    return this._nearestIn(this.upCalls, this.currentFloor);
                }
            }
            if (this.direction <= 0 && this.downCalls.size > 0) {
                if (this.direction < 0 && this._anyBelow(this.currentFloor, this.downCalls)) {
                    return this._nearestIn(this.downCalls, this.currentFloor);
                }
                if (this.direction === 0) {
                    return this._nearestIn(this.downCalls, this.currentFloor);
                }
            }
            // Reverse direction
            if (this.direction !== 0) {
                const newDir = -this.direction;
                if (newDir > 0 && this._anyAbove(this.currentFloor, this.destinations)) {
                    return this._nearestIn(this.destinations, this.currentFloor);
                }
                if (newDir > 0 && this.upCalls.size > 0) {
                    return this._nearestIn(this.upCalls, this.currentFloor);
                }
                if (newDir < 0 && this._anyBelow(this.currentFloor, this.destinations)) {
                    return this._nearestIn(this.destinations, this.currentFloor);
                }
                if (newDir < 0 && this.downCalls.size > 0) {
                    return this._nearestIn(this.downCalls, this.currentFloor);
                }
            }
            // No passengers, no destinations; try the other hall call set
            if (this.destinations.size === 0) {
                if (this.upCalls.size > 0) return this._nearestIn(this.upCalls, this.currentFloor);
                if (this.downCalls.size > 0) return this._nearestIn(this.downCalls, this.currentFloor);
            }
            return null;
        }

        _nearestIn(set, ref) {
            let best = null;
            let bestDist = Infinity;
            for (const f of set) {
                const d = Math.abs(f - ref);
                if (d < bestDist) { best = f; bestDist = d; }
            }
            return best;
        }

        // During door open: clear served calls/destinations
        _arriveAtFloor(floor) {
            this.currentFloor = floor;
            this.destinations.delete(floor);
            // Clear matching direction call at this floor
            if (this.direction > 0 || this.direction === 0) this.upCalls.delete(floor);
            if (this.direction < 0 || this.direction === 0) this.downCalls.delete(floor);
            // If no more in current direction, also clear opposite
            if (this.direction > 0 && !this._anyAbove(floor, this.destinations) && !this._anyAbove(floor, this.upCalls)) {
                this.downCalls.delete(floor);
            }
            if (this.direction < 0 && !this._anyBelow(floor, this.destinations) && !this._anyBelow(floor, this.downCalls)) {
                this.upCalls.delete(floor);
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = floor;
        }

        tick(dt) {
            switch (this.state) {
                case STATE.IDLE: this._tickIdle(dt); break;
                case STATE.MOVING: this._tickMoving(dt); break;
                case STATE.DOOR_OPENING: this._tickDoorOpening(dt); break;
                case STATE.DOOR_OPEN: this._tickDoorOpen(dt); break;
                case STATE.DOOR_CLOSING: this._tickDoorClosing(dt); break;
            }
        }

        _tickIdle(dt) {
            const target = this._selectTarget();
            if (target === null) {
                this.direction = 0;
                return;
            }
            this.targetFloor = target;
            this.direction = target > this.currentFloor ? 1 : (target < this.currentFloor ? -1 : 0);
            if (this.direction === 0) {
                // We're already at the floor; open doors
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
                this._arriveAtFloor(this.currentFloor);
                return;
            }
            this.state = STATE.MOVING;
        }

        _tickMoving(dt) {
            // Re-evaluate closer stop in same direction
            const newTarget = this._selectTarget();
            if (newTarget !== null) {
                if ((this.direction > 0 && newTarget > this.currentFloor && newTarget < this.targetFloor) ||
                    (this.direction < 0 && newTarget < this.currentFloor && newTarget > this.targetFloor)) {
                    this.targetFloor = newTarget;
                }
                // Same target or further: keep going
            }
            const step = MOVE_SPEED * dt;
            const diff = this.targetFloor - this.currentFloor;
            if (Math.abs(diff) <= step) {
                this.currentFloor = this.targetFloor;
                this._arriveAtFloor(this.currentFloor);
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
            } else {
                this.currentFloor += Math.sign(diff) * step;
            }
        }

        _tickDoorOpening(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= DOOR_TRANSIT_S) {
                this.doorTimer = 0;
                this.state = STATE.DOOR_OPEN;
                this.servedThisDoorCycle = false;
            }
        }

        _tickDoorOpen(dt) {
            this.doorTimer += dt;
            // Hold door if pending boarding/disembark
            if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                    // Force release: drop pending entries (phantom clearance)
                    for (const person of this.pendingBoarders.keys()) {
                        const info = this.pendingBoarders.get(person);
                        if (info && this.spotOccupancy[info.spotIndex] && this.spotOccupancy[info.spotIndex].person === person) {
                            this.spotOccupancy[info.spotIndex] = null;
                        }
                    }
                    this.pendingBoarders.clear();
                    for (const person of this.pendingDisembark.keys()) {
                        const info = this.pendingDisembark.get(person);
                        if (info) this.spotOccupancy[info.spotIndex] = null;
                    }
                    this.pendingDisembark.clear();
                    this.state = STATE.DOOR_CLOSING;
                    this.doorTimer = 0;
                }
                return;
            }
            // Minimum hold elapsed
            if (this.doorTimer >= MIN_DOOR_OPEN_S) {
                // Check whether same-floor hall call is requesting us (anti-starvation)
                // But: if we have passengers with destinations, don't reopen here.
                const hasPaxDest = this.passengers.size > 0 && this.destinations.size > 0;
                const sameFloorUp = this.upCalls.has(this.currentFloor);
                const sameFloorDown = this.downCalls.has(this.currentFloor);
                if (hasPaxDest) {
                    // Passenger destinations outrank same-floor calls - close
                    this.state = STATE.DOOR_CLOSING;
                    this.doorTimer = 0;
                    return;
                }
                if ((sameFloorUp || sameFloorDown) && this.doorTimer < MAX_DOOR_OPEN_S) {
                    // Hold door for additional hall call briefly
                    return;
                }
                this.state = STATE.DOOR_CLOSING;
                this.doorTimer = 0;
            }
        }

        _tickDoorClosing(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= DOOR_TRANSIT_S) {
                this.state = STATE.IDLE;
                this.doorTimer = 0;
            }
        }
    }

    ElevatorLogic.STATE = STATE;
    ElevatorLogic.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
    ElevatorLogic.DOOR_TRANSIT_S = DOOR_TRANSIT_S;
    ElevatorLogic.MOVE_SPEED = MOVE_SPEED;
    ElevatorLogic.PERSON_SPOTS = PERSON_SPOTS;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
