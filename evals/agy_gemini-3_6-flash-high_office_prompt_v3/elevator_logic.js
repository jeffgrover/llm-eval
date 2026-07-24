(function(root) {
    class ElevatorLogic {
        constructor(options) {
            const opts = options || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;

            this.MIN_DOOR_OPEN_S = 2.0;
            this.MAX_DOOR_OPEN_S = 8.0;
            this.DOOR_ANIM_S = 1.0;
            this.MOVE_SPEED = (this.floorHeight / 1.5); // ~1.5 sec per floor

            this.reset();
        }

        reset() {
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // 1: UP, -1: DOWN, 0: IDLE
            this.currentY = 0.0;
            this.state = 'IDLE'; // IDLE, MOVING, DOOR_OPENING, DOOR_OPEN, DOOR_CLOSING

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();

            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.spotOccupancy = [null, null, null, null];
            this.doorProgress = 0.0; // 0 = closed, 1 = open
            this.doorTimer = 0.0;
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

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        isAcceptingAt(floor, direction) {
            if (this.currentFloor !== floor || this.state !== 'DOOR_OPEN') return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction === 0) return true;
            if (this.direction === direction) return true;
            // If no more stops in current direction, accepts opposite direction callers
            if (!this.hasStopsInDirection(this.direction)) return true;
            return false;
        }

        hasStopsInDirection(dir) {
            if (dir > 0) {
                for (let f = this.currentFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            } else if (dir < 0) {
                for (let f = this.currentFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            }
            return false;
        }

        hasStops() {
            return (this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let emptyIdx = -1;
            for (let i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === null) {
                    emptyIdx = i;
                    break;
                }
            }
            if (emptyIdx === -1) return null;

            this.spotOccupancy[emptyIdx] = person;
            this.pendingBoarders.add(person);

            // Spot offsets inside 3x3 car (centered at 0,0, entrance at +Z = 1.5)
            const offsets = [
                { x: -0.6, z: -0.6 },
                { x: 0.6, z: -0.6 },
                { x: -0.6, z: 0.6 },
                { x: 0.6, z: 0.6 }
            ];

            return {
                index: emptyIdx,
                x: offsets[emptyIdx].x,
                y: 0,
                z: offsets[emptyIdx].z
            };
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
            for (let i = 0; i < 4; i++) {
                if (this.spotOccupancy[i] === person) {
                    this.spotOccupancy[i] = null;
                }
            }
        }

        clearServedCallsAt(floor) {
            this.destinations.delete(floor);

            if (this.direction >= 0) {
                this.upCalls.delete(floor);
            }
            if (this.direction <= 0) {
                this.downCalls.delete(floor);
            }

            if (!this.hasStopsInDirection(this.direction)) {
                this.upCalls.delete(floor);
                this.downCalls.delete(floor);
            }
        }

        selectNextTarget() {
            // Rule: Passenger destinations outrank same-floor hall calls
            if (this.passengers.size > 0 && this.destinations.size > 0) {
                let target = -1;
                if (this.direction >= 0) {
                    let minAbove = 999;
                    this.destinations.forEach(f => {
                        if (f > this.currentFloor && f < minAbove) minAbove = f;
                    });
                    if (minAbove !== 999) {
                        return { floor: minAbove, dir: 1 };
                    }
                }
                if (this.direction <= 0 || target === -1) {
                    let maxBelow = -1;
                    this.destinations.forEach(f => {
                        if (f < this.currentFloor && f > maxBelow) maxBelow = f;
                    });
                    if (maxBelow !== -1) {
                        return { floor: maxBelow, dir: -1 };
                    }
                }
                if (this.direction < 0) {
                    let minAbove = 999;
                    this.destinations.forEach(f => {
                        if (f > this.currentFloor && f < minAbove) minAbove = f;
                    });
                    if (minAbove !== 999) {
                        return { floor: minAbove, dir: 1 };
                    }
                }
            }

            // Normal SCAN selection
            if (this.direction >= 0) {
                let minAbove = 999;
                const checkSet = f => { if (f > this.currentFloor && f < minAbove) minAbove = f; };
                this.destinations.forEach(checkSet);
                this.upCalls.forEach(checkSet);
                this.downCalls.forEach(checkSet);

                if (minAbove !== 999) {
                    return { floor: minAbove, dir: 1 };
                }

                // Check below
                let maxBelow = -1;
                const checkBelow = f => { if (f < this.currentFloor && f > maxBelow) maxBelow = f; };
                this.destinations.forEach(checkBelow);
                this.upCalls.forEach(checkBelow);
                this.downCalls.forEach(checkBelow);

                if (maxBelow !== -1) {
                    return { floor: maxBelow, dir: -1 };
                }
            } else if (this.direction <= 0) {
                let maxBelow = -1;
                const checkBelow = f => { if (f < this.currentFloor && f > maxBelow) maxBelow = f; };
                this.destinations.forEach(checkBelow);
                this.upCalls.forEach(checkBelow);
                this.downCalls.forEach(checkBelow);

                if (maxBelow !== -1) {
                    return { floor: maxBelow, dir: -1 };
                }

                // Check above
                let minAbove = 999;
                const checkAbove = f => { if (f > this.currentFloor && f < minAbove) minAbove = f; };
                this.destinations.forEach(checkAbove);
                this.upCalls.forEach(checkAbove);
                this.downCalls.forEach(checkAbove);

                if (minAbove !== 999) {
                    return { floor: minAbove, dir: 1 };
                }
            }

            // Check if there is a call at current floor (only if car is empty of destinations)
            if (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor)) {
                const dir = this.upCalls.has(this.currentFloor) ? 1 : -1;
                return { floor: this.currentFloor, dir: dir };
            }

            // IDLE state selection (direction === 0)
            let closestFloor = -1;
            let minDist = 999;
            const allStops = new Set([...this.destinations, ...this.upCalls, ...this.downCalls]);
            allStops.forEach(f => {
                const d = Math.abs(f - this.currentFloor);
                if (d < minDist) {
                    minDist = d;
                    closestFloor = f;
                }
            });

            if (closestFloor !== -1) {
                const dir = (closestFloor > this.currentFloor) ? 1 : ((closestFloor < this.currentFloor) ? -1 : (this.upCalls.has(closestFloor) ? 1 : -1));
                return { floor: closestFloor, dir: dir };
            }

            return { floor: this.currentFloor, dir: 0 };
        }

        tick(dt) {
            if (this.state === 'IDLE') {
                if (this.hasStops()) {
                    const sel = this.selectNextTarget();
                    this.targetFloor = sel.floor;
                    this.direction = sel.dir;
                    if (this.targetFloor === this.currentFloor) {
                        this.state = 'DOOR_OPENING';
                        this.doorTimer = 0;
                    } else {
                        this.state = 'MOVING';
                    }
                }
            } else if (this.state === 'MOVING') {
                // Re-evaluate target while moving to catch closer stops in same direction
                if (this.direction !== 0) {
                    const sel = this.selectNextTarget();
                    if (sel.dir === this.direction) {
                        if (this.direction > 0 && sel.floor > this.currentFloor && sel.floor < this.targetFloor) {
                            this.targetFloor = sel.floor;
                        } else if (this.direction < 0 && sel.floor < this.currentFloor && sel.floor > this.targetFloor) {
                            this.targetFloor = sel.floor;
                        }
                    }
                }

                const targetY = this.targetFloor * this.floorHeight;
                const dirSign = this.targetFloor > this.currentFloor ? 1 : -1;
                this.currentY += dirSign * this.MOVE_SPEED * dt;

                // Update currentFloor as we cross boundaries
                if (dirSign > 0 && this.currentY >= (this.currentFloor + 1) * this.floorHeight - 0.1) {
                    this.currentFloor = Math.min(this.targetFloor, this.currentFloor + 1);
                } else if (dirSign < 0 && this.currentY <= (this.currentFloor - 1) * this.floorHeight + 0.1) {
                    this.currentFloor = Math.max(this.targetFloor, this.currentFloor - 1);
                }

                if (Math.abs(this.currentY - targetY) <= 0.05) {
                    this.currentY = targetY;
                    this.currentFloor = this.targetFloor;
                    this.state = 'DOOR_OPENING';
                    this.doorTimer = 0;
                }
            } else if (this.state === 'DOOR_OPENING') {
                this.doorTimer += dt;
                this.doorProgress = Math.min(1.0, this.doorTimer / this.DOOR_ANIM_S);
                if (this.doorProgress >= 1.0) {
                    this.state = 'DOOR_OPEN';
                    this.doorTimer = 0;
                    this.clearServedCallsAt(this.currentFloor);
                }
            } else if (this.state === 'DOOR_OPEN') {
                this.doorTimer += dt;
                this.clearServedCallsAt(this.currentFloor);

                const hasPending = (this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0);

                if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                    this.state = 'DOOR_CLOSING';
                    this.doorTimer = 0;
                } else if (!hasPending && this.doorTimer >= this.MIN_DOOR_OPEN_S) {
                    this.state = 'DOOR_CLOSING';
                    this.doorTimer = 0;
                }
            } else if (this.state === 'DOOR_CLOSING') {
                this.doorTimer += dt;
                this.doorProgress = Math.max(0.0, 1.0 - (this.doorTimer / this.DOOR_ANIM_S));

                if (this.doorProgress <= 0.0) {
                    const sel = this.selectNextTarget();
                    this.targetFloor = sel.floor;
                    this.direction = sel.dir;

                    if (this.targetFloor === this.currentFloor && (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor) || this.destinations.has(this.currentFloor))) {
                        // Reopen if there's an unserved stop at current floor and car is empty of destinations
                        if (this.passengers.size === 0 || this.destinations.has(this.currentFloor)) {
                            this.state = 'DOOR_OPENING';
                            this.doorTimer = 0;
                        } else {
                            // Have passengers with destinations elsewhere; move to next destination
                            this.state = 'MOVING';
                        }
                    } else if (this.targetFloor !== this.currentFloor) {
                        this.state = 'MOVING';
                    } else {
                        this.direction = 0;
                        this.state = 'IDLE';
                    }
                }
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
