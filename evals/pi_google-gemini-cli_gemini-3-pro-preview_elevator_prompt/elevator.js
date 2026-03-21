// elevator.js

// --- Constants ---
const FLOOR_HEIGHT = 10;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 40;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 12;
const SHAFT_DEPTH = 12;
const ELEVATOR_SPEED = 10; // Units per second
const PERSON_MOVE_SPEED = 5; // Units per second
const DOOR_OPEN_SPEED = 5; // Units per second

// --- Globals ---
let scene, camera, renderer, controls;
let elevatorCar;
let buildingGroup;
let peopleOnFloors = new Array(FLOOR_COUNT).fill(null);
let animationSpeed = 1.0;
let emptyFloorIndex = 0;
let lastTime = 0; // For custom delta calculation

// --- Initialization ---

function init() {
    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe0e0e0);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // Crucial for transparency
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Build Scene
    createBuilding();
    createElevator();
    createPeople();
    createUI();

    // Start Loop
    lastTime = performance.now();
    requestAnimationFrame(animate);
    
    // Start Simulation Logic
    setTimeout(startSimulationCycle, 1000);
}

// --- Building Creation ---

function createBuilding() {
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    // Floor Material (Transparent)
    const floorMat = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Wall Material (Transparent)
    const wallMat = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;

        // Create floor with hole using Shape and ExtrudeGeometry or Path
        // Easier: 4 rectangular meshes to form the floor around the shaft
        const sideW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const sideD = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        
        // Left
        const left = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.2, BUILDING_DEPTH), floorMat);
        left.position.set(-(SHAFT_WIDTH/2 + sideW/2), y, 0);
        left.renderOrder = 0;
        buildingGroup.add(left);

        // Right
        const right = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.2, BUILDING_DEPTH), floorMat);
        right.position.set((SHAFT_WIDTH/2 + sideW/2), y, 0);
        right.renderOrder = 0;
        buildingGroup.add(right);
        
        // Front (center)
        const front = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.2, sideD), floorMat);
        front.position.set(0, y, (SHAFT_DEPTH/2 + sideD/2));
        front.renderOrder = 0;
        buildingGroup.add(front);

        // Back (center)
        const back = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.2, sideD), floorMat);
        back.position.set(0, y, -(SHAFT_DEPTH/2 + sideD/2));
        back.renderOrder = 0;
        buildingGroup.add(back);
        
        // Walls (Optional visual guide)
        // Let's add simple corner posts
        const postGeo = new THREE.BoxGeometry(1, FLOOR_HEIGHT, 1);
        const postMat = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2 });
        
        const positions = [
            [-BUILDING_WIDTH/2, -BUILDING_DEPTH/2],
            [BUILDING_WIDTH/2, -BUILDING_DEPTH/2],
            [-BUILDING_WIDTH/2, BUILDING_DEPTH/2],
            [BUILDING_WIDTH/2, BUILDING_DEPTH/2]
        ];
        
        positions.forEach(pos => {
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(pos[0], y + FLOOR_HEIGHT/2, pos[1]);
            buildingGroup.add(post);
        });
    }
    
    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH), new THREE.MeshPhongMaterial({ color: 0x999999 }));
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
    buildingGroup.add(roof);

    // Ground
    const ground = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH + 20, 1, BUILDING_DEPTH + 20), new THREE.MeshPhongMaterial({ color: 0x555555 }));
    ground.position.set(0, -0.5, 0);
    scene.add(ground);
}

// --- Elevator Creation ---

function createElevator() {
    elevatorCar = new THREE.Group();
    
    // Frame Material
    const frameMat = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Door Material
    const doorMat = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const w = SHAFT_WIDTH - 1;
    const h = FLOOR_HEIGHT - 2;
    const d = SHAFT_DEPTH - 1;
    
    // Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), frameMat);
    // Position floor so top surface is at y=0.1
    floor.position.y = 0; 
    floor.renderOrder = 1;
    elevatorCar.add(floor);
    
    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), frameMat);
    ceiling.position.y = h;
    ceiling.renderOrder = 1;
    elevatorCar.add(ceiling);
    
    // Back Wall (Solid)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), new THREE.MeshPhongMaterial({ color: 0xffff00 }));
    backWall.position.set(0, h/2, -d/2);
    elevatorCar.add(backWall);
    
    // Side Walls (Transparent)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, d), frameMat);
    leftWall.position.set(-w/2, h/2, 0);
    leftWall.renderOrder = 1;
    elevatorCar.add(leftWall);
    
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, d), frameMat);
    rightWall.position.set(w/2, h/2, 0);
    rightWall.renderOrder = 1;
    elevatorCar.add(rightWall);
    
    // Doors (Front) - Split in two
    const doorW = w / 2;
    
    // Left Door (Starts at left side of front face)
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(doorW, h, 0.2), doorMat);
    // Closed position: Right edge at center (0). Center of door at -doorW/2.
    doorL.position.set(-doorW/2, h/2, d/2);
    doorL.userData = { 
        closedX: -doorW/2, 
        openX: -w/2 - doorW/2 + 0.5 // Retract outwards
    };
    doorL.renderOrder = 2;
    elevatorCar.add(doorL);
    elevatorCar.userData.doorL = doorL;
    
    // Right Door
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(doorW, h, 0.2), doorMat);
    // Closed position: Left edge at center (0). Center of door at doorW/2.
    doorR.position.set(doorW/2, h/2, d/2);
    doorR.userData = { 
        closedX: doorW/2, 
        openX: w/2 + doorW/2 - 0.5 // Retract outwards
    };
    doorR.renderOrder = 2;
    elevatorCar.add(doorR);
    elevatorCar.userData.doorR = doorR;
    
    scene.add(elevatorCar);
    
    elevatorCar.userData.currentFloor = 0;
    elevatorCar.userData.doorsOpen = false;
    elevatorCar.position.y = 0;
}

// --- People Management ---

function createPeople() {
    // 1 empty floor, rest occupied
    emptyFloorIndex = Math.floor(Math.random() * FLOOR_COUNT);
    
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;
        
        const person = window.createPerson();
        // Wait at Z = SHAFT_DEPTH/2 + 4
        // Face Elevator (-Z direction, so rotation Y = PI)
        person.position.set(0, i * FLOOR_HEIGHT, SHAFT_DEPTH/2 + 4);
        person.rotation.y = Math.PI;
        
        scene.add(person);
        peopleOnFloors[i] = person;
    }
}

// --- Simulation Logic ---

function startSimulationCycle() {
    let occupiedFloors = [];
    for(let i=0; i<FLOOR_COUNT; i++) {
        if(peopleOnFloors[i]) occupiedFloors.push(i);
    }
    
    if (occupiedFloors.length === 0) return;
    
    const sourceFloor = occupiedFloors[Math.floor(Math.random() * occupiedFloors.length)];
    const targetFloor = emptyFloorIndex;
    const person = peopleOnFloors[sourceFloor];
    
    // Sequence
    executeSequence([
        (cb) => moveElevatorToFloor(sourceFloor, cb),
        (cb) => delay(300, cb),
        (cb) => setDoorsOpen(true, cb),
        (cb) => delay(300, cb),
        (cb) => movePersonIntoElevator(person, sourceFloor, cb),
        (cb) => {
            // Update Logic
            peopleOnFloors[sourceFloor] = null;
            emptyFloorIndex = sourceFloor;
            cb();
        },
        (cb) => delay(300, cb),
        (cb) => setDoorsOpen(false, cb),
        (cb) => delay(300, cb),
        (cb) => moveElevatorToFloor(targetFloor, cb),
        (cb) => delay(300, cb),
        (cb) => setDoorsOpen(true, cb),
        (cb) => delay(300, cb),
        (cb) => movePersonOutOfElevator(person, targetFloor, cb),
        (cb) => {
            // Update Logic
            peopleOnFloors[targetFloor] = person;
            cb();
        },
        (cb) => delay(300, cb),
        (cb) => setDoorsOpen(false, cb),
        (cb) => delay(300, cb),
        (cb) => startSimulationCycle() // Loop
    ]);
}

function executeSequence(steps) {
    let index = 0;
    function next() {
        if (index < steps.length) {
            steps[index++](next);
        }
    }
    next();
}

function delay(ms, callback) {
    setTimeout(callback, ms / animationSpeed);
}

// --- Actions ---

function moveElevatorToFloor(floorIndex, onComplete) {
    const targetY = floorIndex * FLOOR_HEIGHT;
    
    animateProperty(elevatorCar.position, 'y', targetY, ELEVATOR_SPEED, onComplete);
}

function setDoorsOpen(isOpen, onComplete) {
    const doorL = elevatorCar.userData.doorL;
    const doorR = elevatorCar.userData.doorR;
    
    const targetL = isOpen ? doorL.userData.openX : doorL.userData.closedX;
    const targetR = isOpen ? doorR.userData.openX : doorR.userData.closedX;
    
    // Run two animations in parallel
    let completed = 0;
    const checkDone = () => {
        completed++;
        if (completed === 2) onComplete();
    };
    
    animateProperty(doorL.position, 'x', targetL, DOOR_OPEN_SPEED, checkDone);
    animateProperty(doorR.position, 'x', targetR, DOOR_OPEN_SPEED, checkDone);
}

function movePersonIntoElevator(person, floorIndex, onComplete) {
    person.userData.setWalking(true);
    const targetZ = 0; // Center of elevator
    
    animateProperty(person.position, 'z', targetZ, PERSON_MOVE_SPEED, () => {
        person.userData.setWalking(false);
        // Parent to elevator
        scene.remove(person);
        elevatorCar.add(person);
        person.position.set(0, 0.1, 0); // Feet on floor
        person.rotation.y = 0; // Face forward (doors)
        onComplete();
    }, (delta) => person.userData.update(delta));
}

function movePersonOutOfElevator(person, floorIndex, onComplete) {
    // Unparent first
    const worldPos = new THREE.Vector3();
    person.getWorldPosition(worldPos);
    
    elevatorCar.remove(person);
    scene.add(person);
    person.position.copy(worldPos);
    person.rotation.y = 0; // Face forward (out)
    
    person.userData.setWalking(true);
    const targetZ = SHAFT_DEPTH/2 + 4; // Waiting spot
    
    animateProperty(person.position, 'z', targetZ, PERSON_MOVE_SPEED, () => {
        person.userData.setWalking(false);
        person.rotation.y = Math.PI; // Turn around
        onComplete();
    }, (delta) => person.userData.update(delta));
}

// Generic animation helper
function animateProperty(obj, prop, target, speed, onComplete, onUpdate) {
    const start = obj[prop];
    const dist = Math.abs(target - start);
    if (dist < 0.01) {
        obj[prop] = target;
        if (onComplete) onComplete();
        return;
    }
    
    const direction = Math.sign(target - start);
    
    const animLoop = () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1) * animationSpeed;
        // Note: We use global lastTime which is updated in main loop? 
        // No, main loop updates lastTime. 
        // Actually, main loop should drive everything or we use a separate time tracker?
        // Let's use a local time tracker for this animation to be safe, 
        // BUT we need to respect global animationSpeed which might change.
        
        // Simpler: Just use fixed time step or rely on main loop?
        // Let's use requestAnimationFrame locally and calculate delta locally.
        
        // Wait, if I use a local `lastFrameTime`, it works.
        const frameDelta = clock.getDelta() * animationSpeed; 
        // I'll use a new Clock for each animation? No.
        // Let's just use `performance.now()`
    };
    
    let lastFrame = performance.now();
    
    const step = () => {
        const now = performance.now();
        const dt = (now - lastFrame) / 1000 * animationSpeed;
        lastFrame = now;
        
        const current = obj[prop];
        const move = speed * dt;
        
        if (Math.abs(target - current) <= move) {
            obj[prop] = target;
            if (onComplete) onComplete();
            return;
        }
        
        obj[prop] += direction * move;
        
        if (onUpdate) onUpdate(dt);
        
        requestAnimationFrame(step);
    };
    
    step();
}

// --- UI ---

function createUI() {
    const div = document.createElement('div');
    Object.assign(div.style, {
        position: 'absolute', top: '10px', left: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: '10px', borderRadius: '5px', fontFamily: 'sans-serif'
    });
    
    div.innerHTML = `
        <label>Animation Speed: <span id="speedVal">1.0</span>x</label><br>
        <input type="range" min="1" max="20" step="0.5" value="1" id="speedSlider" style="width: 200px;">
    `;
    
    document.body.appendChild(div);
    
    const slider = document.getElementById('speedSlider');
    const label = document.getElementById('speedVal');
    
    slider.addEventListener('input', (e) => {
        animationSpeed = parseFloat(e.target.value);
        label.innerText = animationSpeed.toFixed(1);
    });
}

// --- Main Loop ---

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- Resize Handler ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.onload = init;
