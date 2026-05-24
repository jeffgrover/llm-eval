// Constants (configurable at top of elevator.js)
const FLOOR_HEIGHT = 3.0;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 3.0;
const SHAFT_DEPTH = 3.0;
const ELEVATOR_SPEED = 0.02; // Units per frame
const PERSON_MOVE_SPEED = 0.05;
const DOOR_OPEN_SPEED = 0.03;
const DOOR_CLOSE_SPEED = 0.03;
const ANIMATION_DELAY = 300; // ms

// Color Scheme
const COLORS = {
    elevatorFrame: new THREE.Color(0xffff00),
    elevatorDoors: new THREE.Color(0xcccc00),
    floor: new THREE.Color(0xcccccc),
    wall: new THREE.Color(0x9999ff),
    personBody: new THREE.Color(0x3498db),
    personHead: new THREE.Color(0xffdbac),
    personLeg: new THREE.Color(0x2c3e50)
};

let scene, camera, renderer, controls;
let elevatorCar, doors = {};
let floors = [];
let people = [];
let simulationState = {
    currentFloorIndex: 0,
    targetFloorIndex: 0,
    isMoving: false,
    doorState: 'closed', // 'closed', 'opening', 'open', 'closing'
    currentAnimationStep: 'waiting', // 'waiting', 'picking_up', 'riding', 'dropping_off'
    speedMultiplier: 1.0,
    peopleLocations: new Map(), // Map<FloorIndex, PersonInstance>
    emptyFloorIndex: 0
};

// --- Initialization ---
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Light blue sky
    scene.fog = new THREE.Fog(0x87ceeb, 1, 100);

    // Camera setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 0, 0);

    // Renderer setup (CRITICAL Transparency Setup)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87ceeb);
    renderer.alpha = true; // Enable alpha blending for transparency
    renderer.sortObjects = true; // Enable depth sorting
    document.body.appendChild(renderer.domElement);

    // Controls setup
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 30, 10);
    scene.add(directionalLight);

    // Build structure
    buildBuilding();
    createElevator();
    createPeople();

    // Add UI controls
    setupControls();

    window.addEventListener('resize', onWindowResize);
    animate();
}

// --- Building Structure ---
function buildBuilding() {
    const wallMaterial = new THREE.MeshPhongMaterial({ color: COLORS.wall, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshPhongMaterial({ color: COLORS.floor, transparent: true, opacity: 0.3, side: THREE.DoubleSide });

    // 1. Ground floor and Roof
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeometry, new THREE.MeshPhongMaterial({ color: 0x555555 })); // Solid ground
    ground.position.set(0, -FLOOR_HEIGHT / 2, 0);
    scene.add(ground);

    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeometry, new THREE.MeshPhongMaterial({ color: 0x555555 })); // Solid roof
    roof.position.set(0, (FLOOR_HEIGHT * FLOOR_COUNT) / 2, 0);
    scene.add(roof);

    // 2. Floors and Walls
    for (let i = 0; i < FLOOR_COUNT; i++) {
        // Floor surface
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial.clone());
        // Position floors at the center of their height segment
        const floorY = (i + 0.5) * FLOOR_HEIGHT - (FLOOR_HEIGHT * FLOOR_COUNT) / 2 + (FLOOR_HEIGHT / 2);
        floor.position.set(0, floorY, 0);
        
        // Elevator shaft cutout
        const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, SHAFT_DEPTH);
        const shaft = new THREE.Mesh(shaftGeometry, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1.0, side: THREE.DoubleSide }));
        shaft.position.set(0, floorY, 0);
        floor.add(shaft); // Shaft is part of the floor object
        
        scene.add(floor);
        floors.push(floor);

        // Walls (Simplified cube walls around the perimeter, leaving central shaft open)
        const wallMaterialClone = wallMaterial.clone();

        // Wall 1 (Width side)
        const wallWGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1);
        const wallW = new THREE.Mesh(wallWGeometry, wallMaterialClone);
        wallW.position.set(0, floorY, -BUILDING_DEPTH / 2 + 0.05);
        scene.add(wallW);
        
        // Wall 2 (Width side)
        const wallW2 = wallW.clone();
        wallW2.position.set(0, floorY, BUILDING_DEPTH / 2 - 0.05);
        scene.add(wallW2);

        // Wall 3 (Depth side)
        const wallDGeometry = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, BUILDING_DEPTH);
        const wallD = new THREE.Mesh(wallDGeometry, wallMaterialClone);
        wallD.position.set(-BUILDING_WIDTH / 2 + 0.05, floorY, 0);
        scene.add(wallD);
        
        // Wall 4 (Depth side)
        const wallD2 = wallD.clone();
        wallD2.position.set(BUILDING_WIDTH / 2 - 0.05, floorY, 0);
        scene.add(wallD2);
    }
}

// --- Elevator Structure ---
function createElevator() {
    // Elevator Frame (Yellow, semi-transparent)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH * 0.9, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const frameMaterial = new THREE.MeshPhongMaterial({ color: COLORS.elevatorFrame, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    elevatorCar = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorCar.position.set(0, 0, 0); // Initial central position
    elevatorCar.userData.isElevator = true;
    scene.add(elevatorCar);

    // Doors (Two sliding parts)
    const doorWidth = SHAFT_WIDTH * 0.45;
    const doorHeight = FLOOR_HEIGHT * FLOOR_COUNT;
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.1);
    const doorMaterial = new THREE.MeshPhongMaterial({ color: COLORS.elevatorDoors, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

    // Left Door
    const doorL = new THREE.Mesh(doorGeometry, doorMaterial.clone());
    doorL.position.set(-doorWidth / 2, 0, 0);
    doors.left = doorL;
    elevatorCar.add(doorL);

    // Right Door
    const doorR = new THREE.Mesh(doorGeometry, doorMaterial.clone());
    doorR.position.set(doorWidth / 2, 0, 0);
    doors.right = doorR;
    elevatorCar.add(doorR);

    // Store door references on elevatorCar object
    elevatorCar.userData.doors = doors;
    elevatorCar.userData.isDoorOpen = false;
}

// --- People Creation and Setup ---
function createPeople() {
    // Initialize people on random floors, ensuring one empty floor
    const availableFloors = Array.from({ length: FLOOR_COUNT }, (_, i) => i);
    // Shuffle floors to randomly select where people start
    const shuffledFloors = availableFloors.sort(() => Math.random() - 0.5);

    // Place people on all but one floor (the empty floor)
    for (let i = 0; i < FLOOR_COUNT - 1; i++) {
        const floorIndex = shuffledFloors[i];
        const person = createPerson(COLORS.personBody, COLORS.personHead, COLORS.personLeg);
        
        // Position people in front of the elevator doors (positive Z-axis)
        // We position them slightly off the floor level (0.1 unit) for visual safety
        person.position.set(0, 0.1, BUILDING_DEPTH / 2 - 5); 
        
        // Make them face the elevator (rotate 180 degrees around Y-axis)
        person.rotation.y = Math.PI; 

        scene.add(person);
        people.push(person);
        
        simulationState.peopleLocations.set(floorIndex, person);
    }
    // The remaining floor is the empty floor
    simulationState.emptyFloorIndex = shuffledFloors[FLOOR_COUNT - 1];
    console.log("Empty floor is:", simulationState.emptyFloorIndex);
}

// --- Simulation Logic and Animation ---

function setupControls() {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 1;
    slider.max = 20;
    slider.value = 1;
    slider.step = 0.5;
    slider.id = 'speedSlider';
    
    const label = document.createElement('label');
    label.htmlFor = 'speedSlider';
    label.textContent = 'Animation Speed (1x - 20x):';

    const container = document.createElement('div');
    container.appendChild(label);
    container.appendChild(slider);
    document.body.appendChild(container);

    slider.oninput = function() {
        simulationState.speedMultiplier = parseFloat(this.value);
    };
}


function updateAnimation(delta) {
    const speed = ELEVATOR_SPEED * simulationState.speedMultiplier;
    const personWalkSpeed = PERSON_MOVE_SPEED * simulationState.speedMultiplier;

    switch (simulationState.currentAnimationStep) {
        case 'waiting':
            // Do nothing, waiting for user input
            break;

        case 'picking_up':
            // Door opening logic
            animateDoor(true, DOOR_OPEN_SPEED * delta);
            // Check if doors are fully open before moving elevator
            if (Math.abs(doors.left.position.x - (SHAFT_WIDTH * 0.45 / 2)) < 0.01 && Math.abs(doors.right.position.x - (-SHAFT_WIDTH * 0.45 / 2)) < 0.01) {
                startElevatorMovement(simulationState.targetFloorIndex);
            }
            break;
            
        case 'riding':
            // Move elevator
            const currentFloorY = (simulationState.currentFloorIndex + 0.5) * FLOOR_HEIGHT - (FLOOR_HEIGHT * FLOOR_COUNT) / 2 + (FLOOR_HEIGHT / 2);
            const targetFloorY = (simulationState.targetFloorIndex + 0.5) * FLOOR_HEIGHT - (FLOOR_HEIGHT * FLOOR_COUNT) / 2 + (FLOOR_HEIGHT / 2);
            
            // Simple linear movement towards target Y
            elevatorCar.position.y += (targetFloorY - currentFloorY) * speed * 100; // Scaling up movement for visual speed
            
            // Check if destination is reached (using distance check)
            if (Math.abs(elevatorCar.position.y - targetFloorY) < 0.01) {
                simulationState.isMoving = false;
                simulationState.currentAnimationStep = 'dropping_off';
                animateDoor(false, DOOR_CLOSE_SPEED * delta);
                startPersonExit();
            }
            break;

        case 'dropping_off':
            // Door closing logic
            animateDoor(false, DOOR_CLOSE_SPEED * delta);
            // Check if doors are fully closed
            if (Math.abs(doors.left.position.x - (-SHAFT_WIDTH * 0.45 / 2)) < 0.01 && Math.abs(doors.right.position.x - (SHAFT_WIDTH * 0.45 / 2)) < 0.01) {
                // All done for this cycle
                console.log("Simulation cycle complete.");
                simulationState.currentAnimationStep = 'waiting';
            }
            break;
    }
}

// --- Helper Functions ---

function animateDoor(open, speed) {
    const doorL = doors.left;
    const doorR = doors.right;
    
    // Calculate target positions for doors
    // Closed: (-W/2, 0, 0) and (W/2, 0, 0) relative to elevator center
    // Open: Doors slide outward (e.g., -2W/2 and 2W/2)
    const halfShaft = SHAFT_WIDTH / 2;
    const doorOffset = SHAFT_WIDTH * 0.45 / 2;

    let targetL, targetR;
    if (open) {
        targetL = -doorOffset * 2;
        targetR = doorOffset * 2;
    } else {
        targetL = -doorOffset;
        targetR = doorOffset;
    }

    // Smooth transition interpolation
    doorL.position.x += (targetL - doorL.position.x) * speed;
    doorR.position.x += (targetR - doorR.position.x) * speed;
}


function startElevatorMovement(targetFloorIndex) {
    simulationState.targetFloorIndex = targetFloorIndex;
    simulationState.currentAnimationStep = 'riding';
    simulationState.isMoving = true;
    console.log("Elevator moving to floor:", targetFloorIndex);
}

function startPersonBoarding() {
    // Person walks forward into the elevator
    const person = simulationState.peopleLocations.get(simulationState.currentFloorIndex);
    if (person) {
        person.userData.isWalking = true;
        person.userData.originalPosition = person.position.clone();
        // Reset movement tracking
        person.userData.walkTargetZ = person.position.z + SHAFT_WIDTH * 0.5; 
    }
}

function startPersonExit() {
    // Person walks forward out of the elevator
    const person = simulationState.peopleLocations.get(simulationState.targetFloorIndex);
    if (person) {
        person.userData.isWalking = true;
        person.userData.originalPosition = person.position.clone();
        // Reset movement tracking
        person.userData.walkTargetZ = person.position.z - SHAFT_WIDTH * 0.5;
    }
}

function updatePeople(delta) {
    people.forEach(person => {
        if (person.userData.isWalking) {
            const targetZ = person.userData.walkTargetZ;
            
            // Walking animation implementation (Sine wave for leg swing)
            const time = Date.now() / 500; // Time in seconds for smoother loop
            const swingAngle = Math.sin(time) * 0.5; // Max swing 0.5 radians

            // Update leg rotation (Pivoting from hips/body - simplified pivot)
            person.userData.legs.legL.rotation.x = swingAngle;
            person.userData.legs.legR.rotation.x = -swingAngle;

            // Update position towards target Z
            person.position.z += (targetZ - person.position.z) * PERSON_MOVE_SPEED * delta * 100;

            // Check if reached target
            if (Math.abs(person.position.z - targetZ) < 0.1) {
                person.userData.isWalking = false;
                
                if (person.userData.isBoarded) {
                    // Exited elevator and is back in scene
                    scene.add(person);
                    elevatorCar.remove(person);
                    person.userData.isBoarded = false;
                    simulationState.peopleLocations.set(simulationState.targetFloorIndex, person);
                } else {
                    // Boarded elevator
                    elevatorCar.add(person);
                    scene.remove(person);
                    person.userData.isBoarded = true;
                    // Remove person from floor location tracking temporarily until they arrive at target
                    simulationState.peopleLocations.delete(simulationState.currentFloorIndex);
                }
            }
        } else {
             // Standing position: Reset legs
            person.userData.legs.legL.rotation.x = 0;
            person.userData.legs.legR.rotation.x = 0;
        }
    });
}

// --- Main Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls and scene
    controls.update();
    
    // Update simulation logic
    updateAnimation(0.016); // Using approximate delta time
    updatePeople(0.016);

    // Render
    renderer.render(scene, camera);
}

// --- Event Listeners ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initial start
init();

// --- Manual Control (To start the simulation cycle) ---
// In a real application, this would be triggered by a UI button. 
// For this exercise, we manually trigger the first step.
window.addEventListener('click', () => {
    if (simulationState.currentAnimationStep === 'waiting') {
        // Pick a random target floor, ensuring it's not the empty floor
        let target;
        do {
            target = Math.floor(Math.random() * FLOOR_COUNT);
        } while (target === simulationState.emptyFloorIndex);
        
        simulationState.currentFloorIndex = simulationState.peopleLocations.has(simulationState.currentFloorIndex) ? simulationState.currentFloorIndex : 0;
        simulationState.targetFloorIndex = target;
        
        // 1. Elevator moves to pickup floor (if not already there)
        // Simplified: Assume elevator is at currentFloorIndex for simplicity of demo start
        
        simulationState.currentAnimationStep = 'picking_up';
        
        // 2. Doors open
        animateDoor(true, 0.016);
        
        // 3. Person boards (Start walking animation)
        startPersonBoarding();

        // 4. Doors close (This happens inside 'picking_up' case when doors are fully open)
    }
});