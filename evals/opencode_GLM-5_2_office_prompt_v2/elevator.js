// elevator.js — Three.js elevator car + adapter around ElevatorLogic
(function (root) {
    "use strict";
    const THREE = root.THREE;
    const WORLD = root.WORLD;
    const ElevatorLogic = root.ElevatorLogic;

    function makeDigitTexture(w, h) {
        const cv = document.createElement("canvas");
        cv.width = w || 256; cv.height = h || 256;
        const ctx = cv.getContext("2d");
        const tex = new THREE.CanvasTexture(cv);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        tex._lastText = null; tex._ctx = ctx; tex._cv = cv;
        return tex;
    }
    function updateTextTexture(tex, text) {
        if (!tex) return;
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex._ctx, cv = tex._cv;
        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.font = "bold " + Math.floor(cv.height * 0.82) + "px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "#ffbb22"; ctx.shadowBlur = 24;
        ctx.fillStyle = "#ffbb22";
        ctx.fillText(text, cv.width / 2, cv.height / 2 + 8);
        tex.needsUpdate = true;
    }

    class Elevator {
        constructor(scene, world) {
            this.world = world;
            this.scene = scene;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });
            this.carWidth = WORLD.SHAFT_WIDTH - 0.2;   // 2.8
            this.carDepth = WORLD.SHAFT_DEPTH - 0.2;    // 2.8
            this.carHeight = WORLD.FLOOR_HEIGHT - 0.4; // 3.0

            this.car = new THREE.Group();
            this.car.renderOrder = 1;

            // interior spot layout (4 spots)
            this.spotLayout = [
                { x: -0.7, z: -0.7 },
                { x: 0.7, z: -0.7 },
                { x: -0.7, z: 0.7 },
                { x: 0.7, z: 0.7 }
            ];

            this._buildCar();
            scene.add(this.car);

            // floor tracking
            this.currentY = 0;
            this.car.position.set(0, 0, 0);
        }

        _buildCar() {
            const carMat = new THREE.MeshLambertMaterial({ color: 0xffd54f, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
            const doorMat = new THREE.MeshLambertMaterial({ color: 0xffc107, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
            const backMat = new THREE.MeshLambertMaterial({ color: 0xffb300, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
            const cw = this.carWidth, cd = this.carDepth, ch = this.carHeight;

            // floor
            const floor = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, cd), carMat);
            floor.position.y = 0.05; floor.renderOrder = 1;
            this.car.add(floor);
            // ceiling
            const ceil = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, cd), carMat);
            ceil.position.y = ch; ceil.renderOrder = 1;
            this.car.add(ceil);
            // side walls
            const wL = new THREE.Mesh(new THREE.BoxGeometry(0.1, ch, cd), carMat);
            wL.position.set(-cw / 2, ch / 2, 0); wL.renderOrder = 1; this.car.add(wL);
            const wR = new THREE.Mesh(new THREE.BoxGeometry(0.1, ch, cd), carMat);
            wR.position.set(cw / 2, ch / 2, 0); wR.renderOrder = 1; this.car.add(wR);
            // back wall (opaque-ish)
            const wB = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.1), backMat);
            wB.position.set(0, ch / 2, -cd / 2); wB.renderOrder = 1; this.car.add(wB);

            // doors on +Z face, two halves
            const halfW = cw / 2;
            this.doorL = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.02, ch - 0.1, 0.06), doorMat);
            this.doorL.position.set(-halfW / 2, ch / 2, cd / 2);
            this.doorL.renderOrder = 1; this.car.add(this.doorL);
            this.doorR = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.02, ch - 0.1, 0.06), doorMat);
            this.doorR.position.set(halfW / 2, ch / 2, cd / 2);
            this.doorR.renderOrder = 1; this.car.add(this.doorR);
            this._doorClosedX = { L: -halfW / 2, R: halfW / 2 };
            this._doorOpenX = { L: -cw / 2 - 0.05, R: cw / 2 + 0.05 };

            // destination panel on back-right wall: one button per floor
            this.destButtons = [];
            const btnMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
            const btnOnMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const btnGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8);
            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const btn = new THREE.Mesh(btnGeo, btnMat.clone());
                btn.rotation.x = Math.PI / 2;
                btn.position.set(cw / 2 - 0.15, ch - 0.3 - f * 0.25, -cd / 2 + 0.06);
                btn.userData = { floor: f, offMat: btnMat, onMat: btnOnMat };
                this.car.add(btn);
                this.destButtons.push(btn);
            }

            // in-car floor indicator above doors (from inside)
            this.carIndicatorTex = makeDigitTexture(256, 256);
            updateTextTexture(this.carIndicatorTex, "0");
            this.carIndicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: this.carIndicatorTex }));
            this.carIndicator.position.set(0, ch - 0.3, cd / 2 - 0.05);
            this.carIndicator.rotation.y = Math.PI; // face inward (-Z)
            this.car.add(this.carIndicator);
        }

        // ---- public API delegates to logic ----
        callUp(f) { this.logic.callUp(f); }
        callDown(f) { this.logic.callDown(f); }
        pressDestination(f) { this.logic.pressDestination(f); }
        isAcceptingAt(f, dir) { return this.logic.isAcceptingAt(f, dir); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }

        reserveBoardingSpot(person, toFloor) {
            const spot = this.logic.reserveBoardingSpot(person, toFloor);
            if (!spot) return null;
            const layout = this.spotLayout[spot.index];
            // world coords of spot
            const carY = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
            return {
                index: spot.index,
                x: layout.x,
                y: carY,
                z: layout.z,
                toFloor: toFloor
            };
        }
        completeBoard(person) { this.logic.completeBoard(person); }
        registerDisembark(person) { this.logic.registerDisembark(person); }
        completeDisembark(person) { this.logic.completeDisembark(person); }
        reset() {
            this.logic.reset();
            this.currentY = 0;
            this.car.position.set(0, 0, 0);
            if (this.doorL) this.doorL.position.x = this._doorClosedX.L;
            if (this.doorR) this.doorR.position.x = this._doorClosedX.R;
        }

        // ---- pass-through state for HUD ----
        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }

        // ---- world position helpers for agents ----
        carWorldPos() {
            return new THREE.Vector3(0, this.logic.currentFloor * WORLD.FLOOR_HEIGHT, 0);
        }
        doorThresholdWorldPos(spotX) {
            // spot at threshold on +Z side of car
            const cy = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
            return new THREE.Vector3(spotX || 0, cy, WORLD.SHAFT_DEPTH / 2 + 0.1);
        }
        spotWorldPos(spot) {
            const cy = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
            return new THREE.Vector3(spot.x, cy, spot.z);
        }
        addToCar(obj) { this.car.add(obj); }
        removeFromCar(obj) { this.scene.add(obj); }

        tick(dt) {
            this.logic.tick(dt);
            // update car Y position
            const targetY = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
            this.currentY = targetY;
            this.car.position.y = targetY;
            // doors
            const dp = this.logic.doorPos;
            this.doorL.position.x = this._doorClosedX.L + (this._doorOpenX.L - this._doorClosedX.L) * dp;
            this.doorR.position.x = this._doorClosedX.R + (this._doorOpenX.R - this._doorClosedX.R) * dp;
            // call panel lamps + indicators
            const floors = this.world.floors;
            for (let f = 0; f < floors.length; f++) {
                const fd = floors[f];
                if (!fd.callPanel) continue;
                fd.callPanel.userData.setUp(this.logic.upCalls.has(f));
                fd.callPanel.userData.setDown(this.logic.downCalls.has(f));
                const dirChar = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : " ");
                fd.callPanel.userData.setIndicator(String(f) + (this.logic.currentFloor === f ? dirChar.trim() : ""));
                if (fd.shaftIndicator) {
                    const sd = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : " ");
                    fd.shaftIndicator.userData.setIndicator(String(this.logic.currentFloor) + sd);
                }
            }
            // destination buttons
            for (const btn of this.destButtons) {
                btn.material.color.setHex(this.logic.destinations.has(btn.userData.floor) ? 0xffaa00 : 0x333333);
            }
            // in-car indicator
            const csd = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : " ");
            updateTextTexture(this.carIndicatorTex, String(this.logic.currentFloor) + csd);
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
