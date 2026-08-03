(function(root) {
    var ElevatorLogic = (function() {
        var STATES = {
            IDLE: 'IDLE',
            MOVING: 'MOVING',
            DOOR_OPENING: 'DOOR_OPENING',
            DOOR_OPEN: 'DOOR_OPEN',
            DOOR_CLOSING: 'DOOR_CLOSING'
        };

        function ElevatorLogic(options) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.minDoorOpenS = options.minDoorOpenS || 0.01;
            this.maxDoorOpenS = options.maxDoorOpenS || 8.0;
            this.moveSpeed = options.moveSpeed || 1.0;

            this.reset();
        }

        ElevatorLogic.prototype.reset = function() {
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // -1, 0, +1
            this.state = STATES.IDLE;
            this.upCalls = [];
            this.downCalls = [];
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
            this.targetFromAll = false;
            this.upCallMap = new Map();
            this.downCallMap = new Map();

            // Door timers
            this.doorOpenTimer = 0;
            this.doorCloseTimer = 0;

            // Spot occupancy (4 interior spots)
            this.spotOccupancy = [null, null, null, null];
            this.currentPassengerCount = 0;

            // Just entered DOOR_CLOSING flag
            this.justEnteredClosing = false;
        };

        ElevatorLogic.prototype.callUp = function(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.removeDownCall(floor);
            if (!this.upCallMap.has(floor)) {
                this.upCallMap.set(floor, floor);
                this.upCalls.push(floor);
            }
        };

        ElevatorLogic.prototype.callDown = function(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.removeUpCall(floor);
            if (!this.downCallMap.has(floor)) {
                this.downCallMap.set(floor, floor);
                this.downCalls.push(floor);
            }
        };

        ElevatorLogic.prototype.removeUpCall = function(floor) {
            var idx = this.upCalls.indexOf(floor);
            if (idx > -1) {
                this.upCalls.splice(idx, 1);
                this.upCallMap.delete(floor);
            }
        };

        ElevatorLogic.prototype.removeDownCall = function(floor) {
            var idx = this.downCalls.indexOf(floor);
            if (idx > -1) {
                this.downCalls.splice(idx, 1);
                this.downCallMap.delete(floor);
            }
        };

        ElevatorLogic.prototype.pressDestination = function(floor) {
            if (floor < 0 || floor >= this.floorCount) return;
            this.destinations.add(floor);
        };

        ElevatorLogic.prototype.isAcceptingAt = function(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.direction !== 0) {
                var inDirection = this._hasStopsInDirection(this.direction);
                if (inDirection && direction !== this.direction) {
                    return false;
                }
            }
            return true;
        };

        ElevatorLogic.prototype.currentCapacityFree = function() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        };

        ElevatorLogic.prototype.reserveBoardingSpot = function(person) {
            var free = this.currentCapacityFree();
            if (free <= 0) return null;
            for (var i = 0; i < 4; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    return { index: i, x: 0, y: 0, z: 0 };
                }
            }
            return null;
        };

        ElevatorLogic.prototype.completeBoard = function(person) {
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
            for (var i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
            this.currentPassengerCount = this.passengers.size + this.pendingBoarders.size;
        };

        ElevatorLogic.prototype.registerDisembark = function(person) {
            this.pendingDisembark.add(person);
        };

        ElevatorLogic.prototype.completeDisembark = function(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (var i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                    break;
                }
            }
            this.currentPassengerCount = this.passengers.size + this.pendingBoarders.size;
        };

        ElevatorLogic.prototype.tick = function(dt) {
            this.doorOpenTimer += dt;
            this.doorCloseTimer += dt;

            // State machine transitions
            var me = this;

            // Clear destinations for current floor when arrived
            if (this.state === STATES.MOVING || this.state === STATES.IDLE) {
                if (this.currentFloor === this.targetFloor) {
                    // Arrived at target
                    this._clearDestinationsForFloor(this.currentFloor);
                    var calls = this.upCalls.slice();
                    calls.push.apply(calls, this.downCalls.slice());
                    if (calls.indexOf(this.currentFloor) >= 0) {
                        this.state = STATES.DOOR_OPENING;
                        this.doorOpenTimer = 0;
                    } else {
                        this.state = STATES.IDLE;
                        this.targetFloor = this.currentFloor;
                    }
                }
            }

            if (this.state === STATES.DOOR_OPENING) {
                this.state = STATES.DOOR_OPEN;
                this.doorOpenTimer = 0;
            }

            if (this.state === STATES.DOOR_OPEN) {
                // Doors stay open while pendingBoarders or pendingDisembark non-empty, or min time elapsed
                var minTimePassed = this.doorOpenTimer >= this.minDoorOpenS;
                var pending = this.pendingBoarders.size + this.pendingDisembark.size;
                if (minTimePassed && pending === 0) {
                    this.state = STATES.DOOR_CLOSING;
                    this.doorCloseTimer = 0;
                    this.justEnteredClosing = true;
                    // Pick next target immediately so targetFloor is updated
                    this._pickNextTarget();
                } else if (this.doorOpenTimer >= this.maxDoorOpenS) {
                    // Safety cap
                    this.state = STATES.DOOR_CLOSING;
                    this.doorCloseTimer = 0;
                    this.justEnteredClosing = true;
                    // Pick next target immediately
                    this._pickNextTarget();
                }
            }

            if (this.state === STATES.DOOR_CLOSING) {
                if (this.justEnteredClosing) {
                    // First tick in DOOR_CLOSING: stay open for this tick, then transition on next tick
                    this.justEnteredClosing = false;
                    // Stay DOOR_CLOSING; will transition to IDLE/MOVING in next tick
                } else {
                    this.state = STATES.IDLE;
                    this.doorCloseTimer = 0;
                    // Pick next target
                    this._pickNextTarget();
                    if (this.targetFloor !== this.currentFloor) {
                        this.state = STATES.MOVING;
                    } else {
                        this.state = STATES.IDLE;
                        this.direction = 0;
                    }
                }
            }

            if (this.state === STATES.MOVING) {
                this._updateMovingTarget();
            }

            return this;
        };

        ElevatorLogic.prototype._hasStopsInDirection = function(dir) {
            var me = this;
            var hasDest = false;
            this.destinations.forEach(function(f) {
                if (dir === 1 && f > me.currentFloor) hasDest = true;
                if (dir === -1 && f < me.currentFloor) hasDest = true;
            });
            var hasCalls = false;
            if (dir === 1) {
                for (var i = 0; i < me.upCalls.length; i++) {
                    if (me.upCalls[i] > me.currentFloor) hasCalls = true;
                }
            } else {
                for (var i = 0; i < me.downCalls.length; i++) {
                    if (me.downCalls[i] < me.currentFloor) hasCalls = true;
                }
            }
            return hasDest || hasCalls;
        };

        ElevatorLogic.prototype._pickNextTarget = function() {
            var me = this;
            var candidates = [];
            this.destinations.forEach(function(f) {
                candidates.push({ floor: f, type: 'destination' });
            });
            this.upCalls.forEach(function(f) {
                candidates.push({ floor: f, type: 'up' });
            });
            this.downCalls.forEach(function(f) {
                candidates.push({ floor: f, type: 'down' });
            });

            // If passengers exist, prefer passenger destinations
            if (me.passengers.size > 0) {
                var passengerDest = Array.from(me.destinations);
                if (passengerDest.length > 0) {
                    // Choose nearest passenger destination in current direction if possible
                    var best = null;
                    var bestDist = Infinity;
                    var searchDir = me.direction !== 0 ? me.direction : 1;
                    // If no direction, pick nearest overall
                    for (var i = 0; i < passengerDest.length; i++) {
                        var d = Math.abs(passengerDest[i] - me.currentFloor);
                        if (d < bestDist) {
                            bestDist = d;
                            best = passengerDest[i];
                        }
                    }
                    if (best !== null) {
                        me.targetFloor = best;
                        me.direction = best > me.currentFloor ? 1 : -1;
                        // Clear destinations for this floor when arrived
                        return;
                    }
                }
            }

            // Otherwise, use normal SCAN algorithm
            var best = null;
            var bestDist = Infinity;
            if (candidates.length === 0) {
                me.targetFloor = me.currentFloor;
                me.direction = 0;
                return;
            }
            // Simple nearest neighbor
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                var d = Math.abs(c.floor - me.currentFloor);
                if (d < bestDist) {
                    bestDist = d;
                    best = c.floor;
                }
            }
            if (best !== null) {
                me.targetFloor = best;
                me.direction = best > me.currentFloor ? 1 : -1;
            }
        };

        ElevatorLogic.prototype._updateMovingTarget = function() {
            var me = this;
            var newTarget = null;
            var bestDist = Infinity;

            var candidates = [];
            this.destinations.forEach(function(f) {
                candidates.push({ floor: f, type: 'destination' });
            });
            this.upCalls.forEach(function(f) {
                candidates.push({ floor: f, type: 'up' });
            });
            this.downCalls.forEach(function(f) {
                candidates.push({ floor: f, type: 'down' });
            });

            if (this.direction === 1) {
                for (var i = 0; i < candidates.length; i++) {
                    var c = candidates[i];
                    if (c.floor > this.currentFloor && c.floor <= this.targetFloor) {
                        var dist = c.floor - this.currentFloor;
                        if (dist < bestDist) {
                            bestDist = dist;
                            newTarget = c.floor;
                        }
                    }
                }
            } else if (this.direction === -1) {
                for (var i = 0; i < candidates.length; i++) {
                    var c = candidates[i];
                    if (c.floor < this.currentFloor && c.floor >= this.targetFloor) {
                        var dist = this.currentFloor - c.floor;
                        if (dist < bestDist) {
                            bestDist = dist;
                            newTarget = c.floor;
                        }
                    }
                }
            }

            if (newTarget !== null) {
                this.targetFloor = newTarget;
                this._updateDirectionForTarget();
            }
        };

        ElevatorLogic.prototype._updateDirectionForTarget = function() {
            if (this.targetFloor > this.currentFloor) {
                this.direction = 1;
            } else if (this.targetFloor < this.currentFloor) {
                this.direction = -1;
            } else {
                this.direction = 0;
            }
        };

        ElevatorLogic.prototype._clearDestinationsForFloor = function(floor) {
            var me = this;
            this.destinations.forEach(function(f) {
                if (f === floor) {
                    me.destinations.delete(f);
                }
            });
            // Also clear same-floor hall calls when arriving
            me.removeUpCall(floor);
            me.removeDownCall(floor);
            // If car is full or has passenger destinations, do not reopen at same floor
            if (me.passengers.size > 0 || me.destinations.size > 0) {
                me.servedThisDoorCycle = true;
            }
        };

        // Expose for debugging/management
        ElevatorLogic.prototype.getState = function() {
            return this.state;
        };
        ElevatorLogic.prototype.getDirection = function() {
            return this.direction;
        };
        ElevatorLogic.prototype.getCurrentFloor = function() {
            return this.currentFloor;
        };
        ElevatorLogic.prototype.getTargetFloor = function() {
            return this.targetFloor;
        };
        ElevatorLogic.prototype.getUpCalls = function() {
            return this.upCalls.slice();
        };
        ElevatorLogic.prototype.getDownCalls = function() {
            return this.downCalls.slice();
        };
        ElevatorLogic.prototype.getDestinations = function() {
            return Array.from(this.destinations);
        };
        ElevatorLogic.prototype.getPassengers = function() {
            return Array.from(this.passengers);
        };
        ElevatorLogic.prototype.getPendingBoarders = function() {
            return Array.from(this.pendingBoarders);
        };
        ElevatorLogic.prototype.getPendingDisembark = function() {
            return Array.from(this.pendingDisembark);
        };

        root.ElevatorLogic = ElevatorLogic;

        if (typeof module !== "undefined" && module.exports) {
            module.exports = { ElevatorLogic: ElevatorLogic };
        }

        return ElevatorLogic;
    })();

    (typeof window !== "undefined" ? window : globalThis).ElevatorLogic = ElevatorLogic;
})(typeof window !== "undefined" ? window : globalThis);
