// elevator_logic.js — pure scheduler/state machine. No Three.js or DOM.
// Browser: attaches ElevatorLogic to window.
// Node: also exports via module.exports for the test harness.

(function (root) {
    const STATES = {
        IDLE: "IDLE",
        MOVING: "MOVING",
        DOOR_OPENING: "DOOR_OPENING",
        DOOR_OPEN: "DOOR_OPEN",
        DOOR_CLOSING: "DOOR_CLOSING",
    };

    const DEFAULT_OPTS = {
        floorCount: 6,
        maxCapacity: 4,
        floorHeight: 3.4,
        // door + motion timings (seconds, sim-time)
        doorOpenTime: 0.9,
        doorCloseTime: 0.9,
        minDoorOpenS: 2.4,
        maxDoorOpenS: 14.0,
        // car speed in floors per second (sim-time)
        carSpeedFps: 1.6,
    };

    // 4 logical interior spots, arranged 2x2 in the car
    const INTERIOR_SPOTS = [
        { dx: -0.7, dz: -0.5 },
        { dx: 0.7, dz: -0.5 },
        { dx: -0.7, dz: 0.5 },
        { dx: 0.7, dz: 0.5 },
    ];

    class ElevatorLogic {
        constructor(opts) {
            this.opts = Object.assign({}, DEFAULT_OPTS, opts || {});
            this.STATES = STATES;
            this.reset();
        }

        reset() {
            this.state = STATES.IDLE;
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.direction = 0; // -1, 0, +1
            this.position = 0; // current y in "floor units" (e.g., 0..floorCount-1)

            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();

            this.doorTimer = 0;
            this.doorOpenAmount = 0; // 0..1
            this.lastServedFloor = -1;
            this.lastServedDirection = 0;
            this.servedThisDoorCycle = false;
            this._abandonedPendingThisCycle = false;
            this.spotOccupancy = [false, false, false, false];
        }

        // ---- public API ----------------------------------------------------

        callUp(floor) {
            if (floor < 0 || floor >= this.opts.floorCount) return;
            if (floor === this.opts.floorCount - 1) return; // top floor: no up call
            this.upCalls.add(floor);
        }
        callDown(floor) {
            if (floor < 0 || floor >= this.opts.floorCount) return;
            if (floor === 0) return; // ground: no down call
            this.downCalls.add(floor);
        }
        pressDestination(floor) {
            if (floor < 0 || floor >= this.opts.floorCount) return;
            this.destinations.add(floor);
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== STATES.DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            if (this.doorTimer < this.opts.doorOpenTime) return false; // doors not fully open
            // No more stops in current direction OR caller's direction matches
            if (this.direction === 0) return true;
            if (direction === this.direction) return true;
            // Allow opposite-direction boarding if no remaining stops in current direction
            if (!this._hasWorkInDirection(this.direction)) return true;
            return false;
        }

        currentCapacityFree() {
            return this.opts.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            let idx = -1;
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (!this.spotOccupancy[i]) { idx = i; break; }
            }
            if (idx < 0) return null;
            this.spotOccupancy[idx] = true;
            this.pendingBoarders.add(person);
            const s = INTERIOR_SPOTS[idx];
            return { index: idx, x: s.dx, y: 0, z: s.dz };
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            this.pendingDisembark.add(person);
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
            this.passengers.delete(person);
            // release the person's spot if they were assigned one
            if (person && person.userData && typeof person.userData._elevatorSpotIndex === "number") {
                const idx = person.userData._elevatorSpotIndex;
                if (idx >= 0 && idx < this.spotOccupancy.length) {
                    this.spotOccupancy[idx] = false;
                }
                person.userData._elevatorSpotIndex = -1;
            } else {
                // best-effort: if no index, leave occupancy alone
            }
        }

        // ---- per-frame tick -----------------------------------------------

        tick(dt) {
            // motion is in floors per sim-second
            switch (this.state) {
                case STATES.IDLE:
                    this._chooseNextTarget();
                    if (this.targetFloor !== this.currentFloor) {
                        this.state = STATES.MOVING;
                    } else if (this._anyCallOrDestAt(this.currentFloor)) {
                        // Open here
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        this.doorOpenAmount = 0;
                    }
                    break;

                case STATES.MOVING: {
                    // re-evaluate target each frame: if a closer same-direction stop appears, clip
                    this._maybeReevaluateTargetWhileMoving();

                    const speed = this.opts.carSpeedFps;
                    const targetPos = this.targetFloor;
                    const dist = targetPos - this.position;
                    const stepMag = speed * dt;
                    if (Math.abs(dist) <= stepMag) {
                        this.position = targetPos;
                        this.currentFloor = this.targetFloor;
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = 0;
                        this.doorOpenAmount = 0;
                    } else {
                        const sign = dist > 0 ? 1 : -1;
                        this.position += sign * stepMag;
                        // currentFloor follows for HUD purposes
                        this.currentFloor = Math.round(this.position);
                    }
                    break;
                }

                case STATES.DOOR_OPENING: {
                    this.doorTimer += dt;
                    this.doorOpenAmount = Math.min(1, this.doorTimer / this.opts.doorOpenTime);
                    if (this.doorTimer >= this.opts.doorOpenTime) {
                        this.state = STATES.DOOR_OPEN;
                        this.doorTimer = this.opts.doorOpenTime;
                        this.doorOpenAmount = 1;
                        this.servedThisDoorCycle = false;
                        this._serveCurrentFloor();
                    }
                    break;
                }

                case STATES.DOOR_OPEN: {
                    this.doorTimer += dt;

                    const minOpen = this.opts.minDoorOpenS;
                    const maxOpen = this.opts.maxDoorOpenS;
                    const haveHolders = this.pendingBoarders.size > 0 || this.pendingDisembark.size > 0;
                    const hitMax = this.doorTimer >= maxOpen;

                    if (this.doorTimer >= minOpen && (!haveHolders || hitMax)) {
                        this._serveCurrentFloor();
                        const willHaveTarget = this._peekNextTarget();
                        let shouldClose = true;

                        if (willHaveTarget === this.currentFloor) {
                            if (this.passengers.size > 0 && this.destinations.size > 0) {
                                shouldClose = true;
                            } else if (!this.servedThisDoorCycle) {
                                this._serveCurrentFloor();
                                shouldClose = true;
                            } else {
                                shouldClose = true;
                            }
                        }

                        if (shouldClose) {
                            // Safety-cap close: drop unfulfilled pending sets so they
                            // can't re-trigger an open during the close transition.
                            // The visual sim's stall detection will recover stranded boarders.
                            if (hitMax && haveHolders) {
                                this._abandonedPendingThisCycle = true;
                                // free their reserved spots
                                for (const p of this.pendingBoarders) {
                                    if (p && p.userData && typeof p.userData._elevatorSpotIndex === "number") {
                                        const idx = p.userData._elevatorSpotIndex;
                                        if (idx >= 0 && idx < this.spotOccupancy.length) {
                                            this.spotOccupancy[idx] = false;
                                        }
                                        p.userData._elevatorSpotIndex = -1;
                                    }
                                }
                                this.pendingBoarders.clear();
                                this.pendingDisembark.clear();
                            }
                            this.state = STATES.DOOR_CLOSING;
                            this.doorTimer = 0;
                        }
                    }
                    break;
                }

                case STATES.DOOR_CLOSING: {
                    this.doorTimer += dt;
                    this.doorOpenAmount = Math.max(0, 1 - (this.doorTimer / this.opts.doorCloseTime));
                    // Safety: a new pending boarder may arrive while doors are still
                    // mostly open. Reopen for them — UNLESS this close was a forced
                    // safety-cap close, in which case we ignore.
                    if (
                        !this._abandonedPendingThisCycle &&
                        this.pendingBoarders.size > 0 &&
                        this.doorOpenAmount > 0.3
                    ) {
                        this.state = STATES.DOOR_OPENING;
                        this.doorTimer = this.doorOpenAmount * this.opts.doorOpenTime;
                        break;
                    }
                    if (this.doorTimer >= this.opts.doorCloseTime) {
                        this.doorOpenAmount = 0;
                        this._abandonedPendingThisCycle = false;
                        this._chooseNextTarget();
                        if (this.targetFloor !== this.currentFloor) {
                            this.state = STATES.MOVING;
                        } else {
                            this.state = STATES.IDLE;
                        }
                    }
                    break;
                }
            }
        }

        // ---- internal helpers ---------------------------------------------

        _hasWorkInDirection(dir) {
            if (dir === 0) return this._anyWorkAnywhere();
            if (dir > 0) {
                for (const f of this.destinations) if (f > this.currentFloor) return true;
                for (const f of this.upCalls) if (f > this.currentFloor) return true;
                for (const f of this.downCalls) if (f > this.currentFloor) return true;
                return false;
            } else {
                for (const f of this.destinations) if (f < this.currentFloor) return true;
                for (const f of this.downCalls) if (f < this.currentFloor) return true;
                for (const f of this.upCalls) if (f < this.currentFloor) return true;
                return false;
            }
        }

        _anyWorkAnywhere() {
            return this.destinations.size > 0 || this.upCalls.size > 0 || this.downCalls.size > 0;
        }

        _anyCallOrDestAt(floor) {
            if (this.destinations.has(floor)) return true;
            if (this.upCalls.has(floor)) return true;
            if (this.downCalls.has(floor)) return true;
            return false;
        }

        _serveCurrentFloor() {
            const f = this.currentFloor;
            let served = false;
            if (this.destinations.has(f)) {
                this.destinations.delete(f);
                served = true;
            }
            // Serve hall call matching current direction (or either when idle)
            if (this.direction >= 0 && this.upCalls.has(f)) {
                this.upCalls.delete(f);
                served = true;
                if (this.direction === 0) this.direction = +1;
            }
            if (this.direction <= 0 && this.downCalls.has(f)) {
                this.downCalls.delete(f);
                served = true;
                if (this.direction === 0) this.direction = -1;
            }
            // No more stops in current direction → also serve opposite-dir call here
            if (!this._hasWorkInDirection(this.direction)) {
                if (this.direction >= 0 && this.downCalls.has(f)) {
                    this.downCalls.delete(f);
                    served = true;
                }
                if (this.direction <= 0 && this.upCalls.has(f)) {
                    this.upCalls.delete(f);
                    served = true;
                }
            }
            if (served) {
                this.servedThisDoorCycle = true;
                this.lastServedFloor = f;
                this.lastServedDirection = this.direction;
            }
        }

        // Look at next target without committing to it
        _peekNextTarget() {
            const t = this._computeNextTarget();
            return t;
        }

        _chooseNextTarget() {
            const t = this._computeNextTarget();
            if (t === null) {
                this.targetFloor = this.currentFloor;
                this.direction = 0;
                return;
            }
            this.targetFloor = t;
            if (t > this.currentFloor) this.direction = +1;
            else if (t < this.currentFloor) this.direction = -1;
            else this.direction = this.direction || 0;
        }

        _computeNextTarget() {
            // Anti-starvation: if there are passengers with destinations,
            // ALWAYS prefer a passenger destination over a same-floor hall call.
            const hasPassengerDests = this.passengers.size > 0 && this.destinations.size > 0;

            // 1) prefer continuing in current direction
            if (this.direction !== 0) {
                const ahead = this._closestStopAhead(this.direction, hasPassengerDests);
                if (ahead !== null) return ahead;

                // No work ahead — try to reverse
                const behindDir = -this.direction;
                const behind = this._closestStopAhead(behindDir, hasPassengerDests);
                if (behind !== null) return behind;
            } else {
                // 2) idle: pick nearest active anything
                const nearest = this._nearestActiveStop(hasPassengerDests);
                if (nearest !== null) return nearest;
            }

            return null;
        }

        // Find the closest stop strictly in given direction (or at currentFloor if no destinations)
        _closestStopAhead(dir, hasPassengerDests) {
            const f = this.currentFloor;
            let best = null;
            const consider = (floor, allowed) => {
                if (!allowed) return;
                if (best === null) { best = floor; return; }
                if (Math.abs(floor - f) < Math.abs(best - f)) best = floor;
            };

            // destinations: anything matching dir (and at currentFloor if not yet served)
            for (const fl of this.destinations) {
                if (dir > 0 && fl > f) consider(fl, true);
                else if (dir < 0 && fl < f) consider(fl, true);
            }
            // matching-direction hall calls in dir
            const sameCalls = dir > 0 ? this.upCalls : this.downCalls;
            for (const fl of sameCalls) {
                if (dir > 0 && fl > f) consider(fl, true);
                else if (dir < 0 && fl < f) consider(fl, true);
            }
            // farthest opposite-direction hall call ahead — pick it after we've gone to end
            if (best === null) {
                // also accept opposite-direction hall calls in dir
                const oppCalls = dir > 0 ? this.downCalls : this.upCalls;
                for (const fl of oppCalls) {
                    if (dir > 0 && fl > f) consider(fl, true);
                    else if (dir < 0 && fl < f) consider(fl, true);
                }
            }

            // Same-floor: only if there are no passenger destinations elsewhere AND
            // this is not a re-trigger we just served.
            if (best === null && !hasPassengerDests) {
                if (this._anyCallAt(f) && (this.lastServedFloor !== f || !this.servedThisDoorCycle)) {
                    return null; // don't loop on same floor without a real ahead-target
                }
            }
            return best;
        }

        _anyCallAt(floor) {
            return this.upCalls.has(floor) || this.downCalls.has(floor);
        }

        _nearestActiveStop(hasPassengerDests) {
            const f = this.currentFloor;
            let best = null;
            const consider = (floor) => {
                if (best === null) { best = floor; return; }
                if (Math.abs(floor - f) < Math.abs(best - f)) best = floor;
            };
            // Prefer destinations first when riders are aboard
            if (hasPassengerDests) {
                for (const fl of this.destinations) consider(fl);
                if (best !== null) return best;
            }
            for (const fl of this.destinations) consider(fl);
            for (const fl of this.upCalls) consider(fl);
            for (const fl of this.downCalls) consider(fl);
            // Avoid picking the current floor as the "next" target if we just served it
            if (best === f && this.servedThisDoorCycle) {
                let next = null;
                for (const fl of this.destinations) {
                    if (fl === f) continue;
                    if (next === null || Math.abs(fl - f) < Math.abs(next - f)) next = fl;
                }
                for (const fl of this.upCalls) {
                    if (fl === f) continue;
                    if (next === null || Math.abs(fl - f) < Math.abs(next - f)) next = fl;
                }
                for (const fl of this.downCalls) {
                    if (fl === f) continue;
                    if (next === null || Math.abs(fl - f) < Math.abs(next - f)) next = fl;
                }
                if (next !== null) return next;
            }
            return best;
        }

        _maybeReevaluateTargetWhileMoving() {
            // If moving up and a closer destination appears between us and target, clip target.
            if (this.direction === 0) return;
            const f = this.currentFloor;
            // candidate set: destinations (always), and same-direction hall calls
            let candidate = null;
            const sameCalls = this.direction > 0 ? this.upCalls : this.downCalls;
            const considerStop = (fl) => {
                if (this.direction > 0 && fl > f && fl < this.targetFloor) {
                    if (candidate === null || fl < candidate) candidate = fl;
                } else if (this.direction < 0 && fl < f && fl > this.targetFloor) {
                    if (candidate === null || fl > candidate) candidate = fl;
                }
            };
            for (const fl of this.destinations) considerStop(fl);
            for (const fl of sameCalls) considerStop(fl);

            if (candidate !== null) {
                this.targetFloor = candidate;
            }
        }
    }

    // Constants exposed for testing/inspection
    ElevatorLogic.STATES = STATES;
    ElevatorLogic.INTERIOR_SPOTS = INTERIOR_SPOTS;

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic, STATES, INTERIOR_SPOTS };
    }
})(typeof window !== "undefined" ? window : globalThis);
