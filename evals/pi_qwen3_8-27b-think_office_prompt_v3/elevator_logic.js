// elevator_logic.js - pure elevator scheduler/state machine.
// No Three.js, no DOM, no browser-only dependencies. Runnable under Node.
(function (root) {
    "use strict";

    // Logical interior spots (2x2) in car-local space. Car is a 3x3 column.
    var INTERIOR_SPOTS = [
        { x: -0.7, z: -0.7 },
        { x: 0.7, z: -0.7 },
        { x: -0.7, z: 0.7 },
        { x: 0.7, z: 0.7 }
    ];

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;

            // Tunable timing (seconds of elevator time).
            this.DOOR_OPEN_DURATION = opts.doorOpenDuration !== undefined ? opts.doorOpenDuration : 0.6;
            this.DOOR_CLOSE_DURATION = opts.doorCloseDuration !== undefined ? opts.doorCloseDuration : 0.6;
            this.MIN_DOOR_OPEN_S = opts.minDoorOpenS !== undefined ? opts.minDoorOpenS : 1.6;
            this.MAX_DOOR_OPEN_S = opts.maxDoorOpenS !== undefined ? opts.maxDoorOpenS : 14;
            this.CAR_SPEED = opts.carSpeed !== undefined ? opts.carSpeed : 2.0; // world units / s

            this.S_IDLE = "IDLE";
            this.S_MOVING = "MOVING";
            this.S_DOOR_OPENING = "DOOR_OPENING";
            this.S_DOOR_OPEN = "DOOR_OPEN";
            this.S_DOOR_CLOSING = "DOOR_CLOSING";

            // Spot occupancy: one entry per logical spot (person or null).
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);

            this.state = this.S_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.y = 0;
            this.doorProgress = 0; // 0 closed .. 1 open
            this.doorTimer = 0;
            this.doorOpenTime = 0;

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.lastServedFloor = 0;
            this.servedThisDoorCycle = false;
        }

        // ---- Public hall-call / destination API -------------------------------------

        callUp(floor) { this.upCalls.add(floor); this.downCalls.delete(floor); }
        callDown(floor) { this.downCalls.add(floor); this.upCalls.delete(floor); }

        pressDestination(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.destinations.add(floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== this.S_DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            var ahead = this._stopsInDirection(this.direction);
            if (ahead.length > 0 && direction !== this.direction) return false;
            return true;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            var index = -1;
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) { index = i; break; }
            }
            if (index < 0) return null;
            this.spotOccupancy[index] = person;
            this.pendingBoarders.add(person);
            var spot = INTERIOR_SPOTS[index] || { x: 0, z: 0 };
            return { index: index, x: spot.x, y: 0, z: spot.z };
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
            for (var i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) { this.spotOccupancy[i] = null; break; }
            }
        }

        // ---- Internal helpers -------------------------------------------------------

        // Stops (destinations + matching-direction hall calls) strictly ahead of cur.
        _stopsInDirection(dir) {
            var cur = this.currentFloor;
            var set = new Set();
            for (var f of this.destinations) set.add(f);
            if (dir > 0) for (var u of this.upCalls) set.add(u);
            else if (dir < 0) for (var d of this.downCalls) set.add(d);
            var out = [];
            for (var floor of set) {
                if (floor === cur) continue;
                if (dir > 0 && floor > cur) out.push(floor);
                else if (dir < 0 && floor < cur) out.push(floor);
            }
            return out;
        }

        _nearest(arr, from) {
            var best = null;
            for (var i = 0; i < arr.length; i++) {
                var f = arr[i];
                if (best === null || Math.abs(f - from) < Math.abs(best - from)) best = f;
            }
            return best;
        }

        _nearestDestination(from) {
            var dests = [];
            for (var f of this.destinations) if (f !== from) dests.push(f);
            if (!dests.length) return null;
            return this._nearest(dests, from);
        }

        // Decide whether to move or open doors. Called when IDLE (doors closed, at rest).
        _chooseNextAction() {
            var cur = this.currentFloor;
            var hasDest = this.destinations.size > 0;

            // 1) Passenger destinations outrank everything, including same-floor hall calls.
            if (hasDest) {
                var ddest = this._nearestDestination(cur);
                if (ddest !== null) {
                    this.direction = ddest > cur ? 1 : -1;
                    this.targetFloor = ddest;
                    this.servedThisDoorCycle = false;
                    this._startMoving();
                    return;
                }
            }

            // 2) Continue the current direction if there is a matching hall call ahead.
            if (this.direction !== 0) {
                var ahead = this._stopsInDirection(this.direction);
                if (ahead.length) {
                    this.targetFloor = this.direction > 0 ? Math.min.apply(null, ahead) : Math.max.apply(null, ahead);
                    this.servedThisDoorCycle = false;
                    this._startMoving();
                    return;
                }
            }

            // 3) No forward work. A hall call at the current floor opens the doors (boarders here).
            if (this.upCalls.has(cur) || this.downCalls.has(cur)) {
                this._openDoors();
                return;
            }

            // 4) Reverse to reach a hall call somewhere else.
            var all = new Set();
            for (var u of this.upCalls) all.add(u);
            for (var d of this.downCalls) all.add(d);
            all.delete(cur);
            if (all.size) {
                var target = null;
                if (this.direction !== 0) {
                    var od = -this.direction;
                    var obh = this._stopsInDirection(od);
                    if (obh.length) {
                        this.direction = od;
                        target = od > 0 ? Math.min.apply(null, obh) : Math.max.apply(null, obh);
                    }
                }
                if (target === null) {
                    target = this._nearest(Array.from(all), cur);
                    if (target === null) { this.direction = 0; this.targetFloor = cur; return; }
                    this.direction = target > cur ? 1 : -1;
                }
                this.targetFloor = target;
                this.servedThisDoorCycle = false;
                this._startMoving();
                return;
            }

            // 5) Nothing to do; park (doors stay closed, do not reopen).
            this.direction = 0;
            this.targetFloor = cur;
            this.state = this.S_IDLE;
        }

        _startMoving() {
            if (this.targetFloor === this.currentFloor) { this._openDoors(); return; }
            this.state = this.S_MOVING;
            this.doorTimer = 0;
            this.doorOpenTime = 0;
        }

        _openDoors() {
            this.state = this.S_DOOR_OPENING;
            this.doorTimer = 0;
            this.doorOpenTime = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
        }

        // On arrival at a floor, clear the work we just served.
        _onArrival() {
            var cur = this.currentFloor;
            this.destinations.delete(cur);
            if (this.direction > 0) this.upCalls.delete(cur);
            else if (this.direction < 0) this.downCalls.delete(cur);
            // If no more stops in the current direction, also clear the opposite-direction
            // call at this floor so it can be served (boarded) before leaving.
            var ahead = this._stopsInDirection(this.direction);
            if (ahead.length === 0) {
                if (this.direction > 0) this.downCalls.delete(cur);
                else if (this.direction < 0) this.upCalls.delete(cur);
            }
        }

        _recomputeMovingTarget() {
            var d = this.direction;
            if (d === 0) return;
            // Include the floor the car is physically between, so we only target floors ahead.
            var carFloat = this.y / this.floorHeight;
            var stops = new Set(this.destinations);
            if (d > 0) for (var u of this.upCalls) stops.add(u);
            else for (var dn of this.downCalls) stops.add(dn);
            var best = null;
            for (var f of stops) {
                if (d > 0 && f > carFloat + 0.01) { if (best === null || f < best) best = f; }
                else if (d < 0 && f < carFloat - 0.01) { if (best === null || f > best) best = f; }
            }
            if (best !== null) this.targetFloor = best;
        }

        // ---- State machine tick -----------------------------------------------------

        tick(dt) {
            if (!(dt > 0)) return;
            var guard = 0;
            var stepMax = Math.max(0.05, this.CAR_SPEED * 0.35);
            while (dt > 0.000001 && guard < 500) {
                guard++;
                if (this.state === this.S_IDLE) {
                    this._chooseNextAction();
                    continue; // zero time consumed; next loop handles the new state
                }
                if (this.state === this.S_MOVING) {
                    var targetY = this.targetFloor * this.floorHeight;
                    var dist = Math.abs(targetY - this.y);
                    var step = Math.min(dist, dt, stepMax);
                    this.y += (targetY > this.y ? 1 : -1) * step;
                    dt -= step;
                    this._recomputeMovingTarget();
                    if (Math.abs(this.y - this.targetFloor * this.floorHeight) < 0.0001) {
                        this.y = this.targetFloor * this.floorHeight;
                        this.currentFloor = this.targetFloor;
                        this._onArrival();
                        this.state = this.S_DOOR_OPENING;
                        this.doorTimer = 0;
                        this.doorOpenTime = 0;
                        continue;
                    }
                    if (dt <= 0.000001) break;
                    continue;
                }
                if (this.state === this.S_DOOR_OPENING) {
                    var need = this.DOOR_OPEN_DURATION - this.doorTimer;
                    var take = Math.min(need, dt);
                    this.doorTimer += take; dt -= take;
                    if (this.doorTimer >= this.DOOR_OPEN_DURATION - 0.000001) {
                        this.state = this.S_DOOR_OPEN;
                        this.doorOpenTime = 0;
                        this.doorProgress = 1;
                    }
                    if (dt <= 0.000001) break;
                    continue;
                }
                if (this.state === this.S_DOOR_OPEN) {
                    // Hold the doors while anyone is boarding / disembarking.
                    var busy = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    var canClose = !busy && this.doorOpenTime >= this.MIN_DOOR_OPEN_S;
                    var mustClose = this.doorOpenTime >= this.MAX_DOOR_OPEN_S;
                    if (canClose || mustClose) {
                        this.state = this.S_DOOR_CLOSING;
                        this.doorTimer = 0;
                        continue;
                    }
                    // Consume time but never past the close threshold we just computed.
                    var rem = Math.max(0.001, Math.min(this.MIN_DOOR_OPEN_S, this.MAX_DOOR_OPEN_S) - this.doorOpenTime);
                    if (mustClose) rem = Math.max(0.001, this.MAX_DOOR_OPEN_S - this.doorOpenTime);
                    var take2 = Math.min(rem, dt);
                    this.doorOpenTime += take2; dt -= take2;
                    this.doorProgress = 1;
                    if (dt <= 0.000001) break;
                    continue;
                }
                if (this.state === this.S_DOOR_CLOSING) {
                    var need2 = this.DOOR_CLOSE_DURATION - this.doorTimer;
                    var take3 = Math.min(need2, dt);
                    this.doorTimer += take3; dt -= take3;
                    if (this.doorTimer >= this.DOOR_CLOSE_DURATION - 0.000001) {
                        this.state = this.S_IDLE;
                        this.doorProgress = 0;
                        // Re-evaluate immediately (may chain into MOVING / DOOR_OPENING).
                    }
                    if (dt <= 0.000001) break;
                    continue;
                }
                // Safety: never spin without consuming time.
                dt -= 0.0001;
                if (dt <= 0.000001) break;
            }
        }

        reset() {
            this.state = this.S_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.y = 0;
            this.doorProgress = 0;
            this.doorTimer = 0;
            this.doorOpenTime = 0;
            this.upCalls.clear();
            this.downCalls.clear();
            this.destinations.clear();
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            for (var i = 0; i < this.spotOccupancy.length; i++) this.spotOccupancy[i] = null;
            this.lastServedFloor = 0;
            this.servedThisDoorCycle = false;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
