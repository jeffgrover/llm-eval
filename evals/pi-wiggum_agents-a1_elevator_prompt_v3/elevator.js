// elevator.js - Main simulation logic with building, elevator, and animation

// H6: Constants as top-level bare const declarations
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// H5: Global variables for simulation state
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];
let clock;
let animationSpeed = 1.0;

// Floor management
let emptyFloorIndex = 0;
let currentElevatorFloor = 0;
let targetFloor = null;
let isMoving = false;
let doorsOpen = false;

// Create the building with transparent floors and walls
function createBuilding() {
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const solidMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        depthWrite: true,
        side: THREE.DoubleSide
    });

    // Build each floor with shaft cutout
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;

        // Floor slab (with shaft cutout)
        const floorPlateGeometry = new THREE.BoxGeometry(
            BUILDING_WIDTH,
            0.2,
            BUILDING_DEPTH
        );
        const floorPlate = new THREE.Mesh(floorPlateGeometry, floorMaterial);
        floorPlate.position.set(0, floorY + 0.1, 0);
        floorPlate.renderOrder = 0;
        scene.add(floorPlate);

        // Shaft walls (vertical columns around the shaft)
        const shaftHalf = SHAFT_WIDTH / 2;
        const depthHalf = BUILDING_DEPTH / 2;

        // Front wall section (below shaft)
        const frontWallGeo = new THREE.BoxGeometry(
            SHAFT_WIDTH,
            FLOOR_HEIGHT - 0.2,
            (BUILDING_DEPTH - SHAFT_DEPTH) / 2
        );
        const frontWall = new THREE.Mesh(frontWallGeo, wallMaterial);
        frontWall.position.set(0, floorY + FLOOR_HEIGHT / 2 - 0.1, -(depthHalf + SHAFT_DEPTH / 4));
        frontWall.renderOrder = 0;
        scene.add(frontWall);

        // Back wall section (above shaft)
        const backWall = new THREE.Mesh(frontWallGeo, wallMaterial);
        backWall.position.set(0, floorY + FLOOR_HEIGHT / 2 - 0.1, depthHalf + SHAFT_DEPTH / 4);
        backWall.renderOrder = 0;
        scene.add(backWall);

        // Left wall section (left of shaft)
        const leftWallGeo = new THREE.BoxGeometry(
            (BUILDING_WIDTH - SHAFT_WIDTH) / 2,
            FLOOR_HEIGHT - 0.2,
            SHAFT_DEPTH
        );
        const leftWall = new THREE.Mesh(leftWallGeo, wallMaterial);
        leftWall.position.set(-(depthHalf + SHAFT_DEPTH / 4), floorY + FLOOR_HEIGHT / 2 - 0.1, 0);
        leftWall.renderOrder = 0;
        scene.add(leftWall);

        // Right wall section (right of shaft)
        const rightWall = new THREE.Mesh(leftWallGeo, wallMaterial);
        rightWall.position.set(depthHalf + SHAFT_DEPTH / 4, floorY + FLOOR_HEIGHT / 2 - 0.1, 0);
        rightWall.renderOrder = 0;
        scene.add(rightWall);
    }

    // Solid ground floor (bottom)
    const groundGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH,
        0.5,
        BUILDING_DEPTH
    );
    const groundFloor = new THREE.Mesh(groundGeometry, solidMaterial);
    groundFloor.position.set(0, -0.25, 0);
    scene.add(groundFloor);

    // Solid roof (top)
    const roofY = (FLOOR_COUNT - 1) * FLOOR_HEIGHT + 0.5;
    const roofFloor = new THREE.Mesh(groundGeometry, solidMaterial);
    roofFloor.position.set(0, roofY, 0);
    scene.add(roofFloor);
}

// Create the elevator car with sliding doors
function createElevatorCar() {
    const elevator = new THREE.Group();

    // Frame (yellow, semi-transparent)
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const backWallGeometry = new THREE.BoxGeometry(0.1, 2.2, 2.8);
    const backWall = new THREE.Mesh(backWallGeometry, frameMaterial);
    backWall.position.set(0, 1.1, -1.4);
    elevator.add(backWall);

    // Side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(2.8, 2.2, 0.1);
    const leftSideWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    leftSideWall.position.set(-1.4, 1.1, 0);
    elevator.add(leftSideWall);

    const rightSideWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    rightSideWall.position.set(1.4, 1.1, 0);
    elevator.add(rightSideWall);

    // Ceiling
    const ceilingGeometry = new THREE.BoxGeometry(2.8, 0.1, 2.8);
    const ceiling = new THREE.Mesh(ceilingGeometry, frameMaterial);
    ceiling.position.set(0, 2.15, 0);
    elevator.add(ceiling);

    // Floor of elevator
    const carFloorGeometry = new THREE.BoxGeometry(2.8, 0.1, 2.8);
    const carFloor = new THREE.Mesh(carFloorGeometry, frameMaterial);
    carFloor.position.set(0, 0.05, 0);
    elevator.add(carFloor);

    // Doors (darker yellow, slightly more opaque)
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Left door
    const leftDoorGeometry = new THREE.BoxGeometry(1.3, 2.0, 0.1);
    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    leftDoor.position.set(-0.65, 1.0, -1.39);
    elevator.add(leftDoor);

    // Right door
    const rightDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    rightDoor.position.set(0.65, 1.0, -1.39);
    elevator.add(rightDoor);

    // Store references for animation
    elevator.leftDoor = leftDoor;
    elevator.rightDoor = rightDoor;

    return elevator;
}

// Create initial people on floors (one per floor except one empty)
function createPeople() {
    for (let i = 0; i < FLOOR_COUNT - 1; i++) {
        const person = createPerson();
        const floorY = i * FLOOR_HEIGHT;

        // Position in front of elevator doors, facing them
        person.position.set(0, floorY + 0.5, 3);
        person.rotation.y = Math.PI; // Face the elevator

        scene.add(person);
        people.push(person);
    }
}

// Animate door opening
function animateDoorsOpen(callback) {
    const duration = 500;
    const startTime = performance.now();
    const startLeftPos = elevatorCar.leftDoor.position.x;
    const startRightPos = elevatorCar.rightDoor.position.x;

    function openStep(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out quart
        const ease = 1 - Math.pow(1 - progress, 4);

        // Slide doors outward from center
        elevatorCar.leftDoor.position.x = startLeftPos - (1.3 * ease);
        elevatorCar.rightDoor.position.x = startRightPos + (1.3 * ease);

        if (progress < 1) {
            requestAnimationFrame(openStep);
        } else {
            doorsOpen = true;
            if (callback) callback();
        }
    }

    requestAnimationFrame(openStep);
}

// Animate door closing
function animateDoorsClose(callback) {
    const duration = 500;
    const startTime = performance.now();
    const targetLeftPos = -0.65;
    const targetRightPos = 0.65;

    function closeStep(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out quart
        const ease = 1 - Math.pow(1 - progress, 4);

        elevatorCar.leftDoor.position.x = targetLeftPos - (1.3 * ease);
        elevatorCar.rightDoor.position.x = targetRightPos + (1.3 * ease);

        if (progress < 1) {
            requestAnimationFrame(closeStep);
        } else {
            doorsOpen = false;
            if (callback) callback();
        }
    }

    requestAnimationFrame(closeStep);
}

// Animate person walking with leg animation
function animatePersonWalk(person, targetPosition, callback) {
    const startPosition = person.position.clone();
    const duration = Math.abs(targetPosition.x - startPosition.x) / PERSON_MOVE_SPEED;
    const startTime = performance.now();

    person.userData.isWalking = true;

    function walkStep(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Linear interpolation for position
        person.position.x = startPosition.x + (targetPosition.x - startPosition.x) * progress;
        person.position.y = startPosition.y + (targetPosition.y - startPosition.y) * progress;

        // Leg animation using sine wave
        if (progress < 1) {
            const legAngle = Math.sin(progress * Math.PI * 4) * 0.5;
            person.userData.leftLeg.rotation.x = legAngle;
            person.userData.rightLeg.rotation.x = -legAngle;
            requestAnimationFrame(walkStep);
        } else {
            // Reset legs to standing position
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
            person.userData.isWalking = false;
            if (callback) callback();
        }
    }

    requestAnimationFrame(walkStep);
}

// Move elevator to a specific floor (in world Y coordinates)
function moveElevatorToFloor(floorIndex, callback) {
    const targetY = floorIndex * FLOOR_HEIGHT + 0.5; // +0.5 to align with floor level
    const startTime = performance.now();
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = distance / ELEVATOR_SPEED;

    isMoving = true;

    function moveStep(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Linear interpolation for position
        elevatorCar.position.y = startY + (targetY - startY) * progress;

        if (progress < 1) {
            requestAnimationFrame(moveStep);
        } else {
            elevatorCar.position.y = targetY;
            isMoving = false;
            currentElevatorFloor = floorIndex;
            if (callback) callback();
        }
    }

    requestAnimationFrame(moveStep);
}

// Simulation state machine
function runSimulationSequence() {
    if (isMoving || doorsOpen) {
        // Wait for movement and doors to settle
        setTimeout(runSimulationSequence, 500);
        return;
    }

    // Select a random person to move to empty floor
    const randomPersonIndex = Math.floor(Math.random() * people.length);
    const personToMove = people[randomPersonIndex];

    // Find the empty floor (the one without a person)
    let destinationFloor = -1;
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        let personOnThisFloor = false;
        for (const p of people) {
            const worldPos = new THREE.Vector3();
            p.getWorldPosition(worldPos);
            if (Math.abs(worldPos.y - floorY) < 0.5) {
                personOnThisFloor = true;
                break;
            }
        }
        if (!personOnThisFloor) {
            destinationFloor = i;
            break;
        }
    }

    if (destinationFloor === -1) {
        // No empty floor found, pick random
        destinationFloor = Math.floor(Math.random() * FLOOR_COUNT);
    }

    const pickupFloor = currentElevatorFloor;
    targetFloor = destinationFloor;

    console.log(`Person ${randomPersonIndex} moving from floor ${pickupFloor} to floor ${destinationFloor}`);

    // If elevator is not at the pickup floor, move there first
    if (pickupFloor !== currentElevatorFloor) {
        moveElevatorToFloor(pickupFloor, () => {
            openDoorsAndBoard(personToMove, destinationFloor);
        });
    } else {
        openDoorsAndBoard(personToMove, destinationFloor);
    }
}

function openDoorsAndBoard(person, destinationFloor) {
    // Open doors
    animateDoorsOpen(() => {
        // Person walks into elevator
        const entrancePos = new THREE.Vector3(0, person.position.y, 0.5);
        animatePersonWalk(person, entrancePos, () => {
            // Board the elevator using attach() to preserve world position
            elevatorCar.attach(person);

            // Close doors after brief delay
            setTimeout(() => {
                animateDoorsClose(() => {
                    // Move to destination floor
                    moveElevatorToFloor(destinationFloor, () => {
                        exitPerson(person);
                    });
                });
            }, 300);
        });
    });
}

function exitPerson(person) {
    // Open doors at destination
    animateDoorsOpen(() => {
        // Person walks out to waiting spot
        const exitPos = new THREE.Vector3(0, person.position.y, 3);
        animatePersonWalk(person, exitPos, () => {
            // Exit using attach() to preserve world position
            scene.attach(person);

            // Close doors after brief delay
            setTimeout(() => {
                animateDoorsClose(() => {
                    // Update empty floor tracking
                    const oldFloor = currentElevatorFloor;
                    for (let i = 0; i < FLOOR_COUNT; i++) {
                        const floorY = i * FLOOR_HEIGHT;
                        let personOnThisFloor = false;
                        for (const p of people) {
                            const worldPos = new THREE.Vector3();
                            p.getWorldPosition(worldPos);
                            if (Math.abs(worldPos.y - floorY) < 0.5) {
                                personOnThisFloor = true;
                                break;
                            }
                        }
                        if (!personOnThisFloor) {
                            emptyFloorIndex = i;
                            break;
                        }
                    }

                    // Schedule next simulation cycle
                    setTimeout(runSimulationSequence, 1000);
                });
            }, 300);
        });
    });
}

// Main animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Animate legs when person is walking
    for (const person of people) {
        if (person.userData.isWalking && !isMoving && !doorsOpen) {
            const legAngle = Math.sin(performance.now() * 0.015) * 0.5;
            person.userData.leftLeg.rotation.x = legAngle;
            person.userData.rightLeg.rotation.x = -legAngle;
        } else if (!person.userData.isWalking) {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }

    renderer.render(scene, camera);
}

// Start simulation function (called at bottom of file)
function startSimulation() {
    // Initialize scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    // Initialize camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    // Initialize renderer with transparency settings
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // Critical for transparency sorting
    document.body.appendChild(renderer.domElement);

    // Initialize controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Add lighting
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

    // Start animation loop
    animate();

    // Start simulation sequence after a brief delay
    setTimeout(runSimulationSequence, 2000);
}

// H3: Auto-start on page load - invoke at bottom of file
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
