// elevator.js - Main simulation logic

// --- Configuration ---
const CONFIG = {
    FLOOR_COUNT: 6,
    FLOOR_HEIGHT: 10,
    BUILDING_WIDTH: 14,
    BUILDING_DEPTH: 14,
    SHAFT_WIDTH: 6,
    SHAFT_DEPTH: 6,
    ELEVATOR_SPEED: 8, // Units per second
    PERSON_MOVE_SPEED: 4, // Units per second
    DOOR_OPEN_SPEED: 3,
    WAIT_TIME: 300 // ms
};

// Global State
let scene, camera, renderer, controls;
let elevatorCar, buildingGroup;
let people = [];
let occupiedFloors = []; // Index = floor number, Value = Person object or null
let currentSpeedMultiplier = 1;
let globalTime = 0;

// Initialize
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(40, 40, 40);
    camera.lookAt(0, CONFIG.FLOOR_HEIGHT * 2, 0);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.sortObjects = true; // Critical for transparency
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 4. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, CONFIG.FLOOR_HEIGHT * 2.5, 0);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 6. UI Listeners
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.addEventListener('input', (e) => {
        currentSpeedMultiplier = parseFloat(e.target.value);
        speedValue.textContent = currentSpeedMultiplier + 'x';
    });

    // 7. Create Objects
    createBuilding();
    createElevator();
    initializePeople();

    // 8. Start Loop
    requestAnimationFrame(animate);
    
    // Start Simulation Cycle
    runSimulationCycle();
}

function createBuilding() {
    buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    const floorGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, 0.2, CONFIG.BUILDING_DEPTH);
    const wallMat = new THREE.MeshPhongMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const floorMat = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    for (let i = 0; i < CONFIG.FLOOR_COUNT; i++) {
        const y = i * CONFIG.FLOOR_HEIGHT;

        // Floor (using 4 planes to create cutout hole)
        const holeSizeX = CONFIG.SHAFT_WIDTH + 0.5;
        const holeSizeZ = CONFIG.SHAFT_DEPTH + 0.5;
        
        // Left
        const leftW = (CONFIG.BUILDING_WIDTH - holeSizeX) / 2;
        const left = new THREE.Mesh(new THREE.BoxGeometry(leftW, 0.2, CONFIG.BUILDING_DEPTH), floorMat);
        left.position.set(-(CONFIG.BUILDING_WIDTH/2 - leftW/2), y, 0);
        buildingGroup.add(left);
        
        // Right
        const right = new THREE.Mesh(new THREE.BoxGeometry(leftW, 0.2, CONFIG.BUILDING_DEPTH), floorMat);
        right.position.set((CONFIG.BUILDING_WIDTH/2 - leftW/2), y, 0);
        buildingGroup.add(right);

        // Back
        const backD = (CONFIG.BUILDING_DEPTH - holeSizeZ) / 2;
        const back = new THREE.Mesh(new THREE.BoxGeometry(holeSizeX, 0.2, backD), floorMat);
        back.position.set(0, y, -(CONFIG.BUILDING_DEPTH/2 - backD/2));
        buildingGroup.add(back);

        // Front
        const front = new THREE.Mesh(new THREE.BoxGeometry(holeSizeX, 0.2, backD), floorMat);
        front.position.set(0, y, (CONFIG.BUILDING_DEPTH/2 - backD/2));
        buildingGroup.add(front);
    }

    // Walls
    const wallGeoSide = new THREE.PlaneGeometry(CONFIG.BUILDING_DEPTH, CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT);
    const wallLeft = new THREE.Mesh(wallGeoSide, wallMat);
    wallLeft.position.set(-CONFIG.BUILDING_WIDTH/2, (CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT)/2 - CONFIG.FLOOR_HEIGHT/2, 0);
    wallLeft.rotation.y = Math.PI / 2;
    buildingGroup.add(wallLeft);

    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.BUILDING_WIDTH, CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT), wallMat);
    wallBack.position.set(0, (CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT)/2 - CONFIG.FLOOR_HEIGHT/2, -CONFIG.BUILDING_DEPTH/2);
    buildingGroup.add(wallBack);

    scene.add(buildingGroup);
    
    // Ground
    const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 40), new THREE.MeshLambertMaterial({ color: 0x444444 }));
    ground.position.y = -0.5;
    scene.add(ground);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    // Frame
    const carWidth = CONFIG.SHAFT_WIDTH - 0.5;
    const carHeight = 6; // Internal height
    const carDepth = CONFIG.SHAFT_DEPTH - 0.5;

    const frameMat = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(carWidth, 0.2, carDepth), frameMat);
    elevatorCar.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(carWidth, 0.2, carDepth), frameMat);
    ceiling.position.y = carHeight;
    elevatorCar.add(ceiling);

    // Back Wall (Solid)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(carWidth, carHeight, 0.1), new THREE.MeshLambertMaterial({color: 0xeeee00}));
    backWall.position.set(0, carHeight/2, -carDepth/2);
    elevatorCar.add(backWall);

    // Side Walls (Transparent frames)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, carHeight, carDepth), frameMat);
    leftWall.position.set(-carWidth/2, carHeight/2, 0);
    elevatorCar.add(leftWall);
    
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, carHeight, carDepth), frameMat);
    rightWall.position.set(carWidth/2, carHeight/2, 0);
    elevatorCar.add(rightWall);

    // Doors
    const doorMat = new THREE.MeshPhongMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    // Doors are slightly taller to fit well
    const doorGeo = new THREE.BoxGeometry(carWidth / 2, carHeight - 0.2, 0.1);
    
    const doorLeft = new THREE.Mesh(doorGeo, doorMat);
    doorLeft.position.set(-carWidth/4, carHeight/2, carDepth/2);
    elevatorCar.add(doorLeft);

    const doorRight = new THREE.Mesh(doorGeo, doorMat);
    doorRight.position.set(carWidth/4, carHeight/2, carDepth/2);
    elevatorCar.add(doorRight);

    // Store references for animation
    elevatorCar.userData = {
        doorLeft: doorLeft,
        doorRight: doorRight,
        doorState: 'closed',
        currentFloor: 0
    };

    scene.add(elevatorCar);
}

function initializePeople() {
    // Fill all floors except one random one
    const emptyFloor = Math.floor(Math.random() * CONFIG.FLOOR_COUNT);
    occupiedFloors = new Array(CONFIG.FLOOR_COUNT).fill(null);

    for (let i = 0; i < CONFIG.FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;

        const person = createPerson();
        // Position waiting outside elevator
        // Z offset: Shaft depth/2 + some waiting distance
        const waitZ = CONFIG.SHAFT_DEPTH / 2 + 2.5;
        
        person.position.set(0, i * CONFIG.FLOOR_HEIGHT, waitZ);
        person.rotation.y = Math.PI; // Face the elevator
        
        scene.add(person);
        occupiedFloors[i] = person;
        people.push(person);
    }
}

// --- Animation System ---

async function runSimulationCycle() {
    while (true) {
        // 1. Find a person to move
        const availableFloors = occupiedFloors.map((p, i) => p ? i : -1).filter(i => i !== -1);
        
        // If everyone is moving or something went wrong, wait
        if (availableFloors.length === 0) {
            await wait(1000);
            continue;
        }
        
        const pickupFloor = availableFloors[Math.floor(Math.random() * availableFloors.length)];
        const person = occupiedFloors[pickupFloor];
        
        // Find empty floor (destination)
        // Note: In this simple logic, there should always be one empty floor if we have N floors and N-1 people.
        const destFloor = occupiedFloors.findIndex(p => p === null);

        updateStatus(`Picking up passenger at Floor ${pickupFloor + 1}...`);

        // 2. Move Elevator to Pickup
        await moveElevatorTo(pickupFloor);
        await wait(CONFIG.WAIT_TIME);

        // 3. Open Doors
        await operateDoors('open');
        await wait(CONFIG.WAIT_TIME);

        // 4. Person Enters
        updateStatus(`Boarding...`);
        // Target: Center of elevator (World Y is current elevator Y)
        const enterTarget = new THREE.Vector3(0, 0, 0); // Local target if we were parenting, but we use logic to handle world
        await movePerson(person, enterTarget, true); // true = boarding
        occupiedFloors[pickupFloor] = null;
        await wait(CONFIG.WAIT_TIME);

        // 5. Close Doors
        await operateDoors('close');
        await wait(CONFIG.WAIT_TIME);

        // 6. Move to Destination
        updateStatus(`Going to Floor ${destFloor + 1}...`);
        await moveElevatorTo(destFloor);
        await wait(CONFIG.WAIT_TIME);

        // 7. Open Doors
        await operateDoors('open');
        await wait(CONFIG.WAIT_TIME);

        // 8. Person Exits
        updateStatus(`Exiting...`);
        const exitZ = CONFIG.SHAFT_DEPTH / 2 + 2.5;
        const exitTarget = new THREE.Vector3(0, destFloor * CONFIG.FLOOR_HEIGHT, exitZ);
        await movePerson(person, exitTarget, false); // false = exiting
        occupiedFloors[destFloor] = person;
        await wait(CONFIG.WAIT_TIME);

        // 9. Close Doors
        await operateDoors('close');
        await wait(CONFIG.WAIT_TIME * 3);
    }
}

function updateStatus(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
}

// Promisified Helpers

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms / currentSpeedMultiplier));
}

function moveElevatorTo(targetFloorIndex) {
    return new Promise(resolve => {
        const targetY = targetFloorIndex * CONFIG.FLOOR_HEIGHT;
        let lastFrame = performance.now();

        const animateMove = () => {
            const now = performance.now();
            const delta = Math.min((now - lastFrame) / 1000, 0.1) * currentSpeedMultiplier;
            lastFrame = now;

            const step = CONFIG.ELEVATOR_SPEED * delta;
            const diff = targetY - elevatorCar.position.y;
            
            if (Math.abs(diff) < step) {
                elevatorCar.position.y = targetY;
                elevatorCar.userData.currentFloor = targetFloorIndex;
                resolve();
                return;
            }

            elevatorCar.position.y += Math.sign(diff) * step;
            requestAnimationFrame(animateMove);
        };
        animateMove();
    });
}

function operateDoors(action) { // 'open' or 'close'
    return new Promise(resolve => {
        const doorL = elevatorCar.userData.doorLeft;
        const doorR = elevatorCar.userData.doorRight;
        const carWidth = CONFIG.SHAFT_WIDTH - 0.5;
        
        // Closed: L = -carWidth/4, R = carWidth/4
        // Open: L = -carWidth/2, R = carWidth/2
        
        const targetX_L = action === 'open' ? -carWidth/2 + 0.1 : -carWidth/4;
        const targetX_R = action === 'open' ? carWidth/2 - 0.1 : carWidth/4;
        
        let lastFrame = performance.now();

        const animateDoor = () => {
            const now = performance.now();
            const delta = Math.min((now - lastFrame) / 1000, 0.1) * currentSpeedMultiplier;
            lastFrame = now;

            const step = CONFIG.DOOR_OPEN_SPEED * delta;
            let doneL = false;
            let doneR = false;

            // Move Left Door
            const diffL = targetX_L - doorL.position.x;
            if (Math.abs(diffL) < step) {
                doorL.position.x = targetX_L;
                doneL = true;
            } else {
                doorL.position.x += Math.sign(diffL) * step;
            }

            // Move Right Door
            const diffR = targetX_R - doorR.position.x;
            if (Math.abs(diffR) < step) {
                doorR.position.x = targetX_R;
                doneR = true;
            } else {
                doorR.position.x += Math.sign(diffR) * step;
            }

            if (doneL && doneR) {
                elevatorCar.userData.doorState = action === 'open' ? 'open' : 'closed';
                resolve();
                return;
            }
            requestAnimationFrame(animateDoor);
        };
        animateDoor();
    });
}

function movePerson(person, targetPos, isBoarding) {
    return new Promise(resolve => {
        person.userData.isWalking = true;
        
        if (!isBoarding) {
            // Exiting: Detach first to move in world space
            // Attach to scene while maintaining world position
            if (person.parent !== scene) {
                scene.attach(person);
            }
            // Ensure exact floor level alignment (fix floating point drift)
            person.position.y = elevatorCar.position.y;
        }

        // Calculate Target World Position
        // If boarding, target is elevator position (which changes if elevator moves, but here elevator is stationary)
        // If boarding, target is (0, elevatorY, 0)
        
        const finalTargetWorld = isBoarding 
            ? new THREE.Vector3(0, elevatorCar.position.y, 0)
            : targetPos;

        let lastFrame = performance.now();

        const animateWalk = () => {
            const now = performance.now();
            const delta = Math.min((now - lastFrame) / 1000, 0.1) * currentSpeedMultiplier;
            lastFrame = now;

            const step = CONFIG.PERSON_MOVE_SPEED * delta;
            
            const currentPos = person.position.clone();
            const dist = currentPos.distanceTo(finalTargetWorld);

            if (dist < step) {
                person.position.copy(finalTargetWorld);
                person.userData.isWalking = false;
                
                if (isBoarding) {
                    // Attach to elevator for travel
                    elevatorCar.attach(person);
                    // Reset local orientation/pos to be clean
                    person.position.set(0, 0, 0);
                    person.rotation.set(0, 0, 0); // Face +Z (Doors)
                } else {
                    person.lookAt(new THREE.Vector3(0, person.position.y, 0)); // Look back at elevator?
                    // Actually prompt says "Face elevator (rotate 180° to look toward doors)"
                    // Since person is at +Z looking at 0, they should face -Z.
                    // Wait, elevator is at 0. Person at +Z. To face elevator, rotation should be PI?
                    // Let's explicitly set rotation to PI
                    person.rotation.y = Math.PI;
                }
                
                resolve();
                return;
            }

            // Move
            const direction = new THREE.Vector3().subVectors(finalTargetWorld, currentPos).normalize();
            person.position.add(direction.multiplyScalar(step));
            
            // Look at target while walking
            person.lookAt(finalTargetWorld);

            requestAnimationFrame(animateWalk);
        };
        animateWalk();
    });
}

// Main Loop
let mainLastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);
    
    // Controls update
    controls.update();

    // Calculate global delta for leg animations
    if (mainLastTime === 0) mainLastTime = time;
    const delta = (time - mainLastTime) / 1000;
    mainLastTime = time;

    // We pass the MULTIPLIED delta to the animation update
    const animDelta = delta * currentSpeedMultiplier;

    // Update visual animations (legs swinging)
    // We update ALL people, whether in scene or in elevator
    people.forEach(p => {
        if (p.updateAnimation) p.updateAnimation(animDelta);
    });

    renderer.render(scene, camera);
}

// Start
window.onload = init;
window.onresize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};
