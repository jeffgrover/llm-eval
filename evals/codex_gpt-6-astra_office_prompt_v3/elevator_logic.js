(function (root) {
    'use strict';
    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 } = {}) {
            this.floorCount = floorCount; this.maxCapacity = maxCapacity; this.floorHeight = floorHeight;
            this.speed = 1.8; this.DOOR_TRAVEL_S = 1.1;
            this.MIN_DOOR_OPEN_S = 3; this.MAX_DOOR_OPEN_S = 18;
            this.upCalls = new Set(); this.downCalls = new Set(); this.destinations = new Set();
            this.passengers = new Set(); this.pendingBoarders = new Set(); this.pendingDisembark = new Set();
            this.personSpots = new Map(); this.reset();
        }
        valid(floor) { return Number.isInteger(floor) && floor >= 0 && floor < this.floorCount; }
        callUp(floor) { if (this.valid(floor) && floor < this.floorCount - 1) this.upCalls.add(floor); }
        callDown(floor) { if (this.valid(floor) && floor > 0) this.downCalls.add(floor); }
        pressDestination(floor) {
            if (!this.valid(floor)) return;
            if (this.state === 'DOOR_OPEN' && floor === this.currentFloor) return;
            if (this.state === 'DOOR_OPEN' && !this.hasAhead(this.direction)) this.direction = Math.sign(floor - this.currentFloor) || this.direction;
            this.destinations.add(floor);
        }
        currentCapacityFree() { return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size); }
        activeFloors() { return [...new Set([...this.destinations, ...this.upCalls, ...this.downCalls])]; }
        matchingCalls(direction) { return direction > 0 ? this.upCalls : this.downCalls; }
        hasAhead(direction) {
            if (!direction) return false;
            return [...this.destinations, ...this.matchingCalls(direction)].some((floor) => (floor * this.floorHeight - this.positionY) * direction > 0.001);
        }
        isAcceptingAt(floor, direction) {
            return this.state === 'DOOR_OPEN' && this.currentFloor === floor &&
                (direction === this.direction || !this.hasAhead(this.direction));
        }
        reserveBoardingSpot(person) {
            if (this.personSpots.has(person)) return this.personSpots.get(person);
            if (this.state !== 'DOOR_OPEN' || this.currentCapacityFree() <= 0) return null;
            const index = this.spotOccupancy.indexOf(null);
            if (index < 0) return null;
            const spot = { index, x: index % 2 ? 0.65 : -0.65, y: 0, z: index < 2 ? -0.6 : 0.6 };
            this.spotOccupancy[index] = person; this.personSpots.set(person, spot); this.pendingBoarders.add(person);
            return spot;
        }
        completeBoard(person) {
            if (!this.pendingBoarders.delete(person)) return false;
            this.passengers.add(person); return true;
        }
        registerDisembark(person) { if (this.passengers.has(person)) this.pendingDisembark.add(person); }
        completeDisembark(person) {
            this.pendingDisembark.delete(person); this.passengers.delete(person); this.pendingBoarders.delete(person);
            const spot = this.personSpots.get(person);
            if (spot) this.spotOccupancy[spot.index] = null;
            this.personSpots.delete(person);
        }
        reset() {
            [this.upCalls, this.downCalls, this.destinations, this.passengers, this.pendingBoarders, this.pendingDisembark].forEach((set) => set.clear());
            this.personSpots.clear(); this.spotOccupancy = Array(this.maxCapacity).fill(null);
            this.state = 'IDLE'; this.direction = 0; this.currentFloor = 0; this.targetFloor = null;
            this.positionY = 0; this.doorAmount = 0; this.doorTimer = 0; this.openTimer = 0;
            this.servedThisDoorCycle = false; this.lastServedFloor = null;
        }
        nearest(floors) { return floors.sort((a, b) => Math.abs(a * this.floorHeight - this.positionY) - Math.abs(b * this.floorHeight - this.positionY) || a - b)[0]; }
        selectTarget() {
            const all = this.activeFloors();
            if (!all.length) { this.targetFloor = null; this.direction = 0; this.state = 'IDLE'; return; }
            const away = all.filter((floor) => floor !== this.currentFloor);
            // A loaded car must depart: repeated same-floor calls are retained for a later trip.
            const carrying = this.passengers.size > 0 && this.destinations.size > 0;
            const suppressSame = carrying || this.currentCapacityFree() <= 0 || (this.servedThisDoorCycle && away.length > 0);
            let direction = this.direction;
            let target;
            if (!direction) {
                const pool = suppressSame ? away : all;
                target = this.nearest(pool);
                if (target === undefined) { this.state = 'IDLE'; return; }
                direction = Math.sign(target - this.currentFloor) || (this.upCalls.has(target) ? 1 : -1);
            } else {
                // SCAN: matching calls and cabin destinations first, then the farthest
                // opposite hall call ahead (the turnaround point), then reverse.
                for (const scanDirection of [direction, -direction]) {
                    const eligible = [...this.destinations, ...(this.currentCapacityFree() > 0 ? this.matchingCalls(scanDirection) : [])]
                        .filter((floor) => (floor - this.currentFloor) * scanDirection > 0);
                    if (eligible.length) { target = this.nearest(eligible); direction = scanDirection; break; }
                    if (!carrying && this.currentCapacityFree() > 0) {
                        const turnarounds = away.filter((floor) => (floor - this.currentFloor) * scanDirection > 0);
                        if (turnarounds.length) { target = turnarounds.sort((a, b) => (b - a) * scanDirection)[0]; direction = scanDirection; break; }
                    }
                }
                if (target === undefined && !suppressSame && all.includes(this.currentFloor)) target = this.currentFloor;
                if (target === undefined && away.length) { target = this.nearest(away); direction = Math.sign(target - this.currentFloor); }
            }
            if (target === undefined) { this.state = 'IDLE'; this.targetFloor = null; return; }
            this.direction = direction; this.targetFloor = target;
            if (target === this.currentFloor) { this.state = 'DOOR_OPENING'; this.doorTimer = 0; }
            else { this.servedThisDoorCycle = false; this.state = 'MOVING'; }
        }
        arrive() {
            this.state = 'DOOR_OPEN'; this.openTimer = 0; this.doorTimer = 0; this.doorAmount = 1;
            this.destinations.delete(this.currentFloor);
            this.matchingCalls(this.direction).delete(this.currentFloor);
            if (!this.hasAhead(this.direction)) {
                const opposite = this.matchingCalls(-this.direction);
                if (opposite.has(this.currentFloor)) this.direction = -this.direction;
                this.upCalls.delete(this.currentFloor); this.downCalls.delete(this.currentFloor);
            }
            this.servedThisDoorCycle = true; this.lastServedFloor = this.currentFloor;
        }
        tick(dt) {
            if (!Number.isFinite(dt) || dt <= 0) return;
            // Consume all time, even when called with a large accelerated frame.
            let remaining = dt;
            while (remaining > 0.0000001) {
                const step = Math.min(remaining, 0.1); remaining -= step;
                if (this.state === 'IDLE') { this.selectTarget(); continue; }
                if (this.state === 'MOVING') {
                    const eligible = [...this.destinations, ...(this.currentCapacityFree() > 0 ? this.matchingCalls(this.direction) : [])];
                    eligible.forEach((floor) => {
                        const ahead = (floor * this.floorHeight - this.positionY) * this.direction;
                        const targetDistance = (this.targetFloor * this.floorHeight - this.positionY) * this.direction;
                        if (ahead > 0.001 && ahead < targetDistance) this.targetFloor = floor;
                    });
                    const targetY = this.targetFloor * this.floorHeight;
                    const distance = targetY - this.positionY;
                    if (Math.abs(distance) <= this.speed * step) {
                        this.positionY = targetY; this.currentFloor = this.targetFloor;
                        this.state = 'DOOR_OPENING'; this.doorTimer = 0;
                    } else { this.positionY += Math.sign(distance) * this.speed * step; this.currentFloor = Math.round(this.positionY / this.floorHeight); }
                } else if (this.state === 'DOOR_OPENING') {
                    this.doorTimer += step; this.doorAmount = Math.min(1, this.doorTimer / this.DOOR_TRAVEL_S);
                    if (this.doorTimer >= this.DOOR_TRAVEL_S) this.arrive();
                } else if (this.state === 'DOOR_OPEN') {
                    this.openTimer += step;
                    const clear = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
                    if ((clear && this.openTimer >= this.MIN_DOOR_OPEN_S) || this.openTimer >= this.MAX_DOOR_OPEN_S) {
                        this.state = 'DOOR_CLOSING'; this.doorTimer = 0;
                    }
                } else if (this.state === 'DOOR_CLOSING') {
                    this.doorTimer += step; this.doorAmount = Math.max(0, 1 - this.doorTimer / this.DOOR_TRAVEL_S);
                    if (this.doorTimer >= this.DOOR_TRAVEL_S) { this.doorAmount = 0; this.selectTarget(); }
                }
            }
        }
    }
    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) module.exports = { ElevatorLogic };
})(typeof window !== 'undefined' ? window : globalThis);
