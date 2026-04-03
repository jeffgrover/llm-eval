/**
 * elevator.js
 * Main simulation logic and building creation.
 */

// --- Constants ---
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 12;
const BUILDING_DEPTH = 12;

const SHAFT_WIDTH = 3;
const SHAFT_DEPTH = 3;

const ELEVATOR_SPEED = 0.05; // Units per frame (approx)
const PERSON_MOVE_SPEED = 0.08;

// --- Initialization ---
let scene, camera, renderer, controls;
let elevatorCar, building;
let floors = [];
let peopleOnFloors = []; // Array of { floorIndex, personObj }
let emptyFloorIndex = 0;

let animationSpeedMultiplier = 1.0;

// Elevator state
let elevatorTargetY = 0;
let elevatorIsMoving = false;
let elevatorDoorsOpen = false;

// Simulation loop helpers
let currentSequence = null; // A function representing the next step in an async sequence

async function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // CRITICAL for transparency
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create UI Slider for speed
    createUI();

    // Build objects
    createBuilding();
    createElevator();
    setupInitialPeople();

    // Start simulation cycle
    runSimulationCycle();

    animate();

    window.addEventListener('resize', onWindowResize, false);
}

function createUI() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.padding = '10px';
    container.style.background = 'rgba(255, 255, 255, 0.8)';
    container.style.borderRadius = '5px';
    container.style.fontFamily = 'sans-serif';

    const label = document.createElement('label');
    label.innerText = 'Animation Speed (1x - 20x): ';
    label.style.display = 'block';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.step = '1';
    slider.value = '1';
    slider.style.width = '150px';

    slider.addEventListener('input', (e) => {
        animationSpeedMultiplier = parseFloat(e.target.value);
    });

    container.appendChild(label);
    container.appendChild(slider);
    document.body.appendChild(container);
}

function createBuilding() {
    building = new THREE.Group();

    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide, 
        depthWrite: false 
    });
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide, 
        depthWrite: false 
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorGroup = new THREE.Group();
        const yPos = i * FLOOR_HEIGHT;

        // Floor Surface
        const floorGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.position.y = yPos;
        floorGroup.add(floorMesh);

        // Walls (semi-transparent)
        // Front wall (with cutout for shaft is handled by making the building walls large and adding the shaft later or using geometry subtraction)
        // Simpler approach: build 4 walls per floor but leave a hole in the middle.
        const createWall = (w, h, d, x, y, z) => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
            wall.position.set(x, y, z);
            floorGroup.add(wall);
        };

        // We build walls around the perimeter, avoiding the shaft area
        const wallThickness = 0.1;
        const wallHeight = FLOOR_HEIGHT;

        // Back wall
        createWall(BUILDING_WIDTH, wallHeight, wallThickness, 0, yPos + wallHeight/2, -BUILDING_DEPTH/2);
        // Left wall (split to avoid shaft)
        createWall((BUILDING_WIDTH - SHAFT_WIDTH)/2 - 0.5, wallHeight, wallThickness, -(BUILDING_WIDTH/2 + (BUILDING_WIDTH-SHAFT_WIDTH)/4)/2, yPos + wallHeight/2, 0); // This logic is getting complex, let's simplify
        
        // Simpler approach: Create a large box for the floor and use a subtraction? No, Three.js doesn't do that easily without CSG.
        // Let's just build 4 walls per floor. The shaft is in the center.
        // Walls are placed at the edges of the building.
        createWall(BUILDING_WIDTH, wallHeight, wallThickness, 0, yPos + wallHeight/2, -BUILDING_DEPTH/2); // Back
        createWall(BUILDING_WIDTH, wallHeight, wallThickness, 0, yPos + wallHeight/2, BUILDING_DEPTH/2);  // Front
        createWall(wallThickness, wallHeight, BUILDING_DEPTH, -BUILDING_WIDTH/2, yPos + wallHeight/2, 0); // Left
        createWall(wallThickness, wallHeight, BUILDING_DEPTH, BUILDING_WIDTH/2, yPos + wallHeight/2, 0);  // Right

        floorGroup.renderOrder = 0;
        building.add(floorGroup);
        floors.push({ group: floorGroup, y: yPos });
    }

    // Ground Floor and Roof (Solid)
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    
    const ground = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH), groundMat);
    ground.position.y = -0.1;
    building.add(ground);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH), roofMat);
    roof.position.y = (FLOOR_COUNT - 1) * FLOOR_HEIGHT + FLOOR_HEIGHT/2;
    building.add(roof);

    // Shaft cutout visualization: The shaft is naturally open because we didn't build walls in the middle.
    // However, we need to ensure floors have a hole in them.
    // Let's replace the floor surface with something that has a hole.
    floors.forEach(f => {
        f.group.remove(f.group.children[0]); // Remove previous solid floor mesh
        
        // Create 4 slabs for each floor to leave center empty
        const slabMat = floorMat;
        const sH = 0.1;
        const sW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const sD = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;

        // This is getting messy. Let's just use a single box for the floor and accept that we can't easily have holes without CSG.
        // Wait, I can just make several boxes!
        const slab1 = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, sH, sD), slabMat); // Front part
        slab1.position.set(0, f.y, (BUILDING_DEPTH + SHAFT_DEPTH)/4); 

        // Actually, let's build a single ring-like floor using several boxes.
        const createSlab = (w, d, x, z) => {
            const s = new THREE.Mesh(new THREE.BoxGeometry(w, sH, d), slabMat);
            s.position.set(x, f.y, z);
            f.group.add(s);
        };

        // 4 slabs for the floor ring
        createSlab(BUILDING_WIDTH, (BUILDING_DEPTH - SHAFT_DEPTH)/2, 0, (BUILDING_DEPTH + SHAFT_DEPTH)/4); // Front half
        createSlab(BUILDING_WIDTH, (BUILDING_DEPTH - SHAFT_DEPTH)/2, 0, -(BUILDING_DEPTH + SHAFT_DEPTH)/4); // Back half
        createSlab((BUILDING_WIDTH - SHAFT_WIDTH)/2, SHAFT_DEPTH, -(BUILDING_WIDTH + SHAFT_WIDTH)/4, 0); // Left side
        createSlab((BUILDING_WIDTH - SHAFT_WIDTH)/2, SHAFT_DEPTH, (BUILDING_WIDTH + SHAFT_WIDTH)/4, 0);  // Right side
    });

    building.renderOrder = 0;
    scene.add(building);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5, 
        side: THREE.DoubleSide, 
        depthWrite: false 
    });
    const doorMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7, 
        side: THREE.DoubleSide, 
        depthWrite: false 
    });

    // Frame (box)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH), frameMat);
    frame.position.y = (FLOOR_HEIGHT - 0.2) / 2; // Center relative to car
    elevatorCar.add(frame);

    // Doors (Left and Right halves)
    const doorGeom = new THREE.BoxGeometry(SHAFT_WIDTH / 2, FLOOR_HEIGHT - 0.2, 0.1);
    elevatorCar.doorLeft = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.doorRight = new THREE.Mesh(doorGeom, doorMat);

    // Position doors at the front (positive Z)
    elevatorCar.doorLeft.position.set(-SHAFT_WIDTH / 4, (FLOOR_HEIGHT - 0.2) / 2, SHAFT_DEPTH / 2);
    elevatorCar.doorRight.position.set(SHAFT_WIDTH / 4, (FLOOR_HEIGHT - 0.2) / 2, SHAFT_DEPTH / 2);

    elevatorCar.add(elevatorCar.doorLeft);
    elevatorCar.add(elevatorCar.doorRight);

    // Back wall (solid)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.2, 0.1), frameMat);
    backWall.position.set(0, (FLOOR_HEIGHT - 0.2) / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    // Side walls (transparent)
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH), sideMat);
    leftSide.position.set(-SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH), sideMat);
    rightSide.position.set(SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(rightSide);

    // Elevator is at bottom of shaft
    elevatorCar.position.y = 0;
    elevatorCar.renderOrder = 1;
    scene.add(elevatorCar);

    elevatorCar.state = 'closed'; // 'open' or 'closed'
}

function setupInitialPeople() {
    // One person on each floor except one empty floor
    emptyFloorIndex = Math.floor(Math.random() * FLOOR_COUNT);
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;

        const personObj = createPersonInstance();
        // Position at floor level, in front of shaft
        personObj.mesh.position.set(0, 0, (BUILDING_DEPTH + SHAFT_DEPTH)/2 + 1); // Wait in front
        personObj.mesh.rotation.y = Math.PI; // Face the elevator
        scene.add(personObj.mesh);

        peopleOnFloors.push({ floorIndex: i, personObj });
    }
}

function createPersonInstance() {
    // This calls the factory from person.js
    const p = createPerson(); 
    return p; // returns { mesh, leftLeg, rightLeg, totalHeight }
}

// --- Simulation Logic ---

async function runSimulationCycle() {
    while (true) {
        // 1. Pick a random occupied floor and the empty floor
        const occupiedIndices = peopleOnFloors.map(p => p.floorIndex);
        if (occupiedIndices.length === 0) break; // Should not happen

        const startFloorIdx = occupiedIndices[Math.floor(Math.random() * occupiedIndices.length)];
        const destFloorIdx = emptyFloorIndex;

        const personData = peopleOnFloors.find(p => p.floorIndex === startFloorIdx);
        if (!personData) continue;

        // 2. Sequence: Move elevator $\rightarrow$ open doors $\rightarrow$ walk in $\rightarrow$ close doors $\rightarrow$ move to dest $\rightarrow$ etc.
        await executeSequence(startFloorIdx, destFloorIdx, personData);

        // 3. Update empty floor index after movement is complete
        emptyFloorIndex = startFloorIdx;
    }
}

async function executeSequence(startFloorIdx, destFloorIdx, personData) {
    const person = personData.personObj;

    // Step 1: Elevator moves to pickup floor
    await moveElevatorTo(startFloorIdx);

    // Step 2: Doors open
    await animateDoors('open');

    // Step 3: Person walks forward into elevator
    await walkPersonIntoElevator(person, startFloorIdx);

    // Step 4: Doors close
    await animateDoors('closed');

    // Step 5: Elevator travels to destination floor
    await moveElevatorTo(destFloorIdx);

    // Step 6: Doors open at destination
    await animateDoors('open');

    // Step 7: Person walks forward out of elevator
    await walkPersonOutOfElevator(person, destFloorIdx);

    // Step 8: Doors close
    await animateDoors('closed');

    // Update person's floor index in tracking array
    personData.floorIndex = destFloorIdx;
}

// --- Animation Helpers (Async/Await based) ---

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * animationSpeedMultiplier));
}

async function moveElevatorTo(floorIdx) {
    const targetY = floorIdx * FLOOR_HEIGHT;
    elevatorTargetY = targetY;
    
    // Distance-based completion check
    while (Math.abs(elevatorCar.position.y - targetY) > 0.01) {
        const diff = targetY - elevatorCar.position.y;
        const step = Math.sign(diff) * ELEVATOR_SPEED * animationSpeedMultiplier;
        if (Math.abs(step) < 0.001) break;
        elevatorCar.position.y += step;
        await sleep(16); // ~60fps
    }
    elevatorCar.position.y = targetY;
    return new Promise(r => r());
}

async function animateDoors(state) {
    const openTarget = state === 'open' ? 1.2 : 0; // Distance they slide out
    // Note: specification says "retract from center outward" for opening, and "meet in middle" for closing.
    // Let's say door position X is relative to the car center.
    // Closed: Left at -SHAFT_WIDTH/4, Right at +SHAFT_WIDTH/4.
    // Open: Left at -SHAFT_WIDTH/2 (approx), Right at +SHAFT_WIDTH/2.

    const closedXLeft = -SHAFT_WIDTH / 4;
    const closedXRight = SHAFT_WIDTH / 4;
    const openXLeft = -SHAFT_WIDTH / 2 + 0.1; // Slight overlap? No, let's say just retracted
    const openXRight = SHAFT_WIDTH / 2 - 0.1;

    const targetXLeft = state === 'open' ? openXLeft : closedXLeft;
    const targetXRight = state === 'open' ? openXRight : closedXRight;

    while (Math.abs(elevatorCar.doorLeft.position.x - targetXLeft) > 0.01 || 
           Math.abs(elevatorCar.doorRight.position.x - targetXRight) > 0.01) {
        
        const step = ELEVATOR_SPEED * 0.5 * animationSpeedMultiplier;

        if (elevatorCar.doorLeft.position.x < targetXLeft) elevatorCar.doorLeft.position.x += step;
        else if (elevatorCar.doorLeft.position.x > targetXLeft) elevatorCar.doorLeft.position.x -= step;

        if (elevatorCar.doorRight.position.x < targetXRight) elevatorCar.doorRight.position.x += step;
        else if (elevatorCar.doorRight.position.x > targetXRight) elevatorCar.doorRight.position.x -= step;

        await sleep(16);
    }
    elevatorCar.state = state === 'open' ? 'open' : 'closed';
    return new Promise(r => r());
}

async function walkPersonIntoElevator(person, floorIdx) {
    const targetZ = (SHAFT_DEPTH / 2) + 0.5; // Just inside the elevator car
    // Current position is in front of shaft: Z = (BUILDING_DEPTH+SHAFT_DEPTH)/2 + 1
    // We want them to walk FORWARD (negative Z direction from their perspective, but they face -Z? No, they face elevator)
    // They are at positive Z. Elevator car is at Z=0 inside the shaft.
    // So they walk from large Z towards small Z.

    const startZ = person.mesh.position.z;
    const endZ = targetZ;

    await animateWalking(person, startZ, endZ, 0); // Moving along Z axis
    
    // Once reached: make child of elevator
    scene.attach(person.mesh); // Removes from scene but keeps world pos
    elevatorCar.add(person.mesh);
    
    // Adjust person position so they are relative to car center
    // Car is at 0,0,0 inside shaft. Person was at endZ (world).
    // In elevator local: x=0, y=0, z = endZ.
    person.mesh.position.set(0, 0, endZ);

    await sleep(300); // Brief delay as per spec
}

async function walkPersonOutOfElevator(person, floorIdx) {
    // Current pos is local to elevator car: x=0, y=0, z = targetZ (inside)
    const startZ = person.mesh.position.z;
    const endZ = (BUILDING_DEPTH + SHAFT_DEPTH)/2 + 1; // Back to waiting spot

    // Before walking, we must move from elevator local back to scene global context?
    // No, let's detach them first but at current world position.
    scene.attach(person.mesh); 
    // Now person is in scene coords. Their Z should be approx endZ relative to floor?
    // Let's make it easier: move them to a specific global target Z.

    await animateWalking(person, startZ, endZ, 0);
    
    // Ensure they face the elevator again (they were facing -Z)
    person.mesh.rotation.y = Math.PI;

    await sleep(300); // Brief delay
}

async function animateWalking(person, startZ, endZ, axis) {
    // In this simulation, we'll only walk along Z for simplicity.
    let progress = 0;
    const dist = Math.abs(endZ - startZ);
    if (dist < 0.01) return new Promise(r => r());

    let currentPos = startZ;
    const stepSize = PERSON_MOVE_SPEED * animationSpeedMultiplier;

    while (Math.abs(currentPos - endZ) > 0.01) {
        const direction = Math.sign(endZ - currentPos);
        currentPos += direction * stepSize;
        person.mesh.position.z = currentPos;

        // Animate legs using sine wave
        progress += 0.2 * animationSpeedMultiplier;
        const swing = Math.sin(progress) * 0.5;
        person.leftLeg.rotation.x = swing;
        person.rightLeg.rotation.x = -swing;

        await sleep(16);
    }
    
    // Reset legs to standing
    person.leftLeg.rotation.x = 0;
    person.rightLeg.rotation.x = 0;
    person.mesh.position.z = endZ;
    return new Promise(r => r());
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the app
init();
