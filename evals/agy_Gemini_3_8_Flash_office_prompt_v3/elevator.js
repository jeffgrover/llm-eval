/**
 * elevator.js
 * Three.js elevator car, sliding doors, destination panel, indicators,
 * and visual adapter wrapping ElevatorLogic.
 */

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
        this.scene.add(this.carGroup);

        this._buildCar();
    }

    _buildCar() {
        const carW = 2.4;
        const carD = 2.4;
        const carH = 2.8;

        const yellowFrameMat = new THREE.MeshLambertMaterial({
            color: 0xffd54f,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const solidBackMat = new THREE.MeshLambertMaterial({
            color: 0xfbc02d,
            side: THREE.DoubleSide
        });

        const floorCeilMat = new THREE.MeshLambertMaterial({
            color: 0x424242,
            side: THREE.DoubleSide
        });

        // Floor slab of car
        const carFloor = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.08, carD), floorCeilMat);
        carFloor.position.set(0, 0.04, 0);
        carFloor.renderOrder = 1;
        this.carGroup.add(carFloor);

        // Ceiling slab of car
        const carCeil = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.08, carD), floorCeilMat);
        carCeil.position.set(0, carH - 0.04, 0);
        carCeil.renderOrder = 1;
        this.carGroup.add(carCeil);

        // Back wall (z = -carD / 2 = -1.2) - solid
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(carW, carH - 0.16, 0.06), solidBackMat);
        backWall.position.set(0, carH / 2, -carD / 2 + 0.03);
        backWall.renderOrder = 1;
        this.carGroup.add(backWall);

        // Left wall (x = -carW / 2 = -1.2) - semi-transparent
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, carH - 0.16, carD), yellowFrameMat);
        leftWall.position.set(-carW / 2 + 0.03, carH / 2, 0);
        leftWall.renderOrder = 1;
        this.carGroup.add(leftWall);

        // Right wall (x = carW / 2 = 1.2) - semi-transparent
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.06, carH - 0.16, carD), yellowFrameMat);
        rightWall.position.set(carW / 2 - 0.03, carH / 2, 0);
        rightWall.renderOrder = 1;
        this.carGroup.add(rightWall);

        // Two sliding doors on the +Z face (z = carD / 2 = 1.2)
        const doorW = 1.15;
        const doorH = 2.6;
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xfff59d,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        // Left Door (closed at x = -doorW / 2 = -0.575)
        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat);
        this.leftDoor.position.set(-doorW / 2, doorH / 2 + 0.08, carD / 2 - 0.025);
        this.leftDoor.renderOrder = 1;
        this.carGroup.add(this.leftDoor);

        // Right Door (closed at x = doorW / 2 = 0.575)
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat);
        this.rightDoor.position.set(doorW / 2, doorH / 2 + 0.08, carD / 2 - 0.025);
        this.rightDoor.renderOrder = 1;
        this.carGroup.add(this.rightDoor);

        // Destination panel on back-right wall
        const destPanelMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
        const destPanel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.45), destPanelMat);
        destPanel.position.set(carW / 2 - 0.06, 1.4, -0.6);
        destPanel.renderOrder = 1;
        this.carGroup.add(destPanel);

        // Destination buttons (one glowing cylinder button per floor)
        this.destButtons = [];
        const btnGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10);
        btnGeo.rotateZ(Math.PI / 2); // points into car (-X)

        this.btnOffMat = new THREE.MeshLambertMaterial({ color: 0x455a64 });
        this.btnOnMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const btn = new THREE.Mesh(btnGeo, this.btnOffMat);
            const btnY = 0.85 + f * 0.18;
            btn.position.set(carW / 2 - 0.08, btnY, -0.6);
            btn.renderOrder = 1;
            this.carGroup.add(btn);
            this.destButtons.push(btn);
        }

        // In-car indicator mounted above doors from the INSIDE of the car
        // Facing -Z (looking toward passengers inside car)
        this.inCarTex = this._createCarIndicatorTexture(256, 256);
        const inCarGeo = new THREE.PlaneGeometry(0.6, 0.6);
        const inCarMat = new THREE.MeshBasicMaterial({ map: this.inCarTex.texture, side: THREE.DoubleSide });
        this.inCarIndicator = new THREE.Mesh(inCarGeo, inCarMat);
        this.inCarIndicator.position.set(0, carH - 0.38, carD / 2 - 0.06);
        this.inCarIndicator.rotation.y = Math.PI; // faces passengers (-Z)
        this.inCarIndicator.renderOrder = 1;
        this.carGroup.add(this.inCarIndicator);
    }

    _createCarIndicatorTexture(w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture._lastText = "";

        function update(text) {
            if (texture._lastText === text) return;
            texture._lastText = text;

            ctx.fillStyle = "#050505";
            ctx.fillRect(0, 0, w, h);

            ctx.strokeStyle = "#ff9800";
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, w - 4, h - 4);

            ctx.fillStyle = "#ffaa00";
            ctx.shadowColor = "#ff9900";
            ctx.shadowBlur = 12;
            ctx.font = `bold ${Math.floor(h * 0.6)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, w / 2, h / 2);

            texture.needsUpdate = true;
        }

        update("0");
        return { texture: texture, update: update };
    }

    // Public methods delegating to ElevatorLogic
    callUp(floor) { return this.logic.callUp(floor); }
    callDown(floor) { return this.logic.callDown(floor); }
    pressDestination(floor) { return this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    registerDisembark(person) { return this.logic.registerDisembark(person); }
    completeDisembark(person) { return this.logic.completeDisembark(person); }

    reset() {
        this.logic.reset();
        this.carGroup.position.y = 0;
        this.leftDoor.position.x = -0.575;
        this.rightDoor.position.x = 0.575;
        for (let i = 0; i < this.destButtons.length; i++) {
            this.destButtons[i].material = this.btnOffMat;
        }
    }

    // State getters for HUD and sim
    get state() { return this.logic.state; }
    get direction() { return this.logic.direction; }
    get currentFloor() { return this.logic.currentFloor; }
    get targetFloor() { return this.logic.targetFloor; }
    get currentY() { return this.logic.currentY; }
    get doorProgress() { return this.logic.doorProgress; }
    get upCalls() { return this.logic.upCalls; }
    get downCalls() { return this.logic.downCalls; }
    get destinations() { return this.logic.destinations; }
    get passengers() { return this.logic.passengers; }
    get pendingBoarders() { return this.logic.pendingBoarders; }
    get pendingDisembark() { return this.logic.pendingDisembark; }

    getSpotWorldPosition(spotIndex) {
        const spot = this.logic.interiorSpots[spotIndex] || this.logic.interiorSpots[0];
        const worldPos = new THREE.Vector3(spot.x, spot.y, spot.z);
        worldPos.applyMatrix4(this.carGroup.matrixWorld);
        return worldPos;
    }

    tick(dt) {
        this.logic.tick(dt);

        // Update car position
        this.carGroup.position.y = this.logic.currentY;

        // Update sliding doors
        const openOffset = this.logic.doorProgress * 0.9;
        this.leftDoor.position.x = -0.575 - openOffset;
        this.rightDoor.position.x = 0.575 + openOffset;

        // Update destination buttons
        for (let f = 0; f < this.destButtons.length; f++) {
            const isLit = this.logic.destinations.has(f);
            this.destButtons[f].material = isLit ? this.btnOnMat : this.btnOffMat;
        }

        // Indicator string
        let dirGlyph = "";
        if (this.logic.direction > 0) dirGlyph = "^";
        else if (this.logic.direction < 0) dirGlyph = "v";
        const indText = `${this.logic.currentFloor}${dirGlyph}`;

        // Update in-car indicator
        this.inCarTex.update(indText);

        // Update floor call panels and shaft indicators
        const floors = this.world.floors;
        for (let f = 0; f < floors.length; f++) {
            const floorData = floors[f];
            const panel = floorData.callPanel;
            if (panel && panel.userData) {
                panel.userData.setUp(this.logic.upCalls.has(f));
                panel.userData.setDown(this.logic.downCalls.has(f));
                panel.userData.setIndicator(indText);
            }
            const shaftInd = floorData.shaftIndicator;
            if (shaftInd && shaftInd.userData) {
                shaftInd.userData.setIndicator(indText);
            }
        }
    }
}

window.Elevator = Elevator;
