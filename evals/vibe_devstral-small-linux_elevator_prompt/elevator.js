// Constants
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 10;
const BUILDING_DEPTH = 10;
const SHAFT_WIDTH = 2.5;
const SHAFT_DEPTH = 2.5;

const ELEVATOR_SPEED = 0.05;
const PERSON_MOVE_SPEED = 0.03;

// Global variables
let scene, camera, renderer, controls;
let building, elevatorCar, floors = [];
let people = [];
let emptyFloor = null;
let currentFloor = 0;
let animationSpeed = 1;

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x888888);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.height, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

    // Create renderer with transparency support
    renderer = new THREE.WebGLRenderer({ antialiasing: true });
    renderer.setSize(window.innerWidth, window.height);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    // Create building and elevator
    createBuilding();
    createElevator();

    // Create people on floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            createPersonOnFloor(i);
        }
    }

    // Speed control
    document.getElementById('speedSlider').addEventListener('input', function(e) {
        animationSpeed = parseInt(e.target.value);
    });

    // Start animation loop
    animate();
}

function createBuilding() {
    const wallMaterial = new THREE.MeshBasicMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const floorMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Create floors with shaft cutout
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorGroup = new THREE.Group();
        
        // Floor surface
        const floorGeometry = new THREE.BoxGeometry(
            BUILDING_WIDTH, 
            0.2,
            BUILDING_DEPTH
        );
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = i * FLOOR_HEIGHT;
        floor.renderOrder = 0;
        floorGroup.add(floor);
        floors.push(floorGroup);
        scene.add(floorGroup);
    }

    // Create walls (with shaft cutout)
    const wallThickness = 0.2;
    
    // Front wall
    const frontWallGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH + wallThickness * 2,
        FLOOR_HEIGHT * FLOOR_COUNT + wallThickness * 2,
        wallThickness
    );
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, -BUILDING_DEPTH/2 - wallThickness/2);
    scene.add(frontWall);

    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH + wallThickness * 2,
        FLOOR_HEIGHT * FLOOR_COUNT + wallThickness * 2,
        wallThickness
    );
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, BUILDING_DEPTH/2 + wallThickness/2);
    scene.add(backWall);

    // Left wall
    const leftWallGeometry = new THREE.BoxGeometry(
        wallThickness,
        FLOOR_HEIGHT * FLOOR_COUNT + wallThickness * 2,
        BUILDING_DEPTH + wallThickness * 2
    );
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-BUILDING_WIDTH/2 - wallThickness/2, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    scene.add(leftWall);

    // Right wall
    const rightWallGeometry = new THREE.BoxGeometry(
        wallThickness,
        FLOOR_HEIGHT * FLOOR_COUNT + wallThickness * 2,
        BUILDING_DEPTH + wallThickness * 2
    );
    const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
    rightWall.position.set(BUILDING_WIDTH/2 + wallThickness/2, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    scene.add(rightWall);

    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH + wallThickness * 2,
        wallThickness,
        BUILDING_DEPTH + wallThickness * 2
    );
    const groundMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(0, -wallThickness/2, 0);
    scene.add(ground);

    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH + wallThickness * 2,
        wallThickness,
        BUILDING_DEPTH + wallThickness * 2
    );
    const roofMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        side: THREE.DoubleSide
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) + wallThickness/2, 0);
    scene.add(roof);
}

function createElevator() {
    const frameMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const doorMaterial = new THREE.MeshBasicMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Elevator car dimensions
    const elevatorWidth = SHAFT_WIDTH - 0.2;
    const elevatorDepth = SHAFT_DEPTH - 0.2;
    const elevatorHeight = FLOOR_HEIGHT - 0.5;

    // Create frame (without back wall)
    const frameGroup = new THREE.Group();
    
    // Front frame
    const frontFrameGeometry = new THREE.BoxGeometry(
        elevatorWidth,
        elevatorHeight,
        0.2
    );
    const frontFrame = new THREE.Mesh(frontFrameGeometry, frameMaterial);
    frontFrame.position.z = -elevatorDepth/2 + 0.1;
    frameGroup.add(frontFrame);

    // Left side (transparent)
    const leftSideGeometry = new THREE.BoxGeometry(
        0.2,
        elevatorHeight,
        elevatorDepth
    );
    const leftSide = new THREE.Mesh(leftSideGeometry, frameMaterial);
    leftSide.position.x = -elevatorWidth/2 + 0.1;
    frameGroup.add(leftSide);

    // Right side (transparent)
    const rightSideGeometry = new THREE.BoxGeometry(
        0.2,
        elevatorHeight,
        elevatorDepth
    );
    const rightSide = new THREE.Mesh(rightSideGeometry, frameMaterial);
    rightSide.position.x = elevatorWidth/2 - 0.1;
    frameGroup.add(rightSide);

    // Top and bottom
    const topBottomGeometry = new THREE.BoxGeometry(
        elevatorWidth,
        0.2,
        elevatorDepth
    );
    const topFrame = new THREE.Mesh(topBottomGeometry, frameMaterial);
    topFrame.position.y = elevatorHeight/2 - 0.1;
    frameGroup.add(topFrame);

    const bottomFrame = new THREE.Mesh(topBottomGeometry, frameMaterial);
    bottomFrame.position.y = -elevatorHeight/2 + 0.1;
    frameGroup.add(bottomFrame);

    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(
        elevatorWidth,
        elevatorHeight,
        0.2
    );
    const backWallMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = elevatorDepth/2 - 0.1;
    frameGroup.add(backWall);

    // Doors (split into two halves)
    const doorWidth = elevatorWidth / 2 - 0.1;
    const doorHeight = elevatorHeight - 0.4;
    
    const leftDoorGeometry = new THREE.BoxGeometry(
        doorWidth,
        doorHeight,
        0.2
    );
    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    leftDoor.position.set(-doorWidth/2 - 0.1, 0, -elevatorDepth/2 + 0.1);
    frameGroup.add(leftDoor);

    const rightDoorGeometry = new THREE.BoxGeometry(
        doorWidth,
        doorHeight,
        0.2
    );
    const rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    rightDoor.position.set(doorWidth/2 + 0.1, 0, -elevatorDepth/2 + 0.1);
    frameGroup.add(rightDoor);

    // Store door references for animation
    elevatorCar = {
        object: frameGroup,
        leftDoor: leftDoor,
        rightDoor: rightDoor,
        currentFloor: 0,
        targetFloor: 0,
        isMoving: false,
        doorsOpen: false,
        passengers: []
    };

    // Position elevator at ground floor
    frameGroup.position.y = 0.1; // Slightly above ground to prevent z-fighting
    scene.add(frameGroup);
}

function createPersonOnFloor(floorIndex) {
    const personData = createPerson();
    
    // Position in front of elevator (positive Z)
    personData.object.position.set(0, floorIndex * FLOOR_HEIGHT + personData.legsY, BUILDING_DEPTH/2 - 1);
    
    // Face the elevator (rotate 180 degrees on Y axis)
    personData.object.rotation.y = Math.PI;
    
    people.push({
        object: personData.object,
        updateLegs: personData.updateLegs,
        startWalking: personData.startWalking,
        stopWalking: personData.stopWalking,
        floor: floorIndex,
        targetFloor: null,
        isBoarding: false,
        isExiting: false
    });
    
    scene.add(personData.object);
}

function selectRandomPerson() {
    const availablePeople = people.filter(p => p.floor !== emptyFloor && !p.isBoarding && !p.isExiting);
    if (availablePeople.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * availablePeople.length);
    return availablePeople[randomIndex];
}

function movePerson(person, targetFloor) {
    person.targetFloor = targetFloor;
    person.isBoarding = true;
    
    // Start elevator movement to pickup floor
    elevatorCar.targetFloor = person.floor;
    elevatorCar.isMoving = true;
}

function animateDoors(open, callback) {
    const doorSpeed = 0.02 * animationSpeed;
    
    if (open && !elevatorCar.doorsOpen) {
        // Open doors
        if (elevatorCar.leftDoor.position.x > -SHAFT_WIDTH/2 + 0.5) {
            elevatorCar.leftDoor.position.x -= doorSpeed;
            elevatorCar.rightDoor.position.x += doorSpeed;
        } else {
            elevatorCar.doorsOpen = true;
            if (callback) callback();
        }
    } else if (!open && elevatorCar.doorsOpen) {
        // Close doors
        if (elevatorCar.leftDoor.position.x < -0.1) {
            elevatorCar.leftDoor.position.x += doorSpeed;
            elevatorCar.rightDoor.position.x -= doorSpeed;
        } else {
            elevatorCar.doorsOpen = false;
            if (callback) callback();
        }
    }
}

function animateElevator(delta) {
    if (!elevatorCar.isMoving) return;
    
    const direction = Math.sign(elevatorCar.targetFloor - elevatorCar.currentFloor);
    const distance = Math.abs(elevatorCar.targetFloor - elevatorCar.currentFloor) * FLOOR_HEIGHT;
    
    // Move elevator
    const moveAmount = ELEVATOR_SPEED * animationSpeed * delta;
    if (direction === 1) {
        elevatorCar.object.position.y += moveAmount;
    } else {
        elevatorCar.object.position.y -= moveAmount;
    }
    
    // Check if reached target
    const currentY = Math.round(elevatorCar.object.position.y / FLOOR_HEIGHT);
    if (Math.abs(currentY - elevatorCar.targetFloor) < 0.1) {
        elevatorCar.object.position.y = elevatorCar.targetFloor * FLOOR_HEIGHT + 0.1;
        elevatorCar.currentFloor = elevatorCar.targetFloor;
        elevatorCar.isMoving = false;
    }
}

function animatePersonMovement(delta, personIndex) {
    const person = people[personIndex];
    
    if (person.isBoarding && !elevatorCar.isMoving) {
        // Person is boarding elevator
        person.startWalking(1); // Forward direction
        
        if (Math.abs(person.object.position.z - (-SHAFT_DEPTH/2 + 0.5)) > 0.01) {
            person.object.position.z -= PERSON_MOVE_SPEED * animationSpeed * delta;
        } else {
            // Person reached inside elevator
            person.stopWalking();
            person.isBoarding = false;
            
            // Add to elevator passengers
            elevatorCar.passengers.push(personIndex);
            scene.remove(person.object);
            elevatorCar.object.add(person.object);
            
            // Close doors after boarding
            setTimeout(() => {
                animateDoors(false, () => {
                    // Move to destination floor
                    movePersonToDestination(person);
                });
            }, 300);
        }
    } else if (person.isExiting) {
        // Person is exiting elevator
        person.startWalking(-1); // Backward direction
        
        if (Math.abs(person.object.position.z - (BUILDING_DEPTH/2 - 1)) > 0.01) {
            person.object.position.z += PERSON_MOVE_SPEED * animationSpeed * delta;
        } else {
            // Person reached outside
            person.stopWalking();
            person.isExiting = false;
            person.targetFloor = null;
            
            // Remove from elevator passengers
            const index = elevatorCar.passengers.indexOf(personIndex);
            if (index !== -1) {
                elevatorCar.object.remove(person.object);
                scene.add(person.object);
                elevatorCar.passengers.splice(index, 1);
            }
        }
    }
}

function movePersonToDestination(person) {
    // Update empty floor
    emptyFloor = person.targetFloor;
    
    // Move elevator to destination
    elevatorCar.targetFloor = person.targetFloor;
    elevatorCar.isMoving = true;
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = 0.1 * animationSpeed; // Normalized time step
    
    // Update controls
    controls.update();
    
    // Check if we need to start a new trip
    if (!elevatorCar.isMoving && elevatorCar.passengers.length === 0) {
        const person = selectRandomPerson();
        if (person) {
            // Open doors first
            animateDoors(true, () => {
                movePerson(person, emptyFloor);
            });
        }
    }
    
    // Animate elevator movement
    if (elevatorCar.isMoving) {
        animateElevator(delta);
    }
    
    // Animate people
    for (let i = 0; i < people.length; i++) {
        const person = people[i];
        
        if (person.isBoarding || person.isExiting) {
            animatePersonMovement(delta, i);
        }
        
        // Update leg animation
        person.updateLegs(delta);
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Initialize empty floor randomly (not the ground floor)
emptyFloor = Math.floor(Math.random() * (FLOOR_COUNT - 1)) + 1;

// Start the simulation when page loads
window.onload = init;
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.height);
});