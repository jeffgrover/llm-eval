(function (root) {
    const STATE = ElevatorLogic.STATE;
    const CAR_W = WORLD.SHAFT_WIDTH - 0.2;
    const CAR_D = WORLD.SHAFT_DEPTH - 0.2;
    const CAR_H = 2.8;
    const DOOR_ANIM_S = ElevatorLogic.DOOR_ANIM_S;

    function transparentMat(color, opacity) {
        return new THREE.MeshLambertMaterial({
            color: color, transparent: true, opacity: opacity,
            depthWrite: false, side: THREE.DoubleSide
        });
    }

    function makeCarIndicator() {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 8;
        tex._canvas = canvas;
        tex._lastText = null;
        return tex;
    }
    function setIndicatorText(tex, text) {
        if (tex._lastText === text) return;
        tex._lastText = text;
        const ctx = tex._canvas.getContext("2d");
        ctx.fillStyle = "#050505";
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = "#ffbb22";
        ctx.shadowColor = "#ffbb22";
        ctx.shadowBlur = 24;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 200px monospace";
        ctx.fillText(text, 128, 134);
        tex.needsUpdate = true;
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });

            this.group = new THREE.Group();
            this.group.renderOrder = 1;
            scene.add(this.group);

            const frameMat = transparentMat(0xffdd33, 0.5);
            const backMat = new THREE.MeshLambertMaterial({ color: 0xddbb22, side: THREE.DoubleSide });
            const doorMat = transparentMat(0xffdd33, 0.7);

            // floor
            const floor = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.08, CAR_D), frameMat);
            floor.position.y = 0.04; this._add(floor);
            // ceiling
            const ceil = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.08, CAR_D), frameMat);
            ceil.position.y = CAR_H; this._add(ceil);
            // side walls
            const lw = new THREE.Mesh(new THREE.BoxGeometry(0.08, CAR_H, CAR_D), frameMat);
            lw.position.set(-CAR_W / 2, CAR_H / 2, 0); this._add(lw);
            const rw = new THREE.Mesh(new THREE.BoxGeometry(0.08, CAR_H, CAR_D), frameMat);
            rw.position.set(CAR_W / 2, CAR_H / 2, 0); this._add(rw);
            // solid back wall (opaque)
            const bw = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H, 0.08), backMat);
            bw.position.set(0, CAR_H / 2, -CAR_D / 2); this._add(bw);

            // doors on +Z face
            const halfDoorW = CAR_W / 2;
            this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(halfDoorW, CAR_H, 0.06), doorMat);
            this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(halfDoorW, CAR_H, 0.06), doorMat);
            this.leftDoor.position.set(-halfDoorW / 2, CAR_H / 2, CAR_D / 2);
            this.rightDoor.position.set(halfDoorW / 2, CAR_H / 2, CAR_D / 2);
            this._add(this.leftDoor);
            this._add(this.rightDoor);
            this._doorClosedXL = -halfDoorW / 2;
            this._doorClosedXR = halfDoorW / 2;
            this._doorOpenOffset = halfDoorW - 0.1;

            // destination panel on back-right wall
            this.buttons = [];
            const btnMat = new THREE.MeshLambertMaterial({ color: 0x335533, side: THREE.DoubleSide });
            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), btnMat.clone());
                btn.rotation.x = Math.PI / 2;
                btn.position.set(CAR_W / 2 - 0.2, 0.6 + f * 0.32, -CAR_D / 2 + 0.1);
                this._add(btn);
                this.buttons.push(btn);
            }

            // in-car floor indicator above doors (looking back at passengers, faces -Z)
            this.carIndTex = makeCarIndicator();
            const indMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: this.carIndTex, side: THREE.DoubleSide })
            );
            indMesh.position.set(0, CAR_H - 0.4, CAR_D / 2 - 0.1);
            indMesh.rotation.y = Math.PI;
            this._add(indMesh);

            this._litButtons = new Set();
            this.group.position.y = 0;
        }

        _add(mesh) {
            mesh.renderOrder = 1;
            this.group.add(mesh);
        }

        // ---- pass-through API ----
        callUp(f) { this.logic.callUp(f); }
        callDown(f) { this.logic.callDown(f); }
        pressDestination(f) {
            this.logic.pressDestination(f);
        }
        isAcceptingAt(f, d) { return this.logic.isAcceptingAt(f, d); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(p) {
            const spot = this.logic.reserveBoardingSpot(p);
            if (!spot) return null;
            return spot;
        }
        completeBoard(p) { this.logic.completeBoard(p); }
        registerDisembark(p) { this.logic.registerDisembark(p); }
        completeDisembark(p) { this.logic.completeDisembark(p); }
        reset() {
            this.logic.reset();
            this.group.position.y = 0;
            this._closeDoorsInstant();
            for (const b of this.buttons) b.material.color.setHex(0x335533);
            this._litButtons.clear();
        }

        // expose logic state for HUD
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

        // world position of a logical interior spot
        spotWorldPosition(spotInfo) {
            return new THREE.Vector3(
                spotInfo.x,
                this.group.position.y + 0.04,
                spotInfo.z
            );
        }
        // local position inside car for a spot
        spotLocalPosition(spotInfo) {
            return new THREE.Vector3(spotInfo.x, 0.04, spotInfo.z);
        }

        _closeDoorsInstant() {
            this.leftDoor.position.x = this._doorClosedXL;
            this.rightDoor.position.x = this._doorClosedXR;
        }

        lightButton(f) {
            if (f >= 0 && f < this.buttons.length) {
                this.buttons[f].material.color.setHex(0x44ff66);
                this._litButtons.add(f);
            }
        }

        tick(dt) {
            this.logic.tick(dt);

            // car position from logic
            this.group.position.y = this.logic.y;

            // door animation
            let openFrac = 0;
            const st = this.logic.state;
            const t = this.logic.doorTimer;
            if (st === STATE.DOOR_OPENING) openFrac = Math.min(1, t / DOOR_ANIM_S);
            else if (st === STATE.DOOR_OPEN) openFrac = 1;
            else if (st === STATE.DOOR_CLOSING) openFrac = Math.max(0, 1 - t / DOOR_ANIM_S);
            else openFrac = 0;

            this.leftDoor.position.x = this._doorClosedXL - openFrac * this._doorOpenOffset;
            this.rightDoor.position.x = this._doorClosedXR + openFrac * this._doorOpenOffset;

            // destination buttons
            for (let f = 0; f < this.buttons.length; f++) {
                const lit = this.logic.destinations.has(f) || this._litButtons.has(f);
                this.buttons[f].material.color.setHex(lit ? 0x44ff66 : 0x335533);
                if (!this.logic.destinations.has(f)) this._litButtons.delete(f);
            }

            // dir char
            const dirChar = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
            const indText = "" + this.logic.currentFloor + dirChar;

            // in-car indicator
            setIndicatorText(this.carIndTex, "" + this.logic.currentFloor);

            // per-floor call panels + shaft indicators
            const floors = this.world.floors;
            for (const fl of floors) {
                const f = fl.floorNumber;
                if (fl.callPanel && fl.callPanel.userData) {
                    fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
                    fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
                    fl.callPanel.userData.setIndicator("" + this.logic.currentFloor);
                }
                if (fl.shaftIndicator && fl.shaftIndicator.userData) {
                    fl.shaftIndicator.userData.setIndicator(indText);
                }
            }
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
