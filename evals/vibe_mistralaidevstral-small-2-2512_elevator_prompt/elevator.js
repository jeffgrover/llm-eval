// Configuration constants
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 20;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 4;
const ELEVATOR_SPEED = 0.1;
const PERSON_MOVE_SPEED = 0.05;

// Global variables
let scene, camera, renderer, controls;
let building, elevatorCar;
let people = [];
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
let animationSpeed = 1;

// Initialize the simulation
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    
    // Create renderer with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    // Create OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Create building and elevator
    createBuilding();
    createElevator();
    
    // Create people on each floor (except empty floor)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson();
            positionPersonOnFloor(person, i);
            scene.add(person);
            people.push({ person: person, floor: i });
        }
    }
    
    // Setup speed control
    setupSpeedControl();
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start the elevator cycle after a brief delay
    setTimeout(startElevatorCycle, 1000);
}

// Create the building structure
function createBuilding() {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    
    // Create ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT / 2, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: false
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = FLOOR_HEIGHT / 4;
    buildingGroup.add(ground);
    
    // Create floors (transparent)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT / 2, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT;
        buildingGroup.add(floor);
    }
    
    // Create walls (semi-transparent)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const wallHeight = i === 0 || i === FLOOR_COUNT - 1 ? FLOOR_HEIGHT / 2 : FLOOR_HEIGHT;
        
        // Front wall
        const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.5);
        const frontWallMaterial = new THREE.MeshStandardMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const frontWall = new THREE.Mesh(frontWallGeometry, frontWallMaterial);
        frontWall.position.set(0, FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT - wallHeight / 2, -BUILDING_DEPTH / 2 - 0.25);
        buildingGroup.add(frontWall);
        
        // Back wall
        const backWall = new THREE.Mesh(frontWallGeometry, frontWallMaterial);
        backWall.position.set(0, FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT - wallHeight / 2, BUILDING_DEPTH / 2 + 0.25);
        buildingGroup.add(backWall);
        
        // Left wall
        const leftWallGeometry = new THREE.BoxGeometry(0.5, wallHeight, BUILDING_DEPTH);
        const leftWall = new THREE.Mesh(leftWallGeometry, frontWallMaterial);
        leftWall.position.set(-BUILDING_WIDTH / 2 - 0.25, FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT - wallHeight / 2, 0);
        buildingGroup.add(leftWall);
        
        // Right wall
        const rightWall = new THREE.Mesh(leftWallGeometry, frontWallMaterial);
        rightWall.position.set(BUILDING_WIDTH / 2 + 0.25, FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT - wallHeight / 2, 0);
        buildingGroup.add(rightWall);
    }
    
    // Create elevator shaft cutout
    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT / 2, SHAFT_DEPTH);
        const shaftMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaft.position.y = FLOOR_HEIGHT / 4 + i * FLOOR_HEIGHT;
        buildingGroup.add(shaft);
    }
    
    scene.add(buildingGroup);
}

// Create the elevator car
function createElevator() {
    const elevatorGroup = new THREE.Group();
    elevatorGroup.renderOrder = 1;
    
    // Elevator frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT / 2 + 0.5, SHAFT_DEPTH);
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorGroup.add(frame);
    
    // Elevator back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, FLOOR_HEIGHT / 2 + 0.3, 0.2);
    const backWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = -SHAFT_DEPTH / 2 + 0.1;
    elevatorGroup.add(backWall);
    
    // Elevator side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT / 2 + 0.3, SHAFT_DEPTH - 0.4);
    const sideWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Left side wall
    const leftSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    leftSideWall.position.x = -SHAFT_WIDTH / 2 + 0.1;
    elevatorGroup.add(leftSideWall);
    
    // Right side wall
    const rightSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    rightSideWall.position.x = SHAFT_WIDTH / 2 - 0.1;
    elevatorGroup.add(rightSideWall);
    
    // Elevator doors (split into left and right halves)
    const doorHeight = FLOOR_HEIGHT / 2 + 0.3;
    const doorWidth = SHAFT_WIDTH / 2 - 0.1;
    const doorDepth = 0.2;
    
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    // Left door (starts at center, moves left when opening)
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-SHAFT_WIDTH / 4 + 0.1, 0, -SHAFT_DEPTH / 2 + 0.15);
    elevatorGroup.add(leftDoor);
    
    // Right door (starts at center, moves right when opening)
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(SHAFT_WIDTH / 4 - 0.1, 0, -SHAFT_DEPTH / 2 + 0.15);
    elevatorGroup.add(rightDoor);
    
    // Store door references for animation
    elevatorGroup.leftDoor = leftDoor;
    elevatorGroup.rightDoor = rightDoor;
    elevatorGroup.doorState = 'closed'; // 'closed', 'opening', 'open', 'closing'
    
    // Position elevator at ground floor
    elevatorGroup.position.y = FLOOR_HEIGHT / 4 + 0.25;
    scene.add(elevatorGroup);
    
    elevatorCar = elevatorGroup;
}

// Position a person on a specific floor, facing the elevator
function positionPersonOnFloor(person, floorIndex) {
    const yPos = FLOOR_HEIGHT / 4 + floorIndex * FLOOR_HEIGHT;
    person.position.set(0, yPos, -BUILDING_DEPTH / 2 + 3); // In front of building
    person.rotation.y = Math.PI; // Face the elevator (180 degrees)
}

// Setup speed control slider
function setupSpeedControl() {
    const slider = document.getElementById('speedSlider');
    const valueDisplay = document.getElementById('speedValue');
    
    slider.addEventListener('input', function() {
        animationSpeed = parseInt(this.value);
        valueDisplay.textContent = this.value + 'x';
    });
}

// Move elevator to a specific floor
function moveElevatorToFloor(targetFloor, callback) {
    const startY = elevatorCar.position.y;
    const targetY = FLOOR_HEIGHT / 4 + targetFloor * FLOOR_HEIGHT + 0.25;
    
    let startTime = null;
    
    function updateElevator(time) {
        if (startTime === null) startTime = time;
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / (1000 / ELEVATOR_SPEED), 1);
        
        elevatorCar.position.y = startY + (targetY - startY) * progress;
        
        // Check if animation is complete
        if (progress < 1) {
            requestAnimationFrame(updateElevator);
        } else {
            callback();
        }
    }
    
    requestAnimationFrame(updateElevator);
}

// Open elevator doors with sliding animation
function openDoors(callback) {
    if (elevatorCar.doorState !== 'closed') return;
    
    elevatorCar.doorState = 'opening';
    const startTime = Date.now();
    const duration = 500; // 500ms
    
    function updateDoors() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Left door moves left (negative X)
        elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 + 0.1 - (SHAFT_WIDTH / 2 - 0.2) * progress;
        
        // Right door moves right (positive X)
        elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 - 0.1 + (SHAFT_WIDTH / 2 - 0.2) * progress;
        
        if (progress < 1) {
            requestAnimationFrame(updateDoors);
        } else {
            elevatorCar.doorState = 'open';
            setTimeout(callback, 300); // 300ms delay before next action
        }
    }
    
    requestAnimationFrame(updateDoors);
}

// Close elevator doors with sliding animation
function closeDoors(callback) {
    if (elevatorCar.doorState !== 'open') return;
    
    elevatorCar.doorState = 'closing';
    const startTime = Date.now();
    const duration = 500; // 500ms
    
    function updateDoors() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Left door moves right (positive X)
        elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 + 0.1 - (SHAFT_WIDTH / 2 - 0.2) * (1 - progress);
        
        // Right door moves left (negative X)
        elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 - 0.1 + (SHAFT_WIDTH / 2 - 0.2) * (1 - progress);
        
        if (progress < 1) {
            requestAnimationFrame(updateDoors);
        } else {
            elevatorCar.doorState = 'closed';
            callback();
        }
    }
    
    requestAnimationFrame(updateDoors);
}

// Move person to/from elevator
function movePerson(person, startPos, endPos, isBoarding, callback) {
    const startTime = Date.now();
    const duration = 2000; // 2 seconds
    
    function updatePerson() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Linear interpolation for position
        person.position.x = startPos.x + (endPos.x - startPos.x) * progress;
        person.position.z = startPos.z + (endPos.z - startPos.z) * progress;
        
        // Animate walking legs
        if (progress < 1) {
            person.walking = true;
            const deltaTime = elapsed / 1000;
            person.animateWalk(deltaTime, animationSpeed);
            requestAnimationFrame(updatePerson);
        } else {
            person.walking = false;
            person.stopWalking();
            
            if (isBoarding) {
                // Person is boarding - make them a child of the elevator
                scene.remove(person);
                elevatorCar.add(person);
            } else {
                // Person is exiting - remove from elevator and add to scene
                elevatorCar.remove(person);
                scene.add(person);
            }
            
            callback();
        }
    }
    
    requestAnimationFrame(updatePerson);
}

// Complete animation cycle: move person from one floor to another
function startElevatorCycle() {
    // Find a person who is not on the empty floor
    const currentPersonIndex = Math.floor(Math.random() * people.length);
    const personData = people[currentPersonIndex];
    
    // Select random destination (the empty floor)
    const destinationFloor = emptyFloor;
    
    console.log(`Moving person from floor ${personData.floor} to floor ${destinationFloor}`);
    
    // Step 1: Move elevator to pickup floor
    moveElevatorToFloor(personData.floor, () => {
        // Step 2: Open doors
        openDoors(() => {
            // Step 3: Person walks into elevator
            const startPos = { x: personData.person.position.x, z: personData.person.position.z };
            const endPos = { x: 0, z: -SHAFT_DEPTH / 2 + 1.5 }; // Inside elevator
            
            movePerson(personData.person, startPos, endPos, true, () => {
                // Step 4: Close doors
                closeDoors(() => {
                    // Step 5: Move elevator to destination floor
                    moveElevatorToFloor(destinationFloor, () => {
                        // Step 6: Open doors at destination
                        openDoors(() => {
                            // Step 7: Person walks out of elevator
                            const startPos = { x: personData.person.position.x, z: personData.person.position.z };
                            const endPos = { 
                                x: 0, 
                                z: -BUILDING_DEPTH / 2 + 3 
                            }; // Outside building
                            
                            movePerson(personData.person, startPos, endPos, false, () => {
                                // Step 8: Close doors and update empty floor
                                closeDoors(() => {
                                    personData.floor = destinationFloor;
                                    emptyFloor = currentPersonIndex; // The previous floor is now empty
                                    
                                    // Start next cycle after a delay
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

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    renderer.render(scene, camera);
}

// Start the simulation when page loads
window.onload = init;