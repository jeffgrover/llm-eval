// elevator.js - Main simulation logic

// Constants
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 8;
const ELEVATOR_SPEED = 1;
const PERSON_MOVE_SPEED = 2;

// Global variables
let scene, camera, renderer, controls;
let building, elevatorCar, people = [];
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
let currentFloor = 0;
let targetFloor = 1;
let doorsOpen = false;

// Animation speed control
let animationSpeed = 1;
document.getElementById('speedSlider').addEventListener('input', function(e) {
    animationSpeed = parseFloat(e.target.value);
});

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x888888);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialiasing: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Create lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    // Create building
    createBuilding();
    
    // Create elevator
    createElevator();
    
    // Create people
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            createPersonOnFloor(i);
        }
    }
    
    // Start animation loop
    animate();
}

function createBuilding() {
    const buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;
    
    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: '#cccccc',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = 0;
    buildingGroup.add(ground);
    
    // Upper floors (transparent)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: '#cccccc',
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = i * FLOOR_HEIGHT;
        buildingGroup.add(floor);
    }
    
    // Walls (semi-transparent)
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: '#9999ff',
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Front wall (positive Z)
    const frontWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 1),
        wallMaterial
    );
    frontWall.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontWall);
    
    // Back wall (negative Z)
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 1),
        wallMaterial
    );
    backWall.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);
    
    // Left wall (negative X)
    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(1, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH),
        wallMaterial
    );
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    buildingGroup.add(leftWall);
    
    // Right wall (positive X)
    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(1, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH),
        wallMaterial
    );
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    buildingGroup.add(rightWall);
    
    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: '#cccccc',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = FLOOR_HEIGHT * FLOOR_COUNT;
    buildingGroup.add(roof);
    
    // Elevator shaft cutout (transparent)
    const shaftMaterial = new THREE.MeshStandardMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    for (let i = 0; i < FLOOR_COUNT + 1; i++) {
        const shaftGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, SHAFT_DEPTH);
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        shaft.position.y = i * FLOOR_HEIGHT;
        buildingGroup.add(shaft);
    }
    
    scene.add(buildingGroup);
}

function createElevator() {
    const elevatorGroup = new THREE.Group();
    elevatorGroup.renderOrder = 1;
    
    // Frame (semi-transparent yellow)
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: '#ffff00',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Back wall (solid)
    const backGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 1, SHAFT_DEPTH / 2);
    const backWall = new THREE.Mesh(backGeometry, frameMaterial);
    backWall.position.z = -SHAFT_DEPTH / 4;
    elevatorGroup.add(backWall);
    
    // Side walls (transparent)
    const sideMaterial = new THREE.MeshStandardMaterial({
        color: '#ffff00',
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Left side
    const leftGeometry = new THREE.BoxGeometry(1, FLOOR_HEIGHT - 1, SHAFT_DEPTH / 2);
    const leftWall = new THREE.Mesh(leftGeometry, sideMaterial);
    leftWall.position.set(-SHAFT_WIDTH / 2, 0, 0);
    elevatorGroup.add(leftWall);
    
    // Right side
    const rightWall = new THREE.Mesh(leftGeometry, sideMaterial);
    rightWall.position.set(SHAFT_WIDTH / 2, 0, 0);
    elevatorGroup.add(rightWall);
    
    // Top and bottom (transparent)
    const topBottomMaterial = new THREE.MeshStandardMaterial({
        color: '#ffff00',
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Top
    const topGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 1, SHAFT_DEPTH / 2);
    const top = new THREE.Mesh(topGeometry, topBottomMaterial);
    top.position.y = FLOOR_HEIGHT - 0.5;
    elevatorGroup.add(top);
    
    // Bottom
    const bottom = new THREE.Mesh(topGeometry, topBottomMaterial);
    bottom.position.y = 0.5;
    elevatorGroup.add(bottom);
    
    // Doors (semi-transparent darker yellow)
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: '#cccc00',
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Left door
    const leftDoorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH / 2, FLOOR_HEIGHT - 1, 1);
    elevatorCar.leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH / 4, 0, SHAFT_DEPTH / 2);
    elevatorGroup.add(elevatorCar.leftDoor);
    
    // Right door
    elevatorCar.rightDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH / 4, 0, SHAFT_DEPTH / 2);
    elevatorGroup.add(elevatorCar.rightDoor);
    
    // Store references for animation
    elevatorCar.leftDoorRef = elevatorCar.leftDoor;
    elevatorCar.rightDoorRef = elevatorCar.rightDoor;
    
    scene.add(elevatorGroup);
}

function createPersonOnFloor(floorIndex) {
    const person = createPerson();
    person.position.set(0, floorIndex * FLOOR_HEIGHT + 2.5, BUILDING_DEPTH / 2 - 3); // In front of elevator
    scene.add(person);
    people.push({ person: person, floor: floorIndex });
}

function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    renderer.render(scene, camera);
    
    // Handle elevator animation sequence
    if (Math.abs(elevatorCar.position.y - currentFloor * FLOOR_HEIGHT) > 0.01) {
        // Moving to pickup floor
        elevatorCar.position.y += (targetFloor === currentFloor ? -ELEVATOR_SPEED : ELEVATOR_SPEED) * animationSpeed / 60;
    } else if (!doorsOpen && targetFloor !== currentFloor) {
        // Start opening doors at pickup floor
        openDoors(() => {
            doorsOpen = true;
            // Person boards elevator
            boardElevator(() => {
                doorsOpen = false;
                closeDoors(() => {
                    currentFloor = targetFloor;
                    // Find new empty floor and target it
                    const occupiedFloors = people.map(p => p.floor);
                    let newEmptyFloor = emptyFloor;
                    while (occupiedFloors.includes(newEmptyFloor)) {
                        newEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
                    }
                    emptyFloor = newEmptyFloor;
                    targetFloor = emptyFloor;
                });
            });
        });
    } else if (doorsOpen && targetFloor === currentFloor) {
        // Start closing doors at destination
        closeDoors(() => {
            doorsOpen = false;
            // Person exits elevator
            exitElevator(() => {
                // Find new empty floor for next cycle
                const occupiedFloors = people.map(p => p.floor);
                let newEmptyFloor = emptyFloor;
                while (occupiedFloors.includes(newEmptyFloor)) {
                    newEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
                }
                emptyFloor = newEmptyFloor;
                targetFloor = currentFloor; // Return to pickup floor
            });
        });
    }
}

function openDoors(callback) {
    const startTime = Date.now();
    const duration = 300; // ms
    
    function update(time) {
        const elapsed = time - startTime;
        if (elapsed >= duration) {
            elevatorCar.leftDoorRef.position.x = -SHAFT_WIDTH / 2;
            elevatorCar.rightDoorRef.position.x = SHAFT_WIDTH / 2;
            callback();
            return;
        }
        
        const progress = elapsed / duration;
        elevatorCar.leftDoorRef.position.x = THREE.Math.lerp(-SHAFT_WIDTH / 4, -SHAFT_WIDTH / 2, progress);
        elevatorCar.rightDoorRef.position.x = THREE.Math.lerp(SHAFT_WIDTH / 4, SHAFT_WIDTH / 2, progress);
        
        requestAnimationFrame(() => update(Date.now()));
    }
    
    requestAnimationFrame(() => update(Date.now()));
}

function closeDoors(callback) {
    const startTime = Date.now();
    const duration = 300; // ms
    
    function update(time) {
        const elapsed = time - startTime;
        if (elapsed >= duration) {
            elevatorCar.leftDoorRef.position.x = -SHAFT_WIDTH / 4;
            elevatorCar.rightDoorRef.position.x = SHAFT_WIDTH / 4;
            callback();
            return;
        }
        
        const progress = elapsed / duration;
        elevatorCar.leftDoorRef.position.x = THREE.Math.lerp(-SHAFT_WIDTH / 2, -SHAFT_WIDTH / 4, progress);
        elevatorCar.rightDoorRef.position.x = THREE.Math.lerp(SHAFT_WIDTH / 2, SHAFT_WIDTH / 4, progress);
        
        requestAnimationFrame(() => update(Date.now()));
    }
    
    requestAnimationFrame(() => update(Date.now()));
}

function boardElevator(callback) {
    // Find person on current floor
    const personData = people.find(p => p.floor === currentFloor);
    if (!personData) return callback();
    
    const person = personData.person;
    const walkAnimation = startWalking(person);
    
    // Move person into elevator
    const startPosZ = BUILDING_DEPTH / 2 - 3;
    const endPosZ = SHAFT_DEPTH / 2 + 0.5;
    
    function update() {
        if (Math.abs(person.position.z - endPosZ) < 0.01) {
            // Person reached elevator
            stopWalking(person);
            scene.remove(person);
            elevatorCar.add(person);
            person.position.set(0, 0, SHAFT_DEPTH / 2 + 0.5);
            callback();
        } else {
            person.position.z += PERSON_MOVE_SPEED * animationSpeed / 60;
            walkAnimation();
            requestAnimationFrame(update);
        }
    }
    
    // Add small delay before starting
    setTimeout(() => {
        update();
    }, 300);
}

function exitElevator(callback) {
    // Find person in elevator
    const personData = people.find(p => p.person.parent === elevatorCar);
    if (!personData) return callback();
    
    const person = personData.person;
    const walkAnimation = startWalking(person);
    
    // Move person out of elevator
    const startPosZ = SHAFT_DEPTH / 2 + 0.5;
    const endPosZ = BUILDING_DEPTH / 2 - 3;
    
    function update() {
        if (Math.abs(person.position.z - endPosZ) < 0.01) {
            // Person reached destination
            stopWalking(person);
            elevatorCar.remove(person);
            scene.add(person);
            person.position.set(0, targetFloor * FLOOR_HEIGHT + 2.5, BUILDING_DEPTH / 2 - 3);
            callback();
        } else {
            person.position.z -= PERSON_MOVE_SPEED * animationSpeed / 60;
            walkAnimation();
            requestAnimationFrame(update);
        }
    }
    
    // Add small delay before starting
    setTimeout(() => {
        update();
    }, 300);
}

// Handle window resize
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the simulation when page loads
window.onload = init;