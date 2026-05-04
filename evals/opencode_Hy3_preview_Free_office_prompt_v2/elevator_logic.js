(function(root) {
    class ElevatorLogic {
        constructor(options = {}) {
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.MIN_DOOR_OPEN_S = 2;
            this.MAX_DOOR_OPEN_S = 15;
            this.DOOR_OPEN_TIME = 1;
            this.DOOR_CLOSE_TIME = 1;
            this.MOVING_SPEED = 3;
            this.reset();
        }

        reset() {
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Map();
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.y = 0;
            this.state = 'IDLE';
            this.doorTimer = 0;
            this.spotOccupancy = new Map();
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
            if (this.state !== 'DOOR_OPEN' || this.currentFloor !== floor) return false;
            const hasStops = this._hasStopsInDirection(this.direction);
            if (!hasStops) return true;
            return direction === this.direction;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(personId) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < 4; i++) {
                if (!this.spotOccupancy.has(i)) {
                    this.spotOccupancy.set(i, personId);
                    this.pendingBoarders.set(personId, { index: i });
                    const spots = [
                        { x: -0.6, y: 0, z: -0.5 },
                        { x: 0.6, y: 0, z: -0.5 },
                        { x: -0.6, y: 0, z: 0.5 },
                        { x: 0.6, y: 0, z: 0.5 }
                    ];
                    const spot = spots[i];
                    const entry = this.pendingBoarders.get(personId);
                    entry.x = spot.x; entry.y = spot.y; entry.z = spot.z;
                    return { index: i, x: spot.x, y: spot.y, z: spot.z };
                }
            }
            return null;
        }

        completeBoard(personId) {
            if (this.pendingBoarders.has(personId)) {
                this.passengers.add(personId);
                this.pendingBoarders.delete(personId);
            }
        }

        registerDisembark(personId, floor) {
            if (this.passengers.has(personId)) this.pendingDisembark.set(personId, floor);
        }

        completeDisembark(personId) {
            let spotIdx = -1;
            for (const [idx, pid] of this.spotOccupancy.entries()) {
                if (pid === personId) { spotIdx = idx; break; }
            }
            if (spotIdx >= 0) this.spotOccupancy.delete(spotIdx);
            this.pendingDisembark.delete(personId);
            this.passengers.delete(personId);
            this.pendingBoarders.delete(personId);
        }

        tick(dt) {
            switch (this.state) {
                case 'IDLE': this._handleIdle(); break;
                case 'MOVING': this._handleMoving(dt); break;
                case 'DOOR_OPENING': this._handleDoorOpening(dt); break;
                case 'DOOR_OPEN': this._handleDoorOpen(dt); break;
                case 'DOOR_CLOSING': this._handleDoorClosing(dt); break;
            }
        }

        _handleIdle() {
            const next = this._pickNextTarget();
            if (next) {
                this.targetFloor = next.floor;
                this.direction = next.dir;
                this.state = 'MOVING';
            }
        }

        _handleMoving(dt) {
            const targetY = this.targetFloor * this.floorHeight;
            const diff = targetY - this.y;
            const move = this.direction * this.MOVING_SPEED * dt;
            if (Math.abs(diff) <= Math.abs(move)) {
                this.y = targetY;
                this.currentFloor = this.targetFloor;
                this.state = 'DOOR_OPENING';
                this.doorTimer = 0;
                if (this.direction === 1) this.upCalls.delete(this.currentFloor);
                else if (this.direction === -1) this.downCalls.delete(this.currentFloor);
                this.destinations.delete(this.currentFloor);
                this.lastServedFloor = this.currentFloor;
            } else {
                this.y += move;
                this.currentFloor = Math.round(this.y / this.floorHeight);
                this._reevaluateTarget();
            }
        }

        _handleDoorOpening(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_OPEN_TIME) {
                this.state = 'DOOR_OPEN';
                this.doorTimer = 0;
            }
        }

        _handleDoorOpen(dt) {
            this.doorTimer += dt;
            const canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            if (canClose && this.doorTimer >= this.MIN_DOOR_OPEN_S) {
                this.state = 'DOOR_CLOSING';
                this.doorTimer = 0;
            }
            if (this.doorTimer >= this.MAX_DOOR_OPEN_S) {
                this.state = 'DOOR_CLOSING';
                this.doorTimer = 0;
            }
        }

        _handleDoorClosing(dt) {
            this.doorTimer += dt;
            if (this.doorTimer >= this.DOOR_CLOSE_TIME) {
                this.state = 'IDLE';
                this.doorTimer = 0;
                this.lastServedFloor = null;
            }
        }

        _pickNextTarget() {
            // Prioritize destinations first
            if (this.destinations.size > 0) {
                const destStops = Array.from(this.destinations);
                destStops.sort((a,b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
                const nearestDest = destStops[0];
                const dir = nearestDest > this.currentFloor ? 1 : nearestDest < this.currentFloor ? -1 : 0;
                return { floor: nearestDest, dir };
            }
            // Prefer continue in current direction
            if (this.direction !== 0) {
                const nextInDir = this._findNextStopInDirection(this.direction);
                if (nextInDir !== null) return { floor: nextInDir, dir: this.direction };
                this.direction = -this.direction;
                const nextRev = this._findNextStopInDirection(this.direction);
                if (nextRev !== null) return { floor: nextRev, dir: this.direction };
            }
            // Idle: pick nearest stop
            const allStops = this._getAllStops();
            if (allStops.length === 0) return null;
            allStops.sort((a,b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
            const nearest = allStops[0];
            const dir = nearest > this.currentFloor ? 1 : nearest < this.currentFloor ? -1 : 0;
            return { floor: nearest, dir };
        }

        _findNextStopInDirection(dir) {
            const stops = [];
            for (const f of this.destinations) {
                if ((dir === 1 && f > this.currentFloor) || (dir === -1 && f < this.currentFloor)) stops.push(f);
            }
            const calls = dir === 1 ? this.upCalls : this.downCalls;
            for (const f of calls) {
                if ((dir === 1 && f > this.currentFloor) || (dir === -1 && f < this.currentFloor)) stops.push(f);
            }
            if (stops.length === 0) return null;
            stops.sort((a,b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
            return stops[0];
        }

        _reevaluateTarget() {
            if (this.direction === 0 || this.targetFloor === null) return;
            const stops = [];
            for (const f of this.destinations) {
                if (this.direction === 1 && f > this.currentFloor && f < this.targetFloor) stops.push(f);
                if (this.direction === -1 && f < this.currentFloor && f > this.targetFloor) stops.push(f);
            }
            const calls = this.direction === 1 ? this.upCalls : this.downCalls;
            for (const f of calls) {
                if (this.direction === 1 && f > this.currentFloor && f < this.targetFloor) stops.push(f);
                if (this.direction === -1 && f < this.currentFloor && f > this.targetFloor) stops.push(f);
            }
            if (stops.length > 0) {
                stops.sort((a,b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
                this.targetFloor = stops[0];
            }
        }

        _hasStopsInDirection(dir) {
            for (const f of this.destinations) {
                if ((dir === 1 && f > this.currentFloor) || (dir === -1 && f < this.currentFloor)) return true;
            }
            const calls = dir === 1 ? this.upCalls : this.downCalls;
            for (const f of calls) {
                if ((dir === 1 && f > this.currentFloor) || (dir === -1 && f < this.currentFloor)) return true;
            }
            return false;
        }

        _getAllStops() {
            const s = new Set();
            for (const f of this.destinations) s.add(f);
            for (const f of this.upCalls) s.add(f);
            for (const f of this.downCalls) s.add(f);
            return Array.from(s);
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
