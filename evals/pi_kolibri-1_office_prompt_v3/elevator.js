// elevator.js
// Three.js elevator car, doors, indicators, and adapter around ElevatorLogic

// Constants
const CAR_WIDTH = 2.5;
const CAR_DEPTH = 2.5;
const CAR_HEIGHT = 3.0;
const FLOOR_HEIGHT = 3.4;

function createWorld(scene) {
    // Not used here, just placeholder
    return { buildingGroup: new THREE.Group(), floors: [] };
}

class Elevator {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.logic = new window.ElevatorLogic({ floorCount: 6, maxCapacity: 4, floorHeight: FLOOR_HEIGHT });
        this.carGroup = new THREE.Group();
        this.carGroup.renderOrder = 1;
        scene.add(this.carGroup);
        this.initGeometry();
        this.initIndicators();
        this.currentFloor = 0;
        this.position = new THREE.Vector3(0, 0, 0);
    }

    initGeometry() {
        // Car frame
        const frameMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, depthWrite: false });
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, depthWrite: false });
        const backMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true });
        const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, depthWrite: false });
        const ceilingMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, depthWrite: false });

        // Floor
        const floorGeo = new THREE.BoxGeometry(CAR_WIDTH, 0.2, CAR_DEPTH);
        const floorMesh = new THREE.Mesh(floorGeo, floorMaterial);
        floorMesh.position.y = -CAR_HEIGHT / 2 + 0.1;
        this.carGroup.add(floorMesh);
        // Ceiling
        const ceilingGeo = new THREE.BoxGeometry(CAR_WIDTH, 0.2, CAR_DEPTH);
        const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMaterial);
        ceilingMesh.position.y = CAR_HEIGHT / 2 - 0.1;
        this.carGroup.add(ceilingMesh);
        // Side walls
        const sideWallGeo = new THREE.BoxGeometry(0.2, CAR_HEIGHT, CAR_DEPTH);
        const sideWallMesh1 = new THREE.Mesh(sideWallGeo, wallMaterial);
        sideWallMesh1.position.x = CAR_WIDTH / 2 - 0.1;
        this.carGroup.add(sideWallMesh1);
        const sideWallMesh2 = new THREE.Mesh(sideWallGeo, wallMaterial);
        sideWallMesh2.position.x = -CAR_WIDTH / 2 + 0.1;
        this.carGroup.add(sideWallMesh2);
        // Back wall
        const backWallGeo = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, 0.2);
        const backWallMesh = new THREE.Mesh(backWallGeo, backMaterial);
        backWallMesh.position.z = CAR_DEPTH / 2 - 0.1;
        this.carGroup.add(backWallMesh);
        // Front wall (open for doors)
        // We'll just leave it open; doors will be separate.

        // Doors
        const doorHeight = CAR_HEIGHT - 0.4;
        const doorWidth = CAR_WIDTH / 2 - 0.1;
        const leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.2);
        const leftDoorMesh = new THREE.Mesh(leftDoorGeo, new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true }));
        leftDoorMesh.position.x = -CAR_WIDTH / 4;
        leftDoorMesh.position.z = CAR_DEPTH / 2 - 0.1;
        leftDoorMesh.position.y = 0;
        this.carGroup.add(leftDoorMesh);
        this.leftDoor = leftDoorMesh;
        const rightDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.2);
        const rightDoorMesh = new THREE.Mesh(rightDoorGeo, new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true }));
        rightDoorMesh.position.x = CAR_WIDTH / 4;
        rightDoorMesh.position.z = CAR_DEPTH / 2 - 0.1;
        rightDoorMesh.position.y = 0;
        this.carGroup.add(rightDoorMesh);
        this.rightDoor = rightDoorMesh;

        // Destination panel (back wall)
        const panelGeo = new THREE.BoxGeometry(CAR_WIDTH - 0.4, 0.5, 0.2);
        const panelMesh = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: 0x333333, opacity: 0.8, transparent: true }));
        panelMesh.position.z = CAR_DEPTH / 2 - 0.1 - 0.11;
        panelMesh.position.y = CAR_HEIGHT / 2 - 0.25;
        this.carGroup.add(panelMesh);
        // Buttons (placeholder)
        for (let f = 0; f < 6; f++) {
            const buttonGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
            const buttonMesh = new THREE.Mesh(buttonGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
            buttonMesh.position.x = -CAR_WIDTH / 2 + 0.3 + f * (CAR_WIDTH / 6);
            buttonMesh.position.y = panelMesh.position.y + 0.2;
            buttonMesh.position.z = panelMesh.position.z + 0.1;
            this.carGroup.add(buttonMesh);
            buttonMesh.userData = { floor: f, lit: false };
        }
    }

    initIndicators() {
        // Floor indicator above doors
        const indicatorGeo = new THREE.PlaneGeometry(0.6, 0.6);
        const indicatorMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.8, transparent: true });
        const indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
        indicatorMesh.position.z = CAR_DEPTH / 2 - 0.1 + 0.3;
        indicatorMesh.position.y = CAR_HEIGHT - 0.2;
        this.carGroup.add(indicatorMesh);
        this.indicator = indicatorMesh;
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
        // In visual terms, we would parent the person to the car group
        // But for simplicity, we'll just note it.
    }

    registerDisembark(person) {
        this.logic.registerDisembark(person);
    }

    completeDisembark(person) {
        this.logic.completeDisembark(person);
    }

    tick(dt) {
        this.logic.tick(dt);
        // Update position based on logic
        if (this.logic.state === "MOVING") {
            const speed = 3.4 / 60 * 120; // arbitrary
            const delta = speed * dt;
            this.position.y += this.logic.direction * delta;
            this.carGroup.position.y = this.position.y;
        }
        // Update doors, indicators, etc.
        // For now, just update indicator text
        this.updateIndicator();
    }

    updateIndicator() {
        // Simple text update: just set color
        this.indicator.material.color.set(0xffffff);
    }

    reset() {
        this.logic.reset();
        this.carGroup.position.y = 0;
        this.currentFloor = 0;
    }
}

window.createWorld = createWorld;
window.Elevator = Elevator;
window.startSimulation = null;