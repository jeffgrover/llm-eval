// elevator.js - Main simulation logic
// Constants (configurable)
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 20;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 3.5;
const ELEVATOR_SPEED = 1.0;
const PERSON_MOVE_SPEED = 1.5;

// Animation speed multiplier
let animationSpeed = 1;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(25, 25, 25);
camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Enable transparency and sorting
renderer.alpha = true;
renderer.sortObjects = true;

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

// Create building with floors and walls
function createBuilding() {
    const building = new THREE.Group();
    
    // Solid ground floor (floor 1)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: false,
        side: THREE.DoubleSide
    });
    
    const groundFloor = new THREE.Mesh(groundGeometry, groundMaterial);
    groundFloor.position.y = FLOOR_HEIGHT / 2;
    building.add(groundFloor);
    
    // Transparent floors (floors 2-6)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT - 0.1, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = FLOOR_HEIGHT * (i + 1) - FLOOR_HEIGHT / 2;
        building.add(floor);
    }
    
    // Semi-transparent walls
    const wallMaterial = new THREE.MeshBasicMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Front wall (positive Z)
    const frontWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 0.5),
        wallMaterial
    );
    frontWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2 + 0.25);
    building.add(frontWall);
    
    // Back wall (negative Z)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 0.5),
        wallMaterial
    );
    backWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2 - 0.25);
    building.add(backWall);
    
    // Left wall (negative X)
    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH),
        wallMaterial
    );
    leftWall.position.set(-BUILDING_WIDTH / 2 - 0.25, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    building.add(leftWall);
    
    // Right wall (positive X)
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH),
        wallMaterial
    );
    rightWall.position.set(BUILDING_WIDTH / 2 + 0.25, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    building.add(rightWall);
    
    // Elevator shaft cutouts (hollow center)
    const shaftMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
    });
    
    // Ground floor shaft
    const groundShaft = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH),
        shaftMaterial
    );
    groundShaft.position.y = FLOOR_HEIGHT / 2;
    building.add(groundShaft);
    
    // Upper floor shafts
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH),
            shaftMaterial
        );
        shaft.position.y = FLOOR_HEIGHT * (i + 1) - FLOOR_HEIGHT / 2;
        building.add(shaft);
    }
    
    building.renderOrder = 0;
    return building;
}

// Create elevator car with doors
function createElevatorCar() {
    const group = new THREE.Group();
    
    // Elevator frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.5, SHAFT_DEPTH);
    const frameMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    // Solid back wall (negative Z)
    const backWallGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.5, SHAFT_DEPTH / 2 + 0.1);
    frame.add(new THREE.Mesh(backWallGeometry, frameMaterial));
    // Transparent side walls
    const sideWallGeometry = new THREE.BoxGeometry(SHAFT_WIDTH + 0.1, FLOOR_HEIGHT - 0.5, SHAFT_DEPTH / 2);
    const leftSide = new THREE.Mesh(sideWallGeometry, frameMaterial);
    leftSide.position.x = (SHAFT_WIDTH + 0.1) / 2;
    const rightSide = new THREE.Mesh(sideWallGeometry, frameMaterial);
    rightSide.position.x = -(SHAFT_WIDTH + 0.1) / 2;
    frame.add(leftSide);
    frame.add(rightSide);
    
    group.add(frame);
    group.position.y = FLOOR_HEIGHT / 2; // Position at ground floor initially
    
    // Create doors (split into left/right halves)
    const doorWidth = SHAFT_WIDTH / 4;
    const doorHeight = FLOOR_HEIGHT - 0.6;
    const doorDepth = 0.3;
    
    const doorMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Left door (positive X)
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    group.leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    group.leftDoor.position.x = doorWidth / 2;
    group.leftDoor.position.z = SHAFT_DEPTH / 2 - doorDepth / 2;
    group.add(group.leftDoor);
    
    // Right door (negative X)
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    group.rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    group.rightDoor.position.x = -doorWidth / 2;
    group.rightDoor.position.z = SHAFT_DEPTH / 2 - doorDepth / 2;
    group.add(group.rightDoor);
    
    // Door state
    group.doorOpen = false;
    group.currentFloor = 0;
    
    group.renderOrder = 1;
    
    return group;
}

// Simulation state
const people = [];
let elevatorCar;
let building;
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);

function initSimulation() {
    // Create building and elevator
    building = createBuilding();
    scene.add(building);
    
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    
    // Position people on each floor (except one empty floor)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson();
            person.position.set(0, FLOOR_HEIGHT * i + FLOOR_HEIGHT / 2, -SHAFT_DEPTH - 1.5); // In front of elevator
            person.rotation.y = Math.PI; // Face the elevator (180° rotation)
            scene.add(person);
            people.push({ person, floor: i });
        }
    }
    
    // Start first animation cycle after a delay
    setTimeout(startNextAnimationCycle, 1000);
}

// Animation pipeline - sequential callback-based
function animateElevatorToFloor(targetFloor, onComplete) {
    const startY = elevatorCar.position.y;
    const endY = FLOOR_HEIGHT * targetFloor + FLOOR_HEIGHT / 2;
    let elapsed = 0;
    
    function update() {
        elapsed += ELEVATOR_SPEED * animationSpeed * 0.016; // ~60fps
        const progress = Math.min(elapsed / (Math.abs(endY - startY) * 5), 1);
        elevatorCar.position.y = startY + (endY - startY) * progress;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.currentFloor = targetFloor;
            onComplete();
        }
    }
    
    update();
}

function animateDoors(open, onComplete) {
    const startTime = Date.now();
    const duration = 500; // 500ms animation
    
    function update() {
        const elapsed = Date.now() - startTime;
        let progress = Math.min(elapsed / duration, 1);
        
        if (open) {
            progress = 1 - progress; // Reverse for closing
        }
        
        const doorWidth = SHAFT_WIDTH / 4;
        const moveAmount = doorWidth * progress;
        
        if (open) {
            elevatorCar.leftDoor.position.x = doorWidth / 2 + moveAmount;
            elevatorCar.rightDoor.position.x = -doorWidth / 2 - moveAmount;
        } else {
            elevatorCar.leftDoor.position.x = doorWidth / 2 - moveAmount;
            elevatorCar.rightDoor.position.x = -doorWidth / 2 + moveAmount;
        }
        
        if (elapsed < duration) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.doorOpen = open;
            onComplete();
        }
    }
    
    update();
}

function animatePersonWalking(person, startPos, endPos, direction, onComplete) {
    const distance = Math.abs(endPos.z - startPos.z);
    let elapsed = 0;
    person.walking = true;
    person.walkTime = 0;
    
    function update() {
        elapsed += PERSON_MOVE_SPEED * animationSpeed * 0.016;
        const progress = Math.min(elapsed / (distance / PERSON_MOVE_SPEED), 1);
        person.position.z = startPos.z + (endPos.z - startPos.z) * progress;
        
        // Leg animation
        if (person.walking) {
            person.walkTime += 0.2 * animationSpeed;
            const legSwing = Math.sin(person.walkTime) * 0.3;
            person.legs.left.rotation.x = legSwing;
            person.legs.right.rotation.x = -legSwing;
        }
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Reset legs when done walking
            person.walking = false;
            person.legs.left.rotation.x = 0;
            person.legs.right.rotation.x = 0;
            onComplete();
        }
    }
    
    update();
}

function startNextAnimationCycle() {
    if (people.length < FLOOR_COUNT) {
        // Select a random person to move
        const randomIndex = Math.floor(Math.random() * people.length);
        const personData = people[randomIndex];
        const fromFloor = personData.floor;
        
        // Find an empty floor (could be the same as current)
        let toFloor = emptyFloor;
        if (toFloor === fromFloor && FLOOR_COUNT > 2) {
            toFloor = Math.floor(Math.random() * FLOOR_COUNT);
            while (toFloor === fromFloor || toFloor === emptyFloor) {
                toFloor = Math.floor(Math.random() * FLOOR_COUNT);
            }
        }
        
        // Animation sequence
        animateElevatorToFloor(fromFloor, () => {
            // Open doors before person enters
            animateDoors(true, () => {
                // Person walks into elevator
                const startPos = { x: 0, y: FLOOR_HEIGHT * fromFloor + FLOOR_HEIGHT / 2, z: -SHAFT_DEPTH - 1.5 };
                const endPos = { x: 0, y: FLOOR_HEIGHT * fromFloor + FLOOR_HEIGHT / 2, z: -SHAFT_DEPTH / 2 + 0.3 };
                
                animatePersonWalking(personData.person, startPos, endPos, 'forward', () => {
                    // Add person to elevator (becomes child of elevator)
                    elevatorCar.add(personData.person);
                    personData.person.position.z = -SHAFT_DEPTH / 2 + 0.3;
                    
                    setTimeout(() => {
                        animateDoors(false, () => {
                            // Elevator moves to destination
                            animateElevatorToFloor(toFloor, () => {
                                // Open doors at destination
                                animateDoors(true, () => {
                                    // Person walks out of elevator
                                    const startPos = { x: 0, y: FLOOR_HEIGHT * toFloor + FLOOR_HEIGHT / 2, z: -SHAFT_DEPTH / 2 + 0.3 };
                                    const endPos = { x: 0, y: FLOOR_HEIGHT * toFloor + FLOOR_HEIGHT / 2, z: -SHAFT_DEPTH - 1.5 };
                                    
                                    animatePersonWalking(personData.person, startPos, endPos, 'forward', () => {
                                        // Remove person from elevator and add back to scene
                                        scene.add(personData.person);
                                        personData.person.position.set(0, FLOOR_HEIGHT * toFloor + FLOOR_HEIGHT / 2, -SHAFT_DEPTH - 1.5);
                                        personData.person.rotation.y = Math.PI;
                                        
                                        // Update person data
                                        personData.floor = toFloor;
                                        
                                        setTimeout(() => {
                                            animateDoors(false, () => {
                                                // Update empty floor
                                                const wasEmpty = people.findIndex(p => p.floor === emptyFloor) === -1;
                                                if (wasEmpty && fromFloor !== toFloor) {
                                                    emptyFloor = fromFloor;
                                                }
                                                
                                                // Start next cycle after delay
                                                setTimeout(startNextAnimationCycle, 2000);
                                            });
                                        }, 500);
                                    });
                                });
                            });
                        }, 500);
                    });
                });
            });
        });
    }
}

// Event listeners
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('speedSlider').addEventListener('input', (e) => {
    animationSpeed = parseFloat(e.target.value);
});

// Start the simulation
initSimulation();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();