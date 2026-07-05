// Constants - top-level declarations as required by H6
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global Three.js objects
let scene = null;
let camera = null;
let renderer = null;
let controls = null;

// Simulation globals
let elevatorCar = null;
let people = [];
let emptyFloor = 0;
let currentPersonIndex = 0;
let animationSpeed = 5;
let isAnimating = false;
let doorState = 'closed'; // 'closed', 'opening', 'opened', 'closing'

// Elevator state
let elevatorFloor = 0; // 0 = ground floor

// Door animation properties
let leftDoorOpenPos = -1.2;
let rightDoorOpenPos = 1.2;
let leftDoorClosedPos = -0.6;
let rightDoorClosedPos = 0.6;
let leftDoor = null;
let rightDoor = null;

// Create building with floors
function createBuilding() {
    const floorY = 0;
    
    // Building materials
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Calculate building position to center it
    const buildingX = 0;
    const buildingZ = 0;

    // Create floors and walls
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;

        // Floor plate
        const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(buildingX, floorY, buildingZ);
        floor.receiveShadow = true;
        floor.renderOrder = 0;
        scene.add(floor);

        // Create shaft cutout - need to subtract shaft area from floor
        
        // Create four walls for this floor (with shaft cutout)
        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 1),
            wallMaterial
        );
        northWall.position.set(0, floorY + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
        northWall.renderOrder = 0;
        scene.add(northWall);

        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 1),
            wallMaterial
        );
        southWall.position.set(0, floorY + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
        southWall.renderOrder = 0;
        scene.add(southWall);

        // West wall (left of shaft)
        const westWallLeft = new THREE.Mesh(
            new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, SHAFT_DEPTH),
            wallMaterial
        );
        westWallLeft.position.set(
            -(BUILDING_WIDTH + SHAFT_WIDTH) / 4,
            floorY + FLOOR_HEIGHT / 2,
            0
        );
        westWallLeft.renderOrder = 0;
        scene.add(westWallLeft);

        // West wall (right of shaft) - actually this is east wall
        // Let me recalculate - shaft is in center
        
        // East wall
        const eastWallRight = new THREE.Mesh(
            new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, SHAFT_DEPTH),
            wallMaterial
        );
        eastWallRight.position.set(
            (BUILDING_WIDTH + SHAFT_WIDTH) / 4,
            floorY + FLOOR_HEIGHT / 2,
            0
        );
        eastWallRight.renderOrder = 0;
        scene.add(eastWallRight);

        // West side walls (full width except shaft)
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        westWall.position.set(
            -(BUILDING_WIDTH + SHAFT_WIDTH) / 4,
            floorY + FLOOR_HEIGHT / 2,
            0
        );
        westWall.renderOrder = 0;
        scene.add(westWall);

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        eastWall.position.set(
            (BUILDING_WIDTH + SHAFT_WIDTH) / 4,
            floorY + FLOOR_HEIGHT / 2,
            0
        );
        eastWall.renderOrder = 0;
        scene.add(eastWall);

        // Ground floor (solid)
        if (i === 0) {
            const groundGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
            const ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ color: 0x888888 }));
            ground.rotation.x = -Math.PI / 2;
            ground.position.set(0, -0.1, 0);
            ground.receiveShadow = true;
            ground.renderOrder = 0;
            scene.add(ground);
        }

        // Roof (on top of last floor)
        if (i === FLOOR_COUNT - 1) {
            const roofGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
            const roof = new THREE.Mesh(roofGeometry, new THREE.MeshLambertMaterial({ color: 0xaaaaaa }));
            roof.rotation.x = -Math.PI / 2;
            roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
            roof.receiveShadow = true;
            roof.renderOrder = 0;
            scene.add(roof);
        }
    }
}

// Create elevator car with doors
function createElevatorCar() {
    const elevatorGroup = new THREE.Group();
    
    // Elevator materials
    const frameMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    
    const doorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7,
        side: THREE.DoubleSide
    });

    const carWidth = 3;
    const carDepth = 3;
    const carHeight = 2;

    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carHeight),
        frameMaterial
    );
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    backWall.rotation.y = 0;
    elevatorGroup.add(backWall);

    // Side walls (transparent)
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carDepth, carHeight),
        frameMaterial
    );
    leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    elevatorGroup.add(leftWall);

    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carDepth, carHeight),
        frameMaterial
    );
    rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    elevatorGroup.add(rightWall);

    // Top ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(carWidth, carDepth);
    const ceiling = new THREE.Mesh(ceilingGeometry, frameMaterial);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.set(0, carHeight, 0);
    ceiling.renderOrder = 1;
    elevatorGroup.add(ceiling);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(carWidth, carDepth);
    const floor = new THREE.Mesh(floorGeometry, new THREE.MeshLambertMaterial({ color: 0x666666 }));
    floor.rotation.x = Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.renderOrder = 1;
    elevatorGroup.add(floor);

    // Create left door
    leftDoor = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, carHeight),
        doorMaterial
    );
    leftDoor.position.set(-0.6, carHeight / 2, carDepth / 2);
    leftDoor.rotation.y = Math.PI; // Face inward
    elevatorGroup.add(leftDoor);

    // Create right door
    rightDoor = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, carHeight),
        doorMaterial
    );
    rightDoor.position.set(0.6, carHeight / 2, carDepth / 2);
    rightDoor.rotation.y = 0; // Face inward
    elevatorGroup.add(rightDoor);

    // Store door references on elevatorCar for animation access (H5)
    elevatorGroup.leftDoor = leftDoor;
    elevatorGroup.rightDoor = rightDoor;

    return elevatorGroup;
}

// Animate elevator vertical movement
function animateElevator(targetFloor, callback) {
    const targetY = targetFloor * FLOOR_HEIGHT;
    const startY = elevatorFloor * FLOOR_HEIGHT;
    const distance = Math.abs(targetY - startY);
    const duration = (distance / ELEVATOR_SPEED) * 1000;
    const startTime = Date.now();
    const startYPos = startY;

    function update() {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        const newY = startYPos + (targetY - startYPos) * easeProgress;
        elevatorCar.position.y = newY;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorFloor = targetFloor;
            if (callback) callback();
        }
    }
    
    update();
}

// Animate doors opening
function animateDoorsOpen(callback) {
    const startTime = Date.now();
    const duration = 300;

    function update() {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        leftDoor.position.x = leftDoorClosedPos + (leftDoorOpenPos - leftDoorClosedPos) * progress;
        rightDoor.position.x = rightDoorClosedPos + (rightDoorOpenPos - rightDoorClosedPos) * progress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            doorState = 'opened';
            if (callback) callback();
        }
    }
    
    update();
}

// Animate doors closing
function animateDoorsClose(callback) {
    const startTime = Date.now();
    const duration = 300;

    function update() {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out for smooth closing
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        leftDoor.position.x = leftDoorOpenPos + (leftDoorClosedPos - leftDoorOpenPos) * easeProgress;
        rightDoor.position.x = rightDoorOpenPos + (rightDoorClosedPos - rightDoorOpenPos) * easeProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            leftDoor.position.x = leftDoorClosedPos;
            rightDoor.position.x = rightDoorClosedPos;
            doorState = 'closed';
            if (callback) callback();
        }
    }
    
    update();
}

// Animate person walking
function animatePersonWalking(person, duration, callback) {
    const startTime = Date.now();
    person.userData.isWalking = true;

    function update() {
        const now = Date.now();
        const elapsed = now - startTime;
        
        if (elapsed < duration) {
            // Leg swing animation using sine wave
            const swing = Math.sin((elapsed / duration) * Math.PI * 2 * 3) * 0.5;
            person.userData.leftLeg.rotation.x = swing;
            person.userData.rightLeg.rotation.x = -swing;
            requestAnimationFrame(update);
        } else {
            // Reset legs to standing position
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
            person.userData.isWalking = false;
            if (callback) callback();
        }
    }
    
    update();
}

// Board a person into the elevator
function boardPerson(person, floor, callback) {
    // Position person in front of elevator doors (positive Z)
    person.position.set(0, floor * FLOOR_HEIGHT, 3);
    person.rotation.y = Math.PI; // Face elevator
    
    // Add to scene initially
    scene.add(person);
    
    // Walk toward elevator
    const walkDuration = 1000 / animationSpeed;
    
    animatePersonWalking(person, walkDuration, () => {
        // Person reached elevator, now board
        // Use attach() to preserve world position (H8)
        elevatorCar.attach(person);
        
        if (callback) callback();
    });
}

// Exit a person from the elevator
function exitPerson(person, floor, callback) {
    // Use attach() to preserve world position (H8)
    scene.attach(person);
    
    // Position person in front of elevator doors (positive Z)
    person.position.set(0, floor * FLOOR_HEIGHT, 3);
    person.rotation.y = Math.PI; // Face elevator (still looking at it)
    
    // Walk away from elevator (reverse direction)
    const walkDuration = 1000 / animationSpeed;
    
    // Walk backward (away from elevator)
    animatePersonWalking(person, walkDuration, () => {
        // Rotate to face building
        person.rotation.y = 0;
        if (callback) callback();
    });
}

// Get next person to move
function getNextPersonToMove() {
    // Find a person not on the empty floor
    for (let i = 0; i < people.length; i++) {
        const personFloor = Math.round(elevatorCar.position.y / FLOOR_HEIGHT);
        if (personFloor !== emptyFloor) {
            return i;
        }
    }
    return -1;
}

// Main simulation logic
function runSimulationCycle() {
    if (people.length === 0) {
        // No people yet, create some
        for (let i = 0; i < 3; i++) {
            const floor = Math.floor(Math.random() * FLOOR_COUNT);
            const person = createPerson();
            
            // Position person on the floor
            person.position.set(0, floor * FLOOR_HEIGHT, 3);
            person.rotation.y = Math.PI; // Face elevator
            
            scene.add(person);
            people.push(person);
            
            // Find next empty floor
            const occupiedFloors = people.map((_, idx) => {
                if (idx !== people.length - 1) {
                    return Math.round(people[idx].getWorldPosition(new THREE.Vector3()).y / FLOOR_HEIGHT);
                }
                return -1;
            });
            
            let newEmptyFloor = 0;
            while (occupiedFloors.includes(newEmptyFloor)) {
                newEmptyFloor++;
            }
            emptyFloor = newEmptyFloor;
        }
        return;
    }

    // Get random person to move to empty floor
    const personIndex = Math.floor(Math.random() * people.length);
    const person = people[personIndex];
    const currentFloor = Math.round(elevatorCar.position.y / FLOOR_HEIGHT);
    
    // Don't move if already on empty floor
    if (currentFloor === emptyFloor) {
        return;
    }

    // Move elevator to person's floor
    animateElevator(currentFloor, () => {
        // Open doors
        animateDoorsOpen(() => {
            // Board person
            boardPerson(person, currentFloor, () => {
                // Close doors
                animateDoorsClose(() => {
                    // Move elevator to empty floor
                    animateElevator(emptyFloor, () => {
                        // Open doors at destination
                        animateDoorsOpen(() => {
                            // Exit person
                            exitPerson(person, emptyFloor, () => {
                                // Update empty floor
                                const occupiedFloors = people.map(p => {
                                    // Find which floor this person is on
                                    return Math.round(p.position.y / FLOOR_HEIGHT);
                                });
                                emptyFloor = currentFloor;
                                
                                // Close doors
                                animateDoorsClose(() => {
                                    // Continue cycle
                                    setTimeout(runSimulationCycle, 500);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// Initialize simulation
function initSimulation() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 7, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    // Create controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 7, 0);
    controls.update();
    
    // Add lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    
    // Create building
    createBuilding();
    
    // Create elevator
    elevatorCar = createElevatorCar();
    elevatorCar.position.y = 0;
    scene.add(elevatorCar);
    
    // Create people
    for (let i = 0; i < 3; i++) {
        const person = createPerson();
        
        // Position person on different floors
        const floor = i % FLOOR_COUNT;
        person.position.set(0, floor * FLOOR_HEIGHT, 3);
        person.rotation.y = Math.PI; // Face elevator
        
        scene.add(person);
        people.push(person);
    }
    
    // Set initial empty floor
    emptyFloor = 3;
    
    // Speed control
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    speedSlider.addEventListener('input', (e) => {
        animationSpeed = parseInt(e.target.value);
        speedValue.textContent = animationSpeed + 'x';
    });
    
    // Start simulation loop
    setTimeout(runSimulationCycle, 1000);
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    
    animate();
}

// Handle window resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Start simulation on DOMContentLoaded
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initSimulation);
} else {
    initSimulation();
}
