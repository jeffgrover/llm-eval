// elevator.js — Three.js elevator car, doors, indicators; visual adapter
// around ElevatorLogic. All scheduling/state decisions live in
// elevator_logic.js — this file owns only geometry and per-frame syncing.
// Classic script: no imports/exports; THREE, WORLD, ElevatorLogic,
// makeTextTexture and updateTextTexture come from earlier scripts.

(function () {
    "use strict";

    const CAR_W = 2.6;
    const CAR_D = 2.6;
    const CAR_H = 2.6;
    const DOOR_W = CAR_W / 2 - 0.05;   // each sliding half
    const DOOR_H = 2.3;

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });

            this._buildCar();
            scene.add(this.car);
            this._syncVisuals();
        }

        // ---------------- geometry ----------------

        _buildCar() {
            const car = new THREE.Group();
            car.renderOrder = 1;

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xddbb33, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide
            });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xeecc44, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide
            });
            const backMat = new THREE.MeshLambertMaterial({ color: 0xccaa22 });

            function add(mesh) {
                mesh.renderOrder = 1;
                car.add(mesh);
                return mesh;
            }

            const floor = add(new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.1, CAR_D), frameMat));
            floor.position.y = -0.05;
            const ceil = add(new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.1, CAR_D), frameMat));
            ceil.position.y = CAR_H + 0.05;
            const left = add(new THREE.Mesh(new THREE.PlaneGeometry(CAR_D, CAR_H), frameMat));
            left.rotation.y = Math.PI / 2;
            left.position.set(-CAR_W / 2, CAR_H / 2, 0);
            const right = add(new THREE.Mesh(new THREE.PlaneGeometry(CAR_D, CAR_H), frameMat));
            right.rotation.y = Math.PI / 2;
            right.position.set(CAR_W / 2, CAR_H / 2, 0);
            const back = add(new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H, 0.08), backMat));
            back.position.set(0, CAR_H / 2, -CAR_D / 2);

            // header strip above the door opening
            const header = add(new THREE.Mesh(
                new THREE.PlaneGeometry(CAR_W, CAR_H - DOOR_H), frameMat));
            header.position.set(0, DOOR_H + (CAR_H - DOOR_H) / 2, CAR_D / 2);

            // sliding doors on the +Z face; closed: they meet at x=0
            this.doorL = add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), doorMat));
            this.doorR = add(new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), doorMat));
            this.doorL.position.set(-DOOR_W / 2, DOOR_H / 2, CAR_D / 2 + 0.02);
            this.doorR.position.set(DOOR_W / 2, DOOR_H / 2, CAR_D / 2 + 0.02);

            // destination panel on the back-right wall: one button per floor
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, 0.06),
                new THREE.MeshLambertMaterial({ color: 0x33363f }));
            panel.renderOrder = 1;
            panel.position.set(CAR_W / 2 - 0.18, 1.4, -CAR_D / 2 + 0.35);
            panel.rotation.y = -Math.PI / 2;
            car.add(panel);
            this.buttons = [];
            this._btnOff = new THREE.MeshBasicMaterial({ color: 0x55584f });
            this._btnOn = new THREE.MeshBasicMaterial({ color: 0xffe066 });
            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), this._btnOff);
                b.rotation.z = Math.PI / 2;
                b.renderOrder = 1;
                b.position.set(CAR_W / 2 - 0.22, 0.85 + f * 0.21, -CAR_D / 2 + 0.35);
                car.add(b);
                this.buttons.push(b);
            }

            // in-car floor indicator above the doors, facing the riders (-Z)
            this.carTex = makeTextTexture("0");
            const carInd = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6),
                new THREE.MeshBasicMaterial({ map: this.carTex }));
            carInd.renderOrder = 1;
            carInd.position.set(0, DOOR_H + 0.25, CAR_D / 2 - 0.06);
            carInd.rotation.y = Math.PI;
            car.add(carInd);

            this.car = car;
        }

        // ---------------- adapter API (delegates to logic) ----------------

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        completeBoard(p) { this.logic.completeBoard(p); }
        cancelBoard(p) { this.logic.cancelBoard(p); }
        registerDisembark(p) { this.logic.registerDisembark(p); }
        completeDisembark(p) { this.logic.completeDisembark(p); }

        reserveBoardingSpot(person) {
            const spot = this.logic.reserveBoardingSpot(person);
            if (!spot) return null;
            // car-local Vector3 plus the world-space X lane to aim the walk at
            return {
                index: spot.index,
                local: new THREE.Vector3(spot.x, 0, spot.z),
                worldX: this.car.position.x + spot.x
            };
        }

        // state mirrors for the HUD / sim
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
        get doorProgress() { return this.logic.doorProgress; }

        reset() {
            this.logic.reset();
            this._syncVisuals();
        }

        tick(dt) {
            this.logic.tick(dt);
            this._syncVisuals();
        }

        // ---------------- visuals ----------------

        _syncVisuals() {
            const lg = this.logic;
            this.car.position.set(0, lg.y, 0);

            // sliding doors
            const slide = lg.doorProgress * (CAR_W / 2 - 0.08);
            this.doorL.position.x = -DOOR_W / 2 - slide;
            this.doorR.position.x = DOOR_W / 2 + slide;

            // indicator text: floor + direction
            const dirCh = lg.direction > 0 ? "^" : (lg.direction < 0 ? "v" : "");
            const txt = String(lg.currentFloor) + dirCh;
            updateTextTexture(this.carTex, txt);

            // building-side call panels and shaft indicators
            const floors = this.world.floors;
            for (let f = 0; f < floors.length; f++) {
                const fl = floors[f];
                if (fl.callPanel) {
                    fl.callPanel.userData.setUp(lg.upCalls.has(f));
                    fl.callPanel.userData.setDown(lg.downCalls.has(f));
                    fl.callPanel.userData.setIndicator(String(lg.currentFloor));
                }
                if (fl.shaftIndicator) fl.shaftIndicator.userData.setText(txt);
            }

            // destination buttons
            for (let f = 0; f < this.buttons.length; f++) {
                this.buttons[f].material = lg.destinations.has(f) ? this._btnOn : this._btnOff;
            }
        }
    }

    window.Elevator = Elevator;
})();
