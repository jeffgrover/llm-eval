// Constants (configurable)
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 6;
const SHAFT_DEPTH = 8;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1.5;

// Global variables
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let emptyFloor = 0;
let animationSpeedMultiplier = 1;
let isAnimating = false;

// Initialize the simulation
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Camera setup
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2);

    // Renderer setup with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 30, 20);
    scene.add(directionalLight);

    // Create building and elevator
    createBuilding();
    createElevator();

    // Add people to floors (except empty floor)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            addPersonToFloor(i);
        }
    }

    // Speed control
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.addEventListener('input', function(e) {
        animationSpeedMultiplier = parseInt(e.target.value);
        speedValue.textContent = animationSpeedMultiplier + 'x';
    });

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start animation loop
    animate();

    // Start simulation after a brief delay
    setTimeout(runSimulation, 1000);
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Floor material (transparent)
    const floorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    // Wall material (semi-transparent)
    const wallMaterial = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    // Solid floor material (ground and roof)
    const solidFloorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: false,
        side: THREE.DoubleSide
    });

    // Create floors with elevator shaft cutout
    for (let i = 0; i <= FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        const isGroundOrRoof = i === 0 || i === FLOOR_COUNT;
        const material = isGroundOrRoof ? solidFloorMaterial : floorMaterial;

        // Main floor plate
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeometry, material);
        floor.position.set(BUILDING_WIDTH / 2, floorY, BUILDING_DEPTH / 2);
        buildingGroup.add(floor);

        // Elevator shaft cutout (negative space by not adding geometry there)
        // We create the floor as separate pieces around the shaft
    }

    // Create walls with openings for elevator shaft visibility
    const wallHeight = FLOOR_HEIGHT * FLOOR_COUNT;

    // Front wall (with opening for elevator)
    const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.2);
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(BUILDING_WIDTH / 2, wallHeight / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontWall);

    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.2);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(BUILDING_WIDTH / 2, wallHeight / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    // Left wall (with opening for elevator shaft)
    const leftWallLeft = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH / 2 + 1, wallHeight, 0.2),
        wallMaterial
    );
    leftWallLeft.position.set((SHAFT_WIDTH / 2 + 1) / 2, wallHeight / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(leftWallLeft);

    const leftWallRight = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH / 2 - 1, wallHeight, 0.2),
        wallMaterial
    );
    leftWallRight.position.set(BUILDING_WIDTH - (BUILDING_WIDTH - SHAFT_WIDTH / 2 - 1) / 2, wallHeight / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(leftWallRight);

    // Right wall (with opening for elevator shaft)
    const rightWallLeft = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH / 2 + 1, wallHeight, 0.2),
        wallMaterial
    );
    rightWallLeft.position.set((SHAFT_WIDTH / 2 + 1) / 2, wallHeight / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(rightWallLeft);

    const rightWallRight = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH / 2 - 1, wallHeight, 0.2),
        wallMaterial
    );
    rightWallRight.position.set(BUILDING_WIDTH - (BUILDING_WIDTH - SHAFT_WIDTH / 2 - 1) / 2, wallHeight / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(rightWallRight);

    scene.add(buildingGroup);
}

function createElevator() {
    elevatorCar = new THREE.Group();

    // Elevator frame material (semi-transparent yellow)
    const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Door material (slightly more opaque)
    const doorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Elevator dimensions
    const elevatorWidth = SHAFT_WIDTH - 0.5;
    const elevatorHeight = FLOOR_HEIGHT - 0.5;
    const elevatorDepth = SHAFT_DEPTH - 0.5;

    // Frame (back wall, side walls, top)
    const frameGroup = new THREE.Group();

    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(elevatorWidth, elevatorHeight, 0.1);
    const backWall = new THREE.Mesh(backWallGeometry, frameMaterial);
    backWall.position.set(0, elevatorHeight / 2, -elevatorDepth / 2);
    frameGroup.add(backWall);

    // Left side wall (transparent)
    const leftWallGeometry = new THREE.BoxGeometry(0.1, elevatorHeight, elevatorDepth);
    const leftWall = new THREE.Mesh(leftWallGeometry, frameMaterial);
    leftWall.position.set(-elevatorWidth / 2, elevatorHeight / 2, 0);
    frameGroup.add(leftWall);

    // Right side wall (transparent)
    const rightWallGeometry = new THREE.BoxGeometry(0.1, elevatorHeight, elevatorDepth);
    const rightWall = new THREE.Mesh(rightWallGeometry, frameMaterial);
    rightWall.position.set(elevatorWidth / 2, elevatorHeight / 2, 0);
    frameGroup.add(rightWall);

    // Top (transparent)
    const topGeometry = new THREE.BoxGeometry(elevatorWidth, 0.1, elevatorDepth);
    const top = new THREE.Mesh(topGeometry, frameMaterial);
    top.position.set(0, elevatorHeight, 0);
    frameGroup.add(top);

    // Bottom (solid floor)
    const bottomGeometry = new THREE.BoxGeometry(elevatorWidth, 0.1, elevatorDepth);
    const bottomMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: false,
        side: THREE.DoubleSide
    });
    const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottom.position.set(0, 0, 0);
    frameGroup.add(bottom);

    elevatorCar.add(frameGroup);

    // Left door (slides left when opening)
    const doorWidth = elevatorWidth / 2 - 0.1;
    const doorDepth = 0.1;
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, elevatorHeight, doorDepth);
    elevatorCar.leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    elevatorCar.leftDoor.position.set(-elevatorWidth / 4 + doorWidth / 2, elevatorHeight / 2, elevatorDepth / 2);
    elevatorCar.add(elevatorCar.leftDoor);

    // Right door (slides right when opening)
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, elevatorHeight, doorDepth);
    elevatorCar.rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    elevatorCar.rightDoor.position.set(elevatorWidth / 4 - doorWidth / 2, elevatorHeight / 2, elevatorDepth / 2);
    elevatorCar.add(elevatorCar.rightDoor);

    // Store door state
    elevatorCar.doorsOpen = false;
    elevatorCar.currentFloor = 0;

    // Position elevator at ground floor
    elevatorCar.position.set(
        BUILDING_WIDTH / 2,
        FLOOR_HEIGHT * 0.5,
        BUILDING_DEPTH / 2
    );

    scene.add(elevatorCar);
}

function addPersonToFloor(floor) {
    const person = createPerson();
    
    // Position person in front of elevator (positive Z), facing the elevator
    const floorY = FLOOR_HEIGHT * floor + 0.1;
    person.position.set(
        BUILDING_WIDTH / 2,
        floorY,
        BUILDING_DEPTH / 2 + SHAFT_DEPTH / 2 + 1
    );
    
    // Rotate to face the elevator (toward negative Z)
    person.rotation.y = Math.PI;
    
    scene.add(person);
    people.push({ person: person, floor: floor });
}

function getPersonOnFloor(floor) {
    return people.find(p => p.floor === floor);
}

// Animation functions with callbacks
function moveElevatorToFloor(targetFloor, callback) {
    const startY = elevatorCar.position.y;
    const targetY = FLOOR_HEIGHT * targetFloor + FLOOR_HEIGHT / 2;
    let startTime = null;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) * animationSpeedMultiplier;
        const progress = Math.min(elapsed / 1000, 1);
        
        elevatorCar.position.y = startY + (targetY - startY) * progress;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            elevatorCar.currentFloor = targetFloor;
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

function openDoors(callback) {
    const leftDoor = elevatorCar.leftDoor;
    const rightDoor = elevatorCar.rightDoor;
    
    const doorWidth = SHAFT_WIDTH / 2 - 0.5;
    const moveDistance = doorWidth * 0.6;
    
    let startTime = null;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) * animationSpeedMultiplier;
        const progress = Math.min(elapsed / 500, 1);

        leftDoor.position.x = -doorWidth / 2 + moveDistance * progress;
        rightDoor.position.x = doorWidth / 2 - moveDistance * progress;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            elevatorCar.doorsOpen = true;
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

function closeDoors(callback) {
    const leftDoor = elevatorCar.leftDoor;
    const rightDoor = elevatorCar.rightDoor;
    
    const doorWidth = SHAFT_WIDTH / 2 - 0.5;
    const moveDistance = doorWidth * 0.6;
    
    let startTime = null;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) * animationSpeedMultiplier;
        const progress = Math.min(elapsed / 500, 1);

        leftDoor.position.x = -doorWidth / 2 + moveDistance * (1 - progress);
        rightDoor.position.x = doorWidth / 2 - moveDistance * (1 - progress);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            elevatorCar.doorsOpen = false;
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

function walkPersonIntoElevator(personObj, callback) {
    const person = personObj.person;
    
    // Starting position (in front of elevator)
    const startX = person.position.x;
    const startZ = person.position.z;
    
    // Target position (inside elevator)
    const targetX = BUILDING_WIDTH / 2;
    const targetZ = BUILDING_DEPTH / 2 - SHAFT_DEPTH / 4;

    let startTime = null;
    let legAngle = 0;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) * animationSpeedMultiplier;
        const progress = Math.min(elapsed / 1500, 1);

        // Update position
        person.position.x = startX + (targetX - startX) * progress;
        person.position.z = startZ + (targetZ - startZ) * progress;

        // Leg animation (walking motion)
        if (progress < 1) {
            legAngle = Math.sin(progress * Math.PI * 4) * 0.3;
            person.leftLeg.rotation.x = legAngle;
            person.rightLeg.rotation.x = -legAngle;
        } else {
            // Reset legs to standing position
            person.leftLeg.rotation.x = 0;
            person.rightLeg.rotation.x = 0;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Person has entered elevator - make them a child of the elevator
            scene.remove(person);
            
            // Convert world position to local position relative to elevator
            const worldPos = person.position.clone();
            const elevatorInvMatrix = new THREE.Matrix4().getInverse(elevatorCar.matrixWorld);
            const localPos = worldPos.applyMatrix4(elevatorInvMatrix);
            person.position.copy(localPos);
            
            elevatorCar.add(person);
            
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

function walkPersonOutOfElevator(personObj, floor, callback) {
    const person = personObj.person;
    
    // Starting position (inside elevator - local to elevator)
    const startX = person.position.x;
    const startZ = person.position.z;
    
    // Target position (in front of elevator on the floor)
    const targetX = BUILDING_WIDTH / 2;
    const targetZ = BUILDING_DEPTH / 2 + SHAFT_DEPTH / 2 + 1;

    let startTime = null;
    let legAngle = 0;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) * animationSpeedMultiplier;
        const progress = Math.min(elapsed / 1500, 1);

        // Update position (local to elevator)
        person.position.x = startX + (targetX - startX) * progress;
        person.position.z = startZ + (targetZ - startZ) * progress;

        // Leg animation (walking motion)
        if (progress < 1) {
            legAngle = Math.sin(progress * Math.PI * 4) * 0.3;
            person.leftLeg.rotation.x = legAngle;
            person.rightLeg.rotation.x = -legAngle;
        } else {
            // Reset legs to standing position
            person.leftLeg.rotation.x = 0;
            person.rightLeg.rotation.x = 0;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Person has exited elevator - remove from elevator and add back to scene
            elevatorCar.remove(person);
            
            // Convert local position to world position
            const worldPos = person.position.clone();
            worldPos.applyMatrix4(elevatorCar.matrixWorld);
            person.position.copy(worldPos);
            
            // Set correct Y position for the floor
            person.position.y = FLOOR_HEIGHT * floor + 0.1;
            
            scene.add(person);
            
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

function runSimulation() {
    if (isAnimating) return;
    isAnimating = true;

    // Find a random person to move
    const availablePeople = people.filter(p => p.floor !== emptyFloor);
    if (availablePeople.length === 0) {
        isAnimating = false;
        return;
    }

    const personObj = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    const pickupFloor = personObj.floor;
    const destinationFloor = emptyFloor;

    // Update empty floor tracking
    emptyFloor = pickupFloor;

    // Animation sequence:
    // 1. Move elevator to pickup floor
    moveElevatorToFloor(pickupFloor, () => {
        // 2. Open doors
        openDoors(() => {
            // Delay for realism
            setTimeout(() => {
                // 3. Person walks into elevator
                walkPersonIntoElevator(personObj, () => {
                    // 4. Close doors
                    closeDoors(() => {
                        // 5. Move to destination floor
                        moveElevatorToFloor(destinationFloor, () => {
                            // 6. Open doors at destination
                            openDoors(() => {
                                // Delay for realism
                                setTimeout(() => {
                                    // 7. Person walks out of elevator
                                    walkPersonOutOfElevator(personObj, destinationFloor, () => {
                                        // Update person's floor
                                        personObj.floor = destinationFloor;
                                        
                                        // 8. Close doors
                                        closeDoors(() => {
                                            isAnimating = false;
                                            
                                            // Schedule next move after a delay
                                            setTimeout(runSimulation, 2000);
                                        });
                                    });
                                }, 300);
                            });
                        });
                    });
                });
            }, 300);
        });
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start the simulation when page loads
init();
