(function elevatorLogicModule(root) {
    class ElevatorLogic {
        constructor(options) {
            var settings = options || {};
            this.floorCount = settings.floorCount || 6;
            this.maxCapacity = settings.maxCapacity || 4;
            this.floorHeight = settings.floorHeight || 3.4;
            this.MIN_DOOR_OPEN_S = 0.8;
            this.MAX_DOOR_OPEN_S = 4.0;
            this.DOOR_OPENING_S = 0.25;
            this.DOOR_CLOSING_S = 0.25;
            this.FLOOR_TRAVEL_S = 0.72;
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.positionFloor = 0;
            this.targetFloor = null;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(this.maxCapacity).fill(null);
            this.spotByPerson = new Map();
            this.doorTimer = 0;
            this.doorOpenFraction = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
            this._skipSameFloorUntilMove = false;
            this._lastTickState = "IDLE";
        }

        _validFloor(floor) {
            return Number.isInteger(floor) && floor >= 0 && floor < this.floorCount;
        }

        callUp(floor) {
            if (!this._validFloor(floor)) return false;
            this.upCalls.add(floor);
            if (this.state === "IDLE" && floor === this.currentFloor) this._skipSameFloorUntilMove = false;
            return true;
        }

        callDown(floor) {
            if (!this._validFloor(floor)) return false;
            this.downCalls.add(floor);
            if (this.state === "IDLE" && floor === this.currentFloor) this._skipSameFloorUntilMove = false;
            return true;
        }

        pressDestination(floor) {
            if (!this._validFloor(floor)) return false;
            this.destinations.add(floor);
            return true;
        }

        currentCapacityFree() {
            return Math.max(0, this.maxCapacity - this.passengers.size - this.pendingBoarders.size);
        }

        _hasStopsAhead(direction, fromFloor, includeSame) {
            var destinationValues = Array.from(this.destinations);
            for (var destinationIndex = 0; destinationIndex < destinationValues.length; destinationIndex += 1) {
                var destination = destinationValues[destinationIndex];
                if ((direction > 0 && (destination > fromFloor || (includeSame && destination === fromFloor))) ||
                    (direction < 0 && (destination < fromFloor || (includeSame && destination === fromFloor)))) return true;
            }
            var calls = direction > 0 ? this.upCalls : this.downCalls;
            var callValues = Array.from(calls);
            for (var callIndex = 0; callIndex < callValues.length; callIndex += 1) {
                var callFloor = callValues[callIndex];
                if ((direction > 0 && (callFloor > fromFloor || (includeSame && callFloor === fromFloor))) ||
                    (direction < 0 && (callFloor < fromFloor || (includeSame && callFloor === fromFloor)))) return true;
            }
            return false;
        }

        _nearestDestination(fromFloor, direction, includeSame) {
            var values = Array.from(this.destinations);
            var best = null;
            var bestDistance = Infinity;
            for (var valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
                var floor = values[valueIndex];
                var valid = direction === 0 || (direction > 0 ? floor > fromFloor : floor < fromFloor);
                if (includeSame && floor === fromFloor) valid = true;
                if (!valid) continue;
                var distance = Math.abs(floor - fromFloor);
                if (distance < bestDistance) {
                    best = floor;
                    bestDistance = distance;
                }
            }
            return best;
        }

        _nearestHallCall(fromFloor, direction, includeSame, allDirections) {
            var candidates = [];
            var upValues = Array.from(this.upCalls);
            var downValues = Array.from(this.downCalls);
            for (var upIndex = 0; upIndex < upValues.length; upIndex += 1) {
                candidates.push({ floor: upValues[upIndex], direction: 1 });
            }
            for (var downIndex = 0; downIndex < downValues.length; downIndex += 1) {
                candidates.push({ floor: downValues[downIndex], direction: -1 });
            }
            var best = null;
            var bestDistance = Infinity;
            for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
                var candidate = candidates[candidateIndex];
                var floor = candidate.floor;
                var validDirection = allDirections || direction === 0 || candidate.direction === direction;
                var validPosition = direction === 0 || (direction > 0 ? floor > fromFloor : floor < fromFloor);
                if (includeSame && floor === fromFloor) validPosition = true;
                if (!validDirection || !validPosition) continue;
                var distance = Math.abs(floor - fromFloor);
                if (distance < bestDistance) {
                    best = candidate;
                    bestDistance = distance;
                }
            }
            return best;
        }

        _sameFloorCallDirection(floor) {
            if (this.upCalls.has(floor)) return 1;
            if (this.downCalls.has(floor)) return -1;
            return this.direction || 1;
        }

        _chooseNextTarget() {
            var fromFloor = this.currentFloor;
            var hasPassengerDestination = this.passengers.size > 0 && this.destinations.size > 0;
            var allowSame = !this._skipSameFloorUntilMove && !hasPassengerDestination && this.currentCapacityFree() > 0;
            var direction = this.direction;
            var candidate = null;

            if (direction !== 0) {
                candidate = this._nearestDestination(fromFloor, direction, false);
                var matchingCall = this._nearestHallCall(fromFloor, direction, false, false);
                if (candidate === null || (matchingCall && Math.abs(matchingCall.floor - fromFloor) < Math.abs(candidate - fromFloor))) {
                    candidate = matchingCall ? matchingCall.floor : candidate;
                }
                if (candidate !== null) return candidate;

                var behindDestination = this._nearestDestination(fromFloor, -direction, false);
                var behindCall = this._nearestHallCall(fromFloor, -direction, false, true);
                if (behindDestination === null || (behindCall && Math.abs(behindCall.floor - fromFloor) < Math.abs(behindDestination - fromFloor))) {
                    candidate = behindCall ? behindCall.floor : behindDestination;
                } else {
                    candidate = behindDestination;
                }
                if (candidate !== null) return candidate;
            }

            if (hasPassengerDestination) {
                candidate = this._nearestDestination(fromFloor, direction || 0, false);
                if (candidate === null) candidate = this._nearestDestination(fromFloor, 0, false);
                if (candidate !== null) return candidate;
            }

            if (direction === 0) {
                candidate = this._nearestDestination(fromFloor, 0, false);
                var anyCall = this._nearestHallCall(fromFloor, 0, false, true);
                if (candidate === null || (anyCall && Math.abs(anyCall.floor - fromFloor) < Math.abs(candidate - fromFloor))) {
                    candidate = anyCall ? anyCall.floor : candidate;
                }
                if (candidate !== null) return candidate;
            }

            if (allowSame) {
                if (this.destinations.has(fromFloor)) return fromFloor;
                if (this.upCalls.has(fromFloor) || this.downCalls.has(fromFloor)) return fromFloor;
            }
            return null;
        }

        _setTarget(floor) {
            if (floor === null || floor === undefined) {
                this.targetFloor = null;
                return;
            }
            this.targetFloor = floor;
            if (floor > this.currentFloor) this.direction = 1;
            else if (floor < this.currentFloor) this.direction = -1;
            else if (this.direction === 0) this.direction = this._sameFloorCallDirection(floor);
        }

        _clearArrivalStops() {
            var floor = this.currentFloor;
            this.destinations.delete(floor);
            if (this.direction > 0) this.upCalls.delete(floor);
            else if (this.direction < 0) this.downCalls.delete(floor);
            if (this.direction === 0 || !this._hasStopsAhead(this.direction, floor, false)) {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
        }

        _beginDoorOpening() {
            this.state = "DOOR_OPENING";
            this.doorTimer = 0;
            this.doorOpenFraction = 0;
            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
            this._skipSameFloorUntilMove = true;
            this._clearArrivalStops();
        }

        _startNextAfterClose() {
            var nextFloor = this._chooseNextTarget();
            if (nextFloor === null) {
                this.state = "IDLE";
                this.targetFloor = null;
                this.direction = 0;
                return;
            }
            this._setTarget(nextFloor);
            if (nextFloor === this.currentFloor) this._beginDoorOpening();
            else {
                this._skipSameFloorUntilMove = false;
                this.state = "MOVING";
            }
        }

        _reconsiderMovingTarget() {
            if (this.state !== "MOVING" || this.direction === 0) return;
            var position = this.positionFloor;
            var candidates = [];
            var destinations = Array.from(this.destinations);
            for (var destinationIndex = 0; destinationIndex < destinations.length; destinationIndex += 1) {
                var destination = destinations[destinationIndex];
                if ((this.direction > 0 && destination > position + 0.001) || (this.direction < 0 && destination < position - 0.001)) candidates.push(destination);
            }
            var calls = this.direction > 0 ? Array.from(this.upCalls) : Array.from(this.downCalls);
            for (var callIndex = 0; callIndex < calls.length; callIndex += 1) {
                var callFloor = calls[callIndex];
                if ((this.direction > 0 && callFloor > position + 0.001) || (this.direction < 0 && callFloor < position - 0.001)) candidates.push(callFloor);
            }
            if (!candidates.length) return;
            var closest = candidates[0];
            var closestDistance = Math.abs(closest - position);
            for (var candidateIndex = 1; candidateIndex < candidates.length; candidateIndex += 1) {
                var distance = Math.abs(candidates[candidateIndex] - position);
                if (distance < closestDistance) {
                    closest = candidates[candidateIndex];
                    closestDistance = distance;
                }
            }
            if (this.targetFloor === null || closestDistance < Math.abs(this.targetFloor - position) - 0.001) this.targetFloor = closest;
        }

        isAcceptingAt(floor, callerDirection) {
            if (!this._validFloor(floor) || this.currentFloor !== floor || this.state !== "DOOR_OPEN") return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction === 0) return true;
            var pendingAhead = this._hasStopsAhead(this.direction, floor, false);
            return !pendingAhead || callerDirection === this.direction;
        }

        reserveBoardingSpot(person) {
            if (!person || this.passengers.has(person)) return this.spotByPerson.get(person) || null;
            if (this.pendingBoarders.has(person)) return this.spotByPerson.get(person) || null;
            if (this.currentCapacityFree() <= 0) return null;
            var spotIndex = -1;
            for (var occupancyIndex = 0; occupancyIndex < this.spotOccupancy.length; occupancyIndex += 1) {
                if (!this.spotOccupancy[occupancyIndex]) {
                    spotIndex = occupancyIndex;
                    break;
                }
            }
            if (spotIndex < 0) return null;
            var spots = [
                { x: -0.65, y: 0.06, z: 0.05 }, { x: 0.65, y: 0.06, z: 0.05 },
                { x: -0.65, y: 0.06, z: -0.62 }, { x: 0.65, y: 0.06, z: -0.62 },
            ];
            var spot = { index: spotIndex, x: spots[spotIndex].x, y: spots[spotIndex].y, z: spots[spotIndex].z };
            this.spotOccupancy[spotIndex] = person;
            this.spotByPerson.set(person, spot);
            this.pendingBoarders.add(person);
            return { index: spot.index, x: spot.x, y: spot.y, z: spot.z };
        }

        cancelBoarding(person) {
            if (!this.pendingBoarders.has(person)) return false;
            this.pendingBoarders.delete(person);
            this._releaseSpot(person);
            return true;
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return false;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
            return true;
        }

        registerDisembark(person) {
            if (!this.passengers.has(person)) return false;
            this.pendingDisembark.add(person);
            return true;
        }

        completeDisembark(person) {
            if (!this.pendingDisembark.has(person)) return false;
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this._releaseSpot(person);
            return true;
        }

        cancelDisembark(person) {
            return this.pendingDisembark.delete(person);
        }

        _releaseSpot(person) {
            var spot = this.spotByPerson.get(person);
            if (spot) this.spotOccupancy[spot.index] = null;
            this.spotByPerson.delete(person);
        }

        _forceReleasePending() {
            var pendingBoarders = Array.from(this.pendingBoarders);
            for (var boarderIndex = 0; boarderIndex < pendingBoarders.length; boarderIndex += 1) this.cancelBoarding(pendingBoarders[boarderIndex]);
            this.pendingDisembark.clear();
        }

        tick(dt) {
            var delta = Math.max(0, Number(dt) || 0);
            this._lastTickState = this.state;
            if (this.state === "IDLE") {
                var idleTarget = this._chooseNextTarget();
                if (idleTarget !== null) {
                    this._setTarget(idleTarget);
                    if (idleTarget === this.currentFloor) this._beginDoorOpening();
                    else {
                        this._skipSameFloorUntilMove = false;
                        this.state = "MOVING";
                    }
                }
                return;
            }
            if (this.state === "MOVING") {
                this._reconsiderMovingTarget();
                if (this.targetFloor === null) {
                    this.state = "IDLE";
                    this.direction = 0;
                    return;
                }
                var distance = Math.abs(this.targetFloor - this.positionFloor);
                var travel = delta / this.FLOOR_TRAVEL_S;
                if (travel >= distance) {
                    this.positionFloor = this.targetFloor;
                    this.currentFloor = this.targetFloor;
                    this._beginDoorOpening();
                } else {
                    this.positionFloor += this.direction * travel;
                    this.currentFloor = Math.max(0, Math.min(this.floorCount - 1, Math.round(this.positionFloor)));
                }
                return;
            }
            if (this.state === "DOOR_OPENING") {
                this.doorTimer += delta;
                this.doorOpenFraction = Math.min(1, this.doorTimer / this.DOOR_OPENING_S);
                if (this.doorTimer >= this.DOOR_OPENING_S) {
                    this.state = "DOOR_OPEN";
                    this.doorTimer = 0;
                    this.doorOpenFraction = 1;
                }
                return;
            }
            if (this.state === "DOOR_OPEN") {
                this.doorTimer += delta;
                var pending = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                    this._forceReleasePending();
                    this.state = "DOOR_CLOSING";
                    this.doorTimer = 0;
                } else if (!pending && this.doorTimer >= this.MIN_DOOR_OPEN_S) {
                    this.state = "DOOR_CLOSING";
                    this.doorTimer = 0;
                }
                return;
            }
            if (this.state === "DOOR_CLOSING") {
                this.doorTimer += delta;
                this.doorOpenFraction = Math.max(0, 1 - this.doorTimer / this.DOOR_CLOSING_S);
                if (this.doorTimer >= this.DOOR_CLOSING_S) {
                    this.doorTimer = 0;
                    this.doorOpenFraction = 0;
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
