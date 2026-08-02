(function(root) {
    var DOOR_OPEN_TIME = 0.8;
    var DOOR_CLOSE_TIME = 1.2;
    var MIN_DOOR_OPEN_S = 1.5;
    var MAX_DOOR_OPEN_S = 12;
    var MOVE_SPEED = 2.0;

    function ElevatorLogic(opts) {
        opts = opts || {};
        this.floorCount = opts.floorCount || 6;
        this.maxCapacity = opts.maxCapacity || 4;
        this.floorHeight = opts.floorHeight || 3.4;
        this.reset();
    }

    ElevatorLogic.prototype.reset = function() {
        this.state = 'IDLE';
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = null;
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupancy = [false, false, false, false];
        this._boardingSpots = new Map();
        this._doorTimer = 0;
        this._doorOpenDuration = 0;
        this._moveProgress = 0;
        this._lastServedFloor = -1;
        this._servedThisCycle = false;
    };

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
        if (this.state !== 'DOOR_OPEN') return false;
        if (Math.abs(this.currentFloor - floor) > 0.01) return false;
        if (direction === 0) return true;
        if (this.direction === 0) return true;
        if (direction === this.direction) return true;
        return !this._hasWorkInDirection(this.direction);
    };

    ElevatorLogic.prototype._hasWorkInDirection = function(dir) {
        if (dir === 0) return false;
        var cf = this.currentFloor;
        if (dir > 0) {
            for (var f = cf + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    return true;
                }
            }
        } else {
            for (var f = cf - 1; f >= 0; f--) {
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    return true;
                }
            }
        }
        return false;
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
        if (this.currentCapacityFree() <= 0) return null;
        for (var i = 0; i < 4; i++) {
            if (!this.spotOccupancy[i]) {
                this.spotOccupancy[i] = true;
                this.pendingBoarders.add(person);
                this._boardingSpots.set(person, i);
                var xOff = (i % 2 === 0 ? -0.7 : 0.7);
                var zOff = (i < 2 ? 0.5 : -0.5);
                return { index: i, x: xOff, y: 0, z: zOff };
            }
        }
        return null;
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
        var idx = this._boardingSpots.get(person);
        if (idx !== undefined) {
            this.spotOccupancy[idx] = false;
            this._boardingSpots.delete(person);
        }
    };

    ElevatorLogic.prototype.tick = function(dt) {
        var self = this;
        switch (self.state) {
            case 'IDLE':
                self._pickTargetAndMove();
                break;
            case 'MOVING':
                self._tickMoving(dt);
                break;
            case 'DOOR_OPENING':
                self._doorTimer += dt;
                if (self._doorTimer >= DOOR_OPEN_TIME) {
                    self._doorTimer = 0;
                    self.state = 'DOOR_OPEN';
                    self._doorOpenDuration = 0;
                    self._serveCurrentFloor();
                }
                break;
            case 'DOOR_OPEN':
                self._doorOpenDuration += dt;
                if (self.pendingBoarders.size === 0 && self.pendingDisembark.size === 0) {
                    if (self._doorOpenDuration >= MIN_DOOR_OPEN_S) {
                        self._startClosing();
                        break;
                    }
                }
                if (self._doorOpenDuration >= MAX_DOOR_OPEN_S) {
                    self.pendingBoarders.clear();
                    self.pendingDisembark.clear();
                    self._startClosing();
                }
                break;
            case 'DOOR_CLOSING':
                self._doorTimer += dt;
                if (self._doorTimer >= DOOR_CLOSE_TIME) {
                    self._doorTimer = 0;
                    self._pickTargetAndMove();
                }
                break;
        }
    };

    ElevatorLogic.prototype._serveCurrentFloor = function() {
        var cf = this.currentFloor;
        this.destinations.delete(cf);
        if (this.direction > 0) {
            this.upCalls.delete(cf);
            if (!this._hasWorkInDirection(1)) {
                this.downCalls.delete(cf);
            }
        } else if (this.direction < 0) {
            this.downCalls.delete(cf);
            if (!this._hasWorkInDirection(-1)) {
                this.upCalls.delete(cf);
            }
        } else {
            this.upCalls.delete(cf);
            this.downCalls.delete(cf);
        }
        this._lastServedFloor = cf;
        this._servedThisCycle = true;
    };

    ElevatorLogic.prototype._startClosing = function() {
        this.state = 'DOOR_CLOSING';
        this._doorTimer = 0;
    };

    ElevatorLogic.prototype._pickTargetAndMove = function() {
        var target = this._selectTarget();
        if (target === null) {
            this.state = 'IDLE';
            this.direction = 0;
            this.targetFloor = null;
            this._servedThisCycle = false;
            return;
        }
        if (target === this.currentFloor) {
            this.targetFloor = target;
            if (this.upCalls.has(target)) {
                this.direction = 1;
            } else if (this.downCalls.has(target)) {
                this.direction = -1;
            } else if (this.destinations.has(target)) {
                this.direction = this.direction !== 0 ? this.direction : 0;
            } else {
                this.direction = 0;
            }
            this.state = 'DOOR_OPENING';
            this._doorTimer = 0;
            return;
        }
        this.targetFloor = target;
        this.direction = target > this.currentFloor ? 1 : -1;
        this.state = 'MOVING';
        this._moveProgress = 0;
        this._servedThisCycle = false;
    };

    ElevatorLogic.prototype._selectTarget = function() {
        var cf = this.currentFloor;
        var hasPassengers = this.passengers.size > 0;

        // If we have passengers with destinations, those ALWAYS outrank hall calls
        if (hasPassengers && this.destinations.size > 0) {
            if (this.direction > 0) {
                for (var f = cf + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f)) return f;
                }
                for (var g = cf - 1; g >= 0; g--) {
                    if (this.destinations.has(g)) return g;
                }
            } else if (this.direction < 0) {
                for (var h = cf - 1; h >= 0; h--) {
                    if (this.destinations.has(h)) return h;
                }
                for (var j = cf + 1; j < this.floorCount; j++) {
                    if (this.destinations.has(j)) return j;
                }
            } else {
                var nearest = null, nearestD = Infinity;
                this.destinations.forEach(function(df) {
                    var d = Math.abs(df - cf);
                    if (d < nearestD) { nearestD = d; nearest = df; }
                });
                if (nearest !== null) return nearest;
            }
        }

        // Build all candidates (destinations + hall calls)
        var candidates = new Set();
        this.destinations.forEach(function(f) { candidates.add(f); });
        this.upCalls.forEach(function(f) { candidates.add(f); });
        this.downCalls.forEach(function(f) { candidates.add(f); });

        if (candidates.size === 0) return null;

        if (this.direction !== 0) {
            var ahead = [];
            var behind = [];
            candidates.forEach(function(f) {
                if (this.direction > 0 && f > cf) ahead.push(f);
                else if (this.direction < 0 && f < cf) ahead.push(f);
                else if (f !== cf) behind.push(f);
            }.bind(this));

            if (ahead.length > 0) {
                ahead.sort(function(a, b) { return this.direction > 0 ? a - b : b - a; }.bind(this));
                return ahead[0];
            }

            if (behind.length > 0) {
                behind.sort(function(a, b) { return this.direction > 0 ? b - a : a - b; }.bind(this));
                return behind[0];
            }

            // Only same-floor candidates
            if (candidates.has(cf)) {
                if (!(this._servedThisCycle && this._lastServedFloor === cf)) {
                    return cf;
                }
            }

            return null;
        }

        // IDLE: pick nearest
        var near = null, nearD = Infinity;
        candidates.forEach(function(f) {
            var d = Math.abs(f - cf);
            if (d < nearD) { nearD = d; near = f; }
        });
        return near;
    };

    ElevatorLogic.prototype._tickMoving = function(dt) {
        var self = this;
        self._moveProgress += dt * MOVE_SPEED * self.floorHeight;

        var ct = self._findCloserTarget();
        if (ct !== null && ct !== self.targetFloor && ct !== self.currentFloor) {
            self.targetFloor = ct;
        }

        while (self._moveProgress >= self.floorHeight) {
            self._moveProgress -= self.floorHeight;
            self.currentFloor += self.direction;

            if (self.currentFloor === self.targetFloor) {
                self.state = 'DOOR_OPENING';
                self._doorTimer = 0;
                self._moveProgress = 0;
                return;
            }
        }
    };

    ElevatorLogic.prototype._findCloserTarget = function() {
        if (this.targetFloor === null) return null;
        var ns = this.currentFloor + this.direction;
        if (ns < 0 || ns >= this.floorCount) return null;
        if (this.direction > 0 && ns >= this.targetFloor) return null;
        if (this.direction < 0 && ns <= this.targetFloor) return null;

        if (this.destinations.has(ns)) return ns;
        if (this.direction > 0 && (this.upCalls.has(ns) || this.downCalls.has(ns))) return ns;
        if (this.direction < 0 && (this.downCalls.has(ns) || this.upCalls.has(ns))) return ns;

        return null;
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
