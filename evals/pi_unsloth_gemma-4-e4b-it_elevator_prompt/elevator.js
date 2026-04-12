// elevator.js

// --- CONFIGURATION CONSTANTS (Requirement 11) ---
const FLOOR_HEIGHT = 4.0; // Height of one floor level in world units
const FLOOR_COUNT = 6;    // Total number of floors (Ground + 5 above, or 6 total levels)
const BUILDING_WIDTH = 20.0;
const BUILDING_DEPTH = 30.0;
const SHAFT_WIDTH = 4.0;
const SHAFT_DEPTH = 4.0;

// Elevator dimensions (relative to shaft center)
const ELEVATOR_WIDTH = 3.5;
const ELEVATOR_DEPTH = 3.5;
const CAR_HEIGHT = FLOOR_HEIGHT - 1.0; // Car height slightly less than floor height for clearance

// Movement speeds
const ELEVATOR_SPEED = 1.5; // Units per second
const PERSON_MOVE_SPEED = 2.0; // Units per second (walking speed)

// Animation timing constants
const DOOR_OPEN_TIME = 0.3; // Seconds for door opening/closing animation
const BOARDING_DELAY = 0.3; // Delay between door open and person starting to walk in

// --- SCENE SETUP VARIABLES ---
let scene, camera, renderer, controls;
let buildingGroup, elevatorCar, groundPlane;
let floorMeshes = [];
let peopleMap = new Map(); // Maps floor index (0-5) to the person object on that floor
let emptyFloorIndex = 0;

// Elevator state management
const ELEVATOR_STATE = {
    IDLE: 'idle',
    MOVING_UP: 'moving_up',
    MOVING_DOWN: 'moving_down',
    DOORS_OPENING: 'doors_opening',
    DOORS_CLOSING: 'doors_closing',
    BOARDING: 'boarding', // Person entering
    EXITING: 'exiting'   // Person leaving
};

let currentState = ELEVATOR_STATE.IDLE;
let currentFloorIndex = 0;
let targetFloorIndex = 0;

// Animation timers and progress trackers
let animationStartTime = 0;
let doorAnimationProgress = 0; // 0 to 1 for opening/closing
let personWalkProgress = 0;    // 0 to 1 for walking in/out
let currentPersonToMove = null; // The person currently interacting with the elevator

// --- DOM ELEMENTS & CONTROLS ---
const speedSlider = document.getElementById('speedSlider');
let timeScale = 1.0;


/**
 * Initializes the Three.js scene, camera, renderer, and controls.
 */
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    // Camera setup (Requirement 9)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    // Renderer setup (Requirement 7)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true; // Requirement 7
    renderer.sortObjects = true; // Requirement 7
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 3); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(10, 50, 10);
    scene.add(directionalLight);

    // Controls (Requirement 9)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.update();

    window.addEventListener('resize', onWindowResize, false);

    // Initialize simulation components
    createBuilding();
    createElevator();
    initializePeople();

    // Event listener for speed control (Requirement 12)
    speedSlider.addEventListener('input', (event) => {
        timeScale = parseFloat(event.target.value) / 10.0; // Scale factor from 1 to 2.0
    });

    animate();
}

/**
 * Handles window resizing.
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// ==================================================
// 1. BUILDING CREATION (Requirement 1)
// ==================================================

function createBuilding() {
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    // --- Ground Plane (Solid) ---
    const groundGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 }); // Dark solid ground
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = 0;
    buildingGroup.add(groundPlane);

    // --- Floors and Walls ---
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT + (FLOOR_HEIGHT / 2) - 0.1; // Center of the floor slab
        const isGroundFloor = i === 0;

        // Floor Surface (Transparent, Opacity: 0.3)
        const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            transparent: true, 
            opacity: 0.3, 
            side: THREE.DoubleSide, // Requirement 7
            depthWrite: false      // Requirement 7
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, floorY, 0);
        floorMeshes.push(floor);
        buildingGroup.add(floor);

        // Walls (Semi-transparent, Opacity: 0.2)
        const wallMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x9999ff, 
            transparent: true, 
            opacity: 0.2, 
            side: THREE.DoubleSide, // Requirement 7
            depthWrite: false      // Requirement 7
        });

        // Front Wall (Z+)
        const wallFront = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT - 0.2, 0.5), wallMaterial);
        wallFront.position.set(0, floorY, BUILDING_DEPTH / 2 + 0.25);
        buildingGroup.add(wallFront);

        // Back Wall (Z-)
        const wallBack = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT - 0.2, 0.5), wallMaterial);
        wallBack.position.set(0, floorY, -BUILDING_DEPTH / 2 - 0.25);
        buildingGroup.add(wallBack);

        // Left Wall (X-)
        const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, FLOOR_HEIGHT - 0.2, BUILDING_DEPTH), wallMaterial);
        wallLeft.position.set(-BUILDING_WIDTH / 2 - 0.25, floorY, 0);
        buildingGroup.add(wallLeft);

        // Right Wall (X+)
        const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, FLOOR_HEIGHT - 0.2, BUILDING_DEPTH), wallMaterial);
        wallRight.position.set(BUILDING_WIDTH / 2 + 0.25, floorY, 0);
        buildingGroup.add(wallRight);

        // Elevator Shaft Cutout (Visual representation of the void)
        const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, SHAFT_DEPTH);
        const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        // Position the shaft in the center of the building volume for this floor level
        shaft.position.set(0, floorY, 0);
        buildingGroup.add(shaft);
    }

    // Roof (Solid)
    const roofGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 }); // Dark solid roof
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT - (FLOOR_HEIGHT / 2), 0);
    buildingGroup.add(roof);
}

// ==================================================
// 2. ELEVATOR CREATION (Requirement 2)
// ==================================================

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.position.set(0, FLOOR_HEIGHT / 2, 0); // Start at ground floor center
    buildingGroup.add(elevatorCar);

    // --- Elevator Car Body (Frame) ---
    const carGeometry = new THREE.BoxGeometry(ELEVATOR_WIDTH, CAR_HEIGHT, ELEVATOR_DEPTH);
    const frameMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide }); // Yellow Frame (Requirement 2)
    const carBody = new THREE.Mesh(carGeometry, frameMaterial);
    elevatorCar.add(carBody);

    // --- Doors Setup (Requirement 2) ---
    const doorThickness = 0.3;
    const doorHeight = CAR_HEIGHT - 0.1;
    const doorWidthHalf = ELEVATOR_WIDTH / 2 - doorThickness/2; // Half width of one door panel

    // Door Material (Darker yellow, more opaque)
    const doorMaterial = new THREE.MeshPhongMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

    // Left Door Panel
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidthHalf, doorHeight, doorThickness);
    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    // Initial position: flush with the front face (Z=0) and centered on X-axis for its half
    leftDoor.position.set(-doorWidthHalf - 0.1, 0, ELEVATOR_DEPTH / 2 + 0.15); // Positioned at the front plane of the car
    elevatorCar.add(leftDoor);

    // Right Door Panel
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidthHalf, doorHeight, doorThickness);
    const rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    rightDoor.position.set(doorWidthHalf + 0.1, 0, ELEVATOR_DEPTH / 2 + 0.15); // Positioned at the front plane of the car
    elevatorCar.add(rightDoor);

    // Store references for animation control (Requirement: Store door references)
    elevatorCar.userData.leftDoor = leftDoor;
    elevatorCar.userData.rightDoor = rightDoor;

    // --- Back Wall (Solid, Transparent Sides) ---
    const backWallGeometry = new THREE.BoxGeometry(ELEVATOR_WIDTH - 0.2, CAR_HEIGHT, 0.3);
    const backWallMaterial = new THREE.MeshPhongMaterial({ color: 0x555555, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    // Positioned at the rear of the car (Z = -ELEVATOR_DEPTH/2)
    backWall.position.set(0, 0, -ELEVATOR_DEPTH / 2 + 0.15);
    elevatorCar.add(backWall);

    // Side Walls (Transparent)
    const sideMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    
    // Left Side Wall
    const leftSideGeometry = new THREE.BoxGeometry(0.3, CAR_HEIGHT, ELEVATOR_DEPTH - 0.2);
    const leftSideWall = new THREE.Mesh(leftSideGeometry, sideMaterial);
    leftSideWall.position.set(-ELEVATOR_WIDTH / 2 + 0.15, 0, 0);
    elevatorCar.add(leftSideWall);

    // Right Side Wall
    const rightSideGeometry = new THREE.BoxGeometry(0.3, CAR_HEIGHT, ELEVATOR_DEPTH - 0.2);
    const rightSideWall = new THREE.Mesh(rightSideGeometry, sideMaterial);
    rightSideWall.position.set(ELEVATOR_WIDTH / 2 - 0.15, 0, 0);
    elevatorCar.add(rightSideWall);

    // Initial door state: Closed (Doors are positioned at the front face)
    currentState = ELEVATOR_STATE.IDLE;
}


// ==================================================
// 3. PEOPLE INITIALIZATION & MANAGEMENT (Requirement 3, 4, 8)
// ==================================================

function initializePeople() {
    const personFactory = window.createPerson; // Access function from person.js

    for (let i = 0; i < FLOOR_COUNT; i++) {
        // Create a person instance at the waiting spot in front of the elevator doors on each floor
        const floorY = i * FLOOR_HEIGHT + (FLOOR_HEIGHT / 2); // Center Y level for standing
        
        // Waiting position: In front of the elevator (Positive Z), facing elevator (looking towards negative Z)
        // The person model is created centered at (0, 0, 0) relative to its group. We offset it.
        const waitPosition = new THREE.Vector3(0, floorY, BUILDING_DEPTH / 2 - 5); // 5 units in front of the building edge

        // Create person model
        const personModel = personFactory.call(null, waitPosition);
        personModel.userData.floorIndex = i;
        personModel.userData.isBoarded = false;
        personModel.userData.targetFloor = -1; // Not moving yet

        // Initial placement: On the scene, waiting on their assigned floor
        scene.add(personModel);
        peopleMap.set(i, personModel);
    }

    // Set initial state for simulation logic (Requirement 8)
    emptyFloorIndex = Math.floor(Math.random() * FLOOR_COUNT);
    console.log(`Initial empty floor set to: ${emptyFloorIndex}`);
}


/**
 * Simulates the movement of a person walking into or out of the elevator.
 * @param {THREE.Group} person - The character model.
 * @param {boolean} entering - True if boarding, false if exiting.
 */
function startPersonWalk(person, entering) {
    currentPersonToMove = person;
    const isWalking = true; // Leg animation active

    // Set up walking animation loop for this specific person
    const walkLoop = (time) => {
        if (!currentPersonToMove || currentPersonToMove !== person) return;

        personFactory.call(null, null); // Re-accessing the factory to get animateWalk reference if needed, but we use global scope here.
        window.animateWalk(person, time, isWalking);

        // Update progress based on direction
        if (entering) {
            // Walking from waiting spot (Z_wait) towards elevator front (Z_elevator_front)
            const startZ = BUILDING_DEPTH / 2 - 5; // Approximate starting Z for people
            const endZ = ELEVATOR_DEPTH / 2 + 0.15; // Elevator door plane Z
            const distance = Math.abs(endZ - startZ);

            personWalkProgress += (PERSON_MOVE_SPEED * timeScale) / distance;

            if (personWalkProgress >= 1.0) {
                personWalkProgress = 1.0;
                // Animation complete: Person is inside/at door threshold
                handlePersonBoardingCompletion(entering);
            }
        } else { // Exiting
             // Walking from elevator front (Z_elevator_front) towards waiting spot (Z_wait)
            const startZ = ELEVATOR_DEPTH / 2 + 0.15;
            const endZ = BUILDING_DEPTH / 2 - 5;

            personWalkProgress += (PERSON_MOVE_SPEED * timeScale) / Math.abs(endZ - startZ);

            if (personWalkProgress >= 1.0) {
                personWalkProgress = 1.0;
                // Animation complete: Person is outside/at waiting spot
                handlePersonExitingCompletion(entering);
            }
        }
    };

    // Start the animation loop for this person's walk
    const walkInterval = setInterval(() => {
        walkLoop(performance.now() / 1000);
    }, 16); // ~60 FPS update rate

    person.userData.walkInterval = walkInterval;
}


/**
 * Handles the state transition after a person has finished walking into the elevator.
 */
function handlePersonBoardingCompletion(entering) {
    if (!currentPersonToMove || currentPersonToMove !== peopleMap.get(targetFloorIndex)) return;

    const person = currentPersonToMove;
    const floorIndex = targetFloorIndex; // The destination floor index where they are boarding/exiting from

    // 1. Update Scene Graph (Requirement: Add as child of elevator)
    elevatorCar.add(person);
    scene.remove(person);

    // 2. State Transition
    if (entering) {
        currentState = ELEVATOR_STATE.DOORS_CLOSING;
        console.log(`Person boarded at Floor ${floorIndex}. Closing doors.`);
    } else { // Exiting
        // This path should ideally not be hit if we manage state correctly, but for safety:
        currentState = ELEVATOR_STATE.IDLE; 
        currentPersonToMove = null;
    }

    // Stop walking animation
    clearInterval(person.userData.walkInterval);
    currentPersonToMove = null;
}

/**
 * Handles the state transition after a person has finished walking out of the elevator.
 */
function handlePersonExitingCompletion(entering) {
     if (!currentPersonToMove || currentPersonToMove !== peopleMap.get(currentFloorIndex)) return;

    const person = currentPersonToMove;
    const floorIndex = currentFloorIndex; // The pickup floor index where they are exiting to

    // 1. Update Scene Graph (Requirement: Add back to scene)
    elevatorCar.remove(person);
    scene.add(person);

    // 2. State Transition
    currentState = ELEVATOR_STATE.IDLE;
    console.log(`Person exited at Floor ${floorIndex}. Simulation step complete.`);

    // Reset person state for next cycle
    person.userData.isBoarded = false;
    currentFloorIndex = floorIndex; // Elevator is now at this floor
    
    // Trigger the next simulation step (e.g., find new destination)
    setTimeout(runNextSimulationStep, 500); 

    clearInterval(person.userData.walkInterval);
    currentPersonToMove = null;
}


// ==================================================
// 4. ANIMATION & MOVEMENT LOGIC (Requirement 5, 6, 12)
// ==================================================

/**
 * Updates the elevator's vertical position based on state and time.
 */
function updateElevatorPosition(deltaTime) {
    const targetY = targetFloorIndex * FLOOR_HEIGHT + (FLOOR_HEIGHT / 2);
    let currentY = elevatorCar.position.y;

    if (currentState === ELEVATOR_STATE.MOVING_UP || currentState === ELEVATOR_STATE.MOVING_DOWN) {
        const direction = currentState === ELEVATOR_STATE.MOVING_UP ? 1 : -1;
        const speed = ELEVATOR_SPEED * timeScale * direction;

        elevatorCar.position.y += speed * deltaTime;

        // Check for arrival (Distance-based completion check < 0.01)
        if ((direction === 1 && elevatorCar.position.y >= targetY - 0.01) || 
            (direction === -1 && elevatorCar.position.y <= targetY + 0.01)) {
            
            elevatorCar.position.y = targetY; // Snap to exact floor level
            currentState = ELEVATOR_STATE.IDLE;
            console.log(`Elevator arrived at Floor ${targetFloorIndex}.`);

            // Trigger door sequence based on whether we are picking up or dropping off
            if (currentPersonToMove) {
                const isDroppingOff = peopleMap.get(currentFloorIndex).userData.targetFloor === targetFloorIndex;
                currentState = isDroppingOff ? ELEVATOR_STATE.DOORS_OPENING : ELEVATOR_STATE.DOORS_OPENING; // Simplified: always open on arrival for now
            } else {
                 // If no person, just idle or move to next task
                 currentState = ELEVATOR_STATE.IDLE;
            }
        }
    }
}

/**
 * Updates the door positions based on doorAnimationProgress (0 to 1).
 */
function updateDoors(deltaTime) {
    const leftDoor = elevatorCar.userData.leftDoor;
    const rightDoor = elevatorCar.userData.rightDoor;
    const initialZ = ELEVATOR_DEPTH / 2 + 0.15; // Z position when closed (at front face)
    const openOffset = ELEVATOR_WIDTH / 2 - 0.3; // How far they slide out

    let targetXLeft, targetXRight;

    if (currentState === ELEVATOR_STATE.DOORS_OPENING || currentState === ELEVATOR_STATE.BOARDING) {
        // Doors open: Slide outwards along X-axis
        targetXLeft = -openOffset;
        targetXRight = openOffset;
    } else if (currentState === ELEVATOR_STATE.DOORS_CLOSING || currentState === ELEVATOR_STATE.EXITING) {
        // Doors close: Slide inwards to meet in the middle (X=0 relative to car center, but we use door geometry offset)
        targetXLeft = 0; // They should meet at X=0 if centered correctly on the front plane
        targetXRight = 0;
    } else {
        // Idle/Closed state
        return;
    }

    // Interpolate position based on progress (Requirement: Sliding animation)
    const currentProgress = doorAnimationProgress; // This is driven by time in animate() loop

    leftDoor.position.x = THREE.MathUtils.lerp(0, targetXLeft, currentProgress);
    rightDoor.position.x = THREE.MathUtils.lerp(0, targetXRight, currentProgress);
}


/**
 * Main animation loop.
 */
function animate(time) {
    requestAnimationFrame(animate);

    const deltaTime = (time - animationStartTime) / 1000 || (1/60); // Delta time in seconds
    animationStartTime = time;

    // --- Update State Progresses based on Time ---
    let progressIncrement = (deltaTime * timeScale) / DOOR_OPEN_TIME;

    if (currentState === ELEVATOR_STATE.DOORS_OPENING || currentState === ELEVATOR_STATE.BOARDING) {
        doorAnimationProgress += progressIncrement;
        if (doorAnimationProgress >= 1.0) {
            doorAnimationProgress = 1.0;
            // Door fully open, transition to boarding/waiting state if applicable
            if (currentState === ELEVATOR_STATE.DOORS_OPENING && currentPersonToMove) {
                currentState = ELEVATOR_STATE.BOARDING; // Transition to active boarding phase
                startPersonWalk(currentPersonToMove, true);
            } else if (currentState === ELEVATOR_STATE.DOORS_OPENING) {
                 // If no person, just stay open briefly or transition to idle
                 setTimeout(() => currentState = ELEVATOR_STATE.IDLE, 500);
            }
        }
    } else if (currentState === ELEVATOR_STATE.DOORS_CLOSING || currentState === ELEVATOR_STATE.EXITING) {
        doorAnimationProgress -= progressIncrement;
        if (doorAnimationProgress <= 0) {
            doorAnimationProgress = 0;
            // Door fully closed, transition to next state
            if (currentState === ELEVATOR_STATE.DOORS_CLOSING && currentPersonToMove) {
                currentState = ELEVATOR_STATE.MOVING_UP; // Or MOVING_DOWN based on target
                console.log("Doors closed. Resuming travel.");
            } else if (currentState === ELEVATOR_STATE.DOORS_CLOSING) {
                 // No person, just idle
                 currentState = ELEVATOR_STATE.IDLE;
            }
        }
    }

    // --- Update Visuals ---
    updateElevatorPosition(deltaTime);
    updateDoors(deltaTime);

    // Update Person Animations (if they are currently walking)
    peopleMap.forEach(person => {
        if (person.userData.walkInterval) {
            window.animateWalk(person, time / 1000, true); // Pass current time for sine wave calculation
        } else if (!person.userData.isBoarded && currentState === ELEVATOR_STATE.IDLE) {
             // Keep people standing still when idle and not interacting
             window.animateWalk(person, time / 1000, false);
        }
    });


    controls.update();
    renderer.render(scene, camera);
}

/**
 * Runs the main simulation logic loop (Requirement 8).
 */
function runNextSimulationStep() {
    if (currentState !== ELEVATOR_STATE.IDLE) return; // Only act when idle

    // --- Simulation Logic: Find next move ---
    let pickupFloor = -1;
    let destinationFloor = -1;

    // 1. Check if there is a person waiting to be picked up (i.e., not boarded, and elevator isn't at their floor)
    for (const [floorIdx, person] of peopleMap.entries()) {
        if (!person.userData.isBoarded && floorIdx !== currentFloorIndex) {
            // Found a waiting person! This is our pickup floor.
            pickupFloor = floorIdx;
            break; 
        }
    }

    if (pickupFloor === -1) {
        console.log("No people waiting to be picked up. Simulation paused.");
        return; // Nothing to do
    }

    // 2. Determine destination: Move the person to the currently empty floor
    destinationFloor = emptyFloorIndex;
    if (pickupFloor === destinationFloor) {
         console.log("Person is already at the target empty floor. Skipping move.");
         return;
    }


    // --- Execute Movement Sequence ---
    currentPersonToMove = peopleMap.get(pickupFloor);
    targetFloorIndex = destinationFloor; // Destination for the person

    console.log(`--- Starting Cycle: Pickup from Floor ${pickupFloor} -> Dropoff at Floor ${destinationFloor} ---`);

    // Step 1 & 2: Travel to pickup floor and open doors (handled by state machine)
    currentState = ELEVATOR_STATE.MOVING_DOWN; // Assuming we move down if pickup < current, or up otherwise
    if (pickupFloor > currentFloorIndex) {
        currentState = ELEVATOR_STATE.MOVING_UP;
    } else {
        currentState = ELEVATOR_STATE.MOVING_DOWN;
    }

    // Step 3: Boarding sequence starts when elevator arrives at pickupFloor
    // The state machine handles the transition from MOVING -> DOORS_OPENING -> BOARDING automatically upon arrival.
}


// --- Initialization Call ---
window.onload = function() {
    initScene();
    console.log("Simulation initialized. Press F5 to restart or observe initial idle state.");
};