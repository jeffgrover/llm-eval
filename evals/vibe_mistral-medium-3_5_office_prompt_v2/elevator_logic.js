(function(root) {
    const IDLE = 'IDLE';
    const MOVING = 'MOVING';
    const DOOR_OPENING = 'DOOR_OPENING';
    const DOOR_OPEN = 'DOOR_OPEN';
    const DOOR_CLOSING = 'DOOR_CLOSING';

    const MIN_DOOR_OPEN_S = 1.5;
    const MAX_DOOR_OPEN_S = 8.0;
    const DOOR_MOVE_S = 0.8;

    class ElevatorLogic {
        constructor({ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 } = {}) {
            this.floorCount = floorCount;
            this.maxCapacity = maxCapacity;
            this.floorHeight = floorHeight;
            this.reset();
        }

        reset() {
            this.state = IDLE;
            this.direction = 0; // +1 = up, -1 = down, 0 = idle
            this.currentFloor = 0;
            this.targetFloor = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = [false, false, false, false]; // 4 spots
            this.doorOpenTimer = 0;
            this.servedThisDoorCycle = null;
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

        isAcceptingAt(floor, direction) {
            if (this.state !== DOOR_OPEN) return false;
            if (this.currentFloor !== floor) return false;
            
            // Must have capacity
            if (this.currentCapacityFree() <= 0) return false;
            
            // Check direction match or no pending work
            const hasUpWork = this._hasWorkInDirection(1);
            const hasDownWork = this._hasWorkInDirection(-1);
            
            if (this.direction === 1 && direction === 1) return true;
            if (this.direction === -1 && direction === -1) return true;
            
            // If we have work in current direction, only accept matching direction
            if (this.direction === 1 && hasUpWork && direction !== 1) return false;
            if (this.direction === -1 && hasDownWork && direction !== -1) return false;
            
            // No work in current direction - accept either
            return true;
        }

        currentCapacityFree() {
            return this.maxCapacity - (this.passengers.size + this.pendingBoarders.size);
        }

        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            
            const freeIndex = this.spotOccupancy.indexOf(false);
            if (freeIndex === -1) return null;
            
            this.spotOccupancy[freeIndex] = true;
            this.pendingBoarders.add(person);
            
            // Return spot info
            return { index: freeIndex, x: (freeIndex % 2 === 0 ? -0.8 : 0.8), y: 0, z: (Math.floor(freeIndex / 2) === 0 ? -0.4 : 0.4) };
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
            
            // Release the spot
            for (let i = 0; i < this.spotOccupancy.length; i++) {
                if (this.spotOccupancy[i]) {
                    this.spotOccupancy[i] = false;
                    break;
                }
            }
        }

        tick(dt) {
            switch (this.state) {
                case IDLE:
                    this._tickIdle(dt);
                    break;
                case MOVING:
                    this._tickMoving(dt);
                    break;
                case DOOR_OPENING:
                    this._tickDoorOpening(dt);
                    break;
                case DOOR_OPEN:
                    this._tickDoorOpen(dt);
                    break;
                case DOOR_CLOSING:
                    this._tickDoorClosing(dt);
                    break;
            }
        }

        _tickIdle(dt) {
            // Check if there's work to do
            const hasCalls = this.upCalls.size > 0 || this.downCalls.size > 0;
            const hasDests = this.destinations.size > 0;
            
            if (!hasCalls && !hasDests) return;
            
            // Pick the nearest target
            const closest = this._findClosestTarget();
            if (closest !== null) {
                this.targetFloor = closest.floor;
                this.direction = closest.floor > this.currentFloor ? 1 : (closest.floor < this.currentFloor ? -1 : 0);
                if (this.direction !== 0) {
                    this.state = MOVING;
                }
            }
        }

        _tickMoving(dt) {
            // Check if we've reached the target
            const dist = Math.abs(this.targetFloor - this.currentFloor);
            const speed = 2.0; // floors per second
            const moveDist = speed * dt;
            
            if (dist < 0.01) {
                // Already at target
                this.currentFloor = this.targetFloor;
                this.state = DOOR_OPENING;
                this.doorOpenTimer = 0;
                // Clear the call that got us here
                if (this.direction === 1) {
                    this.upCalls.delete(this.currentFloor);
                } else if (this.direction === -1) {
                    this.downCalls.delete(this.currentFloor);
                }
                this.destinations.delete(this.currentFloor);
                this.servedThisDoorCycle = this.currentFloor;
                
                // Re-evaluate if we should change direction
                this._recalculateDirection();
                return;
            }
            
            if (moveDist >= dist) {
                this.currentFloor = this.targetFloor;
                this.state = DOOR_OPENING;
                this.doorOpenTimer = 0;
                // Clear the call that got us here
                if (this.direction === 1) {
                    this.upCalls.delete(this.currentFloor);
                } else if (this.direction === -1) {
                    this.downCalls.delete(this.currentFloor);
                }
                this.destinations.delete(this.currentFloor);
                this.servedThisDoorCycle = this.currentFloor;
                
                // Re-evaluate if we should change direction
                this._recalculateDirection();
                return;
            }
            
            // Move towards target
            this.currentFloor += this.direction * moveDist;
            
            // Re-evaluate target: can we stop earlier?
            this._recalculateTarget();
        }

        _tickDoorOpening(dt) {
            this.doorOpenTimer += dt;
            if (this.doorOpenTimer >= DOOR_MOVE_S) {
                this.state = DOOR_OPEN;
                this.doorOpenTimer = 0;
            }
        }

        _tickDoorOpen(dt) {
            this.doorOpenTimer += dt;
            
            // Check if we can close
            const canClose = this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0;
            
            if (canClose && this.doorOpenTimer >= MIN_DOOR_OPEN_S) {
                this.state = DOOR_CLOSING;
                this.doorOpenTimer = 0;
            } else if (this.doorOpenTimer >= MAX_DOOR_OPEN_S) {
                // Safety cap - force close even if people are still pending
                this.pendingBoarders.clear();
                this.pendingDisembark.clear();
                this.state = DOOR_CLOSING;
                this.doorOpenTimer = 0;
            }
        }

        _tickDoorClosing(dt) {
            this.doorOpenTimer += dt;
            if (this.doorOpenTimer >= DOOR_MOVE_S) {
                this.doorOpenTimer = 0;
                
                // Check if we should stay open (new calls at this floor)
                const hasCallAtCurrent = this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor);
                const hasDests = this.destinations.size > 0;
                const hasPassengers = this.passengers.size > 0;
                
                // Passenger destinations outrank same-floor hall calls
                if (hasDests && hasPassengers && !hasCallAtCurrent) {
                    // Continue moving
                    this._pickNextTarget();
                    return;
                }
                
                // If there's a call at current floor but we have destinations, don't reopen
                // This prevents full-car lobby starvation
                if (hasCallAtCurrent && hasDests && hasPassengers) {
                    // Clear the call (it will be re-pressed)
                    this.upCalls.delete(this.currentFloor);
                    this.downCalls.delete(this.currentFloor);
                }
                
                // Also don't reopen if we just served this floor
                if (this.servedThisDoorCycle === this.currentFloor) {
                    this.servedThisDoorCycle = null;
                }
                
                if (hasCallAtCurrent && this._shouldReopen()) {
                    this.state = DOOR_OPENING;
                    return;
                }
                
                // Pick next target
                this._pickNextTarget();
            }
        }

        _findClosestTarget() {
            let closest = null;
            let closestDist = Infinity;
            
            // Check all active calls and destinations
            const allTargets = [];
            for (const f of this.upCalls) allTargets.push({ floor: f, type: 'up' });
            for (const f of this.downCalls) allTargets.push({ floor: f, type: 'down' });
            for (const f of this.destinations) allTargets.push({ floor: f, type: 'dest' });
            
            for (const t of allTargets) {
                const dist = Math.abs(t.floor - this.currentFloor);
                // Prefer destinations over calls
                const priority = t.type === 'dest' ? 0 : 1;
                if (dist < closestDist || (dist === closestDist && priority < (closest ? (closest.type === 'dest' ? 0 : 1) : Infinity))) {
                    closest = t;
                    closestDist = dist;
                }
            }
            
            return closest;
        }

        _hasWorkInDirection(dir) {
            // Check for calls or destinations in a direction
            for (let f = 0; f < this.floorCount; f++) {
                if (dir === 1 && f > this.currentFloor) {
                    if (this.upCalls.has(f) || this.downCalls.has(f) || this.destinations.has(f)) return true;
                } else if (dir === -1 && f < this.currentFloor) {
                    if (this.upCalls.has(f) || this.downCalls.has(f) || this.destinations.has(f)) return true;
                }
            }
            return false;
        }

        _recalculateDirection() {
            if (this.direction === 1 && !this._hasWorkInDirection(1)) {
                this.direction = this._hasWorkInDirection(-1) ? -1 : 0;
            } else if (this.direction === -1 && !this._hasWorkInDirection(-1)) {
                this.direction = this._hasWorkInDirection(1) ? 1 : 0;
            }
        }

        _recalculateTarget() {
            // If moving, check if there's a closer stop in the same direction
            if (this.state !== MOVING) return;
            
            const currentDir = this.direction;
            if (currentDir === 0) return;
            
            // Find the closest stop in current direction
            let closestInDir = null;
            let closestDist = Infinity;
            
            const currentFloorInt = Math.floor(this.currentFloor);
            const goingUp = currentDir === 1;
            
            if (goingUp) {
                // Going up - check floors above for UP calls and destinations
                for (let f = currentFloorInt + 1; f < this.floorCount; f++) {
                    if (this.upCalls.has(f) || this.destinations.has(f)) {
                        const dist = f - this.currentFloor;
                        if (dist < closestDist) {
                            closestInDir = f;
                            closestDist = dist;
                        }
                    }
                }
            } else {
                // Going down - check floors below for DOWN calls and destinations
                for (let f = currentFloorInt - 1; f >= 0; f--) {
                    if (this.downCalls.has(f) || this.destinations.has(f)) {
                        const dist = this.currentFloor - f;
                        if (dist < closestDist) {
                            closestInDir = f;
                            closestDist = dist;
                        }
                    }
                }
            }
            
            if (closestInDir !== null) {
                // If we found a closer stop in the same direction, update target
                if (goingUp && closestInDir < this.targetFloor) {
                    this.targetFloor = closestInDir;
                } else if (!goingUp && closestInDir > this.targetFloor) {
                    this.targetFloor = closestInDir;
                }
            }
        }

        _pickNextTarget() {
            // After closing doors, pick next target
            let bestTarget = null;
            let bestDist = Infinity;
            let bestPriority = Infinity;
            
            // SCAN scheduling: prefer continuing in current direction
            if (this.direction !== 0) {
                // Look ahead in current direction
                for (let f = this.currentFloor + this.direction; f >= 0 && f < this.floorCount; f += this.direction) {
                    if (this.destinations.has(f) || 
                        (this.direction === 1 && this.upCalls.has(f)) || 
                        (this.direction === -1 && this.downCalls.has(f))) {
                        const dist = Math.abs(f - this.currentFloor);
                        const priority = this.destinations.has(f) ? 0 : 1;
                        if (dist < bestDist || (dist === bestDist && priority < bestPriority)) {
                            bestTarget = f;
                            bestDist = dist;
                            bestPriority = priority;
                        }
                    }
                }
            }
            
            // If no target found in current direction, reverse
            if (bestTarget === null) {
                const reverseDir = -this.direction;
                if (reverseDir !== 0) {
                    for (let f = this.currentFloor + reverseDir; f >= 0 && f < this.floorCount; f += reverseDir) {
                        if (this.destinations.has(f) || 
                            (reverseDir === 1 && this.upCalls.has(f)) || 
                            (reverseDir === -1 && this.downCalls.has(f))) {
                            const dist = Math.abs(f - this.currentFloor);
                            const priority = this.destinations.has(f) ? 0 : 1;
                            if (dist < bestDist || (dist === bestDist && priority < bestPriority)) {
                                bestTarget = f;
                                bestDist = dist;
                                bestPriority = priority;
                            }
                        }
                    }
                }
            }
            
            // If still no target, look anywhere
            if (bestTarget === null) {
                for (let f = 0; f < this.floorCount; f++) {
                    if (this.destinations.has(f) || this.upCalls.has(f) || this.downCalls.has(f)) {
                        const dist = Math.abs(f - this.currentFloor);
                        const priority = this.destinations.has(f) ? 0 : 1;
                        if (dist < bestDist || (dist === bestDist && priority < bestPriority)) {
                            bestTarget = f;
                            bestDist = dist;
                            bestPriority = priority;
                        }
                    }
                }
            }
            
            if (bestTarget !== null) {
                this.targetFloor = bestTarget;
                this.direction = bestTarget > this.currentFloor ? 1 : (bestTarget < this.currentFloor ? -1 : 0);
                this.state = MOVING;
            } else {
                this.direction = 0;
                this.state = IDLE;
            }
        }

        _shouldReopen() {
            // Don't reopen if we have passenger destinations
            // This prevents lobby starvation
            if (this.destinations.size > 0 && this.passengers.size > 0) {
                return false;
            }
            return true;
        }
    }

    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== 'undefined' ? window : globalThis);
