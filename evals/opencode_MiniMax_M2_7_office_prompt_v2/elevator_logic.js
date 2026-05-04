(function(root) {
    var STATE = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING'
    };

    var MIN_DOOR_OPEN_S = 1.5;
    var MAX_DOOR_OPEN_S = 6.0;
    var DOOR_SPEED = 3.0;

    var SPOT_OFFSETS = [
        { x: -0.6, y: 0.5, z: 0 },
        { x: 0.6, y: 0.5, z: 0 },
        { x: -0.6, y: 0.5, z: -1.0 },
        { x: 0.6, y: 0.5, z: -1.0 }
    ];

    function ElevatorLogic(options) {
        options = options || {};
        this.floorCount = options.floorCount || 6;
        this.maxCapacity = options.maxCapacity || 4;
        this.floorHeight = options.floorHeight || 3.4;

        this.state = STATE.IDLE;
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = 0;

        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();

        this.passengers = new Map();
        this.pendingBoarders = new Map();
        this.pendingDisembark = new Map();

        this.spotOccupancy = new Array(4).fill(null);

        this.doorTimer = 0;
        this.doorPosition = 0;

        this.lastServedFloor = -1;
        this.servedThisDoorCycle = false;
    }

    ElevatorLogic.prototype.callUp = function(floor) {
        if (floor >= 0 && floor < this.floorCount - 1) {
            this.upCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.callDown = function(floor) {
        if (floor > 0 && floor < this.floorCount) {
            this.downCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.pressDestination = function(floor) {
        if (floor >= 0 && floor < this.floorCount && floor !== this.currentFloor) {
            this.destinations.add(floor);
        }
    };

    ElevatorLogic.prototype.isAcceptingAt = function(floor, direction) {
        if (this.state !== STATE.DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;

        if (direction === 1 && !this.upCalls.has(floor)) return false;
        if (direction === -1 && !this.downCalls.has(floor)) return false;

        if (this.direction !== 0 && this.direction !== direction) return false;

        return true;
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        var taken = this.passengers.size + this.pendingBoarders.size;
        return this.maxCapacity - taken;
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
        if (this.currentCapacityFree() <= 0) return null;

        for (var i = 0; i < this.spotOccupancy.length; i++) {
            if (this.spotOccupancy[i] === null) {
                this.spotOccupancy[i] = person;
                var spot = {
                    index: i,
                    x: SPOT_OFFSETS[i].x,
                    y: SPOT_OFFSETS[i].y,
                    z: SPOT_OFFSETS[i].z
                };
                this.pendingBoarders.set(person, spot);
                return spot;
            }
        }
        return null;
    };

    ElevatorLogic.prototype.completeBoard = function(person) {
        var spot = this.pendingBoarders.get(person);
        if (spot) {
            this.pendingBoarders.delete(person);
            this.passengers.set(person, spot);
        }
    };

    ElevatorLogic.prototype.registerDisembark = function(person) {
        this.pendingDisembark.set(person, true);
    };

    ElevatorLogic.prototype.completeDisembark = function(person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
        }
        if (this.passengers.has(person)) {
            var spot = this.passengers.get(person);
            if (spot) {
                this.spotOccupancy[spot.index] = null;
            }
            this.passengers.delete(person);
        }
    };

    ElevatorLogic.prototype._findNearestCallOrDest = function(dir) {
        var nearest = null;
        var nearestDist = Infinity;

        if (dir === 1) {
            for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                if (d.value > this.currentFloor) {
                    var dist = d.value - this.currentFloor;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = d.value;
                    }
                }
            }
            for (var ut = this.upCalls.values(), u = ut.next(); !u.done; u = ut.next()) {
                if (u.value > this.currentFloor) {
                    var dist = u.value - this.currentFloor;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = u.value;
                    }
                }
            }
        } else if (dir === -1) {
            for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                if (d.value < this.currentFloor) {
                    var dist = this.currentFloor - d.value;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = d.value;
                    }
                }
            }
            for (var dt = this.downCalls.values(), d = dt.next(); !d.done; d = dt.next()) {
                if (d.value < this.currentFloor) {
                    var dist = this.currentFloor - d.value;
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = d.value;
                    }
                }
            }
        }

        return nearest;
    };

    ElevatorLogic.prototype._chooseNextTarget = function() {
        var hasPassengers = this.passengers.size > 0;
        var hasDestinations = this.destinations.size > 0;
        var hasCalls = this.upCalls.size > 0 || this.downCalls.size > 0;

        if (!hasPassengers && !hasDestinations && !hasCalls) {
            this.targetFloor = this.currentFloor;
            this.direction = 0;
            return;
        }

        if (this.direction === 0) {
            if (hasDestinations || hasPassengers) {
                var dest = null;
                if (hasDestinations) {
                    for (var dt = this.destinations.values(), d = dt.next(); !d.done; d = dt.next()) {
                        dest = d.value;
                        break;
                    }
                }
                if (dest !== null) {
                    this.targetFloor = dest;
                    this.direction = dest > this.currentFloor ? 1 : -1;
                    return;
                }
            }

            if (this.upCalls.size > 0) {
                var minUp = Infinity;
                for (var ut = this.upCalls.values(), u = ut.next(); !u.done; u = ut.next()) {
                    if (u.value < minUp) minUp = u.value;
                }
                this.targetFloor = minUp;
                this.direction = this.targetFloor > this.currentFloor ? 1 : -1;
                return;
            }

            if (this.downCalls.size > 0) {
                var maxDown = -Infinity;
                for (var dt = this.downCalls.values(), d = dt.next(); !d.done; d = dt.next()) {
                    if (d.value > maxDown) maxDown = d.value;
                }
                this.targetFloor = maxDown;
                this.direction = this.targetFloor > this.currentFloor ? 1 : -1;
                return;
            }

            this.targetFloor = this.currentFloor;
            this.direction = 0;
            return;
        }

        var scanDir = this.direction;
        var bestTarget = null;
        var bestDist = Infinity;

        if (hasPassengers) {
            for (var pt = this.passengers.values(), p = pt.next(); !p.done; p = pt.next()) {
                var passFloor = p.value.index;
            }
        }

        if (hasDestinations) {
            for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                var df = d.value;
                if (scanDir === 1 && df > this.currentFloor) {
                    var dist = df - this.currentFloor;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestTarget = df;
                    }
                } else if (scanDir === -1 && df < this.currentFloor) {
                    var dist = this.currentFloor - df;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestTarget = df;
                    }
                }
            }
        }

        if (hasPassengers && hasDestinations) {
            for (var pt = this.passengers.values(), p = pt.next(); !p.done; p = pt.next()) {
            }
        }

        if (bestTarget !== null) {
            this.targetFloor = bestTarget;
            return;
        }

        if (scanDir === 1) {
            var nextUp = this._findNearestCallOrDest(1);
            if (nextUp !== null) {
                this.targetFloor = nextUp;
                return;
            }

            var nextDown = this._findNearestCallOrDest(-1);
            if (nextDown !== null) {
                this.direction = -1;
                this.targetFloor = nextDown;
                return;
            }
        } else {
            var nextDown = this._findNearestCallOrDest(-1);
            if (nextDown !== null) {
                this.targetFloor = nextDown;
                return;
            }

            var nextUp = this._findNearestCallOrDest(1);
            if (nextUp !== null) {
                this.direction = 1;
                this.targetFloor = nextUp;
                return;
            }
        }

        this.direction = 0;
        this.targetFloor = this.currentFloor;
    };

    ElevatorLogic.prototype._clearServedCalls = function() {
        var floor = this.currentFloor;

        this.destinations.delete(floor);

        if (this.direction === 1) {
            this.upCalls.delete(floor);
            if (this._noStopsInDirection(1)) {
                this.downCalls.delete(floor);
            }
        } else if (this.direction === -1) {
            this.downCalls.delete(floor);
            if (this._noStopsInDirection(-1)) {
                this.upCalls.delete(floor);
            }
        }
    };

    ElevatorLogic.prototype._noStopsInDirection = function(dir) {
        if (dir === 1) {
            if (this.destinations.size > 0) {
                for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                    if (d.value > this.currentFloor) return false;
                }
            }
            if (this.upCalls.size > 0) {
                for (var it = this.upCalls.values(), u = it.next(); !u.done; u = it.next()) {
                    if (u.value > this.currentFloor) return false;
                }
            }
            return true;
        } else {
            if (this.destinations.size > 0) {
                for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                    if (d.value < this.currentFloor) return false;
                }
            }
            if (this.downCalls.size > 0) {
                for (var it = this.downCalls.values(), d = it.next(); !d.done; d = it.next()) {
                    if (d.value < this.currentFloor) return false;
                }
            }
            return true;
        }
    };

    ElevatorLogic.prototype._reachedTarget = function() {
        return this.currentFloor === this.targetFloor;
    };

    ElevatorLogic.prototype.tick = function(dt) {
        switch (this.state) {
            case STATE.IDLE:
                this._chooseNextTarget();
                if (this.direction !== 0) {
                    this.state = STATE.MOVING;
                }
                break;

            case STATE.MOVING:
                var prevFloor = this.currentFloor;
                var targetY = this.targetFloor * this.floorHeight;
                var currentY = this.currentFloor * this.floorHeight;
                var diff = targetY - currentY;
                var moveAmount = dt * 4.5;

                if (Math.abs(diff) <= moveAmount) {
                    this.currentFloor = this.targetFloor;
                } else {
                    this.currentFloor += Math.sign(diff) * moveAmount / this.floorHeight;
                }

                if (this.currentFloor === this.targetFloor) {
                    this.state = STATE.DOOR_OPENING;
                    this.doorTimer = 0;
                    this._clearServedCalls();
                    this.servedThisDoorCycle = true;
                    this.lastServedFloor = this.currentFloor;
                }

                if (this._reachedTarget() && this.direction !== 0) {
                    var newTarget = null;
                    var newDir = null;

                    if (this.direction === 1) {
                        var aboveDests = [];
                        for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                            if (d.value > this.currentFloor) aboveDests.push(d.value);
                        }
                        if (aboveDests.length > 0) {
                            newTarget = Math.min.apply(null, aboveDests);
                            newDir = 1;
                        }
                    }

                    if (newTarget === null) {
                        if (this.direction === 1) {
                            var aboveCalls = [];
                            for (var it = this.upCalls.values(), u = it.next(); !u.done; u = it.next()) {
                                if (u.value > this.currentFloor) aboveCalls.push(u.value);
                            }
                            if (aboveCalls.length > 0) {
                                newTarget = Math.min.apply(null, aboveCalls);
                                newDir = 1;
                            }
                        }
                    }

                    if (newTarget === null && this.direction === 1) {
                        var belowDests = [];
                        for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                            if (d.value < this.currentFloor) belowDests.push(d.value);
                        }
                        var belowCalls = [];
                        for (var it = this.downCalls.values(), d = it.next(); !d.done; d = it.next()) {
                            if (d.value < this.currentFloor) belowCalls.push(d.value);
                        }
                        if (belowDests.length > 0 || belowCalls.length > 0) {
                            if (belowDests.length > 0) {
                                newTarget = Math.max.apply(null, belowDests);
                            } else {
                                newTarget = Math.max.apply(null, belowCalls);
                            }
                            newDir = -1;
                        }
                    } else if (newTarget === null && this.direction === -1) {
                        var aboveDests = [];
                        for (var it = this.destinations.values(), d = it.next(); !d.done; d = it.next()) {
                            if (d.value > this.currentFloor) aboveDests.push(d.value);
                        }
                        var aboveCalls = [];
                        for (var it = this.upCalls.values(), u = it.next(); !u.done; u = it.next()) {
                            if (u.value > this.currentFloor) aboveCalls.push(u.value);
                        }
                        if (aboveDests.length > 0 || aboveCalls.length > 0) {
                            if (aboveDests.length > 0) {
                                newTarget = Math.min.apply(null, aboveDests);
                            } else {
                                newTarget = Math.min.apply(null, aboveCalls);
                            }
                            newDir = 1;
                        }
                    }

                    if (newTarget !== null) {
                        this.targetFloor = newTarget;
                        this.direction = newDir;
                    } else {
                        this.state = STATE.DOOR_OPENING;
                        this.doorTimer = 0;
                        this._clearServedCalls();
                        this.servedThisDoorCycle = true;
                        this.lastServedFloor = this.currentFloor;
                    }
                }
                break;

            case STATE.DOOR_OPENING:
                this.doorPosition += dt * DOOR_SPEED;
                if (this.doorPosition >= 1) {
                    this.doorPosition = 1;
                    this.state = STATE.DOOR_OPEN;
                    this.doorTimer = 0;
                }
                break;

            case STATE.DOOR_OPEN:
                this.doorTimer += dt;

                if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                    this.state = STATE.DOOR_CLOSING;
                    this.doorTimer = 0;
                    break;
                }

                var shouldStayOpen = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;

                if (shouldStayOpen && this.doorTimer < MIN_DOOR_OPEN_S) {
                    break;
                }

                if (shouldStayOpen && this.doorTimer >= MIN_DOOR_OPEN_S) {
                    if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
                        break;
                    }
                }

                if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0 && this.doorTimer >= MIN_DOOR_OPEN_S) {
                    var wouldReopen = false;
                    if (this.lastServedFloor === this.currentFloor && this.servedThisDoorCycle) {
                        if (this.passengers.size > 0 && this.destinations.size > 0) {
                            wouldReopen = true;
                        }
                    }
                    if (!wouldReopen) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                }
                break;

            case STATE.DOOR_CLOSING:
                this.doorTimer += dt;
                var doorSlow = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                var closeSpeed = doorSlow ? DOOR_SPEED * 0.3 : DOOR_SPEED;

                this.doorPosition -= dt * closeSpeed;
                if (this.doorPosition <= 0) {
                    this.doorPosition = 0;
                    this.state = STATE.IDLE;
                    this.direction = 0;
                    this.servedThisDoorCycle = false;
                    this._chooseNextTarget();
                    if (this.direction !== 0) {
                        this.state = STATE.MOVING;
                    }
                }
                break;
        }
    };

    ElevatorLogic.prototype.reset = function() {
        this.state = STATE.IDLE;
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = 0;

        this.upCalls.clear();
        this.downCalls.clear();
        this.destinations.clear();

        this.passengers.clear();
        this.pendingBoarders.clear();
        this.pendingDisembark.clear();

        for (var i = 0; i < this.spotOccupancy.length; i++) {
            this.spotOccupancy[i] = null;
        }

        this.doorTimer = 0;
        this.doorPosition = 0;
        this.lastServedFloor = -1;
        this.servedThisDoorCycle = false;
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);