// Top-level constants as required by H6
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global variables as required by H5
let scene, camera, renderer, controls;
let elevatorCar;
let people = [];

// Animation state
let animationSpeedMultiplier = 1;
let currentAnimation = null;
let emptyFloorIndex = -1;

// Initialize the simulation
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Camera setup
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(25, 25, 25);
    camera.lookAt(BUILDING_WIDTH / 2, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, BUILDING_DEPTH / 2);

    // Renderer setup with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // OrbitControls setup
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 20);
    scene.add(directionalLight);

    // Create building and elevator
    createBuilding();
    createElevator();

    // Set up speed slider
    setupSpeedSlider();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start the simulation loop
    animate();

    // Initialize with one person per floor (except ground floor which is empty initially)
    initializePeople();
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Ground floor - solid
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const groundFloor = new THREE.Mesh(groundGeometry, groundMaterial);
    groundFloor.position.y = 0.25;
    buildingGroup.add(groundFloor);

    // Roof - solid
    const roofY = FLOOR_HEIGHT * (FLOOR_COUNT - 1);
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const roofFloor = new THREE.Mesh(roofGeometry, groundMaterial);
    roofFloor.position.y = roofY + 0.25;
    buildingGroup.add(roofFloor);

    // Transparent floors with shaft cutout
    const floorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const floorY = FLOOR_HEIGHT * i;
        
        // Create floor as a hollow box to form the shaft cutout
        const floorThickness = 0.3;
        
        // Outer part of floor (front section)
        const frontSectionGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, BUILDING_DEPTH / 2 - SHAFT_DEPTH / 4);
        const frontSection = new THREE.Mesh(frontSectionGeometry, floorMaterial);
        frontSection.position.set(0, floorY, -(SHAFT_DEPTH / 4));
        buildingGroup.add(frontSection);

        // Outer part of floor (back section)
        const backSectionGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, BUILDING_DEPTH / 2 - SHAFT_DEPTH / 4);
        const backSection = new THREE.Mesh(backSectionGeometry, floorMaterial);
        backSection.position.set(0, floorY, SHAFT_DEPTH / 4);
        buildingGroup.add(backSection);

        // Outer part of floor (left section)
        const leftSectionGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, floorThickness, BUILDING_DEPTH);
        const leftSection = new THREE.Mesh(leftSectionGeometry, floorMaterial);
        leftSection.position.set(-(SHAFT_WIDTH / 4), floorY, 0);
        buildingGroup.add(leftSection);

        // Outer part of floor (right section)
        const rightSectionGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, floorThickness, BUILDING_DEPTH);
        const rightSection = new THREE.Mesh(rightSectionGeometry, floorMaterial);
        rightSection.position.set(SHAFT_WIDTH / 4, floorY, 0);
        buildingGroup.add(rightSection);
    }

    // Semi-transparent walls
    const wallMaterial = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    // Front wall (with shaft cutout)
    const frontWallHeight = FLOOR_HEIGHT * FLOOR_COUNT - 1;
    
    // Front wall - left section
    const frontLeftGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, frontWallHeight, 0.3);
    const frontLeftWall = new THREE.Mesh(frontLeftGeometry, wallMaterial);
    frontLeftWall.position.set(-(SHAFT_WIDTH / 4), FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(frontLeftWall);

    // Front wall - right section
    const frontRightGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, frontWallHeight, 0.3);
    const frontRightWall = new THREE.Mesh(frontRightGeometry, wallMaterial);
    frontRightWall.position.set(SHAFT_WIDTH / 4, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(frontRightWall);

    // Back wall (with shaft cutout)
    const backLeftGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, frontWallHeight, 0.3);
    const backLeftWall = new THREE.Mesh(backLeftGeometry, wallMaterial);
    backLeftWall.position.set(-(SHAFT_WIDTH / 4), FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(backLeftWall);

    const backRightGeometry = new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 4, frontWallHeight, 0.3);
    const backRightWall = new THREE.Mesh(backRightGeometry, wallMaterial);
    backRightWall.position.set(SHAFT_WIDTH / 4, FLOOR_HEIGHT * FLOOR_COUNT / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(backRightWall);

    // Left wall (solid)
    const leftWallGeometry = new THREE.BoxGeometry(0.3, frontWallHeight, BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(leftWall);

    // Right wall (solid)
    const rightWallGeometry = new THREE.BoxGeometry(0.3, frontWallHeight, BUILDING_DEPTH);
    const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(rightWall);

    scene.add(buildingGroup);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    
    const carWidth = SHAFT_WIDTH - 1;
    const carHeight = FLOOR_HEIGHT - 0.5;
    const carDepth = SHAFT_DEPTH - 1;

    // Semi-transparent yellow frame material
    const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Door material - slightly more opaque
    const doorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Bottom floor of elevator car
    const bottomGeometry = new THREE.BoxGeometry(carWidth, 0.2, carDepth);
    const bottom = new THREE.Mesh(bottomGeometry, frameMaterial);
    bottom.position.y = -carHeight / 2 + 0.1;
    elevatorCar.add(bottom);

    // Top of elevator car
    const topGeometry = new THREE.BoxGeometry(carWidth, 0.2, carDepth);
    const topMesh = new THREE.Mesh(topGeometry, frameMaterial);
    topMesh.position.y = carHeight / 2 - 0.1;
    elevatorCar.add(topMesh);

    // Back wall - solid yellow but semi-transparent
    const backWallGeometry = new THREE.BoxGeometry(carWidth, carHeight - 0.4, carDepth / 2 + 0.5);
    const backWallMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = -carDepth / 2 + carDepth / 4;
    elevatorCar.add(backWall);

    // Left side wall - transparent
    const leftWallGeometry = new THREE.BoxGeometry(carWidth / 2 + 0.5, carHeight - 0.4, carDepth / 2);
    const leftWall = new THREE.Mesh(leftWallGeometry, frameMaterial);
    leftWall.position.set(-carWidth / 4, 0, 0);
    elevatorCar.add(leftWall);

    // Right side wall - transparent
    const rightWallGeometry = new THREE.BoxGeometry(carWidth / 2 + 0.5, carHeight - 0.4, carDepth / 2);
    const rightWallMesh = new THREE.Mesh(rightWallGeometry, frameMaterial);
    rightWallMesh.position.set(carWidth / 4, 0, 0);
    elevatorCar.add(rightWallMesh);

    // Doors on front (positive Z side)
    const doorHeight = carHeight - 0.5;
    const doorDepth = 0.15;
    const doorWidth = carWidth / 2 - 0.1;

    // Left door
    elevatorCar.leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMaterial
    );
    elevatorCar.leftDoor.position.set(-carWidth / 4 + doorWidth / 2, 0, carDepth / 2);
    elevatorCar.add(elevatorCar.leftDoor);

    // Right door
    elevatorCar.rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMaterial
    );
    elevatorCar.rightDoor.position.set(carWidth / 4 - doorWidth / 2, 0, carDepth / 2);
    elevatorCar.add(elevatorCar.rightDoor);

    // Position elevator at ground floor level (y=0)
    elevatorCar.position.y = FLOOR_HEIGHT / 2;
    
    scene.add(elevatorCar);
}

function initializePeople() {
    // Start with empty first floor, people on floors 1-5
    for (let i = 1; i < FLOOR_COUNT - 1; i++) {
        const person = createPerson();
        
        // Position in front of elevator doors
        const floorY = FLOOR_HEIGHT * i;
        const zOffset = SHAFT_DEPTH / 2 + 0.5;
        
        person.position.set(
            (Math.random() - 0.5) * 3,
            floorY,
            zOffset
        );
        
        // Face the elevator (rotate to look in negative Z direction)
        person.rotation.y = Math.PI;
        
        scene.add(person);
        
        people.push({
            mesh: person,
            currentFloor: i,
            targetFloor: -1
        });
    }
    
    emptyFloorIndex = 0;
}

function startAnimationCycle() {
    if (people.length === 0) return;
    
    // Find a person to move (not on the empty floor)
    const movablePeople = people.filter(p => p.currentFloor !== emptyFloorIndex);
    if (movablePeople.length === 0) return;
    
    const randomPerson = movablePeople[Math.floor(Math.random() * movablePeople.length)];
    
    // Elevator goes to pickup floor
    moveToFloor(randomPerson.currentFloor, function() {
        openDoors(function() {
            if (randomPerson.currentFloor === emptyFloorIndex) {
                // Person already moved - close doors and return
                closeDoors(function() { startAnimationCycle(); });
                return;
            }
            
            // Board the elevator
            boardElevator(randomPerson, function() {
                closeDoors(function() {
                    moveToFloor(emptyFloorIndex, function() {
                        openDoors(function() {
                            exitElevator(randomPerson, function() {
                                closeDoors(function() {
                                    startAnimationCycle();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function moveToFloor(floorIndex, onComplete) {
    const targetY = FLOOR_HEIGHT * floorIndex;
    
    function animate() {
        const distanceToTarget = Math.abs(elevatorCar.position.y - targetY);
        
        if (distanceToTarget < 0.01) {
            elevatorCar.position.y = targetY;
            onComplete();
            return;
        }
        
        const direction = targetY > elevatorCar.position.y ? 1 : -1;
        const moveStep = Math.min(ELEVATOR_SPEED * animationSpeedMultiplier, distanceToTarget);
        elevatorCar.position.y += direction * moveStep;
        
        currentAnimation = animate;
    }
    
    currentAnimation = animate;
}

function openDoors(onComplete) {
    const doorOpenAmount = 2.5;
    
    function animate() {
        const leftDoorTargetX = -doorOpenAmount;
        const rightDoorTargetX = doorOpenAmount;
        
        const leftDist = Math.abs(elevatorCar.leftDoor.position.x - leftDoorTargetX);
        const rightDist = Math.abs(elevatorCar.rightDoor.position.x - rightDoorTargetX);
        
        if (leftDist < 0.01 && rightDist < 0.01) {
            elevatorCar.leftDoor.position.x = leftDoorTargetX;
            elevatorCar.rightDoor.position.x = rightDoorTargetX;
            onComplete();
            return;
        }
        
        const moveStep = 0.5 * animationSpeedMultiplier;
        elevatorCar.leftDoor.position.x -= Math.min(moveStep, leftDist);
        elevatorCar.rightDoor.position.x += Math.min(moveStep, rightDist);
        
        currentAnimation = animate;
    }
    
    currentAnimation = animate;
}

function closeDoors(onComplete) {
    function animate() {
        const targetX = 0;
        
        const leftDist = Math.abs(elevatorCar.leftDoor.position.x - (-targetX));
        const rightDist = Math.abs(elevatorCar.rightDoor.position.x - targetX);
        
        if (leftDist < 0.01 && rightDist < 0.01) {
            elevatorCar.leftDoor.position.x = -targetX;
            elevatorCar.rightDoor.position.x = targetX;
            onComplete();
            return;
        }
        
        const moveStep = 0.5 * animationSpeedMultiplier;
        elevatorCar.leftDoor.position.x -= Math.min(moveStep, leftDist);
        elevatorCar.rightDoor.position.x += Math.min(moveStep, rightDist);
        
        currentAnimation = animate;
    }
    
    currentAnimation = animate;
}

function boardElevator(personObj, onComplete) {
    const person = personObj.mesh;
    const zOffset = SHAFT_DEPTH / 2 - 0.5;
    const targetZ = zOffset;
    
    function animate() {
        const distanceToTarget = Math.abs(person.position.z - targetZ);
        
        if (distanceToTarget < 0.01) {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            
            // Reparent to elevator using attach() as required by H8
            elevatorCar.attach(person);
            
            setTimeout(onComplete, 300);
            return;
        }
        
        const moveStep = Math.min(PERSON_MOVE_SPEED * animationSpeedMultiplier, distanceToTarget);
        person.position.z -= moveStep;
        person.userData.isWalking = true;
        
        currentAnimation = animate;
    }
    
    currentAnimation = animate;
}

function exitElevator(personObj, onComplete) {
    const person = personObj.mesh;
    const zOffset = SHAFT_DEPTH / 2 + 0.5;
    const targetZ = zOffset;
    
    // Update the empty floor index
    personObj.currentFloor = emptyFloorIndex;
    emptyFloorIndex = -1; // Will be set by next animation cycle
    
    function animate() {
        const distanceToTarget = Math.abs(person.position.z - targetZ);
        
        if (distanceToTarget < 0.01) {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            
            // Reparent back to scene using attach() as required by H8
            scene.attach(person);
            
            setTimeout(onComplete, 300);
            return;
        }
        
        const moveStep = Math.min(PERSON_MOVE_SPEED * animationSpeedMultiplier, distanceToTarget);
        person.position.z += moveStep;
        person.userData.isWalking = true;
        
        currentAnimation = animate;
    }
    
    currentAnimation = animate;
}

function setupSpeedSlider() {
    const slider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    if (slider && speedValue) {
        slider.addEventListener('input', function(e) {
            animationSpeedMultiplier = parseFloat(e.target.value);
            speedValue.textContent = animationSpeedMultiplier + 'x';
        });
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop with walking animation
function animate(time) {
    requestAnimationFrame(animate);
    
    controls.update();
    
    // Animate legs for people who are walking
    for (const personObj of people) {
        const person = personObj.mesh;
        
        if (person.userData.isWalking) {
            const walkSpeed = 10 * animationSpeedMultiplier / Math.max(animationSpeedMultiplier, 1);
            const legAngle = Math.sin(time * 0.005 * walkSpeed) * 0.4;
            
            person.userData.leftLeg.rotation.x = -legAngle;
            person.userData.rightLeg.rotation.x = legAngle;
        } else {
            // Reset legs to standing position
            if (person.userData.leftLeg) {
                person.userData.leftLeg.rotation.x = 0;
            }
            if (person.userData.rightLeg) {
                person.userData.rightLeg.rotation.x = 0;
            }
        }
    }
    
    renderer.render(scene, camera);
}

// Auto-start on page load as required by H3
document.addEventListener('DOMContentLoaded', function() {
    init();
});
