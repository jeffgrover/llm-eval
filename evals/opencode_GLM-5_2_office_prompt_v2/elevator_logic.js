// elevator_logic.js — pure elevator scheduler/state machine (no Three.js/DOM)
// Usable from both browser global and Node module.exports.
(function (root) {
    "use strict";

    var IDLE = "IDLE", MOVING = "MOVING",
        DOOR_OPENING = "DOOR_OPENING", DOOR_OPEN = "DOOR_OPEN", DOOR_CLOSING = "DOOR_CLOSING";

    var STATES = {
        IDLE: IDLE, MOVING: MOVING,
        DOOR_OPENING: DOOR_OPENING, DOOR_OPEN: DOOR_OPEN, DOOR_CLOSING: DOOR_CLOSING
    };

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;
            this.travelSpeed = opts.travelSpeed || 1.6;     // floors/sec
            this.doorSpeed = opts.doorSpeed || 2.0;          // door open fraction/sec
            this.MIN_DOOR_OPEN_S = opts.MIN_DOOR_OPEN_S || 0.4;
            this.MAX_DOOR_OPEN_S = opts.MAX_DOOR_OPEN_S || 6.0;
            this.reset();
        }

        reset() {
            this.state = IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.doorPos = 0;             // 0 closed .. 1 fully open
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Map();        // person -> {index, toFloor}
            this.pendingBoarders = new Map();   // person -> {index, x, y, z, toFloor}
            this.pendingDisembark = new Map();  // person -> {index}
            this.spotOccupancy = [false, false, false, false];
            this.doorTimer = 0;
            this.servedThisDoorCycle = new Set();   // floors we already served this open cycle
        }

        // ---- Public API mirroring visual elevator ----
        callUp(floor) { if (floor < 0 || floor >= this.floorCount) return; this.upCalls.add(floor); }
        callDown(floor) { if (floor < 0 || floor >= this.floorCount) return; this.downCalls.add(floor); }

        pressDestination(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            // No more stops pending in current direction => accept anyone
            if (this.direction === 0) return true;
            if (!this.hasStopsAhead(this.direction)) return true;
            return direction === this.direction;
        }

        hasStopsAhead(dir) {
            var f = this.currentFloor;
            if (dir > 0) {
                for (var i = f + 1; i < this.floorCount; i++) {
                    if (this.destinations.has(i) || this.upCalls.has(i)) return true;
                }
            } else if (dir < 0) {
                for (var j = f - 1; j >= 0; j--) {
                    if (this.destinations.has(j) || this.downCalls.has(j)) return true;
                }
            }
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person, toFloor) {
            if (this.currentCapacityFree() <= 0) return null;
            for (var i = 0; i < this.maxCapacity; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = true;
                    var y = 0; // caller maps to world coords via floorHeight
                    var spot = { index: i, x: 0, y: y, z: 0, toFloor: toFloor };
                    // x/z offsets filled by adapter; logic just tracks index
                    this.pendingBoarders.set(person, spot);
                    return spot;
                }
            }
            return null;
        }

        completeBoard(person) {
            var spot = this.pendingBoarders.get(person);
            if (!spot) return;
            this.pendingBoarders.delete(person);
            this.passengers.set(person, { index: spot.index, toFloor: spot.toFloor });
            if (spot.toFloor != null) this.destinations.add(spot.toFloor);
        }

        registerDisembark(person) {
            var p = this.passengers.get(person);
            if (!p) return;
            this.pendingDisembark.set(person, { index: p.index });
            this.passengers.delete(person);
        }

        completeDisembark(person) {
            var d = this.pendingDisembark.get(person);
            if (!d) return;
            this.pendingDisembark.delete(person);
            if (d.index != null) this.spotOccupancy[d.index] = false;
        }

        // ---- Helpers ----
        anyWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0
                || this.passengers.size > 0 || this.pendingBoarders.size > 0;
        }

        stopsOnFloor(f) {
            return this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f);
        }

        // pick nearest stop in a given direction from currentFloor, or null
        nearestStopInDir(dir) {
            var best = null, bestDist = Infinity;
            var add = function (f) {
                var d = (f - this.currentFloor) * dir;
                if (d <= 0) return;
                if (d < bestDist) { bestDist = d; best = f; }
            }.bind(this);
            if (dir > 0) {
                this.destinations.forEach(add);
                this.upCalls.forEach(add);
                // down-calls above also count as stops (will reverse there)
                this.downCalls.forEach(add);
            } else if (dir < 0) {
                this.destinations.forEach(add);
                this.downCalls.forEach(add);
                this.upCalls.forEach(add);
            }
            return best;
        }

        nearestStopAny() {
            var best = null, bestDist = Infinity;
            var all = new Set();
            this.destinations.forEach(function (f) { all.add(f); });
            this.upCalls.forEach(function (f) { all.add(f); });
            this.downCalls.forEach(function (f) { all.add(f); });
            all.forEach(function (f) {
                var d = Math.abs(f - this.currentFloor);
                if (d < bestDist) { bestDist = d; best = f; }
            }.bind(this));
            return best;
        }

        pickTarget() {
            // Passenger destinations outrank same-floor hall calls.
            // If passengers exist with destinations, pick a destination.
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                var dir = this.direction;
                var dest = null;
                if (dir !== 0) dest = this.nearestStopInDir(dir);
                // nearestStopInDir scans destinations set; but we want only passenger destinations
                // Filter: pick nearest passenger destination in direction, else nearest overall.
                var pDests = [];
                this.passengers.forEach(function (p) { if (p.toFloor != null) pDests.push(p.toFloor); });
                if (pDests.length > 0) {
                    pDests.sort(function (a, b) {
                        return Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor);
                    }.bind(this));
                    var inDir = pDests.filter(function (f) {
                        return (f - this.currentFloor) * dir > 0;
                    }.bind(this));
                    if (inDir.length > 0) return inDir[0];
                    // reverse direction
                    var rev = dir === 0 ? 0 : -dir;
                    var revArr = pDests.filter(function (f) {
                        return (f - this.currentFloor) * rev > 0;
                    }.bind(this));
                    if (revArr.length > 0) return revArr[0];
                    return pDests[0];
                }
            }

            // Continue in current direction if stops remain ahead
            if (this.direction !== 0) {
                var ahead = this.nearestStopInDir(this.direction);
                if (ahead != null) return ahead;
            }
            // Reverse
            if (this.direction !== 0) {
                var behind = this.nearestStopInDir(-this.direction);
                if (behind != null) {
                    this.direction = -this.direction;
                    return behind;
                }
                this.direction = 0;
            }
            // Idle: pick nearest active call/destination
            if (this.direction === 0) {
                var t = this.nearestStopAny();
                if (t != null) {
                    this.direction = t > this.currentFloor ? 1 : (t < this.currentFloor ? -1 : 0);
                    return t;
                }
            }
            return null;
        }

        shouldStopHere(f) {
            // Stop if a destination or matching-direction call, or reversal point.
            if (this.destinations.has(f)) return true;
            if (this.direction >= 0 && this.upCalls.has(f)) return true;
            if (this.direction <= 0 && this.downCalls.has(f)) return true;
            // If no stops ahead in current direction, also stop for opposite-direction call here
            if (!this.hasStopsAhead(this.direction) && (this.upCalls.has(f) || this.downCalls.has(f))) return true;
            return false;
        }

        // ---- tick ----
        tick(dt) {
            dt = Math.max(0, dt);
            switch (this.state) {
                case IDLE:
                    this.doorPos = 0;
                    if (this.anyWork()) {
                        var t = this.pickTarget();
                        if (t != null) {
                            this.targetFloor = t;
                            if (t !== this.currentFloor) {
                                this.direction = t > this.currentFloor ? 1 : -1;
                                this.state = MOVING;
                            } else {
                                // open doors at current floor (e.g. destination == currentFloor)
                                this.state = DOOR_OPENING;
                                this.doorTimer = 0;
                                this.servedThisDoorCycle = new Set();
                            }
                        }
                    }
                    break;

                case MOVING:
                    // re-evaluate target each frame for closer stop
                    var ahead = this.nearestStopInDir(this.direction);
                    if (ahead != null) {
                        // pick the *nearest* stop ahead, not just any
                        this.targetFloor = ahead;
                    }
                    // step toward target
                    var step = this.travelSpeed * dt * this.direction;
                    var nf = this.currentFloor + step;
                    if ((this.direction > 0 && nf >= this.targetFloor) ||
                        (this.direction < 0 && nf <= this.targetFloor)) {
                        this.currentFloor = this.targetFloor;
                        this.state = DOOR_OPENING;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle = new Set();
                    } else {
                        this.currentFloor = nf;
                    }
                    break;

                case DOOR_OPENING:
                    this.doorPos += this.doorSpeed * dt;
                    if (this.doorPos >= 1) {
                        this.doorPos = 1;
                        this.state = DOOR_OPEN;
                        this.doorTimer = 0;
                        this.onArriveDoorsOpen();
                    }
                    break;

                case DOOR_OPEN:
                    this.doorTimer += dt;
                    // clear served calls for this floor
                    this.serveFloor();
                    var canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0
                        && this.doorTimer >= this.MIN_DOOR_OPEN_S;
                    var mustClose = this.doorTimer >= this.MAX_DOOR_OPEN_S;
                    // prevent same-floor reopen while destinations exist
                    if (canClose || mustClose) {
                        this.state = DOOR_CLOSING;
                    }
                    break;

                case DOOR_CLOSING:
                    this.doorPos -= this.doorSpeed * dt;
                    if (this.doorPos <= 0) {
                        this.doorPos = 0;
                        // doors fully closed — pick next target
                        this.servedThisDoorCycle = new Set();
                        var nt = this.pickTarget();
                        if (nt == null) {
                            this.state = IDLE;
                            this.direction = 0;
                            this.targetFloor = this.currentFloor;
                        } else if (nt === this.currentFloor) {
                            // reopen (e.g., a fresh call at this floor) — but only if not already
                            // served this cycle and no in-car destinations outrank.
                            if (this.passengers.size > 0 && this.destinations.size > 0) {
                                // don't reopen; passengers want elsewhere
                                this.state = IDLE;
                                this.direction = 0;
                            } else {
                                this.state = DOOR_OPENING;
                                this.doorTimer = 0;
                            }
                        } else {
                            this.targetFloor = nt;
                            this.direction = nt > this.currentFloor ? 1 : -1;
                            this.state = MOVING;
                        }
                    }
                    break;
            }
        }

        onArriveDoorsOpen() {
            // Clear destinations for this floor (passengers getting off)
            this.destinations.delete(this.currentFloor);
            // Clear served hall call for current direction
            if (this.direction >= 0) this.upCalls.delete(this.currentFloor);
            if (this.direction <= 0) this.downCalls.delete(this.currentFloor);
            // If no more stops in current direction, also clear opposite-direction call at this floor
            if (!this.hasStopsAhead(this.direction)) {
                if (this.direction > 0) this.downCalls.delete(this.currentFloor);
                else if (this.direction < 0) this.upCalls.delete(this.currentFloor);
            }
        }

        serveFloor() {
            // Reapplies clearing logic on each tick the door is open (so newly pressed
            // same-direction calls at this floor get cleared once capacity serves them).
            if (this.servedThisDoorCycle.has(this.currentFloor)) return;
            // Clear destinations for this floor each tick while open
            this.destinations.delete(this.currentFloor);
            if (this.direction >= 0) this.upCalls.delete(this.currentFloor);
            if (this.direction <= 0) this.downCalls.delete(this.currentFloor);
            if (!this.hasStopsAhead(this.direction)) {
                if (this.direction > 0) this.downCalls.delete(this.currentFloor);
                else if (this.direction < 0) this.upCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle.add(this.currentFloor);
        }
    }

    ElevatorLogic.STATES = STATES;
    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic, STATES: STATES };
    }
})(typeof window !== "undefined" ? window : globalThis);
