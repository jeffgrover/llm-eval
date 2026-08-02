// elevator.js - Three.js elevator car, doors, indicators, panel lights, adapter around ElevatorLogic
// Loaded as classic <script> in browser.

(function (root) {
    "use strict";

    const FLOOR_HEIGHT = (root.WORLD && root.WORLD.FLOOR_HEIGHT) || 3.4;
    const FLOOR_COUNT = (root.WORLD && root.WORLD.FLOOR_COUNT) || 6;

    const CAR_W = 2.6;
    const CAR_D = 2.6;
    const CAR_H = 2.6;

    const FRAME_MAT = new THREE.MeshLambertMaterial({
        color: 0xddcc33, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    });
    const BACK_MAT = new THREE.MeshLambertMaterial({
        color: 0xddcc33,
    });
    const DOOR_MAT = new THREE.MeshLambertMaterial({
        color: 0xddcc33, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
    });
    const PANEL_OFF = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const PANEL_ON = new THREE.MeshBasicMaterial({ color: 0xff5522 });
    const METAL = new THREE.MeshLambertMaterial({ color: 0x999999 });

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new root.ElevatorLogic({
                floorCount: FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: FLOOR_HEIGHT,
            });
            this.group = new THREE.Group();
            this.group.name = "Elevator";
            this.group.renderOrder = 1;
            this._buildCar();
            this.group.position.set(0, 0, 0);
            scene.add(this.group);

            // Cache spot world positions
            this._spotWorld = root.ElevatorLogic.PERSON_SPOTS.map(function (s) {
                return new THREE.Vector3(s.x, 0, s.z);
            });

            // Door slide animation
            this._doorOpenAmt = 0; // 0 closed, 1 open
        }

        _buildCar() {
            const g = this.group;

            // Floor (semi-transparent)
            const floor = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.05, CAR_D), FRAME_MAT);
            floor.position.y = 0.025;
            floor.renderOrder = 1;
            g.add(floor);

            // Ceiling
            const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.05, CAR_D), FRAME_MAT);
            ceiling.position.y = CAR_H - 0.025;
            ceiling.renderOrder = 1;
            g.add(ceiling);

            // Side walls (-X and +X)
            const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, CAR_H, CAR_D), FRAME_MAT);
            sideL.position.set(-CAR_W / 2, CAR_H / 2, 0);
            sideL.renderOrder = 1;
            g.add(sideL);
            const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.05, CAR_H, CAR_D), FRAME_MAT);
            sideR.position.set(CAR_W / 2, CAR_H / 2, 0);
            sideR.renderOrder = 1;
            g.add(sideR);

            // Back wall (opaque)
            const back = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H, 0.05), BACK_MAT);
            back.position.set(0, CAR_H / 2, -CAR_D / 2);
            back.renderOrder = 1;
            g.add(back);

            // Sliding doors (two halves, on +Z face)
            const doorW = CAR_W / 2;
            this._doorL = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.02, CAR_H - 0.1, 0.05), DOOR_MAT);
            this._doorL.position.set(-doorW / 2, (CAR_H - 0.1) / 2, CAR_D / 2);
            this._doorL.renderOrder = 1;
            g.add(this._doorL);
            this._doorR = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.02, CAR_H - 0.1, 0.05), DOOR_MAT);
            this._doorR.position.set(doorW / 2, (CAR_H - 0.1) / 2, CAR_D / 2);
            this._doorR.renderOrder = 1;
            g.add(this._doorR);

            // Destination panel on back-right wall
            this._destButtons = [];
            const panelX = CAR_W / 2 - 0.18;
            const panelZ = -CAR_D / 2 + 0.06;
            const baseY = CAR_H - 0.4;
            for (let f = 0; f < FLOOR_COUNT; f++) {
                const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), PANEL_OFF.clone());
                cyl.rotation.x = Math.PI / 2;
                cyl.position.set(panelX, baseY - f * 0.12, panelZ);
                cyl.userData.floor = f;
                g.add(cyl);
                this._destButtons.push(cyl);
            }
            const panelBack = new THREE.Mesh(new THREE.BoxGeometry(0.25, FLOOR_COUNT * 0.12 + 0.1, 0.02), METAL);
            panelBack.position.set(panelX, baseY - (FLOOR_COUNT - 1) * 0.06, panelZ - 0.01);
            g.add(panelBack);

            // In-car floor indicator above the doors (looking back at the passengers)
            const carInd = this._makeFloorIndicator("0_", 0.6, 0.6);
            carInd.position.set(0, CAR_H - 0.3, CAR_D / 2 - 0.06);
            carInd.rotation.y = Math.PI;
            g.add(carInd);
            this._carIndicator = carInd;
        }

        _makeFloorIndicator(initial, w, h) {
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 4;
            tex.generateMipmaps = true;
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            mesh.userData.tex = tex;
            mesh.userData.canvas = canvas;
            mesh.userData.lastText = null;
            mesh.userData.setText = function (txt) {
                if (mesh.userData.lastText === txt) return;
                mesh.userData.lastText = txt;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#050505";
                ctx.fillRect(0, 0, 256, 256);
                ctx.shadowColor = "#ffbb22";
                ctx.shadowBlur = 20;
                ctx.fillStyle = "#ffbb22";
                ctx.font = "bold 200px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(txt, 128, 140);
                tex.needsUpdate = true;
            };
            mesh.userData.setText(initial);
            return mesh;
        }

        // Pass-through methods
        callUp(f) { this.logic.callUp(f); }
        callDown(f) { this.logic.callDown(f); }
        pressDestination(f) { this.logic.pressDestination(f); }
        isAcceptingAt(f, d) { return this.logic.isAcceptingAt(f, d); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) {
            const r = this.logic.reserveBoardingSpot(person);
            if (r) {
                return { index: r.index, x: r.x, y: r.y, z: r.z, worldPos: this._spotWorld[r.index].clone() };
            }
            return null;
        }
        completeBoard(person, toFloor) { return this.logic.completeBoard(person, toFloor); }
        registerDisembark(person) { return this.logic.registerDisembark(person); }
        completeDisembark(person) { return this.logic.completeDisembark(person); }
        reset() {
            this.logic.reset();
            this._doorOpenAmt = 0;
            this._applyDoors(0);
        }

        // Mirror state for HUD
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

        get doorWorldOffset() {
            // Y of the floor at current floor
            return this.logic.currentFloor * FLOOR_HEIGHT;
        }

        tick(dt) {
            const prevState = this.logic.state;
            this.logic.tick(dt);
            this.group.position.y = this.logic.currentFloor * FLOOR_HEIGHT;
            // Animate door open/close
            let target = 0;
            if (this.logic.state === root.ElevatorLogic.STATE.DOOR_OPENING) {
                target = this.logic.doorTimer / root.ElevatorLogic.DOOR_TRANSIT_S;
            } else if (this.logic.state === root.ElevatorLogic.STATE.DOOR_OPEN) {
                target = 1;
            } else if (this.logic.state === root.ElevatorLogic.STATE.DOOR_CLOSING) {
                target = 1 - (this.logic.doorTimer / root.ElevatorLogic.DOOR_TRANSIT_S);
            } else {
                target = 0;
            }
            this._doorOpenAmt = target;
            this._applyDoors(target);
            this._updateIndicators();
        }

        _applyDoors(amt) {
            const doorW = CAR_W / 2 - 0.02;
            const slide = (CAR_W / 2 - 0.05) * amt;
            this._doorL.position.x = -doorW / 2 - slide;
            this._doorR.position.x = doorW / 2 + slide;
        }

        _updateIndicators() {
            // Update in-car indicator
            const dirSym = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "_");
            this._carIndicator.userData.setText(this.logic.currentFloor + dirSym);

            // Update destination buttons
            for (let i = 0; i < this._destButtons.length; i++) {
                const btn = this._destButtons[i];
                const isLit = this.logic.destinations.has(i);
                btn.material = isLit ? PANEL_ON : PANEL_OFF;
            }

            // Update call panels (any floor where the corresponding hall call is active)
            const floors = this.world.floors;
            for (let f = 0; f < floors.length; f++) {
                const panel = floors[f].callPanel;
                if (!panel) continue;
                panel.userData.setUp(this.logic.upCalls.has(f));
                panel.userData.setDown(this.logic.downCalls.has(f));
                // Also display the elevator's current floor
                panel.userData.setIndicator(String(this.logic.currentFloor));
            }
            // Update shaft indicators
            for (let f = 0; f < floors.length; f++) {
                const ind = floors[f].shaftIndicator;
                if (!ind) continue;
                const dSym = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "_");
                if (ind.userData.setText) {
                    ind.userData.setText(this.logic.currentFloor + dSym);
                } else if (ind.userData.setIndicator) {
                    ind.userData.setIndicator(this.logic.currentFloor + dSym);
                }
            }
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
