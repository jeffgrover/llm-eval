// Assume WORLD and Materials are available globally or passed in from world.js context

/**
 * The visual adapter for ElevatorLogic.
 */
export class Elevator {
    /**
     * @param {THREE.Scene} scene 
     * @param {Object} worldData - Contains WORLD constants and geometry helpers
     */
    constructor(scene, worldData) {
        this.worldData = worldData;
        this.scene = scene;
        this.logic = new ElevatorLogic(
            { 
                floorCount: WORLD.FLOOR_COUNT, 
                maxCapacity: WORLD.maxCapacity, 
                floorHeight: WORLD.FLOOR_HEIGHT 
            }
        );
        
        // Car Geometry Setup
        this.carGroup = new THREE.Group();
        this.carGroup.name = "ElevatorCar";
        this.carGroup.renderOrder = 1; // Draw after building
        this.scene.add(this.carGroup);

        // Car dimensions (approximate)
        const CAR_WIDTH = 2.0;
        const CAR_DEPTH = 3.5;
        const CAR_HEIGHT = WORLD.FLOOR_HEIGHT * 0.8; 
        
        // Frame (Yellow semi-transparent, opacity 0.5)
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, opacity: 0.5, transparent: true, side: THREE.DoubleSide });
        
        // Base frame (Floor/Ceiling/Sides)
        const frameBody = createGeometry(new THREE.Vector3(CAR_WIDTH, CAR_HEIGHT, CAR_DEPTH), frameMaterial, 1);
        this.carGroup.add(frameBody);

        // Solid Back Wall (Opaque yellow)
        const backWall = createGeometry(new THREE.Vector3(CAR_WIDTH, CAR_HEIGHT, 0.2), new THREE.MeshStandardMaterial({ color: 0xffff00, opacity: 1, side: THREE.DoubleSide }), 1);
        backWall.position.set(0, CAR_HEIGHT / 2, -CAR_DEPTH / 2 + 0.1);
        this.carGroup.add(backWall);

        this.doors = this.setupDoors();
        this.destinationPanel = this.setupDestinationPanel();
        this.interiorFloorIndicator = this.setupInteriorFloorIndicator();

        // Initial position
        this.carGroup.position.set(0, 0, 0);
        this.logic.reset();
    }

    setupDoors() {
        const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00, opacity: 0.7, transparent: true, side: THREE.DoubleSide });
        const doorWidth = 1.0;
        const doorHeight = WORLD.FLOOR_HEIGHT * 0.8;
        const doorDepth = 0.2;
        
        // Door geometry (two sliding halves)
        const doorHalf = createGeometry(new THREE.Vector3(doorWidth / 2, doorHeight, doorDepth), doorMaterial, 1);
        
        // Left Door half
        const leftDoor = doorHalf.clone();
        leftDoor.position.set(-doorWidth / 2, 0, -CAR_DEPTH / 2 + 0.1);
        leftDoor.userData.isDoor = true;
        
        // Right Door half
        const rightDoor = doorHalf.clone();
        rightDoor.position.set(doorWidth / 2, 0, -CAR_DEPTH / 2 + 0.1);
        rightDoor.userData.isDoor = true;

        const doorsGroup = new THREE.Group();
        doorsGroup.add(leftDoor);
        doorsGroup.add(rightDoor);
        this.carGroup.add(doorsGroup);
        return doorsGroup;
    }
    
    setupDestinationPanel() {
        const panel = new THREE.Group();
        panel.name = "DestinationPanel";
        // Back-right wall location
        const wallPos = new THREE.Vector3(CAR_WIDTH / 2 - 0.1, 0, -CAR_DEPTH / 2 + 0.1);
        
        // Simple panel geometry
        const panelGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.1);
        const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const panelMesh = createGeometry(new THREE.Vector3(0.3, 0.3, 0.1), panelMaterial, 1);
        panelMesh.position.set(0, 0, 0);
        panel.add(panelMesh);

        // Buttons (Cylinders per floor 0 to 5)
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const button = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xaaaaaa }));
            button.position.set(0, f * WORLD.FLOOR_HEIGHT + 0.1, 0); // Position buttons vertically
            button.userData = { floor: f, isButton: true, active: false };
            panel.add(button);
        }
        
        panel.position.copy(wallPos);
        this.carGroup.add(panel);
        return panel;
    }

    setupInteriorFloorIndicator() {
        const indicatorGroup = new THREE.Group();
        indicatorGroup.name = "InteriorFloorIndicator";
        // Position above doors from inside
        const plane = createGeometry(new THREE.Vector3(0.6, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 1);
        plane.position.set(0, 0.5, -CAR_DEPTH / 2 + 0.1); // Above doors
        indicatorGroup.add(plane);
        this.carGroup.add(indicatorGroup);
        return indicatorGroup;
    }


    // --- Public Interface (Mirroring ElevatorLogic) ---

    callUp(floor) { return this.logic.callUp(floor); }
    callDown(floor) { return this.logic.callDown(floor); }
    pressDestination(floor) { return this.logic.pressDestination(floor); }
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
    reset() { this.logic.reset(); }


    /**
     * Updates visual elements based on the logic state.
     * This is where the visual adapter translates logical state into geometry updates.
     */
    updateVisuals() {
        const state = this.logic.state;
        const currentFloor = this.logic.currentFloor;
        const direction = this.logic.direction;
        
        // 1. Position Update (Y axis based on floor)
        const floorY = currentFloor * WORLD.FLOOR_HEIGHT;
        this.carGroup.position.y = floorY + WORLD.FLOOR_HEIGHT / 2; // Center car on floor plane

        // 2. Door State Update
        let doorsOpen = state === STATES.DOOR_OPEN || state === STATES.DOOR_OPENING;
        this.doors.visible = doorsOpen;
        
        // Simulate door movement based on state (Open/Closed)
        const doorPosZ = (doorsOpen ? 0 : -CAR_DEPTH/2 + 0.1);
        this.doors.children.forEach(door => {
            door.position.z = doorPosZ;
        });


        // 3. Indicator Updates
        // Floor indicator (inside car)
        const indicatorText = currentFloor === 0 ? "Lobby" : `${currentFloor}^`;
        this.interiorFloorIndicator.userData.setIndicator(indicatorText);

        // Destination panel (back-right wall)
        // Light up buttons for current/target floor
        for (let f = 0; f < WORLD.FLOOR_COUNT; f++) {
            const button = this.destinationPanel.children.find(child => child.userData.isButton && child.userData.floor === f);
            if (button) {
                // Light up if destination is set for this floor or if car is currently there
                button.material.emissive.setHex(0x00ff00);
                if (this.logic.destinations.has(f) || f === currentFloor) {
                    button.userData.active = true;
                } else {
                    button.userData.active = false;
                    button.material.emissive.setHex(0x000000);
                }
            }
        }
    }
}