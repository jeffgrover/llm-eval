// elevator.js - Three.js elevator car, doors, indicators, adapter around ElevatorLogic.
// Classic script - no ES modules. Owns geometry only; all scheduling lives in elevator_logic.js.

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT,
        });

        this.group = new THREE.Group();
        this.group.renderOrder = 1;
        this.destButtons = [];
        this._buildCar();
        this.scene.add(this.group);
    }

    _buildCar() {
        const w = Elevator.CAR_WIDTH;
        const d = Elevator.CAR_DEPTH;
        const h = Elevator.CAR_HEIGHT;
        const frameMat = new THREE.MeshLambertMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const backMat = new THREE.MeshLambertMaterial({ color: 0xd1a73a });

        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), frameMat);
        floorMesh.position.y = 0.05;
        const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), frameMat);
        ceilMesh.position.y = h;
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d), frameMat);
        leftWall.position.set(-w / 2, h / 2, 0);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d), frameMat);
        rightWall.position.set(w / 2, h / 2, 0);
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), backMat);
        backWall.position.set(0, h / 2, -d / 2);
        this.group.add(floorMesh, ceilMesh, leftWall, rightWall, backWall);

        const doorW = w / 2;
        const doorMat = new THREE.MeshLambertMaterial({ color: 0xe0b84e, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        const doorGeo = new THREE.BoxGeometry(doorW, h, 0.08);
        this.doorL = new THREE.Mesh(doorGeo, doorMat);
        this.doorL.position.set(-doorW / 2, h / 2, d / 2);
        this.doorR = new THREE.Mesh(doorGeo, doorMat);
        this.doorR.position.set(doorW / 2, h / 2, d / 2);
        this.group.add(this.doorL, this.doorR);

        const carMeshes = [floorMesh, ceilMesh, leftWall, rightWall, backWall, this.doorL, this.doorR];
        for (let i = 0; i < carMeshes.length; i += 1) carMeshes[i].renderOrder = 1;

        this._buildDestinationPanel(w, h, d);
        this._buildCarIndicator(w, h, d);
    }

    _buildDestinationPanel(w, h, d) {
        const count = WORLD.FLOOR_COUNT;
        const panelX = w / 2 - 0.18;
        const startY = 0.5;
        const spacing = (h - 1.0) / Math.max(1, count - 1);
        for (let floor = 0; floor < count; floor += 1) {
            const offMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 });
            const onMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xffaa00, emissiveIntensity: 1.1 });
            const btnGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12);
            const btn = new THREE.Mesh(btnGeo, offMat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(panelX, startY + spacing * floor, -d / 2 + 0.08);
            btn.renderOrder = 1;
            btn.userData.floor = floor;
            btn.userData.setLit = function setLit(on) {
                btn.material = on ? onMat : offMat;
            };
            this.group.add(btn);
            this.destButtons.push(btn);
        }
    }

    _buildCarIndicator(w, h, d) {
        this.carIndicator = createIndicatorPanel(0.6, 0.6);
        this.carIndicator.mesh.position.set(0, h - 0.25, d / 2 - 0.04);
        this.carIndicator.mesh.rotation.y = Math.PI;
        this.carIndicator.mesh.renderOrder = 1;
        this.group.add(this.carIndicator.mesh);
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

    reset() {
        this.logic.reset();
    }

    spotWorld(spot) {
        return new THREE.Vector3(spot.x, spot.y, spot.z).add(this.group.position);
    }

    doorThresholdWorld() {
        return new THREE.Vector3(0, this.group.position.y, WORLD.SHAFT_DEPTH / 2 - 0.15);
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

    _doorFraction() {
        const states = ElevatorLogic.STATES;
        const logic = this.logic;
        if (logic.state === states.DOOR_OPEN) return 1;
        if (logic.state === states.DOOR_OPENING) return Math.min(1, logic.doorTimer / ElevatorLogic.DOOR_MOVE_S);
        if (logic.state === states.DOOR_CLOSING) return Math.max(0, 1 - logic.doorTimer / ElevatorLogic.DOOR_MOVE_S);
        return 0;
    }

    _updateDoors() {
        const frac = this._doorFraction();
        const doorW = Elevator.CAR_WIDTH / 2;
        const slide = doorW - 0.15;
        this.doorL.position.x = -doorW / 2 - slide * frac;
        this.doorR.position.x = doorW / 2 + slide * frac;
    }

    _indicatorText() {
        const dirChar = this.logic.direction > 0 ? "^" : this.logic.direction < 0 ? "v" : "-";
        return String(this.logic.currentFloor) + dirChar;
    }

    _updateFloorDisplays() {
        const text = this._indicatorText();
        const floors = this.world.floors;
        for (let i = 0; i < floors.length; i += 1) {
            const floor = floors[i];
            if (floor.callPanel) {
                floor.callPanel.userData.setUp(this.logic.upCalls.has(floor.floorNumber));
                floor.callPanel.userData.setDown(this.logic.downCalls.has(floor.floorNumber));
                floor.callPanel.userData.setIndicator(text);
            }
            if (floor.shaftIndicator) floor.shaftIndicator.updateText(text);
        }
        if (this.carIndicator) this.carIndicator.updateText(text);
    }

    _updateDestButtons() {
        for (let i = 0; i < this.destButtons.length; i += 1) {
            const btn = this.destButtons[i];
            btn.userData.setLit(this.logic.destinations.has(btn.userData.floor));
        }
    }

    tick(dt) {
        this.logic.tick(dt);
        this.group.position.y = this.logic.currentY;
        this._updateDoors();
        this._updateFloorDisplays();
        this._updateDestButtons();
    }
}

Elevator.CAR_WIDTH = 2.6;
Elevator.CAR_DEPTH = 2.6;
Elevator.CAR_HEIGHT = 2.6;

window.Elevator = Elevator;
