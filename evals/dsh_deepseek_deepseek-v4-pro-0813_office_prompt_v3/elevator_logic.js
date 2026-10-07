/* elevator_logic.js — pure elevator scheduler/state machine.
 * No Three.js, DOM, canvas, or browser-only dependencies.
 * Dual environment: exposes window.ElevatorLogic in the browser and
 * module.exports = { ElevatorLogic } for Node tests. No ES module syntax.
 */
(function (root) {
    "use strict";

    var STATE = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    // logical interior spot offsets (car-local space, x / z)
    var SPOT_LAYOUT = [
        { index: 0, x: -0.7, z: -0.4 },
        { index: 1, x: 0.7, z: -0.4 },
        { index: 2, x: -0.7, z: 0.5 },
        { index: 3, x: 0.7, z: 0.5 }
    ];

    var DOOR_OPEN_SEC = 1.2;      // time for doors to slide fully open
    var MIN_DOOR_OPEN_S = 1.6;
    var MAX_DOOR_OPEN_S = 8.0;
    var MOVE_SPEED = 2.0;          // floors per second

    function ElevatorLogic(options) {
        options = options || {};
        this.floorCount = options.floorCount || 6;
        this.maxCapacity = options.maxCapacity || 4;
        this.floorHeight = options.floorHeight || 3.4;
        this.reset();
    }

    ElevatorLogic.prototype.reset = function () {
        this.state = STATE.IDLE;
        this.direction = 0;          // +1, 0, -1
        this.currentFloor = 0;
        this.targetFloor = null;
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupancy = [false, false, false, false];
        this.doorTimer = 0;
        this.stateTimer = 0;
        // door-cycle service guards
        this.servedThisDoorCycle = false;
        this.lastServedFloor = null;
        this.positionY = 0;
    };

    ElevatorLogic.prototype.callUp = function (floor) {
        if (floor >= 0 && floor < this.floorCount) {
            if (floor === this.currentFloor && this.state === STATE.DOOR_OPEN && this.direction >= 0) {
                this.servedThisDoorCycle = true; // will be served immediately
            }
            this.upCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.callDown = function (floor) {
        if (floor >= 0 && floor < this.floorCount) {
            if (floor === this.currentFloor && this.state === STATE.DOOR_OPEN && this.direction <= 0) {
                this.servedThisDoorCycle = true;
            }
            this.downCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.pressDestination = function (floor) {
        if (floor >= 0 && floor < this.floorCount) {
            this.destinations.add(floor);
        }
    };

    ElevatorLogic.prototype.isAcceptingAt = function (floor, direction) {
        if (this.state !== STATE.DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        if (this.currentCapacityFree() <= 0) return false;

        // Determine whether any stops remain that would keep the car moving
        // in its current direction.
        var stopsAhead = this._hasStopsAhead(this.currentFloor, this.direction);

        if (!this.direction) {
            return true; // idle car just opened; accept any matching call
        }
        // If caller's direction matches car's direction, accept.
        if ((this.direction === 1 && direction >= 0) ||
            (this.direction === -1 && direction <= 0)) {
            return true;
        }
        // If no stops remain in current direction, car will reverse soon; accept.
        if (!stopsAhead) return true;
        return false;
    };

    ElevatorLogic.prototype._hasStopsAhead = function (floor, dir) {
        var f;
        if (dir > 0) {
            for (f = floor + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f) || this.upCalls.has(f)) return true;
            }
            return false;
        } else if (dir < 0) {
            for (f = floor - 1; f >= 0; f--) {
                if (this.destinations.has(f) || this.downCalls.has(f)) return true;
            }
            return false;
        }
        return false;
    };

    ElevatorLogic.prototype.currentCapacityFree = function () {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function (person) {
        if (this.currentCapacityFree() <= 0) return null;
        var spot = this._findFreeSpot();
        if (spot === null) return null;
        this.spotOccupancy[spot.index] = true;
        this.pendingBoarders.add(person);
        if (person && typeof person === "object") person._spotIndex = spot.index;
        var y = this.currentFloor * this.floorHeight;
        return { index: spot.index, x: spot.x, y: y, z: spot.z };
    };

    ElevatorLogic.prototype._findFreeSpot = function () {
        for (var i = 0; i < SPOT_LAYOUT.length; i++) {
            if (!this.spotOccupancy[i]) return SPOT_LAYOUT[i];
        }
        return null;
    };

    ElevatorLogic.prototype.completeBoard = function (person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
    };

    ElevatorLogic.prototype.registerDisembark = function (person) {
        if (this.passengers.has(person) || this.pendingDisembark.has(person)) {
            this.pendingDisembark.add(person);
            if (this.passengers.has(person)) this.passengers.delete(person);
        }
    };

    ElevatorLogic.prototype.completeDisembark = function (person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
            this._releasePersonSpot(person);
        }
    };

    // Release a logical interior spot. Sim-level action stores spotIndex on the
    // person; if present use it, otherwise free the first occupied spot.
    ElevatorLogic.prototype._releasePersonSpot = function (person) {
        if (person && typeof person._spotIndex === "number") {
            var idx = person._spotIndex;
            if (idx >= 0 && idx < this.spotOccupancy.length) {
                this.spotOccupancy[idx] = false;
            }
            person._spotIndex = null;
            return;
        }
        // fallback: free any single occupied spot not accounted by pending boarders
        for (var i = this.spotOccupancy.length - 1; i >= 0; i--) {
            if (this.spotOccupancy[i]) {
                this.spotOccupancy[i] = false;
                return;
            }
        }
    };

    ElevatorLogic.prototype.tick = function (dt) {
        // Run state machine by processing events, then advance timers.
        this._process(dt);
        // second pass to allow state transitions to complete within same tick
        // (harmless; guards prevent infinite loops)
    };

    ElevatorLogic.prototype._process = function (dt) {
        switch (this.state) {
            case STATE.IDLE:
                this._tickIdle(dt);
                break;
            case STATE.MOVING:
                this._tickMoving(dt);
                break;
            case STATE.DOOR_OPENING:
            case STATE.DOOR_OPEN:
            case STATE.DOOR_CLOSING:
                this._tickDoors(dt);
                break;
            default:
                break;
        }
    };

    ElevatorLogic.prototype._pickTarget = function () {
        // Choose the next floor to travel to based on current direction and work.
        // Passenger destinations outrank hall calls.
        var dir = this.direction;

        // Gather all demand.
        var anyDest = this.destinations.size > 0;
        var anyCalls = (this.upCalls.size + this.downCalls.size) > 0;
        if (!anyDest && !anyCalls) {
            return null; // nothing to do
        }

        if (dir === 0) {
            // idle: infer direction from nearest active demand.
            var nearest = this._nearestDemand();
            if (nearest === null) return null;
            if (nearest === this.currentFloor) {
                // open doors at this floor
                this.direction = this._inferDirectionAtCurrent();
                return this.currentFloor;
            }
            this.direction = nearest > this.currentFloor ? 1 : -1;
            return this._nearestStopIn(this.direction);
        }

        // moving (or continuing): passenger destinations outrank hall calls.
        if (anyDest) {
            var d = this._nearestDestIn(dir);
            if (d !== null) return d;
        }

        // matching-direction hall call ahead
        var hc = this._nearestHallCallIn(dir);
        if (hc !== null) return hc;

        // no work ahead in current direction -> reverse
        this.direction = -dir;
        var d2 = this._nearestDestIn(this.direction);
        if (d2 !== null) return d2;
        var hc2 = this._nearestHallCallIn(this.direction);
        if (hc2 !== null) return hc2;

        // if reversing found nothing in either direction, fall back to any demand
        this.direction = 0;
        var any = this._nearestDemand();
        if (any === null) return null;
        this.direction = any > this.currentFloor ? 1 : (any < this.currentFloor ? -1 : 0);
        return any;
    };

    ElevatorLogic.prototype._nearestDemand = function () {
        var best = null;
        var bestDist = Infinity;
        var self = this;
        function consider(f, dist) {
            if (Math.abs(dist) < Math.abs(bestDist) ||
                (Math.abs(dist) === Math.abs(bestDist) && best !== null && f < best)) {
                best = f;
                bestDist = dist;
            }
        }
        this.destinations.forEach(function (f) { consider(f, f - self.currentFloor); });
        this.upCalls.forEach(function (f) { consider(f, f - self.currentFloor); });
        this.downCalls.forEach(function (f) { consider(f, f - self.currentFloor); });
        return best;
    };

    ElevatorLogic.prototype._nearestStopIn = function (dir) {
        var best = null;
        var self = this;
        if (dir > 0) {
            for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { best = f; break; }
            }
            // if passenger destinations exist, they outrank; already scanning all above
        } else if (dir < 0) {
            for (var g = this.currentFloor - 1; g >= 0; g--) {
                if (this.destinations.has(g) || this.upCalls.has(g) || this.downCalls.has(g)) { best = g; break; }
            }
        }
        return best;
    };

    ElevatorLogic.prototype._nearestDestIn = function (dir) {
        var best = null;
        if (dir > 0) {
            for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f)) { return f; }
            }
        } else if (dir < 0) {
            for (var g = this.currentFloor - 1; g >= 0; g--) {
                if (this.destinations.has(g)) { return g; }
            }
        }
        return best;
    };

    ElevatorLogic.prototype._nearestHallCallIn = function (dir) {
        if (dir > 0) {
            for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (this.upCalls.has(f)) return f;
            }
        } else if (dir < 0) {
            for (var g = this.currentFloor - 1; g >= 0; g--) {
                if (this.downCalls.has(g)) return g;
            }
        }
        // also check opposite call at a floor we'll pass (rare; still valid work)
        return null;
    };

    ElevatorLogic.prototype._inferDirectionAtCurrent = function () {
        // At the current floor with idle direction, infer direction from demand.
        var hasUp = false, hasDown = false;
        if (this.destinations.has(this.currentFloor) || this.upCalls.has(this.currentFloor)) hasUp = true;
        if (this.downCalls.has(this.currentFloor)) hasDown = true;
        // immediate demand above
        for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
            if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) { hasUp = true; break; }
        }
        for (var g = this.currentFloor - 1; g >= 0; g--) {
            if (this.destinations.has(g) || this.upCalls.has(g) || this.downCalls.has(g)) { hasDown = true; break; }
        }
        if (hasUp && !hasDown) return 1;
        if (hasDown && !hasUp) return -1;
        // default to up when ambiguous
        return 1;
    };

    ElevatorLogic.prototype._tickIdle = function (dt) {
        var target = this._pickTarget();
        if (target === null) {
            // nothing to do; ensure doors closed and parked
            this.direction = 0;
            this.targetFloor = null;
            return;
        }
        if (target === this.currentFloor) {
            this.targetFloor = this.currentFloor;
            this._startDoors(dt);
        } else {
            this.targetFloor = target;
            this.state = STATE.MOVING;
        }
    };

    ElevatorLogic.prototype._startDoors = function (dt) {
        this.state = STATE.DOOR_OPENING;
        this.stateTimer = 0;
        this.servedThisDoorCycle = false;
        this.lastServedFloor = this.currentFloor;
    };

    ElevatorLogic.prototype._tickMoving = function (dt) {
        // Re-evaluate target each frame: scan for a closer stop in the same
        // direction and shorten targetFloor if appropriate.
        var closer = this._recomputeMovingTarget();
        if (closer !== null) this.targetFloor = closer;

        if (this.targetFloor === null) {
            this.state = STATE.IDLE;
            this.direction = 0;
            return;
        }

        if (this.targetFloor === this.currentFloor) {
            this._startDoors(dt);
            return;
        }

        var dir = (this.targetFloor > this.currentFloor) ? 1 : -1;
        this.direction = dir;

        var dist = this.floorHeight * dir * MOVE_SPEED * dt;
        this.positionY += dist;
        var targetY = this.targetFloor * this.floorHeight;

        var arrived = false;
        if (dir > 0) {
            if (this.positionY >= targetY) { this.positionY = targetY; arrived = true; }
        } else {
            if (this.positionY <= targetY) { this.positionY = targetY; arrived = true; }
        }

        if (arrived) {
            this.currentFloor = this.targetFloor;
            this._startDoors(dt);
        }
    };

    ElevatorLogic.prototype._recomputeMovingTarget = function () {
        // Only consider stops strictly in the current direction of travel.
        var dir = this.direction;
        if (dir === 0) return null;
        var best = null;
        var self = this;
        if (dir > 0) {
            for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (self.destinations.has(f) || self.upCalls.has(f)) { best = f; break; }
            }
        } else {
            for (var g = this.currentFloor - 1; g >= 0; g--) {
                if (self.destinations.has(g) || self.downCalls.has(g)) { best = g; break; }
            }
        }
        return best;
    };

    ElevatorLogic.prototype._tickDoors = function (dt) {
        this.stateTimer += dt;
        switch (this.state) {
            case STATE.DOOR_OPENING:
                if (this.stateTimer >= DOOR_OPEN_SEC) {
                    this.state = STATE.DOOR_OPEN;
                    this.stateTimer = 0;
                    this._onArrivalOpen();
                }
                break;
            case STATE.DOOR_OPEN:
                this.doorTimer += dt;
                var minElapsed = this.doorTimer >= MIN_DOOR_OPEN_S;
                var busy = (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0);
                if (minElapsed && !busy) {
                    this._closeDoors();
                } else if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                    // safety cap
                    this._closeDoors();
                }
                break;
            case STATE.DOOR_CLOSING:
                if (this.stateTimer >= DOOR_OPEN_SEC) {
                    // doors closed; pick next target
                    this.state = STATE.IDLE;
                    this.doorTimer = 0;
                    this._advanceAfterClose();
                }
                break;
            default:
                break;
        }
    };

    ElevatorLogic.prototype._onArrivalOpen = function () {
        // clear destinations for this floor
        this.destinations.delete(this.currentFloor);
        // clear the served hall call for the current direction
        if (this.direction >= 0) this.upCalls.delete(this.currentFloor);
        if (this.direction <= 0) this.downCalls.delete(this.currentFloor);

        // If no more stops in current direction, also clear opposite call here
        // so it can be served before leaving.
        if (!this._hasStopsAhead(this.currentFloor, this.direction)) {
            this.upCalls.delete(this.currentFloor);
            this.downCalls.delete(this.currentFloor);
        }
        this.servedThisDoorCycle = true;
        this.lastServedFloor = this.currentFloor;
    };

    ElevatorLogic.prototype._closeDoors = function () {
        this.state = STATE.DOOR_CLOSING;
        this.stateTimer = 0;
    };

    ElevatorLogic.prototype._advanceAfterClose = function () {
        var target = this._pickTarget();

        // Same-floor reopen guard: if the only demand left is a hall call at the
        // current floor in the direction we'd serve, and we have passenger
        // destinations, we must NOT reopen here (no full-car lobby starvation).
        if (target === this.currentFloor) {
            var hasDest = this.destinations.size > 0;
            if (hasDest || this.servedThisDoorCycle) {
                // We already served this floor's call this cycle; skip it and
                // choose something else. Re-add the local call is not needed
                // (it was cleared) — instead move on.
                this.direction = this._directionAwayFromCurrent();
                var alt = this._pickTargetIgnoringCurrent();
                if (alt === null && hasDest) {
                    // still have destinations somewhere -> head to nearest dest
                    alt = this._nearestDemand();
                }
                target = alt;
            }
        }

        if (target === null) {
            this.state = STATE.IDLE;
            this.direction = 0;
            this.targetFloor = null;
            return;
        }

        if (target === this.currentFloor) {
            this._startDoors();
        } else {
            this.targetFloor = target;
            this.direction = (target > this.currentFloor) ? 1 : -1;
            this.state = STATE.MOVING;
        }
    };

    ElevatorLogic.prototype._directionAwayFromCurrent = function () {
        // pick direction toward any remaining destination or call
        for (var f = 0; f < this.floorCount; f++) {
            if (this.destinations.has(f)) return f > this.currentFloor ? 1 : (f < this.currentFloor ? -1 : 0);
        }
        if (this.upCalls.size) {
            for (var u = 0; u < this.floorCount; u++) if (this.upCalls.has(u) && u !== this.currentFloor) return u > this.currentFloor ? 1 : -1;
        }
        if (this.downCalls.size) {
            for (var d = 0; d < this.floorCount; d++) if (this.downCalls.has(d) && d !== this.currentFloor) return d > this.currentFloor ? 1 : -1;
        }
        return 0;
    };

    ElevatorLogic.prototype._pickTargetIgnoringCurrent = function () {
        // nearest demand excluding current floor
        var best = null, bestDist = Infinity;
        var self = this;
        function c(f) {
            if (f === self.currentFloor) return;
            var dist = Math.abs(f - self.currentFloor);
            if (dist < bestDist || best === null) { bestDist = dist; best = f; }
        }
        this.destinations.forEach(c);
        this.upCalls.forEach(c);
        this.downCalls.forEach(c);
        return best;
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
