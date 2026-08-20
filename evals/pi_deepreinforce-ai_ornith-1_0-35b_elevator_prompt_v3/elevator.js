// elevator.js - Main simulation logic for 3D elevator

// Constants (H6)
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global variables (H5)
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let emptyFloorIndex = 0;
let simClock = { speed: 1 };

// Animation state machine
let animationState = 'idle'; // idle, moving_to_pickup, doors_opening, person_boarding, doors_closing, moving_to_dest, doors_opening_exit, person_exiting, doors_closing_exit
let currentPersonIndex = -1;
let targetFloor = 0;

// Door state
let doorsOpen = false;
let doorAnimationProgress = 0; // 0 = closed, 1 = open
const DOOR_SPEED = 2;
const doorWidth = SHAFT_WIDTH / 2 - 0.1;

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    controls.update();
    
    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    
    // Create building and elevator
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    
    // Create initial people on each floor except one (emptyFloorIndex)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloorIndex) {
            const person = createPerson();
            person.position.set(0, getFloorY(i), 5); // In front of elevator on positive Z
            person.rotation.y = Math.PI; // Face the elevator
            scene.add(person);
            people.push(person);
        }
    }
    
    // Pick first person and start animation
    pickRandomPerson();
    animationState = 'moving_to_pickup';
    
    // Start animation loop
    animate();
}

function getFloorY(floorIndex) {
    return floorIndex * FLOOR_HEIGHT;
}

function createBuilding() {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    
    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(0, -0.1, 0);
    buildingGroup.add(ground);
    
    // Transparent floors (except ground which is solid)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorY = getFloorY(i);
        
        // Floor slab with hole in center (using multiple boxes to create shaft cutout)
        const floorThickness = 0.2;
        const halfWidth = BUILDING_WIDTH / 2;
        const halfDepth = BUILDING_DEPTH / 2;
        const shaftHalfWidth = SHAFT_WIDTH / 2;
        const shaftHalfDepth = SHAFT_DEPTH / 2;
        
        // Create floor as 4 quadrants around the shaft
        const floorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xcccccc, 
            transparent: true, 
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        // Front section (positive Z)
        const frontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, halfDepth - shaftHalfDepth);
        const frontFloor = new THREE.Mesh(frontGeo, floorMaterial);
        frontFloor.position.set(0, floorY + floorThickness / 2, shaftHalfDepth + (halfDepth - shaftHalfDepth) / 2);
        buildingGroup.add(frontFloor);
        
        // Back section (negative Z)
        const backGeo = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, halfDepth - shaftHalfDepth);
        const backFloor = new THREE.Mesh(backGeo, floorMaterial);
        backFloor.position.set(0, floorY + floorThickness / 2, -(shaftHalfDepth + (halfDepth - shaftHalfDepth) / 2));
        buildingGroup.add(backFloor);
        
        // Left section
        const leftGeo = new THREE.BoxGeometry(halfWidth - shaftHalfWidth, floorThickness, SHAFT_DEPTH);
        const leftFloor = new THREE.Mesh(leftGeo, floorMaterial);
        leftFloor.position.set(-(shaftHalfWidth + (halfWidth - shaftHalfWidth) / 2), floorY + floorThickness / 2, 0);
        buildingGroup.add(leftFloor);
        
        // Right section
        const rightGeo = new THREE.BoxGeometry(halfWidth - shaftHalfWidth, floorThickness, SHAFT_DEPTH);
        const rightFloor = new THREE.Mesh(rightGeo, floorMaterial);
        rightFloor.position.set(shaftHalfWidth + (halfWidth - shaftHalfWidth) / 2, floorY + floorThickness / 2, 0);
        buildingGroup.add(rightFloor);
    }
    
    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, getFloorY(FLOOR_COUNT - 1) + FLOOR_HEIGHT + 0.15, 0);
    buildingGroup.add(roof);
    
    // Semi-transparent walls
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Front wall (positive Z)
    const frontWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 0.1);
    const frontWall = new THREE.Mesh(frontWallGeo, wallMaterial);
    frontWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontWall);
    
    // Back wall (negative Z)
    const backWall = new THREE.Mesh(frontWallGeo, wallMaterial);
    backWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);
    
    // Left wall
    const sideWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMaterial);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeo, wallMaterial);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(rightWall);
    
    scene.add(buildingGroup);
}

function createElevatorCar() {
    const car = new THREE.Group();
    car.renderOrder = 1;
    
    // Frame material (yellow, semi-transparent)
    const frameMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Door material (darker yellow, slightly more opaque)
    const doorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Floor of elevator car
    const carFloorGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, 0.1, SHAFT_DEPTH - 0.2);
    const carFloor = new THREE.Mesh(carFloorGeo, frameMaterial);
    car.add(carFloor);
    
    // Back wall (solid)
    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, FLOOR_HEIGHT - 0.3, 0.1);
    const backWall = new THREE.Mesh(backWallGeo, frameMaterial);
    backWall.position.set(0, (FLOOR_HEIGHT - 0.3) / 2, -SHAFT_DEPTH / 2 + 0.05);
    car.add(backWall);
    
    // Side walls (transparent)
    const sideWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.3, SHAFT_DEPTH - 0.2);
    const leftSideWall = new THREE.Mesh(sideWallGeo, frameMaterial);
    leftSideWall.position.set(-(SHAFT_WIDTH - 0.2) / 2, (FLOOR_HEIGHT - 0.3) / 2, 0);
    car.add(leftSideWall);
    
    const rightSideWall = new THREE.Mesh(sideWallGeo, frameMaterial);
    rightSideWall.position.set((SHAFT_WIDTH - 0.2) / 2, (FLOOR_HEIGHT - 0.3) / 2, 0);
    car.add(rightSideWall);
    
    // Top frame
    const topGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, 0.1, SHAFT_DEPTH - 0.2);
    const topFrame = new THREE.Mesh(topGeo, frameMaterial);
    topFrame.position.set(0, FLOOR_HEIGHT - 0.35, 0);
    car.add(topFrame);
    
    // Vertical pillars
    const pillarGeo = new THREE.BoxGeometry(0.15, FLOOR_HEIGHT - 0.3, 0.15);
    const pillarPositions = [
        { x: -(SHAFT_WIDTH - 0.2) / 2, z: -(SHAFT_DEPTH - 0.2) / 2 },
        { x: (SHAFT_WIDTH - 0.2) / 2, z: -(SHAFT_DEPTH - 0.2) / 2 },
        { x: -(SHAFT_WIDTH - 0.2) / 2, z: (SHAFT_DEPTH - 0.2) / 2 },
        { x: (SHAFT_WIDTH - 0.2) / 2, z: (SHAFT_DEPTH - 0.2) / 2 }
    ];
    
    pillarPositions.forEach(pos => {
        const pillar = new THREE.Mesh(pillarGeo, frameMaterial);
        pillar.position.set(pos.x, (FLOOR_HEIGHT - 0.3) / 2, pos.z);
        car.add(pillar);
    });
    
    // Doors - split into left and right halves
    const doorHeight = FLOOR_HEIGHT - 0.4;
    const doorDepth = 0.1;
    const doorYOffset = (FLOOR_HEIGHT - 0.3) / 2 + 0.05; // Slightly above floor
    
    const leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const rightDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    
    const leftDoor = new THREE.Mesh(leftDoorGeo, doorMaterial);
    leftDoor.position.set(-doorWidth / 2 - 0.05, doorYOffset, SHAFT_DEPTH / 2 - 0.05);
    car.add(leftDoor);
    car.leftDoor = leftDoor;
    
    const rightDoor = new THREE.Mesh(rightDoorGeo, doorMaterial);
    rightDoor.position.set(doorWidth / 2 + 0.05, doorYOffset, SHAFT_DEPTH / 2 - 0.05);
    car.add(rightDoor);
    car.rightDoor = rightDoor;
    
    return car;
}

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = 0.016 * simClock.speed; // Assume 60fps base
    
    updateAnimation(deltaTime);
    updateWalkingAnimations();
    
    controls.update();
    renderer.render(scene, camera);
}

function updateAnimation(deltaTime) {
    switch (animationState) {
        case 'moving_to_pickup':
            moveElevatorToFloor(targetFloor, () => {
                animationState = 'doors_opening';
                openDoors(() => {
                    animationState = 'person_boarding';
                    boardPerson(() => {
                        animationState = 'doors_closing';
                        closeDoors(() => {
                            // Choose next target floor (must be different from current)
                            let newTarget;
                            do {
                                newTarget = Math.floor(Math.random() * FLOOR_COUNT);
                            } while (newTarget === targetFloor);
                            
                            targetFloor = newTarget;
                            emptyFloorIndex = getPersonFloor(currentPersonIndex);
                            
                            animationState = 'moving_to_dest';
                        });
                    });
                });
            });
            break;
            
        case 'moving_to_dest':
            moveElevatorToFloor(targetFloor, () => {
                animationState = 'doors_opening_exit';
                openDoors(() => {
                    animationState = 'person_exiting';
                    exitPerson(() => {
                        animationState = 'doors_closing_exit';
                        closeDoors(() => {
                            // Schedule next move after delay
                            setTimeout(() => {
                                if (animationState === 'idle' || animationState === 'doors_closing_exit') {
                                    pickRandomPerson();
                                    animationState = 'moving_to_pickup';
                                }
                            }, 1000);
                        });
                    });
                });
            });
            break;
            
        case 'idle':
            // Wait for next move to be scheduled
            break;
    }
}

function pickRandomPerson() {
    if (people.length === 0) return;
    
    currentPersonIndex = Math.floor(Math.random() * people.length);
    targetFloor = emptyFloorIndex;
}

function getPersonFloor(personIndex) {
    const person = people[personIndex];
    if (!person) return 0;
    
    // Find which floor the person is on based on world Y position
    const worldPos = new THREE.Vector3();
    person.getWorldPosition(worldPos);
    
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (Math.abs(worldPos.y - getFloorY(i)) < 0.5) {
            return i;
        }
    }
    return 0;
}

function moveElevatorToFloor(floorIndex, callback) {
    const targetY = getFloorY(floorIndex);
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = distance / (ELEVATOR_SPEED * simClock.speed);
    
    let elapsed = 0;
    
    function step() {
        elapsed += 0.016;
        const progress = Math.min(elapsed / duration, 1);
        
        elevatorCar.position.y = startY + (targetY - startY) * progress;
        
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            callback();
        }
    }
    
    step();
}

function openDoors(callback) {
    doorsOpen = true;
    const startTime = performance.now();
    const duration = 500 / simClock.speed; // 0.5 seconds
    
    function animateDoors() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        // Move doors outward
        const doorOffset = (SHAFT_WIDTH / 2 - 0.5) * easedProgress;
        elevatorCar.leftDoor.position.x = -doorWidth / 2 - 0.05 - doorOffset;
        elevatorCar.rightDoor.position.x = doorWidth / 2 + 0.05 + doorOffset;
        
        if (progress < 1) {
            requestAnimationFrame(animateDoors);
        } else {
            setTimeout(callback, 300); // Brief delay
        }
    }
    
    animateDoors();
}

function closeDoors(callback) {
    doorsOpen = false;
    const startTime = performance.now();
    const duration = 500 / simClock.speed;
    
    function animateDoors() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        // Move doors inward (to center)
        const doorOffset = (SHAFT_WIDTH / 2 - 0.5) * (1 - easedProgress);
        elevatorCar.leftDoor.position.x = -doorWidth / 2 - 0.05 + doorOffset;
        elevatorCar.rightDoor.position.x = doorWidth / 2 + 0.05 - doorOffset;
        
        if (progress < 1) {
            requestAnimationFrame(animateDoors);
        } else {
            callback();
        }
    }
    
    animateDoors();
}

function boardPerson(callback) {
    const person = people[currentPersonIndex];
    if (!person) return;
    
    // Person walks forward into elevator
    const startZ = 5; // Starting position in front of elevator
    const endZ = SHAFT_DEPTH / 2 - 1; // Inside elevator, near back wall
    const startY = person.position.y;
    const distance = Math.abs(endZ - startZ);
    const duration = distance / (PERSON_MOVE_SPEED * simClock.speed);
    
    let elapsed = 0;
    
    function step() {
        elapsed += 0.016;
        const progress = Math.min(elapsed / duration, 1);
        
        person.position.z = startZ + (endZ - startZ) * progress;
        person.userData.isWalking = true;
        
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Person has reached elevator door, now board them
            person.userData.isWalking = false;
            
            // Use .attach() to reparent while preserving world position
            elevatorCar.attach(person);
            
            // Adjust position relative to elevator car
            person.position.set(0, 0, SHAFT_DEPTH / 2 - 1.5);
            
            setTimeout(callback, 300);
        }
    }
    
    step();
}

function exitPerson(callback) {
    const person = people[currentPersonIndex];
    if (!person) return;
    
    // Person walks forward out of elevator
    const startZ = SHAFT_DEPTH / 2 - 1.5; // Inside elevator
    const endZ = SHAFT_DEPTH / 2 + 0.5; // Just outside door
    const distance = Math.abs(endZ - startZ);
    const duration = distance / (PERSON_MOVE_SPEED * simClock.speed);
    
    let elapsed = 0;
    
    function step() {
        elapsed += 0.016;
        const progress = Math.min(elapsed / duration, 1);
        
        person.position.z = startZ + (endZ - startZ) * progress;
        person.userData.isWalking = true;
        
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Person has reached door, exit them
            person.userData.isWalking = false;
            
            // Use .attach() to reparent while preserving world position
            scene.attach(person);
            
            // Position in front of elevator on the destination floor
            const floorY = getFloorY(targetFloor);
            person.position.set(0, floorY + 1.2, SHAFT_DEPTH / 2 + 0.5);
            person.rotation.y = Math.PI; // Face the elevator
            
            setTimeout(callback, 300);
        }
    }
    
    step();
}

function updateWalkingAnimations() {
    const time = performance.now() * 0.001 * simClock.speed;
    
    people.forEach(person => {
        if (person.userData.isWalking) {
            // Alternating leg swing using sine wave
            const swingAngle = Math.sin(time * 8) * 0.5;
            
            if (person.userData.leftLeg) {
                person.userData.leftLeg.rotation.x = swingAngle;
            }
            if (person.userData.rightLeg) {
                person.userData.rightLeg.rotation.x = -swingAngle;
            }
        } else {
            // Reset to standing position
            if (person.userData.leftLeg) {
                person.userData.leftLeg.rotation.x = 0;
            }
            if (person.userData.rightLeg) {
                person.userData.rightLeg.rotation.x = 0;
            }
        }
    });
}

// Start the simulation when DOM is ready
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
