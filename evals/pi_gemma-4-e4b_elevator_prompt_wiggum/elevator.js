// Global Contract Constants (must be top-level const)
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global Contract Variables (must be top-level let)
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

// State variables
let animationSpeed = 1.0;
let emptyFloor = 2; // Arbitrary starting empty floor

// Simulation loop control
let isRunning = false;
let clock = new THREE.Clock();

function startSimulation() {
    console.log("Starting Elevator Simulation...");

    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(BUILDING_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // soft white light
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight1.position.set(5, 10, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight2.position.set(-5, -10, -5);
    scene.add(directionalLight2);

    // 5. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3, 0); // Center controls on the middle of the building/shaft
    controls.update();

    // 6. Initialize World Elements
    createBuilding();
    createElevatorCar();
    initializePeople();

    // 7. Handle Resize
    window.addEventListener('resize', onWindowResize, false);

    // 8. Start Animation
    isRunning = true;
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    if (!isRunning) return;
    requestAnimationFrame(animate);

    const delta = clock.getDelta() * animationSpeed;

    controls.update();
    
    // Placeholder for simulation updates in later passes
    // updateSimulation(delta); 

    renderer.render(scene, camera);
}

// --- Pass 1 Placeholders ---

function createBuilding() {
    console.log("Building creation placeholder.");
}

function createElevatorCar() {
    console.log("Elevator car creation placeholder.");
    // Placeholder for the required Group object
    elevatorCar = new THREE.Group();
    scene.add(elevatorCar);
    return elevatorCar;
}

function initializePeople() {
    // Placeholder for creating 5 people
    console.log("People initialization placeholder.");
}


// Auto-start logic
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}