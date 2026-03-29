// Constants for the simulation
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 8;

const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1.5;

// Global variables
let scene, camera, renderer, controls;
let building, floors, elevatorCar, doors;
let people = [];
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
let currentFloor = 0;
let targetFloor = -1;
let animationInProgress = false;

// Initialize the simulation
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // Create camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

    // Create renderer with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x333333);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    // Create building and floors
    createBuilding();
    createFloors();

    // Create elevator car
    createElevatorCar();

    // Create people on each floor (except one empty floor)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson(i);
            people.push(person);
        }
    }

    // Add speed control slider
    addSpeedControl();

    // Start animation loop
    animate();
}

// Create the building structure
function createBuilding() {
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x9999ff,
        transparent: false,
        side: THREE.DoubleSide,
        depthWrite: true
    });

    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT / 2, BUILDING_DEPTH);
    building = new THREE.Mesh(groundGeometry, groundMaterial);
    building.position.y = FLOOR_HEIGHT / 4;
    building.renderOrder = 0;
    scene.add(building);

    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT / 2, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeometry, groundMaterial);
    roof.position.y = FLOOR_HEIGHT * FLOOR_COUNT - FLOOR_HEIGHT / 4;
    roof.renderOrder = 0;
    scene.add(roof);

    // Walls (semi-transparent)
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Front and back walls with shaft cutout
    const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * (FLOOR_COUNT - 1), BUILDING_DEPTH / 2);
    frontWallGeometry.translate(0, 0, -BUILDING_DEPTH / 4);

    const backWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * (FLOOR_COUNT - 1), BUILDING_DEPTH / 2);
    backWallGeometry.translate(0, 0, BUILDING_DEPTH / 4);

    // Create shaft cutouts
    const frontShaftCutout = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * (FLOOR_COUNT - 1), SHAFT_DEPTH / 2);
    frontShaftCutout.translate(0, 0, -BUILDING_DEPTH / 4);

    const backShaftCutout = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * (FLOOR_COUNT - 1), SHAFT_DEPTH / 2);
    backShaftCutout.translate(0, 0, BUILDING_DEPTH / 4);

    // Subtract shaft from walls using CSG (simulated with custom geometry)
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2;
    frontWall.renderOrder = 0;
    scene.add(frontWall);

    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2;
    backWall.renderOrder = 0;
    scene.add(backWall);

    // Side walls
    const sideWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2, FLOOR_HEIGHT * (FLOOR_COUNT - 1), BUILDING_DEPTH);
    sideWallGeometry.translate(BUILDING_WIDTH / 4, 0, 0);

    const leftSideWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftSideWall.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2;
    leftSideWall.renderOrder = 0;
    scene.add(leftSideWall);

    const rightSideWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightSideWall.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2;
    rightSideWall.renderOrder = 0;
    scene.add(rightSideWall);
}

// Create transparent floors
function createFloors() {
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    floors = [];
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT / 2, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = FLOOR_HEIGHT * i + FLOOR_HEIGHT / 4;
        floor.renderOrder = 0;
        floors.push(floor);
        scene.add(floor);
    }
}

// Create elevator car with semi-transparent frame
function createElevatorCar() {
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const backWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: false,
        side: THREE.DoubleSide,
        depthWrite: true
    });

    // Main frame (without shaft area)
    const frameGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH - SHAFT_WIDTH * 2,
        FLOOR_HEIGHT * 0.8,
        SHAFT_DEPTH / 2
    );
    elevatorCar = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorCar.position.z = -SHAFT_DEPTH / 4;
    elevatorCar.renderOrder = 1;
    scene.add(elevatorCar);

    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH - SHAFT_WIDTH * 2,
        FLOOR_HEIGHT * 0.8,
        SHAFT_DEPTH / 4
    );
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = -SHAFT_DEPTH / 4 + SHAFT_DEPTH / 8;
    elevatorCar.add(backWall);

    // Side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH - SHAFT_WIDTH * 2,
        FLOOR_HEIGHT * 0.8,
        SHAFT_DEPTH / 4
    );
    const leftSideWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    leftSideWall.position.x = (BUILDING_WIDTH - SHAFT_WIDTH) / 2 - SHAFT_WIDTH / 2;
    elevatorCar.add(leftSideWall);

    const rightSideWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    rightSideWall.position.x = -(BUILDING_WIDTH - SHAFT_WIDTH) / 2 + SHAFT_WIDTH / 2;
    elevatorCar.add(rightSideWall);

    // Create doors
    createDoors();
}

// Create sliding doors
function createDoors() {
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Left door (negative X)
    const leftDoorGeometry = new THREE.BoxGeometry(
        SHAFT_WIDTH / 2 - 0.5,
        FLOOR_HEIGHT * 0.8,
        SHAFT_DEPTH / 4
    );
    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    leftDoor.position.x = -SHAFT_WIDTH / 4;
    leftDoor.position.z = -SHAFT_DEPTH / 4 + SHAFT_DEPTH / 8;
    elevatorCar.add(leftDoor);

    // Right door (positive X)
    const rightDoorGeometry = new THREE.BoxGeometry(
        SHAFT_WIDTH / 2 - 0.5,
        FLOOR_HEIGHT * 0.8,
        SHAFT_DEPTH / 4
    );
    const rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    rightDoor.position.x = SHAFT_WIDTH / 4;
    rightDoor.position.z = -SHAFT_DEPTH / 4 + SHAFT_DEPTH / 8;
    elevatorCar.add(rightDoor);

    doors = {
        left: leftDoor,
        right: rightDoor,
        open: false
    };
}

// Add speed control slider
function addSpeedControl() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.bottom = '20px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.color = 'white';
    container.style.textAlign = 'center';

    const label = document.createElement('div');
    label.textContent = 'Animation Speed:';
    label.style.marginBottom = '10px';
    container.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = '5';
    slider.style.width = '300px';
    slider.style.margin = '0 20px';

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = '×5';
    valueDisplay.id = 'speedValue';
    container.appendChild(valueDisplay);

    slider.addEventListener('input', function() {
        valueDisplay.textContent = '×' + this.value;
    });

    document.body.appendChild(container);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the simulation when page loads
window.onload = init;