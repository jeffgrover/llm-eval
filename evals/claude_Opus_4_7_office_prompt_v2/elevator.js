// elevator.js — Three.js elevator car + adapter around ElevatorLogic.

(function (root) {
    const FLOOR_HEIGHT = 3.4;
    const SHAFT_W = 3.0;
    const SHAFT_D = 3.0;
    const CAR_W = 2.6;
    const CAR_D = 2.6;
    const CAR_H = 2.8;

    function dirArrow(dir) {
        if (dir > 0) return "^";
        if (dir < 0) return "v";
        return "-";
    }

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new root.ElevatorLogic({
                floorCount: world.floors.length,
                maxCapacity: 4,
                floorHeight: FLOOR_HEIGHT,
            });

            this._buildCar();
            this._initState();
            // Initial indicator paint
            this._refreshIndicators();
        }

        _initState() {
            this.car.position.y = this.logic.position * FLOOR_HEIGHT;
        }

        _buildCar() {
            const yellowFrame = new THREE.MeshStandardMaterial({
                color: 0xf0d040, roughness: 0.6, metalness: 0.3,
                transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide,
            });
            const yellowDoor = new THREE.MeshStandardMaterial({
                color: 0xe6c733, roughness: 0.6, metalness: 0.3,
                transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide,
            });
            const yellowSolid = new THREE.MeshStandardMaterial({
                color: 0xd6b820, roughness: 0.7, metalness: 0.4,
            });

            const car = new THREE.Group();
            car.renderOrder = 1;
            // floor
            const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.06, CAR_D), yellowFrame);
            floorMesh.position.set(0, 0.03, 0);
            car.add(floorMesh);
            // ceiling
            const ceil = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.06, CAR_D), yellowFrame);
            ceil.position.set(0, CAR_H - 0.03, 0);
            car.add(ceil);
            // back wall (solid)
            const back = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, CAR_H, 0.06), yellowSolid);
            back.position.set(0, CAR_H / 2, -CAR_D / 2 + 0.03);
            car.add(back);
            // left + right walls
            const left = new THREE.Mesh(new THREE.BoxGeometry(0.06, CAR_H, CAR_D), yellowFrame);
            left.position.set(-CAR_W / 2 + 0.03, CAR_H / 2, 0);
            car.add(left);
            const right = new THREE.Mesh(new THREE.BoxGeometry(0.06, CAR_H, CAR_D), yellowFrame);
            right.position.set(CAR_W / 2 - 0.03, CAR_H / 2, 0);
            car.add(right);

            // doors: two halves on +Z face, sliding outward
            const doorW = CAR_W / 2 - 0.05;
            const doorH = CAR_H - 0.4;
            const dGeom = new THREE.BoxGeometry(doorW, doorH, 0.05);
            const leftDoor = new THREE.Mesh(dGeom, yellowDoor);
            leftDoor.position.set(-doorW / 2, doorH / 2 + 0.1, CAR_D / 2 + 0.02);
            car.add(leftDoor);
            const rightDoor = new THREE.Mesh(dGeom, yellowDoor);
            rightDoor.position.set(doorW / 2, doorH / 2 + 0.1, CAR_D / 2 + 0.02);
            car.add(rightDoor);

            this.leftDoor = leftDoor;
            this.rightDoor = rightDoor;
            this._doorClosedX = doorW / 2;
            this._doorOpenX = doorW + 0.1; // slide outward by full door width

            // Destination panel on the back wall, near the right side.
            // Without rotation, the panel's +Z face points into the car.
            const panelGroup = new THREE.Group();
            panelGroup.position.set(CAR_W / 2 - 0.45, 1.2, -CAR_D / 2 + 0.08);
            car.add(panelGroup);

            const panelPlate = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 1.2, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x222227, roughness: 0.5, metalness: 0.7 })
            );
            panelGroup.add(panelPlate);

            const buttonOff = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
            this._destBtnMatOn = new THREE.MeshStandardMaterial({
                color: 0xffaa55, emissive: 0xff6622, emissiveIntensity: 1.2, roughness: 0.4
            });
            this._destBtnMatOff = buttonOff;
            this.destButtons = [];
            const nf = this.world.floors.length;
            for (let f = 0; f < nf; f++) {
                const btnGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14);
                const btn = new THREE.Mesh(btnGeom, buttonOff);
                btn.rotation.x = Math.PI / 2;
                const yPos = -0.45 + (f * 0.18);
                btn.position.set(0, yPos, 0.04);
                panelGroup.add(btn);
                this.destButtons.push(btn);
            }

            // In-car floor indicator above doors (faces -Z so passengers facing doors can see it)
            const inCarTex = root.makeIndicatorTexture("0");
            const inCarMat = new THREE.MeshBasicMaterial({ map: inCarTex });
            const inCarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), inCarMat);
            inCarMesh.position.set(0, CAR_H - 0.4, CAR_D / 2 - 0.05);
            inCarMesh.rotation.y = Math.PI;
            car.add(inCarMesh);
            this._inCarIndicator = { mesh: inCarMesh, tex: inCarTex };

            // Make every car mesh renderOrder = 1
            car.traverse(obj => { if (obj.isMesh) obj.renderOrder = 1; });

            this.car = car;
            this.scene.add(car);
        }

        // ---- Pass-through API --------------------------------------------
        callUp(floor)            { this.logic.callUp(floor); }
        callDown(floor)          { this.logic.callDown(floor); }
        pressDestination(floor)  { this.logic.pressDestination(floor); }
        isAcceptingAt(f, dir)    { return this.logic.isAcceptingAt(f, dir); }
        currentCapacityFree()    { return this.logic.currentCapacityFree(); }
        registerDisembark(p)     { this.logic.registerDisembark(p); }
        completeDisembark(p)     { this.logic.completeDisembark(p); }
        completeBoard(p)         { this.logic.completeBoard(p); }
        reset()                  { this.logic.reset(); this.car.position.y = 0; this._setDoorOpenAmount(0); this._refreshIndicators(); }

        reserveBoardingSpot(person) {
            const localSpot = this.logic.reserveBoardingSpot(person);
            if (!localSpot) return null;
            // Convert to a world-space target (used by ENTER_ELEVATOR)
            const carYNow = this.car.position.y;
            return {
                index: localSpot.index,
                local: { x: localSpot.x, y: localSpot.y, z: localSpot.z },
                worldNow: new THREE.Vector3(localSpot.x, carYNow, localSpot.z),
                getWorld: () => new THREE.Vector3(localSpot.x, this.car.position.y, localSpot.z),
                getLocal: () => new THREE.Vector3(localSpot.x, localSpot.y, localSpot.z),
            };
        }

        // Mirror state
        get state()       { return this.logic.state; }
        get direction()   { return this.logic.direction; }
        get currentFloor(){ return this.logic.currentFloor; }
        get targetFloor() { return this.logic.targetFloor; }
        get upCalls()     { return this.logic.upCalls; }
        get downCalls()   { return this.logic.downCalls; }
        get destinations(){ return this.logic.destinations; }
        get passengers()  { return this.logic.passengers; }
        get pendingBoarders()   { return this.logic.pendingBoarders; }
        get pendingDisembark()  { return this.logic.pendingDisembark; }

        // ---- Tick --------------------------------------------------------
        tick(dt) {
            this.logic.tick(dt);

            // car y position
            this.car.position.y = this.logic.position * FLOOR_HEIGHT;

            // doors
            this._setDoorOpenAmount(this.logic.doorOpenAmount);

            // call panel lamps + indicators
            this._refreshIndicators();
        }

        _setDoorOpenAmount(t) {
            // t: 0 = closed, 1 = open
            const slide = this._doorOpenX * t;
            this.leftDoor.position.x = -this._doorClosedX - slide;
            this.rightDoor.position.x = this._doorClosedX + slide;
        }

        _refreshIndicators() {
            const f = this.logic.currentFloor;
            const arrow = dirArrow(this.logic.direction);
            const text = `${f}${arrow === "-" ? "" : arrow}`;

            for (let i = 0; i < this.world.floors.length; i++) {
                const fl = this.world.floors[i];
                if (fl.callPanel && fl.callPanel.userData) {
                    fl.callPanel.userData.setUp(this.logic.upCalls.has(i));
                    fl.callPanel.userData.setDown(this.logic.downCalls.has(i));
                    fl.callPanel.userData.setIndicator(text);
                }
                if (fl.shaftIndicator && fl.shaftIndicator.userData) {
                    fl.shaftIndicator.userData.setIndicator(text);
                }
            }
            // in-car
            if (this._inCarIndicator) {
                root.updateTextTexture(this._inCarIndicator.tex, text);
            }
            // destination buttons
            for (let i = 0; i < this.destButtons.length; i++) {
                this.destButtons[i].material =
                    this.logic.destinations.has(i) ? this._destBtnMatOn : this._destBtnMatOff;
            }
        }
    }

    root.Elevator = Elevator;
    root.ELEVATOR_GEOM = { CAR_W, CAR_D, CAR_H, FLOOR_HEIGHT };
})(typeof window !== "undefined" ? window : globalThis);
