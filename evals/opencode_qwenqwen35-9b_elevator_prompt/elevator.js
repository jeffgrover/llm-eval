/**
 * 3D Elevator Simulation using Three.js
 */

// Constants - configurable at top of file
const config = {
    FLOOR_HEIGHT: 4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 12,
    BUILDING_DEPTH: 12,
    SHAFT_WIDTH: 5,
    SHAFT_DEPTH: 5,
    ELEVATOR_SPEED: 0.8,
    PERSON_MOVE_SPEED: 0.2,
    DOOR_OPEN_TIME: 400,
    DOOR_CLOSE_TIME: 300,
    BOARDING_DELAY: 300,
    DOOR_GAP: 0.5,
    YAW_ANGLE: Math.PI // 180 degrees - people face the elevator
};

// Global variables
let scene, camera, renderer, controls;
let building, elevatorGroup, elevatorCar;
let person = null;
let doorsLeft, doorsRight;
let isSimulationRunning = true;
let animationSpeedMultiplier = 1.0;
let currentFloorIndex = 0;
let emptyFloorIndex = FLOOR_COUNT - 1;
let state = { state: 'IDLE', originFloor: 0, destinationFloor: 0 };

/**
 * Initialize the Three.js scene and render setup
 */
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    
    // Camera at (25, 25, 25) looking at building center
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, config.FLOOR_HEIGHT * config.FLOOR_COUNT / 2, 0);
    
    // Renderer with transparency settings enabled
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Create building and elevator
    createBuilding();
    createElevator();
    createPersonAtFloor(0, config.FLOOR_HEIGHT);
    
    // Event listeners
    window.addEventListener('resize', onWindowResize);
    
    document.getElementById('speedSlider').addEventListener('input', (e) => {
        animationSpeedMultiplier = parseFloat(e.target.value);
        document.getElementById('speedValue').textContent = e.target.value + 'x';
    });
    
    // Start simulation loop
    animate();
}

/**
 * Create the 6-floor building with transparent materials
 */
function createBuilding() {
    building = new THREE.Group();
    
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        opacity: 0.2,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        opacity: 0.3,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Ground floor (solid) - negative Y
    const groundGeo = new THREE.BoxGeometry(config.BUILDING_WIDTH, config.FLOOR_HEIGHT, config.BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeo, wallMaterial);
    ground.position.y = -config.FLOOR_HEIGHT / 2;
    building.add(ground);
    
    // Roof (solid) - top level
    const roofY = config.FLOOR_COUNT * config.FLOOR_HEIGHT;
    const roofGeo = new THREE.BoxGeometry(config.BUILDING_WIDTH, config.FLOOR_HEIGHT, config.BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeo, wallMaterial);
    roof.position.y = roofY - config.FLOOR_HEIGHT / 2;
    building.add(roof);
    
    // Floors 1-5 (transparent)
    for (let i = 0; i < config.FLOOR_COUNT - 1; i++) {
        // Floor slab with shaft cutout
        createFloorWithShaft(wallMaterial, floorMaterial, i + 1);
    }
    
    scene.add(building);
}

/**
 * Create a floor with an elevator shaft cutout in the center
 */
function createFloorWithShaft(wallMat, floorMat, floorIndex) {
    const y = (floorIndex + 0.5) * config.FLOOR_HEIGHT;
    
    // Floor surface with shaft gap
    const innerWidth = config.BUILDING_WIDTH - config.SHAFT_WIDTH;
    const depthGap1 = -(config.SHAFT_DEPTH / 2);
    const depthGap2 = config.BUILDING_DEPTH - config.SHAFT_DEPTH + (config.SHAFT_DEPTH / 2);
    
    // Left outer floor
    const leftOuterGeo = new THREE.BoxGeometry(innerWidth, config.FLOOR_HEIGHT, depthGap1 * 2);
    const leftOuterFloor = new THREE.Mesh(leftOuterGeo, floorMat.clone());
    leftOuterFloor.position.set(0, y, -config.BUILDING_DEPTH / 2 + config.SHAFT_DEPTH / 2);
    building.add(leftOuterFloor);
    
    // Right outer floor
    const rightOuterFloor = new THREE.Mesh(new THREE.BoxGeometry(innerWidth, config.FLOOR_HEIGHT, depthGap1 * 2), floorMat.clone());
    rightOuterFloor.position.set(0, y, config.BUILDING_DEPTH / 2 - config.SHAFT_DEPTH / 2);
    building.add(rightOuterFloor);
    
    // Shaft left wall
    const shaftLeftWidth = (config.SHAFT_DEPTH / 2) * 2;
    const shaftWallGeo = new THREE.BoxGeometry(shaftLeftWidth, config.FLOOR_HEIGHT, config.BUILDING_DEPTH);
    const shaftWall = new THREE.Mesh(shaftWallGeo, wallMat.clone());
    shaftWall.position.set([-config.SHAFT_WIDTH / 2, y], config.BUILDING_DEPTH / 2 - config.SHAFT_DEPTH / 2);
    building.add(shaftWall);
    
    // Shaft right wall - actually just walls at the edges of the shaft
    for (let dir = [-1, 1]; dir.length > 0; dir = [dir.pop()]) {
        const edgeX = -dir[0] * config.SHAFT_WIDTH / 2;
        const edgeZ = [-1, 1].map(z => z);
        
        for (let dz of edgeZ) {
            const wallGeo = new THREE.BoxGeometry(config.BUILDING_DEPTH, config.FLOOR_HEIGHT / 2, 0.5);
            const wall = new THREE.Mesh(wallGeo, wallMat.clone());
            wall.position.set(edgeX + config.SHAFT_WIDTH * 0.1 * dir[0], y, dz * config.BUILDING_DEPTH / 2 - config.SHAFT_DEPTH / 4);
            building.add(wall);
        }
    }
}

/**
 * Create the elevator car with semi-transparent yellow frame and sliding doors
 */
function createElevator() {
    elevatorGroup = new THREE.Group();
    
    // Elevator Car Group (container)
    const carMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        opacity: 0.5,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    elevatorCar = new THREE.Group();
    const carSize = { w: config.SHAFT_WIDTH - 1, d: 2.5 };
    
    // Solid back wall
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.4, 2, carSize.d),
        new THREE.MeshPhongMaterial({ 
            color: 0x9999ff, 
            opacity: 0.3, 
            transparent: true, 
            side: THREE.DoubleSide, 
            depthWrite: false 
        }));
    backWall.position.set(-carSize.w / 2 + carSize.w * 0.4 / 2, 1, -carSize.d / 2);
    elevatorCar.add(backWall);
    
    // Transparent side walls
    const leftSide = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.6, 2, carSize.d * 0.5),
        carMaterial.clone()
    );
    leftSide.position.set(-carSize.w * 0.3 + carSize.w * 0.3 / 2, 1, -carSize.d / 4);
    elevatorCar.add(leftSide);
    
    const rightSide = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.6, 2, carSize.d * 0.5),
        carMaterial.clone()
    );
    rightSide.position.set(-carSize.w * 0.7 + carSize.w * 0.3 / 2, 1, -carSize.d / 4);
    elevatorCar.add(rightSide);
    
    // Door track (top rail)
    const doorTrackGeo = new THREE.BoxGeometry(carSize.w * 0.85, 0.1, 0.2);
    const doorTrack = new THREE.Mesh(doorTrackGeo, carMaterial.clone());
    doorTrack.position.y = 0 + 0.55;
    doorTrack.rotation.x = Math.PI / 2;
    elevatorCar.add(doorTrack);
    
    // Doors with pivot points at front edge (sliding horizontally outward)
    // When doors close: both halves meet in center
    // Split from -0.475 to 0 and 0 to 0.475, total width ~2
    const carDepth = 0.6;
    
    // Door left half - pivot at x=0 (moves right when closing)
    doorsLeft = new THREE.Group();
    doorsLeft.position.set(carSize.w / 2 - carDepth / 2 + 0.5, 0.02, carSize.d / 2);
    
    const doorGeo = new THREE.BoxGeometry(config.DOOR_GAP + 0.15, 2.5, carDepth);
    doorsLeft.add(new THREE.Mesh(doorGeo, new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        opacity: 0.7,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    })));
    
    elevatorCar.add(doorsLeft);
    
    // Door right half - pivot at x=0 (moves left when closing)
    doorsRight = new THREE.Group();
    doorsRight.position.set(carSize.w / 2 - carDepth / 2, 0.02, carSize.d / 2);
    
    const doorGeo2 = new THREE.BoxGeometry(config.DOOR_GAP + 0.15, 2.5, carDepth);
    doorsRight.add(new THREE.Mesh(doorGeo2, new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        opacity: 0.7,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    })));
    
    elevatorCar.add(doorsRight);
    
    // Elevator car floor (where people stand)
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.8, 0.1, carSize.d),
        new THREE.MeshPhongMaterial({
            color: 0x9999ff,
            opacity: 0.3,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    floor.position.y = -0.5;
    elevatorCar.add(floor);
    
    // Elevator car sides/walls (transparent so people visible)
    const wall1 = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.3, 2, carDepth * 2),
        carMaterial.clone()
    );
    wall1.position.set(-carSize.w / 2 + 0.6 * carSize.w, 1);
    elevatorCar.add(wall1);
    
    const wall2 = new THREE.Mesh(
        new THREE.BoxGeometry(carSize.w * 0.3, 2, carDepth * 2),
        carMaterial.clone()
    );
    wall2.position.set(-carSize.w / 2 + 1 - wall1.position.x, 1);
    elevatorCar.add(wall2);
    
    // Add car to group but NOT to scene (only via elevatorGroup)
    elevatorGroup.add(elevatorCar);
    
    return elevatorGroup;
}

/**
 * Creates a person on the specified floor and positions them at the elevator entrance
 */
function createPersonAtFloor(floorIndex, floorY) {
    const xPos = 0;
    const zPos = config.SHAFT_WIDTH / 2 + config.DOOR_GAP + config.DOOR_OPEN_TIME / 1000 * config.PERSON_MOVE_SPEED;
    
    person = createPerson(new THREE.Vector3(xPos, 0, zPos), floorY);
    scene.add(person.group);
    
    walkPerson(person, animationSpeedMultiplier);
}

/**
 * Check if doors are fully open or closed based on rotation and return the actual state
 */
function checkDoorState() {
    const leftRotation = -doorsLeft.rotation.y;
    const rightRotation = Math.abs(doorsRight.rotation.y);
    
    return {
        isOpen: leftRotation > 0,
        isClosed: Math.abs(leftRotation) < config.DOOR_GAP * 0.15 && Math.abs(rightRotation) < config.DOOR_GAP * 0.15
    };
}

/**
 * Wait for doors to complete animation (open or close)
 */
function waitForDoors(open = true) {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if ((open && checkDoorState().isOpen) || (!open && checkDoorState().isClosed)) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 50);
    });
}

/**
 * Animate doors opening (split from center outward)
 */
async function openDoors() {
    await waitForDoors(true);
    
    let leftProgress = 0;
    do {
        await new Promise(r => setTimeout(r, 20 / animationSpeedMultiplier));
        const gapSize = (config.DOOR_GAP + 0.15) * animationSpeedMultiplier;
        
        // Left door moves right on X-axis
        doorsLeft.position.x += gapSize;
        leftProgress += Math.min(animationSpeedMultiplier * 0.3, 0.1);
        
    } while (leftProgress < 1);
    
    await waitForDoors(true);
}

/**
 * Animate doors closing (slide inward from sides to center)
 */
async function closeDoors() {
    await openDoors(); // Wait for doors to be open first
    
    let rightProgress = 0;
    do {
        await new Promise(r => setTimeout(r, 20 / animationSpeedMultiplier));
        const gapSize = (config.DOOR_GAP + 0.15) * animationSpeedMultiplier;
        
        // Right door moves left on X-axis
        doorsRight.position.x -= gapSize;
        rightProgress += Math.min(animationSpeedMultiplier * 0.3, 0.1);
    } while (rightProgress < 1);
    
    // Wait a bit for doors to fully close before updating elevator position
    await new Promise(r => setTimeout(r, 50 / animationSpeedMultiplier));
}

/**
 * Move person through doors (to board or exit)
 */
async function movePersonThroughDoors(toBoard) {
    const delay = config.BOARDING_DELAY / 1000;
    
    for (let i = 0; i < delay; i++) {
        await new Promise(r => setTimeout(r, (20 / animationSpeedMultiplier)));
        
        if (toBoard && person.group.position.z < doorsRight.position.x) {
            person.group.position.z += config.PERSON_MOVE_SPEED * animationSpeedMultiplier;
        } else if (!toBoard && person.group.position.z > 0) {
            person.group.position.z -= config.PERSON_MOVE_SPEED * animationSpeedMultiplier;
        }
    }
}

/**
 * Move elevator to floor
 */
async function moveElevatorToFloor(targetFloor) {
    const targetY = (targetFloor + 0.5) * config.FLOOR_HEIGHT;
    const originY = currentFloorIndex * config.FLOOR_HEIGHT;
    const distance = Math.abs(targetY - originY); // Always positive
    
    let position = 0;
    do {
        await new Promise(r => setTimeout(r, (20 / animationSpeedMultiplier) / animationSpeedMultiplier));
        if (targetY > originY) {
            elevatorGroup.position.y += config.ELEVATOR_SPEED * animationSpeedMultiplier * (distance > 0.1 ? 1 : 0);
        } else if (targetY < originY) {
            elevatorGroup.position.y -= config.ELEVATOR_SPEED * animationSpeedMultiplier;
        }
    } while (position < distance * 5);
}

/**
 * Move person to waiting position at elevator entrance
 */
async function goToWaitingPosition(isBoarding) {
    await new Promise(r => setTimeout(r, 100 / animationSpeedMultiplier)); // Brief pause after doors change state
    
    let startPos;
    if (isBoarding) {
        startPos = new THREE.Vector3(0, 0, door);
    } else {
        startPos = person.group.position.clone();
    }
    
    const speed = config.PERSON_MOVE_SPEED * animationSpeedMultiplier;
    const waitingZ = config.DOOR_GAP + config.DOOR_OPEN_TIME / 1000;
    
    while (startPos.z > config.SHAFT_WIDTH / 2 - 0.5 || startPos.z < -config.SHAFT_WIDTH / 2 + 0.5) {
        await new Promise(r => setTimeout(r, 16));
        if (isBoarding && startPos.z > config.SHAFT_WIDTH / 2 - 0.5) {
            startPos.z -= speed;
        } else if (!isBoarding && startPos.z < -config.SHAFT_WIDTH / 2 + 0.5) {
            startPos.z += speed;
        }
    }
}

/**
 * Pick up person from floor and add to elevator (make child of elevator)
 */
async function pickUpPerson(originFloor, destinationFloor) {
    await openDoors();
    
    // Reset legs to standing before entering
    resetPersonLegs(person.leftLeg);
    resetPersonLegs(person.rightLeg);
    
    // Person walks forward into elevator
    walkPerson(person, animationSpeedMultiplier * 0.5);
    await movePersonThroughDoors(true);
    resetPersonLegs(person.leftLeg);
    resetPersonLegs(person.rightLeg);
    
    // Close doors before person inherits elevator position
    person.group.position.z = 0;
    await closeDoors();
}

/**
 * Exit person from elevator to destination floor
 */
async function exitPerson(originFloor, destinationFloor) {
    await openDoors();
    
    resetPersonLegs(person.leftLeg);
    resetPersonLegs(person.rightLeg);
    
    // Person walks forward out of elevator
    walkPerson(person, animationSpeedMultiplier * 0.5);
    await movePersonThroughDoors(false);
    resetPersonLegs(person.leftLeg);
    resetPersonLegs(person.rightLeg);
    
    // Close doors after person exits
    await closeDoors();
}

/**
 * Start the simulation - moves a random person to an empty floor
 */
async function startSimulation() {
    if (!isSimulationRunning) return;
    
    state.state = 'MOVING_TO_PICKUP';
    updateStatus('Moving to pickup floor');
    
    // Pick up person is currently on the floor, then move them to a different floor
    const fromFloor = state.originFloor;
    const toFloor = emptyFloorIndex;
    elevatorGroup.position.y = (fromFloor + 0.5) * config.FLOOR_HEIGHT;
    currentFloorIndex = fromFloor;
    
    await pickUpPerson(fromFloor, toFloor);
    
    state.state = 'MOVING_TO_DESTINATION';
    updateStatus('Moving to destination floor');
    
    elevatorGroup.position.y = (toFloor + 0.5) * config.FLOOR_HEIGHT;
    currentFloorIndex = toFloor;
    
    await exitPerson(fromFloor, toFloor);
    
    state.state = 'IDLE';
    updateStatus('Idle');
}

/**
 * Update UI status display
 */
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Animate walking legs while moving to position
 */
function animateWalking(personObj) {
    const time = Date.now() * 0.01;
    
    // Alternate leg swing using sine wave on X-axis
    personObj.leftLeg.rotation.x = Math.sin(time * 8) * 0.5;
    personObj.rightLeg.rotation.x = Math.sin(time * 8 + Math.PI) * 0.5;
}

/**
 * Main animation loop
 */
function animate() {
    requestAnimationFrame(animate);
    
    // Animate walking legs if appropriate
    if (person && state.state !== 'IDLE') {
        const speed = math.floor(animationSpeedMultiplier / 1) > 0 ? animationSpeedMultiplier : 1;
    }
    
    controls.update();
    renderer.render(scene, camera);
}
