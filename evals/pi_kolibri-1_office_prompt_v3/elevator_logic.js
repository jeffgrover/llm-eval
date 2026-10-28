// elevator_logic.js
// Pure elevator scheduler/state machine

(function(root) {
    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 } = {}) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;
            this.state = "IDLE";
            this.direction = 0; // +1 up, 0 none, -1 down
            this.currentFloor = 0;
            this.targetFloor = 0; // default target floor 0
            this.upCalls = [];
            this.downCalls = [];
            this.destinations = [];
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(4).fill(false);
            this.doorOpenTimer = 0;
            this.MIN_DOOR_OPEN_S = 2;
            this.MAX_DOOR_OPEN_S = 10;
            this.isAcceptingAt = function(floor, direction) {
                if (this.state !== "DOOR_OPEN") return false;
                return this.currentCapacityFree() > 0;
            };
            this.currentCapacityFree = function() {
                return this.maxCapacity - this.passengers.size - this.pendingBoarders.size;
            };
            this.reserveBoardingSpot = function(person) {
                if (this.currentCapacityFree() <= 0) return null;
                for (let i = 0; i < 4; i++) {
                    if (!this.spotOccupancy[i]) {
                        this.spotOccupancy[i] = true;
                        this.pendingBoarders.add(person);
                        return { index: i, x: 0, y: 0, z: 0 };
                    }
                }
                return null;
            };
            this.completeBoard = function(person) {
                this.pendingBoarders.delete(person);
                this.passengers.add(person);
            };
            this.registerDisembark = function(person) {
                this.pendingDisembark.add(person);
            };
            this.completeDisembark = function(person) {
                this.pendingDisembark.delete(person);
                this.passengers.delete(person);
                for (let i = 0; i < 4; i++) {
                    if (this.spotOccupancy[i]) {
                        this.spotOccupancy[i] = false;
                        break;
                    }
                }
            };
            this.tick = function(dt) {
                if (this.state === "IDLE") {
                    this.pickNextTarget();
                    if (this.targetFloor !== -1) {
                        if (this.targetFloor !== this.currentFloor) {
                            this.state = "MOVING";
                        } else {
                            this.state = "DOOR_OPENING";
                        }
                    }
                } else if (this.state === "MOVING") {
                    this.currentFloor += this.direction;
                    if (this.currentFloor === this.targetFloor) {
                        this.state = "DOOR_OPENING";
                    }
                } else if (this.state === "DOOR_OPENING") {
                    this.state = "DOOR_OPEN";
                    this.doorOpenTimer = 0;
                } else if (this.state === "DOOR_OPEN") {
                    this.doorOpenTimer += dt;
                    const doorsShouldClose = (this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0 && this.doorOpenTimer >= this.MIN_DOOR_OPEN_S) || this.doorOpenTimer >= this.MAX_DOOR_OPEN_S;
                    if (doorsShouldClose) {
                        this.state = "DOOR_CLOSING";
                    }
                } else if (this.state === "DOOR_CLOSING") {
                    this.state = "IDLE";
                }
            };
            this.pickNextTarget = function() {
                if (this.destinations.length > 0) {
                    this.targetFloor = this.destinations[0];
                    this.direction = Math.sign(this.targetFloor - this.currentFloor);
                    if (this.direction === 0) this.direction = 0;
                    return;
                }
                let nearestCall = null;
                let minDiff = Infinity;
                for (const call of this.upCalls) {
                    const diff = call - this.currentFloor;
                    if (diff > 0 && diff < minDiff) {
                        minDiff = diff;
                        nearestCall = call;
                        this.direction = 1;
                    }
                }
                for (const call of this.downCalls) {
                    const diff = this.currentFloor - call;
                    if (diff > 0 && diff < minDiff) {
                        minDiff = diff;
                        nearestCall = call;
                        this.direction = -1;
                    }
                }
                if (nearestCall !== null) {
                    this.targetFloor = nearestCall;
                } else {
                    this.targetFloor = -1;
                }
            };
            this.reset = function() {
                this.state = "IDLE";
                this.direction = 0;
                this.currentFloor = 0;
                this.targetFloor = 0;
                this.upCalls = [];
                this.downCalls = [];
                this.destinations = [];
                this.passengers.clear();
                this.pendingBoarders.clear();
                this.pendingDisembark.clear();
                this.spotOccupancy = new Array(4).fill(false);
                this.doorOpenTimer = 0;
            };
        }
        callUp(floor) {
            this.upCalls.push(floor);
        }
        callDown(floor) {
            this.downCalls.push(floor);
        }
        pressDestination(floor) {
            if (!this.destinations.includes(floor)) {
                this.destinations.push(floor);
            }
            this.targetFloor = floor;
        }
        reset() {
            this.upCalls = [];
            this.downCalls = [];
            this.destinations = [];
            this.passengers.clear();
            this.pendingBoarders.clear();
            this.pendingDisembark.clear();
            this.spotOccupancy = new Array(4).fill(false);
            this.doorOpenTimer = 0;
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
        }
    }
    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);