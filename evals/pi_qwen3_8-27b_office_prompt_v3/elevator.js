/**
 * elevator.js - Three.js elevator car + visual adapter around ElevatorLogic.
 * Owns geometry/meshes/doors/indicators only; all scheduling decisions are
 * delegated to the pure ElevatorLogic in elevator_logic.js.
 */

class Elevator {
    constructor(scene, world) {
        this.world = world || null;
        this.logic = new ElevatorLogic({
            floorCount: (world && world.floors) ? world.floors.length : 6,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        // Logical interior spots -> car-local Vector3 targets.
        this.spotVectors = [];
        for (let i = 0; i < this.logic.interiorSpots.length; i += 1) {
            const s = this.logic.interiorSpots[i];
            this.spotVectors.push(new THREE.Vector3(s.x, s.y, s.z));
        }

        this.buildCar();
        scene.add(this.car);
    }

    buildCar() {
        const car = new THREE.Group();
        car.name = "elevatorCar";

        // Car is 2.0 wide so open doors (which slide a full door-width outward)
        // stay inside the 3-wide shaft instead of poking through its walls.
        const CAR_W = 2.0;
        const CAR_D = 2.2;
        const CAR_H = 2.6;
        const STILE = 0.3;
        const DOOR_HALF = CAR_W / 2 - STILE; // width of each sliding half-door

        const frameMat = new THREE.MeshLambertMaterial({ color: 0xf2c744, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8b923, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        const solidMat = new THREE.MeshLambertMaterial({ color: 0xd9a91f }); // opaque yellow

        function part(width, height, depth, material, x, y, z) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
            mesh.position.set(x, y, z);
            mesh.renderOrder = 1;
            car.add(mesh);
            return mesh;
        }

        part(CAR_W, 0.12, CAR_D, frameMat, 0, -0.06, 0);            // floor (top at local y=0)
        part(CAR_W, 0.12, CAR_D, frameMat, 0, CAR_H + 0.06, 0);     // ceiling
        part(0.08, CAR_H, CAR_D, frameMat, -CAR_W / 2, CAR_H / 2, 0); // side wall L
        part(0.08, CAR_H, CAR_D, frameMat, CAR_W / 2, CAR_H / 2, 0);  // side wall R
        part(CAR_W, CAR_H, 0.1, solidMat, 0, CAR_H / 2, -CAR_D / 2);  // solid back wall

        // door stiles flanking the doorway on the +Z face
        part(STILE, CAR_H, 0.12, solidMat, -(CAR_W / 2) + STILE / 2, CAR_H / 2, CAR_D / 2);
        part(STILE, CAR_H, 0.12, solidMat, (CAR_W / 2) - STILE / 2, CAR_H / 2, CAR_D / 2);
        // lintel above the doorway
        part(DOOR_HALF * 2, 0.5, 0.12, solidMat, 0, CAR_H - 0.25, CAR_D / 2);

        // sliding doors: closed they meet at x=0; open each half slides out by its width
        const doorH = CAR_H - 0.6;
        this.leftDoor = part(DOOR_HALF, doorH, 0.08, doorMat, -DOOR_HALF / 2, doorH / 2, CAR_D / 2);
        this.rightDoor = part(DOOR_HALF, doorH, 0.08, doorMat, DOOR_HALF / 2, doorH / 2, CAR_D / 2);
        this.doorTravel = DOOR_HALF;

        // destination panel on the back wall (right side): one button per floor
        this.destButtons = [];
        for (let f = 0; f < this.logic.floorCount; f += 1) {
            const button = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10),
                new THREE.MeshLambertMaterial({ color: 0x4a4436, emissive: 0x000000 })
            );
            button.rotation.x = Math.PI / 2; // face +Z (into the car)
            button.position.set(0.58, 0.85 + f * 0.3, -CAR_D / 2 + 0.1);
            button.renderOrder = 1;
            car.add(button);
            this.destButtons.push(button);
        }

        // in-car floor indicator above the doorway, facing back into the car
        const carTex = makeCarIndicatorTexture();
        this.carIndicatorTex = carTex;
        const carPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: carTex }));
        carPlane.position.set(0, CAR_H - 0.75, CAR_D / 2 - 0.1);
        carPlane.rotation.y = Math.PI;
        carPlane.renderOrder = 1;
        car.add(carPlane);

        this.car = car;
    }

    // ---------------- adapter API (delegates to ElevatorLogic) ----------------

    callUp(floor) { return this.logic.callUp(floor); }
    callDown(floor) { return this.logic.callDown(floor); }
    pressDestination(floor) { return this.logic.pressDestination(floor); }
    isAcceptingAt(floor, dir) { return this.logic.isAcceptingAt(floor, dir); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    registerDisembark(person) { return this.logic.registerDisembark(person); }
    completeDisembark(person) { return this.logic.completeDisembark(person); }
    reset() { return this.logic.reset(); }

    spotWorld(index) {
        const local = this.spotVectors[index % this.spotVectors.length];
        return this.car.position.clone().add(local);
    }

    /** Door threshold (world) a boarder should aim for: X of their own lane. */
    doorThreshold(spotIndex) {
        const local = this.spotVectors[spotIndex % this.spotVectors.length];
        return new THREE.Vector3(
            this.car.position.x + local.x,
            this.car.position.y,
            this.car.position.z + WORLD.SHAFT_DEPTH / 2 + 0.15
        );
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

    tick(dt) {
        this.logic.tick(dt);
        const logic = this.logic;

        // car height follows the logical position exactly
        this.car.position.y = logic.positionY;

        // doors slide with doorProgress (0 closed .. 1 open)
        const slide = this.doorTravel * logic.doorProgress;
        this.leftDoor.position.x = -this.doorTravel / 2 - slide;
        this.rightDoor.position.x = this.doorTravel / 2 + slide;

        // call panel lamps + floor displays on every floor
        if (this.world) {
            for (let f = 0; f < this.world.floors.length; f += 1) {
                const floorInfo = this.world.floors[f];
                if (!floorInfo.callPanel || !floorInfo.callPanel.userData) continue;
                floorInfo.callPanel.userData.setUp(logic.upCalls.has(f));
                floorInfo.callPanel.userData.setDown(logic.downCalls.has(f));
                const arrow = logic.direction > 0 ? "^" : (logic.direction < 0 ? "v" : "-");
                floorInfo.callPanel.userData.setIndicator(String(logic.currentFloor) + arrow);
            }
            const activeFloor = this.world.floors[logic.currentFloor];
            if (activeFloor && activeFloor.shaftIndicator) {
                const arrow = logic.direction > 0 ? "^" : (logic.direction < 0 ? "v" : "-");
                activeFloor.shaftIndicator.userData.setText(String(logic.currentFloor) + arrow);
            }
        }

        // destination buttons light up when pressed, dim otherwise
        for (let f = 0; f < this.destButtons.length; f += 1) {
            const on = logic.destinations.has(f);
            this.destButtons[f].material.color.setHex(on ? 0xffdd55 : 0x4a4436);
            this.destButtons[f].material.emissive.setHex(on ? 0xffaa00 : 0x000000);
        }

        // in-car indicator shows the current floor
        updateTextTexture(this.carIndicatorTex, String(logic.currentFloor));
    }
}

function makeCarIndicatorTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex._lastText = null;
    updateTextTexture(tex, "0");
    return tex;
}

window.Elevator = Elevator;
