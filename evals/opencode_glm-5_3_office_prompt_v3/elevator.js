class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
            speed: 0.9,
            doorTime: 1.0,
            minOpenTime: 1.5,
            maxOpenTime: 45
        });

        const frameMat = new THREE.MeshLambertMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xd9a825 });
        const doorMat = new THREE.MeshLambertMaterial({ color: 0xf6d365, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        const panelMat = new THREE.MeshLambertMaterial({ color: 0x2f3542 });

        const car = new THREE.Group();
        this.carGroup = car;

        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), frameMat);
        floorMesh.position.set(0, -0.05, 0);
        car.add(floorMesh);

        const ceilingMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.8), frameMat);
        ceilingMesh.position.set(0, 2.55, 0);
        car.add(ceilingMesh);

        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 2.8), frameMat);
        wallL.position.set(-1.36, 1.25, 0);
        car.add(wallL);

        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 2.8), frameMat);
        wallR.position.set(1.36, 1.25, 0);
        car.add(wallR);

        const wallB = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 0.1), backMat);
        wallB.position.set(0, 1.25, -1.35);
        car.add(wallB);

        this.doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.3, 0.06), doorMat);
        this.doorLeft.position.set(-0.41, 1.15, 1.43);
        car.add(this.doorLeft);

        this.doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.3, 0.06), doorMat);
        this.doorRight.position.set(0.41, 1.15, 1.43);
        car.add(this.doorRight);

        const destPanel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.04), panelMat);
        destPanel.position.set(0.9, 1.6, -1.31);
        car.add(destPanel);

        this.buttonDimMat = new THREE.MeshLambertMaterial({ color: 0x444a55 });
        this.buttonLitMat = new THREE.MeshBasicMaterial({ color: 0xffbb22 });
        this.destButtons = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const col = f % 2;
            const row = Math.floor(f / 2);
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 10), this.buttonDimMat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(0.78 + col * 0.24, 1.3 + row * 0.3, -1.28);
            car.add(btn);
            this.destButtons.push(btn);
        }

        this.carIndicator = makeIndicatorMesh(0.6, 0.6, "0-");
        this.carIndicator.position.set(0, 2.12, 1.36);
        this.carIndicator.rotation.y = Math.PI;
        car.add(this.carIndicator);

        car.traverse(function (obj) {
            obj.renderOrder = 1;
        });

        car.position.set(0, 0, 0);
        scene.add(car);

        this.upCalls = this.logic.upCalls;
        this.downCalls = this.logic.downCalls;
        this.destinations = this.logic.destinations;
        this.passengers = this.logic.passengers;
        this.pendingBoarders = this.logic.pendingBoarders;
        this.pendingDisembark = this.logic.pendingDisembark;
        this.state = this.logic.state;
        this.direction = this.logic.direction;
        this.currentFloor = this.logic.currentFloor;
        this.targetFloor = this.logic.targetFloor;
        this.position = this.logic.position;
        this.doorOpenness = 0;
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

    isAcceptingAt(floor, dir) {
        return this.logic.isAcceptingAt(floor, dir);
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

    cancelBoarding(person) {
        this.logic.cancelBoarding(person);
    }

    registerDisembark(person) {
        this.logic.registerDisembark(person);
    }

    completeDisembark(person) {
        this.logic.completeDisembark(person);
    }

    reset() {
        this.logic.reset();
        this.tick(0);
    }

    tick(dt) {
        this.logic.tick(dt);
        const L = this.logic;
        this.state = L.state;
        this.direction = L.direction;
        this.currentFloor = L.currentFloor;
        this.targetFloor = L.targetFloor;
        this.position = L.position;
        this.doorOpenness = L.getDoorOpenness();

        this.carGroup.position.y = L.position * WORLD.FLOOR_HEIGHT;
        const open = L.getDoorOpenness();
        this.doorLeft.position.x = -0.41 - open * 0.8;
        this.doorRight.position.x = 0.41 + open * 0.8;

        const dispFloor = Math.max(0, Math.min(L.floorCount - 1, Math.round(L.position)));
        const glyph = L.direction > 0 ? "^" : (L.direction < 0 ? "v" : "-");
        const shaftText = String(dispFloor) + glyph;
        const floors = this.world.floors;
        for (let f = 0; f < floors.length; f++) {
            const fd = floors[f];
            fd.callPanel.userData.setUp(L.upCalls.has(f));
            fd.callPanel.userData.setDown(L.downCalls.has(f));
            fd.callPanel.userData.setIndicator(String(dispFloor));
            fd.shaftIndicator.userData.setIndicator(shaftText);
        }
        this.carIndicator.userData.setIndicator(shaftText);

        for (let f = 0; f < this.destButtons.length; f++) {
            this.destButtons[f].material = L.destinations.has(f) ? this.buttonLitMat : this.buttonDimMat;
        }
    }
}

window.Elevator = Elevator;
