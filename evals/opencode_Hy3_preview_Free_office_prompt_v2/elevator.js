class Elevator {
    constructor(scene, world) {
        this.logic = new ElevatorLogic({
            floorCount: world.floors.length,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });
        this.world = world;
        this.group = new THREE.Group();
        this.group.renderOrder = 1;

        this._createCar();
        this._createDoors();
        this._createIndicators();
        this._createDestinationPanel();

        this.group.position.y = 0;
        scene.add(this.group);
    }

    _createCar() {
        // Floor
        const floorGeo = new THREE.BoxGeometry(3, 0.1, 3);
        const floorMat = new THREE.MeshBasicMaterial({ color: '#ff0', transparent: true, opacity: 0.5 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = 0;
        this.group.add(floor);

        // Ceiling
        const ceilGeo = new THREE.BoxGeometry(3, 0.1, 3);
        const ceilMat = new THREE.MeshBasicMaterial({ color: '#ff0', transparent: true, opacity: 0.5 });
        const ceil = new THREE.Mesh(ceilGeo, ceilMat);
        ceil.position.y = 2.5;
        this.group.add(ceil);

        // Side walls
        const wallMat = new THREE.MeshBasicMaterial({ color: '#ff0', transparent: true, opacity: 0.5 });
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 0.1), new THREE.MeshBasicMaterial({ color: '#ff0' }));
        backWall.position.set(0, 1.25, -1.5);
        this.group.add(backWall);

        const sideWallGeo = new THREE.BoxGeometry(0.1, 2.5, 3);
        [-1.5, 1.5].forEach(x => {
            const wall = new THREE.Mesh(sideWallGeo, wallMat);
            wall.position.set(x, 1.25, 0);
            this.group.add(wall);
        });
    }

    _createDoors() {
        this.doors = [];
        const doorMat = new THREE.MeshBasicMaterial({ color: '#ff0', transparent: true, opacity: 0.7 });
        [-0.75, 0.75].forEach(x => {
            const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.5, 0.1), doorMat);
            door.position.set(x, 1.25, 1.5);
            this.group.add(door);
            this.doors.push(door);
        });
        this.doorOpenAmount = 0;
    }

    _createIndicators() {
        // Inside indicator
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        this.insideCtx = canvas.getContext('2d');
        this.insideTex = new THREE.CanvasTexture(canvas);
        const insideGeo = new THREE.PlaneGeometry(0.6, 0.6);
        const insideMat = new THREE.MeshBasicMaterial({ map: this.insideTex, transparent: true });
        this.insideIndicator = new THREE.Mesh(insideGeo, insideMat);
        this.insideIndicator.position.set(0, 2, -1.4);
        this.group.add(this.insideIndicator);
        this._updateInsideIndicator();
    }

    _createDestinationPanel() {
        this.destButtons = [];
        const panelGeo = new THREE.BoxGeometry(0.1, 2, 1);
        const panelMat = new THREE.MeshBasicMaterial({ color: '#333' });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(-1.4, 1.25, 0);
        this.group.add(panel);

        for (let f = 0; f < this.logic.floorCount; f++) {
            const btnGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16);
            const btnMatDefault = new THREE.MeshBasicMaterial({ color: '#444' });
            const btnMatActive = new THREE.MeshBasicMaterial({ color: '#0f0', emissive: '#0f0' });
            const btn = new THREE.Mesh(btnGeo, btnMatDefault);
            btn.position.set(-1.35, 0.5 + f * 0.3, 0);
            this.group.add(btn);
            this.destButtons[f] = { mesh: btn, matDefault: btnMatDefault, matActive: btnMatActive };
        }
    }

    _updateInsideIndicator() {
        const ctx = this.insideCtx;
        ctx.clearRect(0,0,256,256);
        ctx.fillStyle = '#050505'; ctx.fillRect(0,0,256,256);
        ctx.font = 'bold 200px monospace'; ctx.fillStyle = '#ffbb22';
        ctx.shadowColor = '#ffbb22'; ctx.shadowBlur = 10;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const text = `${this.logic.currentFloor}${this.logic.direction === 1 ? '^' : this.logic.direction === -1 ? 'v' : ''}`;
        ctx.fillText(text, 128, 128);
        this.insideTex.needsUpdate = true;
    }

    // Public API mirroring ElevatorLogic
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(id) { return this.logic.reserveBoardingSpot(id); }
    completeBoard(id) { this.logic.completeBoard(id); }
    registerDisembark(id, floor) { this.logic.registerDisembark(id, floor); }
    completeDisembark(id) { this.logic.completeDisembark(id); }
    reset() { this.logic.reset(); this.group.position.y = 0; }

    tick(dt) {
        this.logic.tick(dt);
        // Update car position
        this.group.position.y = this.logic.y;
        // Update doors
        this._updateDoors(dt);
        // Update indicators
        this._updateInsideIndicator();
        // Update call panels
        this.world.floors.forEach(floor => {
            const panel = floor.callPanel;
            if (panel) {
                panel.userData.setUp(this.logic.upCalls.has(floor.floorNumber));
                panel.userData.setDown(this.logic.downCalls.has(floor.floorNumber));
                panel.userData.setIndicator(`${this.logic.currentFloor}${this.logic.direction === 1 ? '^' : this.logic.direction === -1 ? 'v' : ''}`);
            }
            const shaftInd = floor.shaftIndicator;
            if (shaftInd) {
                shaftInd.userData.setText(`${this.logic.currentFloor}${this.logic.direction === 1 ? '^' : this.logic.direction === -1 ? 'v' : ''}`);
            }
        });
        // Update destination buttons
        this.logic.destinations.forEach(f => {
            const btn = this.destButtons[f];
            if (btn) btn.mesh.material = btn.matActive;
        });
        // Turn off buttons not in destinations
        for (let f=0; f<this.logic.floorCount; f++) {
            if (!this.logic.destinations.has(f)) {
                const btn = this.destButtons[f];
                if (btn) btn.mesh.material = btn.matDefault;
            }
        }
    }

    _updateDoors(dt) {
        const targetOpen = this.logic.state === 'DOOR_OPEN' || this.logic.state === 'DOOR_OPENING' ? 1 : 0;
        const speed = 2;
        this.doorOpenAmount += (targetOpen - this.doorOpenAmount) * Math.min(1, speed * dt);
        this.doors[0].position.x = -0.75 - this.doorOpenAmount * 0.75;
        this.doors[1].position.x = 0.75 + this.doorOpenAmount * 0.75;
    }
}

window.Elevator = Elevator;
