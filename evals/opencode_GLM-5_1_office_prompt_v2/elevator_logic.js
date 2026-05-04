(function(root) {

var IDLE = 'IDLE';
var MOVING = 'MOVING';
var DOOR_OPENING = 'DOOR_OPENING';
var DOOR_OPEN = 'DOOR_OPEN';
var DOOR_CLOSING = 'DOOR_CLOSING';

var DOOR_OPEN_TIME = 0.6;
var DOOR_CLOSE_TIME = 0.6;
var MIN_DOOR_OPEN_S = 3.0;
var MAX_DOOR_OPEN_S = 15.0;
var MOVE_SPEED = 2.0;

class ElevatorLogic {
    constructor(opts) {
        opts = opts || {};
        this.floorCount = opts.floorCount || 6;
        this.maxCapacity = opts.maxCapacity || 4;
        this.floorHeight = opts.floorHeight || 3.4;
        this.reset();
    }

    reset() {
        this.currentFloor = 0;
        this.targetFloor = 0;
        this.y = 0;
        this.direction = 0;
        this.state = IDLE;
        this.upCalls = new Set();
        this.downCalls = new Set();
        this.destinations = new Set();
        this.passengers = new Set();
        this.pendingBoarders = new Set();
        this.pendingDisembark = new Set();
        this.spotOccupancy = [false, false, false, false];
        this._spotPerson = [null, null, null, null];
        this.doorTimer = 0;
        this.doorOpenAmount = 0;
        this.servedThisDoorCycle = false;
        this.lastServedFloor = -1;
    }

    callUp(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.upCalls.add(floor);
    }

    callDown(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.downCalls.add(floor);
    }

    pressDestination(floor) {
        if (floor < 0 || floor >= this.floorCount) return;
        this.destinations.add(floor);
    }

    isAcceptingAt(floor, direction) {
        if (this.state !== DOOR_OPEN) return false;
        if (this.currentFloor !== floor) return false;
        if (this.direction === 0) return true;
        if (direction === this.direction) return true;
        var hasWorkAhead = this._hasWorkInDirection(this.direction, floor);
        if (!hasWorkAhead) return true;
        return false;
    }

    currentCapacityFree() {
        return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
    }

    reserveBoardingSpot(person) {
        if (this.currentCapacityFree() <= 0) return null;
        for (var i = 0; i < 4; i++) {
            if (!this.spotOccupancy[i]) {
                this.spotOccupancy[i] = true;
                this._spotPerson[i] = person;
                this.pendingBoarders.add(person);
                var offsets = [
                    {x: -0.8, z: -0.5},
                    {x: 0.8, z: -0.5},
                    {x: -0.8, z: 0.5},
                    {x: 0.8, z: 0.5}
                ];
                var off = offsets[i];
                return {
                    index: i,
                    x: off.x,
                    y: 0,
                    z: off.z
                };
            }
        }
        return null;
    }

    completeBoard(person) {
        if (this.pendingBoarders.has(person)) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }
    }

    registerDisembark(person) {
        this.pendingDisembark.add(person);
    }

    completeDisembark(person) {
        if (this.pendingDisembark.has(person)) {
            this.pendingDisembark.delete(person);
        }
        if (this.passengers.has(person)) {
            this.passengers.delete(person);
        }
        for (var i = 0; i < 4; i++) {
            if (this._spotPerson[i] === person) {
                this.spotOccupancy[i] = false;
                this._spotPerson[i] = null;
            }
        }
    }

    _hasWorkInDirection(dir, fromFloor) {
        if (dir > 0) {
            for (var f = fromFloor + 1; f < this.floorCount; f++) {
                if (this.upCalls.has(f) || this.downCalls.has(f) || this.destinations.has(f)) return true;
            }
        } else if (dir < 0) {
            for (var f = fromFloor - 1; f >= 0; f--) {
                if (this.upCalls.has(f) || this.downCalls.has(f) || this.destinations.has(f)) return true;
            }
        }
        return false;
    }

    _pickNextTarget() {
        var best = null;
        var bestDist = Infinity;

        if (this.passengers.size > 0 && this.destinations.size > 0) {
            var dir = this.direction || 1;
            for (var f of this.destinations) {
                var d = (f - this.currentFloor) * dir;
                if (d >= 0) {
                    var dist = Math.abs(f - this.currentFloor);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = f;
                    }
                }
            }
            if (best === null) {
                for (var f of this.destinations) {
                    var dist = Math.abs(f - this.currentFloor);
                    if (dist < bestDist) {
                        bestDist = dist;
                        best = f;
                    }
                }
            }
            if (best !== null) {
                this.targetFloor = best;
                this.direction = best > this.currentFloor ? 1 : (best < this.currentFloor ? -1 : this.direction || 1);
                return;
            }
        }

        if (this.direction !== 0) {
            var dir = this.direction;
            for (var f = this.currentFloor + dir; dir > 0 ? f < this.floorCount : f >= 0; f += dir) {
                if (this._hasCallAt(f, dir)) {
                    this.targetFloor = f;
                    this.direction = dir;
                    return;
                }
            }
            for (var f = this.currentFloor - dir; dir > 0 ? f >= 0 : f < this.floorCount; f -= dir) {
                if (this._hasCallAt(f)) {
                    this.targetFloor = f;
                    this.direction = f > this.currentFloor ? 1 : (f < this.currentFloor ? -1 : 0);
                    return;
                }
            }
        }

        for (var f = 0; f < this.floorCount; f++) {
            if (f === this.currentFloor) continue;
            if (this._hasCallAt(f)) {
                var dist = Math.abs(f - this.currentFloor);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = f;
                }
            }
        }
        if (best !== null) {
            this.targetFloor = best;
            this.direction = best > this.currentFloor ? 1 : (best < this.currentFloor ? -1 : 1);
            return;
        }

        this.targetFloor = this.currentFloor;
        this.direction = 0;
        this.state = IDLE;
    }

    _hasCallAt(floor, preferDir) {
        if (this.destinations.has(floor)) return true;
        if (preferDir !== undefined) {
            if (preferDir > 0 && this.upCalls.has(floor)) return true;
            if (preferDir < 0 && this.downCalls.has(floor)) return true;
        }
        if (this.upCalls.has(floor) || this.downCalls.has(floor)) return true;
        return false;
    }

    _clearCallsAtFloor(floor) {
        if (this.direction > 0 || this.direction === 0) {
            this.upCalls.delete(floor);
        }
        if (this.direction < 0 || this.direction === 0) {
            this.downCalls.delete(floor);
        }
        this.destinations.delete(floor);

        if (!this._hasWorkInDirection(this.direction, floor)) {
            this.upCalls.delete(floor);
            this.downCalls.delete(floor);
        }
    }

    tick(dt) {
        switch (this.state) {
            case IDLE:
                this._tickIdle(dt);
                break;
            case MOVING:
                this._tickMoving(dt);
                break;
            case DOOR_OPENING:
                this._tickDoorOpening(dt);
                break;
            case DOOR_OPEN:
                this._tickDoorOpen(dt);
                break;
            case DOOR_CLOSING:
                this._tickDoorClosing(dt);
                break;
        }
    }

    _tickIdle(dt) {
        if (this.upCalls.size > 0 || this.downCalls.size > 0 || this.destinations.size > 0) {
            if (this.direction === 0 && this.passengers.size > 0 && this.destinations.size > 0) {
                this._pickNextTarget();
            } else {
                this._pickNextTarget();
            }
            if (this.targetFloor !== this.currentFloor) {
                this.state = MOVING;
            } else if (this._hasCallAt(this.currentFloor)) {
                this.state = DOOR_OPENING;
                this.doorTimer = 0;
                this.servedThisDoorCycle = false;
            }
        }
    }

    _tickMoving(dt) {
        if (this.direction === 0) {
            this.state = IDLE;
            return;
        }

        var targetY = this.targetFloor * this.floorHeight;
        var dy = (targetY - this.y);
        var moveStep = MOVE_SPEED * dt * this.direction;

        if (Math.abs(dy) < Math.abs(moveStep) + 0.001) {
            this.y = targetY;
            this.currentFloor = this.targetFloor;
            this.state = DOOR_OPENING;
            this.doorTimer = 0;
            this.doorOpenAmount = 0;
            this.servedThisDoorCycle = false;
        } else {
            this.y += moveStep;
            this.currentFloor = Math.round(this.y / this.floorHeight);

            this._recheckTarget();
        }
    }

    _recheckTarget() {
        if (this.direction === 0) return;
        var closestStop = null;
        var closestDist = Infinity;

        for (var f of this.destinations) {
            var d = (f - this.currentFloor) * this.direction;
            if (d > 0 && d < closestDist) {
                closestDist = d;
                closestStop = f;
            }
        }

        var callSet = this.direction > 0 ? this.upCalls : this.downCalls;
        for (var f of callSet) {
            var d = (f - this.currentFloor) * this.direction;
            if (d > 0 && d < closestDist) {
                closestDist = d;
                closestStop = f;
            }
        }

        if (closestStop !== null && closestStop !== this.targetFloor) {
            var currentDist = Math.abs(this.targetFloor - this.currentFloor);
            if (closestDist < currentDist) {
                this.targetFloor = closestStop;
            }
        }
    }

    _tickDoorOpening(dt) {
        this.doorOpenAmount += dt / DOOR_OPEN_TIME;
        if (this.doorOpenAmount >= 1) {
            this.doorOpenAmount = 1;
            this.state = DOOR_OPEN;
            this.doorTimer = 0;
            this._clearCallsAtFloor(this.currentFloor);
        }
    }

    _tickDoorOpen(dt) {
        this.doorTimer += dt;

        if (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0) {
            if (this.doorTimer >= MAX_DOOR_OPEN_S) {
                this.pendingBoarders.clear();
                for (var i = 0; i < 4; i++) this.spotOccupancy[i] = false;
                this.state = DOOR_CLOSING;
                this.servedThisDoorCycle = true;
                this.lastServedFloor = this.currentFloor;
            }
            return;
        }

        if (this.doorTimer < MIN_DOOR_OPEN_S) return;

        if (this.passengers.size > 0 && this.destinations.size > 0) {
            this.state = DOOR_CLOSING;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this._pickNextTarget();
            return;
        }

        var hasBoardersWaiting = false;
        if (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor)) {
            if (!this.servedThisDoorCycle || this.lastServedFloor !== this.currentFloor) {
                hasBoardersWaiting = true;
            }
        }

        if (this.doorTimer >= MAX_DOOR_OPEN_S || !hasBoardersWaiting) {
            this.state = DOOR_CLOSING;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this._pickNextTarget();
        }
    }

    _tickDoorClosing(dt) {
        this.doorOpenAmount -= dt / DOOR_CLOSE_TIME;
        if (this.doorOpenAmount <= 0) {
            this.doorOpenAmount = 0;
            if (this.targetFloor !== this.currentFloor) {
                this.state = MOVING;
            } else if (this._hasCallAt(this.currentFloor)) {
                this.state = DOOR_OPENING;
                this.doorTimer = 0;
                this.servedThisDoorCycle = false;
            } else {
                this._pickNextTarget();
                if (this.targetFloor !== this.currentFloor) {
                    this.state = MOVING;
                } else {
                    this.state = IDLE;
                }
            }
        }
    }
}

ElevatorLogic.IDLE = IDLE;
ElevatorLogic.MOVING = MOVING;
ElevatorLogic.DOOR_OPENING = DOOR_OPENING;
ElevatorLogic.DOOR_OPEN = DOOR_OPEN;
ElevatorLogic.DOOR_CLOSING = DOOR_CLOSING;

root.ElevatorLogic = ElevatorLogic;
if (typeof module !== "undefined" && module.exports) {
    module.exports = { ElevatorLogic };
}

})(typeof window !== "undefined" ? window : globalThis);