(function(root) {
    var IDLE = "IDLE", MOVING = "MOVING", DOOR_OPENING = "DOOR_OPENING", DOOR_OPEN = "DOOR_OPEN", DOOR_CLOSING = "DOOR_CLOSING";
    var MIN_DOOR_OPEN_S = 1.0;
    var MAX_DOOR_OPEN_S = 6.0;
    var SPEED = 2.5; // floors per second
    var DOOR_TIME = 0.6;

    function ElevatorLogic(opts) {
        opts = opts || {};
        this.floorCount = opts.floorCount || 6;
        this.maxCapacity = opts.maxCapacity || 4;
        this.floorHeight = opts.floorHeight || 3.4;
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.direction = 0;
        this.state = IDLE;
        this.positionY = 0;
        this.doorTimer = 0;
        this.doorOpenTimer = 0;
        this.doorProgress = 0; // 0 closed, 1 open
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupied = [false, false, false, false];
        this.servedThisDoorCycle = false;
        this.lastServedFloor = -1;
        this._timedOut = false;
    }

    ElevatorLogic.prototype.callUp = function(floor) { this.upCalls.add(floor); };
    ElevatorLogic.prototype.callDown = function(floor) { this.downCalls.add(floor); };
    ElevatorLogic.prototype.pressDestination = function(floor) { this.destinations.add(floor); };

    ElevatorLogic.prototype.isAcceptingAt = function(floor, dir) {
        if (this.state !== DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        if (this.destinations.size === 0 && this.upCalls.size === 0 && this.downCalls.size === 0) return true;
        // if there are destinations pending, only accept matching direction
        if (this.direction === 0) return true;
        if (dir === this.direction) return true;
        // if no more stops in current direction, accept opposite
        if (!this._hasWorkInDirection(this.direction)) return true;
        return false;
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
        if (this.currentCapacityFree() <= 0) return null;
        for (var i = 0; i < 4; i++) {
            if (!this.spotOccupied[i]) {
                this.spotOccupied[i] = true;
                this.pendingBoarders.add(person);
                var spots = [{ x: -0.6, z: -0.5 }, { x: 0.6, z: -0.5 }, { x: -0.6, z: 0.4 }, { x: 0.6, z: 0.4 }];
                var s = spots[i];
                return { index: i, x: s.x, y: 0, z: s.z };
            }
        }
        return null;
    };

    ElevatorLogic.prototype.completeBoard = function(person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
    };

    ElevatorLogic.prototype.registerDisembark = function(person) {
        if (this.passengers.has(person)) {
            this.pendingDisembark.add(person);
        }
    };

    ElevatorLogic.prototype.completeDisembark = function(person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            // free spot - find which spot this person had
            // We track by person reference; free first occupied spot for simplicity
            // Actually we need to track person->spot mapping
            if (person._elevSpot !== undefined) {
                this.spotOccupied[person._elevSpot] = false;
                person._elevSpot = undefined;
            } else {
                for (var i = 0; i < 4; i++) if (this.spotOccupied[i]) { this.spotOccupied[i] = false; break; }
            }
        } else if (this.passengers.has(person)) {
            this.passengers.delete(person);
            if (person._elevSpot !== undefined) { this.spotOccupied[person._elevSpot] = false; person._elevSpot = undefined; }
        }
    };

    ElevatorLogic.prototype._hasWorkInDirection = function(dir) {
        if (dir > 0) {
            for (var f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
            }
        } else if (dir < 0) {
            for (var f2 = this.currentFloor - 1; f2 >= 0; f2--) {
                if (this.destinations.has(f2) || this.upCalls.has(f2) || this.downCalls.has(f2)) return true;
            }
        }
        return false;
    };

    ElevatorLogic.prototype._pickNextTarget = function() {
        var cf = this.currentFloor;
        var dir = this.direction;

        // If passengers have destinations, prioritize them
        var dests = [];
        this.destinations.forEach(function(d) { dests.push(d); });

        // First try current direction
        if (dir !== 0) {
            var best = null, bestDist = Infinity;
            for (var i = 0; i < dests.length; i++) {
                var d = dests[i];
                if ((dir > 0 && d > cf) || (dir < 0 && d < cf)) {
                    var dist = Math.abs(d - cf);
                    if (dist < bestDist) { bestDist = dist; best = d; }
                }
            }
            // Also check hall calls in same direction
            var calls = dir > 0 ? this.upCalls : this.downCalls;
            var self = this;
            calls.forEach(function(c) {
                if ((dir > 0 && c > cf) || (dir < 0 && c < cf)) {
                    var dist2 = Math.abs(c - cf);
                    if (dist2 < bestDist) { bestDist = dist2; best = c; }
                }
            });
            // Also destinations in same dir even if opposite call type? destinations always count
            if (best !== null) return best;
            // No work ahead - try reverse
            var revDir = -dir;
            best = null; bestDist = Infinity;
            for (var j = 0; j < dests.length; j++) {
                var d2 = dests[j];
                if ((revDir > 0 && d2 > cf) || (revDir < 0 && d2 < cf)) {
                    var dist3 = Math.abs(d2 - cf);
                    if (dist3 < bestDist) { bestDist = dist3; best = d2; }
                }
            }
            var revCalls = revDir > 0 ? this.upCalls : this.downCalls;
            revCalls.forEach(function(c) {
                if ((revDir > 0 && c > cf) || (revDir < 0 && c < cf)) {
                    var dist4 = Math.abs(c - cf);
                    if (dist4 < bestDist) { bestDist = dist4; best = c; }
                }
            });
            // Also consider opposite call at current floor if no more ahead
            if (best !== null) { this.direction = revDir; return best; }
            // Check all remaining
            var allBest = null, allDist = Infinity;
            dests.forEach(function(d) { var di = Math.abs(d - cf); if (di < allDist && di > 0) { allDist = di; allBest = d; } });
            this.upCalls.forEach(function(c) { var di = Math.abs(c - cf); if (di < allDist && di > 0) { allDist = di; allBest = c; } });
            this.downCalls.forEach(function(c) { var di = Math.abs(c - cf); if (di < allDist && di > 0) { allDist = di; allBest = c; } });
            if (allBest !== null) {
                this.direction = allBest > cf ? 1 : -1;
                return allBest;
            }
            this.direction = 0;
            return cf;
        } else {
            // idle - nearest
            var allBest2 = null, allDist2 = Infinity;
            var self2 = this;
            dests.forEach(function(d) { var di = Math.abs(d - cf); if (di < allDist2 && di > 0) { allDist2 = di; allBest2 = d; } });
            this.upCalls.forEach(function(c) { var di = Math.abs(c - cf); if (di < allDist2) { allDist2 = di; allBest2 = c; } });
            this.downCalls.forEach(function(c) { var di = Math.abs(c - cf); if (di < allDist2) { allDist2 = di; allBest2 = c; } });
            // also if same floor call exists and no movement needed, stay
            if (allBest2 === null) {
                // check same floor calls
                if (this.upCalls.has(cf) || this.downCalls.has(cf) || this.destinations.has(cf)) return cf;
                return cf;
            }
            this.direction = allBest2 > cf ? 1 : (allBest2 < cf ? -1 : 0);
            return allBest2;
        }
    };

    ElevatorLogic.prototype._arriveAtFloor = function(floor) {
        this.currentFloor = floor;
        this.positionY = floor * this.floorHeight;
        this.targetFloor = floor;
        // Clear destination for this floor
        this.destinations.delete(floor);
        // Clear hall call for current direction
        if (this.direction >= 0) {
            if (this.upCalls.has(floor)) { this.upCalls.delete(floor); }
        }
        if (this.direction <= 0) {
            if (this.downCalls.has(floor)) { this.downCalls.delete(floor); }
        }
        // If no more stops in current direction, clear opposite too
        if (!this._hasWorkInDirection(this.direction)) {
            this.upCalls.delete(floor);
            this.downCalls.delete(floor);
        }
        this.servedThisDoorCycle = true;
        this.lastServedFloor = floor;
    };

    ElevatorLogic.prototype.tick = function(dt) {
        if (this.state === IDLE) {
            var hasWork = this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
            if (hasWork) {
                var nt = this._pickNextTarget();
                if (nt === this.currentFloor) {
                    this.state = DOOR_OPENING;
                    this.doorTimer = 0;
                    this.doorOpenTimer = 0;
                    this.servedThisDoorCycle = false;
                } else {
                    this.targetFloor = nt;
                    this.state = MOVING;
                }
            }
        } else if (this.state === MOVING) {
            // Re-evaluate target for closer stop in same direction
            var nt2 = this._pickNextTarget();
            if (nt2 !== this.currentFloor && nt2 !== this.targetFloor) {
                // Only shorten if in same direction and closer
                if (this.direction > 0 && nt2 > this.currentFloor && nt2 < this.targetFloor) this.targetFloor = nt2;
                if (this.direction < 0 && nt2 < this.currentFloor && nt2 > this.targetFloor) this.targetFloor = nt2;
            }
            var targetY = this.targetFloor * this.floorHeight;
            var dir = targetY > this.positionY ? 1 : -1;
            this.positionY += dir * SPEED * this.floorHeight * dt / this.floorHeight * SPEED;
            // Simpler: move in floor units
            // Actually SPEED is floors/sec, so delta floors = SPEED * dt
            // We did positionY incorrectly above - fix:
            // Recompute properly:
            // Let's just lerp
            // Reset and do correctly
            // Undo previous and redo
            // Instead use direct approach:
            // We'll track correctly - revert bad addition
            // Actually easier: just set via direction
            var totalDist = Math.abs(targetY - (this.targetFloor === this.currentFloor ? this.positionY : this.positionY));
            // Check arrival
            if (dir > 0 && this.positionY >= targetY) {
                this.positionY = targetY;
                this._arriveAtFloor(this.targetFloor);
                this.state = DOOR_OPENING;
                this.doorTimer = 0;
                this.doorOpenTimer = 0;
                this.servedThisDoorCycle = false;
            } else if (dir < 0 && this.positionY <= targetY) {
                this.positionY = targetY;
                this._arriveAtFloor(this.targetFloor);
                this.state = DOOR_OPENING;
                this.doorTimer = 0;
                this.doorOpenTimer = 0;
                this.servedThisDoorCycle = false;
            }
        } else if (this.state === DOOR_OPENING) {
            this.doorTimer += dt;
            this.doorProgress = Math.min(1, this.doorTimer / DOOR_TIME);
            if (this.doorProgress >= 1) {
                this.state = DOOR_OPEN;
                this.doorOpenTimer = 0;
            }
        } else if (this.state === DOOR_OPEN) {
            this.doorOpenTimer += dt;
            var canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            if (canClose && this.doorOpenTimer >= MIN_DOOR_OPEN_S) {
                // Don't reopen for same-floor hall call if passengers have destinations
                if (this.passengers.size > 0 && this.destinations.size > 0) {
                    // clear same-floor hall calls to prevent reopen
                    // keep them queued but don't reopen now
                } else if (this.servedThisDoorCycle) {
                    // prevent infinite reopen at same floor
                    var sameFloorCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
                    if (sameFloorCall && this.destinations.size > 0) {
                        // don't reopen
                    } else if (sameFloorCall && this.servedThisDoorCycle) {
                        // already served this cycle, don't reopen
                        this.servedThisDoorCycle = false;
                    }
                }
                // Check if we should stay open for same-floor call that hasn't been served
                var hasSameFloorCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
                if (hasSameFloorCall && !this.servedThisDoorCycle && this.passengers.size === 0) {
                    // serve it without closing
                    this._arriveAtFloor(this.currentFloor);
                    this.doorOpenTimer = 0;
                } else {
                    this.state = DOOR_CLOSING;
                    this.doorTimer = DOOR_TIME;
                }
            } else if (this.doorOpenTimer >= MAX_DOOR_OPEN_S) {
                this.state = DOOR_CLOSING;
                this.doorTimer = DOOR_TIME;
            }
        } else if (this.state === DOOR_CLOSING) {
            this.doorTimer -= dt;
            this.doorProgress = Math.max(0, this.doorTimer / DOOR_TIME);
            if (this.doorProgress <= 0) {
                this.doorProgress = 0;
                // pick next target
                var hasWork2 = this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
                if (!hasWork2) {
                    this.state = IDLE;
                    this.direction = 0;
                    this.targetFloor = this.currentFloor;
                } else {
                    var nt3 = this._pickNextTarget();
                    if (nt3 === this.currentFloor) {
                        // Same floor - check if we should reopen
                        // Guard against infinite reopen when passengers have destinations
                        if (this.passengers.size > 0 && this.destinations.size > 0) {
                            // Don't reopen, pick next dest
                            // Find next dest not on this floor
                            var otherDest = null;
                            var self3 = this;
                            this.destinations.forEach(function(d) { if (d !== self3.currentFloor && otherDest === null) otherDest = d; });
                            if (otherDest !== null) {
                                this.targetFloor = otherDest;
                                this.direction = otherDest > this.currentFloor ? 1 : -1;
                                this.state = MOVING;
                            } else {
                                this.state = IDLE;
                                this.direction = 0;
                            }
                        } else if (this.servedThisDoorCycle) {
                            // already served this floor this cycle, force move or idle
                            this.servedThisDoorCycle = false;
                            // try to find work elsewhere
                            var found = false;
                            var self4 = this;
                            this.destinations.forEach(function(d) { if (d !== self4.currentFloor && !found) { self4.targetFloor = d; self4.direction = d > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } });
                            if (!found) {
                                this.upCalls.forEach(function(c) { if (c !== self4.currentFloor && !found) { self4.targetFloor = c; self4.direction = c > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } });
                                self4.downCalls.forEach(function(c) { if (c !== self4.currentFloor && !found) { self4.targetFloor = c; self4.direction = c > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } });
                            }
                            if (!found) { this.state = IDLE; this.direction = 0; }
                        } else {
                            this.state = DOOR_OPENING;
                            this.doorTimer = 0;
                            this.doorOpenTimer = 0;
                        }
                    } else {
                        this.targetFloor = nt3;
                        this.state = MOVING;
                    }
                }
            }
        }
    };

    // Fix MOVING: override tick's moving branch with correct speed logic
    var origTick = ElevatorLogic.prototype.tick;
    ElevatorLogic.prototype.tick = function(dt) {
        if (this.state === MOVING) {
            var nt2 = this._pickNextTarget();
            if (nt2 !== this.currentFloor && nt2 !== this.targetFloor) {
                if (this.direction > 0 && nt2 > this.currentFloor && nt2 < this.targetFloor) this.targetFloor = nt2;
                if (this.direction < 0 && nt2 < this.currentFloor && nt2 > this.targetFloor) this.targetFloor = nt2;
            }
            var targetY = this.targetFloor * this.floorHeight;
            var dir = targetY > this.positionY ? 1 : -1;
            this.positionY += dir * SPEED * this.floorHeight * dt;
            if (dir > 0 && this.positionY >= targetY) {
                this.positionY = targetY;
                this._arriveAtFloor(this.targetFloor);
                this.state = DOOR_OPENING; this.doorTimer = 0; this.doorOpenTimer = 0; this.servedThisDoorCycle = false;
            } else if (dir < 0 && this.positionY <= targetY) {
                this.positionY = targetY;
                this._arriveAtFloor(this.targetFloor);
                this.state = DOOR_OPENING; this.doorTimer = 0; this.doorOpenTimer = 0; this.servedThisDoorCycle = false;
            }
            return;
        }
        // For non-MOVING, call original but avoid recursion - inline the rest
        if (this.state === IDLE) {
            var hasWork = this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
            if (hasWork) {
                var nt = this._pickNextTarget();
                if (this._timedOut && nt === this.currentFloor) { this._timedOut = false; return; }
                if (nt === this.currentFloor) { this.state = DOOR_OPENING; this.doorTimer = 0; this.doorOpenTimer = 0; this.servedThisDoorCycle = false; }
                else { this.targetFloor = nt; this.state = MOVING; }
            }
        } else if (this.state === DOOR_OPENING) {
            this.doorTimer += dt; this.doorProgress = Math.min(1, this.doorTimer / DOOR_TIME);
            if (this.doorProgress >= 1) { this.state = DOOR_OPEN; this.doorOpenTimer = 0; }
        } else if (this.state === DOOR_OPEN) {
            this.doorOpenTimer += dt;
            var canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            if (canClose && this.doorOpenTimer >= MIN_DOOR_OPEN_S) {
                var hasSameFloorCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
                if (hasSameFloorCall && !this.servedThisDoorCycle && this.passengers.size === 0) {
                    this._arriveAtFloor(this.currentFloor); this.doorOpenTimer = 0;
                } else { this.state = DOOR_CLOSING; this.doorTimer = DOOR_TIME; }
            } else if (this.doorOpenTimer >= MAX_DOOR_OPEN_S) { this.servedThisDoorCycle = true; this._timedOut = true; this.upCalls.delete(this.currentFloor); this.downCalls.delete(this.currentFloor); this.state = DOOR_CLOSING; this.doorTimer = DOOR_TIME; }
        } else if (this.state === DOOR_CLOSING) {
            this.doorTimer -= dt; this.doorProgress = Math.max(0, this.doorTimer / DOOR_TIME);
            if (this.doorProgress <= 0) {
                this.doorProgress = 0;
                var hasWork2 = this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
                if (!hasWork2) { this.state = IDLE; this.direction = 0; this.targetFloor = this.currentFloor; }
                else {
                    var nt3 = this._pickNextTarget();
                    if (nt3 === this.currentFloor) {
                        if (this.passengers.size > 0 && this.destinations.size > 0) {
                            var otherDest = null; var self3 = this;
                            this.destinations.forEach(function(d) { if (d !== self3.currentFloor && otherDest === null) otherDest = d; });
                            if (otherDest !== null) { this.targetFloor = otherDest; this.direction = otherDest > this.currentFloor ? 1 : -1; this.state = MOVING; }
                            else { this.state = IDLE; this.direction = 0; }
                        } else if (this.servedThisDoorCycle) {
                            this.servedThisDoorCycle = false;
                            var found = false; var self4 = this;
                            this.destinations.forEach(function(d) { if (d !== self4.currentFloor && !found) { self4.targetFloor = d; self4.direction = d > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } });
                            if (!found) { this.upCalls.forEach(function(c) { if (c !== self4.currentFloor && !found) { self4.targetFloor = c; self4.direction = c > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } }); }
                            if (!found) { this.downCalls.forEach(function(c) { if (c !== self4.currentFloor && !found) { self4.targetFloor = c; self4.direction = c > self4.currentFloor ? 1 : -1; self4.state = MOVING; found = true; } }); }
                            if (!found) { this.state = IDLE; this.direction = 0; }
                        } else { this.state = DOOR_OPENING; this.doorTimer = 0; this.doorOpenTimer = 0; }
                    } else { this.targetFloor = nt3; this.state = MOVING; }
                }
            }
        }
    };

    ElevatorLogic.prototype.reset = function() {
        this.currentFloor = 0; this.targetFloor = 0; this.direction = 0; this.state = IDLE;
        this.positionY = 0; this.doorTimer = 0; this.doorOpenTimer = 0; this.doorProgress = 0;
        this.upCalls.clear(); this.downCalls.clear(); this.destinations.clear();
        this.passengers.clear(); this.pendingBoarders.clear(); this.pendingDisembark.clear();
        this.spotOccupied = [false, false, false, false];
        this.servedThisDoorCycle = false; this.lastServedFloor = -1; this._timedOut = false;
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) module.exports = { ElevatorLogic };
})(typeof window !== "undefined" ? window : globalThis);
