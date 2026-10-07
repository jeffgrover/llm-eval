(function (root) {
    "use strict";

    var STATE_IDLE = "IDLE";
    var STATE_MOVING = "MOVING";
    var STATE_OPENING = "DOOR_OPENING";
    var STATE_OPEN = "DOOR_OPEN";
    var STATE_CLOSING = "DOOR_CLOSING";

    function ElevatorLogic(options) {
        options = options || {};
        this.floorCount = options.floorCount || 6;
        this.maxCapacity = options.maxCapacity || 4;
        this.floorHeight = options.floorHeight || 3.4;
        this.speed = options.speed || 2.0;
        this.minDoorOpen = options.minDoorOpen || 1.4;
        this.maxDoorOpen = options.maxDoorOpen || 8.0;
        this.doorTravel = options.doorTravel || 0.6;
        this.spots = [
            { x: -0.7, z: -0.55 },
            { x: 0.7, z: -0.55 },
            { x: -0.7, z: 0.55 },
            { x: 0.7, z: 0.55 }
        ];
        this.reset();
    }

    ElevatorLogic.prototype.reset = function reset() {
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupancy = [false, false, false, false];
        this.spotByPerson = new Map();
        this.direction = 0;
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.position = 0;
        this.state = STATE_IDLE;
        this.doorTimer = 0;
        this.lastServedFloor = -1;
    };

    ElevatorLogic.prototype.callUp = function callUp(floor) {
        if (floor >= 0 && floor < this.floorCount && floor !== this.floorCount - 1) {
            this.upCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.callDown = function callDown(floor) {
        if (floor > 0 && floor < this.floorCount) {
            this.downCalls.add(floor);
        }
    };

    ElevatorLogic.prototype.pressDestination = function pressDestination(floor) {
        if (floor >= 0 && floor < this.floorCount) {
            this.destinations.add(floor);
        }
    };

    ElevatorLogic.prototype.hasStopsAhead = function hasStopsAhead() {
        if (this.direction === 0) return false;
        var i;
        for (i = 0; i < this.floorCount; i += 1) {
            if (this.isAhead(i, this.position, this.direction) &&
                (this.destinations.has(i) || this.upCalls.has(i) || this.downCalls.has(i))) {
                return true;
            }
        }
        return false;
    };

    ElevatorLogic.prototype.isAhead = function isAhead(floor, from, direction) {
        if (direction > 0) return floor > from + 0.000001;
        if (direction < 0) return floor < from - 0.000001;
        return false;
    };

    ElevatorLogic.prototype.isAcceptingAt = function isAcceptingAt(floor, direction) {
        if (this.state !== STATE_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        if (this.direction === 0) return true;
        if (direction === this.direction) return true;
        return !this.hasStopsAhead();
    };

    ElevatorLogic.prototype.currentCapacityFree = function currentCapacityFree() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    };

    ElevatorLogic.prototype.findFreeSpot = function findFreeSpot() {
        var i;
        for (i = 0; i < this.spots.length; i += 1) {
            if (!this.spotOccupancy[i]) return i;
        }
        return -1;
    };

    ElevatorLogic.prototype.reserveBoardingSpot = function reserveBoardingSpot(person) {
        if (this.currentCapacityFree() <= 0) return null;
        var index = this.findFreeSpot();
        if (index < 0) return null;
        this.spotOccupancy[index] = true;
        this.spotByPerson.set(person, index);
        this.pendingBoarders.add(person);
        return { index: index, x: this.spots[index].x, y: 0, z: this.spots[index].z };
    };

    ElevatorLogic.prototype.releaseSpot = function releaseSpot(person) {
        var index = this.spotByPerson.get(person);
        if (index !== undefined) {
            this.spotOccupancy[index] = false;
            this.spotByPerson.delete(person);
        }
    };

    ElevatorLogic.prototype.completeBoard = function completeBoard(person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
    };

    ElevatorLogic.prototype.cancelBoard = function cancelBoard(person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.releaseSpot(person);
        }
    };

    ElevatorLogic.prototype.registerDisembark = function registerDisembark(person) {
        if (this.passengers.has(person)) {
            this.passengers.delete(person);
            this.pendingDisembark.add(person);
        } else if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.pendingDisembark.add(person);
        }
    };

    ElevatorLogic.prototype.completeDisembark = function completeDisembark(person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
            this.releaseSpot(person);
        }
    };

    ElevatorLogic.prototype.forceClearPending = function forceClearPending() {
        var list = [];
        this.pendingBoarders.forEach(function each(person) { list.push(person); });
        this.pendingDisembark.forEach(function each(person) { list.push(person); });
        var i;
        for (i = 0; i < list.length; i += 1) {
            this.releaseSpot(list[i]);
        }
        this.pendingBoarders.clear();
        this.pendingDisembark.clear();
    };

    ElevatorLogic.prototype.pickTarget = function pickTarget() {
        var hasDest = this.destinations.size > 0;
        var hasCalls = this.upCalls.size > 0 || this.downCalls.size > 0;
        if (!hasDest && !hasCalls) {
            this.direction = 0;
            this.targetFloor = this.currentFloor;
            return false;
        }

        var floor;

        if (this.direction === 0) {
            var nearest = null;
            var nearestDist = Infinity;
            if (hasDest) {
                this.destinations.forEach(function each(f) {
                    var d = Math.abs(f - this.position);
                    if (d < nearestDist) { nearestDist = d; nearest = f; }
                }, this);
                this.targetFloor = nearest;
                this.direction = nearest > this.position ? 1 : 1;
                if (nearest < this.position) this.direction = -1;
                return true;
            }
            var allCalls = [];
            this.upCalls.forEach(function each(f) { allCalls.push(f); });
            this.downCalls.forEach(function each(f) { allCalls.push(f); });
            var i;
            for (i = 0; i < allCalls.length; i += 1) {
                var d2 = Math.abs(allCalls[i] - this.position);
                if (d2 < nearestDist) { nearestDist = d2; nearest = allCalls[i]; }
            }
            this.targetFloor = nearest;
            if (nearest > this.position) this.direction = 1;
            else if (nearest < this.position) this.direction = -1;
            else this.direction = this.upCalls.has(nearest) ? 1 : -1;
            return true;
        }

        var best = null;
        var bestDist = Infinity;
        var consider = function consider(f) {
            if (this.isAhead(f, this.position, this.direction)) {
                var d = Math.abs(f - this.position);
                if (d < bestDist) { bestDist = d; best = f; }
            }
        }.bind(this);

        if (hasDest) {
            this.destinations.forEach(consider);
        }
        if (best === null) {
            this.upCalls.forEach(consider);
            this.downCalls.forEach(consider);
        }
        if (best !== null) {
            this.targetFloor = best;
            return true;
        }

        this.direction = -this.direction;
        best = null;
        bestDist = Infinity;
        this.destinations.forEach(consider);
        this.upCalls.forEach(consider);
        this.downCalls.forEach(consider);
        if (best !== null) {
            this.targetFloor = best;
            return true;
        }

        this.direction = 0;
        this.targetFloor = this.currentFloor;
        return false;
    };

    ElevatorLogic.prototype.reEvaluateTarget = function reEvaluateTarget() {
        if (this.direction === 0) return;
        var best = this.targetFloor;
        var bestDist = Math.abs(this.targetFloor - this.position);
        var self = this;
        var consider = function consider(f) {
            if (self.isAhead(f, self.position, self.direction)) {
                var d = Math.abs(f - self.position);
                if (d < bestDist) { bestDist = d; best = f; }
            }
        };
        this.destinations.forEach(consider);
        this.upCalls.forEach(consider);
        this.downCalls.forEach(consider);
        this.targetFloor = best;
    };

    ElevatorLogic.prototype.arriveAtFloor = function arriveAtFloor() {
        var f = this.currentFloor;
        this.destinations.delete(f);
        if (this.direction > 0) this.upCalls.delete(f);
        else if (this.direction < 0) this.downCalls.delete(f);
        if (!this.hasStopsAhead()) {
            if (this.direction > 0) this.downCalls.delete(f);
            else if (this.direction < 0) this.upCalls.delete(f);
        }
        this.lastServedFloor = f;
    };

    ElevatorLogic.prototype.tick = function tick(dt) {
        if (!(dt > 0)) dt = 0.0001;
        this.doorTimer += dt;

        if (this.state === STATE_IDLE) {
            if (this.pickTarget()) {
                this.state = STATE_MOVING;
                this.doorTimer = 0;
            }
            return;
        }

        if (this.state === STATE_MOVING) {
            this.reEvaluateTarget();
            var stepFloors = (this.speed * dt) / this.floorHeight;
            var diff = this.targetFloor - this.position;
            if (Math.abs(diff) <= stepFloors) {
                this.position = this.targetFloor;
                this.currentFloor = Math.round(this.position);
                this.arriveAtFloor();
                this.state = STATE_OPENING;
                this.doorTimer = 0;
            } else {
                this.position += (diff > 0 ? 1 : -1) * stepFloors;
                this.currentFloor = Math.round(this.position);
            }
            return;
        }

        if (this.state === STATE_OPENING) {
            if (this.doorTimer >= this.doorTravel) {
                this.state = STATE_OPEN;
                this.doorTimer = 0;
            }
            return;
        }

        if (this.state === STATE_OPEN) {
            if (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) {
                if (this.doorTimer >= this.minDoorOpen) {
                    this.state = STATE_CLOSING;
                    this.doorTimer = 0;
                }
            } else if (this.doorTimer >= this.maxDoorOpen) {
                this.forceClearPending();
                this.state = STATE_CLOSING;
                this.doorTimer = 0;
            }
            return;
        }

        if (this.state === STATE_CLOSING) {
            if (this.doorTimer >= this.doorTravel) {
                this.state = STATE_IDLE;
                this.doorTimer = 0;
            }
        }
    };

    root.ElevatorLogic = ElevatorLogic;
    root.STATE_IDLE = STATE_IDLE;
    root.STATE_MOVING = STATE_MOVING;
    root.STATE_OPENING = STATE_OPENING;
    root.STATE_OPEN = STATE_OPEN;
    root.STATE_CLOSING = STATE_CLOSING;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);