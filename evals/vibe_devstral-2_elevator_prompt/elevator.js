// Elevator Simulation - Main Logic
// Constants (configurable)
const FLOOR_HEIGHT = 5;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 20;
const SHAFT_WIDTH = 6;
const SHAFT_DEPTH = 6;
const ELEVATOR_SPEED = 2.0; // units per second
const PERSON_MOVE_SPEED = 1.5; // units per second

// Global variables
let scene, camera, renderer, controls;
let building, elevatorCar, floors = [];
let people = [];
let emptyFloor = 0;
let animationSpeed = 1;
let lastTimestamp = 0;
let currentAnimation = null;
let isAnimating = false;

// Initialize the scene
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    
    // Create renderer with transparency settings
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);
    
    // Add OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Create building
    createBuilding();
    
    // Create elevator
    createElevator();
    
    // Create people
    createPeople();
    
    // Setup speed control
    setupSpeedControl();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    lastTimestamp = performance.now();
    animate();
}

// Create the building structure
function createBuilding() {
    building = new THREE.Group();
    building.renderOrder = 0;
    scene.add(building);
    
    // Create floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floor = createFloor(i);
        floors.push(floor);
        building.add(floor);
    }
    
    // Create walls
    createWalls();
    
    // Create ground and roof
    createGroundAndRoof();
}

// Create a single floor
function createFloor(floorNumber) {
    const floorGroup = new THREE.Group();
    
    // Floor surface (transparent)
    const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const floorMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = floorNumber * FLOOR_HEIGHT;
    floorGroup.add(floor);
    
    // Elevator shaft cutout (make floor transparent in shaft area)
    const shaftCutoutGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 0.3, SHAFT_DEPTH);
    const shaftCutoutMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const shaftCutout = new THREE.Mesh(shaftCutoutGeometry, shaftCutoutMaterial);
    shaftCutout.position.set(0, floorNumber * FLOOR_HEIGHT + 0.1, 0);
    floorGroup.add(shaftCutout);
    
    return floorGroup;
}

// Create building walls
function createWalls() {
    const wallMaterial = new THREE.MeshBasicMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Front wall
    const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 0.2);
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2);
    building.add(frontWall);
    
    // Back wall
    const backWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    backWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2);
    building.add(backWall);
    
    // Left wall
    const sideWallGeometry = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    building.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    building.add(rightWall);
}

// Create ground and roof
function createGroundAndRoof() {
    const solidMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        depthWrite: true,
        side: THREE.DoubleSide
    });
    
    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 1, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeometry, solidMaterial);
    ground.position.y = -0.5;
    building.add(ground);
    
    // Roof (solid)
    const roof = new THREE.Mesh(groundGeometry, solidMaterial);
    roof.position.y = FLOOR_HEIGHT * FLOOR_COUNT + 0.5;
    building.add(roof);
}

// Create the elevator car
function createElevator() {
    const elevatorGroup = new THREE.Group();
    elevatorGroup.renderOrder = 1;
    scene.add(elevatorGroup);
    
    // Elevator frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH * 0.8, FLOOR_HEIGHT * 0.9, SHAFT_DEPTH * 0.8);
    const frameMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.y = FLOOR_HEIGHT / 2;
    elevatorGroup.add(frame);
    
    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT * 0.9, SHAFT_DEPTH * 0.8);
    const backWallMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        depthWrite: true,
        side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.set(0, FLOOR_HEIGHT / 2, SHAFT_DEPTH * 0.4);
    elevatorGroup.add(backWall);
    
    // Create doors
    createElevatorDoors(elevatorGroup);
    
    elevatorCar = elevatorGroup;
    elevatorCar.position.y = 0; // Start at ground level
    elevatorCar.currentFloor = 0;
    elevatorCar.isMoving = false;
    elevatorCar.doorsOpen = false;
}

// Create elevator doors
function createElevatorDoors(elevatorGroup) {
    const doorWidth = SHAFT_WIDTH * 0.4 - 0.1; // Half width for each door
    const doorHeight = FLOOR_HEIGHT * 0.8;
    const doorDepth = 0.1;
    
    const doorMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Left door
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    leftDoor.position.set(-doorWidth / 2, FLOOR_HEIGHT / 2, -SHAFT_DEPTH * 0.4);
    elevatorGroup.add(leftDoor);
    
    // Right door
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    rightDoor.position.set(doorWidth / 2, FLOOR_HEIGHT / 2, -SHAFT_DEPTH * 0.4);
    elevatorGroup.add(rightDoor);
    
    // Store door references
    elevatorGroup.leftDoor = leftDoor;
    elevatorGroup.rightDoor = rightDoor;
    elevatorGroup.doorWidth = doorWidth;
}

// Create people for each floor
function createPeople() {
    for (let i = 0; i < FLOOR_COUNT - 1; i++) { // One floor is empty
        const person = createPerson();
        
        // Position person in front of elevator (positive Z-axis)
        const floorY = i * FLOOR_HEIGHT;
        person.position.set(0, floorY + person.totalHeight / 2, SHAFT_DEPTH / 2 + 2);
        
        // Make person face the elevator (rotate 180 degrees)
        person.rotation.y = Math.PI;
        
        scene.add(person);
        people.push({
            object: person,
            currentFloor: i,
            isInElevator: false
        });
    }
    
    // Set initial empty floor
    emptyFloor = FLOOR_COUNT - 1;
}

// Setup speed control slider
function setupSpeedControl() {
    const speedSlider = document.getElementById('animation-speed');
    const speedValue = document.getElementById('speed-value');
    
    speedSlider.addEventListener('input', function() {
        animationSpeed = parseInt(this.value);
        speedValue.textContent = animationSpeed + 'x';
    });
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Main animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const deltaTime = (now - lastTimestamp) * animationSpeed;
    lastTimestamp = now;
    
    // Update person animations
    people.forEach(p => {
        if (p.object && p.object.isWalking) {
            animatePersonWalking(p.object, deltaTime);
        }
    });
    
    // Update controls
    controls.update();
    
    // Render scene
    renderer.render(scene, camera);
}

// Start the simulation
init();

// Animation sequence functions
function startElevatorCycle() {
    if (isAnimating) return;
    
    isAnimating = true;
    
    // Find a person to move
    const availablePeople = people.filter(p => !p.isInElevator);
    if (availablePeople.length === 0) {
        isAnimating = false;
        return;
    }
    
    // Randomly select a person
    const randomIndex = Math.floor(Math.random() * availablePeople.length);
    const personData = availablePeople[randomIndex];
    const person = personData.object;
    
    // Move elevator to pickup floor
    moveElevatorToFloor(personData.currentFloor, () => {
        // Open doors
        openElevatorDoors(() => {
            // Person walks into elevator
            movePersonToElevator(person, personData, () => {
                // Close doors
                closeElevatorDoors(() => {
                    // Move elevator to destination (empty floor)
                    moveElevatorToFloor(emptyFloor, () => {
                        // Open doors
                        openElevatorDoors(() => {
                            // Person walks out of elevator
                            movePersonOutOfElevator(person, personData, () => {
                                // Close doors
                                closeElevatorDoors(() => {
                                    // Update empty floor
                                    emptyFloor = personData.currentFloor;
                                    personData.currentFloor = emptyFloor;
                                    isAnimating = false;
                                    
                                    // Start next cycle after delay
                                    setTimeout(startElevatorCycle, 2000);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// Move elevator to specific floor
function moveElevatorToFloor(targetFloor, callback) {
    const targetY = targetFloor * FLOOR_HEIGHT;
    const distance = Math.abs(elevatorCar.position.y - targetY);
    const duration = distance / ELEVATOR_SPEED * 1000; // in milliseconds
    
    const startTime = performance.now();
    const startY = elevatorCar.position.y;
    
    function updatePosition() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        elevatorCar.position.y = startY + (targetY - startY) * progress;
        
        if (progress < 1) {
            requestAnimationFrame(updatePosition);
        } else {
            elevatorCar.position.y = targetY;
            elevatorCar.currentFloor = targetFloor;
            if (callback) callback();
        }
    }
    
    updatePosition();
}

// Open elevator doors
function openElevatorDoors(callback) {
    if (elevatorCar.doorsOpen) {
        if (callback) callback();
        return;
    }
    
    elevatorCar.doorsOpen = true;
    
    const doorWidth = elevatorCar.doorWidth;
    const startTime = performance.now();
    const duration = 1000; // 1 second
    
    function updateDoors() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Doors retract from center outward
        elevatorCar.leftDoor.position.x = -doorWidth / 2 - doorWidth * progress;
        elevatorCar.rightDoor.position.x = doorWidth / 2 + doorWidth * progress;
        
        if (progress < 1) {
            requestAnimationFrame(updateDoors);
        } else {
            // Doors fully open
            elevatorCar.leftDoor.position.x = -doorWidth / 2 - doorWidth;
            elevatorCar.rightDoor.position.x = doorWidth / 2 + doorWidth;
            
            // Add delay before callback
            setTimeout(() => {
                if (callback) callback();
            }, 300);
        }
    }
    
    updateDoors();
}

// Close elevator doors
function closeElevatorDoors(callback) {
    if (!elevatorCar.doorsOpen) {
        if (callback) callback();
        return;
    }
    
    elevatorCar.doorsOpen = false;
    
    const doorWidth = elevatorCar.doorWidth;
    const startTime = performance.now();
    const duration = 1000; // 1 second
    
    function updateDoors() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Doors meet in the middle when closing
        elevatorCar.leftDoor.position.x = -doorWidth / 2 - doorWidth + doorWidth * progress;
        elevatorCar.rightDoor.position.x = doorWidth / 2 + doorWidth - doorWidth * progress;
        
        if (progress < 1) {
            requestAnimationFrame(updateDoors);
        } else {
            // Doors fully closed
            elevatorCar.leftDoor.position.x = -doorWidth / 2;
            elevatorCar.rightDoor.position.x = doorWidth / 2;
            
            // Add delay before callback
            setTimeout(() => {
                if (callback) callback();
            }, 300);
        }
    }
    
    updateDoors();
}

// Move person into elevator
function movePersonToElevator(person, personData, callback) {
    person.isWalking = true;
    
    // Calculate target position (inside elevator)
    const targetX = 0;
    const targetY = elevatorCar.position.y + person.totalHeight / 2;
    const targetZ = elevatorCar.position.z - SHAFT_DEPTH * 0.2;
    
    const startPosition = person.position.clone();
    const targetPosition = new THREE.Vector3(targetX, targetY, targetZ);
    const distance = startPosition.distanceTo(targetPosition);
    const duration = distance / PERSON_MOVE_SPEED * 1000;
    
    const startTime = performance.now();
    
    function updatePosition() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        person.position.lerpVectors(startPosition, targetPosition, progress);
        
        if (progress < 1) {
            requestAnimationFrame(updatePosition);
        } else {
            person.position.copy(targetPosition);
            person.isWalking = false;
            resetPersonAnimation(person);
            
            // Add person to elevator (parent-child relationship)
            elevatorCar.add(person);
            scene.remove(person);
            personData.isInElevator = true;
            
            if (callback) callback();
        }
    }
    
    updatePosition();
}

// Move person out of elevator
function movePersonOutOfElevator(person, personData, callback) {
    person.isWalking = true;
    
    // Calculate target position (in front of elevator on new floor)
    const targetX = 0;
    const targetY = elevatorCar.position.y + person.totalHeight / 2;
    const targetZ = elevatorCar.position.z + SHAFT_DEPTH / 2 + 2;
    
    const startPosition = person.position.clone();
    const targetPosition = new THREE.Vector3(targetX, targetY, targetZ);
    const distance = startPosition.distanceTo(targetPosition);
    const duration = distance / PERSON_MOVE_SPEED * 1000;
    
    const startTime = performance.now();
    
    function updatePosition() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        person.position.lerpVectors(startPosition, targetPosition, progress);
        
        if (progress < 1) {
            requestAnimationFrame(updatePosition);
        } else {
            person.position.copy(targetPosition);
            person.isWalking = false;
            resetPersonAnimation(person);
            
            // Remove person from elevator and add back to scene
            elevatorCar.remove(person);
            scene.add(person);
            personData.isInElevator = false;
            personData.currentFloor = emptyFloor;
            
            if (callback) callback();
        }
    }
    
    updatePosition();
}

// Start the first cycle after a delay
setTimeout(startElevatorCycle, 2000);