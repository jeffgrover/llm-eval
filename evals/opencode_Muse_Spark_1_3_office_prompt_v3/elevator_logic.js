(function(root) {
    var IDLE = "IDLE";
    var MOVING = "MOVING";
    var DOOR_OPENING = "DOOR_OPENING";
    var DOOR_OPEN = "DOOR_OPEN";
    var DOOR_CLOSING = "DOOR_CLOSING";

    function ElevatorLogic(options) {
        options = options || {};
        this.floorCount = (options.floorCount !== undefined) ? options.floorCount : 6;
        this.maxCapacity = (options.maxCapacity !== undefined) ? options.maxCapacity : 4;
        this.floorHeight = (options.floorHeight !== undefined) ? options.floorHeight : 3.4;
        this.MIN_DOOR_OPEN_S = 2.0;
        this.MAX_DOOR_OPEN_S = 12.0;
        this.DOOR_TRANSIT_S = 1.0;
        this.SPEED_FLOORS_PER_S = 0.55;
        this.reset();
    }

    ElevatorLogic.prototype.reset = function() {
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.carPos = 0;
        this.direction = 0;
        this.state = IDLE;
        this.doorTimer = 0;
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupied = [];
        for (var i = 0; i < this.maxCapacity; i++) { this.spotOccupied.push(false); }
        this.personSpot = new Map();
        this.servedThisDoorCycle = false;
        this.lastServedFloor = -1;
    };

    ElevatorLogic.prototype.callUp = function(floor) {
        if (floor < 0 || floor >= this.floorCount) { return; }
        if (floor === this.floorCount - 1) { return; }
        this.upCalls.add(floor);
    };

    ElevatorLogic.prototype.callDown = function(floor) {
        if (floor < 0 || floor >= this.floorCount) { return; }
        if (floor === 0) { return; }
        this.downCalls.add(floor);
    };

    ElevatorLogic.prototype.pressDestination = function(floor) {
        if (floor < 0 || floor >= this.floorCount) { return; }
        if (floor === this.currentFloor && (this.state === DOOR_OPEN || this.state === DOOR_OPENING)) { return; }
        this.destinations.add(floor);
    };

    ElevatorLogic.prototype.currentCapacityFree = function() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
        if (this.currentCapacityFree() <= 0) { return null; }
        if (this.pendingBoarders.has(person) || this.passengers.has(person)) { return null; }
        var idx = -1;
        for (var i = 0; i < this.maxCapacity; i++) {
            if (!this.spotOccupied[i]) { idx = i; break; }
        }
        if (idx < 0) { return null; }
        this.spotOccupied[idx] = true;
        this.personSpot.set(person, idx);
        this.pendingBoarders.add(person);
        var cols = 2;
        var lx = (idx % cols === 0) ? -0.6 : 0.6;
        var lz = (idx < cols) ? -0.7 : 0.15;
        return { index: idx, x: lx, y: 0, z: lz };
    };

    ElevatorLogic.prototype.completeBoard = function(person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
    };

    ElevatorLogic.prototype.registerDisembark = function(person) {
        if (this.passengers.has(person)) {
            this.passengers.delete(person);
            this.pendingDisembark.add(person);
        } else if (!this.pendingDisembark.has(person)) {
            this.pendingDisembark.add(person);
        }
    };

    ElevatorLogic.prototype.completeDisembark = function(person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
        }
        if (this.passengers.has(person)) {
            this.passengers.delete(person);
        }
        if (this.personSpot.has(person)) {
            var idx = this.personSpot.get(person);
            if (idx >= 0 && idx < this.maxCapacity) { this.spotOccupied[idx] = false; }
            this.personSpot.delete(person);
        }
    };

    ElevatorLogic.prototype.isAcceptingAt = function(floor, dir) {
        if (this.state !== DOOR_OPEN) { return false; }
        if (floor !== this.currentFloor) { return false; }
        if (this.currentCapacityFree() <= 0) { return false; }
        if (this.direction === 0) { return true; }
        if (dir === this.direction) { return true; }
        return !this.hasWorkInDirection(this.direction);
    };

    ElevatorLogic.prototype.hasWorkInDirection = function(dir) {
        var f;
        if (dir > 0) {
            for (f = this.currentFloor + 1; f < this.floorCount; f++) {
                if (this.destinations.has(f) || this.upCalls.has(f)) { return true; }
            }
            return false;
        } else if (dir < 0) {
            for (f = this.currentFloor - 1; f >= 0; f--) {
                if (this.destinations.has(f) || this.downCalls.has(f)) { return true; }
            }
            return false;
        }
        return (this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0);
    };

    ElevatorLogic.prototype.hasAnyWork = function() {
        return (this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0);
    };

    ElevatorLogic.prototype.isStopFloor = function(floor, dir) {
        if (this.destinations.has(floor)) { return true; }
        if (dir > 0 && this.upCalls.has(floor)) { return true; }
        if (dir < 0 && this.downCalls.has(floor)) { return true; }
        if (dir === 0 && (this.upCalls.has(floor) || this.downCalls.has(floor))) { return true; }
        return false;
    };

    ElevatorLogic.prototype.pickNextTarget = function() {
        var f, best, bd, d;
        var cands, ci;
        if (this.destinations.size > 0) {
            if (this.direction !== 0) {
                cands = [];
                var destArr = Array.from(this.destinations);
                for (ci = 0; ci < destArr.length; ci++) {
                    f = destArr[ci];
                    if (this.direction > 0 && f > this.currentFloor) { cands.push(f); }
                    if (this.direction < 0 && f < this.currentFloor) { cands.push(f); }
                }
                if (cands.length > 0) {
                    cands.sort(function(a, b) { return a - b; });
                    if (this.direction > 0) { return cands[0]; }
                    return cands[cands.length - 1];
                }
                best = null; bd = 1000000000;
                for (ci = 0; ci < destArr.length; ci++) {
                    f = destArr[ci];
                    if (f === this.currentFloor) { continue; }
                    d = Math.abs(f - this.currentFloor);
                    if (d < bd) { bd = d; best = f; }
                }
                if (best !== null && best !== undefined) {
                    this.direction = (best > this.currentFloor) ? 1 : -1;
                    return best;
                }
                this.direction = 0;
                return null;
            } else {
                best = null; bd = 1000000000;
                var destArr2 = Array.from(this.destinations);
                for (ci = 0; ci < destArr2.length; ci++) {
                    f = destArr2[ci];
                    d = Math.abs(f - this.currentFloor);
                    if (d < bd) { bd = d; best = f; }
                }
                if (best === null || best === undefined) { return null; }
                if (best === this.currentFloor) { return best; }
                this.direction = (best > this.currentFloor) ? 1 : -1;
                return best;
            }
        }
        var callsAhead = function(self, dir) {
            var out = [];
            var ff;
            if (dir > 0) {
                for (ff = self.currentFloor + 1; ff < self.floorCount; ff++) {
                    if (self.upCalls.has(ff)) { out.push(ff); }
                }
            } else {
                for (ff = self.currentFloor - 1; ff >= 0; ff--) {
                    if (self.downCalls.has(ff)) { out.push(ff); }
                }
            }
            return out;
        };
        var nearestCallOverall = function(self) {
            var bf = null; var bdd = 1000000000; var ff;
            for (ff = 0; ff < self.floorCount; ff++) {
                if (self.upCalls.has(ff) || self.downCalls.has(ff)) {
                    var dd = Math.abs(ff - self.currentFloor);
                    if (dd < bdd) { bdd = dd; bf = ff; }
                }
            }
            return bf;
        };
        if (this.direction !== 0) {
            var ahead = callsAhead(this, this.direction);
            if (ahead.length > 0) {
                if (this.direction > 0) {
                    ahead.sort(function(a, b) { return a - b; });
                    return ahead[0];
                }
                ahead.sort(function(a, b) { return b - a; });
                return ahead[0];
            }
            var behind = callsAhead(this, -this.direction);
            if (behind.length > 0) {
                this.direction = -this.direction;
                if (this.direction > 0) {
                    behind.sort(function(a, b) { return a - b; });
                    return behind[0];
                }
                behind.sort(function(a, b) { return b - a; });
                return behind[0];
            }
            if (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor)) {
                return this.currentFloor;
            }
            var anyF = nearestCallOverall(this);
            if (anyF !== null && anyF !== undefined) {
                if (anyF === this.currentFloor) { return anyF; }
                this.direction = (anyF > this.currentFloor) ? 1 : -1;
                return anyF;
            }
            this.direction = 0;
            return null;
        } else {
            var nf = nearestCallOverall(this);
            if (nf === null || nf === undefined) { return null; }
            if (nf === this.currentFloor) { return nf; }
            this.direction = (nf > this.currentFloor) ? 1 : -1;
            return nf;
        }
    };

    ElevatorLogic.prototype.onArrival = function(floor) {
        this.currentFloor = floor;
        this.carPos = floor;
        this.targetFloor = floor;
        this.destinations.delete(floor);
        if (this.direction > 0) {
            this.upCalls.delete(floor);
        } else if (this.direction < 0) {
            this.downCalls.delete(floor);
        } else {
            this.upCalls.delete(floor);
            this.downCalls.delete(floor);
        }
        if (!this.hasWorkInDirection(this.direction) && this.direction !== 0) {
            this.upCalls.delete(floor);
            this.downCalls.delete(floor);
        }
        this.servedThisDoorCycle = false;
        this.lastServedFloor = floor;
        this.state = DOOR_OPENING;
        this.doorTimer = 0;
    };

    ElevatorLogic.prototype.tick = function(dt) {
        if (dt === undefined || dt === null) { dt = 0.016; }
        if (dt < 0) { dt = 0; }
        if (dt > 5) { dt = 5; }
        if (this.state === IDLE) {
            if (this.hasAnyWork()) {
                var t = this.pickNextTarget();
                if (t === null || t === undefined) { this.direction = 0; return; }
                this.targetFloor = t;
                if (t === this.currentFloor) {
                    this.onArrival(this.currentFloor);
                } else {
                    this.state = MOVING;
                }
            } else {
                this.direction = 0;
            }
            return;
        }
        if (this.state === MOVING) {
            if (this.targetFloor !== this.currentFloor || Math.abs(this.carPos - this.targetFloor) > 0.000001) {
                var scanDir = this.direction;
                if (scanDir === 0) {
                    scanDir = (this.targetFloor > this.carPos) ? 1 : -1;
                    this.direction = scanDir;
                }
                var lo = Math.min(this.carPos, this.targetFloor);
                var hi = Math.max(this.carPos, this.targetFloor);
                var candFloor = null;
                var ff;
                if (scanDir > 0) {
                    for (ff = Math.floor(this.carPos + 0.000001) + 1; ff <= this.targetFloor; ff++) {
                        if (ff > hi) { break; }
                        if (this.isStopFloor(ff, scanDir)) { candFloor = ff; break; }
                    }
                } else {
                    for (ff = Math.ceil(this.carPos - 0.000001) - 1; ff >= this.targetFloor; ff--) {
                        if (ff < lo) { break; }
                        if (this.isStopFloor(ff, scanDir)) { candFloor = ff; break; }
                    }
                }
                if (candFloor !== null) { this.targetFloor = candFloor; }
                var dist = this.targetFloor - this.carPos;
                var step = this.SPEED_FLOORS_PER_S * dt;
                if (Math.abs(dist) <= step) {
                    this.onArrival(this.targetFloor);
                } else {
                    this.carPos += (dist > 0 ? step : -step);
                    this.currentFloor = Math.round(this.carPos);
                    if (this.currentFloor < 0) { this.currentFloor = 0; }
                    if (this.currentFloor >= this.floorCount) { this.currentFloor = this.floorCount - 1; }
                }
            } else {
                this.onArrival(this.currentFloor);
            }
            return;
        }
        if (this.state === DOOR_OPENING) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_TRANSIT_S) {
                this.state = DOOR_OPEN;
                this.doorTimer = 0;
            }
            return;
        }
        if (this.state === DOOR_OPEN) {
            this.doorTimer += dt;
            var pendingBusy = (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0);
            if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                this.pendingBoarders.clear();
                this.pendingDisembark.clear();
                this.state = DOOR_CLOSING;
                this.doorTimer = 0;
                return;
            }
            if (this.doorTimer >= this.MIN_DOOR_OPEN_S && !pendingBusy) {
                this.state = DOOR_CLOSING;
                this.doorTimer = 0;
            }
            return;
        }
        if (this.state === DOOR_CLOSING) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_TRANSIT_S) {
                this.servedThisDoorCycle = true;
                var nt = this.pickNextTarget();
                if (nt === null || nt === undefined) {
                    this.state = IDLE;
                    this.direction = 0;
                    this.doorTimer = 0;
                    return;
                }
                if (nt === this.currentFloor) {
                    if (this.destinations.size > 0) {
                        nt = this.pickNextTarget();
                        if (nt === null || nt === undefined || nt === this.currentFloor) {
                            var destArr3 = Array.from(this.destinations);
                            var bf2 = null; var bd2 = 1000000000; var ci2;
                            for (ci2 = 0; ci2 < destArr3.length; ci2++) {
                                var ddf = Math.abs(destArr3[ci2] - this.currentFloor);
                                if (ddf < bd2 && destArr3[ci2] !== this.currentFloor) { bd2 = ddf; bf2 = destArr3[ci2]; }
                            }
                            if (bf2 === null) {
                                this.state = IDLE;
                                this.direction = 0;
                                this.doorTimer = 0;
                                return;
                            }
                            this.direction = (bf2 > this.currentFloor) ? 1 : -1;
                            this.targetFloor = bf2;
                            this.state = MOVING;
                            this.doorTimer = 0;
                            return;
                        }
                    } else {
                        this.state = DOOR_OPENING;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle = false;
                        this.onArrivalReopen();
                        return;
                    }
                }
                this.targetFloor = nt;
                this.state = MOVING;
                this.doorTimer = 0;
            }
            return;
        }
    };

    ElevatorLogic.prototype.onArrivalReopen = function() {
        var floor = this.currentFloor;
        this.destinations.delete(floor);
        this.upCalls.delete(floor);
        this.downCalls.delete(floor);
        this.lastServedFloor = floor;
        this.state = DOOR_OPENING;
        this.doorTimer = 0;
    };

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
