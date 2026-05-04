(function(root) {
    'use strict';

    const FLOOR_HEIGHT = 3.4;
    const EPS = 0.05;
    const MIN_DOOR_OPEN_S = 1.8;
    const MAX_DOOR_OPEN_S = 12.0;
    const DOOR_TRANSITION_S = 0.8;
    const MOVE_SPEED = 3.4;

    var IDLE = 0;
    var MOVING = 1;
    var DOOR_OPENING = 2;
    var DOOR_OPEN = 3;
    var DOOR_CLOSING = 4;

    var STATE_NAMES = ['IDLE','MOVING','DOOR_OPENING','DOOR_OPEN','DOOR_CLOSING'];
    var DIRECTIONS = {UP:1, NONE:0, DOWN:-1};

    function ElevatorLogic(opts) {
        opts = opts || {};
        this.floorCount = opts.floorCount || 6;
        this.maxCapacity = opts.maxCapacity || 4;
        this.floorHeight = opts.floorHeight || FLOOR_HEIGHT;

        this.reset();
    }

    ElevatorLogic.prototype.reset = function() {
        this.state = IDLE;
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = -1;
        this.doorTimer = 0;
        this.transitionTimer = 0;
        this.floorPosition = 0;

        this.upCalls = new Array(this.floorCount).fill(false);
        this.downCalls = new Array(this.floorCount).fill(false);
        this.destinations = new Array(this.floorCount).fill(false);

        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();

        this.spotOccupancy = [false, false, false, false];
        this.servedThisDoorCycle = new Set();
        this.lastServedFloor = -1;
        this.justArrived = false;
    };

    ElevatorLogic.prototype.callUp = function(floor) {
        if (floor >= 0 && floor < this.floorCount - 1) {
            this.upCalls[floor] = true;
        }
    };

    ElevatorLogic.prototype.callDown = function(floor) {
        if (floor > 0 && floor < this.floorCount) {
            this.downCalls[floor] = true;
        }
    };

    ElevatorLogic.prototype.pressDestination = function(floor) {
        if (floor >= 0 && floor < this.floorCount) {
            this.destinations[floor] = true;
        }
    };

    ElevatorLogic.prototype.isAcceptingAt = function(floor, direction) {
        if (this.state !== DOOR_OPEN || this.currentFloor !== floor) return false;
        if (this.pendingBoarders.size + this.passengers.size >= this.maxCapacity) return false;

        if (this.upCalls[floor] && direction === DIRECTIONS.UP) return true;
        if (this.downCalls[floor] && direction === DIRECTIONS.DOWN) return true;

        return false;
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
        if (this.currentCapacityFree() <= 0) return null;

        var idx;
        for (idx = 0; idx < 4; idx++) {
            if (!this.spotOccupancy[idx]) break;
        }
        if (idx >= 4) return null;

        this.spotOccupancy[idx] = true;
        this.pendingBoarders.add(person);

        var halfW = 1.3;
        var halfD = 1.2;
        var spots = [
            {x: -halfW * 0.5, z: -halfD * 0.5},
            {x:  halfW * 0.5, z: -halfD * 0.5},
            {x: -halfW * 0.5, z:  halfD * 0.5},
            {x:  halfW * 0.5, z:  halfD * 0.5}
        ];

        return { index: idx, x: spots[idx].x, y: 0, z: spots[idx].z };
    };

    ElevatorLogic.prototype.completeBoard = function(person) {
        this.pendingBoarders.delete(person);
        this.passengers.add(person);
    };

    ElevatorLogic.prototype.registerDisembark = function(person) {
        this.pendingDisembark.add(person);
    };

    ElevatorLogic.prototype.completeDisembark = function(person) {
        this.pendingDisembark.delete(person);
        this.passengers.delete(person);
        var idx = -1;
        for (var i = 0; i < 4; i++) {
            if (this.spotOccupancy[i]) { idx = i; break; }
        }
        if (idx >= 0) this.spotOccupancy[idx] = false;
    };

    ElevatorLogic.prototype._hasActiveCalls = function() {
        for (var i = 0; i < this.floorCount; i++) {
            if (this.upCalls[i] || this.downCalls[i] || this.destinations[i]) return true;
        }
        return false;
    };

    ElevatorLogic.prototype._hasWorkAhead = function(dir) {
        var f = this.currentFloor + dir;
        while (f >= 0 && f < this.floorCount) {
            if (this.destinations[f]) return true;
            if (dir === 1 && this.upCalls[f]) return true;
            if (dir === -1 && this.downCalls[f]) return true;
            f += dir;
        }
        return false;
    };

    ElevatorLogic.prototype._hasWorkBehind = function(dir) {
        var f = this.currentFloor - dir;
        while (f >= 0 && f < this.floorCount) {
            if (this.destinations[f]) return true;
            if (this.upCalls[f]) return true;
            if (this.downCalls[f]) return true;
            f -= dir;
        }
        return false;
    };

    ElevatorLogic.prototype._nearestStopAhead = function(dir) {
        var f = this.currentFloor + dir;
        while (f >= 0 && f < this.floorCount) {
            if (this.destinations[f]) return f;
            if (dir === 1 && this.upCalls[f]) return f;
            if (dir === -1 && this.downCalls[f]) return f;
            f += dir;
        }
        return -1;
    };

    ElevatorLogic.prototype._nearestStopBehind = function(dir) {
        var f = this.currentFloor - dir;
        while (f >= 0 && f < this.floorCount) {
            if (this.destinations[f]) return f;
            if (this.upCalls[f]) return f;
            if (this.downCalls[f]) return f;
            f -= dir;
        }
        return -1;
    };

    ElevatorLogic.prototype._nearestAnyStop = function() {
        var best = -1;
        var bestDist = Infinity;
        for (var f = 0; f < this.floorCount; f++) {
            var d = Math.abs(f - this.currentFloor);
            if (d < bestDist && (this.destinations[f] || this.upCalls[f] || this.downCalls[f])) {
                best = f;
                bestDist = d;
            }
        }
        return best;
    };

    ElevatorLogic.prototype._pickTarget = function() {
        var cur = this.currentFloor;
        var dir = this.direction;

        if (dir === 0) {
            var f = this._nearestAnyStop();
            if (f < 0) return -1;
            if (f > cur) { this.direction = 1; return f; }
            if (f < cur) { this.direction = -1; return f; }
            this.direction = 0;
            return -1;
        }

        var ahead = this._nearestStopAhead(dir);
        if (ahead >= 0) return ahead;

        var behind = this._nearestStopBehind(dir);
        if (behind >= 0) { this.direction = -dir; return behind; }

        this.direction = 0;
        return -1;
    };

    ElevatorLogic.prototype._nearestDestNotHere = function() {
        var cur = this.currentFloor;
        var best = -1;
        var bestDist = Infinity;
        for (var f = 0; f < this.floorCount; f++) {
            if (f === cur) continue;
            if (!this.destinations[f]) continue;
            var d = Math.abs(f - cur);
            if (d < bestDist) { best = f; bestDist = d; }
        }
        return best;
    };

    ElevatorLogic.prototype.tick = function(dt) {
        var self = this;

        switch (this.state) {
            case IDLE:
                this.justArrived = false;
                if (this._hasActiveCalls()) {
                    var t = this._pickTarget();
                    if (t >= 0 && t !== this.currentFloor) {
                        this.targetFloor = t;
                        this.state = MOVING;
                    } else if (t === this.currentFloor) {
                        this.state = DOOR_OPENING;
                        this.transitionTimer = DOOR_TRANSITION_S;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle.clear();
                    } else if (this.upCalls[this.currentFloor] || this.downCalls[this.currentFloor] || this.destinations[this.currentFloor]) {
                        this.state = DOOR_OPENING;
                        this.transitionTimer = DOOR_TRANSITION_S;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle.clear();
                    }
                }
                break;

            case MOVING:
                this.justArrived = false;
                if (this.targetFloor < 0) {
                    this.direction = 0;
                    this.state = IDLE;
                    break;
                }

                var step = MOVE_SPEED * dt;
                var targetY = this.targetFloor * this.floorHeight;

                if (this.floorPosition < targetY) {
                    this.direction = 1;
                    this.floorPosition = Math.min(this.floorPosition + step, targetY);
                } else if (this.floorPosition > targetY) {
                    this.direction = -1;
                    this.floorPosition = Math.max(this.floorPosition - step, targetY);
                }

                var newFloor = Math.round(this.floorPosition / this.floorHeight);
                if (Math.abs(this.floorPosition - newFloor * this.floorHeight) < EPS) {
                    this.floorPosition = newFloor * this.floorHeight;
                }
                this.currentFloor = Math.round(this.floorPosition / this.floorHeight);

                if (Math.abs(this.floorPosition - targetY) < EPS) {
                    this.floorPosition = targetY;
                    this.currentFloor = this.targetFloor;
                }

                var closer = -1;
                if (this.direction === 1) {
                    for (var f = this.currentFloor + 1; f <= this.targetFloor; f++) {
                        if (this.destinations[f] || (this.direction === 1 && this.upCalls[f]) || (this.direction === -1 && this.downCalls[f])) {
                            closer = f;
                            break;
                        }
                    }
                } else if (this.direction === -1) {
                    for (var f = this.currentFloor - 1; f >= this.targetFloor; f--) {
                        if (this.destinations[f] || (this.direction === 1 && this.upCalls[f]) || (this.direction === -1 && this.downCalls[f])) {
                            closer = f;
                            break;
                        }
                    }
                }
                if (closer >= 0 && closer !== this.targetFloor) {
                    this.targetFloor = closer;
                }

                if (Math.abs(this.floorPosition - targetY) < EPS) {
                    this.floorPosition = targetY;
                    this.currentFloor = this.targetFloor;
                    this.state = DOOR_OPENING;
                    this.transitionTimer = DOOR_TRANSITION_S;
                    this.doorTimer = 0;
                    this.servedThisDoorCycle.clear();
                    this.justArrived = true;
                    this.lastServedFloor = this.currentFloor;

                    this.destinations[this.currentFloor] = false;
                    if (this.direction === 1 && this.upCalls[this.currentFloor]) {
                        this.upCalls[this.currentFloor] = false;
                        this.servedThisDoorCycle.add('UP:' + this.currentFloor);
                    }
                    if (this.direction === -1 && this.downCalls[this.currentFloor]) {
                        this.downCalls[this.currentFloor] = false;
                        this.servedThisDoorCycle.add('DOWN:' + this.currentFloor);
                    }
                    if (this.direction === 1) { this.downCalls[this.currentFloor] = false; }
                    if (this.direction === -1) { this.upCalls[this.currentFloor] = false; }
                }
                break;

            case DOOR_OPENING:
                this.transitionTimer -= dt;
                if (this.transitionTimer <= 0) {
                    this.transitionTimer = 0;
                    this.state = DOOR_OPEN;
                    this.doorTimer = 0;
                }
                break;

            case DOOR_OPEN:
                this.doorTimer += dt;

                this.destinations[this.currentFloor] = false;
                this.upCalls[this.currentFloor] = false;
                this.downCalls[this.currentFloor] = false;

                if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0 && this.doorTimer >= MIN_DOOR_OPEN_S) {
                    this.state = DOOR_CLOSING;
                    this.transitionTimer = DOOR_TRANSITION_S;
                    break;
                }

                if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                    this.pendingBoarders.clear();
                    this.pendingDisembark.clear();
                    this.state = DOOR_CLOSING;
                    this.transitionTimer = DOOR_TRANSITION_S;
                    break;
                }
                break;

            case DOOR_CLOSING:
                this.transitionTimer -= dt;
                if (this.transitionTimer <= 0) {
                    this.transitionTimer = 0;
                    this.state = IDLE;

                    if (this.passengers.size > 0 && this.destinations.some(function(v){return v;})) {
                        var dest = this._nearestDestNotHere();
                        if (dest >= 0) {
                            this.direction = dest > this.currentFloor ? 1 : -1;
                            this.targetFloor = dest;
                            this.state = MOVING;
                            this.servedThisDoorCycle.clear();
                        }
                    } else if (this._hasActiveCalls()) {
                        var t = this._pickTarget();
                        if (t >= 0 && t !== this.currentFloor) {
                            this.targetFloor = t;
                            this.state = MOVING;
                            this.servedThisDoorCycle.clear();
                        } else if (t === this.currentFloor) {
                            if (this.passengers.size > 0) {
                                var t2 = this._nearestDestNotHere();
                                if (t2 >= 0) {
                                    this.direction = t2 > this.currentFloor ? 1 : -1;
                                    this.targetFloor = t2;
                                    this.state = MOVING;
                                    this.servedThisDoorCycle.clear();
                                }
                            }
                        } else if (this.upCalls[this.currentFloor] || this.downCalls[this.currentFloor] || this.destinations[this.currentFloor]) {
                            this.state = DOOR_OPENING;
                            this.transitionTimer = DOOR_TRANSITION_S;
                            this.doorTimer = 0;
                            this.servedThisDoorCycle.clear();
                        }
                    }
                }
                break;
        }
    };

    ElevatorLogic.IDLE = IDLE;
    ElevatorLogic.MOVING = MOVING;
    ElevatorLogic.DOOR_OPENING = DOOR_OPENING;
    ElevatorLogic.DOOR_OPEN = DOOR_OPEN;
    ElevatorLogic.DOOR_CLOSING = DOOR_CLOSING;
    ElevatorLogic.STATE_NAMES = STATE_NAMES;
    ElevatorLogic.DIRECTIONS = DIRECTIONS;
    ElevatorLogic.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
    ElevatorLogic.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
    ElevatorLogic.DOOR_TRANSITION_S = DOOR_TRANSITION_S;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
