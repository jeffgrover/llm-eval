// ============================================
// CONFIGURABLE CONSTANTS
// ============================================

const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 12;
const BUILDING_DEPTH = 8;
const SHAFT_WIDTH = 3;
const SHAFT_DEPTH = 2.5;
const ELEVATOR_SPEED = 0.5;
const PERSON_MOVE_SPEED = 0.1;

// ============================================
// GLOBAL VARIABLES
// ============================================

let scene, camera, renderer, controls;
let building, elevatorCar;
let people = [];
let emptyFloor = 0;
let animationSpeedMultiplier = 1;
let isAnimating = false;

// ============================================
// INITIALIZATION
// ============================================

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Camera setup - positioned at (25, 25, 25) looking at building center
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

    // Renderer setup with transparency support
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // OrbitControls for user interaction
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Create building and elevator
    createBuilding();
    createElevator();

    // Add people to floors (leaving floor 0 empty)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        addPersonToFloor(i);
    }

    // Speed control slider
    setupSpeedControl();

    // Start animation loop
    animate();

    // Start simulation after a brief delay
    setTimeout(runSimulation, 1000);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// ============================================
// BUILDING CREATION
// ============================================

function createBuilding() {
    building = new THREE.Group();

    // Floor material (transparent gray)
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    // Wall material (transparent blue)
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    // Solid ground material
    const solidMaterial = new THREE.MeshPhongMaterial({
        color: 0x666666,
        transparent: false,
        side: THREE.DoubleSide
    });

    // Create floors with elevator shaft cutout
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        
        if (i === 0) {
            // Solid ground floor
            const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
            const ground = new THREE.Mesh(groundGeometry, solidMaterial);
            ground.position.y = 0.25;
            building.add(ground);
        }

        // Floor with shaft cutout (left and right sections)
        const halfWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        
        // Left section of floor
        const leftFloorGeometry = new THREE.BoxGeometry(halfWidth, 0.3, BUILDING_DEPTH);
        const leftFloor = new THREE.Mesh(leftFloorGeometry, floorMaterial);
        leftFloor.position.set(-halfWidth / 2 - SHAFT_WIDTH / 2, floorY + 0.15, 0);
        building.add(leftFloor);

        // Right section of floor
        const rightFloorGeometry = new THREE.BoxGeometry(halfWidth, 0.3, BUILDING_DEPTH);
        const rightFloor = new THREE.Mesh(rightFloorGeometry, floorMaterial);
        rightFloor.position.set(halfWidth / 2 + SHAFT_WIDTH / 2, floorY + 0.15, 0);
        building.add(rightFloor);

        // Front section of floor (in front of shaft)
        const frontSectionDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        if (frontSectionDepth > 0.5) {
            const frontFloorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 0.3, frontSectionDepth);
            const frontFloor = new THREE.Mesh(frontFloorGeometry, floorMaterial);
            frontFloor.position.set(0, floorY + 0.15, -frontSectionDepth / 2 - SHAFT_DEPTH / 2);
            building.add(frontFloor);

            // Back section of floor (behind shaft)
            const backFloorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, 0.3, frontSectionDepth);
            const backFloor = new THREE.Mesh(backFloorGeometry, floorMaterial);
            backFloor.position.set(0, floorY + 0.15, frontSectionDepth / 2 + SHAFT_DEPTH / 2);
            building.add(backFloor);
        }

        // Walls for this floor level (except top)
        if (i < FLOOR_COUNT - 1) {
            const wallHeight = FLOOR_HEIGHT;
            
            // Left and right walls
            const leftWallGeometry = new THREE.BoxGeometry(0.3, wallHeight, BUILDING_DEPTH);
            const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
            leftWall.position.set(-BUILDING_WIDTH / 2 - 0.15, floorY + wallHeight / 2, 0);
            building.add(leftWall);

            const rightWallGeometry = new THREE.BoxGeometry(0.3, wallHeight, BUILDING_DEPTH);
            const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
            rightWall.position.set(BUILDING_WIDTH / 2 + 0.15, floorY + wallHeight / 2, 0);
            building.add(rightWall);

            // Front and back walls (with shaft cutout)
            const halfDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
            
            if (halfDepth > 0.3) {
                // Front left wall section
                const frontLeftGeometry = new THREE.BoxGeometry(halfWidth, wallHeight, 0.3);
                const frontLeftWall = new THREE.Mesh(frontLeftGeometry, wallMaterial);
                frontLeftWall.position.set(-halfWidth / 2 - SHAFT_WIDTH / 2, floorY + wallHeight / 2, -BUILDING_DEPTH / 2 - 0.15);
                building.add(frontLeftWall);

                // Front right wall section
                const frontRightGeometry = new THREE.BoxGeometry(halfWidth, wallHeight, 0.3);
                const frontRightWall = new THREE.Mesh(frontRightGeometry, wallMaterial);
                frontRightWall.position.set(halfWidth / 2 + SHAFT_WIDTH / 2, floorY + wallHeight / 2, -BUILDING_DEPTH / 2 - 0.15);
                building.add(frontRightWall);

                // Back left wall section
                const backLeftGeometry = new THREE.BoxGeometry(halfWidth, wallHeight, 0.3);
                const backLeftWall = new THREE.Mesh(backLeftGeometry, wallMaterial);
                backLeftWall.position.set(-halfWidth / 2 - SHAFT_WIDTH / 2, floorY + wallHeight / 2, BUILDING_DEPTH / 2 + 0.15);
                building.add(backLeftWall);

                // Back right wall section
                const backRightGeometry = new THREE.BoxGeometry(halfWidth, wallHeight, 0.3);
                const backRightWall = new THREE.Mesh(backRightGeometry, wallMaterial);
                backRightWall.position.set(halfWidth / 2 + SHAFT_WIDTH / 2, floorY + wallHeight / 2, BUILDING_DEPTH / 2 + 0.15);
                building.add(backRightWall);
            }

            // Shaft walls (front and back)
            const shaftFrontGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, wallHeight, 0.3);
            const shaftFrontWall = new THREE.Mesh(shaftFrontGeometry, wallMaterial);
            shaftFrontWall.position.set(0, floorY + wallHeight / 2, -SHAFT_DEPTH / 2 - 0.15);
            building.add(shaftFrontWall);

            const shaftBackGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, wallHeight, 0.3);
            const shaftBackWall = new THREE.Mesh(shaftBackGeometry, wallMaterial);
            shaftBackWall.position.set(0, floorY + wallHeight / 2, SHAFT_DEPTH / 2 + 0.15);
            building.add(shaftBackWall);
        }
    }

    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeometry, solidMaterial);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT - 0.25;
    building.add(roof);

    scene.add(building);
}

// ============================================
// ELEVATOR CREATION
// ============================================

function createElevator() {
    elevatorCar = new THREE.Group();

    // Elevator frame material (semi-transparent yellow)
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Door material (slightly more opaque)
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Solid back wall material
    const backWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Transparent side wall material
    const sideWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    // Elevator dimensions
    const carWidth = SHAFT_WIDTH - 0.4;
    const carHeight = FLOOR_HEIGHT - 0.5;
    const carDepth = SHAFT_DEPTH - 0.4;

    // Bottom frame (floor of elevator)
    const bottomGeometry = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    const bottom = new THREE.Mesh(bottomGeometry, frameMaterial);
    bottom.position.y = 0.05;
    elevatorCar.add(bottom);

    // Top frame
    const topGeometry = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    const top = new THREE.Mesh(topGeometry, frameMaterial);
    top.position.y = carHeight - 0.05;
    elevatorCar.add(top);

    // Left side wall (transparent)
    const leftSideGeometry = new THREE.BoxGeometry(0.1, carHeight, carDepth);
    const leftSide = new THREE.Mesh(leftSideGeometry, sideWallMaterial);
    leftSide.position.set(-carWidth / 2 + 0.05, carHeight / 2, 0);
    elevatorCar.add(leftSide);

    // Right side wall (transparent)
    const rightSideGeometry = new THREE.BoxGeometry(0.1, carHeight, carDepth);
    const rightSide = new THREE.Mesh(rightSideGeometry, sideWallMaterial);
    rightSide.position.set(carWidth / 2 - 0.05, carHeight / 2, 0);
    elevatorCar.add(rightSide);

    // Back wall (solid)
    const backGeometry = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
    const backWall = new THREE.Mesh(backGeometry, backWallMaterial);
    backWall.position.set(0, carHeight / 2, -carDepth / 2 + 0.05);
    elevatorCar.add(backWall);

    // Left door (slides to the left when opening)
    const doorWidth = carWidth / 2 - 0.1;
    const doorDepth = 0.1;
    
    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, carHeight - 0.2, doorDepth);
    elevatorCar.leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    elevatorCar.leftDoor.position.set(-carWidth / 4 + doorWidth / 2, (carHeight - 0.2) / 2, carDepth / 2 - 0.05);
    elevatorCar.add(elevatorCar.leftDoor);

    // Right door (slides to the right when opening)
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, carHeight - 0.2, doorDepth);
    elevatorCar.rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);
    elevatorCar.rightDoor.position.set(carWidth / 4 - doorWidth / 2, (carHeight - 0.2) / 2, carDepth / 2 - 0.05);
    elevatorCar.add(elevatorCar.rightDoor);

    // Store door state
    elevatorCar.userData = {
        isDoorsOpen: false,
        targetY: 0
    };

    scene.add(elevatorCar);
}

// ============================================
// PERSON MANAGEMENT
// ============================================

function addPersonToFloor(floor) {
    const person = createPerson();
    
    // Position in front of elevator (positive Z), facing the elevator
    const waitingZ = SHAFT_DEPTH / 2 + 1.5;
    person.position.set(0, floor * FLOOR_HEIGHT, waitingZ);
    
    // Rotate to face the elevator (looking toward negative Z)
    person.rotation.y = Math.PI;

    scene.add(person);

    people.push({
        mesh: person,
        floor: floor,
        state: 'waiting'
    });
}

function getPersonOnFloor(floor) {
    return people.find(p => p.floor === floor && p.state !== 'exited');
}

// ============================================
// ANIMATION FUNCTIONS
// ============================================

function animate() {
    requestAnimationFrame(animate);
    
    // Animate walking legs for all moving persons
    const speed = animationSpeedMultiplier;
    people.forEach(person => {
        if (person.state === 'walking' && person.userData.isWalking) {
            animateLegs(person.mesh, speed);
        } else if (person.mesh.userData.leftLeg) {
            // Reset legs to standing position
            person.mesh.userData.leftLeg.rotation.x = 0;
            person.mesh.userData.rightLeg.rotation.x = 0;
        }
    });

    controls.update();
    renderer.render(scene, camera);
}

function animateLegs(person, speed) {
    const time = Date.now() * 0.01 * speed;
    const legSwing = Math.sin(time) * 0.3;
    
    person.userData.leftLeg.rotation.x = legSwing;
    person.userData.rightLeg.rotation.x = -legSwing;
}

// ============================================
// DOOR ANIMATION
// ============================================

function openDoors(callback) {
    const doorOpenDistance = SHAFT_WIDTH / 2 + 0.5;
    const duration = 500 * animationSpeedMultiplier;
    const startTime = Date.now();

    return new Promise(resolve => {
        function animateDoors() {
            const elapsed = (Date.now() - startTime) / duration;
            
            if (elapsed < 1) {
                // Animate doors opening
                elevatorCar.leftDoor.position.x = THREE.MathUtils.lerp(
                    -SHAFT_WIDTH / 4 + 0.25,
                    -doorOpenDistance,
                    elapsed
                );
                elevatorCar.rightDoor.position.x = THREE.MathUtils.lerp(
                    SHAFT_WIDTH / 4 - 0.25,
                    doorOpenDistance,
                    elapsed
                );
                requestAnimationFrame(animateDoors);
            } else {
                // Doors fully open
                elevatorCar.leftDoor.position.x = -doorOpenDistance;
                elevatorCar.rightDoor.position.x = doorOpenDistance;
                elevatorCar.userData.isDoorsOpen = true;
                
                if (callback) callback();
                resolve();
            }
        }
        animateDoors();
    });
}

function closeDoors(callback) {
    const duration = 500 * animationSpeedMultiplier;
    const startTime = Date.now();

    return new Promise(resolve => {
        function animateDoors() {
            const elapsed = (Date.now() - startTime) / duration;
            
            if (elapsed < 1) {
                // Animate doors closing
                elevatorCar.leftDoor.position.x = THREE.MathUtils.lerp(
                    -SHAFT_WIDTH / 2 - 0.5,
                    -SHAFT_WIDTH / 4 + 0.25,
                    elapsed
                );
                elevatorCar.rightDoor.position.x = THREE.MathUtils.lerp(
                    SHAFT_WIDTH / 2 + 0.5,
                    SHAFT_WIDTH / 4 - 0.25,
                    elapsed
                );
                requestAnimationFrame(animateDoors);
            } else {
                // Doors fully closed
                elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 + 0.25;
                elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 - 0.25;
                elevatorCar.userData.isDoorsOpen = false;
                
                if (callback) callback();
                resolve();
            }
        }
        animateDoors();
    });
}

// ============================================
// ELEVATOR MOVEMENT
// ============================================

function moveElevator(toFloor, callback) {
    const targetY = toFloor * FLOOR_HEIGHT;
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = (distance / ELEVATOR_SPEED) * 100 * animationSpeedMultiplier;
    const startTime = Date.now();

    return new Promise(resolve => {
        function animateElevator() {
            const elapsed = (Date.now() - startTime) / duration;
            
            if (elapsed < 1) {
                elevatorCar.position.y = THREE.MathUtils.lerp(startY, targetY, elapsed);
                requestAnimationFrame(animateElevator);
            } else {
                elevatorCar.position.y = targetY;
                
                if (callback) callback();
                resolve();
            }
        }
        animateElevator();
    });
}

// ============================================
// PERSON MOVEMENT
// ============================================

function walkPerson(personData, fromPos, toPos, callback) {
    const person = personData.mesh;
    const distance = Math.abs(toPos.z - fromPos.z);
    const duration = (distance / PERSON_MOVE_SPEED) * 100 * animationSpeedMultiplier;
    const startTime = Date.now();

    // Start walking animation
    person.userData.isWalking = true;
    personData.state = 'walking';

    return new Promise(resolve => {
        function animateWalk() {
            const elapsed = (Date.now() - startTime) / duration;
            
            if (elapsed < 1) {
                // Move person along Z axis
                person.position.z = THREE.MathUtils.lerp(fromPos.z, toPos.z, elapsed);
                requestAnimationFrame(animateWalk);
            } else {
                // Walking complete
                person.position.z = toPos.z;
                person.userData.isWalking = false;
                personData.state = 'waiting';
                
                if (callback) callback();
                resolve();
            }
        }
        animateWalk();
    });
}

// ============================================
// SIMULATION LOGIC
// ============================================

async function runSimulation() {
    while (true) {
        // Find a person to move (not on empty floor)
        const person = people.find(p => p.floor !== emptyFloor && p.state === 'waiting');
        if (!person) break;

        const fromFloor = person.floor;
        const toFloor = emptyFloor;

        // 1. Move elevator to pickup floor
        await moveElevator(fromFloor);

        // 2. Open doors
        await openDoors();

        // Brief delay for realism
        await new Promise(r => setTimeout(r, 300 * animationSpeedMultiplier));

        // 3. Person walks into elevator (from waiting position to inside)
        const waitingZ = SHAFT_DEPTH / 2 + 1.5;
        const insideZ = -SHAFT_DEPTH / 4;
        
        await walkPerson(person, { z: waitingZ }, { z: insideZ });

        // Brief delay
        await new Promise(r => setTimeout(r, 300 * animationSpeedMultiplier));

        // 4. Add person to elevator (becomes child of elevator)
        scene.remove(person.mesh);
        elevatorCar.add(person.mesh);
        
        // Adjust position relative to elevator
        person.mesh.position.set(0, fromFloor * FLOOR_HEIGHT - elevatorCar.position.y, insideZ);

        // 5. Close doors
        await closeDoors();

        // 6. Move elevator to destination floor
        await moveElevator(toFloor);

        // 7. Open doors at destination
        await openDoors();

        // Brief delay
        await new Promise(r => setTimeout(r, 300 * animationSpeedMultiplier));

        // 8. Person walks out of elevator (from inside to waiting position)
        const exitWaitingZ = SHAFT_DEPTH / 2 + 1.5;
        
        await walkPerson(person, { z: insideZ }, { z: exitWaitingZ });

        // Brief delay
        await new Promise(r => setTimeout(r, 300 * animationSpeedMultiplier));

        // 9. Remove person from elevator and add back to scene
        elevatorCar.remove(person.mesh);
        
        // Set final position at destination floor
        person.mesh.position.set(0, toFloor * FLOOR_HEIGHT, exitWaitingZ);
        
        scene.add(person.mesh);

        // Update person's floor
        person.floor = toFloor;

        // 10. Close doors
        await closeDoors();

        // Update empty floor
        emptyFloor = fromFloor;

        // Brief pause before next cycle
        await new Promise(r => setTimeout(r, 500 * animationSpeedMultiplier));
    }
}

// ============================================
// UI CONTROLS
// ============================================

function setupSpeedControl() {
    const slider = document.getElementById('animation-speed');
    const valueDisplay = document.getElementById('speed-value');

    slider.addEventListener('input', function() {
        animationSpeedMultiplier = parseInt(this.value);
        valueDisplay.textContent = this.value + 'x';
    });
}

// ============================================
// WINDOW RESIZE HANDLER
// ============================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// START THE SIMULATION
// ============================================

init();
