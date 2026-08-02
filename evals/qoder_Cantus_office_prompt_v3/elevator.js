// elevator.js - Three.js elevator car, doors, indicators; adapter around ElevatorLogic.
// Classic script; exposes window.Elevator.

var ELEV_CAR_W = 2.8;
var ELEV_CAR_D = 2.8;
var ELEV_CAR_H = 3.0;

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        var frameMat = new THREE.MeshLambertMaterial({
            color: 0xddcc33, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide
        });
        var backMat = new THREE.MeshLambertMaterial({ color: 0xbba922 });
        var doorMat = new THREE.MeshLambertMaterial({
            color: 0xeedd44, transparent: true, opacity: 0.7,
            depthWrite: false, side: THREE.DoubleSide
        });

        var car = new THREE.Group();
        this.carGroup = car;

        function carBox(w, h, d, mat, x, y, z) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.renderOrder = 1;
            return m;
        }

        car.add(carBox(ELEV_CAR_W, 0.1, ELEV_CAR_D, frameMat, 0, 0.05, 0));            // floor
        car.add(carBox(ELEV_CAR_W, 0.08, ELEV_CAR_D, frameMat, 0, ELEV_CAR_H, 0));      // ceiling
        car.add(carBox(0.08, ELEV_CAR_H, ELEV_CAR_D, frameMat, -ELEV_CAR_W / 2, ELEV_CAR_H / 2, 0)); // left
        car.add(carBox(0.08, ELEV_CAR_H, ELEV_CAR_D, frameMat, ELEV_CAR_W / 2, ELEV_CAR_H / 2, 0));  // right
        var backWall = carBox(ELEV_CAR_W, ELEV_CAR_H, 0.1, backMat, 0, ELEV_CAR_H / 2, -ELEV_CAR_D / 2);
        car.add(backWall);

        // sliding doors on the +Z face
        var doorW = ELEV_CAR_W / 2;
        this.doorLeft = carBox(doorW, ELEV_CAR_H - 0.2, 0.06, doorMat, -doorW / 2, (ELEV_CAR_H - 0.2) / 2 + 0.1, ELEV_CAR_D / 2);
        this.doorRight = carBox(doorW, ELEV_CAR_H - 0.2, 0.06, doorMat, doorW / 2, (ELEV_CAR_H - 0.2) / 2 + 0.1, ELEV_CAR_D / 2);
        car.add(this.doorLeft);
        car.add(this.doorRight);
        this._doorSlide = ELEV_CAR_W / 2 - 0.15;

        // destination panel on the back-right wall
        var destPanel = new THREE.Group();
        destPanel.position.set(ELEV_CAR_W / 2 - 0.12, 1.5, -0.5);
        var panelPlate = carBox(0.05, 1.3, 0.4, new THREE.MeshLambertMaterial({ color: 0x444450 }), 0, 0, 0);
        destPanel.add(panelPlate);
        this.destButtons = [];
        this._btnOff = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this._btnOn = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
        for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
            var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), this._btnOff);
            btn.rotation.z = Math.PI / 2;
            btn.position.set(-0.05, -0.5 + f * 0.2, 0);
            btn.renderOrder = 1;
            destPanel.add(btn);
            this.destButtons.push(btn);
        }
        car.add(destPanel);

        // in-car floor indicator above the doors, facing back into the car
        this._carDisplay = makeTextDisplay(256);
        var carInd = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.6),
            new THREE.MeshBasicMaterial({ map: this._carDisplay.texture })
        );
        carInd.position.set(0, ELEV_CAR_H - 0.5, ELEV_CAR_D / 2 - 0.12);
        carInd.rotation.y = Math.PI;
        carInd.renderOrder = 1;
        car.add(carInd);

        car.renderOrder = 1;
        car.position.set(0, 0, 0);
        scene.add(car);
    }

    // ---- delegated API ----
    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) {
        this.logic.pressDestination(floor);
    }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    cancelBoarding(person) { this.logic.cancelBoarding(person); }
    completeBoard(person) { this.logic.completeBoard(person); }
    registerDisembark(person) { this.logic.registerDisembark(person); }
    completeDisembark(person) { this.logic.completeDisembark(person); }
    reset() {
        this.logic.reset();
        this.carGroup.position.y = 0;
        this._applyDoors();
    }

    // ---- mirrored state ----
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
    get doorProgress() { return this.logic.doorProgress; }

    spotWorldPosition(spot) {
        return new THREE.Vector3(spot.x, this.logic.y, spot.z);
    }

    _applyDoors() {
        var open = this.logic.doorProgress * this._doorSlide;
        var doorW = ELEV_CAR_W / 2;
        this.doorLeft.position.x = -doorW / 2 - open;
        this.doorRight.position.x = doorW / 2 + open;
    }

    tick(dt) {
        this.logic.tick(dt);
        this.carGroup.position.y = this.logic.y;
        this._applyDoors();

        var lg = this.logic;
        var dirChar = lg.direction > 0 ? "^" : (lg.direction < 0 ? "v" : "-");
        var indText = String(lg.currentFloor) + dirChar;
        this._carDisplay.draw(indText);

        for (var f = 0; f < WORLD.FLOOR_COUNT; f++) {
            this.destButtons[f].material = lg.destinations.has(f) ? this._btnOn : this._btnOff;
            var floorData = this.world.floors[f];
            if (floorData && floorData.callPanel) {
                floorData.callPanel.userData.setUp(lg.upCalls.has(f));
                floorData.callPanel.userData.setDown(lg.downCalls.has(f));
                floorData.callPanel.userData.setIndicator(String(lg.currentFloor));
            }
            if (floorData && floorData.shaftIndicator) {
                floorData.shaftIndicator.userData.setIndicator(indText);
            }
        }
    }
}

window.Elevator = Elevator;
