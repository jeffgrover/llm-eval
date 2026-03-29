// elevator.js - Main simulation logic

// Constants (configurable)
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 8;
const ELEVATOR_SPEED = 0.1;
let PERSON_MOVE_SPEED = 0.1;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(25, 25, 25);
camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

// Renderer with transparency support
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.alpha = true;
renderer.sortObjects = true;
document.body.appendChild(renderer.domElement);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Create building floors and walls
function createBuilding() {
    const buildingGroup = new THREE.Group();
    
    // Create ground floor (solid)
    const groundFloor = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, BUILDING_DEPTH, FLOOR_HEIGHT),
        new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            transparent: false,
            side: THREE.DoubleSide
        })
    );
    groundFloor.position.y = FLOOR_HEIGHT / 2;
    buildingGroup.add(groundFloor);
    
    // Create upper floors (transparent)
    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const floorY = FLOOR_HEIGHT * (i + 0.5);
        
        // Floor surface
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, BUILDING_DEPTH, FLOOR_HEIGHT),
            new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        floor.position.y = floorY;
        floor.renderOrder = 0;
        buildingGroup.add(floor);
    }
    
    // Create roof (solid)
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, BUILDING_DEPTH, FLOOR_HEIGHT),
        new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            transparent: false,
            side: THREE.DoubleSide
        })
    );
    roof.position.y = FLOOR_HEIGHT * (FLOOR_COUNT - 0.5);
    buildingGroup.add(roof);
    
    // Create walls (semi-transparent)
    const wallThickness = 1;
    
    // Front wall
    const frontWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, wallThickness, FLOOR_HEIGHT * FLOOR_COUNT),
        new THREE.MeshStandardMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    frontWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2 - wallThickness / 2);
    buildingGroup.add(frontWall);
    
    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, wallThickness, FLOOR_HEIGHT * FLOOR_COUNT),
        new THREE.MeshStandardMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    backWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2 + wallThickness / 2);
    buildingGroup.add(backWall);
    
    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, BUILDING_DEPTH, FLOOR_HEIGHT * FLOOR_COUNT),
        new THREE.MeshStandardMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    leftWall.position.set(-BUILDING_WIDTH / 2 - wallThickness / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, BUILDING_DEPTH, FLOOR_HEIGHT * FLOOR_COUNT),
        new THREE.MeshStandardMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    rightWall.position.set(BUILDING_WIDTH / 2 + wallThickness / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(rightWall);
    
    // Create elevator shaft cutout
    const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH, SHAFT_DEPTH, FLOOR_HEIGHT * FLOOR_COUNT),
        new THREE.MeshStandardMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0
        })
    );
    shaft.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(shaft);
    
    return buildingGroup;
}

// Create elevator car
function createElevatorCar() {
    const group = new THREE.Group();
    
    // Elevator dimensions
    const width = SHAFT_WIDTH - 1;
    const depth = SHAFT_DEPTH - 1;
    const height = FLOOR_HEIGHT - 0.5;
    
    // Frame (semi-transparent yellow)
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(width, depth, height),
        new THREE.MeshStandardMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    frame.position.y = height / 2;
    group.add(frame);
    
    // Back wall (solid, not transparent)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.5, height),
        new THREE.MeshStandardMaterial({
            color: 0xffff00,
            transparent: false,
            side: THREE.DoubleSide
        })
    );
    backWall.position.set(0, height / 2, -depth / 2 + 0.25);
    group.add(backWall);
    
    // Left side wall (transparent)
    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, depth - 1, height),
        new THREE.MeshStandardMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    leftWall.position.set(-width / 2 + 0.15, height / 2, 0);
    group.add(leftWall);
    
    // Right side wall (transparent)
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, depth - 1, height),
        new THREE.MeshStandardMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    rightWall.position.set(width / 2 - 0.15, height / 2, 0);
    group.add(rightWall);
    
    // Door frame (front opening)
    const doorFrameHeight = height * 0.8;
    const doorFrameWidth = 0.3;
    const doorFrameDepth = 0.5;
    
    const doorTop = new THREE.Mesh(
        new THREE.BoxGeometry(width, doorFrameDepth, doorFrameHeight),
        new THREE.MeshStandardMaterial({
            color: 0xcccc00,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    doorTop.position.set(0, height - doorFrameHeight / 2, -depth / 2 + doorFrameDepth / 2);
    group.add(doorTop);
    
    // Create doors (left and right halves)
    const doorWidth = width / 2 - 0.5;
    const doorHeight = doorFrameHeight * 0.9;
    const doorThickness = 0.3;
    
    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorThickness, doorHeight),
        new THREE.MeshStandardMaterial({
            color: 0xcccc00,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    leftDoor.position.set(-doorWidth / 2, height / 2, -depth / 2 + doorFrameDepth);
    group.add(leftDoor);
    
    const rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorThickness, doorHeight),
        new THREE.MeshStandardMaterial({
            color: 0xcccc00,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    rightDoor.position.set(doorWidth / 2, height / 2, -depth / 2 + doorFrameDepth);
    group.add(rightDoor);
    
    // Store references for animation
    group.leftDoor = leftDoor;
    group.rightDoor = rightDoor;
    group.doorState = 'closed'; // 'open' or 'closed'
    
    return group;
}

// Animation state
let currentFloor = 0;
let targetFloor = 0;
let isMoving = false;
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
const people = [];

// Create simulation
function initSimulation() {
    // Create building
    const building = createBuilding();
    scene.add(building);
    
    // Create elevator car positioned at ground floor
    const elevatorCar = createElevatorCar();
    elevatorCar.position.y = FLOOR_HEIGHT / 2;
    scene.add(elevatorCar);
    
    // Create people on each floor (except one empty floor)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson();
            person.position.set(0, FLOOR_HEIGHT / 2 + 1.5, BUILDING_DEPTH / 2 - 3); // In front of elevator
            person.rotation.y = Math.PI; // Face the elevator (180 degrees)
            scene.add(person);
            people.push({ floor: i, person: person });
        }
    }
    
    // Add speed control slider
    const speedControl = document.createElement('div');
    speedControl.id = 'speed-control';
    speedControl.innerHTML = `
        <label for="animationSpeed">Animation Speed:</label>
        <input type="range" id="animationSpeed" min="1" max="20" value="5" style="width: 200px;">
        <span id="speedValue">5x</span>
    `;
    document.body.appendChild(speedControl);
    
    const speedSlider = document.getElementById('animationSpeed');
    const speedValue = document.getElementById('speedValue');
    
    speedSlider.addEventListener('input', function() {
        const speed = parseInt(this.value);
        PERSON_MOVE_SPEED = 0.1 * (speed / 5); // Base speed is 0.1, scaled by slider
        speedValue.textContent = `${speed}x`;
    });
    
    // Start animation loop
    animate();
}

// Animate doors opening
function openDoors(elevatorCar, callback) {
    if (elevatorCar.doorState === 'open') {
        callback();
        return;
    }
    
    elevatorCar.doorState = 'opening';
    
    const animationDuration = 0.5; // seconds
    const startTime = Date.now();
    
    function update() {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // Move doors outward from center
        const doorWidth = elevatorCar.leftDoor.geometry.parameters.width;
        const maxOffset = doorWidth * 2;
        
        if (progress < 1) {
            elevatorCar.leftDoor.position.x = -maxOffset / 2 + maxOffset / 2 * progress;
            elevatorCar.rightDoor.position.x = maxOffset / 2 - maxOffset / 2 * progress;
            requestAnimationFrame(update);
        } else {
            elevatorCar.doorState = 'open';
            callback();
        }
    }
    
    update();
}

// Animate doors closing
function closeDoors(elevatorCar, callback) {
    if (elevatorCar.doorState === 'closed') {
        callback();
        return;
    }
    
    elevatorCar.doorState = 'closing';
    
    const animationDuration = 0.5; // seconds
    const startTime = Date.now();
    
    function update() {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // Move doors inward to center
        const doorWidth = elevatorCar.leftDoor.geometry.parameters.width;
        const maxOffset = doorWidth * 2;
        
        if (progress < 1) {
            elevatorCar.leftDoor.position.x = -maxOffset / 2 + maxOffset / 2 * progress;
            elevatorCar.rightDoor.position.x = maxOffset / 2 - maxOffset / 2 * progress;
            requestAnimationFrame(update);
        } else {
            elevatorCar.doorState = 'closed';
            callback();
        }
    }
    
    update();
}

// Animate person walking
function animatePersonWalking(person, startPos, endPos, direction, callback) {
    const distance = Math.abs(endPos.z - startPos.z);
    let elapsed = 0;
    let legPhase = 0;
    
    function update() {
        if (elapsed >= distance / PERSON_MOVE_SPEED) {
            person.position.copy(endPos);
            // Reset legs to standing position
            person.legs.rotation.x = 0;
            callback();
            return;
        }
        
        elapsed += 0.016; // ~60fps
        const progress = Math.min(elapsed / (distance / PERSON_MOVE_SPEED), 1);
        person.position.z = startPos.z + direction * distance * progress;
        
        // Animate legs with sine wave
        legPhase += 0.3;
        const legRotation = Math.sin(legPhase) * 0.2; // Small rotation for walking
        person.legs.rotation.x = legRotation;
        
        requestAnimationFrame(update);
    }
    
    update();
}

// Move elevator to target floor
function moveElevator(elevatorCar, targetY, callback) {
    isMoving = true;
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    
    function update() {
        if (Math.abs(elevatorCar.position.y - targetY) < 0.01) {
            elevatorCar.position.y = targetY;
            isMoving = false;
            callback();
            return;
        }
        
        const direction = targetY > startY ? 1 : -1;
        elevatorCar.position.y += ELEVATOR_SPEED * direction;
        requestAnimationFrame(update);
    }
    
    update();
}

// Complete animation cycle
function runElevatorCycle() {
    if (isMoving) return;
    
    // Find a person to move
    const availablePeople = people.filter(p => p.floor !== emptyFloor);
    if (availablePeople.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * availablePeople.length);
    const personData = availablePeople[randomIndex];
    targetFloor = personData.floor;
    
    // Get elevator and person references
    const elevatorCar = scene.children.find(child => child.leftDoor !== undefined);
    if (!elevatorCar) return;
    
    // Move to pickup floor
    moveElevator(elevatorCar, FLOOR_HEIGHT / 2 + targetFloor * FLOOR_HEIGHT, () => {
        // Open doors
        openDoors(elevatorCar, () => {
            // Person walks into elevator
            const startPos = personData.person.position.clone();
            const endPos = new THREE.Vector3(0, FLOOR_HEIGHT / 2 + targetFloor * FLOOR_HEIGHT - 1.5, BUILDING_DEPTH / 2 - 4);
            
            animatePersonWalking(personData.person, startPos, endPos, 1, () => {
                // Person becomes child of elevator
                elevatorCar.add(personData.person);
                personData.person.position.set(0, -1.5, BUILDING_DEPTH / 2 - 4);
                
                // Close doors after delay
                setTimeout(() => {
                    closeDoors(elevatorCar, () => {
                        // Move to destination floor (random empty floor)
                        const newEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
                        while (newEmptyFloor === emptyFloor || newEmptyFloor === targetFloor) {
                            newEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
                        }
                        
                        moveElevator(elevatorCar, FLOOR_HEIGHT / 2 + newEmptyFloor * FLOOR_HEIGHT, () => {
                            emptyFloor = newEmptyFloor;
                            
                            // Open doors
                            openDoors(elevatorCar, () => {
                                // Person walks out of elevator
                                const startPosOut = personData.person.position.clone();
                                const endPosOut = new THREE.Vector3(0, FLOOR_HEIGHT / 2 + newEmptyFloor * FLOOR_HEIGHT - 1.5, BUILDING_DEPTH / 2 - 4);
                                
                                animatePersonWalking(personData.person, startPosOut, endPosOut, 1, () => {
                                    // Person returns to scene
                                    scene.add(personData.person);
                                    personData.person.position.set(0, FLOOR_HEIGHT / 2 + newEmptyFloor * FLOOR_HEIGHT - 1.5, BUILDING_DEPTH / 2 - 3);
                                    personData.person.rotation.y = Math.PI;
                                    
                                    // Update person data
                                    personData.floor = newEmptyFloor;
                                    
                                    // Close doors after delay
                                    setTimeout(() => {
                                        closeDoors(elevatorCar, () => {
                                            // Start next cycle
                                            runElevatorCycle();
                                        });
                                    }, 300);
                                });
                            });
                        });
                    });
                }, 300);
            });
        });
    });
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the simulation when everything loads
window.onload = initSimulation;
