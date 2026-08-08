// elevator.js - Three.js elevator car, doors, indicators, and adapter around
// ElevatorLogic. All scheduling decisions live in elevator_logic.js.

class Elevator {
    constructor(scene, world) {
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        this.carGroup = new THREE.Group();
        this._buildCar();
        scene.add(this.carGroup);

        // Panel/button state is pushed every tick; cache last values to avoid
        // needless material churn.
        this._lastIndicatorText = "";
        this._lastPanelText = -1;
        this._lastCallState = [];
    }

    _buildCar() {
        const g = this.carGroup;
        const frameMat = new THREE.MeshLambertMaterial({
            color: 0xe8c84a,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const doorMat = new THREE.MeshLambertMaterial({
            color: 0xf0d060,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const solidMat = new THREE.MeshLambertMaterial({ color: 0xc9a83a });

        // Floor and ceiling
        const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 3), solidMat);
        floorPlate.position.y = -0.075;
        g.add(floorPlate);
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 3), frameMat);
        ceiling.position.y = 2.66;
        g.add(ceiling);

        // Side walls (transparent) and back wall (opaque)
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 3), frameMat);
        wallL.position.set(-1.5, 1.3, 0);
        g.add(wallL);
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 3), frameMat);
        wallR.position.set(1.5, 1.3, 0);
        g.add(wallR);
        const wallBack = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.1), solidMat);
        wallBack.position.set(0, 1.3, -1.5);
        g.add(wallBack);

        // Sliding doors on the +Z face; closed they meet at x = 0
        this.doorL = new THREE.Mesh(new THREE.BoxGeometry(1.46, 2.5, 0.06), doorMat);
        this.doorL.position.set(-0.73, 1.28, 1.47);
        g.add(this.doorL);
        this.doorR = new THREE.Mesh(new THREE.BoxGeometry(1.46, 2.5, 0.06), doorMat);
        this.doorR.position.set(0.73, 1.28, 1.47);
        g.add(this.doorR);

        // Destination panel on the back-right wall, one button per floor
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.06), new THREE.MeshLambertMaterial({ color: 0x2c3038 }));
        panel.position.set(1.05, 1.45, -1.42);
        g.add(panel);
        this.buttonMats = [];
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0x513311 });
            const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), mat);
            btn.rotation.x = Math.PI / 2;
            btn.position.set(1.05, 0.9 + f * 0.22, -1.38);
            g.add(btn);
            this.buttonMats.push(mat);
        }

        // In-car floor indicator above the doors, facing the passengers
        this.carIndicator = makeDigitTexture();
        const indicator = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this.carIndicator.texture })
        );
        indicator.position.set(0, 2.35, 1.35);
        indicator.rotation.y = Math.PI;
        g.add(indicator);

        g.traverse(function (obj) {
            if (obj.isMesh) obj.renderOrder = 1;
        });
    }

    // ----- delegation to the pure logic -------------------------------------

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

    // ----- mirrored state for the HUD ----------------------------------------

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

    // ----- visual update --------------------------------------------------------

    tick(dt) {
        this.logic.tick(dt);
        const L = this.logic;

        this.carGroup.position.y = L.carY;

        const open = L.doorOpenness;
        this.doorL.position.x = -0.73 - open * 1.35;
        this.doorR.position.x = 0.73 + open * 1.35;

        const dirChar = L.direction > 0 ? "^" : (L.direction < 0 ? "v" : "");
        const shaftText = String(L.currentFloor) + dirChar;
        for (let f = 0; f < this.world.floors.length; f++) {
            const fl = this.world.floors[f];
            const callKey = (L.upCalls.has(f) ? 1 : 0) + (L.downCalls.has(f) ? 2 : 0);
            if (this._lastCallState[f] !== callKey) {
                this._lastCallState[f] = callKey;
                fl.callPanel.userData.setUp(L.upCalls.has(f));
                fl.callPanel.userData.setDown(L.downCalls.has(f));
            }
            fl.callPanel.userData.setIndicator(String(L.currentFloor));
            fl.shaftIndicator.setText(shaftText);
        }

        for (let f = 0; f < this.buttonMats.length; f++) {
            this.buttonMats[f].color.setHex(L.destinations.has(f) ? 0xffaa22 : 0x513311);
        }

        updateDigitTexture(this.carIndicator, String(L.currentFloor));
    }
}

window.Elevator = Elevator;
