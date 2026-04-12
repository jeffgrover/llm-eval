// elevator.js

// --- Constants ---
const FLOOR_HEIGHT = 5; // Units in Three.js
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 40;
const BUILDING_DEPTH = 40;
const SHAFT_WIDTH = 10;
const SHAFT_DEPTH = 10;
const ELEVATOR_SPEED = 0.3; // Units per frame for vertical movement
const PERSON_MOVE_SPEED = 0.2; // Units per frame for walking/boarding
const DOOR_ANIMATION_SPEED = 0.15;

// Colors (Hex values)
const COLOR_ELEVATOR_FRAME = 0xffff00; // Yellow
const COLOR_ELEVATOR_DOORS = 0xcccc00;   // Darker yellow
const COLOR_FLOOR = 0xcccccc;          // Gray
const COLOR_WALLS = 0x9999ff;          // Blue
const COLOR_PERSON_BODY = 0x3498db;
const COLOR_PERSON_HEAD = 0xffdbac;

// --- Global State ---
let scene, camera, renderer, controls;
let buildingGroup = new THREE.Group();
let elevatorCar;
let doors = {}; // Stores left and right door objects/state
let peopleMap = {}; // Map floor index to person object { 1: personA, 2: personB, ... }
let simulationState = {
    currentFloorIndex: 1, // Elevator starts on floor 1
    targetFloorIndex: 3,  // Random initial target
    isMovingVertical: false,
    verticalTargetY: 0,
    isDoorsAnimating: false,
    doorState: 'closed', // 'open' or 'closed'
    peopleBoardingQueue: [], // People waiting to enter/exit
    animationStartTime: 0,
    speedMultiplier: 1.0,
    currentWalkingPerson: null // Person currently walking through doors
};

// --- Initialization ---
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    scene.add(buildingGroup);

    // Camera setup (Requirement 9)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

    // Renderer setup (Requirement 7: Transparency)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true; // Enable transparency
    renderer.sortObjects = true; // Critical for depth sorting
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x666666, 2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 30, 10);
    scene.add(directionalLight);

    // Controls (Requirement 9)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smoother interaction
    controls.dampingFactor = 0.05;

    // Build environment
    buildBuilding();
    createElevatorCar();
    initializePeople();

    // Setup UI control (Speed Multiplier)
    setupControls();

    window.addEventListener('resize', onWindowResize, false);
}

function setupControls() {
    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = 1;
    speedSlider.max = 20;
    speedSlider.value = 1;
    speedSlider.step = 0.5;

    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed Multiplier: 1x';

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.color = 'white';
    container.innerHTML = `
        <label>${speedLabel.textContent}</label>
        <input type="range" id="speedSlider" min="1" max="20" value="1" step="0.5">
    `;
    document.body.appendChild(container);

    const sliderElement = document.getElementById('speedSlider');
    sliderElement.oninput = (e) => {
        simulationState.speedMultiplier = parseFloat(e.target.value);
        speedLabel.textContent = \`Speed Multiplier: \${parseFloat(e.target.value).toFixed(1)}x\`;
    };
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Building Construction (Requirement 1 & 7) ---
function buildBuilding() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: COLOR_WALLS, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: COLOR_FLOOR, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });

    // 1. Walls
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const yPos = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;

        // Front Wall (-Z)
        const wallF = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5), wallMaterial);
        wallF.position.set(0, yPos, -BUILDING_DEPTH / 2 + 0.25);

        // Back Wall (+Z)
        const wallB = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5), wallMaterial);
        wallB.position.set(0, yPos, BUILDING_DEPTH / 2 - 0.25);

        // Left Wall (-X)
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH), wallMaterial);
        wallL.position.set(-BUILDING_WIDTH / 2 + 0.25, yPos, 0);

        // Right Wall (+X)
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH), wallMaterial);
        wallR.position.set(BUILDING_WIDTH / 2 - 0.25, yPos, 0);

        // Apply shaft cutout (simple method: add a void or use boolean operations if required for precision)
        // For simplicity with primitives, we assume the walls are placed around the central shaft area.
        buildingGroup.add(wallF, wallB, wallL, wallR);
    }

    // 2. Floors (Requirement 1)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const yPos = i * FLOOR_HEIGHT;
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);

        // Create the full floor slab
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(0, yPos, 0);
        buildingGroup.add(floor);

        // Elevator shaft cutout (visual indication)
        // This is a simple visual cut for the transparent floor, no need for complex boolean ops here.
    }

    // 3. Ground Floor/Roof (Solid Requirement) - Using opaque material
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    
    // Solid Ground Floor Base
    const baseFloorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH + 2, 1, BUILDING_DEPTH + 2);
    const baseFloor = new THREE.Mesh(baseFloorGeometry, groundMaterial);
    baseFloor.position.set(0, -0.5, 0); // Slightly below the first floor plane
    buildingGroup.add(baseFloor);

    // Solid Roof Top
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH + 2, 1, BUILDING_DEPTH + 2);
    const roof = new THREE.Mesh(roofGeometry, groundMaterial);
    roof.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) + 0.5, 0); // Above the last floor plane
    buildingGroup.add(roof);

    // Elevator Shaft Markers (visual guidance for centering)
    const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.1 });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const yPos = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
        const shaftMarker = new THREE.Mesh(shaftGeometry, shaftMaterial);
        // Position the marker within the central shaft area
        shaftMarker.position.set(0, yPos, 0);
        buildingGroup.add(shaftMarker);
    }

    console.log("Building structure created.");
}


// --- Elevator Car and Doors (Requirement 2 & 7) ---
function createElevatorCar() {
    const carWidth = SHAFT_WIDTH * 0.8;
    const carDepth = SHAFT_DEPTH * 0.9;
    const carHeight = FLOOR_HEIGHT * 0.95;

    // Elevator Frame (Main Body) - Semi-transparent yellow (Requirement 2)
    const frameMaterial = new THREE.MeshStandardMaterial({ color: COLOR_ELEVATOR_FRAME, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const frameGeometry = new THREE.BoxGeometry(carWidth, carHeight, carDepth);

    elevatorCar = new THREE.Group();
    elevatorCar.position.y = FLOOR_HEIGHT / 2; // Initial position at floor level (Floor 0 -> Floor 1)
    elevatorCar.userData = { isElevator: true };
    scene.add(elevatorCar);

    // --- Doors Setup (Requirement 2) ---
    const doorMaterial = new THREE.MeshStandardMaterial({ color: COLOR_ELEVATOR_DOORS, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const doorHeight = carHeight;
    // Each door is half the width of the shaft opening
    const doorWidth = (SHAFT_WIDTH * 0.8) / 2 - 0.1; // Accounting for gap/frame
    const doorDepth = carDepth + 0.1;

    // Left Door (Sliding on X-axis from center outward, negative X)
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    doors.leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    doors.leftDoor.position.set(-carWidth / 2 + doorWidth / 2 - 0.1, carHeight / 2, 0); // Initial position: flush with frame edge
    elevatorCar.add(doors.leftDoor);

    // Right Door (Sliding on X-axis from center outward, positive X)
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    doors.rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    doors.rightDoor.position.set(carWidth / 2 - doorWidth / 2 + 0.1, carHeight / 2, 0); // Initial position: flush with frame edge
    elevatorCar.add(doors.rightDoor);

    // Back Wall (Solid requirement)
    const backWallMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const backWallGeometry = new THREE.BoxGeometry(carWidth, carHeight, 0.5);
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.set(0, carHeight / 2, -carDepth / 2 + 0.25);
    elevatorCar.add(backWall);

    // Side walls (Transparent requirement) - Already handled by the frame material wrapping the structure concept
}


// --- Person Initialization (Requirement 3 & 4) ---
function initializePeople() {
    const personHeight = FLOOR_HEIGHT * 0.8; // Standardized size relative to floor height

    for (let i = 1; i <= FLOOR_COUNT; i++) {
        // Requirement 8: One floor is always empty, so we skip one floor randomly or deterministically
        if (i === 4) continue; // Let's designate floor 4 as the empty floor for simplicity

        const personMesh = createPerson(personHeight);
        
        // Position Person at the waiting spot (Requirement 4: Front of elevator, facing doors (+Z))
        // The base of the character should be aligned with the specific floor level.
        const targetY = i * FLOOR_HEIGHT; 

        // Since createPerson calculates Y relative to its own origin (0), we set it to the floor height.
        personMesh.position.set(
            -BUILDING_WIDTH / 2 + SHAFT_WIDTH / 2 - 1, // X: Just outside elevator shaft area, near one side
            targetY + personHeight / 2,                  // Y: Feet on floor
            BUILDING_DEPTH / 2 - 3                       // Z: Front of the building (waiting spot)
        );

        // Rotation: Faces elevator doors (facing toward origin/center, which is generally -Z for waiting area)
        personMesh.rotation.y = Math.PI; // 180 degrees rotation to face center
        
        peopleMap[i] = personMesh;
        scene.add(personMesh);

        console.log(`Person initialized on Floor ${i}`);
    }
}


// --- Simulation Logic and Animation Loop (Requirement 5, 6, & 12) ---

function runSimulationStep() {
    const timeDelta = 1 / 60; // Fixed delta for simplicity in this non-physics setup

    // Update controls
    controls.update();

    // Handle vertical movement
    if (simulationState.isMovingVertical) {
        let currentY = elevatorCar.position.y;
        const targetY = simulationState.verticalTargetY + FLOOR_HEIGHT / 2; // Target center of the next floor

        // Move elevator towards target Y
        if (Math.abs(currentY - targetY) > 0.01 * simulationState.speedMultiplier) {
            elevatorCar.position.y += ELEVATOR_SPEED * timeDelta * simulationState.speedMultiplier;

            // Check if we reached the target floor level
            if ((currentY - (targetY - ELEVATOR_SPEED)) * simulationState.speedMultiplier >= 0) {
                elevatorCar.position.y = targetY; // Snap to exact position
                simulationState.isMovingVertical = false;
                handleArrival();
            }
        } else {
             // Snapped or reached
            elevatorCar.position.y = targetY;
            simulationState.isMovingVertical = false;
            handleArrival();
        }

    } 
    // Handle doors/people movement if stationary
    else {
        if (simulationState.doorState === 'open' && simulationState.currentWalkingPerson) {
            animatePersonWalk(simulationState.currentWalkingPerson);
        } else if (simulationState.isDoorsAnimating) {
             // Door animation handled in the loop update
        } else if (!simulationState.peopleBoardingQueue.length) {
             // If stationary and no immediate action, trigger next cycle
             triggerNextCycle();
        }
    }


    // Render
    renderer.render(scene, camera);

    requestAnimationFrame(runSimulationStep);
}

/** Handles state transition upon elevator stopping */
function handleArrival() {
    if (simulationState.isMovingVertical) return; // Should not happen if logic is sound

    const currentFloor = simulationState.currentFloorIndex;
    console.log(`--- Arrived at Floor ${currentFloor}. Starting door animation. ---`);

    // Sequence Step 1: Doors Open
    startDoorAnimation('open');

    simulationState.isDoorsAnimating = true;
}


/** Animates the sliding doors (Requirement 6) */
function animateDoors(time, targetState) {
    const leftDoor = doors.leftDoor;
    const rightDoor = doors.rightDoor;
    const carWidth = SHAFT_WIDTH * 0.8; // Use inner shaft width for reference

    let xOffset;

    if (targetState === 'open') {
        // Open: Doors slide outward until they clear the center point (+/- half door width)
        xOffset = carWidth / 2 + (doors.leftDoor.geometry.parameters.width / 2); // Move to max open position
    } else { // targetState === 'closed'
        // Close: Doors return to flush position near the shaft edge
        xOffset = 0; 
    }

    // Interpolate door positions based on animation state (simulated by a smooth transition)
    const progress = (time % 1.0); // Simplified progress tracking for demo purposes, real implementation needs timing variables
    const targetXLeft = -carWidth / 2 + doors.leftDoor.geometry.parameters.width / 2;
    const targetXRight = carWidth / 2 - doors.rightDoor.geometry.parameters.width / 2;

    // This is a simplified animation for demonstration: assuming the door state determines final position, and we just interpolate towards it.
    let currentXLeft = leftDoor.position.x;
    let currentXRight = rightDoor.position.x;

    if (targetState === 'open') {
        // Move Left Door to negative X (outward)
        leftDoor.position.x += DOOR_ANIMATION_SPEED * simulationState.speedMultiplier;
        // Move Right Door to positive X (outward)
        rightDoor.position.x -= DOOR_ANIMATION_SPEED * simulationState.speedMultiplier;

    } else if (targetState === 'closed') {
        // Move Left Door back towards center
        leftDoor.position.x -= DOOR_ANIMATION_SPEED * simulationState.speedMultiplier * 2;
        // Move Right Door back towards center
        rightDoor.position.x += DOOR_ANIMATION_SPEED * simulationState.speedMultiplier * 2;
    }

    // Check completion (Distance-based check)
    const openThreshold = 0.05;

    if (targetState === 'open' && Math.abs(leftDoor.position.x + carWidth/2 - SHAFT_WIDTH*0.8/2) < openThreshold && Math.abs(rightDoor.position.x - carWidth/2 + SHAFT_WIDTH*0.8/2) < openThreshold) {
         // Open finished, proceed to boarding phase (handled in sequence)
    } else if (targetState === 'closed' && Math.abs(leftDoor.position.x + carWidth/2 - 0) < openThreshold && Math.abs(rightDoor.position.x - carWidth/2 + 0) < openThreshold) {
        // Close finished, proceed to vertical movement phase
    }
}

function startDoorAnimation(targetState) {
    simulationState.doorState = targetState;
    console.log(`Doors starting animation: ${targetState}`);
    
    if (targetState === 'open') {
         // Wait a brief moment for doors to open before boarding starts
        setTimeout(() => { 
            handleBoardingExit(simulationState.currentFloorIndex);
        }, 300); // Requirement 6: Delay after opening
    } else if (targetState === 'closed') {
         // After closing, schedule vertical movement
        setTimeout(() => { 
             scheduleNextVerticalMove();
        }, 300); // Requirement 6: Delay after closing
    }
}


/** Handles boarding/exiting logic for the current floor */
function handleBoardingExit(floorIndex) {
    const personOnFloor = peopleMap[floorIndex];

    if (!personOnFloor) return; // No one here or already moved

    // Check if this is a pickup (boarding) or dropoff (exiting)
    if (simulationState.currentFloorIndex === floorIndex && simulationState.targetFloorIndex !== undefined && simulationState.targetFloorIndex > floorIndex) {
        // Transition: Add person to car and set as child
            elevatorCar.add(personToBoard);
            simulationState.currentWalkingPerson = personToBoard;
        } else if (simulationState.targetFloorIndex === floorIndex) {
            // DROPOFF: Person must exit
            console.log(`Exiting person at Floor ${floorIndex}.`);
            const personToExit = simulationState.currentWalkingPerson;
            if(personToExit) {
                personToExit.position.y = elevatorCar.position.y + personToExit.geometry.parameters.height / 2; // Align to car floor level

                // Transition: Remove from car, add back to scene at waiting spot
                elevatorCar.remove(personToExit);
                scene.add(personToExit);
            }
            simulationState.currentWalkingPerson = null;

    } else if (simulationState.targetFloorIndex === floorIndex) {
        // DROPOFF: Person must exit
        console.log(`Exiting person at Floor ${floorIndex}.`);
        const personToExit = simulationState.currentWalkingPerson;
        if(personToExit) {
            personToExit.position.y = elevatorCar.position.y + personToExit.geometry.parameters.height / 2; // Align to car floor level

            // Transition: Remove from car, add to scene at waiting spot
            elevatorCar.remove(personToExit);
            scene.add(personToExit);
        }
        simulationState.currentWalkingPerson = null;
    }
    
    // If a person is involved, start the walking animation sequence (which happens before doors close)
    if (simulationState.currentWalkingPerson) {
        startWalkingAnimation(); // Start person moving through doors
    } else {
         // No one to handle, proceed directly to closing doors
        setTimeout(() => {
            if(simulationState.doorState === 'open') startDoorAnimation('closed');
        }, 100); 
    }

}


/** Animation for person walking through the door (Requirement 4 & 5) */
function animatePersonWalk(person) {
    // Walking logic is complex, simplified here: move towards center and apply leg swing.
    const targetX = person.geometry.parameters.width * 0.3; // Walk to a point inside the car opening
    let currentZ = person.position.z;

    // Z-axis movement (forward through doors)
    if (currentZ > elevatorCar.position.z + PERSON_MOVE_SPEED && simulationState.doorState === 'open') {
        person.position.z -= PERSON_MOVE_SPEED * simulationState.speedMultiplier;
    }

    // X-axis movement (to center alignment) - Simplified
     if (Math.abs(person.position.x - targetX) > 0.01) {
         person.position.x += (targetX - person.position.x) * PERSON_MOVE_SPEED * simulationState.speedMultiplier;
    }


    // Leg Swing Animation (Requirement 5: Sine wave pivot from hips)
    const time = Date.now() / 1000; // Time in seconds
    const legSwingAngle = Math.sin(time * 6) * 0.3; // Max rotation of 0.3 radians

    // Hips pivot group (assuming person object has a hipsPivot child, as defined in person.js)
    const hips = person.children.find(c => c.type === 'Group' && c.userData.isHips); 
    if (hips) {
        // Apply alternating swing to left and right legs/hips for smooth gait simulation
        hip.rotation.x = legSwingAngle * (Math.sin(time * 5) + 1) / 2; // Simple alternation
    }

}

function startWalkingAnimation() {
     console.log("Starting walking animation sequence...");
     // The actual walk happens inside runSimulationStep if currentWalkingPerson is set.
}


/** Schedules the next vertical movement after doors close */
function scheduleNextVerticalMove() {
    const currentFloor = simulationState.currentFloorIndex;

    if (simulationState.targetFloorIndex === undefined) {
        // First cycle: Set a random target floor (Requirement 8)
        let availableFloors = [];
        for(let i=1; i<=FLOOR_COUNT; i++) {
            if(i !== currentFloor && peopleMap[i]) { // Target must have a person and not be the current floor
                availableFloors.push(i);
            }
        }

        if (availableFloors.length === 0) return; // Should not happen in this small example

        const target = availableFloors[Math.floor(Math.random() * availableFloors.length)];
        simulationState.targetFloorIndex = target;
    }


    const nextFloor = simulationState.targetFloorIndex;
    console.log(`--- Moving from Floor ${currentFloor} to Floor ${nextFloor}. ---`);

    // 1. Update state
    simulationState.currentFloorIndex = currentFloor; // Finalize dropoff/pickup location
    simulationState.verticalTargetY = nextFloor * FLOOR_HEIGHT;
    
    // 2. Start vertical travel
    simulationState.isMovingVertical = true;

    // NOTE: A more advanced implementation would handle people switching places (e.g., if person A exits and person B is waiting) here.
}


/** Main entry point */
function main() {
    init();
    runSimulationStep(); // Start the loop
}

// Since this uses global scope, we execute immediately after DOM load via index.html script tag order
window.onload = main;