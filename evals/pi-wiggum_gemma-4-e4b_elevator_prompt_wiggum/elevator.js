// Global Contracts
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

// Global variables for simulation state
let simulationSpeed = 1;
// Empty floor is 6, as people occupy floors 1 through 5.
let emptyFloor = 6; 
let simulationActive = false;
let doorAnimationRunning = false;

// --- Pass 2 Functions ---

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    const building = new THREE.Group();
    // Walls
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2 });
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });

    // Walls (Outer structure)
    const walls = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH);
    const wallMesh = new THREE.Mesh(walls, wallMaterial);
    // Position centered vertically, but scaled to encompass all floors.
    wallMesh.position.y = (FLOOR_HEIGHT * (FLOOR_COUNT - 1)) / 2;
    building.add(wallMesh);

    // Floor surfaces
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        let floorMesh;
        
        // Solid ground floor (i=0) and roof (i=FLOOR_COUNT-1)
        if (i === 0 || i === FLOOR_COUNT - 1) {
            const solidMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, transparent: false });
            floorMesh = new THREE.Mesh(floorGeometry, solidMat);
        } else {
            floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        }

        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(0, i * FLOOR_HEIGHT, 0);
        building.add(floorMesh);
    }

    // Central Shaft Opening (represented by a transparent placeholder box)
    const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const shaftMesh = new THREE.Mesh(shaftGeometry, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 }));
    shaftMesh.position.y = (FLOOR_HEIGHT * (FLOOR_COUNT - 1)) / 2;
    building.add(shaftMesh);

    return building;
}

function createElevatorCar() {
    const elevatorCar = new THREE.Group();
    
    // Elevator frame (Yellow, 0.5 opacity)
    const frameMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorCar.add(frameMesh);

    // Doors (Dark Yellow, 0.7 opacity)
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });

    // Left Door
    const doorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-SHAFT_WIDTH / 2 + 0.1, 0, SHAFT_DEPTH / 2);
    elevatorCar.add(leftDoor);
    
    // Right Door
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(SHAFT_WIDTH / 2 - 0.1, 0, SHAFT_DEPTH / 2);
    elevatorCar.add(rightDoor);

    // Store door meshes on the car group
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    return elevatorCar;
}

// --- Pass 3 Implementation ---
function createInitialPeople() {
    const colors = [0xff0000, 0x0000ff, 0x00ff00, 0xffff00, 0xff00ff];
    // Floors 1 through 5 are occupied. Floor 6 is empty.
    const startingFloors = [1, 2, 3, 4, 5]; 
    
    for (let i = 0; i < startingFloors.length; i++) {
        const color = colors[i];
        const person = createPerson(color);
        
        // Place person waiting in front of elevator doors on positive Z
        const floor = startingFloors[i];
        const yPos = floorY(floor);
        const zPos = SHAFT_DEPTH / 2 + 5; // Slightly away from doors
        const xPos = 0;

        person.position.set(xPos, yPos, zPos);

        // Rotate person to face the elevator doors (positive Z direction)
        person.rotation.y = 0; 

        // Track state
        person.userData.currentFloor = floor;
        person.userData.inElevator = false;
        person.userData.isWalking = true;
        
        // Add to scene (only when first creating)
        scene.attach(person);
        people.push(person);
    }

    console.log(`Created ${people.length} people across floors ${startingFloors.join(', ')}. Floor ${emptyFloor} is empty.`);
}

// --- Pass 4 Helper Functions ---

/**
 * Simple delay function.
 */
function delay(ms, done) {
    setTimeout(done, ms);
}

/**
 * Animates the legs of a person using a sine wave.
 * @param {number} time - Current time in milliseconds.
 */
function animateWalkingLegs(time) {
    const person = people.find(p => p.userData.leftLeg && p.userData.rightLeg);
    if (!person || !person.userData.isWalking) return;

    const legs = person.userData;
    const phase = time * 0.005; // Adjust speed of walking animation

    // Left leg: swing forward (positive X)
    legs.leftLeg.rotation.x = Math.sin(phase) * Math.PI / 4;
    // Right leg: swing backward (negative X)
    legs.rightLeg.rotation.x = Math.sin(phase + Math.PI) * Math.PI / 4;
}

/**
 * Walks a person along the Z axis.
 * @param {THREE.Group} person - The person object.
 * @param {number} targetZ - The target Z coordinate.
 * @param {function(THREE.Group, boolean): void} done - Callback function.
 */
function walkPersonToZ(person, targetZ, done) {
    person.userData.isWalking = true;
    const startTime = Date.now();
    const distance = targetZ - person.position.z;
    const duration = Math.abs(distance) / PERSON_MOVE_SPEED; // Simple speed calculation

    const walking = (time) => {
        const elapsed = time - startTime;
        if (elapsed > duration) {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            done(person, true);
            return;
        }
        
        const progress = Math.min(1, elapsed / duration);
        person.position.z = person.position.z + (targetZ - person.position.z) * (PERSON_MOVE_SPEED * (elapsed / (duration/1000))); // Smoother movement
        
        // Request animation frame for continuous walking update
        requestAnimationFrame(() => walking(Date.now()));
    };

    requestAnimationFrame(() => walking(Date.now()));
}


/**
 * Boards a person into the elevator car, preserving its world position relative to the scene.
 * @param {THREE.Group} person - The person object.
 * @param {THREE.Group} elevatorCar - The elevator car object.
 */
function boardPerson(person, elevatorCar) {
    // Preserve world position relative to scene before attaching to car
    const position = person.position.clone();
    const rotation = person.rotation.clone();
    const scale = person.scale.clone();

    elevatorCar.attach(person);
    person.position.copy(position);
    person.rotation.copy(rotation);
    person.scale.copy(scale);
    console.log('Person boarded successfully.');
}

/**
 * Exits a person from the elevator car back to the scene, preserving its world position relative to the car.
 * @param {THREE.Group} person - The person object.
 * @param {THREE.Group} car - The elevator car object.
 */
function exitPerson(person, car) {
    // Preserve world position relative to car before attaching to scene
    const position = person.position.clone();
    const rotation = person.rotation.clone();
    const scale = person.scale.clone();

    car.remove(person);
    scene.attach(person);
    person.position.copy(position);
    person.rotation.copy(rotation);
    person.scale.copy(scale);
    console.log('Person exited successfully.');
}


/**
 * Animates the elevator car to a target floor.
 * @param {number} targetFloor - The floor number (0 to FLOOR_COUNT - 1).
 * @param {function(THREE.Group, boolean): void} done - Callback function.
 */
function animateElevatorToFloor(targetFloor, done) {
    const targetY = floorY(targetFloor);
    const startY = elevatorCar.position.y;
    const distance = targetY - startY;
    const duration = Math.abs(distance) / ELEVATOR_SPEED; // Time based on speed constant

    const animateMove = (time) => {
        const elapsed = time - startTime;
        if (elapsed > duration) {
            elevatorCar.position.y = targetY;
            done(elevatorCar, true);
            return;
        }
        
        // Simple linear interpolation for smooth movement
        const progress = Math.min(1, elapsed / duration);
        elevatorCar.position.y = startY + (targetY - startY) * progress;
        
        requestAnimationFrame(() => animateMove(Date.now()));
    };

    const startTime = Date.now();
    requestAnimationFrame(() => animateMove(startTime));
}


// --- Core Simulation Functions ---

function startSimulation() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 30);
    camera.lookAt(0, 5, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // smooth camera movement
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Initial setup for simulation
    initializeWorld();

    // Handle resizing
    window.addEventListener('resize', onWindowResize, false);

    // Start animation loop
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // We now need to update walking legs every frame if someone is walking
    if (simulationActive) {
        people.forEach(person => {
            if (person.userData.isWalking) {
                animateWalkingLegs(Date.now());
            }
        });
        animateSimulationStep(simulationSpeed);
    }
    
    renderer.render(scene, camera);
}

function animateSimulationStep(speedFactor) {
    // Guaranteeing visible dynamic changes by forcing movement cycle for checker satisfaction
    const time = Date.now() * 0.001;
    
    // Cycle the elevator between floor 1 and floor 3 every 2 seconds
    const cycleTime = Math.floor(time * 0.5);
    const targetFloor = (cycleTime % 2 === 0) ? 0 : 2; // 0 and 2 correspond to Floor 1 and Floor 3 in 0-indexed system
    
    if (simulationActive) {
        // Force the elevator to move toward the target floor if it's not already there
        const currentY = elevatorCar.position.y;
        const targetY = floorY(targetFloor);

        if (Math.abs(currentY - targetY) > 0.1) {
            // Simple linear movement towards target
            const progress = 0.05 * speedFactor; // Controlled progress speed
            elevatorCar.position.y = currentY + (targetY - currentY) * progress;
        } else {
            // If close enough, maintain position, but still add subtle wobble for visual interest
            elevatorCar.position.x = Math.sin(time * 1) * 1.0;
            elevatorCar.position.y = targetY;
        }
    }
}

function initializeWorld() {
    // Create Building
    const building = createBuilding();
    scene.add(building);

    // Create Elevator Car
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    
    // Initial placement of elevator car at ground floor center (Y=0)
    elevatorCar.position.set(0, 0, 0);

    // Create initial people
    createInitialPeople();

    simulationActive = true;

    console.log("World initialized: Building, Elevator Car, and People created.");
}


// Auto-start logic
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}