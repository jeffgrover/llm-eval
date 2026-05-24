// elevator.js

// H6: Constants are top-level const declarations
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// H5: Top-level Three.js objects
let scene, camera, renderer, controls;
// H5: Other required globals
let elevatorCar;
let people = [];
let animationSpeedMultiplier = 1;

// Door state tracking
const DOOR_STATE = {
    CLOSED: 0,
    OPENING: 1,
    OPEN: 2,
    CLOSING: 3
};

let doorState = {
    left: DOOR_STATE.CLOSED,
    right: DOOR_STATE.CLOSED
};

// Simulation state
let currentFloor = 1; // Start at floor 1
let destinationFloor = 6; // Target floor
let simulationRunning = false;

// =================================================================
// BUILDING AND ENVIRONMENT SETUP
// =================================================================

function createBuilding() {
    const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xcccccc), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9999ff), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

    // Ground and Roof
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
    
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH), groundMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = (FLOOR_COUNT * FLOOR_HEIGHT) - (FLOOR_HEIGHT / 2); // Place roof at top of last floor
    scene.add(roof);

    // Floors and Walls
    for (let f = 1; f <= FLOOR_COUNT; f++) {
        const floorY = (f * FLOOR_HEIGHT) - (FLOOR_HEIGHT / 2);

        // Floor surface
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH), floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = floorY;
        scene.add(floor);

        // Walls (Simple box representation)
        const wallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5);
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Front wall
        const frontWall = wallMesh.clone();
        frontWall.position.set(0, floorY, -(BUILDING_DEPTH / 2) + 0.25);
        scene.add(frontWall);

        // Back wall
        const backWall = wallMesh.clone();
        backWall.position.set(0, floorY, (BUILDING_DEPTH / 2) - 0.25);
        scene.add(backWall);

        // Left and Right walls (need to rotate and reposition)
        const sideWallGeometry = new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH);
        const sideWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        
        // Left wall
        sideWall.position.set(-(BUILDING_WIDTH / 2) + 0.25, floorY, 0);
        sideWall.rotation.y = Math.PI / 2;
        scene.add(sideWall);
        
        // Right wall
        sideWall.position.set((BUILDING_WIDTH / 2) - 0.25, floorY, 0);
        sideWall.rotation.y = Math.PI / 2;
        scene.add(sideWall);
    }
}

// =================================================================
// ELEVATOR CAR SETUP
// =================================================================

function createElevatorCar() {
    // H5: Use exact naming convention
    const geometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, SHAFT_DEPTH);
    const material = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

    // Elevator Car Frame
    const car = new THREE.Mesh(geometry, material);
    car.position.y = 0; // Initial Y position (will be adjusted to floor level later)
    scene.add(car); // Add to scene temporarily, will be reparented later
    return car;
}

function createDoors(car) {
    // Doors Material (Darker yellow)
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const doorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_HEIGHT, 0.2);

    // Left Door
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-(SHAFT_WIDTH / 2 - 0.1), 0, 0.1); // Positioned on the side of the elevator
    car.add(leftDoor);
    
    // Right Door
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set((SHAFT_WIDTH / 2 - 0.1), 0, 0.1);
    car.add(rightDoor);
    
    // H5: Store references
    car.leftDoor = leftDoor;
    car.rightDoor = rightDoor;
}

function setupElevator() {
    // H5: Global assignment
    elevatorCar = createElevatorCar();
    createDoors(elevatorCar);
}

// =================================================================
// PEOPLE SETUP
// =================================================================

function initializePeople() {
    // Place one person on each floor, excluding the 6th floor for simplicity (or handling it as empty)
    for (let f = 1; f <= FLOOR_COUNT; f++) {
        // Create the person model
        const person = createPerson();

        // Calculate initial world position (waiting in front of the doors, Z > 0)
        // Elevator is centered on the shaft (0, y, 0). Doors are at Z=0.1.
        // People wait in front of the doors (positive Z-axis).
        const personY = (f * FLOOR_HEIGHT) - (FLOOR_HEIGHT / 2);
        
        // Position: Z=1.5 (in front of doors), X=0 (centered), Y=floor level
        person.position.set(0, personY, 1.5); 
        
        // H4/H8 check: Ensure person is in the scene at startup
        scene.add(person);

        // Initialize state (person should be waiting, not walking)
        person.userData.isWalking = false;
        
        people.push(person);
    }
}

// =================================================================
// ANIMATION LOGIC
// =================================================================

let clock = new THREE.Clock();

function animateDoors(delta) {
    const car = elevatorCar;
    const leftDoor = car.leftDoor;
    const rightDoor = car.rightDoor;
    const doorSpeed = 1.5 * animationSpeedMultiplier * delta; // Speed influenced by multiplier

    // Opening/Closing logic (Simplified for demonstration, actual implementation would be state machine driven)
    
    // When fully closed (DOOR_STATE.CLOSED) and starting opening (DOOR_STATE.OPENING)
    if (doorState.left === DOOR_STATE.OPENING) {
        const targetX = 1.5; // Retract outward
        leftDoor.position.x += doorSpeed * 10; // Increased movement speed for visibility
        if (Math.abs(leftDoor.position.x - targetX) < 0.1) {
            doorState.left = DOOR_STATE.OPEN;
            leftDoor.position.x = targetX;
        }
    }
    // Closing logic
    else if (doorState.left === DOOR_STATE.CLOSING) {
        const targetX = 0; // Meet in the middle
        leftDoor.position.x -= doorSpeed * 10;
        if (Math.abs(leftDoor.position.x - targetX) < 0.1) {
            doorState.left = DOOR_STATE.CLOSED;
            leftDoor.position.x = targetX;
        }
    }
    
    // Apply similar logic to right door
    if (doorState.right === DOOR_STATE.OPENING) {
        const targetX = -1.5; // Retract outward
        rightDoor.position.x -= doorSpeed * 10;
        if (Math.abs(rightDoor.position.x - targetX) < 0.1) {
            doorState.right = DOOR_STATE.OPEN;
            rightDoor.position.x = targetX;
        }
    }
    else if (doorState.right === DOOR_STATE.CLOSING) {
        const targetX = 0; // Meet in the middle
        rightDoor.position.x += doorSpeed * 10;
        if (Math.abs(rightDoor.position.x - targetX) < 0.1) {
            doorState.right = DOOR_STATE.CLOSED;
            rightDoor.position.x = targetX;
        }
    }
}

function updatePersonAnimation(delta) {
    // Iterate through all people
    for (let i = 0; i < people.length; i++) {
        const person = people[i];
        
        if (person.userData.isWalking) {
            // Leg swinging animation (Sine wave on X axis)
            const time = clock.getElapsedTime();
            
            // Left leg swing (opposite phase of right leg)
            person.userData.leftLeg.rotation.x = Math.sin(time * 5) * 0.5; 
            // Right leg swing
            person.userData.rightLeg.rotation.x = Math.sin(time * 5 + Math.PI) * 0.5; 
        } else {
            // Stationary position (reset legs)
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }
}


function updateSimulation(delta) {
    if (!simulationRunning) return;

    // 1. Elevator Movement
    const targetY = (destinationFloor * FLOOR_HEIGHT) - (FLOOR_HEIGHT / 2);
    
    if (elevatorCar.position.y !== targetY) {
        // Move elevator towards destination
        const currentY = elevatorCar.position.y;
        const moveStep = ELEVATOR_SPEED * delta * animationSpeedMultiplier;
        
        if (currentY < targetY) {
            elevatorCar.position.y += moveStep;
        } else if (currentY > targetY) {
            elevatorCar.position.y -= moveStep;
        }

        // Check if close enough to destination
        if (Math.abs(elevatorCar.position.y - targetY) < 0.01) {
            elevatorCar.position.y = targetY;
            // Simulation logic for arrival
            handleArrival(targetY);
        }
    } else {
        // Elevator is at destination. If doors are closed, start opening sequence.
        if (doorState.left === DOOR_STATE.CLOSED) {
            startDoorAnimation('left');
            startDoorAnimation('right');
            // Trigger boarding/exiting sequence here
            handleDoorOpen();
        }
    }

    // 2. Person Updates
    updatePersonAnimation(delta);

    // 3. Door Animation
    animateDoors(delta);
}

function handleDoorOpen() {
    // Simple sequence: Open -> Boarding -> Close
    
    // 2. Doors open (sliding animation) - Already handled by door state machine starting now
    doorState.left = DOOR_STATE.OPENING;
    doorState.right = DOOR_STATE.OPENING;

    // Wait until doors are fully open before people start walking/boarding (Requires async/chaining which we simulate by calling the next step later)
    setTimeout(() => {
        // 3. Person walks forward into elevator
        handleBoarding();
    }, 300); // 300ms delay requirement
}

function handleBoarding() {
    // Find a person near the current floor (currentFloor) and move them in.
    
    // For simplicity, let's assume the first person is at the current floor.
    const personToBoard = people.find(p => {
        const pY = p.position.y;
        return Math.abs(pY - ((currentFloor * FLOOR_HEIGHT) - (FLOOR_HEIGHT / 2))) < 0.5;
    });

    if (personToBoard) {
        console.log("Boarding person...");
        
        // Set walking state
        personToBoard.userData.isWalking = true; 
        
        // Simulate walking movement (this would involve frame-by-frame movement towards the door entrance)
        // For simplicity, we just instantly attach it, assuming the walking animation covers the short distance
        
        // H8: Reparenting using .attach() (Boarding: scene -> elevator)
        elevatorCar.attach(personToBoard);
        
        // The person now travels with the elevator.
        
        // 4. Doors close
        setTimeout(() => {
            startDoorAnimation('left', DOOR_STATE.CLOSING);
            startDoorAnimation('right', DOOR_STATE.CLOSING);
        }, 300); // 300ms delay requirement
    }
}

function handleArrival(yPosition) {
    currentFloor = Math.round((yPosition + (FLOOR_HEIGHT / 2)) / FLOOR_HEIGHT);
    destinationFloor = currentFloor;
    
    console.log("Arrived at floor: " + currentFloor);
    
    // 6. Doors open at destination
    doorState.left = DOOR_STATE.OPENING;
    doorState.right = DOOR_STATE.OPENING;

    // Wait until doors are open before people start exiting/waiting
    setTimeout(() => {
        handleExiting();
    }, 300); // 300ms delay requirement
}

function handleExiting() {
    // Find the person who just arrived (currently inside elevatorCar)
    const personToExit = Array.from(elevatorCar.children).find(child => child.userData && child.userData.isWalking !== undefined);

    if (personToExit) {
        console.log("Exiting person...");
        
        // Stop walking
        personToExit.userData.isWalking = false;

        // H8: Reparenting using .attach() (Exiting: elevator -> scene)
        // We must first ensure the person's world position is preserved.
        
        // Get world position before removing from elevatorCar
        const worldPos = new THREE.Vector3();
        personToExit.getWorldPosition(worldPos);
        
        // Remove from parent (elevatorCar)
        elevatorCar.remove(personToExit);
        
        // Add to scene while setting the restored world position
        scene.attach(personToExit); 
        personToExit.position.copy(worldPos);

        // Update their state (e.g., set new target destination)
        // For this demo, they just stop walking and wait.
        
        // 7. Doors close
        setTimeout(() => {
            startDoorAnimation('left', DOOR_STATE.CLOSING);
            startDoorAnimation('right', DOOR_STATE.CLOSING);
        }, 300);
    }
}

// Helper function to manage door state transitions
function startDoorAnimation(side, state) {
    if (side === 'left') {
        doorState.left = state;
    } else {
        doorState.right = state;
    }
}

// =================================================================
// INITIALIZATION & MAIN LOOP
// =================================================================

function init() {
    // Renderer Setup (H7: Transparency Rendering)
    renderer = new THREE.WebGLRenderer({ alpha: true }); // H7: alpha = true
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // H7: sortObjects = true
    renderer.shadowMap.enabled = true; // Good practice for lighting
    document.body.appendChild(renderer.domElement);

    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // Camera Setup (H9)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25); // H9: Specified position
    camera.lookAt(0, FLOOR_HEIGHT / 2, 0);

    // Controls Setup (H9)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth rotation
    controls.dampingFactor = 0.05;

    // Environment
    createBuilding();
    setupElevator();
    initializePeople();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(20, 30, 20);
    scene.add(directionalLight);
    
    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    const slider = document.getElementById('speed-slider');
    const speedValueSpan = document.getElementById('speed-value');
    slider.addEventListener('input', (event) => {
        animationSpeedMultiplier = parseFloat(event.target.value);
        speedValueSpan.textContent = `${animationSpeedMultiplier}x`;
    });

    // Start the simulation loop
    simulationRunning = true;
    animate();
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (simulationRunning) {
        controls.update();
        updateSimulation(delta);
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// H3: The simulation must auto-start on page load.
window.addEventListener('DOMContentLoaded', () => {
    try {
        init();
        console.log("Simulation successfully initialized and running.");
    } catch (e) {
        console.error("FATAL ERROR during simulation initialization:", e);
    }
});
// End of elevator.js
