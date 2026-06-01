(function (root) {
    const FH = WORLD.FLOOR_HEIGHT;
    const CAR_W = 1.5;
    const CAR_H = 2.5;
    const CAR_D = 1.5;

    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: world.floors.length,
                maxCapacity: 4,
                floorHeight: FH
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            this.scene.add(this.carGroup);

            this._buildCar();
            this._collectPanels();
            this._buildInCarIndicator();
            this._updateVisuals();
        }

        _buildCar() {
            const yellowMat = new THREE.MeshLambertMaterial({
                color: 0xddcc00, transparent: true, opacity: 0.5,
                depthWrite: false, side: THREE.DoubleSide
            });
            const yellowSolid = new THREE.MeshLambertMaterial({ color: 0xddcc00 });
            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xddcc00, transparent: true, opacity: 0.7,
                depthWrite: false, side: THREE.DoubleSide
            });

            const floor = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.1, CAR_D), yellowMat);
            floor.position.y = 0.05;
            floor.renderOrder = 1;
            this.carGroup.add(floor);

            const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CAR_W, 0.1, CAR_D), yellowMat);
            ceiling.position.y = CAR_H - 0.05;
            ceiling.renderOrder = 1;
            this.carGroup.add(ceiling);

            for (const sx of [-1, 1]) {
                const side = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, CAR_H - 0.2, CAR_D),
                    yellowMat
                );
                side.position.set(sx * (CAR_W / 2 - 0.04), (CAR_H - 0.2) / 2 + 0.1, 0);
                side.renderOrder = 1;
                this.carGroup.add(side);
            }

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(CAR_W, CAR_H, 0.08),
                yellowSolid
            );
            back.position.set(0, CAR_H / 2, -CAR_D / 2 + 0.04);
            back.renderOrder = 1;
            this.carGroup.add(back);

            this.door1 = new THREE.Mesh(
                new THREE.BoxGeometry(CAR_W / 2, CAR_H - 0.2, 0.08),
                doorMat
            );
            this.door1.position.set(-CAR_W / 4, (CAR_H - 0.2) / 2 + 0.1, CAR_D / 2 - 0.04);
            this.door1.renderOrder = 1;
            this.carGroup.add(this.door1);

            this.door2 = new THREE.Mesh(
                new THREE.BoxGeometry(CAR_W / 2, CAR_H - 0.2, 0.08),
                doorMat
            );
            this.door2.position.set(CAR_W / 4, (CAR_H - 0.2) / 2 + 0.1, CAR_D / 2 - 0.04);
            this.door2.renderOrder = 1;
            this.carGroup.add(this.door2);

            this._buildDestinationPanel();
        }

        _buildDestinationPanel() {
            const panel = new THREE.Group();
            const plate = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 1.6, 0.05),
                new THREE.MeshLambertMaterial({ color: 0x222222 })
            );
            panel.add(plate);
            panel.position.set(CAR_W / 2 - 0.1, CAR_H * 0.55, -CAR_D / 2 + 0.12);
            panel.rotation.y = -Math.PI / 2;
            this.carGroup.add(panel);

            this.destinationButtons = [];
            for (let f = 0; f < this.world.floors.length; f++) {
                const btn = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12),
                    new THREE.MeshBasicMaterial({ color: 0x444444 })
                );
                btn.rotation.z = Math.PI / 2;
                const y = 0.6 - f * 0.24;
                btn.position.set(0, y, 0.03);
                panel.add(btn);
                this.destinationButtons.push(btn);
            }
        }

        _buildInCarIndicator() {
            const indicator = new THREE.Group();
            const frame = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.7, 0.05),
                new THREE.MeshLambertMaterial({ color: 0x111111 })
            );
            indicator.add(frame);
            const display = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 0.6),
                makeTextMaterial("0")
            );
            display.position.z = 0.03;
            indicator.add(display);
            indicator.position.set(0, CAR_H - 0.5, CAR_D / 2 - 0.06);
            this.carGroup.add(indicator);
            this.inCarIndicator = display;
        }

        _collectPanels() {
            this.callPanels = [];
            this.shaftIndicators = [];
            for (const floor of this.world.floors) {
                this.callPanels.push(floor.callPanel);
                this.shaftIndicators.push(floor.shaftIndicator);
            }
        }

        callUp(floor) { this.logic.callUp(floor); }
        callDown(floor) { this.logic.callDown(floor); }
        pressDestination(floor) { this.logic.pressDestination(floor); }
        isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
        currentCapacityFree() { return this.logic.currentCapacityFree(); }
        reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
        completeBoard(person) { return this.logic.completeBoard(person); }
        registerDisembark(person) { return this.logic.registerDisembark(person); }
        completeDisembark(person) { return this.logic.completeDisembark(person); }
        reset() { this.logic.reset(); }

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
        get minDoorOpenS() { return this.logic.minDoorOpenS; }
        get maxDoorOpenS() { return this.logic.maxDoorOpenS; }

        tick(dt) {
            this.logic.tick(dt);
            this._updateVisuals();
        }

        _updateVisuals() {
            this.carGroup.position.y = this.logic.currentFloor * FH;

            const dp = this.logic.doorProgress;
            this.door1.position.x = -(CAR_W / 4 + dp * 0.3);
            this.door2.position.x = (CAR_W / 4 + dp * 0.3);

            for (let f = 0; f < this.callPanels.length; f++) {
                const panel = this.callPanels[f];
                panel.userData.setUp(this.logic.upCalls.has(f));
                panel.userData.setDown(this.logic.downCalls.has(f));
            }

            const floorText = String(Math.round(this.logic.currentFloor));
            for (let f = 0; f < this.shaftIndicators.length; f++) {
                const ind = this.shaftIndicators[f];
                ind.userData.setIndicator(floorText);
            }

            const dirSymbol = this.logic.direction > 0 ? "^" : (this.logic.direction < 0 ? "v" : "");
            setIndicatorText(this.inCarIndicator, floorText + dirSymbol);

            for (let f = 0; f < this.destinationButtons.length; f++) {
                const btn = this.destinationButtons[f];
                btn.material.color.setHex(this.logic.destinations.has(f) ? 0x33ff33 : 0x444444);
            }
        }
    }

    root.Elevator = Elevator;
})(typeof window !== "undefined" ? window : globalThis);
