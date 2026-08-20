/*
 * elevator_logic.js - pure elevator scheduler / state machine.
 *
 * No Three.js, no DOM, no canvas, no real timers. The visual adapter
 * (elevator.js) is responsible for geometry and for converting the
 * logical interior spots into world coordinates. Every scheduling,
 * direction, capacity, passenger and door-timing decision lives here so
 * it can be unit-tested deterministically under Node.
 *
 * Exposed as a browser global (window.ElevatorLogic) and as a Node
 * CommonJS export (module.exports = { ElevatorLogic }).
 */
(function (root) {
    "use strict";

    var STATES = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    var TIMING = {
        DOOR_ANIM_S: 1.1,     // seconds for a door to fully open or close
        MIN_DOOR_OPEN_S: 1.6, // minimum dwell time with doors open
        MAX_DOOR_OPEN_S: 9.0  // safety cap on door-open hold
    };

    // Logical interior spots, car-local coordinates. Car origin is at the
    // car center on the car floor (y = 0); the +Z face holds the sliding
    // doors. Four spots so each boarder has its own lane to the door.
    var SPOTS = [
        { index: 0, x: -0.65, y: 0, z: 0.70 },
        { index: 1, x: 0.65, y: 0, z: 0.70 },
        { index: 2, x: -0.65, y: 0, z: -0.55 },
        { index: 3, x: 0.65, y: 0, z: -0.55 }
    ];

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = Number(options.floorCount) || 6;
            this.maxCapacity = Number(options.maxCapacity) || 4;
            this.floorHeight = Number(options.floorHeight) || 3.4;
            this.speed = (typeof options.speed === "number" && options.speed > 0) ? options.speed : 1.7;
            this.reset();
        }

        reset() {
            this.state = STATES.IDLE;
            this.position = 0;              // car floor height in world meters
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0;             // +1 up, -1 down, 0 parked
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [];
            for (var i = 0; i < this.maxCapacity; i++) this.spotOccupancy.push(null);
            this.doorT = 0;                 // 0..1 door animation progress
            this.doorOpenTime = 0;          // seconds spent in DOOR_OPEN
            this.servedThisDoorCycle = null; // floor just served; anti-reopen guard
            this.lastServedFloor = null;
        }

        validFloor(floor) {
            return Number.isInteger(floor) && floor >= 0 && floor < this.floorCount;
        }

        // ----- public call / destination API -----
        callUp(floor) {
            if (this.validFloor(floor)) this.upCalls.add(floor);
        }
        callDown(floor) {
            if (this.validFloor(floor)) this.downCalls.add(floor);
        }
        pressDestination(floor) {
            if (this.validFloor(floor)) this.destinations.add(floor);
        }

        // ----- state helpers -----
        floorY(floor) {
            return floor * this.floorHeight;
        }

        // Any pending stop (destination or matching hall call) strictly
        // ahead of the car in direction dir?
        hasStopsInDirection(dir) {
            if (dir === 0) return false;
            let floor;
            for (floor of this.destinations) {
                if ((floor - this.currentFloor) * dir > 0) return true;
            }
            var calls = (dir > 0) ? this.upCalls : this.downCalls;
            for (floor of calls) {
                if ((floor - this.currentFloor) * dir > 0) return true;
            }
            return false;
        }

        // True only when the car is at `floor` in DOOR_OPEN and either the
        // caller's direction matches the car's direction, or there are no
        // more stops pending ahead in the car's current direction.
        isAcceptingAt(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.direction === direction) return true;
            if (this.direction === 0) return !this.hasStopsInDirection(direction);
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        // ----- passenger set transitions -----
        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            if (this.pendingBoarders.has(person)) {
                return this.pendingBoarders.get(person);
            }
            var index = -1;
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) { index = i; break; }
            }
            if (index < 0) return null;
            var base = SPOTS[index % SPOTS.length];
            var spot = { index: index, x: base.x, y: base.y, z: base.z };
            this.spotOccupancy[index] = person;
            this.pendingBoarders.set(person, spot);
            return spot;
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        // ----- target selection (SCAN with anti-starvation) -----
        pickNextTarget() {
            var f = this.currentFloor;

            // Priority 0: passenger destinations outrank every hall call.
            if (this.destinations.size > 0) {
                var bestDest = null;
                if (this.direction !== 0) {
                    var d;
                    for (d of this.destinations) {
                        var ahead = (d - f) * this.direction;
                        if (ahead > 0 && (bestDest === null || ahead < bestDest.dist)) {
                            bestDest = { floor: d, dist: ahead };
                        }
                    }
                }
                if (bestDest === null) {
                    for (d of this.destinations) {
                        var dd = Math.abs(d - f);
                        if (dd > 0 && (bestDest === null || dd < bestDest.dist)) {
                            bestDest = { floor: d, dist: dd };
                        }
                    }
                }
                // Anti-reopen guard: never re-open a floor we just served
                // right after serving it when there is other passenger work.
                if (bestDest && bestDest.floor === this.servedThisDoorCycle &&
                        this.destinations.size > 1) {
                    for (d of this.destinations) {
                        if (d !== bestDest.floor) {
                            return d;
                        }
                    }
                }
                return bestDest ? bestDest.floor : null;
            }

            // Priority 1: hall calls, SCAN discipline.
            var up = [];
            var down = [];
            var c;
            for (c of this.upCalls) up.push(c);
            for (c of this.downCalls) down.push(c);
            up.sort();
            down.sort();
            if (up.length === 0 && down.length === 0) return null;

            var dir = this.direction;
            if (dir !== 0) {
                // Continue in the current direction: nearest same-direction
                // call strictly ahead.
                var aheadCalls = (dir > 0) ? up : down.slice().reverse();
                for (var ai = 0; ai < aheadCalls.length; ai++) {
                    var ac = aheadCalls[ai];
                    if ((ac - f) * dir > 0) return ac;
                }
                // No work ahead: reverse direction and take the nearest
                // opposite-direction call behind (iterate nearest-first).
                var behindCalls = (dir > 0) ? down.slice().reverse() : up;
                for (var bi = 0; bi < behindCalls.length; bi++) {
                    var bc = behindCalls[bi];
                    if ((f - bc) * dir > 0) return bc;
                }
                // Nothing anywhere except a same-floor call: serve it.
                if (up.indexOf(f) >= 0 || down.indexOf(f) >= 0) return f;
                return null;
            }

            // Parked (direction 0): take a same-floor call, then the nearest
            // call in either direction (up preferred on ties).
            if (up.indexOf(f) >= 0) {
                if (this.servedThisDoorCycle !== f) return f;
                // We just served this very floor; if any other call exists,
                // give it the chance first (the floor-0 call will be
                // collected on the way through, which SCAN handles).
            }
            var parkedBest = null;
            for (var ui = 0; ui < up.length; ui++) {
                if (up[ui] === f) continue;
                if (parkedBest === null || Math.abs(up[ui] - f) < parkedBest.dist) {
                    parkedBest = { floor: up[ui], dist: Math.abs(up[ui] - f) };
                }
            }
            for (var di2 = 0; di2 < down.length; di2++) {
                if (down[di2] === f) continue;
                if (parkedBest === null || Math.abs(down[di2] - f) < parkedBest.dist) {
                    parkedBest = { floor: down[di2], dist: Math.abs(down[di2] - f) };
                }
            }
            if (parkedBest) return parkedBest.floor;
            if (up.indexOf(f) >= 0 || down.indexOf(f) >= 0) return f;
            return null;
        }

        // While MOVING: find a stop in the same direction that is strictly
        // closer than the current target, so we can shorten the trip.
        findCloserStopInDirection(dir, targetFloor) {
            if (dir === 0) return null;
            var targetDist = (targetFloor - this.currentFloor) * dir;
            if (targetDist <= 0) return null;
            var best = null;
            var floors = new Set();
            var f;
            for (f of this.destinations) floors.add(f);
            if (dir > 0) { for (f of this.upCalls) floors.add(f); }
            else { for (f of this.downCalls) floors.add(f); }
            for (f of floors) {
                var d = (f - this.currentFloor) * dir;
                if (d > 0 && d < targetDist && (best === null || d < (best - this.currentFloor) * dir)) {
                    best = f;
                }
            }
            return best;
        }

        // ----- one frame of the state machine -----
        tick(dt) {
            if (!(dt > 0)) return;
            switch (this.state) {
                case STATES.IDLE:
                    var target = this.pickNextTarget();
                    if (target !== null && target !== this.currentFloor) {
                        this.targetFloor = target;
                        this.direction = (target > this.currentFloor) ? 1 : -1;
                        this.state = STATES.MOVING;
                    } else if (target === this.currentFloor) {
                        // Same-floor work: open the doors to serve it.
                        this.targetFloor = target;
                        this.direction = 0;
                        this.state = STATES.DOOR_OPENING;
                        this.doorT = 0;
                    }
                    break;
                case STATES.MOVING:
                    var closer = this.findCloserStopInDirection(this.direction, this.targetFloor);
                    if (closer !== null) this.targetFloor = closer;
                    var targetY = this.floorY(this.targetFloor);
                    var nextY = this.position + this.direction * this.speed * dt;
                    var arrived = (this.direction > 0) ? (nextY >= targetY) : (nextY <= targetY);
                    if (arrived) {
                        this.position = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = STATES.DOOR_OPENING;
                        this.doorT = 0;
                    } else {
                        this.position = nextY;
                    }
                    break;
                case STATES.DOOR_OPENING:
                    this.doorT += dt / TIMING.DOOR_ANIM_S;
                    if (this.doorT >= 1) {
                        this.doorT = 1;
                        this.state = STATES.DOOR_OPEN;
                        this.doorOpenTime = 0;
                        this.serveArrival();
                    }
                    break;
                case STATES.DOOR_OPEN:
                    this.doorOpenTime += dt;
                    var pending = (this.pendingBoarders.size > 0) || (this.pendingDisembark.size > 0);
                    if (!pending && this.doorOpenTime >= TIMING.MIN_DOOR_OPEN_S) {
                        this.state = STATES.DOOR_CLOSING;
                        this.doorT = 0;
                    } else if (this.doorOpenTime >= TIMING.MAX_DOOR_OPEN_S) {
                        this.state = STATES.DOOR_CLOSING;
                        this.doorT = 0;
                    }
                    break;
                case STATES.DOOR_CLOSING:
                    this.doorT += dt / TIMING.DOOR_ANIM_S;
                    if (this.doorT >= 1) {
                        this.doorT = 0;
                        this.state = STATES.IDLE;
                    }
                    break;
                default:
                    this.state = STATES.IDLE;
                    break;
            }
        }
    }

    // Serve a door-open arrival: clear the destination for this floor and
    // the hall call we came for; if nothing is left ahead in our direction,
    // also clear the opposite-direction call here so it rides along before
    // we leave.
    ElevatorLogic.prototype.serveArrival = function () {
        var f = this.currentFloor;
        var self = this;
        self.destinations.delete(f);
        if (self.direction > 0) self.upCalls.delete(f);
        else if (self.direction < 0) self.downCalls.delete(f);
        if (!self.hasStopsInDirection(self.direction)) {
            if (self.direction > 0) self.downCalls.delete(f);
            else if (self.direction < 0) self.upCalls.delete(f);
            else { self.upCalls.delete(f); self.downCalls.delete(f); }
        }
        self.servedThisDoorCycle = f;
        self.lastServedFloor = f;
    };

    ElevatorLogic.STATES = STATES;
    ElevatorLogic.TIMING = TIMING;
    ElevatorLogic.SPOTS = SPOTS;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
