// elevator.js - Three.js elevator car, doors, indicators, adapter around ElevatorLogic.

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
        });

        this.carGroup = new THREE.Group();
        this.destButtons = [];
        this.buildCar();
        scene.add(this.carGroup);
    }

    buildCar() {
        const car = this.carGroup;
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0xe8c33e, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide, roughness: 0.6,
        });
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0xf0cf52, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide, roughness: 0.5,
        });
        const backMat = new THREE.MeshStandardMaterial({ color: 0xd9b52e, roughness: 0.6 });

        const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 2.9), frameMat.clone());
        floorSlab.material.opacity = 0.8;
        floorSlab.position.y = -0.06;
        car.add(floorSlab);

        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 2.9), frameMat);
        ceiling.position.y = 2.6;
        car.add(ceiling);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 2.9), frameMat);
        leftWall.position.set(-1.45, 1.3, 0);
        car.add(leftWall);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 2.9), frameMat);
        rightWall.position.set(1.45, 1.3, 0);
        car.add(rightWall);

        const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.6, 0.08), backMat);
        backWall.position.set(0, 1.3, -1.45);
        car.add(backWall);

        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.4, 0.06), doorMat);
        this.leftDoor.position.set(-0.71, 1.25, 1.44);
        car.add(this.leftDoor);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.4, 0.06), doorMat.clone());
        this.rightDoor.position.set(0.71, 1.25, 1.44);
        car.add(this.rightDoor);

        const panelBoard = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 1.0, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.8 })
        );
        panelBoard.position.set(1.0, 1.45, -1.39);
        car.add(panelBoard);

        const btnGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12);
        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const mat = new THREE.MeshStandardMaterial({
                color: 0x4a5160, emissive: 0x0c0e12, emissiveIntensity: 1.0, roughness: 0.5,
            });
            const btn = new THREE.Mesh(btnGeo, mat);
            btn.rotation.x = Math.PI / 2;
            const col = f % 2;
            const row = Math.floor(f / 2);
            btn.position.set(0.87 + col * 0.26, 1.2 + row * 0.25, -1.35);
            car.add(btn);
            this.destButtons.push(btn);
        }

        this.carIndicator = makeTextIndicator(0.6, 0.6);
        this.carIndicator.position.set(0, 2.32, 1.39);
        this.carIndicator.rotation.y = Math.PI;
        car.add(this.carIndicator);

        car.traverse((obj) => {
            obj.renderOrder = 1;
        });
    }

    // ---- passthrough API used by sim.js ----
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    ensurePassenger(person, floor) { this.logic.ensurePassenger(person, floor); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
    reset() { this.logic.reset(); }

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

    spotWorldPos(spot) {
        return this.carGroup.localToWorld(new THREE.Vector3(spot.x, 0, spot.z));
    }

    doorThresholdPos(floor, spotX) {
        return new THREE.Vector3(spotX, floor * WORLD.FLOOR_HEIGHT, 2.0);
    }

    tick(dt) {
        this.logic.tick(dt);
        this.carGroup.position.y = this.logic.position * WORLD.FLOOR_HEIGHT;

        const open = this.logic.doorOpenAmount;
        this.leftDoor.position.x = -0.71 - open * 1.28;
        this.rightDoor.position.x = 0.71 + open * 1.28;

        const cf = this.logic.currentFloor;
        const dirChar = this.logic.direction > 0 ? "^" : this.logic.direction < 0 ? "v" : "";
        for (let f = 0; f < this.world.floors.length; f += 1) {
            const fl = this.world.floors[f];
            fl.callPanel.userData.setUp(this.logic.upCalls.has(f));
            fl.callPanel.userData.setDown(this.logic.downCalls.has(f));
            fl.callPanel.userData.setIndicator(String(cf));
            fl.shaftIndicator.userData.setIndicator(cf + dirChar);
        }
        this.carIndicator.userData.setIndicator(String(cf));

        for (let b = 0; b < this.destButtons.length; b += 1) {
            const lit = this.logic.destinations.has(b);
            this.destButtons[b].material.emissive.setHex(lit ? 0xffaa22 : 0x0c0e12);
        }
    }
}

window.Elevator = Elevator;
