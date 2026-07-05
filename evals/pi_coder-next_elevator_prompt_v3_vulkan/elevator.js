// Constants (H6)
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global variables
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let currentFloor = 0;
let emptyFloor = 5;
let animationSpeed = 1;
let isAnimating = false;

// Door states
const DOOR_CLOSED = 0;
const DOOR_OPENING = 1;
const DOOR_OPEN = 2;
const DOOR_CLOSING = 3;
let doorState = DOOR_CLOSED;

// Animation state
let elevatorFloor = 0;
let targetFloor = 0;

// Door references
let leftDoor, rightDoor;

// Create building
function createBuilding() {
    const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Create floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, floorY, 0);
        floor.renderOrder = 0;
        scene.add(floor);
    }
    
    // Create walls (with shaft cutout)
    const wallThickness = 1;
    const shaftWidth = SHAFT_WIDTH;
    const shaftDepth = SHAFT_DEPTH;
    const centerX = 0;
    const centerZ = 0;
    
    // Calculate shaft position (center of building)
    const shaftHalfW = shaftWidth / 2;
    const shaftHalfD = shaftDepth / 2;
    const buildingHalfW = BUILDING_WIDTH / 2;
    const buildingHalfD = BUILDING_DEPTH / 2;
    
    // Create 4 walls for each floor
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        
        // Front wall (positive Z)
        const frontWall = new THREE.Mesh(
            new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_HEIGHT),
            wallMaterial
        );
        frontWall.position.set(0, floorY + FLOOR_HEIGHT / 2, buildingHalfD - wallThickness / 2);
        frontWall.renderOrder = 0;
        scene.add(frontWall);
        
        // Back wall (negative Z)
        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_HEIGHT),
            wallMaterial
        );
        backWall.rotation.y = Math.PI;
        backWall.position.set(0, floorY + FLOOR_HEIGHT / 2, -buildingHalfD + wallThickness / 2);
        backWall.renderOrder = 0;
        scene.add(backWall);
        
        // Left wall (negative X)
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        leftWall.rotation.x = -Math.PI / 2;
        leftWall.position.set(-buildingHalfW + wallThickness / 2, floorY + FLOOR_HEIGHT / 2, 0);
        leftWall.renderOrder = 0;
        scene.add(leftWall);
        
        // Right wall (positive X)
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        rightWall.rotation.x = -Math.PI / 2;
        rightWall.position.set(buildingHalfW - wallThickness / 2, floorY + FLOOR_HEIGHT / 2, 0);
        rightWall.renderOrder = 0;
        scene.add(rightWall);
    }
    
    // Ground floor (solid)
    const groundGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    scene.add(ground);
    
    // Roof (solid)
    const roofGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
    scene.add(roof);
}

// Create elevator car
function createElevatorCar() {
    const carGroup = new THREE.Group();
    
    // Elevator frame color
    const frameColor = 0xffff00;
    const doorColor = 0xcccc00;
    
    // Main frame (semi-transparent yellow)
    const frameMaterial = new THREE.MeshLambertMaterial({ 
        color: frameColor, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const backMaterial = new THREE.MeshLambertMaterial({ 
        color: frameColor, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const sideMaterial = new THREE.MeshLambertMaterial({ 
        color: frameColor, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const doorMaterial = new THREE.MeshLambertMaterial({ 
        color: doorColor, 
        transparent: true, 
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const carWidth = SHAFT_WIDTH - 0.5;
    const carDepth = SHAFT_DEPTH - 0.5;
    const carHeight = 2;
    
    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carHeight),
        backMaterial
    );
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    carGroup.add(backWall);
    
    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carHeight, carDepth),
        sideMaterial
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    carGroup.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carHeight, carDepth),
        sideMaterial
    );
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    carGroup.add(rightWall);
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(carWidth, carDepth);
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    carGroup.add(floor);
    
    // Create sliding doors
    const doorWidth = (carWidth - 0.2) / 2;
    const doorHeight = carHeight - 0.2;
    
    // Left door
    leftDoor = new THREE.Mesh(
        new THREE.PlaneGeometry(doorWidth, doorHeight),
        doorMaterial
    );
    leftDoor.position.set(-doorWidth / 2, doorHeight / 2, carDepth / 2 - 0.01);
    carGroup.add(leftDoor);
    
    // Right door
    rightDoor = new THREE.Mesh(
        new THREE.PlaneGeometry(doorWidth, doorHeight),
        doorMaterial
    );
    rightDoor.position.set(doorWidth / 2, doorHeight / 2, carDepth / 2 - 0.01);
    carGroup.add(rightDoor);
    
    // Store door references on elevatorCar
    carGroup.leftDoor = leftDoor;
    carGroup.rightDoor = rightDoor;
    
    return carGroup;
}

// Open elevator doors
function openDoors(callback) {
    doorState = DOOR_OPENING;
    const openTime = 0.5 / animationSpeed;
    const startTime = performance.now();
    
    function animateOpen(currentTime) {
        const elapsed = (currentTime - startTime) / openTime;
        if (elapsed >= 1) {
            // Doors fully open
            leftDoor.position.x = -1.2;
            rightDoor.position.x = 1.2;
            doorState = DOOR_OPEN;
            callback();
            return;
        }
        
        const progress = elapsed;
        leftDoor.position.x = -progress * 1.2;
        rightDoor.position.x = progress * 1.2;
        
        requestAnimationFrame(animateOpen);
    }
    
    requestAnimationFrame(animateOpen);
}

// Close elevator doors
function closeDoors(callback) {
    doorState = DOOR_CLOSING;
    const closeTime = 0.5 / animationSpeed;
    const startTime = performance.now();
    
    function animateClose(currentTime) {
        const elapsed = (currentTime - startTime) / closeTime;
        if (elapsed >= 1) {
            // Doors fully closed
            leftDoor.position.x = -0.55;
            rightDoor.position.x = 0.55;
            doorState = DOOR_CLOSED;
            callback();
            return;
        }
        
        const progress = 1 - elapsed;
        leftDoor.position.x = -progress * 1.2;
        rightDoor.position.x = progress * 1.2;
        
        requestAnimationFrame(animateClose);
    }
    
    requestAnimationFrame(animateClose);
}

// Move elevator
function moveElevator(toFloor, callback) {
    targetFloor = toFloor;
    const distance = Math.abs(targetFloor - elevatorFloor);
    const moveTime = (distance * FLOOR_HEIGHT / ELEVATOR_SPEED) / animationSpeed;
    const startTime = performance.now();
    const startPos = elevatorFloor * FLOOR_HEIGHT;
    
    function animateMove(currentTime) {
        const elapsed = (currentTime - startTime) / moveTime;
        if (elapsed >= 1) {
            elevatorFloor = targetFloor;
            elevatorCar.position.y = targetFloor * FLOOR_HEIGHT;
            isAnimating = false;
            callback();
            return;
        }
        
        const progress = elapsed;
        elevatorCar.position.y = startPos + progress * (targetFloor - elevatorFloor) * FLOOR_HEIGHT;
        
        requestAnimationFrame(animateMove);
    }
    
    isAnimating = true;
    requestAnimationFrame(animateMove);
}

// Animate person walking
function animatePersonWalking(person, duration, callback) {
    person.userData.isWalking = true;
    const startTime = performance.now();
    
    function animateWalk(currentTime) {
        const elapsed = (currentTime - startTime) / (duration / animationSpeed);
        if (elapsed >= 1) {
            person.userData.isWalking = false;
            // Reset legs to standing position
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
            callback();
            return;
        }
        
        const progress = elapsed;
        // Sine wave for leg animation
        const legSwing = Math.sin(progress * Math.PI * 2) * 0.6;
        person.userData.leftLeg.rotation.x = legSwing;
        person.userData.rightLeg.rotation.x = -legSwing;
        
        requestAnimationFrame(animateWalk);
    }
    
    requestAnimationFrame(animateWalk);
}

// Board person into elevator
function boardPerson(person, floor, callback) {
    // Position person in front of elevator (positive Z)
    const boardPos = new THREE.Vector3(0, floor * FLOOR_HEIGHT, 3);
    person.position.copy(boardPos);
    person.rotation.y = Math.PI; // Face elevator
    
    scene.add(person);
    
    // Calculate walk distance and time
    const walkDistance = 2; // Distance from waiting spot to elevator center
    const walkTime = walkDistance / PERSON_MOVE_SPEED;
    
    // Animate walking to elevator
    animatePersonWalking(person, walkTime, () => {
        // Person has reached elevator, board using attach()
        elevatorCar.attach(person);
        
        // Wait briefly before closing doors
        setTimeout(() => {
            callback();
        }, 300 / animationSpeed);
    });
}

// Exit person from elevator
function exitPerson(person, floor, callback) {
    // Calculate walk distance and time
    const walkDistance = 2; // Distance from elevator center to waiting spot
    const walkTime = walkDistance / PERSON_MOVE_SPEED;
    
    // Animate walking out of elevator
    animatePersonWalking(person, walkTime, () => {
        // Person has walked out, exit using attach()
        scene.attach(person);
        
        // Wait briefly before closing doors
        setTimeout(() => {
            callback();
        }, 300 / animationSpeed);
    });
}

// Create people on floors
function createPeople() {
    // Create 5 people on 5 floors (one floor is empty)
    const occupiedFloors = [0, 1, 2, 3, 4];
    emptyFloor = 5;
    
    for (let i = 0; i < occupiedFloors.length; i++) {
        const floor = occupiedFloors[i];
        const person = createPerson();
        
        // Position person in front of elevator
        person.position.set(0, floor * FLOOR_HEIGHT, 3);
        person.rotation.y = Math.PI; // Face elevator
        
        scene.add(person);
        people.push({ person: person, floor: floor, state: 'waiting' });
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    if (controls) {
        controls.update();
    }
    
    // Render
    if (scene && renderer) {
        renderer.render(scene, camera);
    }
}

// Main simulation function
function startSimulation() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    // Create controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    
    // Add lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    
    // Create building
    createBuilding();
    
    // Create elevator
    elevatorCar = createElevatorCar();
    elevatorCar.position.y = 0;
    scene.add(elevatorCar);
    
    // Create people
    createPeople();
    
    // Set up speed slider
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    
    speedSlider.addEventListener('input', (event) => {
        animationSpeed = parseInt(event.target.value);
        speedValue.textContent = animationSpeed + 'x';
    });
    
    // Start simulation loop
    animate();
    
    // Start the elevator sequence
    runElevatorSequence();
}

// Elevator sequence
function runElevatorSequence() {
    // Wait a moment, then start the simulation
    setTimeout(() => {
        processNextPerson();
    }, 1000);
}

// Process next person in the queue
function processNextPerson() {
    if (people.length === 0) return;
    
    // Find a person waiting on a non-empty floor
    const waitingPersonIndex = people.findIndex(p => p.state === 'waiting');
    if (waitingPersonIndex === -1) {
        // Everyone is on elevator, wait for someone to exit
        setTimeout(processNextPerson, 100);
        return;
    }
    
    const personObj = people[waitingPersonIndex];
    const person = personObj.person;
    const currentFloor = personObj.floor;
    
    // Determine destination (empty floor)
    const destinationFloor = emptyFloor;
    
    // Move elevator to pickup floor
    moveElevator(currentFloor, () => {
        // Open doors
        openDoors(() => {
            // Wait briefly for doors to open
            setTimeout(() => {
                // Board person
                boardPerson(person, currentFloor, () => {
                    // Close doors
                    closeDoors(() => {
                        // Move to destination
                        moveElevator(destinationFloor, () => {
                            // Open doors at destination
                            openDoors(() => {
                                // Wait briefly
                                setTimeout(() => {
                                    // Exit person
                                    exitPerson(person, destinationFloor, () => {
                                        // Close doors
                                        closeDoors(() => {
                                            // Update person state
                                            personObj.floor = destinationFloor;
                                            personObj.state = 'waiting';
                                            
                                            // Update empty floor
                                            const prevEmptyFloor = emptyFloor;
                                            emptyFloor = currentFloor;
                                            
                                            // Schedule next person
                                            setTimeout(processNextPerson, 500);
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            }, 300);
        });
    });
}

// Handle window resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Start simulation on DOM ready
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
