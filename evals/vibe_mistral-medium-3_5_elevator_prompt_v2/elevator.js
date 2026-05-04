// ============================================
// CONSTANTS (H6 - must be top-level const declarations)
// ============================================
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// ============================================
// Global variables (H5)
// ============================================
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];

// Animation state
let animationSpeedMultiplier = 1;
let isAnimating = false;

// Elevator state
let currentElevatorFloor = 0;
let targetElevatorFloor = 0;

// Door state
let doorState = 'closed';
let doorOpenAmount = 0;

// Simulation state
let emptyFloor = 0;
let occupiedFloors = [0, 1, 2, 3, 4, 5];

// ============================================
// INITIALIZATION
// ============================================

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Create camera (H9)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);

    // Create renderer with alpha and sorting (H7)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // Create controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 30, 10);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-10, 10, -10);
    scene.add(pointLight);

    // Create building
    createBuilding();

    // Create elevator
    createElevator();

    // Create people
    createPeople();

    // Setup speed slider
    setupSpeedControl();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();

    // Start the simulation after a brief delay
    setTimeout(startSimulation, 1000);
}

// ============================================
// BUILDING CREATION
// ============================================

function createBuilding() {
    const totalHeight = FLOOR_COUNT * FLOOR_HEIGHT;

    // Building walls material (semi-transparent blue)
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Floor material (semi-transparent gray)
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Ground floor (solid)
    const groundGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH * 2, BUILDING_DEPTH * 2);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.renderOrder = 0;
    scene.add(ground);

    // Roof (solid)
    const roofGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH * 1.1, BUILDING_DEPTH * 1.1);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = totalHeight + 0.1;
    roof.renderOrder = 0;
    scene.add(roof);

    // Building walls
    const frontWallGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, totalHeight);

    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(0, totalHeight / 2, -BUILDING_DEPTH / 2);
    frontWall.renderOrder = 0;
    scene.add(frontWall);

    const backWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    backWall.position.set(0, totalHeight / 2, BUILDING_DEPTH / 2);
    backWall.renderOrder = 0;
    scene.add(backWall);

    const sideWallGeometry = new THREE.PlaneGeometry(BUILDING_DEPTH, totalHeight);

    const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-BUILDING_WIDTH / 2, totalHeight / 2, 0);
    leftWall.renderOrder = 0;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(BUILDING_WIDTH / 2, totalHeight / 2, 0);
    rightWall.renderOrder = 0;
    scene.add(rightWall);

    // Create floors with shaft cutout
    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
        const floorY = floor * FLOOR_HEIGHT;

        const floorShape = new THREE.Shape();
        const outerW = BUILDING_WIDTH;
        const outerD = BUILDING_DEPTH;
        const holeW = SHAFT_WIDTH * 1.05;
        const holeD = SHAFT_DEPTH * 1.05;

        floorShape.moveTo(-outerW / 2, -outerD / 2);
        floorShape.lineTo(outerW / 2, -outerD / 2);
        floorShape.lineTo(outerW / 2, outerD / 2);
        floorShape.lineTo(-outerW / 2, outerD / 2);
        floorShape.lineTo(-outerW / 2, -outerD / 2);

        const holePath = new THREE.Path();
        holePath.moveTo(-holeW / 2, -holeD / 2);
        holePath.lineTo(holeW / 2, -holeD / 2);
        holePath.lineTo(holeW / 2, holeD / 2);
        holePath.lineTo(-holeW / 2, holeD / 2);
        holePath.lineTo(-holeW / 2, -holeD / 2);
        floorShape.holes.push(holePath);

        const floorGeom = new THREE.ShapeGeometry(floorShape);
        const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
        floorMesh.rotation.x = Math.PI / 2;
        floorMesh.position.set(0, floorY, 0);
        floorMesh.renderOrder = 0;
        scene.add(floorMesh);
    }

    // Shaft walls for better visualization
    const shaftWallMat = new THREE.MeshPhongMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const shaftBackWall = new THREE.Mesh(
        new THREE.PlaneGeometry(SHAFT_WIDTH, totalHeight),
        shaftWallMat
    );
    shaftBackWall.position.set(0, totalHeight / 2, -SHAFT_DEPTH / 2);
    shaftBackWall.renderOrder = 0;
    scene.add(shaftBackWall);

    const shaftSideWallGeom = new THREE.PlaneGeometry(SHAFT_DEPTH, totalHeight);

    const shaftSideWall1 = new THREE.Mesh(shaftSideWallGeom, shaftWallMat);
    shaftSideWall1.rotation.y = Math.PI / 2;
    shaftSideWall1.position.set(-SHAFT_WIDTH / 2, totalHeight / 2, 0);
    shaftSideWall1.renderOrder = 0;
    scene.add(shaftSideWall1);

    const shaftSideWall2 = new THREE.Mesh(shaftSideWallGeom, shaftWallMat);
    shaftSideWall2.rotation.y = -Math.PI / 2;
    shaftSideWall2.position.set(SHAFT_WIDTH / 2, totalHeight / 2, 0);
    shaftSideWall2.renderOrder = 0;
    scene.add(shaftSideWall2);
}

// ============================================
// ELEVATOR CREATION
// ============================================

function createElevator() {
    // H5: elevatorCar must be a global THREE.Group
    elevatorCar = new THREE.Group();
    elevatorCar.position.set(0, 0, 0);
    elevatorCar.renderOrder = 1; // Render after building
    scene.add(elevatorCar);

    const carWidth = SHAFT_WIDTH * 0.9;
    const carDepth = SHAFT_DEPTH * 0.9;
    const carHeight = FLOOR_HEIGHT * 0.9;

    // Frame material (semi-transparent yellow)
    const frameMat = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Door material (darker yellow, more opaque)
    const doorMat = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Side walls (more transparent)
    const sideMat = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Back wall
    const backGeom = new THREE.PlaneGeometry(carWidth, carHeight);
    const backWall = new THREE.Mesh(backGeom, frameMat);
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    elevatorCar.add(backWall);

    // Left wall
    const sideGeom = new THREE.PlaneGeometry(carDepth, carHeight);
    const leftWall = new THREE.Mesh(sideGeom, sideMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    elevatorCar.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(sideGeom, sideMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    elevatorCar.add(rightWall);

    // Top
    const topGeom = new THREE.PlaneGeometry(carWidth, carDepth);
    const top = new THREE.Mesh(topGeom, frameMat);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, carHeight, 0);
    elevatorCar.add(top);

    // Floor
    const floorMesh = new THREE.Mesh(topGeom, frameMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 0);
    elevatorCar.add(floorMesh);

    // Doors - split into left and right (H5: must be elevatorCar.leftDoor and elevatorCar.rightDoor)
    const doorWidth = carWidth * 0.42;
    const doorHeight = carHeight * 0.75;
    const doorThickness = 0.15;

    const doorGeom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);

    elevatorCar.leftDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.leftDoor.position.set(-doorWidth / 2, doorHeight / 2, carDepth / 2 + doorThickness / 2);
    elevatorCar.add(elevatorCar.leftDoor);

    elevatorCar.rightDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.rightDoor.position.set(doorWidth / 2, doorHeight / 2, carDepth / 2 + doorThickness / 2);
    elevatorCar.add(elevatorCar.rightDoor);
}

// ============================================
// PEOPLE CREATION
// ============================================

function createPeople() {
    const waitZ = BUILDING_DEPTH / 2 + 2;

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const person = createPerson();
        const floorY = i * FLOOR_HEIGHT;

        person.position.set(0, floorY, waitZ);
        scene.add(person);

        people.push(person);

        person.userData.floor = i;
        person.userData.state = 'waiting';
    }

    occupiedFloors = Array.from({ length: FLOOR_COUNT }, (_, i) => i);
}

// ============================================
// SPEED CONTROL
// ============================================

function setupSpeedControl() {
    const slider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');

    slider.addEventListener('input', function () {
        animationSpeedMultiplier = parseInt(this.value);
        speedValue.textContent = animationSpeedMultiplier + 'x';
    });
}

// ============================================
// WINDOW RESIZE
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// ANIMATION LOOP
// ============================================

function animate() {
    requestAnimationFrame(animate);

    // Update leg animations for walking people (H7: reads person.userData)
    const time = Date.now() * 0.001 * animationSpeedMultiplier;
    for (const person of people) {
        if (person.userData.isWalking) {
            const leftLeg = person.userData.leftLeg;
            const rightLeg = person.userData.rightLeg;
            leftLeg.rotation.x = Math.sin(time * 10) * 0.5;
            rightLeg.rotation.x = Math.sin(time * 10 + Math.PI) * 0.5;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }

    // Update doors
    updateDoors();

    // Update elevator position
    updateElevator();

    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// DOOR ANIMATION
// ============================================

function updateDoors() {
    const speed = 3 * animationSpeedMultiplier;

    if (doorState === 'opening') {
        doorOpenAmount += speed * 0.01;
        if (doorOpenAmount >= 1) {
            doorOpenAmount = 1;
            doorState = 'open';
        }
        updateDoorPositions();
    } else if (doorState === 'closing') {
        doorOpenAmount -= speed * 0.01;
        if (doorOpenAmount <= 0) {
            doorOpenAmount = 0;
            doorState = 'closed';
        }
        updateDoorPositions();
    }
}

function updateDoorPositions() {
    const carWidth = SHAFT_WIDTH * 0.9;
    const doorWidth = carWidth * 0.42;
    const openOffset = doorWidth * doorOpenAmount;

    elevatorCar.leftDoor.position.x = -doorWidth / 2 - openOffset;
    elevatorCar.rightDoor.position.x = doorWidth / 2 + openOffset;
}

function animateDoorsOpen(callback) {
    if (doorState === 'closed') {
        doorState = 'opening';
        const check = () => {
            if (doorState === 'open') {
                isAnimating = false;
                if (callback) callback();
            } else {
                setTimeout(check, 16);
            }
        };
        setTimeout(check, 100);
    } else {
        isAnimating = false;
        if (callback) callback();
    }
}

function animateDoorsClose(callback) {
    if (doorState === 'open') {
        doorState = 'closing';
        const check = () => {
            if (doorState === 'closed') {
                isAnimating = false;
                if (callback) callback();
            } else {
                setTimeout(check, 16);
            }
        };
        setTimeout(check, 100);
    } else {
        isAnimating = false;
        if (callback) callback();
    }
}

// ============================================
// ELEVATOR MOVEMENT
// ============================================

function updateElevator() {
    const speed = ELEVATOR_SPEED * animationSpeedMultiplier * 0.016;
    const targetY = targetElevatorFloor * FLOOR_HEIGHT;

    if (Math.abs(elevatorCar.position.y - targetY) > 0.01) {
        if (elevatorCar.position.y < targetY) {
            elevatorCar.position.y = Math.min(elevatorCar.position.y + speed, targetY);
        } else {
            elevatorCar.position.y = Math.max(elevatorCar.position.y - speed, targetY);
        }
    } else {
        elevatorCar.position.y = targetY;
        currentElevatorFloor = targetElevatorFloor;
    }
}

function moveElevatorToFloor(floor, callback) {
    targetElevatorFloor = floor;

    const check = () => {
        if (Math.abs(elevatorCar.position.y - floor * FLOOR_HEIGHT) < 0.01) {
            isAnimating = false;
            if (callback) callback();
        } else {
            setTimeout(check, 16);
        }
    };
    setTimeout(check, 100);
}

// ============================================
// PERSON BOARDING (scene -> elevatorCar)
// ============================================

function boardPerson(person, callback) {
    person.userData.isWalking = true;

    // Target: inside elevator, slightly back from doors
    const targetX = 0;
    const carDepth = SHAFT_DEPTH * 0.9;
    const targetZ = carDepth / 2 - 0.8; // Inside the elevator car
    const targetY = currentElevatorFloor * FLOOR_HEIGHT;
    const targetWorldPos = new THREE.Vector3(targetX, targetY, targetZ);

    const move = () => {
        const worldPos = new THREE.Vector3();
        person.getWorldPosition(worldPos);

        const dx = targetWorldPos.x - worldPos.x;
        const dy = targetWorldPos.y - worldPos.y;
        const dz = targetWorldPos.z - worldPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.01) {
            // H8: Use .attach() to preserve world position
            scene.remove(person);
            elevatorCar.attach(person);

            person.userData.isWalking = false;
            person.userData.state = 'riding';
            isAnimating = false;
            if (callback) callback();
            return;
        }

        const speed = PERSON_MOVE_SPEED * animationSpeedMultiplier * 0.016;
        person.position.x += (dx / dist) * speed;
        person.position.y += (dy / dist) * speed;
        person.position.z += (dz / dist) * speed;

        setTimeout(move, 16);
    };
    setTimeout(move, 16);
}

// ============================================
// PERSON EXITING (elevatorCar -> scene)
// ============================================

function exitPerson(person, targetFloor, callback) {
    person.userData.isWalking = true;

    // First, move person to scene to use world coordinates for walking
    // H8: Use .attach() to preserve world position
    if (person.parent === elevatorCar) {
        elevatorCar.remove(person);
        scene.attach(person);
    }

    // Target: waiting position on target floor
    const targetX = 0;
    const targetY = targetFloor * FLOOR_HEIGHT;
    const targetZ = BUILDING_DEPTH / 2 + 2;
    const targetWorldPos = new THREE.Vector3(targetX, targetY, targetZ);

    const move = () => {
        const worldPos = new THREE.Vector3();
        person.getWorldPosition(worldPos);

        const dx = targetWorldPos.x - worldPos.x;
        const dy = targetWorldPos.y - worldPos.y;
        const dz = targetWorldPos.z - worldPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.01) {
            person.userData.isWalking = false;
            person.userData.state = 'waiting';
            person.userData.floor = targetFloor;

            isAnimating = false;
            if (callback) callback();
            return;
        }

        const speed = PERSON_MOVE_SPEED * animationSpeedMultiplier * 0.016;
        person.position.x += (dx / dist) * speed;
        person.position.y += (dy / dist) * speed;
        person.position.z += (dz / dist) * speed;

        setTimeout(move, 16);
    };
    setTimeout(move, 16);
}

// ============================================
// SIMULATION LOGIC
// ============================================

function startSimulation() {
    // Pick a random floor to be empty
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    occupiedFloors = occupiedFloors.filter(f => f !== emptyFloor);

    // Start first move
    setTimeout(scheduleNextMove, 500);
}

function scheduleNextMove() {
    if (isAnimating) {
        setTimeout(scheduleNextMove, 200);
        return;
    }

    // Pick random occupied floor
    const pickupFloorIndex = Math.floor(Math.random() * occupiedFloors.length);
    const pickupFloor = occupiedFloors[pickupFloorIndex];

    // Find person on that floor
    const person = people.find(p => p.userData.floor === pickupFloor && p.userData.state === 'waiting');
    if (!person) {
        setTimeout(scheduleNextMove, 500);
        return;
    }

    const destinationFloor = emptyFloor;

    // Update state
    person.userData.state = 'boarding';
    person.userData.targetFloor = destinationFloor;

    // Update floor tracking
    occupiedFloors = occupiedFloors.filter(f => f !== pickupFloor);
    occupiedFloors.push(destinationFloor);
    emptyFloor = pickupFloor;

    isAnimating = true;

    // Sequence: move -> open doors -> delay -> board -> delay -> close doors ->
    //          move -> open doors -> delay -> exit -> delay -> close doors

    moveElevatorToFloor(pickupFloor, () => {
        animateDoorsOpen(() => {
            setTimeout(() => {
                boardPerson(person, () => {
                    setTimeout(() => {
                        animateDoorsClose(() => {
                            moveElevatorToFloor(destinationFloor, () => {
                                animateDoorsOpen(() => {
                                    setTimeout(() => {
                                        exitPerson(person, destinationFloor, () => {
                                            setTimeout(() => {
                                                animateDoorsClose(() => {
                                                    isAnimating = false;
                                                    setTimeout(scheduleNextMove, 1000);
                                                });
                                            }, 300);
                                        });
                                    }, 300);
                                });
                            });
                        });
                    }, 300);
                });
            }, 300);
        });
    });
}

// ============================================
// AUTO-START (H3 - must auto-start on page load)
// ============================================

// Check if THREE is loaded, if so start immediately
// Scripts are loaded in order: three.min.js -> OrbitControls -> person.js -> elevator.js
if (typeof THREE !== 'undefined') {
    // Add DOMContentLoaded as fallback
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 1);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
} else {
    document.addEventListener('DOMContentLoaded', init);
}
