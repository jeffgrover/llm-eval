(function() {
    class Elevator {
        constructor(scene, world) {
            this.scene = scene;
            this.world = world;
            this.logic = new ElevatorLogic({
                floorCount: WORLD.FLOOR_COUNT,
                maxCapacity: 4,
                floorHeight: WORLD.FLOOR_HEIGHT
            });

            this.carGroup = new THREE.Group();
            this.carGroup.renderOrder = 1;
            scene.add(this.carGroup);

            this._buildCar();
            this._buildDoors();
            this._buildDestinationPanel();
            this._buildInCarIndicator();

            this.buttonMeshes = [];
            this._createButtonMeshes();
        }

        _buildCar() {
            const carWidth = WORLD.SHAFT_WIDTH - 0.2;
            const carDepth = WORLD.SHAFT_DEPTH - 0.2;
            const carHeight = 2.8;

            const frameMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const floorGeom = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
            const floor = new THREE.Mesh(floorGeom, frameMat);
            floor.position.y = 0.05;
            this.carGroup.add(floor);

            const ceilingGeom = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
            const ceiling = new THREE.Mesh(ceilingGeom, frameMat);
            ceiling.position.y = carHeight;
            this.carGroup.add(ceiling);

            const sideGeom = new THREE.BoxGeometry(0.1, carHeight, carDepth);
            const leftWall = new THREE.Mesh(sideGeom, frameMat);
            leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
            this.carGroup.add(leftWall);

            const rightWall = new THREE.Mesh(sideGeom, frameMat);
            rightWall.position.set(carWidth / 2, carHeight / 2, 0);
            this.carGroup.add(rightWall);

            const backGeom = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
            const backMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
            const backWall = new THREE.Mesh(backGeom, backMat);
            backWall.position.set(0, carHeight / 2, -carDepth / 2);
            this.carGroup.add(backWall);
        }

        _buildDoors() {
            const carWidth = WORLD.SHAFT_WIDTH - 0.2;
            const carHeight = 2.8;
            const doorWidth = carWidth / 2 - 0.05;
            const doorHeight = carHeight - 0.2;

            const doorMat = new THREE.MeshLambertMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const doorGeom = new THREE.BoxGeometry(doorWidth, doorHeight, 0.05);

            this.leftDoor = new THREE.Mesh(doorGeom, doorMat);
            this.leftDoor.position.set(-doorWidth / 2, doorHeight / 2 + 0.1, (WORLD.SHAFT_DEPTH - 0.2) / 2);
            this.carGroup.add(this.leftDoor);

            this.rightDoor = new THREE.Mesh(doorGeom, doorMat);
            this.rightDoor.position.set(doorWidth / 2, doorHeight / 2 + 0.1, (WORLD.SHAFT_DEPTH - 0.2) / 2);
            this.carGroup.add(this.rightDoor);

            this.doorOpenOffset = doorWidth - 0.1;
        }

        _buildDestinationPanel() {
            const panelGeom = new THREE.BoxGeometry(0.3, 0.8, 0.05);
            const panelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
            this.destPanel = new THREE.Mesh(panelGeom, panelMat);
            this.destPanel.position.set(1.2, 1.4, -1.2);
            this.carGroup.add(this.destPanel);
        }

        _createButtonMeshes() {
            const buttonGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12);
            const buttonOffMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
            const buttonOnMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

            for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
                const button = new THREE.Mesh(buttonGeom, buttonOffMat);
                button.rotation.x = Math.PI / 2;
                button.position.set(1.2, 1.8 - f * 0.15, -1.17);
                this.carGroup.add(button);
                this.buttonMeshes.push({
                    mesh: button,
                    offMat: buttonOffMat,
                    onMat: buttonOnMat
                });
            }
        }

        _buildInCarIndicator() {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            this.indicatorTex = new THREE.CanvasTexture(canvas);
            this.indicatorTex.minFilter = THREE.LinearFilter;
            this.indicatorTex.magFilter = THREE.LinearFilter;
            this.indicatorTex.anisotropy = 4;

            this.indicatorCanvas = canvas;
            this.indicatorCtx = ctx;

            const geom = new THREE.PlaneGeometry(0.6, 0.6);
            const mat = new THREE.MeshBasicMaterial({ map: this.indicatorTex });
            this.inCarIndicator = new THREE.Mesh(geom, mat);
            this.inCarIndicator.position.set(0, 2.6, 1.2);
            this.inCarIndicator.rotation.y = Math.PI;
            this.carGroup.add(this.inCarIndicator);

            this._updateIndicatorText('0');
        }

        _updateIndicatorText(text) {
            if (this.indicatorTex._lastText === text) return;
            this.indicatorTex._lastText = text;

            const ctx = this.indicatorCtx;
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, 256, 256);

            ctx.fillStyle = '#ffbb22';
            ctx.font = 'bold 180px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffbb22';
            ctx.fillText(text, 128, 128);
            ctx.shadowBlur = 0;

            this.indicatorTex.needsUpdate = true;
        }

        callUp(floor) {
            this.logic.callUp(floor);
        }

        callDown(floor) {
            this.logic.callDown(floor);
        }

        pressDestination(floor) {
            this.logic.pressDestination(floor);
        }

        isAcceptingAt(floor, direction) {
            return this.logic.isAcceptingAt(floor, direction);
        }

        currentCapacityFree() {
            return this.logic.currentCapacityFree();
        }

        reserveBoardingSpot(person) {
            return this.logic.reserveBoardingSpot(person);
        }

        completeBoard(person) {
            this.logic.completeBoard(person);
        }

        registerDisembark(person) {
            this.logic.registerDisembark(person);
        }

        completeDisembark(person) {
            this.logic.completeDisembark(person);
        }

        tick(dt) {
            this.logic.tick(dt);

            const floorY = this.logic.currentFloor * WORLD.FLOOR_HEIGHT;
            this.carGroup.position.y = floorY;

            const doorOffset = this.logic.doorPosition * this.doorOpenOffset;
            this.leftDoor.position.x = -this.doorOpenOffset / 2 - doorOffset;
            this.rightDoor.position.x = this.doorOpenOffset / 2 + doorOffset;

            for (const floor of this.world.floors) {
                const panel = floor.callPanel;
                if (panel && panel.userData) {
                    panel.userData.setUp(this.logic.upCalls.has(floor.floorNumber));
                    panel.userData.setDown(this.logic.downCalls.has(floor.floorNumber));

                    const dirSymbol = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '');
                    const floorNum = Math.round(this.logic.currentFloor);
                    panel.userData.setIndicator(floorNum + dirSymbol);
                }

                const indicator = floor.shaftIndicator;
                if (indicator && indicator.userData) {
                    const dirSymbol = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '');
                    const floorNum = Math.round(this.logic.currentFloor);
                    indicator.userData.setIndicator(floorNum + dirSymbol);
                }
            }

            for (let f = 0; f < this.buttonMeshes.length; f++) {
                const btn = this.buttonMeshes[f];
                btn.mesh.material = this.logic.destinations.has(f) ? btn.onMat : btn.offMat;
            }

            const dirSymbol = this.logic.direction > 0 ? '^' : (this.logic.direction < 0 ? 'v' : '');
            const floorNum = Math.round(this.logic.currentFloor);
            this._updateIndicatorText(floorNum + dirSymbol);
        }

        reset() {
            this.logic.reset();
            this.carGroup.position.y = 0;
            this.leftDoor.position.x = -this.doorOpenOffset / 2;
            this.rightDoor.position.x = this.doorOpenOffset / 2;
        }

        get state() {
            return this.logic.state;
        }

        get direction() {
            return this.logic.direction;
        }

        get currentFloor() {
            return this.logic.currentFloor;
        }

        get targetFloor() {
            return this.logic.targetFloor;
        }

        get upCalls() {
            return this.logic.upCalls;
        }

        get downCalls() {
            return this.logic.downCalls;
        }

        get destinations() {
            return this.logic.destinations;
        }

        get passengers() {
            return this.logic.passengers;
        }

        get pendingBoarders() {
            return this.logic.pendingBoarders;
        }

        get pendingDisembark() {
            return this.logic.pendingDisembark;
        }
    }

    window.Elevator = Elevator;
})();
