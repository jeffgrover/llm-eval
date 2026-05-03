class Elevator {
    constructor(scene, world) {
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });
        
        this.world = world;
        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;
        scene.add(this.carGroup);

        const matCar = new THREE.MeshLambertMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const matBack = new THREE.MeshLambertMaterial({ color: 0xffff00, side: THREE.DoubleSide });
        const matDoor = new THREE.MeshLambertMaterial({ color: 0xffff00, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });

        const w = WORLD.SHAFT_WIDTH - 0.2;
        const d = WORLD.SHAFT_DEPTH - 0.2;
        const h = WORLD.FLOOR_HEIGHT - 0.4;

        // Floor / Ceiling
        const floorGeo = new THREE.PlaneGeometry(w, d);
        const carFloor = new THREE.Mesh(floorGeo, matCar);
        carFloor.rotation.x = -Math.PI / 2;
        this.carGroup.add(carFloor);

        const carCeil = new THREE.Mesh(floorGeo, matCar);
        carCeil.rotation.x = Math.PI / 2;
        carCeil.position.y = h;
        this.carGroup.add(carCeil);

        // Sides
        const sideGeo = new THREE.PlaneGeometry(d, h);
        const carLeft = new THREE.Mesh(sideGeo, matCar);
        carLeft.rotation.y = -Math.PI / 2;
        carLeft.position.set(-w / 2, h / 2, 0);
        this.carGroup.add(carLeft);

        const carRight = new THREE.Mesh(sideGeo, matCar);
        carRight.rotation.y = Math.PI / 2;
        carRight.position.set(w / 2, h / 2, 0);
        this.carGroup.add(carRight);

        // Back wall
        const backGeo = new THREE.PlaneGeometry(w, h);
        const carBack = new THREE.Mesh(backGeo, matBack);
        carBack.rotation.y = Math.PI;
        carBack.position.set(0, h / 2, -d / 2);
        this.carGroup.add(carBack);

        // Doors
        this.leftDoor = new THREE.Mesh(new THREE.PlaneGeometry(w / 2, h), matDoor);
        this.leftDoor.position.set(-w / 4, h / 2, d / 2);
        this.carGroup.add(this.leftDoor);

        this.rightDoor = new THREE.Mesh(new THREE.PlaneGeometry(w / 2, h), matDoor);
        this.rightDoor.position.set(w / 4, h / 2, d / 2);
        this.carGroup.add(this.rightDoor);

        // Destination panel
        this.destPanel = new THREE.Group();
        this.destPanel.position.set(w / 2 - 0.1, h / 2, -d / 2 + 0.5);
        this.destPanel.rotation.y = -Math.PI / 2;
        this.carGroup.add(this.destPanel);
        
        const panelBack = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), new THREE.MeshBasicMaterial({color: 0x222222}));
        this.destPanel.add(panelBack);

        this.destButtons = [];
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const bx = (i % 2 === 0) ? -0.15 : 0.15;
            const by = -0.4 + Math.floor(i / 2) * 0.3;
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05), new THREE.MeshBasicMaterial({color: 0x111111}));
            btn.rotation.x = Math.PI / 2;
            btn.position.set(bx, by, 0.02);
            this.destPanel.add(btn);
            this.destButtons.push(btn);
        }

        // In-car indicator
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        this.indCtx = canvas.getContext('2d');
        this.indTex = new THREE.CanvasTexture(canvas);
        this.indTex.minFilter = THREE.LinearFilter;
        this.indTex._lastText = null;
        
        const indMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({map: this.indTex}));
        indMesh.position.set(0, h - 0.4, d / 2 - 0.05);
        indMesh.rotation.y = Math.PI;
        this.carGroup.add(indMesh);
    }

    updateInCarIndicator(text) {
        if (this.indTex._lastText === text) return;
        this.indTex._lastText = text;
        const ctx = this.indCtx;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 256, 256);
        ctx.font = 'bold 200px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffbb22';
        ctx.shadowColor = '#ffbb22';
        ctx.shadowBlur = 10;
        ctx.fillText(text, 128, 128);
        ctx.shadowBlur = 0;
        this.indTex.needsUpdate = true;
    }

    // Delegate to logic
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
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

    tick(dt) {
        this.logic.tick(dt);

        this.carGroup.position.y = this.logic.carY;

        // Doors sliding
        let doorOpenRatio = 0;
        if (this.logic.state === this.logic.STATE.DOOR_OPEN) {
            doorOpenRatio = 1;
        } else if (this.logic.state === this.logic.STATE.DOOR_OPENING) {
            doorOpenRatio = Math.min(1, this.logic.doorTimer / 1.0);
        } else if (this.logic.state === this.logic.STATE.DOOR_CLOSING) {
            doorOpenRatio = 1 - Math.min(1, this.logic.doorTimer / 1.0);
        }

        const w = WORLD.SHAFT_WIDTH - 0.2;
        const openSlide = (w / 2) - 0.1;
        this.leftDoor.position.x = -w / 4 - (doorOpenRatio * openSlide);
        this.rightDoor.position.x = w / 4 + (doorOpenRatio * openSlide);

        // Buttons
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            this.destButtons[i].material.color.setHex(this.logic.destinations.has(i) ? 0x00ff00 : 0x111111);
        }

        // Indicators
        const dirStr = this.logic.direction === 1 ? '^' : (this.logic.direction === -1 ? 'v' : '');
        const indText = this.logic.currentFloor.toString() + dirStr;
        this.updateInCarIndicator(indText);

        // Floor panels
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const f = this.world.floors[i];
            f.callPanel.userData.setUp(this.logic.upCalls.has(i));
            f.callPanel.userData.setDown(this.logic.downCalls.has(i));
            f.callPanel.userData.setIndicator(this.logic.currentFloor.toString());
            f.shaftIndicator.userData.setIndicator(indText);
        }
    }
}
