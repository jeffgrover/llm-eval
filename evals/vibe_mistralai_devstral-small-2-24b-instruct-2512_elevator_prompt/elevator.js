// Elevator Simulation - Main Logic

// Constants (configurable)
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 8;
const ELEVATOR_SPEED = 0.1;
const PERSON_MOVE_SPEED = 0.05;

// Animation speed control
let animationSpeed = 1;

// Initialize scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(25, 25, 25);
camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Enable transparency and sorting
renderer.alpha = true;
renderer.sortObjects = true;

// Add orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Create building with floors and walls
function createBuilding() {
    const building = new THREE.Group();
    
    // Create ground floor (solid)
    const groundFloorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const groundFloorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccccc,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    const groundFloor = new THREE.Mesh(groundFloorGeometry, groundFloorMaterial);
    groundFloor.position.y = FLOOR_HEIGHT / 2;
    building.add(groundFloor);
    
    // Create upper floors (transparent)
    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = FLOOR_HEIGHT * i + FLOOR_HEIGHT / 2;
        
        // Create shaft cutout (hole in the middle)
        const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 0.9, SHAFT_DEPTH);
        const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Invisible material
        shaftMaterial.visible = false;
        const shaftCutout = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaftCutout.position.y = FLOOR_HEIGHT * i + FLOOR_HEIGHT / 2;
        floor.add(shaftCutout);
        
        building.add(floor);
    }
    
    // Create roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccccc,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 1) + FLOOR_HEIGHT / 2;
    building.add(roof);
    
    // Create walls
    const wallThickness = 0.5;
    const wallHeight = FLOOR_HEIGHT * FLOOR_COUNT;
    
    // Front wall (positive Z)
    const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH + wallThickness, wallHeight, wallThickness);
    const frontWallMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const frontWall = new THREE.Mesh(frontWallGeometry, frontWallMaterial);
    frontWall.position.set(0, wallHeight / 2, -BUILDING_DEPTH / 2 - wallThickness / 2);
    building.add(frontWall);
    
    // Back wall (negative Z)
    const backWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH + wallThickness, wallHeight, wallThickness);
    const backWallMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.set(0, wallHeight / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
    building.add(backWall);
    
    // Left wall (negative X)
    const leftWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, BUILDING_DEPTH + wallThickness);
    const leftWallMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const leftWall = new THREE.Mesh(leftWallGeometry, leftWallMaterial);
    leftWall.position.set(-BUILDING_WIDTH / 2 - wallThickness / 2, wallHeight / 2, 0);
    building.add(leftWall);
    
    // Right wall (positive X)
    const rightWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, BUILDING_DEPTH + wallThickness);
    const rightWallMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const rightWall = new THREE.Mesh(rightWallGeometry, rightWallMaterial);
    rightWall.position.set(BUILDING_WIDTH / 2 + wallThickness / 2, wallHeight / 2, 0);
    building.add(rightWall);
    
    // Set render order
    building.renderOrder = 0;
    
    return building;
}

// Create elevator car with doors
function createElevatorCar() {
    const elevatorCar = new THREE.Group();
    
    // Elevator dimensions
    const carWidth = SHAFT_WIDTH - 1;
    const carDepth = SHAFT_DEPTH - 1;
    const carHeight = FLOOR_HEIGHT * 0.8;
    
    // Frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(carWidth, carHeight, carDepth);
    const frameMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorCar.add(frame);
    
    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(carWidth * 0.95, carHeight * 0.95, 0.2);
    const backWallMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = carDepth / 2 - 0.1;
    elevatorCar.add(backWall);
    
    // Side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(carWidth * 0.95, carHeight * 0.95, 0.2);
    const sideWallMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
    });
    
    // Left side wall
    const leftSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    leftSideWall.position.x = -carWidth / 2 + 0.1;
    elevatorCar.add(leftSideWall);
    
    // Right side wall
    const rightSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    rightSideWall.position.x = carWidth / 2 - 0.1;
    elevatorCar.add(rightSideWall);
    
    // Create doors (split into left and right halves)
    const doorHeight = carHeight * 0.7;
    const doorThickness = 0.3;
    
    const leftDoorGeometry = new THREE.BoxGeometry(carWidth / 2, doorHeight, doorThickness);
    const leftDoorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
    });
    const leftDoor = new THREE.Mesh(leftDoorGeometry, leftDoorMaterial);
    leftDoor.position.x = -carWidth / 4;
    leftDoor.position.z = carDepth / 2 - doorThickness / 2;
    elevatorCar.add(leftDoor);
    
    const rightDoorGeometry = new THREE.BoxGeometry(carWidth / 2, doorHeight, doorThickness);
    const rightDoorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
    });
    const rightDoor = new THREE.Mesh(rightDoorGeometry, rightDoorMaterial);
    rightDoor.position.x = carWidth / 4;
    rightDoor.position.z = carDepth / 2 - doorThickness / 2;
    elevatorCar.add(rightDoor);
    
    // Store door references for animation
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;
    elevatorCar.doorsOpen = false;
    
    // Set render order
    elevatorCar.renderOrder = 1;
    
    return elevatorCar;
}

// Animation state
let currentFloor = 0;
let targetFloor = 0;
let isMoving = false;
let doorsAnimating = false;
let personBoarding = null;
let personExiting = null;

// Create people on each floor (except one empty floor)
const people = [];
const emptyFloors = [Math.floor(Math.random() * FLOOR_COUNT)]; // Start with one random empty floor

for (let i = 0; i < FLOOR_COUNT - 1; i++) {
    const person = createPerson();
    const floorY = FLOOR_HEIGHT * i + FLOOR_HEIGHT / 2;
    
    // Position in front of elevator (positive Z)
    person.position.set(0, floorY, BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2 - 3);
    
    // Face the elevator (rotate 180 degrees on Y axis)
    person.rotation.y = Math.PI;
    
    people.push({ person, floor: i });
}

// Add all objects to scene
const building = createBuilding();
scene.add(building);

const elevatorCar = createElevatorCar();
elevatorCar.position.set(0, FLOOR_HEIGHT / 2, 0); // Start at ground floor
scene.add(elevatorCar);

people.forEach(p => scene.add(p.person));

// Door animation
function animateDoors(open, onComplete) {
    if (doorsAnimating) return;
    
    doorsAnimating = true;
    const startTime = Date.now();
    const duration = 500; // 500ms for door animation
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (open) {
            // Open doors: move left door to the left, right door to the right
            elevatorCar.leftDoor.position.x = THREE.Math.lerp(-elevatorCar.leftDoor.position.x, -SHAFT_WIDTH / 2 + 1, progress);
            elevatorCar.rightDoor.position.x = THREE.Math.lerp(elevatorCar.rightDoor.position.x, SHAFT_WIDTH / 2 - 1, progress);
        } else {
            // Close doors: move back to center
            elevatorCar.leftDoor.position.x = THREE.Math.lerp(elevatorCar.leftDoor.position.x, -SHAFT_WIDTH / 4, progress);
            elevatorCar.rightDoor.position.x = THREE.Math.lerp(elevatorCar.rightDoor.position.x, SHAFT_WIDTH / 4, progress);
        }
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.doorsOpen = open;
            doorsAnimating = false;
            if (onComplete) onComplete();
        }
    }
    
    update();
}

// Person walking animation
function animatePersonWalking(person, startPos, endPos, direction, onComplete) {
    const startTime = Date.now();
    const distance = Math.abs(endPos.z - startPos.z);
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed / (distance / PERSON_MOVE_SPEED)) * animationSpeed;
        
        if (progress >= 1) {
            person.position.copy(endPos);
            // Reset legs to standing position
            person.legs.rotation.x = Math.PI / 2;
            if (onComplete) onComplete();
            return;
        }
        
        // Interpolate position
        person.position.z = THREE.Math.lerp(startPos.z, endPos.z, progress);
        
        // Animate legs with sine wave for walking motion
        const legSwing = Math.sin(elapsed * 0.01) * 0.3;
        person.legs.rotation.x = Math.PI / 2 + legSwing;
        
        requestAnimationFrame(update);
    }
    
    update();
}

// Move elevator to target floor
function moveElevator(toFloor, onComplete) {
    if (isMoving) return;
    
    isMoving = true;
    const startTime = Date.now();
    const startY = elevatorCar.position.y;
    const endY = FLOOR_HEIGHT * toFloor + FLOOR_HEIGHT / 2;
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / (Math.abs(endY - startY) / ELEVATOR_SPEED), 1);
        
        elevatorCar.position.y = THREE.Math.lerp(startY, endY, progress);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            currentFloor = toFloor;
            isMoving = false;
            if (onComplete) onComplete();
        }
    }
    
    update();
}

// Board person onto elevator
function boardPerson(person, floor) {
    const startPos = person.position.clone();
    const endPos = new THREE.Vector3(0, FLOOR_HEIGHT * floor + FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2 - 1); // Inside elevator
    
    animatePersonWalking(person, startPos, endPos, 'forward', () => {
        // Add person to elevator (make it a child)
        scene.remove(person);
        elevatorCar.add(person);
        
        // Reset position relative to elevator
        person.position.set(0, 0, SHAFT_DEPTH / 2 - 1);
    });
}

// Exit person from elevator
function exitPerson(person, floor) {
    const startPos = new THREE.Vector3(0, 0, SHAFT_DEPTH / 2 - 1); // Inside elevator
    const endPos = new THREE.Vector3(0, FLOOR_HEIGHT * floor + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2 - 3);
    
    animatePersonWalking(person, startPos, endPos, 'forward', () => {
        // Remove person from elevator and add back to scene
        elevatorCar.remove(person);
        scene.add(person);
    });
}

// Complete animation cycle
function runAnimationCycle() {
    if (isMoving || doorsAnimating) return;
    
    // Find empty floor
    let emptyFloor = emptyFloors[0];
    
    // Find person to move (random person not on empty floor)
    const availablePeople = people.filter(p => p.floor !== emptyFloor);
    if (availablePeople.length === 0) return;
    
    const personToMove = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    const fromFloor = personToMove.floor;
    
    // Animation sequence:
    // 1. Move elevator to pickup floor
    moveElevator(fromFloor, () => {
        // 2. Open doors
        animateDoors(true, () => {
            // 3. Person walks into elevator
            boardPerson(personToMove.person, fromFloor);
            
            // Wait for boarding to complete before closing doors
            setTimeout(() => {
                animateDoors(false, () => {
                    // 4. Move elevator to destination floor (empty floor)
                    moveElevator(emptyFloor, () => {
                        // 5. Open doors at destination
                        animateDoors(true, () => {
                            // 6. Person walks out of elevator
                            exitPerson(personToMove.person, emptyFloor);
                            
                            // Wait for exiting to complete before closing doors
                            setTimeout(() => {
                                animateDoors(false, () => {
                                    // Update empty floor
                                    emptyFloors[0] = fromFloor;
                                    personToMove.floor = emptyFloor;
                                    
                                    // Schedule next cycle
                                    setTimeout(runAnimationCycle, 1000);
                                });
                            }, 300);
                        });
                    });
                });
            }, 300);
        });
    });
}

// Start first animation cycle after a delay
setTimeout(runAnimationCycle, 1000);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});