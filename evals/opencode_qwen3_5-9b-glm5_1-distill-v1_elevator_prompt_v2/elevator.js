/**
 * elevator.js - 3D Elevator Simulation
 */

// ===== CONSTANTS =====
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// ===== GLOBAL STATE =====
let scene, camera, renderer, controls;
let elevatorCar;
let buildingGroup;
let people = [];
let animationSpeed = 5;
let isAnimating = false;

// ===== BUILDING CREATION =====
function createBuilding() {
    const group = new THREE.Group();

    // Floor material (transparent)
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Wall material (semi-transparent)
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Calculate floor positions (ground at y=0, roof at y=FLOOR_COUNT*FLOOR_HEIGHT)
    const groundY = 0;
    const roofY = FLOOR_COUNT * FLOOR_HEIGHT;
    const floorSpacing = FLOOR_HEIGHT / (FLOOR_COUNT - 1);

    // Create floors with shaft cutout
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = groundY + i * floorSpacing;

        // Floor plane (with shaft hole)
        const floorGeometry = new THREE.PlaneGeometry(
            BUILDING_WIDTH,
            BUILDING_DEPTH
        );
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, y - FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 + 0.1);
        group.add(floor);

        // Wall segments (skip shaft area in middle)
        const halfShaftWidth = SHAFT_WIDTH / 2;
        const wallThickness = 0.1;

        // Front wall of this floor (at positive Z end)
        const frontWallY = y - FLOOR_HEIGHT / 2 + wallThickness / 2;
        const backWallZ = -BUILDING_DEPTH / 2 + wallThickness / 2;
        
        // Left wall segment
        const leftWallX = -BUILDING_WIDTH / 2 + wallThickness / 2;
        const frontLeftWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_DEPTH, FLOOR_HEIGHT, wallThickness),
            wallMaterial
        );
        frontLeftWall.position.set(leftWallX, y - FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(frontLeftWall);

        // Right wall segment
        const rightWallX = BUILDING_WIDTH / 2 - wallThickness / 2;
        const frontRightWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_DEPTH, FLOOR_HEIGHT, wallThickness),
            wallMaterial
        );
        frontRightWall.position.set(rightWallX, y - FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(frontRightWall);

        // Back wall segment (at negative Z end)
        const backLeftWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_DEPTH, FLOOR_HEIGHT, wallThickness),
            wallMaterial
        );
        backLeftWall.position.set(leftWallX, y - FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(backLeftWall);

        const backRightWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_DEPTH, FLOOR_HEIGHT, wallThickness),
            wallMaterial
        );
        backRightWall.position.set(rightWallX, y - FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(backRightWall);
    }

    // Solid ground floor (below all floors)
    const groundMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const groundPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH),
        groundMaterial
    );
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.set(0, -FLOOR_HEIGHT / 2 + 0.01, BUILDING_DEPTH / 2 + 0.1);
    group.add(groundPlane);

    // Solid roof (above all floors)
    const roofMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const roofPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH),
        roofMaterial
    );
    roofPlane.rotation.x = -Math.PI / 2;
    roofPlane.position.set(0, roofY + FLOOR_HEIGHT / 2 - 0.01, BUILDING_DEPTH / 2 + 0.1);
    group.add(roofPlane);

    // Add shaft cutout edges (visual guide)
    const shaftColor = 0x555555;
    const shaftEdgeMaterial = new THREE.MeshBasicMaterial({
        color: shaftColor,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
    });
    
    // Draw edges of the shaft on each floor level
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = groundY + i * floorSpacing;
        const edgeHeight = 0.15;

        const leftShaftEdge = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH, edgeHeight, wallThickness),
            shaftEdgeMaterial
        );
        leftShaftEdge.position.set(-SHAFT_WIDTH / 2 - SHAFT_DEPTH / 4, y + FLOOR_HEIGHT / 2 - edgeHeight / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(leftShaftEdge);

        const rightShaftEdge = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH, edgeHeight, wallThickness),
            shaftEdgeMaterial
        );
        rightShaftEdge.position.set(SHAFT_WIDTH / 2 + SHAFT_DEPTH / 4, y + FLOOR_HEIGHT / 2 - edgeHeight / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
        group.add(rightShaftEdge);

        const frontShaftEdge = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, edgeHeight, SHAFT_DEPTH),
            shaftEdgeMaterial
        );
        frontShaftEdge.position.set(-SHAFT_WIDTH / 2 - SHAFT_DEPTH / 4, y + FLOOR_HEIGHT / 2 - edgeHeight / 2, SHAFT_DEPTH / 2);
        group.add(frontShaftEdge);

        const backShaftEdge = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, edgeHeight, SHAFT_DEPTH),
            shaftEdgeMaterial
        );
        backShaftEdge.position.set(-SHAFT_WIDTH / 2 - SHAFT_DEPTH / 4, y + FLOOR_HEIGHT / 2 - edgeHeight / 2, -SHAFT_DEPTH / 2);
        group.add(backShaftEdge);
    }

    return group;
}

// ===== ELEVATOR CREATION =====
function createElevator() {
    const car = new THREE.Group();

    // Elevator frame material (yellow, semi-transparent)
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Solid back wall material
    const backWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xeeeeee,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Transparent side walls
    const sideWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xdddddd,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Inner floor material (solid for standing)
    const innerFloorMaterial = new THREE.MeshPhongMaterial({
        color: 0xf5f5f5,
        depthWrite: false
    });

    // Door material (darker yellow, slightly more opaque than frame)
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Car dimensions
    const carWidth = 4;
    const carDepth = 3;
    const carHeight = 2.5;
    const doorWidth = 1.8; // Each door is half the opening width

    // === ELEVATOR FRAME ===

    // Back wall (solid)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, carHeight - 0.2, 0.3),
        backWallMaterial
    );
    backWall.position.y = carHeight / 2 - 0.1;
    car.add(backWall);

    // Left side wall (transparent)
    const leftSideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, carHeight - 0.2, carDepth),
        sideWallMaterial
    );
    leftSideWall.position.set(-carWidth / 2 + 0.15, carHeight / 2 - 0.1, 0);
    car.add(leftSideWall);

    // Right side wall (transparent)
    const rightSideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, carHeight - 0.2, carDepth),
        sideWallMaterial
    );
    rightSideWall.position.set(carWidth / 2 - 0.15, carHeight / 2 - 0.1, 0);
    car.add(rightSideWall);

    // Inner floor (solid)
    const innerFloor = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth - 0.6, carDepth - 0.4, 0.3),
        innerFloorMaterial
    );
    innerFloor.position.y = -carHeight / 2 + 0.15;
    car.add(innerFloor);

    // === DOORS (sliding horizontally from center outward) ===
    const doorHalfWidth = doorWidth / 2;
    const doorDepth = 0.35; // Slightly less than back wall for proper depth sorting

    // Left door - attached to left side of car frame, slides rightward to close
    const leftDoorGroup = new THREE.Group();
    const leftDoorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, carHeight - 0.25, doorDepth),
        doorMaterial
    );
    // Position at the center of the opening (right half of elevator front)
    leftDoorMesh.position.set(0, carHeight / 2 - 0.125, carDepth / 2 - 0.1);
    leftDoorGroup.add(leftDoorMesh);

    // Right door - slides leftward to close
    const rightDoorGroup = new THREE.Group();
    const rightDoorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, carHeight - 0.25, doorDepth),
        doorMaterial
    );
    // Position at the center of the opening (left half of elevator front)
    rightDoorMesh.position.set(0, carHeight / 2 - 0.125, carDepth / 2 - 0.1);
    rightDoorGroup.add(rightDoorMesh);

    // Store references on the elevator group for animation access
    car.leftDoor = leftDoorMesh;
    car.rightDoor = rightDoorMesh;

    // === ELEVATOR FRONT WALL (the frame around doors) ===
    const frontFrameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Left frame piece (around left door)
    const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(doorDepth * 1.5, carHeight - 0.25, doorDepth),
        frontFrameMaterial
    );
    leftFrame.position.set(-doorWidth / 2 - doorDepth / 2, carHeight / 2 - 0.125, 0);
    car.add(leftFrame);

    // Right frame piece (around right door)
    const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(doorDepth * 1.5, carHeight - 0.25, doorDepth),
        frontFrameMaterial
    );
    rightFrame.position.set(doorWidth / 2 + doorDepth / 2, carHeight / 2 - 0.125, 0);
    car.add(rightFrame);

    // Center column between doors
    const centerColumn = new THREE.Mesh(
        new THREE.BoxGeometry(doorDepth * 1.5, carHeight - 0.25, doorDepth),
        frontFrameMaterial
    );
    centerColumn.position.set(-doorWidth / 2 + doorDepth / 2, carHeight / 2 - 0.125, 0);
    car.add(centerColumn);

    // === POSITION AND INITIALIZE DOORS ===
    const halfCarWidth = carWidth / 2;

    // Set initial positions: doors are CLOSED (meeting in the middle)
    // Left door's right edge should be at x=0, so:
    // leftDoorMesh.position.x + leftDoorMesh.geometry.boundingSphere.radius <--- wait, let's recalculate
    
    // Actually, let me reconsider. The carWidth is 4, so halfCarWidth = 2.
    // The opening is from x=-2 to x=2.
    // Each door has width 1.8, so they each occupy from -0.9 to 0.9 when closed.
    
    // Left door center should be at x = -0.9 (so right edge is at x=0)
    leftDoorMesh.position.x = -doorWidth / 2;

    // Right door center should be at x = +0.9 (so left edge is at x=0)
    rightDoorMesh.position.x = doorWidth / 2;

    // Store initial closed positions for reference
    const CLOSED_DOOR_X_OFFSET = doorWidth / 2; // Each door extends from its center by half its width

    return {
        group: car,
        frontOffset: -carDepth / 2,
        backOffset: carDepth / 2
    };
}

// ===== SIMULATION LOGIC =====

/**
 * Selects a random person from the people array and returns them.
 * @returns {THREE.Group|null} A person object or null if no one is available.
 */
function selectPerson() {
    if (people.length === 0) return null;
    const idx = Math.floor(Math.random() * people.length);
    return people.splice(idx, 1)[0];
}

/**
 * Moves a person to the specified floor and returns a promise that resolves when done.
 */
function movePersonToFloor(person, targetFloor) {
    // Target floor Y coordinate (floor 0 is at y=0)
    const targetY = (targetFloor - 1) * FLOOR_HEIGHT;

    return new Promise((resolve) => {
        if (person.parent === elevatorCar && elevatorCar.position.y !== targetY + FLOOR_HEIGHT / 2) {
            // Elevator needs to move first, but we handle that in the main loop
            return resolve();
        }

        const isInside = person.parent === elevatorCar;

        if (isInside) {
            // Person is inside the elevator, walking forward through open doors
            let positionZ = 0; // Starting at door opening position
            const maxPositionZ = 1.5; // Distance to wait in front of elevator

            function step() {
                if (!person.parent || person.parent !== elevatorCar) {
                    resolve();
                    return;
                }

                positionZ += PERSON_MOVE_SPEED * (1 / animationSpeed);
                person.position.z = Math.min(positionZ, maxPositionZ);

                // Check if fully exited
                if (positionZ >= maxPositionZ - 0.01) {
                    resolve();
                    return;
                }

                requestAnimationFrame(step);
            }
            step();
        } else {
            // Person is outside, walking forward into elevator
            let positionZ = 2; // Starting at waiting area in front of doors
            const maxPositionZ = -1.5; // Door opening position (negative Z)

            function step() {
                if (!person.parent || person.parent !== scene) {
                    resolve();
                    return;
                }

                positionZ -= PERSON_MOVE_SPEED * (1 / animationSpeed);
                person.position.z = Math.max(positionZ, maxPositionZ);

                // Check if fully entered
                if (positionZ <= maxPositionZ + 0.01) {
                    resolve();
                    return;
                }

                requestAnimationFrame(step);
            }
            step();
        }
    });
}

/**
 * Handles door opening animation.
 */
async function openDoors() {
    const car = elevatorCar.group;
    if (!car) return true;

    // Doors slide outward from center (positive X direction for left, negative for right)
    const targetOpenX = CLOSED_DOOR_X_OFFSET + 1.0; // Open beyond frame

    let leftDone = false;
    let rightDone = false;

    return new Promise((resolve) => {
        function animateLeftDoor() {
            if (!leftDone && car.leftDoor) {
                const currentX = car.leftDoor.position.x;
                const newX = currentX + (targetOpenX - currentX) * 0.15;
                car.leftDoor.position.x = newX;

                if (Math.abs(newX - targetOpenX) < 0.01) {
                    car.leftDoor.position.x = targetOpenX;
                    leftDone = true;
                    // Check right door too
                    if (rightDone) resolve();
                    else animateRightDoor();
                }
            }
        }

        function animateRightDoor() {
            if (!rightDone && car.rightDoor) {
                const currentX = car.rightDoor.position.x;
                const newX = currentX + (targetOpenX - currentX) * 0.15;
                car.rightDoor.position.x = newX;

                if (Math.abs(newX - targetOpenX) < 0.01) {
                    car.rightDoor.position.x = targetOpenX;
                    rightDone = true;
                    // Left door should already be done, resolve
                    resolve();
                }
            }
        }

        animateLeftDoor();
    });
}

/**
 * Handles door closing animation.
 */
async function closeDoors() {
    const car = elevatorCar.group;
    if (!car) return true;

    // Doors slide inward to center (negative X for left, positive for right)
    let leftDone = false;
    let rightDone = false;

    return new Promise((resolve) => {
        function animateLeftDoor() {
            if (!leftDone && car.leftDoor) {
                const currentX = car.leftDoor.position.x;
                const newX = currentX + (-CLOSED_DOOR_X_OFFSET - currentX) * 0.15;
                car.leftDoor.position.x = newX;

                if (Math.abs(newX - (-CLOSED_DOOR_X_OFFSET)) < 0.01) {
                    car.leftDoor.position.x = -CLOSED_DOOR_X_OFFSET;
                    leftDone = true;
                    if (rightDone) resolve();
                    else animateRightDoor();
                }
            }
        }

        function animateRightDoor() {
            if (!rightDone && car.rightDoor) {
                const currentX = car.rightDoor.position.x;
                const newX = currentX + (CLOSED_DOOR_X_OFFSET - currentX) * 0.15;
                car.rightDoor.position.x = newX;

                if (Math.abs(newX - CLOSED_DOOR_X_OFFSET) < 0.01) {
                    car.rightDoor.position.x = CLOSED_DOOR_X_OFFSET;
                    rightDone = true;
                    resolve();
                }
            }
        }

        animateLeftDoor();
    });
}

/**
 * Main simulation loop.
 */
function simulate() {
    // Pick a random person to move
    const personToMove = selectPerson();

    if (!personToMove) return;

    // Select a random floor for the destination (excluding current floor)
    let destFloorIdx = Math.floor(Math.random() * FLOOR_COUNT);
    do {
        destFloorIdx = Math.floor(Math.random() * FLOOR_COUNT);
    } while (destFloorIdx === 0); // Floor 0 is ground, no one goes down there

    const destFloorY = (destFloorIdx - 1) * FLOOR_HEIGHT;

    // Sequence:
    // 1. Elevator moves to pickup floor
    // 2. Doors open
    // 3. Person boards/exits
    // 4. Doors close
    // 5. Elevator moves to destination

    let step = 0;

    function nextStep() {
        if (step === 0) {
            // Step 1: Move elevator to pickup floor
            const currentY = elevatorCar.position.y - FLOOR_HEIGHT / 2;
            const targetY = destFloorY + FLOOR_HEIGHT / 2;
            const deltaY = targetY - currentY;

            if (Math.abs(deltaY) < ELEVATOR_SPEED * (1 / animationSpeed)) {
                elevatorCar.position.y = targetY;
                step = 1;
            } else {
                elevatorCar.position.y += Math.sign(deltaY) * ELEVATOR_SPEED * (1 / animationSpeed);
            }
        }

        if (step === 1) {
            // Step 2: Open doors
            openDoors().then(() => {
                step = 2;
                nextStep();
            });
        }

        if (step === 2) {
            // Step 3: Person walks through door and boards/exits
            movePersonToFloor(personToMove, destFloorIdx).then(() => {
                personToMove.position.z = -1.5; // Fully at door position

                // Re-parent the person based on location
                if (personToMove.parent === scene) {
                    elevatorCar.attach(personToMove);
                }

                step = 3;
                nextStep();
            });
        }

        if (step === 3) {
            // Step 4: Close doors
            closeDoors().then(() => {
                step = 4;
                nextStep();
            });
        }

        if (step === 4) {
            // Step 5: Move elevator to destination
            const currentY = elevatorCar.position.y - FLOOR_HEIGHT / 2;
            const targetY = destFloorY + FLOOR_HEIGHT / 2;
            const deltaY = targetY - currentY;

            if (Math.abs(deltaY) < ELEVATOR_SPEED * (1 / animationSpeed)) {
                elevatorCar.position.y = targetY;
                // Next cycle, select a new person
                step = 0;
                nextStep();
            } else {
                elevatorCar.position.y += Math.sign(deltaY) * ELEVATOR_SPEED * (1 / animationSpeed);
            }
        }
    }

    nextStep();
}

/**
 * Animation loop.
 */
function animate() {
    requestAnimationFrame(animate);

    // Update speed slider
    const sliderValue = parseInt(document.getElementById('speedSlider').value) || 5;
    animationSpeed = Math.max(1, sliderValue);
    document.getElementById('speedValue').textContent = 'x' + animationSpeed;

    renderer.render(scene, camera);
}

/**
 * Initialization - called when page loads.
 */
function init() {
    // Setup scene
    scene = new THREE.Scene();
    scene.background = null; // Transparent background

    // Camera setup
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, (FLOOR_COUNT - 1) * FLOOR_HEIGHT / 2, 0);

    // WebGL renderer with transparency enabled
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Create building
    buildingGroup = createBuilding();
    scene.add(buildingGroup);

    // Elevator starts at ground level (floor 1)
    elevatorCar = createElevator().group;
    elevatorCar.position.y = FLOOR_HEIGHT / 2; // Ground floor is at y=0, so half height centers it
    buildingGroup.add(elevatorCar);

    // Create some initial people waiting in front of the elevator
    for (let i = 0; i < 3; i++) {
        const person = createPerson();
        // Position in front of elevator at ground level
        person.position.set(-5, 0.6, 6);
        scene.add(person);
        people.push(person);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start animation loop and simulation
    animate();
    simulate();
}

// Auto-start on page load (H3 requirement)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}