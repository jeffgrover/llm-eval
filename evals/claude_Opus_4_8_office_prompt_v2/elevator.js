// elevator.js — Three.js car, doors, indicators + adapter around ElevatorLogic.
// All scheduling/state lives in ElevatorLogic; this file is purely visual + glue.
(function (root) {
    "use strict";

    const FH = (root.WORLD && root.WORLD.FLOOR_HEIGHT) || 3.4;
    const CAR_W = 2.6, CAR_D = 2.6, CAR_H = 2.7;
    const DOOR_SLIDE = CAR_W / 2 - 0.15;       // how far each half slides open

    function tex2d() {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const t = new THREE.CanvasTexture(canvas);
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 8;
        t._canvas = canvas; t._lastText = null;
        return t;
    }
    function drawText(t, text) {
        if (t._lastText === text) return;
        t._lastText = text;
        const ctx = t._canvas.getContext("2d");
        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffbb22"; ctx.shadowColor = "#ffbb22"; ctx.shadowBlur = 22;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 190px monospace";
        ctx.fillText(text, 128, 140);
        t.needsUpdate = true;
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.floorCount = (world && world.WORLD ? world.WORLD.FLOOR_COUNT : 6);
            this.logic = new root.ElevatorLogic({
                floorCount: this.floorCount, maxCapacity: 4, floorHeight: FH,
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            scene.add(this.carGroup);
            this._buildCar();

            this._syncVisuals();
        }

        _buildCar() {
            const frame = new THREE.MeshLambertMaterial({
                color: 0xffdd33, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide,
            });
            const backMat = new THREE.MeshLambertMaterial({ color: 0xeecc22 });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffe066, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide,
            });
            const g = this.carGroup;
            const mk = function (w, h, d, mat, x, y, z) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                m.position.set(x, y, z); m.renderOrder = 1; g.add(m); return m;
            };
            mk(CAR_W, 0.1, CAR_D, frame, 0, -0.05, 0);          // floor
            mk(CAR_W, 0.1, CAR_D, frame, 0, CAR_H, 0);          // ceiling
            mk(0.1, CAR_H, CAR_D, frame, -CAR_W / 2, CAR_H / 2, 0); // left wall
            mk(0.1, CAR_H, CAR_D, frame, CAR_W / 2, CAR_H / 2, 0);  // right wall
            mk(CAR_W, CAR_H, 0.1, backMat, 0, CAR_H / 2, -CAR_D / 2); // back wall (opaque)

            // sliding doors on +Z
            this.doorL = mk(CAR_W / 2, CAR_H - 0.2, 0.08, doorMat, -CAR_W / 4, (CAR_H - 0.2) / 2, CAR_D / 2);
            this.doorR = mk(CAR_W / 2, CAR_H - 0.2, 0.08, doorMat, CAR_W / 4, (CAR_H - 0.2) / 2, CAR_D / 2);
            this._closedLX = -CAR_W / 4; this._closedRX = CAR_W / 4;

            // destination panel on back-right wall, one glowing button per floor
            this.buttons = [];
            this._btnOff = new THREE.MeshBasicMaterial({ color: 0x335544 });
            this._btnOn = new THREE.MeshBasicMaterial({ color: 0x66ffaa });
            const plate = mk(0.34, this.floorCount * 0.3 + 0.2, 0.05, backMat,
                CAR_W / 2 - 0.18, 1.3, -CAR_D / 2 + 0.06);
            for (let f = 0; f < this.floorCount; f++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), this._btnOff);
                b.rotation.x = Math.PI / 2;
                b.position.set(CAR_W / 2 - 0.18, 0.55 + f * 0.3, -CAR_D / 2 + 0.09);
                b.renderOrder = 1; this.carGroup.add(b); this.buttons.push(b);
            }

            // in-car floor indicator above the doors, facing back at the passengers
            this.inTex = tex2d(); drawText(this.inTex, "0");
            const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: this.inTex }));
            ind.position.set(0, CAR_H - 0.45, CAR_D / 2 - 0.07);
            ind.rotation.y = Math.PI; ind.renderOrder = 1; this.carGroup.add(ind);
        }

        // ---- pass-through API used by sim.js -------------------------------
        callUp(f) { this.logic.callUp(f); }
        callDown(f) { this.logic.callDown(f); }
        pressDestination(f) { this.logic.pressDestination(f); }
        isAcceptingAt(f, d) { return this.logic.isAcceptingAt(f, d); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(p) { return this.logic.reserveBoardingSpot(p); }
        completeBoard(p) { this.logic.completeBoard(p); }
        registerDisembark(p) { this.logic.registerDisembark(p); }
        completeDisembark(p) { this.logic.completeDisembark(p); }

        // ---- mirrored read-through state for the HUD -----------------------
        get state() { return this.logic.state; }
        get direction() { return this.logic.direction; }
        get currentFloor() { return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get position() { return this.logic.position; }
        get upCalls() { return this.logic.upCalls; }
        get downCalls() { return this.logic.downCalls; }
        get destinations() { return this.logic.destinations; }
        get passengers() { return this.logic.passengers; }
        get pendingBoarders() { return this.logic.pendingBoarders; }
        get pendingDisembark() { return this.logic.pendingDisembark; }

        reset() { this.logic.reset(); this._syncVisuals(); }

        tick(dt) {
            this.logic.tick(dt);
            this._syncVisuals();
        }

        _dirArrow() {
            return this.logic.direction > 0 ? "^" : this.logic.direction < 0 ? "v" : "";
        }

        _syncVisuals() {
            const L = this.logic;
            // car vertical position
            this.carGroup.position.y = L.position * FH;

            // doors
            const dp = L.doorPos;
            this.doorL.position.x = this._closedLX - dp * DOOR_SLIDE;
            this.doorR.position.x = this._closedRX + dp * DOOR_SLIDE;

            // destination buttons
            for (let f = 0; f < this.buttons.length; f++) {
                this.buttons[f].material = L.destinations.has(f) ? this._btnOn : this._btnOff;
            }

            // floor indicators
            const shown = Math.round(L.position);
            const carText = shown + this._dirArrow();
            drawText(this.inTex, carText);

            // per-floor call panels + shaft indicators
            const floors = this.world && this.world.floors;
            if (floors) {
                for (let i = 0; i < floors.length; i++) {
                    const fl = floors[i];
                    const fn = fl.floorNumber;
                    if (fl.callPanel) {
                        fl.callPanel.userData.setUp(L.upCalls.has(fn));
                        fl.callPanel.userData.setDown(L.downCalls.has(fn));
                        fl.callPanel.userData.setIndicator(String(shown));
                    }
                    if (fl.shaftIndicator) {
                        fl.shaftIndicator.userData.setIndicator(carText);
                    }
                }
            }
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
