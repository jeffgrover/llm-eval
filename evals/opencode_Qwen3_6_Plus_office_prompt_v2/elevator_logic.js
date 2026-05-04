(function(root) {
    const STATE = {
        IDLE: 'IDLE',
        MOVING: 'MOVING',
        DOOR_OPENING: 'DOOR_OPENING',
        DOOR_OPEN: 'DOOR_OPEN',
        DOOR_CLOSING: 'DOOR_CLOSING',
    };

    const MIN_DOOR_OPEN_S = 1.5;
    const MAX_DOOR_OPEN_S = 8.0;
    const DOOR_TRANSITION_S = 0.8;
    const ELEVATOR_SPEED = 2.0;

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.reset();
        }

        reset() {
            this.state = STATE.IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [false, false, false, false];
            this.doorTimer = 0;
            this.doorProgress = 0;
            this.servedThisDoorCycle = new Set();
            this.lastServedFloor = -1;
            this.yPosition = 0;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) {
                this.destinations.add(floor);
            }
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== STATE.DOOR_OPEN) return false;
            if (Math.round(this.currentFloor) !== floor) return false;
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                if (dir === this.direction && this.currentCapacityFree() > 0) return true;
                return false;
            }
            if (dir === this.direction || this.direction === 0) {
                return this.currentCapacityFree() > 0;
            }
            return false;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    var spots = [
                        { x: -0.6, z: -0.5 },
                        { x: 0.6, z: -0.5 },
                        { x: -0.6, z: -1.0 },
                        { x: 0.6, z: -1.0 },
                    ];
                    var spot = spots[i];
                    var y = this.yPosition;
                    return { index: i, x: spot.x, y: y, z: spot.z };
                }
            }
            return null;
        }

        completeBoard(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (var i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = false;
                    break;
                }
            }
        }

        _hasWorkAhead(floor, dir) {
            if (dir > 0) {
                for (var d of this.destinations) { if (d > floor) return true; }
                for (var c of this.upCalls) { if (c > floor) return true; }
                for (var c of this.downCalls) { if (c > floor) return true; }
            } else if (dir < 0) {
                for (var d of this.destinations) { if (d < floor) return true; }
                for (var c of this.downCalls) { if (c < floor) return true; }
                for (var c of this.upCalls) { if (c < floor) return true; }
            }
            return false;
        }

        _findNearestStop(floor, dir) {
            var best = null;
            var bestDist = Infinity;

            for (var d of this.destinations) {
                if (dir > 0 && d > floor && !this.servedThisDoorCycle.has(d)) {
                    var dist = d - floor;
                    if (dist < bestDist) { bestDist = dist; best = d; }
                }
                if (dir < 0 && d < floor && !this.servedThisDoorCycle.has(d)) {
                    var dist2 = floor - d;
                    if (dist2 < bestDist) { bestDist = dist2; best = d; }
                }
            }

            for (var c of this.upCalls) {
                if (dir > 0 && c > floor && !this.servedThisDoorCycle.has(c)) {
                    var dist3 = c - floor;
                    if (dist3 < bestDist) { bestDist = dist3; best = c; }
                }
            }
            for (var c of this.downCalls) {
                if (dir < 0 && c < floor && !this.servedThisDoorCycle.has(c)) {
                    var dist4 = floor - c;
                    if (dist4 < bestDist) { bestDist = dist4; best = c; }
                }
            }

            return best;
        }

        _findNextTarget() {
            var floor = Math.round(this.currentFloor);
            var dir = this.direction;
            var hasPassengerDest = this.passengers.size > 0 && this.destinations.size > 0;

            if (dir !== 0) {
                var best = this._findNearestStop(floor, dir);
                if (best !== null) return { floor: best, direction: dir };

                var revDir = -dir;
                best = this._findNearestStop(floor, revDir);
                if (best !== null) return { floor: best, direction: revDir };
            }

            var best = null;
            var bestDist = Infinity;
            var bestDir = 0;

            for (var d of this.destinations) {
                if (d === floor) continue;
                var dist = Math.abs(d - floor);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = d;
                    bestDir = d > floor ? 1 : (d < floor ? -1 : 0);
                }
            }

            if (!hasPassengerDest) {
                for (var c of this.upCalls) {
                    var dist2 = Math.abs(c - floor);
                    if (dist2 < bestDist) {
                        bestDist = dist2;
                        best = c;
                        bestDir = c > floor ? 1 : (c < floor ? -1 : 0);
                    }
                }
                for (var c of this.downCalls) {
                    var dist3 = Math.abs(c - floor);
                    if (dist3 < bestDist) {
                        bestDist = dist3;
                        best = c;
                        bestDir = c > floor ? 1 : (c < floor ? -1 : 0);
                    }
                }
            }

            if (best !== null) return { floor: best, direction: bestDir };
            return null;
        }

        _reEvaluateTargetWhileMoving() {
            if (this.state !== STATE.MOVING) return;
            var floor = Math.round(this.currentFloor);
            var dir = this.direction;
            if (dir === 0) return;

            var best = null;
            var bestDist = Infinity;

            for (var d of this.destinations) {
                if (dir > 0 && d > floor && d < this.targetFloor) {
                    var dist = d - floor;
                    if (dist < bestDist) { bestDist = dist; best = d; }
                }
                if (dir < 0 && d < floor && d > this.targetFloor) {
                    var dist = floor - d;
                    if (dist < bestDist) { bestDist = dist; best = d; }
                }
            }

            for (var c of this.upCalls) {
                if (dir > 0 && c > floor && c < this.targetFloor) {
                    var dist = c - floor;
                    if (dist < bestDist) { bestDist = dist; best = c; }
                }
            }
            for (var c of this.downCalls) {
                if (dir < 0 && c < floor && c > this.targetFloor) {
                    var dist = floor - c;
                    if (dist < bestDist) { bestDist = dist; best = c; }
                }
            }

            if (best !== null) {
                this.targetFloor = best;
            }
        }

        _arriveAtFloor() {
            var floor = Math.round(this.currentFloor);
            this.destinations.delete(floor);
            if (this.direction > 0) {
                this.upCalls.delete(floor);
            } else if (this.direction < 0) {
                this.downCalls.delete(floor);
            }

            var hasWorkAhead = this._hasWorkAhead(floor, this.direction);
            if (!hasWorkAhead) {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }

            this.lastServedFloor = floor;
            this.servedThisDoorCycle.add(floor);
            this.state = STATE.DOOR_OPENING;
            this.doorTimer = 0;
        }

        tick(dt) {
            this.yPosition = this.currentFloor * this.floorHeight;

            switch (this.state) {
                case STATE.IDLE: {
                    this.doorProgress = 0;
                    var next = this._findNextTarget();
                    if (next) {
                        this.targetFloor = next.floor;
                        this.direction = next.direction;
                        if (Math.round(this.currentFloor) === next.floor) {
                            this._arriveAtFloor();
                        } else {
                            this.state = STATE.MOVING;
                            this.servedThisDoorCycle.clear();
                        }
                    }
                    break;
                }

                case STATE.MOVING: {
                    this.doorProgress = 0;
                    this._reEvaluateTargetWhileMoving();

                    var dir = this.direction;
                    var speed = ELEVATOR_SPEED / this.floorHeight;
                    this.currentFloor += dir * speed * dt;

                    var target = this.targetFloor;
                    var floor = this.currentFloor;
                    var arrived = false;
                    if (dir > 0 && floor >= target) {
                        this.currentFloor = target;
                        arrived = true;
                    } else if (dir < 0 && floor <= target) {
                        this.currentFloor = target;
                        arrived = true;
                    }

                    if (arrived) {
                        this._arriveAtFloor();
                    }
                    break;
                }

                case STATE.DOOR_OPENING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.min(1, this.doorTimer / DOOR_TRANSITION_S);
                    if (this.doorProgress >= 1) {
                        this.state = STATE.DOOR_OPEN;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case STATE.DOOR_OPEN: {
                    this.doorProgress = 1;
                    this.doorTimer += dt;

                    var canClose = (
                        this.pendingBoarders.size === 0 &&
                        this.pendingDisembark.size === 0 &&
                        this.doorTimer >= MIN_DOOR_OPEN_S
                    );
                    var forceClose = this.doorTimer >= MAX_DOOR_OPEN_S;

                    if (canClose || forceClose) {
                        this.state = STATE.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case STATE.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.max(0, 1 - this.doorTimer / DOOR_TRANSITION_S);

                    if (this.doorProgress <= 0) {
                        var floor = Math.round(this.currentFloor);
                        var hasPassengerDest = this.passengers.size > 0 && this.destinations.size > 0;
                        var shouldReopen = false;

                        if (!hasPassengerDest) {
                            if (this.upCalls.has(floor) || this.downCalls.has(floor)) {
                                shouldReopen = true;
                            }
                        }

                        if (this.pendingBoarders.size > 0) {
                            shouldReopen = true;
                        }

                        if (shouldReopen && !this.servedThisDoorCycle.has(floor)) {
                            this.state = STATE.DOOR_OPENING;
                            this.doorTimer = 0;
                            this.doorProgress = 0;
                        } else {
                            this.servedThisDoorCycle.clear();
                            var next = this._findNextTarget();
                            if (next) {
                                this.targetFloor = next.floor;
                                this.direction = next.direction;
                                this.state = STATE.MOVING;
                            } else {
                                this.direction = 0;
                                this.state = STATE.IDLE;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
