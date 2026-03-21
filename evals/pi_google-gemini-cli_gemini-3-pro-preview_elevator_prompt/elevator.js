// elevator.js

// --- CONFIGURATION ---
const CONFIG = {
    FLOOR_HEIGHT: 5,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 12,
    BUILDING_DEPTH: 12,
    SHAFT_WIDTH: 4,
    SHAFT_DEPTH: 4,
    ELEVATOR_SPEED: 2.0, // Units per second
    PERSON_MOVE_SPEED: 2.5, // Units per second
    DOOR_OPEN_SPEED: 2.0, // Units per second
    WAIT_TIME: 0.3, // Seconds
    Z_WAIT_POS: 4.5, // Distance from center where person waits
    PERSON_SCALE: 1.5 // Scale the person model
};

// --- GLOBALS ---
let scene, camera, renderer, controls;
let elevatorCar, leftDoor, rightDoor;
let floors = []; // Array of { mesh, person: Object3D|null }
let people = []; // Array of all people
let animationState = {
    phase: 'IDLE', // IDLE, MOVE_TO_SRC, OPEN_SRC, BOARD, CLOSE_SRC, MOVE_TO_DEST, OPEN_DEST, EXIT, CLOSE_DEST
    timer: 0,
    sourceFloor: 0,
    destFloor: 0,
    activePerson: null,
    elevatorY: 0
};

let lastTime = 0;
let speedMultiplier = 1;

// --- INITIALIZATION ---
function init() {
    // Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0); // Light gray background

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT / 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // Crucial for transparency
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, CONFIG.FLOOR_HEIGHT * 2, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Create World
    createBuilding();
    createElevator();
    initializePeople();

    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    
    // Start Loop
    requestAnimationFrame(animate);
}

function createBuilding() {
    // Floors
    const floorGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, 0.2, CONFIG.BUILDING_DEPTH);
    
    // Create a hole in the floor geometry is hard with BoxGeometry. 
    // Easier: Create 4 boxes around the shaft? Or use ShapeGeometry with hole.
    // Let's use 4 boxes to frame the shaft.
    // Top/Bottom (Z axis), Left/Right (X axis)
    
    /* 
       _______
      |   A   |
      |_______|
      |B|   |C|
      | |___| |
      |___D___|
    */
    
    const halfBuildW = CONFIG.BUILDING_WIDTH / 2;
    const halfBuildD = CONFIG.BUILDING_DEPTH / 2;
    const halfShaftW = CONFIG.SHAFT_WIDTH / 2;
    const halfShaftD = CONFIG.SHAFT_DEPTH / 2;

    // Floor Material
    const floorMat = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Helper to make a floor plate
    function createFloorPlate(y) {
        const group = new THREE.Group();
        group.renderOrder = 0;

        // Part A (Back)
        const backD = halfBuildD - halfShaftD;
        const backGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, 0.2, backD);
        const backMesh = new THREE.Mesh(backGeo, floorMat);
        backMesh.position.set(0, 0, -(halfShaftD + backD/2));
        group.add(backMesh);

        // Part D (Front)
        const frontD = halfBuildD - halfShaftD;
        const frontGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, 0.2, frontD);
        const frontMesh = new THREE.Mesh(frontGeo, floorMat);
        frontMesh.position.set(0, 0, (halfShaftD + frontD/2));
        group.add(frontMesh);

        // Part B (Left)
        const sideW = halfBuildW - halfShaftW;
        const sideGeo = new THREE.BoxGeometry(sideW, 0.2, CONFIG.SHAFT_DEPTH);
        const leftMesh = new THREE.Mesh(sideGeo, floorMat);
        leftMesh.position.set(-(halfShaftW + sideW/2), 0, 0);
        group.add(leftMesh);

        // Part C (Right)
        const rightMesh = new THREE.Mesh(sideGeo, floorMat);
        rightMesh.position.set((halfShaftW + sideW/2), 0, 0);
        group.add(rightMesh);

        group.position.y = y;
        return group;
    }

    for (let i = 0; i < CONFIG.FLOOR_COUNT; i++) {
        const y = i * CONFIG.FLOOR_HEIGHT;
        const floorGroup = createFloorPlate(y);
        scene.add(floorGroup);
        
        floors.push({ y: y, person: null, index: i });
    }

    // Walls (Simple enclosure)
    // Left Wall
    const sideWallGeo = new THREE.BoxGeometry(0.2, CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT, CONFIG.BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-CONFIG.BUILDING_WIDTH/2, (CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT)/2 - CONFIG.FLOOR_HEIGHT/2, 0); // Approx center
    leftWall.renderOrder = 0;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(CONFIG.BUILDING_WIDTH/2, (CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT)/2 - CONFIG.FLOOR_HEIGHT/2, 0);
    rightWall.renderOrder = 0;
    scene.add(rightWall);
    
    // Back Wall
    const backWallGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT, 0.2);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, (CONFIG.FLOOR_HEIGHT * CONFIG.FLOOR_COUNT)/2 - CONFIG.FLOOR_HEIGHT/2, -CONFIG.BUILDING_DEPTH/2);
    backWall.renderOrder = 0;
    scene.add(backWall);

    // Roof
    const roofGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH, 0.5, CONFIG.BUILDING_DEPTH);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Solid roof
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = (CONFIG.FLOOR_COUNT - 1) * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT; 
    scene.add(roof);

    // Ground
    const groundGeo = new THREE.BoxGeometry(CONFIG.BUILDING_WIDTH + 4, 1, CONFIG.BUILDING_DEPTH + 4);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    scene.add(ground);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    const width = CONFIG.SHAFT_WIDTH * 0.9;
    const height = 3.5; // Enough for person
    const depth = CONFIG.SHAFT_DEPTH * 0.9;
    
    // Frame Material
    const frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Floor
    const floorGeo = new THREE.BoxGeometry(width, 0.1, depth);
    const floor = new THREE.Mesh(floorGeo, frameMat);
    floor.position.y = 0.05; // Align floor surface
    elevatorCar.add(floor);

    // Ceiling
    const ceilGeo = new THREE.BoxGeometry(width, 0.1, depth);
    const ceil = new THREE.Mesh(ceilGeo, frameMat);
    ceil.position.y = height;
    elevatorCar.add(ceil);

    // Back Wall
    const backGeo = new THREE.BoxGeometry(width, height, 0.1);
    // Requirements say "Solid back wall"
    const solidBackMat = new THREE.MeshLambertMaterial({ color: 0xffff00 });
    const back = new THREE.Mesh(backGeo, solidBackMat);
    back.position.set(0, height/2, -depth/2);
    elevatorCar.add(back);

    // Side Walls (Transparent)
    const sideGeo = new THREE.BoxGeometry(0.1, height, depth);
    const leftSide = new THREE.Mesh(sideGeo, frameMat);
    leftSide.position.set(-width/2, height/2, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, frameMat);
    rightSide.position.set(width/2, height/2, 0);
    elevatorCar.add(rightSide);

    // Doors
    const doorWidth = width / 2;
    const doorHeight = height;
    const doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.1), doorMat);
    leftDoor.position.set(-doorWidth/2, doorHeight/2, depth/2);
    elevatorCar.add(leftDoor);

    rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.1), doorMat);
    rightDoor.position.set(doorWidth/2, doorHeight/2, depth/2);
    elevatorCar.add(rightDoor);
    
    // Store door initial x for animation
    elevatorCar.userData = {
        leftDoorClosedX: -doorWidth/2,
        rightDoorClosedX: doorWidth/2,
        doorOpenOffset: doorWidth * 0.9, // How far they slide
        doorState: 0 // 0=closed, 1=open
    };

    scene.add(elevatorCar);
}

function initializePeople() {
    // 6 floors. 1 empty. 5 people.
    // Let's populate 0, 1, 2, 3, 4. Leave 5 empty.
    
    // Shuffle indices
    const indices = Array.from({length: CONFIG.FLOOR_COUNT}, (_, i) => i);
    // Simple shuffle
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Pick first N-1 floors for people
    for (let i = 0; i < CONFIG.FLOOR_COUNT - 1; i++) {
        const floorIndex = indices[i];
        const person = createPerson();
        person.scale.set(CONFIG.PERSON_SCALE, CONFIG.PERSON_SCALE, CONFIG.PERSON_SCALE);
        
        // Position: 
        // Floor Y
        // Z = Wait Pos
        // X = Random slight offset? No, keep center for simplicity of logic
        
        const y = floors[floorIndex].y + 0.1;
        person.position.set(0, y, CONFIG.Z_WAIT_POS);
        
        // Face elevator: elevator is at Z=0. Person at Z=4.5.
        // Needs to face -Z.
        person.rotation.y = Math.PI; 

        scene.add(person);
        floors[floorIndex].person = person;
        people.push(person);
    }

    // One floor remains null (empty)
}

function chooseNextMove() {
    // Find empty floor
    const emptyFloorIndex = floors.findIndex(f => f.person === null);
    
    // Find occupied floors
    const occupiedIndices = floors
        .map((f, i) => f.person !== null ? i : -1)
        .filter(i => i !== -1);
    
    if (occupiedIndices.length === 0) return; // Should not happen

    // Pick random person
    const sourceIndex = occupiedIndices[Math.floor(Math.random() * occupiedIndices.length)];

    animationState.sourceFloor = sourceIndex;
    animationState.destFloor = emptyFloorIndex;
    animationState.activePerson = floors[sourceIndex].person;
    
    // Clear person from source floor registry immediately to prevent double booking?
    // Better to do it when they leave. But for logic here, we just set state.
    
    animationState.phase = 'MOVE_TO_SRC';
    console.log(`Moving person from Floor ${sourceIndex} to Floor ${emptyFloorIndex}`);
}

// --- ANIMATION LOOP ---
function animate(time) {
    requestAnimationFrame(animate);

    // Calculate Delta Time
    const rawDelta = (time - lastTime) / 1000;
    lastTime = time;
    const delta = rawDelta * speedMultiplier;

    // Update Controls
    controls.update();

    // Logic
    processAnimation(delta);

    // Render
    renderer.render(scene, camera);
}

function processAnimation(dt) {
    // Check Speed Slider
    const slider = document.getElementById('speedSlider');
    if (slider) {
        speedMultiplier = parseFloat(slider.value);
        document.getElementById('speedValue').textContent = speedMultiplier + 'x';
    }

    // Update all people walking animations
    people.forEach(p => {
        if (typeof updatePersonAnimation === 'function') {
            updatePersonAnimation(p, dt, 1); // Internal speed inside person.js
        }
    });

    const elevatorY = elevatorCar.position.y;
    const doorL = leftDoor;
    const doorR = rightDoor;
    const carData = elevatorCar.userData;

    switch (animationState.phase) {
        case 'IDLE':
            animationState.timer -= dt;
            if (animationState.timer <= 0) {
                chooseNextMove();
            }
            break;

        case 'MOVE_TO_SRC': {
            const targetY = floors[animationState.sourceFloor].y;
            const dir = Math.sign(targetY - elevatorY);
            if (Math.abs(targetY - elevatorY) < 0.05) {
                elevatorCar.position.y = targetY;
                animationState.phase = 'OPEN_SRC';
                animationState.timer = CONFIG.WAIT_TIME;
            } else {
                elevatorCar.position.y += dir * CONFIG.ELEVATOR_SPEED * dt;
            }
            break;
        }

        case 'OPEN_SRC':
            animationState.timer -= dt;
            if (animationState.timer <= 0) {
                // Open Doors
                // Move L to -X, R to +X
                const targetL = carData.leftDoorClosedX - carData.doorOpenOffset;
                if (doorL.position.x > targetL + 0.01) {
                    const move = CONFIG.DOOR_OPEN_SPEED * dt;
                    doorL.position.x = Math.max(targetL, doorL.position.x - move);
                    doorR.position.x = -doorL.position.x; // Symmetric
                } else {
                    animationState.phase = 'BOARD';
                    // Prepare person
                    const p = animationState.activePerson;
                    if (p) {
                        p.userData.isWalking = true;
                        // Face elevator (should already be)
                    }
                }
            }
            break;

        case 'BOARD': {
            const p = animationState.activePerson;
            // Person walks from Z_WAIT_POS to 0 (center of elevator)
            // They are currently in Scene coordinates
            // Their Z is decreasing (walking forward to -Z direction)
            
            // Current position is global
            const targetZ = 0; 
            // Note: Person is at Global (0, floorY, waitZ). Elevator is at (0, floorY, 0).
            // We want person to move to (0, floorY, 0).
            
            const dist = p.position.z - targetZ;
            
            if (dist > 0.1) {
                p.position.z -= CONFIG.PERSON_MOVE_SPEED * dt;
            } else {
                // Arrived
                p.position.z = 0;
                p.userData.isWalking = false;
                
                // PARENT TO ELEVATOR
                // 1. Remove from scene
                scene.remove(p);
                // 2. Add to elevator
                elevatorCar.add(p);
                // 3. Reset local position
                // Elevator is at (0, Y, 0). Person was at (0, Y, 0).
                // So local position is (0, 0, 0).
                // Wait! Person origin is at feet.
                // Elevator origin is center of floor? 
                // Elevator geometry: floor is at y=0 relative to elevator group.
                // So yes, person local position (0,0,0) puts feet on floor.
                p.position.set(0, 0.1, 0); // Feet on elevator floor surface
                p.rotation.y = Math.PI; // Face door (outwards? No, face back or front? usually turn around. Requirement says: "180 deg to look toward doors" initially. When inside, usually turn around.
                // Prompt doesn't specify turning around inside. 
                // "Doors close... Elevator travels... Doors open... Person walks forward".
                // If they walk forward to exit, they must face the door.
                // So they must turn around 180 degrees once inside.
                // Let's flip them instantly or smooth? Instantly is easier.
                p.rotation.y = 0; // Face +Z (Front)
                
                // Clear floor record
                floors[animationState.sourceFloor].person = null;
                
                animationState.phase = 'CLOSE_SRC';
                animationState.timer = CONFIG.WAIT_TIME;
            }
            break;
        }

        case 'CLOSE_SRC':
            animationState.timer -= dt;
            if (animationState.timer <= 0) {
                const targetL = carData.leftDoorClosedX;
                if (doorL.position.x < targetL - 0.01) {
                    const move = CONFIG.DOOR_OPEN_SPEED * dt;
                    doorL.position.x = Math.min(targetL, doorL.position.x + move);
                    doorR.position.x = -doorL.position.x;
                } else {
                    animationState.phase = 'MOVE_TO_DEST';
                }
            }
            break;

        case 'MOVE_TO_DEST': {
            const targetY = floors[animationState.destFloor].y;
            const dir = Math.sign(targetY - elevatorY);
            if (Math.abs(targetY - elevatorY) < 0.05) {
                elevatorCar.position.y = targetY;
                animationState.phase = 'OPEN_DEST';
                animationState.timer = CONFIG.WAIT_TIME;
            } else {
                elevatorCar.position.y += dir * CONFIG.ELEVATOR_SPEED * dt;
            }
            break;
        }

        case 'OPEN_DEST':
            animationState.timer -= dt;
            if (animationState.timer <= 0) {
                const targetL = carData.leftDoorClosedX - carData.doorOpenOffset;
                if (doorL.position.x > targetL + 0.01) {
                    const move = CONFIG.DOOR_OPEN_SPEED * dt;
                    doorL.position.x = Math.max(targetL, doorL.position.x - move);
                    doorR.position.x = -doorL.position.x;
                } else {
                    animationState.phase = 'EXIT';
                    const p = animationState.activePerson;
                    if (p) {
                        p.userData.isWalking = true;
                    }
                }
            }
            break;

        case 'EXIT': {
            const p = animationState.activePerson;
            // Person is child of elevator.
            // Move from local (0,0,0) to local (0,0, Z_WAIT_POS) effectively.
            
            // First, unparent immediately? Or move then unparent?
            // "Use elevatorCar.add(person) after boarding, scene.add(person) after exiting"
            // "Exiting" implies the process.
            // If I keep them child, they move with elevator (which is stationary).
            // Let's move them in local space first.
            
            const targetZ = CONFIG.Z_WAIT_POS;
            if (p.position.z < targetZ - 0.1) {
                p.position.z += CONFIG.PERSON_MOVE_SPEED * dt;
            } else {
                // Arrived outside
                // Re-parent to scene
                const worldPos = new THREE.Vector3();
                p.getWorldPosition(worldPos);
                
                elevatorCar.remove(p);
                scene.add(p);
                p.position.copy(worldPos);
                
                // Turn around to face elevator for next time
                p.rotation.y = Math.PI;
                p.userData.isWalking = false;

                // Update floor record
                floors[animationState.destFloor].person = p;
                
                animationState.phase = 'CLOSE_DEST';
                animationState.timer = CONFIG.WAIT_TIME;
            }
            break;
        }

        case 'CLOSE_DEST':
            animationState.timer -= dt;
            if (animationState.timer <= 0) {
                const targetL = carData.leftDoorClosedX;
                if (doorL.position.x < targetL - 0.01) {
                    const move = CONFIG.DOOR_OPEN_SPEED * dt;
                    doorL.position.x = Math.min(targetL, doorL.position.x + move);
                    doorR.position.x = -doorL.position.x;
                } else {
                    animationState.phase = 'IDLE';
                    animationState.activePerson = null;
                    animationState.timer = 0.5; // Brief pause before next thought
                }
            }
            break;
    }
}

// Window Resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start
init();
