// elevator_logic.js - pure elevator scheduler/state machine
// No Three.js, DOM, canvas, or browser-only dependencies. Runs under Node.js.
// Exposes window.ElevatorLogic in the browser and module.exports for Node tests.

(function (root) {
    const STATE_IDLE = "IDLE";
    const STATE_MOVING = "MOVING";
    const STATE_DOOR_OPENING = "DOOR_OPENING";
    const STATE_DOOR_OPEN = "DOOR_OPEN";
    const STATE_DOOR_CLOSING = "DOOR_CLOSING";

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount || 6;
            this.maxCapacity = opts.maxCapacity || 4;
            this.floorHeight = opts.floorHeight || 3.4;
            this.MOVE_SPEED = 1.0;
            this.DOOR_OPENING_S = 0.6;
            this.DOOR_CLOSING_S = 0.6;
            this.MIN_DOOR_OPEN_S = 1.0;
            this.MAX_DOOR_OPEN_S = 6.0;
            this.interiorSpots = [
                { x: -0.6, y: 0, z: -0.6 },
                { x: 0.6, y: 0, z: -0.6 },
                { x: -0.6, y: 0, z: 0.4 },
                { x: 0.6, y: 0, z: 0.4 }
            ];
            this.reset();
        }

        reset() {
            this.state = STATE_IDLE;
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Map();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.doorTimer = 0;
            this.doorOpenElapsed = 0;
            this.lastServedFloor = -1;
            this.servedThisDoorCycle = false;
        }

        callUp(floor) { this.upCalls.add(floor); }
        callDown(floor) { this.downCalls.add(floor); }
        pressDestination(floor) { this.destinations.add(floor); }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        hasMoreInDirection(d) {
            const cur = this.currentFloor;
            const keys = Array.from(this.destinations);
            for (let i = 0; i < keys.length; i += 1) {
                const f = keys[i];
                if ((d > 0 && f > cur) || (d < 0 && f < cur)) return true;
            }
            if (d > 0) {
                const up = Array.from(this.upCalls);
                for (let i = 0; i < up.length; i += 1) { if (up[i] > cur) return true; }
            }
            if (d < 0) {
                const dn = Array.from(this.downCalls);
                for (let i = 0; i < dn.length; i += 1) { if (dn[i] < cur) return true; }
            }
            return false;
        }

        isAcceptingAt(floor, dir) {
            if (this.state !== STATE_DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.currentCapacityFree() <= 0) return false;
            if (this.direction === 0) return true;
            if (dir === this.direction) return true;
            if (!this.hasMoreInDirection(this.direction)) return true;
            return false;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.set(person, i);
                    const s = this.interiorSpots[i];
                    return { index: i, x: s.x, y: s.y, z: s.z };
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
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (let i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        nearestStopInDirection(cur, d) {
            let best = null;
            const dests = Array.from(this.destinations);
            for (let i = 0; i < dests.length; i += 1) {
                const f = dests[i];
                if ((d > 0 && f > cur) || (d < 0 && f < cur)) {
                    if (best === null || (d > 0 && f < best) || (d < 0 && f > best)) best = f;
                }
            }
            if (d > 0) {
                const up = Array.from(this.upCalls);
                for (let i = 0; i < up.length; i += 1) {
                    const f = up[i];
                    if (f > cur && (best === null || f < best)) best = f;
                }
            }
            if (d < 0) {
                const dn = Array.from(this.downCalls);
                for (let i = 0; i < dn.length; i += 1) {
                    const f = dn[i];
                    if (f < cur && (best === null || f > best)) best = f;
                }
            }
            return best;
        }

        pickTarget() {
            const cur = this.currentFloor;
            const hasPax = this.passengers.size > 0 || this.destinations.size > 0;
            const upStops = [];
            const downStops = [];
            const dests = Array.from(this.destinations);
            for (let i = 0; i < dests.length; i += 1) {
                const f = dests[i];
                if (f > cur) upStops.push(f);
                else if (f < cur) downStops.push(f);
            }
            const up = Array.from(this.upCalls);
            for (let i = 0; i < up.length; i += 1) {
                const f = up[i];
                if (f > cur) upStops.push(f);
                else if (f === cur && !hasPax) upStops.push(f);
            }
            const dn = Array.from(this.downCalls);
            for (let i = 0; i < dn.length; i += 1) {
                const f = dn[i];
                if (f < cur) downStops.push(f);
                else if (f === cur && !hasPax) downStops.push(f);
            }

            let dir = this.direction;
            if (dir === 0) {
                const all = upStops.concat(downStops);
                if (all.length === 0) return null;
                let best = all[0];
                for (let i = 1; i < all.length; i += 1) {
                    if (Math.abs(all[i] - cur) < Math.abs(best - cur)) best = all[i];
                }
                dir = best > cur ? 1 : (best < cur ? -1 : (this.upCalls.has(cur) ? 1 : (this.downCalls.has(cur) ? -1 : 1)));
            }

            let chosen = null;
            if (dir > 0 && upStops.length > 0) {
                chosen = upStops[0];
                for (let i = 1; i < upStops.length; i += 1) { if (upStops[i] < chosen) chosen = upStops[i]; }
                this.direction = dir;
            } else if (dir < 0 && downStops.length > 0) {
                chosen = downStops[0];
                for (let i = 1; i < downStops.length; i += 1) { if (downStops[i] > chosen) chosen = downStops[i]; }
                this.direction = dir;
            } else {
                dir = -dir;
                if (dir > 0 && upStops.length > 0) {
                    chosen = upStops[0];
                    for (let i = 1; i < upStops.length; i += 1) { if (upStops[i] < chosen) chosen = upStops[i]; }
                    this.direction = dir;
                } else if (dir < 0 && downStops.length > 0) {
                    chosen = downStops[0];
                    for (let i = 1; i < downStops.length; i += 1) { if (downStops[i] > chosen) chosen = downStops[i]; }
                    this.direction = dir;
                } else {
                    this.direction = 0;
                    if (!hasPax && (this.destinations.has(cur) || this.upCalls.has(cur) || this.downCalls.has(cur))) return cur;
                    return null;
                }
            }
            return chosen;
        }

        arrive() {
            const cur = this.currentFloor;
            this.destinations.delete(cur);
            if (this.direction > 0) this.upCalls.delete(cur);
            else if (this.direction < 0) this.downCalls.delete(cur);
            if (!this.hasMoreInDirection(this.direction)) {
                this.upCalls.delete(cur);
                this.downCalls.delete(cur);
            }
            this.lastServedFloor = cur;
            this.servedThisDoorCycle = true;
        }

        _step(step) {
            switch (this.state) {
                case STATE_IDLE: {
                    const cur = this.currentFloor;
                    if (this.destinations.has(cur) || this.upCalls.has(cur) || this.downCalls.has(cur)) {
                        this.state = STATE_DOOR_OPENING; this.doorTimer = 0; this.servedThisDoorCycle = false;
                        return;
                    }
                    const target = this.pickTarget();
                    if (target === null) { this.direction = 0; return; }
                    if (target === cur) {
                        this.state = STATE_DOOR_OPENING; this.doorTimer = 0; this.servedThisDoorCycle = false;
                        return;
                    }
                    this.targetFloor = target;
                    this.state = STATE_MOVING;
                    return;
                }
                case STATE_MOVING: {
                    const cur = this.currentFloor;
                    const d = this.direction !== 0 ? this.direction : (this.targetFloor > cur ? 1 : -1);
                    const nearer = this.nearestStopInDirection(cur, d);
                    if (nearer !== null) this.targetFloor = nearer;
                    const target = this.targetFloor;
                    const dist = Math.abs(target - cur);
                    const travel = this.MOVE_SPEED * step;
                    if (travel >= dist || dist < 0.000001) {
                        this.currentFloor = target;
                        this.state = STATE_DOOR_OPENING; this.doorTimer = 0; this.servedThisDoorCycle = false;
                    } else {
                        this.currentFloor = cur + d * travel;
                    }
                    return;
                }
                case STATE_DOOR_OPENING: {
                    this.doorTimer += step;
                    if (this.doorTimer >= this.DOOR_OPENING_S) {
                        this.state = STATE_DOOR_OPEN; this.doorOpenElapsed = 0;
                        this.arrive();
                    }
                    return;
                }
                case STATE_DOOR_OPEN: {
                    this.doorOpenElapsed += step;
                    const pendingEmpty = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                    const minElapsed = this.doorOpenElapsed >= this.MIN_DOOR_OPEN_S;
                    const maxElapsed = this.doorOpenElapsed >= this.MAX_DOOR_OPEN_S;
                    if ((pendingEmpty && minElapsed) || maxElapsed) {
                        this.state = STATE_DOOR_CLOSING; this.doorTimer = 0;
                    }
                    return;
                }
                case STATE_DOOR_CLOSING: {
                    this.doorTimer += step;
                    if (this.doorTimer >= this.DOOR_CLOSING_S) {
                        const target = this.pickTarget();
                        if (target === null) { this.state = STATE_IDLE; this.direction = 0; return; }
                        if (target === this.currentFloor) {
                            this.state = STATE_DOOR_OPENING; this.doorTimer = 0; this.servedThisDoorCycle = false;
                            return;
                        }
                        this.targetFloor = target;
                        this.state = STATE_MOVING;
                    }
                    return;
                }
            }
        }

        tick(dt) {
            let remaining = dt;
            let guard = 0;
            while (remaining > 0.000001 && guard < 1000) {
                const step = Math.min(remaining, 0.2);
                this._step(step);
                remaining -= step;
                guard += 1;
            }
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic: ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
