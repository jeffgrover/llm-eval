/* elevator_logic.js — pure elevator scheduler/state machine, no Three.js/DOM */

(function (root) {
    class ElevatorLogic {
        constructor(opts = {}) {
            this.floorCount = opts.floorCount ?? 6;
            this.maxCapacity = opts.maxCapacity ?? 4;
            this.floorHeight = opts.floorHeight ?? 3.4;
            this.speed = opts.speed ?? 5.0;            // m/s vertical
            this.doorSpeed = opts.doorSpeed ?? 1.6;    // fraction per second (0..1)
            this.minDoorOpenS = opts.minDoorOpenS ?? 1.5;
            this.maxDoorOpenS = opts.maxDoorOpenS ?? 8.0;
            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.y = 0;
            this.doorOpen = 0; // 0 closed .. 1 open
            this.doorTimer = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Map();       // person -> spotIndex
            this.pendingBoarders = new Map();  // person -> spotIndex
            this.pendingDisembark = new Map(); // person -> spotIndex
            this.spotOccupancy = [false, false, false, false];
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;
        }

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) this.upCalls.add(floor);
        }
        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) this.downCalls.add(floor);
        }
        pressDestination(floor) {
            if (floor >= 0 && floor < this.floorCount) this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (this.direction === 0) return true;
            if (this.direction === direction) return true;
            return this._nearestStopInDirection(this.direction, false) === null;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (!this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = true;
                    this.pendingBoarders.set(person, i);
                    const x = (i % 2 === 0 ? -1 : 1) * 0.55;
                    const z = (i < 2 ? 1 : -1) * 0.55;
                    return { index: i, x, y: 0, z };
                }
            }
            return null;
        }

        completeBoard(person) {
            const idx = this.pendingBoarders.get(person);
            if (idx === undefined) return;
            this.pendingBoarders.delete(person);
            this.passengers.set(person, idx);
        }

        registerDisembark(person) {
            const idx = this.passengers.get(person);
            if (idx === undefined) return;
            this.pendingDisembark.set(person, idx);
        }

        completeDisembark(person) {
            const idx = this.pendingDisembark.get(person);
            if (idx === undefined) return;
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            this.spotOccupancy[idx] = false;
        }

        _hasWork() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        _nearestStopInDirection(dir, excludeCurrent) {
            const exclude = excludeCurrent ? this.currentFloor : null;
            let best = null;
            if (dir === 1) {
                for (const f of this.destinations) {
                    if (f === exclude) continue;
                    if (f > this.currentFloor && (best === null || f < best)) best = f;
                }
                for (const f of this.upCalls) {
                    if (f === exclude) continue;
                    if (f > this.currentFloor && (best === null || f < best)) best = f;
                }
            } else if (dir === -1) {
                for (const f of this.destinations) {
                    if (f === exclude) continue;
                    if (f < this.currentFloor && (best === null || f > best)) best = f;
                }
                for (const f of this.downCalls) {
                    if (f === exclude) continue;
                    if (f < this.currentFloor && (best === null || f > best)) best = f;
                }
            }
            return best;
        }

        _onArriveAtFloor() {
            this.destinations.delete(this.currentFloor);
            if (this.direction === 1) this.upCalls.delete(this.currentFloor);
            if (this.direction === -1) this.downCalls.delete(this.currentFloor);

            // If no more stops in the current direction, also clear the opposite
            // call at this floor so it can be served before leaving.
            if (this._nearestStopInDirection(this.direction, false) === null) {
                if (this.direction === 1) this.downCalls.delete(this.currentFloor);
                if (this.direction === -1) this.upCalls.delete(this.currentFloor);
                this.direction = 0;
            }

            this.servedThisDoorCycle = true;
            this.lastServedFloor = this.currentFloor;
        }

        pickTarget() {
            const guard = this.servedThisDoorCycle && this.lastServedFloor === this.currentFloor;
            let target = null;
            let dir = this.direction;

            if (dir !== 0) {
                target = this._nearestStopInDirection(dir, guard);
                if (target === null) {
                    dir = -dir;
                    target = this._nearestStopInDirection(dir, guard);
                }
            }

            if (target === null) {
                let nearest = null;
                let bestDist = Infinity;
                let bestDir = 0;
                const consider = (f, d) => {
                    if (guard && f === this.currentFloor) return;
                    const dist = Math.abs(f - this.currentFloor);
                    if (dist < bestDist) {
                        nearest = f;
                        bestDist = dist;
                        bestDir = d;
                    }
                };
                for (const f of this.destinations) consider(f, f > this.currentFloor ? 1 : (f < this.currentFloor ? -1 : 0));
                for (const f of this.upCalls) consider(f, 1);
                for (const f of this.downCalls) consider(f, -1);
                if (nearest !== null) {
                    target = nearest;
                    dir = bestDir;
                }
            }

            if (target === null) {
                this.state = "IDLE";
                this.direction = 0;
                this.targetFloor = null;
                return;
            }

            this.targetFloor = target;
            this.direction = dir;
            if (target === this.currentFloor) {
                this.state = "DOOR_OPENING";
                this.doorTimer = 0;
                this._onArriveAtFloor();
            } else {
                this.state = "MOVING";
            }
        }

        _reevaluateTarget() {
            if (this.state !== "MOVING" || this.direction === 0) return;
            const closer = this._nearestStopInDirection(this.direction, false);
            if (closer !== null && Math.abs(closer - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) {
                this.targetFloor = closer;
            }
        }

        tick(dt) {
            dt = Math.max(0, Math.min(dt, 0.1));
            switch (this.state) {
                case "IDLE":
                    if (this._hasWork()) this.pickTarget();
                    break;

                case "MOVING": {
                    if (this.servedThisDoorCycle && this.currentFloor !== this.lastServedFloor) {
                        this.servedThisDoorCycle = false;
                        this.lastServedFloor = null;
                    }
                    this._reevaluateTarget();
                    const targetY = this.targetFloor * this.floorHeight;
                    const step = Math.sign(targetY - this.y) * this.speed * dt;
                    if (Math.abs(targetY - this.y) <= Math.abs(step) + 1e-4) {
                        this.y = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = "DOOR_OPENING";
                        this.doorTimer = 0;
                        this._onArriveAtFloor();
                    } else {
                        this.y += step;
                        this.currentFloor = Math.round(this.y / this.floorHeight);
                    }
                    break;
                }

                case "DOOR_OPENING":
                    this.doorOpen += this.doorSpeed * dt;
                    if (this.doorOpen >= 1) {
                        this.doorOpen = 1;
                        this.state = "DOOR_OPEN";
                        this.doorTimer = 0;
                    }
                    break;

                case "DOOR_OPEN":
                    this.doorTimer += dt;
                    const canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                    if ((canClose && this.doorTimer >= this.minDoorOpenS) || this.doorTimer >= this.maxDoorOpenS) {
                        this.state = "DOOR_CLOSING";
                        this.doorTimer = 0;
                    }
                    break;

                case "DOOR_CLOSING":
                    this.doorOpen -= this.doorSpeed * dt;
                    if (this.doorOpen <= 0) {
                        this.doorOpen = 0;
                        this.pickTarget();
                    }
                    break;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
