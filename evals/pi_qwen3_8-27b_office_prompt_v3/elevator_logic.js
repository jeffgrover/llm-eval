/**
 * elevator_logic.js - pure elevator scheduler / state machine.
 * No Three.js, no DOM, no canvas. Runs in the browser (window.ElevatorLogic)
 * and under Node for tests (module.exports).
 *
 * State machine: IDLE -> MOVING -> DOOR_OPENING -> DOOR_OPEN -> DOOR_CLOSING -> (IDLE | MOVING)
 * Scheduling: SCAN with anti-starvation guards. Passenger destinations and
 * pending boarders/disembarkers always outrank fresh hall calls; the same
 * floor can never re-open doors repeatedly while in-car work remains.
 */
(function (root) {
    "use strict";

    var MIN_DOOR_OPEN_S = 2.0;   // minimum seconds a door stays open once fully open
    var MAX_DOOR_OPEN_S = 14.0;  // safety cap: doors close even if something never completes
    var DOOR_TRAVEL_S = 0.9;     // time for the door to swing fully open (or closed)
    var DEFAULT_CAR_SPEED = 1.5; // world units / second at 1x realtime (~2.3 s per floor)

    function clampFloor(floor, floorCount) {
        if (!isFinite(floor)) return 0;
        return Math.max(0, Math.min(floorCount - 1, Math.round(floor)));
    }

    class ElevatorLogic {
        constructor(options) {
            options = options || {};
            this.floorCount = options.floorCount || 6;
            this.maxCapacity = options.maxCapacity || 4;
            this.floorHeight = options.floorHeight || 3.4;
            this.minDoorOpenS = (typeof options.minDoorOpenS === "number") ? options.minDoorOpenS : MIN_DOOR_OPEN_S;
            this.maxDoorOpenS = (typeof options.maxDoorOpenS === "number") ? options.maxDoorOpenS : MAX_DOOR_OPEN_S;

            // Four logical interior standing spots, in car-local coordinates
            // (car group origin = shaft center at floor level, +Z faces the doors).
            this.interiorSpots = [
                { x: -0.5, y: 0, z: -0.35 },
                { x: 0.5, y: 0, z: -0.35 },
                { x: -0.5, y: 0, z: 0.42 },
                { x: 0.5, y: 0, z: 0.42 }
            ];

            this.reset();
        }

        reset() {
            this.state = "IDLE";
            this.direction = 0;      // +1 up, 0 parked, -1 down
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.positionY = 0;      // car floor height (visual adapter keeps in sync)
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [null, null, null, null];
            this.doorProgress = 0;   // 0 = closed, 1 = fully open (visual smoothing)
            this.doorTimer = 0;      // seconds spent in the current door-open window
            this.servedThisDoorCycle = false; // guard: this floor already served this stop
            this.lastServedFloor = -1;
        }

        // ---------------- public inputs ----------------

        callUp(floor) {
            // Always queues. Same-floor re-presses while doors are open stay
            // queued for the next trip; the DOOR_CLOSING phase only honors a
            // fresh local call when the car has no passenger work, which is
            // what prevents full-car lobby starvation loops.
            this.upCalls.add(clampFloor(floor, this.floorCount));
        }

        callDown(floor) {
            this.downCalls.add(clampFloor(floor, this.floorCount));
        }

        pressDestination(floor) {
            this.destinations.add(clampFloor(floor, this.floorCount));
        }

        clearCallAt(floor, dir) {
            if (dir >= 0) this.upCalls.delete(floor);
            else this.downCalls.delete(floor);
        }

        /** Integer floor the car body currently occupies (for visuals/agents). */
        floorOfY(yValue) {
            if (!isFinite(yValue)) return this.currentFloor;
            const exact = Math.round(yValue / this.floorHeight);
            if (Math.abs(yValue - exact * this.floorHeight) < 0.02) return exact;
            return yValue > exact * this.floorHeight ? exact + 1 : exact;
        }

        isAcceptingAt(floor, direction) {
            if (this.state !== "DOOR_OPEN") return false;
            if (this.currentFloor !== floor) return false;
            // Accept when the car has no more stops pending in the caller's
            // direction, or when it is heading exactly that way.
            var pendingAhead = this.nearestWorkInDirection(direction);
            if (pendingAhead === null) return true;
            return this.direction === direction;
        }

        currentCapacityFree() {
            return this.maxCapacity - this.passengers.size - this.pendingBoarders.size;
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            var index = this.spotOccupancy.indexOf(null);
            if (index === -1) return null;
            this.spotOccupancy[index] = person;
            this.pendingBoarders.add(person);
            var spot = this.interiorSpots[index % this.interiorSpots.length];
            return { index: index, x: spot.x, y: spot.y, z: spot.z };
        }

        completeBoard(person) {
            if (!this.pendingBoarders.has(person)) return;
            this.pendingBoarders.delete(person);
            this.passengers.add(person);
        }

        registerDisembark(person) {
            if (this.pendingDisembark.has(person)) return;
            this.passengers.delete(person);
            this.pendingDisembark.add(person);
            for (var i = 0; i < this.spotOccupancy.length; i += 1) {
                if (this.spotOccupancy[i] === person) this.spotOccupancy[i] = null;
            }
        }

        completeDisembark(person) {
            this.pendingDisembark.delete(person);
        }

        // ---------------- scheduling helpers ----------------

        callSet(dir) {
            return dir >= 0 ? this.upCalls : this.downCalls;
        }

        /** Nearest floor (in the given direction, excluding current) with a relevant stop. */
        nearestWorkInDirection(dir) {
            if (dir === 0) return null;
            var calls = this.callSet(dir);
            for (var f = this.currentFloor + dir; f >= 0 && f < this.floorCount; f += dir) {
                if (this.destinations.has(f) || calls.has(f)) return f;
            }
            return null;
        }

        /** Nearest floor (either direction) with any work at all, excluding current. */
        nearestWorkAny() {
            var best = null;
            var bestDist = Infinity;
            for (var f = 0; f < this.floorCount; f += 1) {
                if (f === this.currentFloor) continue;
                if (!this.destinations.has(f) && !this.upCalls.has(f) && !this.downCalls.has(f)) continue;
                var dist = Math.abs(f - this.currentFloor);
                if (dist < bestDist) { best = f; bestDist = dist; }
            }
            return best;
        }

        hasPassengerWork() {
            return this.passengers.size > 0 || this.destinations.size > 0;
        }

        /**
         * Choose the next target floor after doors close (or when idle with work).
         * SCAN: keep going in the current direction if there is work ahead,
         * otherwise reverse and look behind. Passenger destinations never get
         * overridden by same-floor hall calls because those are already gone
         * by the time we get here (clearServedAtFloor removes them on arrival).
         */
        pickNextTarget() {
            if (this.direction !== 0) {
                var ahead = this.nearestWorkInDirection(this.direction);
                if (ahead !== null && ahead !== this.currentFloor) {
                    this.targetFloor = ahead;
                    this.state = "MOVING";
                    return true;
                }
            }
            // Nothing ahead: look behind (reverse direction).
            var upAhead = this.nearestWorkInDirection(1);
            var downAhead = this.nearestWorkInDirection(-1);
            if (upAhead !== null && downAhead !== null) {
                // Both directions have work: keep whichever the current heading prefers;
                // tie breaks to the closer one.
                if (this.direction === 1) { this.targetFloor = upAhead; }
                else if (this.direction === -1) { this.targetFloor = downAhead; }
                else {
                    this.targetFloor = (Math.abs(upAhead - this.currentFloor) <= Math.abs(downAhead - this.currentFloor)) ? upAhead : downAhead;
                }
            } else if (upAhead !== null) {
                this.targetFloor = upAhead;
            } else if (downAhead !== null) {
                this.targetFloor = downAhead;
            } else {
                // No work anywhere: park in place.
                this.direction = 0;
                this.targetFloor = this.currentFloor;
                this.state = "IDLE";
                return false;
            }
            this.direction = (this.targetFloor > this.currentFloor) ? 1 : -1;
            this.state = "MOVING";
            return true;
        }

        /** On arrival with doors opening: clear the stops that this visit serves. */
        clearServedAtFloor() {
            this.destinations.delete(this.currentFloor);
            if (this.direction >= 0) this.upCalls.delete(this.currentFloor);
            else this.downCalls.delete(this.currentFloor);
            this.lastServedFloor = this.currentFloor;
            this.servedThisDoorCycle = true;
            // If no work remains in the current direction, serve the opposite
            // call at this floor too so it is not left stranded.
            if (this.nearestWorkInDirection(this.direction) === null) {
                this.clearCallAt(this.currentFloor, -this.direction);
            }
        }

        /** Doors only close when nothing is mid-handshake and the min open time passed. */
        doorsMayClose() {
            return this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
        }

        // ---------------- main tick ----------------

        tick(dt) {
            if (!isFinite(dt) || dt < 0) return;

            switch (this.state) {
                case "IDLE": {
                    // A brand-new call while parked: answer it directly.
                    var work = this.nearestWorkAny();
                    if (work === null && (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor))) {
                        this.direction = this.upCalls.has(this.currentFloor) ? 1 : -1;
                        this.targetFloor = this.currentFloor;
                        this.doorTimer = 0;
                        this.servedThisDoorCycle = false;
                        this.state = "DOOR_OPENING";
                    } else if (work !== null) {
                        this.targetFloor = work;
                        this.direction = (work > this.currentFloor) ? 1 : -1;
                        this.state = "MOVING";
                    }
                    break;
                }

                case "MOVING": {
                    // Re-evaluate every frame: a closer stop in the same direction wins.
                    var ahead = this.nearestWorkInDirection(this.direction);
                    if (ahead !== null && ahead !== this.currentFloor) {
                        var signedCurrent = this.targetFloor - this.currentFloor;
                        var signedAhead = ahead - this.currentFloor;
                        if (signedCurrent * this.direction >= 0 && Math.abs(signedAhead) < Math.abs(signedCurrent)) {
                            this.targetFloor = ahead;
                        }
                    }
                    var step = this.carSpeedOf() * dt;
                    var delta = this.targetFloor * this.floorHeight - this.positionY;
                    if (Math.abs(delta) <= step) {
                        this.positionY = this.targetFloor * this.floorHeight;
                        this.currentFloor = this.targetFloor;
                        // direction is kept so the door-open/clear phase knows
                        // which hall call it just served; zeroed only when parking.
                        this.doorTimer = 0;
                        this.state = "DOOR_OPENING";
                    } else {
                        this.positionY += (delta > 0 ? step : -step);
                    }
                    break;
                }

                case "DOOR_OPENING": {
                    this.doorProgress = Math.min(1, this.doorProgress + dt / DOOR_TRAVEL_S);
                    if (this.doorProgress >= 1) {
                        this.state = "DOOR_OPEN";
                        this.doorTimer = 0;
                        this.clearServedAtFloor();
                    }
                    break;
                }

                case "DOOR_OPEN": {
                    this.doorTimer += dt;
                    var safeToClose = this.doorsMayClose();
                    if (safeToClose && this.doorTimer >= this.minDoorOpenS) {
                        this.state = "DOOR_CLOSING";
                    } else if (this.doorTimer >= this.maxDoorOpenS) {
                        // Safety cap: even an unfinished handshake must not hold the car forever.
                        this.state = "DOOR_CLOSING";
                    }
                    break;
                }

                case "DOOR_CLOSING": {
                    this.doorProgress = Math.max(0, this.doorProgress - dt / DOOR_TRAVEL_S);
                    if (this.doorProgress <= 0) {
                        this.doorTimer = 0;
                        // A new same-floor call may have appeared while closing.
                        // Only honor it when the car has no passenger work left;
                        // otherwise it stays queued for the next pass.
                        var localCall = (this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor));
                        if (localCall && !this.hasPassengerWork()) {
                            this.direction = this.upCalls.has(this.currentFloor) ? 1 : -1;
                            this.servedThisDoorCycle = false;
                            this.state = "DOOR_OPENING";
                            break;
                        }
                        var picked = this.pickNextTarget();
                        if (!picked) {
                            this.direction = 0;
                            this.targetFloor = this.currentFloor;
                            this.state = "IDLE";
                        }
                    }
                    break;
                }

                default:
                    this.reset();
            }
        }

        carSpeedOf() {
            return (typeof this.carSpeed === "number" && this.carSpeed > 0) ? this.carSpeed : DEFAULT_CAR_SPEED;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
