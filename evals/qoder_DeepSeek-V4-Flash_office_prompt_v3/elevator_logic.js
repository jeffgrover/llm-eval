(function(root) {
    'use strict';

    var STATE = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    var SPOTS = [
        { x: -0.7, z: -0.7 },
        { x: 0.7, z: -0.7 },
        { x: -0.7, z: 0.6 },
        { x: 0.7, z: 0.6 }
    ];

    function ElevatorLogic(opts) {
        opts = opts || {};
        this.floorCount = opts.floorCount || 6;
        this.maxCapacity = opts.maxCapacity || 4;
        this.floorHeight = opts.floorHeight || 3.4;
        this.MIN_DOOR_OPEN_S = opts.MIN_DOOR_OPEN_S || 2.0;
        this.MAX_DOOR_OPEN_S = opts.MAX_DOOR_OPEN_S || 12.0;
        this.DOOR_MOVE_S = 1.0;
        this.SPEED = opts.speed || 4.0;

        this.reset();
    }

    ElevatorLogic.prototype.reset = function() {
        this.state = STATE.IDLE;
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.floorY = 0;

        this.upCalls = {};
        this.downCalls = {};
        this.destinations = {};

        this.passengers = {};
        this.passengerCount = 0;
        this.pendingBoarders = {};
        this.pendingBoarderCount = 0;
        this.pendingDisembark = {};
        this.pendingDisembarkCount = 0;

        this.spotOccupancy = [false, false, false, false];

        this.doorTimer = 0;
        this.doorOpenDuration = 0;
        this.servedThisDoorCycle = {};
        this.lastServedFloor = -1;
        this.consecutiveSameFloor = 0;
    };

    ElevatorLogic.prototype.callUp = function(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.upCalls[floor] = true;
    };

    ElevatorLogic.prototype.callDown = function(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.downCalls[floor] = true;
    };

    ElevatorLogic.prototype.pressDestination = function(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.destinations[floor] = true;
    };

    ElevatorLogic.prototype.hasActiveCalls = function() {
        return Object.keys(this.upCalls).length > 0 ||
               Object.keys(this.downCalls).length > 0 ||
               Object.keys(this.destinations).length > 0;
    };

    ElevatorLogic.prototype.hasWorkAhead = function() {
        var dir = this.direction;
        if (dir === 0) return this.hasActiveCalls();
        for (var k in this.destinations) {
            var f = parseInt(k, 10);
            if (dir > 0 && f > this.currentFloor) return true;
            if (dir < 0 && f < this.currentFloor) return true;
        }
        for (var k in this.upCalls) {
            var f = parseInt(k, 10);
            if (dir > 0 && f > this.currentFloor) return true;
            if (dir < 0 && f < this.currentFloor) return true;
        }
        for (var k in this.downCalls) {
            var f = parseInt(k, 10);
            if (dir > 0 && f > this.currentFloor) return true;
            if (dir < 0 && f < this.currentFloor) return true;
        }
        return false;
    };

    ElevatorLogic.prototype.findNearestStop = function() {
        var cf = this.currentFloor;
        var best = null;
        var bestDist = Infinity;
        var all = {};
        for (var k in this.destinations) all[k] = true;
        for (var k in this.upCalls) all[k] = true;
        for (var k in this.downCalls) all[k] = true;
        for (var k in all) {
            var f = parseInt(k, 10);
            var d = Math.abs(f - cf);
            if (d < bestDist) {
                bestDist = d;
                best = f;
            }
        }
        return best;
    };

    ElevatorLogic.prototype.pickTarget = function() {
        var dir = this.direction;
        var cf = this.currentFloor;
        var best = null;
        var bestDist = Infinity;

        if (dir !== 0) {
            // Look ahead in current direction
            for (var k in this.destinations) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            for (var k in this.upCalls) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            for (var k in this.downCalls) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }

            if (best !== null) return best;

            // Reverse direction
            dir = -dir;
            this.direction = dir;
            bestDist = Infinity;
            for (var k in this.destinations) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            for (var k in this.upCalls) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            for (var k in this.downCalls) {
                var f = parseInt(k, 10);
                if ((dir > 0 && f > cf) || (dir < 0 && f < cf)) {
                    var d = Math.abs(f - cf);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            if (best !== null) return best;
        }

        // No direction or nothing found: pick nearest
        best = this.findNearestStop();
        if (best !== null) {
            this.direction = best > cf ? 1 : (best < cf ? -1 : 0);
        }
        return best;
    };

    // Re-evaluate target while moving - pick closer stop in same direction
    ElevatorLogic.prototype.reevaluateTarget = function() {
        if (this.state !== STATE.MOVING) return;
        var dir = this.direction;
        if (dir === 0) return;
        var cf = this.currentFloor;
        var best = this.targetFloor;
        var bestDist = Math.abs(best - cf);

        var checkFloor = function(f) {
            if ((dir > 0 && f > cf && f < best) || (dir < 0 && f < cf && f > best)) {
                var d = Math.abs(f - cf);
                if (d < bestDist) {
                    bestDist = d;
                    best = f;
                }
            }
        };

        for (var k in this.destinations) checkFloor(parseInt(k, 10));
        for (var k in this.upCalls) checkFloor(parseInt(k, 10));
        for (var k in this.downCalls) checkFloor(parseInt(k, 10));

        this.targetFloor = best;
    };

    ElevatorLogic.prototype.isAcceptingAt = function(floor, direction) {
        if (this.state !== STATE.DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        if (this.direction === 0) return true;
        // If no more stops ahead, accept anyone
        if (!this.hasWorkAhead()) return true;
        // Accept if direction matches
        return this.direction === direction;
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        return this.maxCapacity - (this.passengerCount + this.pendingBoarderCount);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(personId) {
        if (this.currentCapacityFree() <= 0) return null;
        if (this.pendingBoarders[personId]) {
            // Already reserved, return existing spot
            for (var i = 0; i < SPOTS.length; i++) {
                if (this.spotOccupancy[i] === personId) {
                    return { index: i, x: SPOTS[i].x, y: 0, z: SPOTS[i].z };
                }
            }
        }
        var idx = -1;
        for (var i = 0; i < SPOTS.length; i++) {
            if (this.spotOccupancy[i] === false) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return null;
        this.spotOccupancy[idx] = personId;
        this.pendingBoarders[personId] = true;
        this.pendingBoarderCount++;
        return { index: idx, x: SPOTS[idx].x, y: 0, z: SPOTS[idx].z };
    };

    ElevatorLogic.prototype.completeBoard = function(personId) {
        if (this.pendingBoarders[personId]) {
            delete this.pendingBoarders[personId];
            this.pendingBoarderCount--;
            this.passengers[personId] = true;
            this.passengerCount++;
        }
    };

    ElevatorLogic.prototype.registerDisembark = function(personId) {
        if (this.passengers[personId]) {
            delete this.passengers[personId];
            this.passengerCount--;
            this.pendingDisembark[personId] = true;
            this.pendingDisembarkCount++;
        }
    };

    ElevatorLogic.prototype.completeDisembark = function(personId) {
        if (this.pendingDisembark[personId]) {
            delete this.pendingDisembark[personId];
            this.pendingDisembarkCount--;
            // Release spot
            for (var i = 0; i < SPOTS.length; i++) {
                if (this.spotOccupancy[i] === personId) {
                    this.spotOccupancy[i] = false;
                    break;
                }
            }
        }
    };

    ElevatorLogic.prototype.clearServedCalls = function() {
        var cf = this.currentFloor;
        var dir = this.direction;
        delete this.destinations[cf];
        // Clear hall call in the current direction
        if (dir >= 0) delete this.upCalls[cf];
        if (dir <= 0) delete this.downCalls[cf];
        // If no more work ahead, clear opposite direction call too
        if (!this.hasWorkAhead()) {
            if (dir > 0) delete this.downCalls[cf];
            if (dir < 0) delete this.upCalls[cf];
        }
    };

    ElevatorLogic.prototype.tick = function(dt) {
        var s = this.state;

        if (s === STATE.IDLE) {
            if (this.hasActiveCalls()) {
                var target = this.pickTarget();
                if (target !== null && target !== this.currentFloor) {
                    this.targetFloor = target;
                    this.state = STATE.MOVING;
                } else if (target === this.currentFloor) {
                    // Already at target floor, open doors
                    this.state = STATE.DOOR_OPENING;
                    this.doorTimer = 0;
                }
            }
            return;
        }

        if (s === STATE.MOVING) {
            this.reevaluateTarget();
            var targetY = this.targetFloor * this.floorHeight;
            var moveAmount = this.SPEED * dt;
            var dir = this.direction;

            if (dir > 0) {
                this.floorY = Math.min(this.floorY + moveAmount, targetY);
            } else if (dir < 0) {
                this.floorY = Math.max(this.floorY - moveAmount, targetY);
            } else {
                // No direction, try to move toward target
                if (targetY > this.floorY) {
                    this.floorY = Math.min(this.floorY + moveAmount, targetY);
                } else {
                    this.floorY = Math.max(this.floorY - moveAmount, targetY);
                }
            }

            var newFloor = Math.round(this.floorY / this.floorHeight);
            if (newFloor !== this.currentFloor) {
                this.currentFloor = newFloor;
            }

            // Check if arrived at target
            if (Math.abs(this.floorY - targetY) < 0.05) {
                this.floorY = targetY;
                this.currentFloor = Math.round(targetY / this.floorHeight);
                this.state = STATE.DOOR_OPENING;
                this.doorTimer = 0;
                this.doorOpenDuration = 0;
                this.servedThisDoorCycle = {};
            }
            return;
        }

        if (s === STATE.DOOR_OPENING) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorTimer = 0;
                this.doorOpenDuration = 0;
                this.state = STATE.DOOR_OPEN;
                this.clearServedCalls();
                this.lastServedFloor = this.currentFloor;
            }
            return;
        }

        if (s === STATE.DOOR_OPEN) {
            this.doorOpenDuration += dt;
            var canClose = (this.pendingBoarderCount === 0 && this.pendingDisembarkCount === 0);
            var minMet = this.doorOpenDuration >= this.MIN_DOOR_OPEN_S;
            var maxMet = this.doorOpenDuration >= this.MAX_DOOR_OPEN_S;

            if (maxMet || (canClose && minMet)) {
                this.state = STATE.DOOR_CLOSING;
                this.doorTimer = 0;
            }
            return;
        }

        if (s === STATE.DOOR_CLOSING) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_MOVE_S) {
                this.doorTimer = 0;
                // If people still need to board/disembark, reopen
                if (this.pendingBoarderCount > 0 || this.pendingDisembarkCount > 0) {
                    this.state = STATE.DOOR_OPENING;
                    this.doorTimer = 0;
                    this.doorOpenDuration = 0;
                    return;
                }
                // Pick next target
                if (this.hasActiveCalls()) {
                    var target = this.pickTarget();
                    if (target !== null) {
                        if (target === this.currentFloor) {
                            // Same floor - check for anti-starvation
                            this.consecutiveSameFloor++;
                            if (this.consecutiveSameFloor >= 2) {
                                // Force reject this floor, clear calls
                                this.clearServedCalls();
                                target = this.pickTarget();
                                if (target === this.currentFloor || target === null) {
                                    this.state = STATE.IDLE;
                                    this.direction = 0;
                                    return;
                                }
                            }
                            this.state = STATE.DOOR_OPENING;
                            this.doorTimer = 0;
                            this.doorOpenDuration = 0;
                        } else {
                            this.targetFloor = target;
                            this.consecutiveSameFloor = 0;
                            this.state = STATE.MOVING;
                        }
                    } else {
                        this.state = STATE.IDLE;
                        this.direction = 0;
                    }
                } else {
                    this.state = STATE.IDLE;
                    this.direction = 0;
                }
            }
        }
    };

    ElevatorLogic.prototype.getState = function() {
        return this.state;
    };

    ElevatorLogic.prototype.getCalls = function() {
        return {
            upCalls: Object.keys(this.upCalls).map(Number),
            downCalls: Object.keys(this.downCalls).map(Number),
            destinations: Object.keys(this.destinations).map(Number)
        };
    };

    ElevatorLogic.prototype.getPassengerIds = function() {
        return Object.keys(this.passengers).filter(function(k) { return this.passengers[k]; }.bind(this));
    };

    ElevatorLogic.prototype.getPendingBoarderIds = function() {
        return Object.keys(this.pendingBoarders).filter(function(k) { return this.pendingBoarders[k]; }.bind(this));
    };

    ElevatorLogic.prototype.getPendingDisembarkIds = function() {
        return Object.keys(this.pendingDisembark).filter(function(k) { return this.pendingDisembark[k]; }.bind(this));
    };

    // Export
    root.ElevatorLogic = ElevatorLogic;
    root.STATE = STATE;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic, STATE: STATE };
    }
})(typeof window !== "undefined" ? window : globalThis);