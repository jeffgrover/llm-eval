/**
 * elevator.js
 * Main simulation logic for the 3D elevator visualization.
 */

// Configuration Constants
const FLOOR_HEIGHT = 5;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 12;
const BUILDING_DEPTH = 12;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 4;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1.5;
const DOOR_OPEN_X = SHAFT_WIDTH * 0.45;
const DOOR_CLOSE_X = 0;
const DOOR_SPEED = 2;

// Colors
const COLOR_ELEVATOR = 0xffff00;
const COLOR_DOOR = 0xcccc00;
const COLOR_FLOOR = 0xcccccc;
const COLOR_WALL = 0x9999ff;
const COLOR_PERSON_BODY = 0x3498db;
const COLOR_PERSON_HEAD = 0xffdbac;
const COLOR_PERSON_LEGS = 0x2c3e50;

// Simulation State
let scene, camera, renderer, controls;
let elevatorCar;
let floors = [];
let people = []; // Array of { mesh, floor }
let emptyFloor = 0;
let simulationSpeed = 1;
let currentAction = null;
let lastTime = 0;

// State Machine Steps
const STATE_IDLE = 'IDLE';
const STATE_MOVING_TO_PICKUP = 'MOVING_TO_PICKUP';
const STATE_OPENING_DOORS_PICKUP = 'OPENING_DOORS_PICKUP';
const STATE_PERSON_ENTERING = 'STATE_PERSON_ENTERING';
const STATE_CLOSING_DOORS_PICKUP = 'CLOSING_DOORS_PICKUP';
const STATE_MOVING_TO_DEST = 'STATE_MOVING_TO_DEST';
const STATE_OPENING_DOORS_DEST = 'STATE_OPENING_DOORS_DEST';
const STATE_PERSON_EXITING = 'STATE_PERSON_EXITING';
const STATE_CLOSING_DOORS_DEST = 'STATE_CLOSING_DOORS_DEST';

let currentState = STATE_IDLE;
let activePerson = null;
let targetFloor = 0;

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // 2. Build World
    createBuilding();
    createElevator();
    setupPeople();

    // 3. UI Events
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value);
        speedVal.innerText = simulationSpeed + 'x';
    });

    window.addEventListener('resize', onWindowResize, false);

    // 4. Start Loop
    requestAnimationFrame(animate);
}

function createBuilding() {
    // Materials
    const floorMat = new THREE.MeshStandardMaterial({
        color: COLOR_FLOOR,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const wallMat = new THREE.MeshStandardMaterial({
        color: COLOR_WALL,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Create Floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorGroup = new THREE.Group();
        floorGroup.position.y = i * FLOOR_HEIGHT;

        // Floor surface with cutout for shaft
        // We'll use 4 planes around the shaft for simplicity instead of a complex shape
        const sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const sideDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;

        const planes = [
            { w: BUILDING_WIDTH, d: sideDepth, x: 0, z: -(SHAFT_DEPTH / 2 + sideDepth / 2) }, // Back
            { w: BUILDING_WIDTH, d: sideDepth, x: 0, z: (SHAFT_DEPTH / 2 + sideDepth / 2) },  // Front
            { w: sideWidth, d: SHAFT_DEPTH, x: -(SHAFT_WIDTH / 2 + sideWidth / 2), z: 0 },   // Left
            { w: sideWidth, d: SHAFT_DEPTH, x: (SHAFT_WIDTH / 2 + sideWidth / 2), z: 0 }     // Right
        ];

        planes.forEach(p => {
            const geo = new THREE.PlaneGeometry(p.w, p.d);
            const mesh = new THREE.Mesh(geo, floorMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(p.x, 0, p.z);
            mesh.renderOrder = 0;
            floorGroup.add(mesh);
        });

        // Special case: Ground floor is solid
        if (i === 0) {
            const centerGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, SHAFT_DEPTH);
            const centerMesh = new THREE.Mesh(centerGeo, floorMat);
            centerMesh.rotation.x = -Math.PI / 2;
            centerMesh.position.set(0, 0, 0);
            centerMesh.renderOrder = 0;
            floorGroup.add(centerMesh);
        }

        scene.add(floorGroup);
    }

    // Outer Walls (Semi-transparent)
    const wallGeoY = FLOOR_COUNT * FLOOR_HEIGHT;
    
    // Back Wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, wallGeoY), wallMat);
    backWall.position.set(0, wallGeoY / 2, -BUILDING_DEPTH / 2);
    backWall.renderOrder = 0;
    scene.add(backWall);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_DEPTH, wallGeoY), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-BUILDING_WIDTH / 2, wallGeoY / 2, 0);
    leftWall.renderOrder = 0;
    scene.add(leftWall);

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_DEPTH, wallGeoY), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(BUILDING_WIDTH / 2, wallGeoY / 2, 0);
    rightWall.renderOrder = 0;
    scene.add(rightWall);

    // Front Wall
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, wallGeoY), wallMat);
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(0, wallGeoY / 2, BUILDING_DEPTH / 2);
    frontWall.renderOrder = 0;
    scene.add(frontWall);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.position.set(0, 0, 0);

    const frameMat = new THREE.MeshStandardMaterial({
        color: COLOR_ELEVATOR,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const doorMat = new THREE.MeshStandardMaterial({
        color: COLOR_DOOR,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Elevator Floor
    const floorGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, SHAFT_DEPTH);
    const floor = new THREE.Mesh(floorGeo, frameMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01; // Slightly above ground
    elevatorCar.add(floor);

    // Elevator Back Wall (Solid)
    const backWallGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, FLOOR_HEIGHT);
    const backWall = new THREE.Mesh(backWallGeo, frameMat);
    backWall.position.set(0, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    // Elevator Roof
    const roof = new THREE.Mesh(floorGeo, frameMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = FLOOR_HEIGHT;
    elevatorCar.add(roof);

    // Sides (Transparent)
    const sideWallGeo = new THREE.PlaneGeometry(SHAFT_DEPTH, FLOOR_HEIGHT);
    const leftWall = new THREE.Mesh(sideWallGeo, frameMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    elevatorCar.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, frameMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    elevatorCar.add(rightWall);

    // Doors
    const doorGeo = new THREE.PlaneGeometry(SHAFT_WIDTH / 2, FLOOR_HEIGHT);
    
    const leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.userData.leftDoor = leftDoor;
    elevatorCar.userData.rightDoor = rightDoor;
    elevatorCar.userData.doorProgress = 0; // 0 = closed, 1 = open

    elevatorCar.renderOrder = 1;
    elevatorCar.children.forEach(child => child.renderOrder = 1);

    scene.add(elevatorCar);
}

function setupPeople() {
    // Start with one empty floor randomly
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);

    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;

        const person = createPerson(COLOR_PERSON_BODY, COLOR_PERSON_HEAD, COLOR_PERSON_LEGS);
        // Position in front of elevator on floor i
        person.position.set(0, i * FLOOR_HEIGHT, SHAFT_DEPTH);
        person.rotation.y = Math.PI; // Face the elevator
        scene.add(person);
        people.push({ mesh: person, floor: i });
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
    requestAnimationFrame(animate);
    
    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;

    if (deltaTime > 0.1) return; // Cap for frame spikes

    updateSimulation(deltaTime * simulationSpeed);
    
    // Update all person animations
    people.forEach(p => p.mesh.updateAnimation(deltaTime, simulationSpeed));
    if (activePerson && activePerson.mesh.parent === elevatorCar) {
        // activePerson.mesh is already in the people list but just in case
        activePerson.mesh.updateAnimation(deltaTime, simulationSpeed);
    }

    renderer.render(scene, camera);
}

function updateSimulation(dt) {
    const statusEl = document.getElementById('status');

    switch (currentState) {
        case STATE_IDLE:
            statusEl.innerText = "Idle - Selecting next passenger...";
            // Wait a bit, then pick a person to move to empty floor
            if (people.length > 0) {
                const idx = Math.floor(Math.random() * people.length);
                activePerson = people[idx];
                targetFloor = emptyFloor;
                currentState = STATE_MOVING_TO_PICKUP;
            }
            break;

        case STATE_MOVING_TO_PICKUP:
            statusEl.innerText = `Elevator moving to floor ${activePerson.floor} to pick up passenger`;
            const targetY = activePerson.floor * FLOOR_HEIGHT;
            if (moveTowards(elevatorCar.position, 'y', targetY, ELEVATOR_SPEED * dt)) {
                setTimeout(() => { currentState = STATE_OPENING_DOORS_PICKUP; }, 300 / simulationSpeed);
            }
            break;

        case STATE_OPENING_DOORS_PICKUP:
            statusEl.innerText = "Opening doors...";
            if (animateDoors(1, dt)) {
                setTimeout(() => { 
                    currentState = STATE_PERSON_ENTERING;
                    activePerson.mesh.userData.isWalking = true;
                }, 300 / simulationSpeed);
            }
            break;

        case STATE_PERSON_ENTERING:
            statusEl.innerText = "Passenger entering elevator...";
            // Person walks from SHAFT_DEPTH to 0
            if (moveTowards(activePerson.mesh.position, 'z', 0, PERSON_MOVE_SPEED * dt)) {
                activePerson.mesh.userData.isWalking = false;
                // Attach to elevator
                activePerson.mesh.position.set(0, 0, 0); // Local position in elevator
                activePerson.mesh.rotation.y = 0; // Turn to face doors
                elevatorCar.add(activePerson.mesh);
                
                setTimeout(() => { currentState = STATE_CLOSING_DOORS_PICKUP; }, 300 / simulationSpeed);
            }
            break;

        case STATE_CLOSING_DOORS_PICKUP:
            statusEl.innerText = "Closing doors...";
            if (animateDoors(0, dt)) {
                setTimeout(() => { currentState = STATE_MOVING_TO_DEST; }, 300 / simulationSpeed);
            }
            break;

        case STATE_MOVING_TO_DEST:
            statusEl.innerText = `Elevator traveling to floor ${targetFloor}`;
            const destY = targetFloor * FLOOR_HEIGHT;
            if (moveTowards(elevatorCar.position, 'y', destY, ELEVATOR_SPEED * dt)) {
                setTimeout(() => { currentState = STATE_OPENING_DOORS_DEST; }, 300 / simulationSpeed);
            }
            break;

        case STATE_OPENING_DOORS_DEST:
            statusEl.innerText = "Opening doors at destination...";
            if (animateDoors(1, dt)) {
                setTimeout(() => { 
                    currentState = STATE_PERSON_EXITING;
                    activePerson.mesh.userData.isWalking = true;
                    // Detach from elevator before moving
                    const worldPos = new THREE.Vector3();
                    activePerson.mesh.getWorldPosition(worldPos);
                    scene.add(activePerson.mesh);
                    activePerson.mesh.position.copy(worldPos);
                }, 300 / simulationSpeed);
            }
            break;

        case STATE_PERSON_EXITING:
            statusEl.innerText = "Passenger exiting elevator...";
            // Person walks from 0 to SHAFT_DEPTH
            if (moveTowards(activePerson.mesh.position, 'z', SHAFT_DEPTH, PERSON_MOVE_SPEED * dt)) {
                activePerson.mesh.userData.isWalking = false;
                activePerson.mesh.rotation.y = Math.PI; // Face elevator again
                
                // Update empty floor tracking
                const oldFloor = activePerson.floor;
                activePerson.floor = targetFloor;
                emptyFloor = oldFloor;
                
                setTimeout(() => { currentState = STATE_CLOSING_DOORS_DEST; }, 300 / simulationSpeed);
            }
            break;

        case STATE_CLOSING_DOORS_DEST:
            statusEl.innerText = "Closing doors...";
            if (animateDoors(0, dt)) {
                setTimeout(() => { 
                    currentState = STATE_IDLE; 
                    activePerson = null;
                }, 1000 / simulationSpeed);
            }
            break;
    }
}

/**
 * Moves an object's property towards a target value.
 * Returns true if target reached.
 */
function moveTowards(obj, prop, target, step) {
    if (Math.abs(obj[prop] - target) < 0.01) {
        obj[prop] = target;
        return true;
    }
    const dir = obj[prop] < target ? 1 : -1;
    obj[prop] += dir * step;
    
    // Check if we overshot
    if ((dir === 1 && obj[prop] > target) || (dir === -1 && obj[prop] < target)) {
        obj[prop] = target;
        return true;
    }
    return false;
}

/**
 * Animates doors. Target 1 = open, 0 = closed.
 * Returns true if target reached.
 */
function animateDoors(target, dt) {
    const doorStep = DOOR_SPEED * dt;
    if (moveTowards(elevatorCar.userData, 'doorProgress', target, doorStep)) {
        updateDoorPositions();
        return true;
    }
    updateDoorPositions();
    return false;
}

function updateDoorPositions() {
    const progress = elevatorCar.userData.doorProgress;
    const leftDoor = elevatorCar.userData.leftDoor;
    const rightDoor = elevatorCar.userData.rightDoor;

    // Doors meet at X=0 when closed (progress 0)
    // Doors retract to X=±SHAFT_WIDTH/2 when open (progress 1)
    // Width of door is SHAFT_WIDTH/2
    // Closed center: left at -SHAFT_WIDTH/4, right at SHAFT_WIDTH/4
    // Open center: left at -SHAFT_WIDTH/4 - SHAFT_WIDTH/2, right at SHAFT_WIDTH/4 + SHAFT_WIDTH/2
    const offset = progress * (SHAFT_WIDTH / 2);
    leftDoor.position.x = -SHAFT_WIDTH / 4 - offset;
    rightDoor.position.x = SHAFT_WIDTH / 4 + offset;
}

// Start the app
init();
