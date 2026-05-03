(function () {
    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.MAX_CAPACITY = 4;
            this.MIN_DOOR_OPEN_S = 3.5;
            this.MAX_DOOR_OPEN_S = 18;
            this.SPEED = 1.45;
            this.DOOR_SPEED = 1.7;
            this.state = "IDLE";
            this.direction = 0;
            this.currentFloor = 0;
            this.targetFloor = null;
            this.doorT = 0;
            this.doorOpenT = 0;
            this.upCalls = new Set();
            this.downCalls = new Set();
            this.destinations = new Set();
            this.passengers = new Set();
            this.pendingBoarders = new Set();
            this.pendingDisembark = new Set();
            this.spotOccupancy = new Map();
            this.spots = [
                new THREE.Vector3(-0.62, 0, 0.45),
                new THREE.Vector3(0.62, 0, 0.45),
                new THREE.Vector3(-0.62, 0, -0.48),
                new THREE.Vector3(0.62, 0, -0.48)
            ];
            this.group = this._createCar();
            this.group.position.y = 0;
            scene.add(this.group);
            this._updatePanels();
        }

        _mat(color, opacity, opaque) {
            return new THREE.MeshStandardMaterial({ color, transparent: !opaque, opacity: opaque ? 1 : opacity, depthWrite: !!opaque, side: THREE.DoubleSide, roughness: 0.55 });
        }
        _box(parent, x, y, z, w, h, d, mat) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.renderOrder = 1;
            parent.add(m);
            return m;
        }
        _createCar() {
            const g = new THREE.Group();
            g.renderOrder = 1;
            const frame = this._mat(0xffd23d, 0.5), doorM = this._mat(0xffdd55, 0.7), backM = this._mat(0xd69d13, 1, true);
            this._box(g, 0, 0.04, 0, 2.8, 0.08, 2.8, frame);
            this._box(g, 0, 2.42, 0, 2.8, 0.08, 2.8, frame);
            this._box(g, -1.38, 1.22, 0, 0.08, 2.35, 2.8, frame);
            this._box(g, 1.38, 1.22, 0, 0.08, 2.35, 2.8, frame);
            this._box(g, 0, 1.22, -1.38, 2.8, 2.35, 0.08, backM);
            this.leftDoor = this._box(g, -0.7, 1.16, 1.42, 1.38, 2.18, 0.08, doorM);
            this.rightDoor = this._box(g, 0.7, 1.16, 1.42, 1.38, 2.18, 0.08, doorM);
            const tex = window.makeTextTexture("0", 256);
            this.indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            this.indicator.position.set(0, 2.05, 1.32);
            this.indicator.rotation.y = Math.PI;
            this.indicator.renderOrder = 1;
            this.indicator.userData.setIndicator = (text) => window.updateTextTexture(tex, text);
            g.add(this.indicator);
            this.buttons = [];
            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x000000 }));
                b.rotation.x = Math.PI / 2;
                b.position.set(0.96, 1.78 - f * 0.23, -1.32);
                b.renderOrder = 1;
                g.add(b);
                this.buttons[f] = b;
            }
            return g;
        }

        reset() {
            this.state = "IDLE"; this.direction = 0; this.currentFloor = 0; this.targetFloor = null;
            this.doorT = 0; this.doorOpenT = 0; this.group.position.y = 0;
            this.upCalls.clear(); this.downCalls.clear(); this.destinations.clear();
            this.passengers.clear(); this.pendingBoarders.clear(); this.pendingDisembark.clear(); this.spotOccupancy.clear();
            this._setDoors(0); this._updatePanels();
        }
        callUp(floor) { if (floor < WORLD.FLOOR_COUNT - 1) { this.upCalls.add(floor); this._updatePanels(); if (this.state === "IDLE") this._chooseNext(); } }
        callDown(floor) { if (floor > 0) { this.downCalls.add(floor); this._updatePanels(); if (this.state === "IDLE") this._chooseNext(); } }
        pressDestination(floor) { this.destinations.add(floor); this._updatePanels(); if (this.state === "IDLE") this._chooseNext(); }
        isAcceptingAt(floor, dir) {
            if (this.state !== "DOOR_OPEN" || this.currentFloor !== floor) return false;
            if (this.direction === 0) return true;
            if (this.direction === dir) return true;
            return !this._hasAhead(this.direction);
        }
        currentCapacityFree() { return this.MAX_CAPACITY - (this.passengers.size + this.pendingBoarders.size); }
        reserveBoardingSpot(person) {
            if (this.currentCapacityFree() <= 0) return null;
            for (let i = 0; i < this.spots.length; i++) {
                if (!this.spotOccupancy.has(i)) {
                    this.spotOccupancy.set(i, person);
                    person.elevatorSpotIndex = i;
                    this.pendingBoarders.add(person);
                    return this.spots[i].clone();
                }
            }
            return null;
        }
        completeBoard(person) { this.pendingBoarders.delete(person); this.passengers.add(person); }
        registerDisembark(person) { this.pendingDisembark.add(person); }
        completeDisembark(person) {
            this.pendingDisembark.delete(person); this.passengers.delete(person);
            if (person.elevatorSpotIndex !== undefined) this.spotOccupancy.delete(person.elevatorSpotIndex);
            person.elevatorSpotIndex = undefined;
        }
        tick(dt) {
            if (this.state === "IDLE") this._chooseNext();
            else if (this.state === "MOVING") this._tickMoving(dt);
            else if (this.state === "DOOR_OPENING") { this.doorT = Math.min(1, this.doorT + dt * this.DOOR_SPEED); this._setDoors(this.doorT); if (this.doorT >= 1) { this.state = "DOOR_OPEN"; this.doorOpenT = 0; } }
            else if (this.state === "DOOR_OPEN") { this.doorOpenT += dt; if ((this.doorOpenT >= this.MIN_DOOR_OPEN_S && this.pendingBoarders.size === 0 && this.pendingDisembark.size === 0) || this.doorOpenT >= this.MAX_DOOR_OPEN_S) this.state = "DOOR_CLOSING"; }
            else if (this.state === "DOOR_CLOSING") { this.doorT = Math.max(0, this.doorT - dt * this.DOOR_SPEED); this._setDoors(this.doorT); if (this.doorT <= 0) this._chooseNext(); }
            this.currentFloor = Math.round(this.group.position.y / WORLD.FLOOR_HEIGHT);
            this._updatePanels();
        }
        _setDoors(t) {
            const slide = t * 0.62;
            this.leftDoor.position.x = -0.7 - slide;
            this.rightDoor.position.x = 0.7 + slide;
        }
        _allStops() { return new Set([...this.destinations, ...this.upCalls, ...this.downCalls]); }
        _hasAhead(dir) {
            const cf = this.currentFloor;
            for (const f of this.destinations) if ((f - cf) * dir > 0) return true;
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const f of calls) if ((f - cf) * dir > 0) return true;
            return false;
        }
        _closestAhead(dir) {
            const cf = this.currentFloor;
            const candidates = [];
            for (const f of this.destinations) if ((f - cf) * dir > 0) candidates.push(f);
            const calls = dir > 0 ? this.upCalls : this.downCalls;
            for (const f of calls) if ((f - cf) * dir > 0) candidates.push(f);
            if (!candidates.length) return null;
            return dir > 0 ? Math.min(...candidates) : Math.max(...candidates);
        }
        _sameFloorCall() { return this.destinations.has(this.currentFloor) || this.upCalls.has(this.currentFloor) || this.downCalls.has(this.currentFloor); }
        _chooseNext() {
            const cf = this.currentFloor;
            if (this._sameFloorCall()) { this._arriveAtFloor(cf); return; }
            let next = null;
            if (this.direction > 0) {
                next = this._closestAhead(1);
                if (next === null) { this.direction = -1; next = this._closestAhead(-1); }
            } else if (this.direction < 0) {
                next = this._closestAhead(-1);
                if (next === null) { this.direction = 1; next = this._closestAhead(1); }
            } else {
                const stops = [...this._allStops()];
                if (stops.length) {
                    next = stops.reduce((a, b) => Math.abs(b - cf) < Math.abs(a - cf) ? b : a, stops[0]);
                    this.direction = Math.sign(next - cf) || (this.upCalls.has(cf) ? 1 : this.downCalls.has(cf) ? -1 : 0);
                }
            }
            if (next === null || next === undefined) { this.state = "IDLE"; this.direction = 0; this.targetFloor = null; return; }
            this.targetFloor = next;
            this.direction = Math.sign(next - cf);
            if (this.direction === 0) this._arriveAtFloor(cf); else this.state = "MOVING";
        }
        _tickMoving(dt) {
            const closer = this._closestAhead(this.direction);
            if (closer !== null && Math.abs(closer - this.currentFloor) < Math.abs(this.targetFloor - this.currentFloor)) this.targetFloor = closer;
            const targetY = this.targetFloor * WORLD.FLOOR_HEIGHT;
            const dy = targetY - this.group.position.y;
            const step = this.direction * this.SPEED * dt;
            if (Math.abs(step) >= Math.abs(dy)) {
                this.group.position.y = targetY;
                this.currentFloor = this.targetFloor;
                this._arriveAtFloor(this.currentFloor);
            } else {
                this.group.position.y += step;
                this.currentFloor = Math.round(this.group.position.y / WORLD.FLOOR_HEIGHT);
            }
        }
        _arriveAtFloor(floor) {
            this.destinations.delete(floor);
            if (this.direction > 0) this.upCalls.delete(floor);
            if (this.direction < 0) this.downCalls.delete(floor);
            if (!this._hasAhead(this.direction || 1) && !this._hasAhead(this.direction || -1)) {
                this.upCalls.delete(floor); this.downCalls.delete(floor);
            }
            this.state = "DOOR_OPENING";
            this.targetFloor = null;
            this._updatePanels();
        }
        _indicatorText() {
            const arrow = this.direction > 0 ? "^" : this.direction < 0 ? "v" : "-";
            return String(this.currentFloor) + arrow;
        }
        _updatePanels() {
            const text = this._indicatorText();
            this.world.floors.forEach((f, i) => {
                f.callPanel.userData.setUp(this.upCalls.has(i));
                f.callPanel.userData.setDown(this.downCalls.has(i));
                f.callPanel.userData.setIndicator(String(i));
                f.shaftIndicator.userData.setIndicator(text);
            });
            this.indicator.userData.setIndicator(text);
            this.buttons.forEach((b, i) => {
                const on = this.destinations.has(i);
                b.material.color.setHex(on ? 0xffbb22 : 0x333333);
                b.material.emissive.setHex(on ? 0xff8800 : 0x000000);
            });
        }
    }

    window.Elevator = Elevator;
})();
