// Global elevator simulation
// Main simulation file for Three.js elevator with 6-floor building

const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;

// Animation and movement constants
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global simulation state
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let currentFloor = 0;
let targetFloor = 0;
let isMoving = false;
let doorState = { open: false, progress: 0 };

// Create building floors and walls
function createBuilding() {
    // Ground floor (solid)
    const groundFloorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * 0.2, BUILDING_DEPTH);
    const groundFloorMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const groundFloor = new THREE.Mesh(groundFloorGeometry, groundFloorMaterial);
    groundFloor.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) + 0.1;
    scene.add(groundFloor);
    
    // Upper floors (transparent)
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3
    });
    
    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * 0.2, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1 - i) + 0.1;
        scene.add(floor);
    }
    
    // Roof
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * 0.5, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = FLOOR_HEIGHT;
    scene.add(roof);
}

// Create elevator car with doors and passengers
function createElevatorCar() {
    const elevatorGroup = new THREE.Group();
    
    // Elevator frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.1, SHAFT_DEPTH);
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    
    // Create elevator car body
    const carGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.1, SHAFT_DEPTH);
    const carMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const carBody = new THREE.Mesh(carGeometry, frameMaterial);
    elevatorGroup.add(carBody);
    
    // Elevator doors (darker yellow)
    const doorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH/2 - 0.1, FLOOR_HEIGHT - 0.3, SHAFT_DEPTH);
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7
    });
    
    // Left door
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-SHAFT_WIDTH/4, FLOOR_HEIGHT/2 - 0.15, SHAFT_DEPTH/2 + 0.15);
    elevatorGroup.add(leftDoor);
    
    // Right door
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(SHAFT_WIDTH/4, FLOOR_HEIGHT/2 - 0.15, SHAFT_DEPTH/2 + 0.15);
    elevatorGroup.add(rightDoor);
    
    // Store door references on elevatorCar
    elevatorGroup.leftDoor = leftDoor;
    elevatorGroup.rightDoor = rightDoor;
    
    return elevatorGroup;
}

// Animation utilities for doors and legs
function animateLegs(person, time) {
    if (person.userData.isWalking) {
        const swingSpeed = 0.5;
        person.userData.leftLeg.rotation.x = Math.sin(time * swingSpeed) * 0.3;
        person.userData.rightLeg.rotation.x = Math.sin(time * swingSpeed + Math.PI) * 0.3;
    } else {
        // Reset legs when not walking
        if (person.userData.leftLeg) person.userData.leftLeg.rotation.set(0, 0, 0);
        if (person.userData.rightLeg) person.userData.rightLeg.rotation.set(0, 0, 0);
    }
}

// Door animation utilities
function animateDoors() {
    const targetX = SHAFT_WIDTH/2 * (1 - doorState.progress);
    
    if (elevatorCar.leftDoor) elevatorCar.leftDoor.position.x = -targetX;
    if (elevatorCar.rightDoor) elevatorCar.rightDoor.position.x = targetX;
}

// Update simulation state
function updateSimulation() {
    animateDoors();
    
    // Simple door animation logic with delay for realism
    if (!doorState.open && doorState.progress < 1) {
        doorState.progress += 0.01;
    }
}

// Start simulation (auto-invoked on page load)
function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    
    // Create building
    createBuilding();
    
    // Create elevator car
    elevatorCar = createElevatorCar();
    elevatorCar.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) + 0.5;
    scene.add(elevatorCar);
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}
