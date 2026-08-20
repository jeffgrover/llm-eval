class Elevator {
    constructor(scene, worldRef) {
        this.scene = scene;
        this.world = worldRef;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });
        this.carWidth = 2.7;
        this.carDepth = 2.7;
        this.carHeight = 2.6;
        this.destButtons = [];
        this._buildCar();
        scene.add(this.car);
        this._syncVisuals();
    }

    _buildCar() {
        const car = new THREE.Group();
        this.car = car;
        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xe6c020 });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xddcc55,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const w = this.carWidth;
        const d = this.carDepth;
        const h = this.carHeight;
        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), frameMat);
        floorMesh.position.y = 0.04;
        const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), frameMat);
        ceil.position.y = h;
        const leftW = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d), frameMat);
        leftW.position.set(-w * 0.5, h * 0.5, 0);
        const rightW = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, d), frameMat);
        rightW.position.set(w * 0.5, h * 0.5, 0);
        const backW = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), backMat);
        backW.position.set(0, h * 0.5, -d * 0.5);
        car.add(floorMesh);
        car.add(ceil);
        car.add(leftW);
        car.add(rightW);
        car.add(backW);

        const doorW = w * 0.5;
        this.leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, h * 0.92, 0.06), doorMat);
        this.rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, h * 0.92, 0.06), doorMat);
        this.leftDoor.position.set(-doorW * 0.5, h * 0.46, d * 0.5);
        this.rightDoor.position.set(doorW * 0.5, h * 0.46, d * 0.5);
        this._leftDoorClosedX = this.leftDoor.position.x;
        this._rightDoorClosedX = this.rightDoor.position.x;
        this._doorSlide = doorW - 0.08;
        car.add(this.leftDoor);
        car.add(this.rightDoor);

        const panel = new THREE.Group();
        panel.position.set(w * 0.38, 1.35, -d * 0.5 + 0.08);
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 1.5, 0.04),
            new THREE.MeshLambertMaterial({ color: 0x333340 })
        );
        panel.add(plate);
        for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
            const btn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10),
                new THREE.MeshLambertMaterial({ color: 0x886622, emissive: 0x000000 })
            );
            btn.rotation.x = Math.PI * 0.5;
            btn.position.set(0, 0.55 - i * 0.22, 0.03);
            btn.userData.floor = i;
            panel.add(btn);
            this.destButtons.push(btn);
        }
        car.add(panel);

        this.interiorTex = makeIndicatorTexture(256);
        updateTextTexture(this.interiorTex, "0");
        this.interiorIndicator = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.interiorTex })
        );
        this.interiorIndicator.position.set(0, 2.25, d * 0.5 - 0.08);
        this.interiorIndicator.rotation.y = Math.PI;
        car.add(this.interiorIndicator);

        car.traverse(function (child) {
            child.renderOrder = 1;
        });
        car.renderOrder = 1;
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
    get y() { return this.logic.y; }

    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }

    reserveBoardingSpot(person) {
        const spot = this.logic.reserveBoardingSpot(person);
        if (!spot) return null;
        return {
            index: spot.index,
            x: spot.x,
            y: spot.y,
            z: spot.z,
            local: new THREE.Vector3(spot.x, spot.y, spot.z)
        };
    }

    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }

    reset() {
        this.logic.reset();
        this._syncVisuals();
    }

    tick(dt) {
        this.logic.tick(dt);
        this._syncVisuals();
    }

    _indicatorText() {
        const arrow = this.direction > 0 ? "^" : (this.direction < 0 ? "v" : "");
        return String(this.currentFloor) + arrow;
    }

    _syncVisuals() {
        this.car.position.set(0, this.logic.y, 0);
        const open = this.logic.doorOpenAmount;
        this.leftDoor.position.x = this._leftDoorClosedX - open * this._doorSlide;
        this.rightDoor.position.x = this._rightDoorClosedX + open * this._doorSlide;

        const text = this._indicatorText();
        updateTextTexture(this.interiorTex, text);
        const floors = this.world.floors;
        for (let i = 0; i < floors.length; i++) {
            const fl = floors[i];
            if (fl.callPanel && fl.callPanel.userData) {
                fl.callPanel.userData.setUp(this.upCalls.has(i));
                fl.callPanel.userData.setDown(this.downCalls.has(i));
                fl.callPanel.userData.setIndicator(text);
            }
            if (fl.shaftIndicator && fl.shaftIndicator.userData.setIndicator) {
                fl.shaftIndicator.userData.setIndicator(text);
            }
        }
        for (let b = 0; b < this.destButtons.length; b++) {
            const on = this.destinations.has(b);
            this.destButtons[b].material.emissive.setHex(on ? 0xffaa22 : 0x000000);
            this.destButtons[b].material.color.setHex(on ? 0xffcc44 : 0x886622);
        }
    }
}

window.Elevator = Elevator;
