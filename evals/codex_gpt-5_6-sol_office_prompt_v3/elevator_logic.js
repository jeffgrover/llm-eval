(function (root) {
    "use strict";

    class ElevatorLogic {
        constructor(options) {
            var logicOptions = options || {};
            this.floorCount = logicOptions.floorCount === undefined ? 6 : logicOptions.floorCount;
            this.maxCapacity = logicOptions.maxCapacity === undefined ? 4 : logicOptions.maxCapacity;
            this.floorHeight = logicOptions.floorHeight === undefined ? 3.4 : logicOptions.floorHeight;
            this.MOVE_SPEED = logicOptions.moveSpeed === undefined ? 2.35 : logicOptions.moveSpeed;
            this.DOOR_OPENING_S = 0.72;
            this.DOOR_CLOSING_S = 0.68;
            this.MIN_DOOR_OPEN_S = 1.15;
            this.MAX_DOOR_OPEN_S = 9.0;
            this.interiorSpots = [
                { index: 0, x: -0.62, y: 0.12, z: 0.46 },
                { index: 1, x: 0.62, y: 0.12, z: 0.46 },
                { index: 2, x: -0.62, y: 0.12, z: -0.54 },
                { index: 3, x: 0.62, y: 0.12, z: -0.54 }
            ];
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.positionY = 0;
            this.stateTimer = 0;
            this.doorTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.personSpots = new Map();
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
            this.ignoreCurrentFloorCall = false;
        }

        _validFloor(floor) {
            return Number.isInteger(floor) && floor >= 0 && floor < this.floorCount;
        }

        callUp(floor) {
            if (this._validFloor(floor) && floor < this.floorCount - 1) {
                this.upCalls.add(floor);
            }
        }

        callDown(floor) {
            if (this._validFloor(floor) && floor > 0) {
                this.downCalls.add(floor);
            }
        }

        pressDestination(floor) {
            if (this._validFloor(floor) && floor !== this.currentFloor) {
                this.destinations.add(floor);
            }
        }

        _hasStopInDirection(direction) {
            var floor = this.currentFloor;
            var hasDestination = Array.from(this.destinations).some(function (item) {
                return (item - floor) * direction > 0;
            });
            var calls = direction > 0 ? this.upCalls : this.downCalls;
            var hasMatchingCall = Array.from(calls).some(function (item) {
                return (item - floor) * direction > 0;
            });
            return hasDestination || hasMatchingCall;
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) {
                return false;
            }
            if (this.direction === 0 || this.direction === direction) {
                return true;
            }
            return !this._hasStopInDirection(this.direction);
        }

        currentCapacityFree() {
            return Math.max(0, this.maxCapacity - (this.passengers.size + this.pendingBoarders.size));
        }

        reserveBoardingSpot(person) {
            if (this.pendingBoarders.has(person) || this.passengers.has(person)) {
                var existing = this.personSpots.get(person);
                return existing ? { index: existing.index, x: existing.x, y: existing.y, z: existing.z } : null;
            }
            if (this.currentCapacityFree() <= 0) {
                return null;
            }
            var freeSpot = null;
            for (var spotIndex = 0; spotIndex < this.interiorSpots.length; spotIndex += 1) {
                if (this.spotOccupancy[spotIndex] === null) {
                    freeSpot = this.interiorSpots[spotIndex];
                    break;
                }
            }
            if (!freeSpot) {
                return null;
            }
            this.spotOccupancy[freeSpot.index] = person;
            this.personSpots.set(person, freeSpot);
            this.pendingBoarders.set(person, freeSpot);
            return { index: freeSpot.index, x: freeSpot.x, y: freeSpot.y, z: freeSpot.z };
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) {
                return false;
            }
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
            return true;
        }

        registerDisembark(person) {
            if (!this.passengers.has(person)) {
                return false;
            }
            this.pendingDisembark.add(person);
            return true;
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.pendingBoarders.delete(person);
            this.passengers.delete(person);
            var spot = this.personSpots.get(person);
            if (spot) {
                this.spotOccupancy[spot.index] = null;
                this.personSpots.delete(person);
            }
            return true;
        }

        _allWorkFloors() {
            var combined = new Set();
            this.destinations.forEach(function (floor) { combined.add(floor); });
            this.upCalls.forEach(function (floor) { combined.add(floor); });
            this.downCalls.forEach(function (floor) { combined.add(floor); });
            return Array.from(combined);
        }

        _nearestFloor(floors, fromFloor) {
            if (!floors.length) {
                return null;
            }
            return floors.slice().sort(function (left, right) {
                var leftDistance = Math.abs(left - fromFloor);
                var rightDistance = Math.abs(right - fromFloor);
                return leftDistance === rightDistance ? left - right : leftDistance - rightDistance;
            })[0];
        }

        _nearestAhead(floors, direction) {
            var current = this.positionY / this.floorHeight;
            var ahead = floors.filter(function (floor) {
                return (floor - current) * direction > 0.001;
            });
            if (!ahead.length) {
                return null;
            }
            ahead.sort(function (left, right) {
                return direction > 0 ? left - right : right - left;
            });
            return ahead[0];
        }

        _matchingCalls(direction) {
            return Array.from(direction > 0 ? this.upCalls : this.downCalls);
        }

        _pickPassengerDestination() {
            var destinations = Array.from(this.destinations).filter((floor) => floor !== this.currentFloor);
            if (!destinations.length) {
                return null;
            }
            if (this.direction !== 0) {
                var ahead = this._nearestAhead(destinations, this.direction);
                if (ahead !== null) {
                    return ahead;
                }
            }
            return this._nearestFloor(destinations, this.currentFloor);
        }

        _pickNextTarget() {
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                var riderTarget = this._pickPassengerDestination();
                if (riderTarget !== null) {
                    this.direction = riderTarget > this.currentFloor ? 1 : -1;
                    return riderTarget;
                }
            }

            if (this.direction !== 0) {
                var directionalFloors = Array.from(this.destinations).concat(this._matchingCalls(this.direction));
                var forwardTarget = this._nearestAhead(directionalFloors, this.direction);
                if (forwardTarget !== null) {
                    return forwardTarget;
                }

                var allForwardWork = this._nearestAhead(this._allWorkFloors(), this.direction);
                if (allForwardWork !== null) {
                    return allForwardWork;
                }

                var reverseDirection = -this.direction;
                var reverseFloors = Array.from(this.destinations).concat(this._matchingCalls(reverseDirection));
                var reverseTarget = this._nearestAhead(reverseFloors, reverseDirection);
                if (reverseTarget === null) {
                    reverseTarget = this._nearestAhead(this._allWorkFloors(), reverseDirection);
                }
                if (reverseTarget !== null) {
                    this.direction = reverseDirection;
                    return reverseTarget;
                }
            }

            var allFloors = this._allWorkFloors();
            var awayFloors = allFloors.filter((floor) => floor !== this.currentFloor);
            var nearestAway = this._nearestFloor(awayFloors, this.currentFloor);
            if (nearestAway !== null) {
                this.direction = nearestAway > this.currentFloor ? 1 : -1;
                return nearestAway;
            }

            var hasCurrentCall = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor) || this.destinations.has(this.currentFloor);
            if (hasCurrentCall && !this.ignoreCurrentFloorCall && !this.servedThisDoorCycle) {
                if (this.upCalls.has(this.currentFloor)) {
                    this.direction = 1;
                } else if (this.downCalls.has(this.currentFloor)) {
                    this.direction = -1;
                }
                return this.currentFloor;
            }
            return null;
        }

        _serveArrival() {
            this.destinations.delete(this.currentFloor);
            if (this.direction > 0) {
                this.upCalls.delete(this.currentFloor);
            } else if (this.direction < 0) {
                this.downCalls.delete(this.currentFloor);
            } else {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            if (this.direction === 0 || !this._hasStopInDirection(this.direction)) {
                this.upCalls.delete(this.currentFloor);
                this.downCalls.delete(this.currentFloor);
            }
            this.lastServedFloor = this.currentFloor;
            this.servedThisDoorCycle = true;
            this.ignoreCurrentFloorCall = false;
            this.state = "DOOR_OPENING";
            this.stateTimer = 0;
            this.doorTimer = 0;
            this.targetFloor = this.currentFloor;
        }

        _startNextAfterClose() {
            var hasRiderWork = this.passengers.size > 0 && this.destinations.size > 0;
            this.ignoreCurrentFloorCall = hasRiderWork || (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor));
            var nextTarget = this._pickNextTarget();
            this.targetFloor = nextTarget;
            this.stateTimer = 0;
            if (nextTarget === null) {
                this.state = "IDLE";
                if (!this._allWorkFloors().some((floor) => floor !== this.currentFloor)) {
                    this.direction = 0;
                }
                return;
            }
            if (nextTarget === this.currentFloor) {
                this._serveArrival();
                return;
            }
            this.direction = nextTarget > this.currentFloor ? 1 : -1;
            this.servedThisDoorCycle = false;
            this.ignoreCurrentFloorCall = false;
            this.state = "MOVING";
        }

        _reevaluateMovingTarget() {
            if (this.targetFloor === null || this.direction === 0) {
                return;
            }
            var candidates = Array.from(this.destinations).concat(this._matchingCalls(this.direction));
            var closer = this._nearestAhead(candidates, this.direction);
            if (closer === null) {
                return;
            }
            if (this.direction > 0 && closer < this.targetFloor) {
                this.targetFloor = closer;
            }
            if (this.direction < 0 && closer > this.targetFloor) {
                this.targetFloor = closer;
            }
        }

        tick(dt) {
            var elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
            if (this.state === "IDLE") {
                var idleTarget = this._pickNextTarget();
                if (idleTarget === null) {
                    return;
                }
                this.targetFloor = idleTarget;
                if (idleTarget === this.currentFloor) {
                    this._serveArrival();
                } else {
                    this.direction = idleTarget > this.currentFloor ? 1 : -1;
                    this.state = "MOVING";
                    this.servedThisDoorCycle = false;
                    this.ignoreCurrentFloorCall = false;
                }
                return;
            }

            if (this.state === "MOVING") {
                this._reevaluateMovingTarget();
                var targetY = this.targetFloor * this.floorHeight;
                var deltaY = targetY - this.positionY;
                var travel = this.MOVE_SPEED * elapsed;
                if (Math.abs(deltaY) <= travel || Math.abs(deltaY) < 0.0001) {
                    this.positionY = targetY;
                    this.currentFloor = this.targetFloor;
                    this._serveArrival();
                } else {
                    this.positionY += Math.sign(deltaY) * travel;
                    this.direction = Math.sign(deltaY);
                    this.currentFloor = Math.max(0, Math.min(this.floorCount - 1, Math.round(this.positionY / this.floorHeight)));
                }
                return;
            }

            if (this.state === "DOOR_OPENING") {
                this.stateTimer += elapsed;
                if (this.stateTimer >= this.DOOR_OPENING_S) {
                    this.state = "DOOR_OPEN";
                    this.stateTimer = 0;
                    this.doorTimer = 0;
                }
                return;
            }

            if (this.state === "DOOR_OPEN") {
                this.doorTimer += elapsed;
                var handshakesDone = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                if (this.doorTimer >= this.MAX_DOOR_OPEN_S || (handshakesDone && this.doorTimer >= this.MIN_DOOR_OPEN_S)) {
                    this.state = "DOOR_CLOSING";
                    this.stateTimer = 0;
                }
                return;
            }

            if (this.state === "DOOR_CLOSING") {
                this.stateTimer += elapsed;
                if (this.stateTimer >= this.DOOR_CLOSING_S) {
                    this._startNextAfterClose();
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
