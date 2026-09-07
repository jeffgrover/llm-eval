/* elevator.js - Three.js elevator car, doors, indicators and an adapter
   around the pure ElevatorLogic scheduler. Classic browser script. */

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        const LogicCtor = window.ElevatorLogic || globalThis.ElevatorLogic;
        this.logic = new LogicCtor({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
            speed: 3.0,
            doorTime: 0.9,
            minDoorOpen: 2.0,
            spotPositions: [
                { x: -0.62, z: -0.6 },
                { x: 0.62, z: -0.6 },
                { x: -0.62, z: 0.5 },
                { x: 0.62, z: 0.5 }
            ]
        });

        this.carWidth = 2.8;
        this.carDepth = 2.8;
        this.carHeight = 2.6;
        this.buttons = [];
        this._lastButtonState = [];

        this.car = new THREE.Group();
        this.carGroup = this.car;
        this._buildCar();
        scene.add(this.car);
        this.car.position.y = 0;

        this.tick(0);
    }

    _buildCar() {
        const w = this.carWidth;
        const d = this.carDepth;
        const h = this.carHeight;
        const halfW = w / 2;
        const halfD = d / 2;

        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xf2c23b,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const solidMatYellow = new THREE.MeshLambertMaterial({ color: 0xe0b02a });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xf7d76b,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.buttonOff = new THREE.MeshBasicMaterial({ color: 0x553f10 });
        this.buttonOn = new THREE.MeshBasicMaterial({ color: 0xffe066 });

        const addPart = (geo, mat, x, y, z) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 1;
            this.car.add(mesh);
            return mesh;
        };

        // floor + ceiling + walls
        addPart(new THREE.BoxGeometry(w, 0.08, d), solidMatYellow, 0, -0.04, 0);
        addPart(new THREE.BoxGeometry(w, 0.08, d), frameMat, 0, h + 0.04, 0);
        addPart(new THREE.BoxGeometry(w, h, 0.08), solidMatYellow, 0, h / 2, -halfD + 0.04);
        addPart(new THREE.BoxGeometry(0.08, h, d), frameMat, -halfW + 0.04, h / 2, 0);
        addPart(new THREE.BoxGeometry(0.08, h, d), frameMat, halfW - 0.04, h / 2, 0);

        // sliding doors on the +Z face
        const doorGeo = new THREE.BoxGeometry(w / 2, h - 0.1, 0.06);
        this.leftDoor = addPart(doorGeo, doorMat, -w / 4, (h - 0.1) / 2, halfD - 0.06);
        this.rightDoor = addPart(doorGeo, doorMat, w / 4, (h - 0.1) / 2, halfD - 0.06);

        // destination panel on the back-right wall
        const panel = addPart(
            new THREE.BoxGeometry(0.34, 1.25, 0.05),
            new THREE.MeshLambertMaterial({ color: 0x3a3f47 }),
            0.86,
            1.35,
            -halfD + 0.1
        );
        panel.name = "carPanel";

        const buttonGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10);
        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const button = new THREE.Mesh(buttonGeo, this.buttonOff);
            button.rotation.x = Math.PI / 2;
            button.position.set(0.86, 1.95 - f * 0.15, -halfD + 0.14);
            button.renderOrder = 1;
            this.car.add(button);
            this.buttons.push(button);
            this._lastButtonState.push(false);
        }

        // in-car floor indicator above the doors, facing back into the cabin
        this.inCarTex = makeTextTexture(256);
        updateTextTexture(this.inCarTex, "0");
        const indicator = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.inCarTex })
        );
        indicator.position.set(0, h - 0.32, halfD - 0.12);
        indicator.rotation.y = Math.PI;
        indicator.renderOrder = 1;
        this.car.add(indicator);
        this.inCarIndicator = indicator;

        this.car.traverse((child) => {
            child.renderOrder = 1;
        });
    }

    /* ---------------- delegated logic API ---------------- */

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
        return this.logic.completeBoard(person);
    }

    cancelBoarding(person) {
        return this.logic.cancelBoarding(person);
    }

    registerDisembark(person) {
        this.logic.registerDisembark(person);
    }

    completeDisembark(person) {
        this.logic.completeDisembark(person);
    }

    reset() {
        this.logic.reset();
        this.car.position.y = 0;
        this.leftDoor.position.x = -this.carWidth / 4;
        this.rightDoor.position.x = this.carWidth / 4;
    }

    /* ---------------- mirrors for the HUD ---------------- */

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

    get doorPos() {
        return this.logic.doorPos;
    }

    /* ---------------- per-frame update ---------------- */

    tick(dt) {
        this.logic.tick(dt);

        this.car.position.y = this.logic.carY;

        const slide = this.logic.doorPos * (this.carWidth / 2 - 0.1);
        this.leftDoor.position.x = -this.carWidth / 4 - slide;
        this.rightDoor.position.x = this.carWidth / 4 + slide;

        const label = this.logic.floorLabel();
        updateTextTexture(this.inCarTex, label);

        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const floor = this.world.floors[f];
            if (!floor) continue;
            if (floor.callPanel) {
                floor.callPanel.userData.setUp(this.logic.upCalls.has(f));
                floor.callPanel.userData.setDown(this.logic.downCalls.has(f));
                floor.callPanel.userData.setIndicator(label);
            }
            if (floor.shaftIndicator) {
                floor.shaftIndicator.userData.setIndicator(label);
            }
            const lit = this.logic.destinations.has(f);
            if (this.buttons[f] && this._lastButtonState[f] !== lit) {
                this.buttons[f].material = lit ? this.buttonOn : this.buttonOff;
                this._lastButtonState[f] = lit;
            }
        }
    }
}

window.Elevator = Elevator;
