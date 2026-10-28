// elevator.js - Three.js car + doors + indicators, as an adapter around ElevatorLogic.
// All scheduling/state decisions live in ElevatorLogic; this file only renders them.

const CAR_WIDTH = WORLD.SHAFT_WIDTH;
const CAR_DEPTH = WORLD.SHAFT_DEPTH;
const CAR_HEIGHT = 2.4;
const DOOR_HALF_W = CAR_WIDTH / 2;
const DOOR_HEIGHT = 2.15;
const DOOR_SLIDE_MAX = CAR_WIDTH / 2 - 0.15;

function elevatorMaterials() {
    return {
        frame: new THREE.MeshLambertMaterial({
            color: 0xf4c531, opacity: 0.5, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        door: new THREE.MeshLambertMaterial({
            color: 0xe8b92f, opacity: 0.7, transparent: true, depthWrite: false, side: THREE.DoubleSide
        }),
        solidBack: new THREE.MeshLambertMaterial({ color: 0xd9a520, side: THREE.DoubleSide })
    };
}

class Elevator {
    constructor(scene, world) {
        this.world = world;
        this.logic = new ElevatorLogic({
            floorCount: WORLD.FLOOR_COUNT,
            maxCapacity: 4,
            floorHeight: WORLD.FLOOR_HEIGHT
        });

        const mats = elevatorMaterials();
        this.mats = mats;

        this.carGroup = new THREE.Group();
        scene.add(this.carGroup);

        function addCarPart(mesh) {
            mesh.renderOrder = 1;
            return mesh;
        }

        // Car floor and ceiling
        const carFloor = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.08, CAR_DEPTH), mats.frame));
        carFloor.position.y = -0.04;
        this.carGroup.add(carFloor);

        const carCeiling = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.08, CAR_DEPTH), mats.frame));
        carCeiling.position.y = CAR_HEIGHT;
        this.carGroup.add(carCeiling);

        // Side walls + solid back wall
        for (const side of [-1, 1]) {
            const wall = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(0.06, CAR_HEIGHT, CAR_DEPTH), mats.frame));
            wall.position.set(side * (CAR_WIDTH / 2 - 0.03), CAR_HEIGHT / 2, 0);
            this.carGroup.add(wall);
        }

        const backWall = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, 0.06), mats.solidBack));
        backWall.position.set(0, CAR_HEIGHT / 2, -(CAR_DEPTH / 2 - 0.03));
        this.carGroup.add(backWall);

        // Two sliding doors on the +Z face
        this.leftDoor = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF_W, DOOR_HEIGHT, 0.06), mats.door));
        this.rightDoor = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF_W, DOOR_HEIGHT, 0.06), mats.door));
        this.leftDoor.position.set(-DOOR_HALF_W / 2, DOOR_HEIGHT / 2, CAR_DEPTH / 2 - 0.03);
        this.rightDoor.position.set(DOOR_HALF_W / 2, DOOR_HEIGHT / 2, CAR_DEPTH / 2 - 0.03);
        this.carGroup.add(this.leftDoor);
        this.carGroup.add(this.rightDoor);

        // Destination panel on the back-right wall with one glowing button per floor
        this.buttonPanel = new THREE.Group();
        const panelPlate = addCarPart(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.04), mats.solidBack));
        panelPlate.position.set(0, 0, 0);
        this.buttonPanel.add(panelPlate);

        this.buttons = [];
        const buttonOnMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
        const buttonOffMat = new THREE.MeshBasicMaterial({ color: 0x5a4a17 });
        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const button = addCarPart(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), buttonOffMat));
            button.rotation.x = Math.PI / 2;
            button.position.set(-0.18 + (f % 3) * 0.18, 0.45 - Math.floor(f / 3) * 0.35, 0.03);
            this.buttonPanel.add(button);
            this.buttons.push({ mesh: button, floor: f, onMat: buttonOnMat, offMat: buttonOffMat });
        }

        this.buttonPanel.position.set(1.0, 1.4, -(CAR_DEPTH / 2 - 0.06));
        this.buttonPanel.rotation.y = Math.PI;
        this.carGroup.add(this.buttonPanel);

        // In-car floor indicator above the doors, facing back at the passengers
        this.inCarDisplay = createTextDisplay(0.6);
        this.inCarDisplay.mesh.position.set(0, CAR_HEIGHT - 0.35, CAR_DEPTH / 2 - 0.08);
        this.inCarDisplay.mesh.rotation.y = Math.PI;
        this.inCarDisplay.mesh.renderOrder = 1;
        this.carGroup.add(this.inCarDisplay.mesh);

        // Mirror logic state for the HUD
        this.state = this.logic.state;
        this.direction = this.logic.direction;
        this.currentFloor = this.logic.currentFloor;
        this.targetFloor = this.logic.targetFloor;
    }

    callUp(floor) { this.logic.callUp(floor); }
    callDown(floor) { this.logic.callDown(floor); }
    pressDestination(floor) { this.logic.pressDestination(floor); }
    isAcceptingAt(floor, direction) { return this.logic.isAcceptingAt(floor, direction); }
    currentCapacityFree() { return this.logic.currentCapacityFree(); }
    reserveBoardingSpot(person) { return this.logic.reserveBoardingSpot(person); }
    completeBoard(person) { return this.logic.completeBoard(person); }
    registerDisembark(person) { return this.logic.registerDisembark(person); }
    completeDisembark(person) { return this.logic.completeDisembark(person); }
    tick(dt) {
        this.logic.tick(dt);
        this.updateVisuals();
    }
    reset() {
        this.logic.reset();
        this.updateVisuals();
    }

    // Logical interior spot -> world position (car-local spots are converted here).
    spotToWorld(spot) {
        return new THREE.Vector3(spot.x, this.carGroup.position.y + spot.y, spot.z);
    }

    doorThresholdWorld(floor, x) {
        const baseY = floor * WORLD.FLOOR_HEIGHT;
        return new THREE.Vector3(x, baseY, CAR_DEPTH / 2 - 0.15);
    }

    updateVisuals() {
        this.carGroup.position.y = this.logic.carPos * WORLD.FLOOR_HEIGHT;

        const openFraction = this.logic.doorOpenFraction();
        const slide = DOOR_SLIDE_MAX * openFraction;
        this.leftDoor.position.x = -DOOR_HALF_W / 2 - slide;
        this.rightDoor.position.x = DOOR_HALF_W / 2 + slide;

        const text = this.logic.displayText();

        for (let f = 0; f < WORLD.FLOOR_COUNT; f += 1) {
            const floorInfo = this.world.floors[f];
            if (!floorInfo || !floorInfo.callPanel) continue;
            const upOn = this.logic.upCalls.has(f);
            const downOn = this.logic.downCalls.has(f);
            const panel = floorInfo.callPanel;
            if (panel.userData.upOn !== upOn) {
                panel.userData.setUp(upOn);
                panel.userData.upOn = upOn;
            }
            if (panel.userData.downOn !== downOn) {
                panel.userData.setDown(downOn);
                panel.userData.downOn = downOn;
            }
            panel.userData.setIndicator(text);
            floorInfo.shaftIndicator.setIndicator(text);
        }

        for (const button of this.buttons) {
            const on = this.logic.destinations.has(button.floor);
            button.mesh.material = on ? button.onMat : button.offMat;
        }

        this.inCarDisplay.setIndicator(text);

        // Mirrored state for the HUD
        this.state = this.logic.state;
        this.direction = this.logic.direction;
        this.currentFloor = Math.round(this.logic.carPos);
        this.targetFloor = this.logic.targetFloor;
    }
}

window.Elevator = Elevator;
