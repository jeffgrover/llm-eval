/*  elevator_logic.js  –  pure elevator scheduler / state machine (no Three.js, no DOM)  */
(function (root) {
    "use strict";

    var STATE_IDLE         = 0;
    var STATE_MOVING       = 1;
    var STATE_DOOR_OPENING = 2;
    var STATE_DOOR_OPEN    = 3;
    var STATE_DOOR_CLOSING = 4;

    var MIN_DOOR_OPEN_S = 2.0;   // minimum time doors stay open
    var MAX_DOOR_OPEN_S = 12.0;  // safety cap – force close if something never completes
    var DOOR_SPEED      = 2.0;   // open/close animation speed (fraction / sec)
    var MOVE_SPEED      = 3.4;   // floors per second (≈ 1 floor / sec at floorHeight 3.4)

    function ElevatorLogic(opts) {
        opts = opts || {};
        this.floorCount   = opts.floorCount   || 6;
        this.maxCapacity  = opts.maxCapacity  || 4;
        this.floorHeight  = opts.floorHeight  || 3.4;

        this.reset();
    }

    ElevatorLogic.prototype.reset = function () {
        this.state         = STATE_IDLE;
        this.direction     = 0;   // +1, 0, -1
        this.currentFloor  = 0;
        this.targetFloor   = 0;
        this.doorFraction  = 0;   // 0 = closed, 1 = open
        this.doorTimer     = 0;

        this.upCalls       = {};  // floor → true
        this.downCalls     = {};
        this.destinations  = {};  // floor → true

        this.passengers      = new Map(); // personId → {destFloor}
        this.pendingBoarders = new Map(); // personId → {index, destFloor}
        this.pendingDisembark= new Map(); // personId → true

        this.spotOccupancy   = [false, false, false, false];

        this.servedThisCycle   = false;
        this.lastBoardFloor    = -1;
    };

    // ---- call / destination helpers ----

    ElevatorLogic.prototype.callUp = function (floor) {
        this.upCalls[floor] = true;
    };

    ElevatorLogic.prototype.callDown = function (floor) {
        this.downCalls[floor] = true;
    };

    ElevatorLogic.prototype.pressDestination = function (floor) {
        this.destinations[floor] = true;
    };

    // ---- capacity ----

    ElevatorLogic.prototype.currentCapacityFree = function () {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    // ---- boarding / disembarking handshake ----

    ElevatorLogic.prototype.reserveBoardingSpot = function (personId) {
        if (this.currentCapacityFree() <= 0) return null;
        for (var i = 0; i < this.maxCapacity; i++) {
            if (!this.spotOccupancy[i]) {
                this.spotOccupancy[i] = true;
                this.pendingBoarders.set(personId, { index: i });
                return { index: i };
            }
        }
        return null;
    };

    ElevatorLogic.prototype.completeBoard = function (personId, destFloor) {
        var info = this.pendingBoarders.get(personId);
        if (!info) return;
        this.pendingBoarders.delete(personId);
        this.passengers.set(personId, { destFloor: destFloor, spotIndex: info.index });
        this.destinations[destFloor] = true;
        this.servedThisCycle = true;
    };

    ElevatorLogic.prototype.registerDisembark = function (personId) {
        if (!this.passengers.has(personId)) return;
        this.pendingDisembark.set(personId, this.passengers.get(personId));
    };

    ElevatorLogic.prototype.completeDisembark = function (personId) {
        var info = this.pendingDisembark.get(personId);
        if (!info) return;
        this.pendingDisembark.delete(personId);
        this.passengers.delete(personId);
        this.spotOccupancy[info.spotIndex] = false;
        delete this.destinations[this.currentFloor];
        this.servedThisCycle = true;
    };

    // ---- is the car accepting at a given floor/dir? ----

    ElevatorLogic.prototype.isAcceptingAt = function (floor, direction) {
        if (this.state !== STATE_DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        // Accept if no more stops in current direction, or caller matches car direction
        if (this.direction === 0) return true;
        if (direction === this.direction) return true;
        // No more work ahead in current direction → accept opposite
        return !this._hasWorkAhead(this.direction);
    };

    // ---- internal helpers ----

    ElevatorLogic.prototype._hasWorkAhead = function (dir) {
        var cf = this.currentFloor;
        if (dir === 1) {
            for (var f = cf + 1; f < this.floorCount; f++) {
                if (this.destinations[f] || this.upCalls[f] || this.downCalls[f]) return true;
            }
        } else if (dir === -1) {
            for (var f2 = cf - 1; f2 >= 0; f2--) {
                if (this.destinations[f2] || this.upCalls[f2] || this.downCalls[f2]) return true;
            }
        }
        return false;
    };

    ElevatorLogic.prototype._hasAnyWork = function () {
        for (var k in this.destinations) if (this.destinations[k]) return true;
        for (var k2 in this.upCalls)    if (this.upCalls[k2])    return true;
        for (var k3 in this.downCalls)  if (this.downCalls[k3])  return true;
        return false;
    };

    ElevatorLogic.prototype._pickNextTarget = function () {
        var cf = this.currentFloor;
        var dir = this.direction;

        // Prefer continuing in current direction
        if (dir === 1) {
            // nearest destination or up-call ahead
            var best = -1;
            for (var f = cf + 1; f < this.floorCount; f++) {
                if (this.destinations[f] || this.upCalls[f]) { best = f; break; }
            }
            if (best >= 0) return { floor: best, dir: 1 };
            // check down-calls ahead (someone wants to go down on a higher floor)
            for (var f2 = cf + 1; f2 < this.floorCount; f2++) {
                if (this.downCalls[f2]) return { floor: f2, dir: 1 };
            }
            // nothing ahead – reverse
            for (var f3 = cf; f3 >= 0; f3--) {
                if (this.destinations[f3] || this.downCalls[f3]) return { floor: f3, dir: -1 };
            }
            for (var f4 = cf; f4 >= 0; f4--) {
                if (this.upCalls[f4]) return { floor: f4, dir: -1 };
            }
        } else if (dir === -1) {
            var best2 = -1;
            for (var f5 = cf - 1; f5 >= 0; f5--) {
                if (this.destinations[f5] || this.downCalls[f5]) { best2 = f5; break; }
            }
            if (best2 >= 0) return { floor: best2, dir: -1 };
            for (var f6 = cf - 1; f6 >= 0; f6--) {
                if (this.upCalls[f6]) return { floor: f6, dir: -1 };
            }
            // reverse
            for (var f7 = cf; f7 < this.floorCount; f7++) {
                if (this.destinations[f7] || this.upCalls[f7]) return { floor: f7, dir: 1 };
            }
            for (var f8 = cf; f8 < this.floorCount; f8++) {
                if (this.downCalls[f8]) return { floor: f8, dir: 1 };
            }
        } else {
            // Idle – pick nearest call or destination
            var bestD = 9999, bestF = -1, bestDir = 0;
            for (var f9 = 0; f9 < this.floorCount; f9++) {
                var d = Math.abs(f9 - cf);
                if (this.destinations[f9] && d < bestD) { bestD = d; bestF = f9; bestDir = f9 > cf ? 1 : -1; }
                if (this.upCalls[f9] && d < bestD) { bestD = d; bestF = f9; bestDir = 1; }
                if (this.downCalls[f9] && d < bestD) { bestD = d; bestF = f9; bestDir = -1; }
            }
            if (bestF >= 0) return { floor: bestF, dir: bestDir };
        }
        return null;
    };

    // ---- tick ----

    ElevatorLogic.prototype.tick = function (dt) {
        switch (this.state) {
            case STATE_IDLE:
                this._tickIdle(dt);
                break;
            case STATE_MOVING:
                this._tickMoving(dt);
                break;
            case STATE_DOOR_OPENING:
                this._tickDoorOpening(dt);
                break;
            case STATE_DOOR_OPEN:
                this._tickDoorOpen(dt);
                break;
            case STATE_DOOR_CLOSING:
                this._tickDoorClosing(dt);
                break;
        }
    };

    ElevatorLogic.prototype._tickIdle = function () {
        if (!this._hasAnyWork()) return;
        var tgt = this._pickNextTarget();
        if (!tgt) return;
        this.targetFloor = tgt.floor;
        this.direction   = tgt.dir || (tgt.floor > this.currentFloor ? 1 : -1);
        this.state       = STATE_MOVING;
        this.servedThisCycle = false;
        this.lastBoardFloor  = -1;
    };

    ElevatorLogic.prototype._tickMoving = function (dt) {
        // Re-evaluate: check for closer stop in same direction
        this._reEvaluateTarget();

        var dist = this.targetFloor - this.currentFloor;
        if (Math.abs(dist) < 0.01) {
            this.currentFloor = this.targetFloor;
            this._arriveAtFloor();
            return;
        }
        var step = this.direction * MOVE_SPEED * dt;
        if (Math.abs(step) > Math.abs(dist)) step = dist;
        this.currentFloor += step;
    };

    ElevatorLogic.prototype._reEvaluateTarget = function () {
        var cf = this.currentFloor;
        var dir = this.direction;
        if (dir === 1) {
            for (var f = Math.ceil(cf); f < this.floorCount; f++) {
                if (this.destinations[f] || this.upCalls[f] || this.downCalls[f]) {
                    if (f < this.targetFloor) this.targetFloor = f;
                    return;
                }
            }
        } else if (dir === -1) {
            for (var f2 = Math.floor(cf); f2 >= 0; f2--) {
                if (this.destinations[f2] || this.downCalls[f2] || this.upCalls[f2]) {
                    if (f2 > this.targetFloor) this.targetFloor = f2;
                    return;
                }
            }
        }
    };

    ElevatorLogic.prototype._arriveAtFloor = function () {
        var f = this.currentFloor;
        var dir = this.direction;

        // Clear served calls/destinations
        if (this.destinations[f]) {
            delete this.destinations[f];
            this.servedThisCycle = true;
        }
        if (dir === 1 && this.upCalls[f])   { delete this.upCalls[f]; this.servedThisCycle = true; }
        if (dir === -1 && this.downCalls[f]) { delete this.downCalls[f]; this.servedThisCycle = true; }

        // If no more stops in current direction, clear opposite call at this floor too
        if (!this._hasWorkAhead(dir)) {
            if (dir === 1 && this.downCalls[f]) delete this.downCalls[f];
            if (dir === -1 && this.upCalls[f])  delete this.upCalls[f];
        }

        this.state = STATE_DOOR_OPENING;
        this.doorTimer = 0;
    };

    ElevatorLogic.prototype._tickDoorOpening = function (dt) {
        this.doorFraction += DOOR_SPEED * dt;
        if (this.doorFraction >= 1) {
            this.doorFraction = 1;
            this.state = STATE_DOOR_OPEN;
            this.doorTimer = 0;
        }
    };

    ElevatorLogic.prototype._tickDoorOpen = function (dt) {
        this.doorTimer += dt;

        var hasPending = (this.pendingBoarders.size > 0) || (this.pendingDisembark.size > 0);

        // Safety cap
        if (this.doorTimer >= MAX_DOOR_OPEN_S) {
            this.state = STATE_DOOR_CLOSING;
            this.doorTimer = 0;
            return;
        }

        // Close only after min time AND no pending
        if (this.doorTimer >= MIN_DOOR_OPEN_S && !hasPending) {
            // Check if more boarding/disembarking should happen at this floor
            // (passenger destinations outrank same-floor hall calls)
            this.state = STATE_DOOR_CLOSING;
            this.doorTimer = 0;
        }
    };

    ElevatorLogic.prototype._tickDoorClosing = function (dt) {
        this.doorFraction -= DOOR_SPEED * dt;
        if (this.doorFraction <= 0) {
            this.doorFraction = 0;
            this._doorClosedTransition();
        }
    };

    ElevatorLogic.prototype._doorClosedTransition = function () {
        // If we have passenger destinations, go there next
        if (this.passengers.size > 0 || this._hasAnyWork()) {
            var tgt = this._pickNextTarget();
            if (tgt) {
                this.targetFloor = tgt.floor;
                this.direction   = tgt.dir || (tgt.floor > this.currentFloor ? 1 : -1);
                this.state       = STATE_MOVING;
                this.servedThisCycle = false;
                this.lastBoardFloor  = -1;
                return;
            }
        }
        // No work – idle
        this.state = STATE_IDLE;
        this.direction = 0;
    };

    // ---- expose for tests ----

    ElevatorLogic.STATE_IDLE         = STATE_IDLE;
    ElevatorLogic.STATE_MOVING       = STATE_MOVING;
    ElevatorLogic.STATE_DOOR_OPENING = STATE_DOOR_OPENING;
    ElevatorLogic.STATE_DOOR_OPEN    = STATE_DOOR_OPEN;
    ElevatorLogic.STATE_DOOR_CLOSING = STATE_DOOR_CLOSING;

    root.ElevatorLogic = ElevatorLogic;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
