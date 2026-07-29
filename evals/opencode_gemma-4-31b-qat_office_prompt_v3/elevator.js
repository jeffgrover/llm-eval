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

        const frameMat = new THREE.MeshStandardMaterial({color: 0xffff00, opacity: 0.5, transparent: true});
        const wallMat = new THREE.MeshStandardMaterial({color: 0xffff00, opacity: 0.7, transparent: true});
        const backWallMat = new THREE.MeshStandardMaterial({color: 0xffff00});

        const floor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 3), frameMat);
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 3), frameMat);
        ceiling.position.y = 2.4;
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 3), frameMat);
        leftWall.position.x = -1.45;
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 3), frameMat);
        rightWall.position.x = 1.45;
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 0.1), backWallMat);
        backWall.position.z = -1.45;
        backWall.position.y = 1.2;

        this.carGroup.add(floor, ceiling, leftWall, rightWall, backWall);

        const doorGeo = new THREE.BoxGeometry(1.45, 2.4, 0.05);
        this.doorL = new THREE.Mesh(doorGeo, wallMat);
        this.doorL.position.set(-0.05, 1.2, 1.5);
        this.doorR = new THREE.Mesh(doorGeo, wallMat);
        this.doorR.position.set(0.05, 1.2, 1.5);
        this.carGroup.add(this.doorL, this.doorR);

        const panelGroup = new THREE.Group();
        panelGroup.position.set(1.3, 1.2, -1.4);
        this.buttons = [];
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({color: 0x444444}));
            btn.position.y = i * 0.2;
            panelGroup.add(btn);
            this.buttons.push(btn);
        }
        this.carGroup.add(panelGroup);

        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({map: texture}));
        indicator.position.set(0, 2.3, 1.4);
        this.carGroup.add(indicator);

        this.indicatorTexture = texture;
        this.indicatorCtx = ctx;

        this.scene.add(this.carGroup);
    }

    updateIndicator(text) {
        const ctx = this.indicatorCtx;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#ffbb22';
        ctx.font = 'Bold 60px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
        this.indicatorTexture.needsUpdate = true;
    }

    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
    reset() { this.logic.reset(); }

    tick(dt) {
        this.logic.tick(dt);
        this.carGroup.position.y = this.logic.currentY;

        const doorOpenVal = (this.logic.state === 'DOOR_OPEN' || this.logic.state === 'DOOR_OPENING') ? 1 : 0;
        const targetL = -1.45 * doorOpenVal;
        const targetR = 1.45 * doorOpenVal;
        this.doorL.position.x += (targetL - this.doorL.position.x) * 0.1;
        this.doorR.position.x += (targetR - this.doorR.position.x) * 0.1;

        this.buttons.forEach((btn, i) => {
            btn.material.emissive.set(this.logic.destinations.has(i) ? 0x00ff00 : 0x000000);
        });

        let dirChar = this.logic.direction === 1 ? '^' : (this.logic.direction === -1 ? 'v' : '');
        this.updateIndicator(`${this.logic.currentFloor}${dirChar}`);
        
        // Update world call panels
        this.world.floors.forEach(floor => {
            floor.callPanel.setUp(this.logic.upCalls.has(floor.floorNumber));
            floor.callPanel.setDown(this.logic.downCalls.has(floor.floorNumber));
            floor.callPanel.setIndicator(`${this.logic.currentFloor}${dirChar}`);
            floor.shaftIndicator.material = new THREE.MeshBasicMaterial({// Need to handle shaft indicator properly
            });
        });
    }

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
}

window.Elevator = Elevator;
