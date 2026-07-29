// Elevator simulation - main logic

// H6: Constants as top-level bare names (not in config object)
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global variables (H5 naming contract)
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];
let emptyFloorIndex = 0;
let simClock = new THREE.Clock();
let animationSpeed = 1;

// Setup speed slider control
function setupSpeedSlider() {
    const slider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    if (slider && speedValue) {
        slider.addEventListener('input', function() {
            animationSpeed = parseFloat(this.value);
            speedValue.textContent = animationSpeed + 'x';
        });
    }
}

// Track current simulation state
let currentFloor = 0;
let targetFloor = 1;
let isMoving = false;
let doorState = 'closed'; // 'closed', 'opening', 'open', 'closing'
let waitingPerson = null;

// H6: Create building with transparent floors and walls
function createBuilding() {
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    const solidMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        depthWrite: true
    });

    // Create each floor
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;

        // Main floor platform with shaft cutout
        const floorWidth = BUILDING_WIDTH;
        const floorDepth = BUILDING_DEPTH;
        const shaftX = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const shaftZ = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;

        // Four floor sections around the shaft
        const sections = [
            // Front section (below shaft)
            new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, shaftZ), floorMaterial),
            // Back section (above shaft)
            new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, floorDepth - shaftZ - SHAFT_DEPTH), floorMaterial),
            // Left section
            new THREE.Mesh(new THREE.BoxGeometry(shaftX, 0.1, SHAFT_DEPTH), floorMaterial),
            // Right section
            new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH - shaftX - SHAFT_WIDTH, 0.1, SHAFT_DEPTH), floorMaterial)
        ];

        sections.forEach(section => {
            section.position.set(
                BUILDING_WIDTH / 2 - 0.5,
                floorY,
                BUILDING_DEPTH / 2 - 0.5
            );
            scene.add(section);
        });

        // Walls on three sides (not front where elevator doors are)
        const wallHeight = FLOOR_HEIGHT;
        const wallThickness = 0.2;

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, floorDepth),
            wallMaterial
        );
        leftWall.position.set(0, floorY + wallHeight / 2, BUILDING_DEPTH / 2 - 0.5);
        scene.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, floorDepth),
            wallMaterial
        );
        rightWall.position.set(BUILDING_WIDTH, floorY + wallHeight / 2, BUILDING_DEPTH / 2 - 0.5);
        scene.add(rightWall);

        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, wallThickness),
            wallMaterial
        );
        backWall.position.set(BUILDING_WIDTH / 2, floorY + wallHeight / 2, BUILDING_DEPTH);
        scene.add(backWall);
    }

    // Solid ground floor
    const groundFloor = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
        solidMaterial
    );
    groundFloor.position.set(BUILDING_WIDTH / 2, 0, BUILDING_DEPTH / 2);
    scene.add(groundFloor);

    // Solid roof
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
        solidMaterial
    );
    roof.position.set(BUILDING_WIDTH / 2, (FLOOR_COUNT - 1) * FLOOR_HEIGHT + FLOOR_HEIGHT, BUILDING_DEPTH / 2);
    scene.add(roof);
}

// H5: Create elevator car with proper structure
function createElevatorCar() {
    const car = new THREE.Group();

    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc00, // darker yellow
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const backWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Elevator dimensions
    const carWidth = SHAFT_WIDTH - 0.5;
    const carDepth = SHAFT_DEPTH - 0.5;
    const carHeight = FLOOR_HEIGHT * 0.9;

    // Bottom frame
    const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, 0.1, carDepth),
        frameMaterial
    );
    bottomFrame.position.set(0, -carHeight / 2 + 0.05, 0);
    car.add(bottomFrame);

    // Top frame (ceiling)
    const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, 0.1, carDepth),
        frameMaterial
    );
    topFrame.position.set(0, carHeight / 2 - 0.05, 0);
    car.add(topFrame);

    // Side walls (transparent)
    const sideWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, carHeight, carDepth),
        sideWallMaterial
    );
    leftWall.position.set(-carWidth / 2 + 0.05, 0, 0);
    car.add(leftWall);

    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, carHeight, carDepth),
        sideWallMaterial
    );
    rightWall.position.set(carWidth / 2 - 0.05, 0, 0);
    car.add(rightWall);

    // Back wall (solid)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, carHeight, 0.1),
        backWallMaterial
    );
    backWall.position.set(0, 0, -carDepth / 2 + 0.05);
    car.add(backWall);

    // Front door frame (two sliding doors)
    const doorWidth = (carWidth - 0.2) / 2;
    const doorHeight = carHeight - 0.2;
    const doorDepth = 0.1;

    // Left door
    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMaterial
    );
    leftDoor.position.set(-carWidth / 2 + 0.15, 0, carDepth / 2 - 0.06);
    car.add(leftDoor);

    // Right door
    const rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMaterial
    );
    rightDoor.position.set(carWidth / 2 - 0.15, 0, carDepth / 2 - 0.06);
    car.add(rightDoor);

    // Store references to doors on elevatorCar
    car.leftDoor = leftDoor;
    car.rightDoor = rightDoor;

    return car;
}

// Create all people and place them on floors
function createPeople() {
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;

        const person = createPerson();
        // Place person in front of elevator, facing it
        const floorY = i * FLOOR_HEIGHT;
        person.position.set(0, floorY + 0.5, SHAFT_DEPTH / 2 + 1.5);
        person.rotation.y = Math.PI; // Face the elevator

        // Track which floor this person is currently on
        person.userData.currentFloor = i;

        scene.add(person);
        people.push(person);
    }
}

// Animate doors opening/closing
function animateDoors(opening, callback) {
    const duration = 500 / animationSpeed;
    const startTime = simClock.getElapsedTime();
    const startLeftPos = elevatorCar.leftDoor.position.x;
    const startRightPos = elevatorCar.rightDoor.position.x;

    function update() {
        const elapsed = simClock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (opening) {
            // Doors slide outward from center
            elevatorCar.leftDoor.position.x = startLeftPos - progress * 1.5;
            elevatorCar.rightDoor.position.x = startRightPos + progress * 1.5;
        } else {
            // Doors slide inward to meet in middle
            elevatorCar.leftDoor.position.x = startLeftPos + (1 - progress) * 1.5;
            elevatorCar.rightDoor.position.x = startRightPos - (1 - progress) * 1.5;
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            if (callback) callback();
        }
    }

    update();
}

// Animate person walking with leg swing
function animatePersonWalking(person, direction, callback) {
    const duration = 2000 / animationSpeed; // 2 seconds base
    const startTime = simClock.getElapsedTime();
    const startPos = person.position.clone();
    const travelDistance = 1.5;

    function update() {
        const elapsed = simClock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Move forward using linear interpolation
        person.position.z = startPos.z + direction * travelDistance * progress;

        // Leg animation using sine wave
        if (person.userData.isWalking) {
            const swingAngle = Math.sin(progress * Math.PI * 2) * 0.5;
            person.userData.leftLeg.rotation.x = swingAngle;
            person.userData.rightLeg.rotation.x = -swingAngle;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Ensure final position is exact
            person.position.z = startPos.z + direction * travelDistance;
            if (callback) callback();
        }
    }

    update();
}

// Move elevator to floor with animation
function moveElevatorToFloor(floorIndex, callback) {
    const targetY = floorIndex * FLOOR_HEIGHT;
    const startPos = elevatorCar.position.y;
    const duration = Math.abs(targetY - startPos) / ELEVATOR_SPEED / animationSpeed;

    function update() {
        const elapsed = simClock.getElapsedTime();
        const progress = (elapsed - startAnimTime) / duration;

        if (progress < 1) {
            // Smooth easing
            const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 1, 2) / 2;
            elevatorCar.position.y = startPos + (targetY - startPos) * easeProgress;
            requestAnimationFrame(update);
        } else {
            elevatorCar.position.y = targetY;
            if (callback) callback();
        }
    }

    const startAnimTime = simClock.getElapsedTime();
    update();
}

// Run the simulation sequence
function runSimulationSequence() {
    if (isMoving || people.length === 0) {
        setTimeout(runSimulationSequence, 1000);
        return;
    }

    // Find a person to move
    const personToMove = people[Math.floor(Math.random() * people.length)];
    const destinationFloor = emptyFloorIndex;
    const personFloor = personToMove.userData.currentFloor;

    console.log(`Moving person from floor ${personFloor} to floor ${destinationFloor}`);

    // Step 1: Move elevator to current floor of person
    const targetFloorY = personFloor * FLOOR_HEIGHT;
    if (Math.abs(elevatorCar.position.y - targetFloorY) > 0.1) {
        moveElevatorToFloor(personFloor, () => {
            startBoardingSequence(personToMove, destinationFloor);
        });
    } else {
        startBoardingSequence(personToMove, destinationFloor);
    }
}

function startBoardingSequence(person, destinationFloor) {
    isMoving = false;
    currentFloor = person.userData.currentFloor;

    // Step 2: Open doors
    doorState = 'opening';
    animateDoors(true, () => {
        doorState = 'open';

        // Step 3: Person walks into elevator
        person.userData.isWalking = true;
        animatePersonWalking(person, -1, () => {
            person.userData.isWalking = false;

            // Attach person to elevator (preserves world transform)
            elevatorCar.attach(person);
            person.position.set(0, 0.5, 0); // Position inside elevator
            // Person is now in transit, floor temporarily null
            person.userData.currentFloor = null;

            // Step 4: Close doors after brief delay
            setTimeout(() => {
                doorState = 'closing';
                animateDoors(false, () => {
                    doorState = 'closed';
                    isMoving = true;

                    // Step 5: Move to destination
                    moveElevatorToFloor(destinationFloor, () => {
                        startExitingSequence(person, destinationFloor);
                    });
                });
            }, 300);
        });
    });
}

function startExitingSequence(person, floorIndex) {
    // Step 6: Open doors at destination
    doorState = 'opening';
    animateDoors(true, () => {
        doorState = 'open';

        // Step 7: Person walks out
        person.userData.isWalking = true;
        animatePersonWalking(person, 1, () => {
            person.userData.isWalking = false;

            // Detach from elevator and attach to scene (preserves world position)
            scene.attach(person);
            const floorY = floorIndex * FLOOR_HEIGHT;
            person.position.set(0, floorY + 0.5, SHAFT_DEPTH / 2 + 1.5);
            person.rotation.y = Math.PI;
            person.userData.currentFloor = floorIndex;

            // Update empty floor tracking
            emptyFloorIndex = currentFloor;
            currentFloor = floorIndex;

            // Step 8: Close doors
            setTimeout(() => {
                doorState = 'closing';
                animateDoors(false, () => {
                    doorState = 'closed';
                    isMoving = true;
                    setTimeout(runSimulationSequence, 1000);
                });
            }, 300);
        });
    });
}

// Initialize and start the simulation
function startSimulation() {
    // Setup scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    // Setup camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(BUILDING_WIDTH / 2, (FLOOR_COUNT - 1) * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);

    // Setup renderer with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // Add controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Add lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    // Create building and elevator
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    // Create people
    createPeople();

    // Setup speed slider
    setupSpeedSlider();

    // Start animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Start simulation sequence after a brief delay
    setTimeout(runSimulationSequence, 2000);
}

// Auto-start on page load (H3 requirement)
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
