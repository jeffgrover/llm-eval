// elevator_logic.js — pure elevator scheduler/state machine.
// No Three.js, no DOM, no canvas. Runs in the browser (window.ElevatorLogic)
// and under Node (module.exports) for elevator_logic_test.js.

(function (root) {
    "use strict";

    const STATES = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING"
    };

    const DOOR_ANIM_S = 1.2;      // door opening/closing duration (seconds)
    const MIN_DOOR_OPEN_S = 2.0;  // doors stay open at least this long
    const MAX_DOOR_OPEN_S = 12.0; // safety cap even if a boarder never completes
    const SPEED = 2.2;            // car speed, world units per second

    // Logical interior spots (car-local coordinates; car floor at local y=0).
    const SPOT_POSITIONS = [
        { x: -0.7, y: 0, z: -0.7 },
        { x: 0.7, y: 0, z: -0.7 },
        { x: -0.7, y: 0, z: 0.45 },
        { x: 0.7, y: 0, z: 0.45 }
    ];

    class ElevatorLogic {
        constructor(opts) {
            opts = opts || {};
            this.floorCount = opts.floorCount !== undefined ? opts.floorCount : 6;
            this.maxCapacity = opts.maxCapacity !== undefined ? opts.maxCapacity : 4;
            this.floorHeight = opts.floorHeight !== undefined ? opts.floorHeight : 3.4;

            this.DOOR_ANIM_S = DOOR_ANIM_S;
            this.MIN_DOOR_OPEN_S = MIN_DOOR_OPEN_S;
            this.MAX_DOOR_OPEN_S = MAX_DOOR_OPEN_S;
            this.SPEED = SPEED;

            this.reset();
        }

        reset() {
            this.state = STATES.IDLE;
            this.y = 0;                    // car floor world height
            this.currentFloor = 0;
            this.targetFloor = null;
            this.direction = 0;            // +1 up, -1 down, 0 idle
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Array(SPOT_POSITIONS.length).fill(null);
            this.doorProgress = 0;         // 0 closed .. 1 open
            this.doorOpenTimer = 0;
            this.doorTimer = 0;
            this.servedThisDoorCycle = false;
            this.lastServedFloor = null;   // floor served by the most recent door cycle
        }

        // ---- public call/destination API -------------------------------

        callUp(floor) {
            if (floor >= 0 && floor < this.floorCount) this.upCalls.add(floor);
        }

        callDown(floor) {
            if (floor >= 0 && floor < this.floorCount) this.downCalls.add(floor);
        }

        pressDestination(floor) {
            if (floor === null || floor === undefined) return;
            if (floor < 0 || floor >= this.floorCount) return;
            if (floor === this.currentFloor &&
                (this.state === STATES.DOOR_OPEN || this.state === STATES.DOOR_OPENING)) {
                return; // pressing your current floor while doors are open is a no-op
            }
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.direction === 0 || direction === 0) return true;
            if (this.direction === direction) return true;
            // accept opposite-direction boarders only when no more work ahead
            return !this._hasWorkInDirection(this.direction, floor);
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === null) {
                    this.spotOccupancy[i] = person;
                    this.pendingBoarders.add(person);
                    const p = SPOT_POSITIONS[i];
                    return { index: i, x: p.x, y: p.y, z: p.z };
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

        cancelBoard(person) {
            // boarder gave up (car left, safety cap fired) — free the spot
            this.pendingBoarders.delete(person);
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        registerDisembark(person) {
            if (this.passengers.has(person)) {
                this.pendingDisembark.add(person);
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        // ---- internal helpers ------------------------------------------

        _hasWorkInDirection(dir, fromFloor) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) return true;
                }
            }
            return false;
        }

        _nearestStopInDirection(dir, fromFloor) {
            // Nearest destination or matching-direction call strictly ahead.
            // A non-matching call at the far end is also pickable (turnaround).
            if (dir === 0) return null;
            let nearestServe = null;   // destination or matching call
            let farthestCall = null;   // any call ahead (turnaround target)
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (nearestServe === null && (this.destinations.has(f) || this.upCalls.has(f))) nearestServe = f;
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) farthestCall = f;
                }
            } else {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (nearestServe === null && (this.destinations.has(f) || this.downCalls.has(f))) nearestServe = f;
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) farthestCall = f;
                }
            }
            if (nearestServe !== null) return nearestServe;
            return farthestCall; // ride to the far call and reverse there
        }

        _nearestDestInDirection(dir, fromFloor) {
            if (dir > 0) {
                for (let f = fromFloor + 1; f < this.floorCount; f++) {
                    if (this.destinations.has(f)) return f;
                }
            } else if (dir < 0) {
                for (let f = fromFloor - 1; f >= 0; f--) {
                    if (this.destinations.has(f)) return f;
                }
            }
            return null;
        }

        _nearestAnyStop(fromFloor, excludeFloor) {
            let best = null;
            let bestDist = Infinity;
            for (let f = 0; f < this.floorCount; f++) {
                if (f === excludeFloor) continue;
                if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                    const d = Math.abs(f - fromFloor);
                    if (d < bestDist) { bestDist = d; best = f; }
                }
            }
            return best;
        }

        _pickNextTarget() {
            // Called at door-close (and from IDLE). Decide the next target floor.
            const here = this.currentFloor;
            const hasRiders = this.passengers.size > 0 || this.pendingBoarders.size > 0;

            // Passenger destinations outrank everything else, especially
            // same-floor hall calls (no full-car lobby starvation).
            if (hasRiders && this.destinations.size > 0) {
                let target = null;
                if (this.direction !== 0) {
                    target = this._nearestDestInDirection(this.direction, here);
                    if (target === null) target = this._nearestDestInDirection(-this.direction, here);
                }
                if (target === null) {
                    let bestDist = Infinity;
                    this.destinations.forEach(function (f) {
                        if (f !== here && Math.abs(f - here) < bestDist) {
                            bestDist = Math.abs(f - here);
                            target = f;
                        }
                    });
                }
                if (target !== null) return target;
            }

            // Continue in the current direction if there is work ahead.
            if (this.direction !== 0) {
                const ahead = this._nearestStopInDirection(this.direction, here);
                if (ahead !== null) return ahead;
                const behind = this._nearestStopInDirection(-this.direction, here);
                if (behind !== null) return behind;
            }

            // Same-floor hall call while idle/empty. Skipped right after a
            // door cycle at this floor (servedThisDoorCycle) so leftover
            // re-pressed calls can't force an immediate reopen; once the car
            // goes IDLE that flag clears and a fresh call reopens normally.
            if (!hasRiders && !this.servedThisDoorCycle &&
                (this.upCalls.has(here) || this.downCalls.has(here))) {
                return here;
            }

            // Nearest active call/destination anywhere else.
            const exclude = this.servedThisDoorCycle ? here : -1;
            const any = this._nearestAnyStop(here, exclude);
            if (any !== null) return any;
            return null;
        }

        _arriveServe() {
            // Door-open arrival housekeeping: clear served stops.
            const here = this.currentFloor;
            this.destinations.delete(here);
            if (this.direction > 0) {
                this.upCalls.delete(here);
                if (!this._hasWorkInDirection(1, here)) {
                    // no more work above — also serve the down call here
                    this.downCalls.delete(here);
                    if (this._hasWorkInDirection(-1, here)) this.direction = -1;
                    else this.direction = 0;
                }
            } else if (this.direction < 0) {
                this.downCalls.delete(here);
                if (!this._hasWorkInDirection(-1, here)) {
                    this.upCalls.delete(here);
                    if (this._hasWorkInDirection(1, here)) this.direction = 1;
                    else this.direction = 0;
                }
            } else {
                // idle arrival: infer direction from remaining work, clear both
                if (this.upCalls.has(here) && this.downCalls.has(here)) {
                    const up = this._hasWorkInDirection(1, here);
                    const down = this._hasWorkInDirection(-1, here);
                    this.upCalls.delete(here);
                    this.downCalls.delete(here);
                    this.direction = up ? 1 : (down ? -1 : 0);
                } else if (this.upCalls.has(here)) {
                    this.upCalls.delete(here);
                    this.direction = 1;
                } else if (this.downCalls.has(here)) {
                    this.downCalls.delete(here);
                    this.direction = -1;
                }
            }
            this.servedThisDoorCycle = true;
            this.lastServedFloor = here;
        }

        // ---- main tick --------------------------------------------------

        tick(dt) {
            if (dt <= 0) return;
            // Cap a single physics step; long frames advance in sub-steps so
            // a high timeScale doesn't tunnel the car through floors.
            let remaining = dt;
            const MAX_STEP = 0.25;
            while (remaining > 0) {
                const step = Math.min(MAX_STEP, remaining);
                const wasOpen = this.state === STATES.DOOR_OPEN;
                this._step(step);
                remaining -= step;
                // Yield the moment the doors reach DOOR_OPEN: at high time
                // scales a whole frame can exceed the min-open window, and
                // riders/waiters need one observable DOOR_OPEN frame to
                // register boarding/disembarking before the timers run on.
                if (!wasOpen && this.state === STATES.DOOR_OPEN) break;
            }
        }

        _step(dt) {
            switch (this.state) {
                case STATES.IDLE: {
                    const target = this._pickNextTarget();
                    if (target === null) break;
                    if (target === this.currentFloor) {
                        // serve a hall call at this floor
                        if (this.direction === 0) {
                            if (this.upCalls.has(target) && !this.downCalls.has(target)) this.direction = 1;
                            else if (this.downCalls.has(target) && !this.upCalls.has(target)) this.direction = -1;
                        }
                        this.targetFloor = target;
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                    } else {
                        this.targetFloor = target;
                        this.direction = target > this.currentFloor ? 1 : -1;
                        this.state = STATES.MOVING;
                        this.servedThisDoorCycle = false;
                    }
                    break;
                }

                case STATES.MOVING: {
                    // Re-evaluate every step: a closer stop in the same
                    // direction shortens the target (no overshoot).
                    if (this.direction > 0) {
                        const next = Math.ceil((this.y + 0.000001) / this.floorHeight);
                        for (let f = next; f < this.targetFloor; f++) {
                            if (this.destinations.has(f) ||
                                (this.upCalls.has(f) && this.currentCapacityFree() > 0)) {
                                if (f * this.floorHeight >= this.y - 0.000001) {
                                    this.targetFloor = f;
                                    break;
                                }
                            }
                        }
                    } else if (this.direction < 0) {
                        const next = Math.floor((this.y - 0.000001) / this.floorHeight);
                        for (let f = next; f > this.targetFloor; f--) {
                            if (this.destinations.has(f) ||
                                (this.downCalls.has(f) && this.currentCapacityFree() > 0)) {
                                if (f * this.floorHeight <= this.y + 0.000001) {
                                    this.targetFloor = f;
                                    break;
                                }
                            }
                        }
                    }

                    const targetY = this.targetFloor * this.floorHeight;
                    const dy = targetY - this.y;
                    const move = SPEED * dt;
                    if (Math.abs(dy) <= move) {
                        this.y = targetY;
                        this.currentFloor = this.targetFloor;
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                    } else {
                        this.y += Math.sign(dy) * move;
                        // keep currentFloor as the nearest floor for indicators
                        this.currentFloor = Math.round(this.y / this.floorHeight);
                    }
                    break;
                }

                case STATES.DOOR_OPENING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.min(1, this.doorTimer / DOOR_ANIM_S);
                    if (this.doorProgress >= 1) {
                        this.state = STATES.DOOR_OPEN;
                        this.doorOpenTimer = 0;
                        this._arriveServe();
                    }
                    break;
                }

                case STATES.DOOR_OPEN: {
                    this.doorOpenTimer += dt;
                    const held = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    const minElapsed = this.doorOpenTimer >= MIN_DOOR_OPEN_S;
                    const capFired = this.doorOpenTimer >= MAX_DOOR_OPEN_S;
                    if ((minElapsed && !held) || capFired) {
                        if (capFired && held) {
                            // safety: abandon stuck handshakes so the car can move on
                            this.pendingDisembark.clear();
                            const stuck = Array.from(this.pendingBoarders);
                            for (let i = 0; i < stuck.length; i++) this.cancelBoard(stuck[i]);
                        }
                        this.state = STATES.DOOR_CLOSING;
                        this.doorTimer = 0;
                    }
                    break;
                }

                case STATES.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    this.doorProgress = Math.max(0, 1 - this.doorTimer / DOOR_ANIM_S);
                    if (this.doorProgress <= 0) {
                        const target = this._pickNextTarget();
                        if (target === null) {
                            this.state = STATES.IDLE;
                            this.targetFloor = null;
                            this.direction = 0;
                            this.servedThisDoorCycle = false;
                        } else if (target === this.currentFloor) {
                            // Guard: never reopen at the floor just served while
                            // riders/destinations exist (lobby starvation).
                            if (this.lastServedFloor === this.currentFloor &&
                                (this.destinations.size > 0 || this.passengers.size > 0)) {
                                let alt = null;
                                let bestDist = Infinity;
                                this.destinations.forEach((f) => {
                                    if (f !== this.currentFloor) {
                                        const d = Math.abs(f - this.currentFloor);
                                        if (d < bestDist) { bestDist = d; alt = f; }
                                    }
                                });
                                if (alt !== null) {
                                    this.targetFloor = alt;
                                    this.direction = alt > this.currentFloor ? 1 : -1;
                                    this.state = STATES.MOVING;
                                    this.servedThisDoorCycle = false;
                                } else {
                                    this.state = STATES.IDLE;
                                    this.targetFloor = null;
                                    this.direction = 0;
                                    this.servedThisDoorCycle = false;
                                }
                            } else {
                                this.state = STATES.DOOR_OPENING;
                                this.doorTimer = 0;
                                this.targetFloor = target;
                            }
                        } else {
                            this.targetFloor = target;
                            this.direction = target > this.currentFloor ? 1 : -1;
                            this.state = STATES.MOVING;
                            this.servedThisDoorCycle = false;
                        }
                    }
                    break;
                }
            }
        }
    }

    ElevatorLogic.STATES = STATES;
    ElevatorLogic.SPOT_POSITIONS = SPOT_POSITIONS;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
