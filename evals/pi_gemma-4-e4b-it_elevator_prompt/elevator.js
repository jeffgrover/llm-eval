/**
 * @file elevator.js
 * Main simulation logic, building creation, animations, and state management.
 */

// --- Configuration Constants (Requirement 11) ---
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 4;
const ELEVATOR_SPEED = 0.5; // Units per second
const PERSON_MOVE_SPEED = 1.5; // Units per second

// --- Global State Variables ---
let scene, camera, renderer, controls;
let buildingGroup, elevatorCar, floorMeshes = [];
let peopleInstances = {}; // Map of person ID to THREE.Group instance
let simulationState = {
    isRunning: false,
    currentFloorIndex: 1, // Start on Floor 1 (index 0 is ground/base)
    targetFloorIndex: 3,  // Target floor for initial test run
    elevatorPosition: new THREE.Vector3(0, 0, 0),
    isMoving: false,
    doorState: 'closed', // 'open' or 'closed'
    boardingQueue: [],   // People waiting to board at current floor
    exitingPeople: [],   // People currently exiting/waiting outside
};

let animationSpeedMultiplier = 5; // Default speed from slider
let lastTime = 0;

// --- Material Definitions (Requirement 12) ---
const MAT_FLOOR = new THREE.MeshPhongMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
const MAT_WALL = new THREE.MeshPhongMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
const MAT_ELEVATOR_FRAME = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const MAT_DOOR = new THREE.MeshPhongMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

// --- Helper Functions ---

/**
 * Creates a single floor plane geometry and material setup.
 * @param {number} yPosition The Y coordinate for the center of the floor.
 * @returns {THREE.Mesh} The floor mesh.
 */
function createFloor(yPosition) {
    const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const floor = new THREE.Mesh(floorGeometry, MAT_FLOOR);
    floor.position.set(0, yPosition, 0);
    return floor;
}

/**
 * Creates the vertical walls for one level of the building.
 * @param {number} yPosition The Y coordinate for the center of the floor/level.
 * @returns {THREE.Group} A group containing all wall segments for that level.
 */
function createWalls(yPosition) {
    const walls = new THREE.Group();

    // Outer Walls (simplified box structure around the shaft area)
    const outerWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 10, BUILDING_DEPTH); // Height is arbitrary for visual effect
    const outerWall = new THREE.Mesh(outerWallGeometry, MAT_WALL);
    // Position walls to frame the central shaft cutout area
    outerWall.position.set(0, yPosition + 5, 0); // Place it high enough to span floors
    walls.add(outerWall);

    // Inner Shaft Walls (to define the elevator space)
    const innerShaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 10, SHAFT_DEPTH);
    const shaftWall = new THREE.Mesh(innerShaftGeometry, MAT_WALL);
    shaftWall.position.set(0, yPosition + 5, 0); // Positioned centrally
    walls.add(shaftWall);

    return walls;
}


/**
 * Creates the elevator car geometry and its doors.
 * @returns {THREE.Group} The complete elevator object.
 */
function createElevator() {
    const elevator = new THREE.Group();
    // Elevator Car Body (Yellow Frame)
    const carGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 1, FLOOR_COUNT * 2 + 1, SHAFT_DEPTH - 1); // Height spans all floors + buffer
    const carBody = new THREE.Mesh(carGeometry, MAT_ELEVATOR_FRAME);
    carBody.position.y = (FLOOR_COUNT * 2) / 2; // Center vertically in the shaft area
    elevator.add(carBody);

    // Doors (Two sliding halves)
    const doorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_COUNT * 2 + 1, SHAFT_DEPTH - 1);
    const leftDoor = new THREE.Mesh(doorGeometry, MAT_DOOR);
    leftDoor.position.set(-(SHAFT_WIDTH / 2) + 0.1, 0, 0); // Positioned on the X-axis relative to car center
    elevator.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, MAT_DOOR);
    rightDoor.position.set((SHAFT_WIDTH / 2) - 0.1, 0, 0); // Positioned on the X-axis relative to car center
    elevator.add(rightDoor);

    // Store door references for animation control
    elevator.userData = { leftDoor: leftDoor, rightDoor: rightDoor };

    return elevator;
}


/**
 * Initializes the entire scene, camera, renderer, and geometry.
 */
function initializeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Dark background for contrast

    // Camera Setup (Requirement 9)
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(30, 30, 30); // Initial position as requested
    scene.add(camera);

    // Renderer Setup (Requirement 7)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.alpha = true; // Requirement 7
    renderer.sortObjects = true; // Requirement 7
    document.body.appendChild(renderer.domElement);

    // Controls Setup (Requirement 9)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smoother interaction
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    // --- Build Structure ---
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    // Create Floors (Y positions: -FloorHeight/2 + i * FloorHeight)
    const floorSpacing = 10; // Distance between floors center-to-center
    for (let i = 0; i < FLOOR_COUNT; i++) {
        // Y position calculation: Ground level is at y=0. Floors are spaced by 'floorSpacing'.
        const yPos = -((FLOOR_COUNT - 1 - i) * floorSpacing / 2); // Stacking them up from the bottom visually
        const floorMesh = createFloor(yPos);
        floorMeshes.push(floorMesh);
        buildingGroup.add(floorMesh);
    }

    // Create Walls (We'll place walls spanning across all floors for simplicity in this scope)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const yPos = -((FLOOR_COUNT - 1 - i) * floorSpacing / 2);
        const wallGroup = createWalls(yPos);
        buildingGroup.add(wallGroup);
    }

    // Elevator Setup (Requirement 2)
    elevatorCar = createElevator();
    scene.add(elevatorCar);
    elevatorCar.position.set(0, -((FLOOR_COUNT - 1) * floorSpacing / 2), 0); // Initial placement at the bottom level

    // Initialize People (Requirement 3 & 4)
    initializePeople();

    window.addEventListener('resize', onWindowResize, false);
}

/**
 * Initializes people instances and places them randomly on occupied floors.
 */
function initializePeople() {
    const availableFloors = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1); // Floors 1 to 6
    let occupiedFloors = [];
    let emptyFloorIndex = -1;

    // Simple logic: Occupy floors 1 through 5, leave floor 6 empty (Requirement 8)
    for(let i = 0; i < FLOOR_COUNT - 1; i++) {
        occupiedFloors.push(i + 1);
    }
    emptyFloorIndex = FLOOR_COUNT; // Floor 6 is the designated empty floor

    // Create one person for each occupied floor
    for (const floorNum of occupiedFloors) {
        const personModel = createPerson(scene);
        personModel.userData.floor = floorNum;
        personModel.name = `Person_${floorNum}`;
        peopleInstances[personModel.uuid] = { model: personModel, floor: floorNum };

        // Position person in front of the elevator doors (Positive Z) on their assigned floor level
        const yPos = -((FLOOR_COUNT - 1 - (floorNum - 1)) * 10 / 2); // Recalculate Y based on floor number mapping
        personModel.position.set(0, yPos + 1, BUILDING_DEPTH/2 - 5); // Positioned in front of doors, slightly offset from center line

        // Face the elevator (Rotate 180 degrees around Y axis)
        personModel.rotation.y = Math.PI;

        scene.add(personModel);
    }
    console.log(`Initialized ${Object.keys(peopleInstances).length} people on occupied floors.`);
}


// --- Animation & Simulation Loop ---

function updateSimulation(deltaTime) {
    if (!simulationState.isRunning || !elevatorCar) return;

    const speedFactor = animationSpeedMultiplier / 10.0; // Scale factor for movement calculations

    // 1. Elevator Movement Logic (Vertical Travel)
    if (simulationState.isMoving) {
        const currentY = elevatorCar.position.y;
        const targetFloorIndex = simulationState.targetFloorIndex;
        const startFloorIndex = simulationState.currentFloorIndex;

        // Calculate target Y position for the destination floor center
        const targetY = -((FLOOR_COUNT - 1 - (targetFloorIndex - 1)) * 10 / 2);

        if (Math.abs(currentY - targetY) > 0.1) {
            // Move towards target Y position
            elevatorCar.position.y += (targetY - currentY) * ELEVATOR_SPEED * speedFactor * deltaTime;
        } else {
            // Reached destination floor
            simulationState.isMoving = false;
            console.log(`Elevator arrived at Floor ${targetFloorIndex}. Doors opening.`);
            openDoors();
        }
    }

    // 2. Door Animation (Sliding)
    if (simulationState.doorState === 'opening') {
        animateDoors(deltaTime, speedFactor);
    } else if (simulationState.doorState === 'closing') {
        animateDoors(deltaTime, speedFactor, true); // Closing animation
    }

    // 3. Person Movement & State Changes (Boarding/Exiting)
    if (simulationState.doorState === 'open' && simulationState.boardingQueue.length > 0) {
        handleBoarding(deltaTime, speedFactor);
    } else if (simulationState.doorState === 'open' && simulationState.exitingPeople.length > 0) {
        handleExiting(deltaTime, speedFactor);
    }

    // 4. Walking Animation Update (For people currently moving/waiting)
    Object.values(peopleInstances).forEach(p => {
        const personModel = p.model;
        if (personModel && !simulationState.isMoving && simulationState.doorState === 'closed') {
            // If stationary, reset pose
            resetPersonPose(personModel);
        } else if (personModel) {
             // Apply walking animation if they are in motion or waiting to move
             animateWalking(personModel, lastTime / 1000, speedFactor);
        }
    });

    controls.update(); // Required for damping/smooth movement
}


/**
 * Handles the transition from 'open' state to boarding people.
 */
function handleBoarding(deltaTime, speedFactor) {
    if (simulationState.boardingQueue.length === 0) return;

    const personData = simulationState.boardingQueue[0];
    const personModel = personData.model;

    // Move person towards the elevator entrance (Positive Z direction relative to their starting spot)
    personModel.position.z += PERSON_MOVE_SPEED * speedFactor * deltaTime;

    // Check if person has entered the elevator area (e.g., reached a threshold near the doors)
    if (personModel.position.z > BUILDING_DEPTH/2 - 5 + 1.0) { // Threshold check
        console.log(`Person ${personData.floor} boarded.`);

        // CRITICAL: Add person as child of elevatorCar
        elevatorCar.add(personModel);
        scene.remove(personModel); // Remove from scene, now parented to elevator
        simulationState.boardingQueue.shift();
    }
}

/**
 * Handles the transition from 'open' state to exiting people.
 */
function handleExiting(deltaTime, speedFactor) {
     if (simulationState.exitingPeople.length === 0) return;

    const personData = simulationState.exitingPeople[0];
    const personModel = personData.model;

    // Move person away from the elevator entrance (Negative Z direction relative to their current spot inside)
    personModel.position.z -= PERSON_MOVE_SPEED * speedFactor * deltaTime;

    // Check if person has exited the elevator area
    if (personModel.position.z < BUILDING_DEPTH/2 - 5 - 1.0) { // Threshold check
        console.log(`Person ${personData.floor} exited.`);

        // CRITICAL: Remove from elevator, add back to scene
        elevatorCar.remove(personModel);
        scene.add(personModel);
        simulationState.exitingPeople.shift();
    }
}


/**
 * Animates the doors sliding open or closing.
 * @param {number} deltaTime Time elapsed since last frame.
 * @param {number} speedFactor Animation speed multiplier.
 * @param {boolean} isClosing If true, animate closing instead of opening.
 */
function animateDoors(deltaTime, speedFactor, isClosing = false) {
    const doorDuration = 0.3; // Requirement: brief delay (300ms)
    let progress = (Date.now() % 1000) / 1000; // Simple time-based progression for smooth animation

    if (!isClosing) {
        // Opening Animation Logic
        const openProgress = Math.min(1, (Date.now() % 3000) / 3000); // Cycle over 3 seconds to ensure it opens/closes smoothly if called repeatedly
        const doorOffset = (openProgress * 2 - 1) * (SHAFT_WIDTH / 2 - 0.1); // Moves from center (-X) to edge (+X)

        elevatorCar.userData.leftDoor.position.x = -(SHAFT_WIDTH / 2) + doorOffset;
        elevatorCar.userData.rightDoor.position.x = (SHAFT_WIDTH / 2) - doorOffset;

        if (openProgress >= 1) {
            simulationState.doorState = 'open';
        }

    } else {
        // Closing Animation Logic
        const closeProgress = Math.min(1, ((Date.now() % 3000) / 3000)); // Cycle over 3 seconds to ensure it closes/opens smoothly if called repeatedly
        const doorOffset = (closeProgress * 2 - 1) * (SHAFT_WIDTH / 2 - 0.1);

        elevatorCar.userData.leftDoor.position.x = -(SHAFT_WIDTH / 2) + doorOffset;
        elevatorCar.userData.rightDoor.position.x = (SHAFT_WIDTH / 2) - doorOffset;

        if (closeProgress >= 1) {
            simulationState.doorState = 'closed';
        }
    }
}


// --- State Transition Functions ---

function openDoors() {
    simulationState.doorState = 'opening';
    animateDoors(0, animationSpeedMultiplier); // Start opening immediately
}

function closeDoors() {
    simulationState.doorState = 'closing';
    animateDoors(0, animationSpeedMultiplier, true); // Start closing immediately
}


/**
 * Orchestrates the full cycle: Pickup -> Travel -> Dropoff.
 */
function runSimulationCycle() {
    if (simulationState.isRunning) return;

    console.log("--- Starting New Simulation Cycle ---");
    simulationState.isRunning = true;

    // 1. Setup Initial State (Pickup Floor)
    const pickupFloor = simulationState.currentFloorIndex;
    const destinationFloor = simulationState.targetFloorIndex;

    if (pickupFloor === destinationFloor) {
        console.log("Start and end floors are the same. Aborting cycle.");
        simulationState.isRunning = false;
        return;
    }

    // 2. Elevator moves to pickup floor
    simulationState.isMoving = true;
    elevatorCar.position.y = -((FLOOR_COUNT - 1 - (pickupFloor - 1)) * 10 / 2); // Set initial Y position
    console.log(`Elevator moving to Floor ${pickupFloor} for pickup.`);

    // Wait until elevator reaches the floor before opening doors... (handled in updateSimulation)
}


/**
 * Main render loop.
 */
function animate(time) {
    requestAnimationFrame(animate);

    const deltaTime = (time - lastTime) / 1000; // Delta time in seconds
    lastTime = time;

    // Update simulation state based on delta time and speed multiplier
    updateSimulation(deltaTime * animationSpeedMultiplier);

    renderer.render(scene, camera);
}


// --- Event Handlers & Initialization ---

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupControls() {
    const speedSlider = document.getElementById('speedSlider');
    const speedValueSpan = document.getElementById('speedValue');

    speedSlider.addEventListener('input', (e) => {
        animationSpeedMultiplier = parseInt(e.target.value);
        speedValueSpan.textContent = `${animationSpeedMultiplier}x`;
    });

    // Simple button to start the cycle for testing purposes
    const startButton = document.createElement('button');
    startButton.textContent = "Run Cycle (1 -> 3)";
    startButton.style.marginTop = '20px';
    document.getElementById('controls').appendChild(startButton);

    startButton.onclick = () => {
        // Reset state for a clean run if needed, then start
        simulationState.currentFloorIndex = 1;
        simulationState.targetFloorIndex = 3; // Hardcode test destination
        simulationState.boardingQueue = [];
        simulationState.exitingPeople = [];

        runSimulationCycle();
    };
}


// --- Entry Point ---
window.onload = () => {
    initializeScene();
    setupControls();
    animate(0); // Start the animation loop
};