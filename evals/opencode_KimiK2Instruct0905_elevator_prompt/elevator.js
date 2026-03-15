// Configuration constants
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 12;
const BUILDING_DEPTH = 10;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 4;
const ELEVATOR_SPEED = 0.03;
const PERSON_MOVE_SPEED = 0.02;

// Global variables
let scene, camera, renderer, controls;
let building, elevatorCar, elevatorDoors;
let people = [];
let emptyFloor = 0;
let animationSpeed = 1;
let isAnimating = false;

// Initialize the scene
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    
    // Create renderer with transparency support
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    // Add controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    // Create building
    createBuilding();
    
    // Create elevator
    createElevator();
    
    // Create people
    createPeople();
    
    // Add controls UI
    createControls();
    
    // Start animation loop
    animate();
    
    // Start simulation
    setTimeout(startSimulation, 1000);
}

// Create building structure
function createBuilding() {
    building = new THREE.Group();
    
    // Create floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        
        // Floor surface (transparent)
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            transparent: true, 
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = floorY;
        floor.renderOrder = 0;
        building.add(floor);
        
        // Create walls (skip elevator shaft area)
        const wallMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x9999ff, 
            transparent: true, 
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
        // Back wall
        const backWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * 0.8, 0.2);
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, floorY + FLOOR_HEIGHT * 0.4, -BUILDING_DEPTH / 2);
        backWall.renderOrder = 0;
        building.add(backWall);
        
        // Front walls (left and right of shaft)
        const frontWallWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        
        // Left front wall
        const leftFrontWallGeometry = new THREE.BoxGeometry(frontWallWidth, FLOOR_HEIGHT * 0.8, 0.2);
        const leftFrontWall = new THREE.Mesh(leftFrontWallGeometry, wallMaterial);
        leftFrontWall.position.set(-BUILDING_WIDTH / 2 + frontWallWidth / 2, floorY + FLOOR_HEIGHT * 0.4, BUILDING_DEPTH / 2);
        leftFrontWall.renderOrder = 0;
        building.add(leftFrontWall);
        
        // Right front wall
        const rightFrontWall = new THREE.Mesh(leftFrontWallGeometry, wallMaterial);
        rightFrontWall.position.set(BUILDING_WIDTH / 2 - frontWallWidth / 2, floorY + FLOOR_HEIGHT * 0.4, BUILDING_DEPTH / 2);
        rightFrontWall.renderOrder = 0;
        building.add(rightFrontWall);
        
        // Side walls
        const sideWallGeometry = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT * 0.8, BUILDING_DEPTH);
        
        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        leftWall.position.set(-BUILDING_WIDTH / 2, floorY + FLOOR_HEIGHT * 0.4, 0);
        leftWall.renderOrder = 0;
        building.add(leftWall);
        
        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        rightWall.position.set(BUILDING_WIDTH / 2, floorY + FLOOR_HEIGHT * 0.4, 0);
        rightWall.renderOrder = 0;
        building.add(rightWall);
    }
    
    // Solid ground floor
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.25;
    building.add(ground);
    
    // Solid roof
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT + 0.25;
    building.add(roof);
    
    scene.add(building);
}

// Create elevator structure
function createElevator() {
    elevatorCar = new THREE.Group();
    
    // Elevator frame (semi-transparent yellow)
    const frameMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Floor
    const floorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, 0.1, SHAFT_DEPTH - 0.2);
    const floor = new THREE.Mesh(floorGeometry, frameMaterial);
    floor.position.y = 0.05;
    elevatorCar.add(floor);
    
    // Ceiling
    const ceiling = new THREE.Mesh(floorGeometry, frameMaterial);
    ceiling.position.y = FLOOR_HEIGHT - 0.1;
    elevatorCar.add(ceiling);
    
    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, FLOOR_HEIGHT - 0.2, 0.1);
    const backWall = new THREE.Mesh(backWallGeometry, frameMaterial);
    backWall.position.z = -(SHAFT_DEPTH - 0.2) / 2;
    elevatorCar.add(backWall);
    
    // Side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH - 0.2);
    const sideWallMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const leftWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    leftWall.position.x = -(SHAFT_WIDTH - 0.2) / 2;
    elevatorCar.add(leftWall);
    
    const rightWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    rightWall.position.x = (SHAFT_WIDTH - 0.2) / 2;
    elevatorCar.add(rightWall);
    
    // Create sliding doors
    elevatorDoors = new THREE.Group();
    const doorMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const doorGeometry = new THREE.BoxGeometry((SHAFT_WIDTH - 0.2) / 2, FLOOR_HEIGHT - 0.2, 0.1);
    
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-(SHAFT_WIDTH - 0.2) / 4, (FLOOR_HEIGHT - 0.2) / 2, (SHAFT_DEPTH - 0.2) / 2);
    leftDoor.name = 'leftDoor';
    elevatorDoors.add(leftDoor);
    
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set((SHAFT_WIDTH - 0.2) / 4, (FLOOR_HEIGHT - 0.2) / 2, (SHAFT_DEPTH - 0.2) / 2);
    rightDoor.name = 'rightDoor';
    elevatorDoors.add(rightDoor);
    
    elevatorCar.add(elevatorDoors);
    elevatorCar.renderOrder = 1;
    
    // Position elevator at ground floor
    elevatorCar.position.y = 0;
    scene.add(elevatorCar);
}

// Create people
function createPeople() {
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson();
            // Position person in front of elevator (positive Z), facing elevator
            person.position.set(0, 0.85, 4); // Feet on floor, facing elevator
            person.rotation.y = Math.PI; // Face elevator
            
            // Move to correct floor
            person.position.y = i * FLOOR_HEIGHT + 0.85;
            
            person.userData.currentFloor = i;
            person.userData.targetFloor = -1;
            person.userData.isInElevator = false;
            
            people.push(person);
            scene.add(person);
        }
    }
}

// Create UI controls
function createControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'controls';
    controlsDiv.innerHTML = `
        <h3>Elevator Simulation</h3>
        <div>
            <label for="speedSlider">Animation Speed: </label>
            <input type="range" id="speedSlider" min="1" max="20" value="1" step="0.5">
            <span id="speedValue">1x</span>
        </div>
    `;
    document.body.appendChild(controlsDiv);
    
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    speedSlider.addEventListener('input', (e) => {
        animationSpeed = parseFloat(e.target.value);
        speedValue.textContent = animationSpeed + 'x';
    });
}

// Elevator door animation
function animateDoors(open, callback) {
    const leftDoor = elevatorDoors.getObjectByName('leftDoor');
    const rightDoor = elevatorDoors.getObjectByName('rightDoor');
    
    const targetX = open ? (SHAFT_WIDTH - 0.2) / 4 : 0;
    const duration = 1000 / animationSpeed;
    const startTime = Date.now();
    const startLeftX = leftDoor.position.x;
    const startRightX = rightDoor.position.x;
    
    function updateDoors() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (open) {
            leftDoor.position.x = startLeftX - (startLeftX + targetX) * progress;
            rightDoor.position.x = startRightX + (targetX - startRightX) * progress;
        } else {
            leftDoor.position.x = startLeftX + (-targetX - startLeftX) * progress;
            rightDoor.position.x = startRightX + (targetX - startRightX) * progress;
        }
        
        if (progress < 1) {
            requestAnimationFrame(updateDoors);
        } else if (callback) {
            setTimeout(callback, 300 / animationSpeed);
        }
    }
    
    updateDoors();
}

// Move person with walking animation
function movePerson(person, targetX, targetZ, callback) {
    const startX = person.position.x;
    const startZ = person.position.z;
    const distance = Math.sqrt((targetX - startX) ** 2 + (targetZ - startZ) ** 2);
    const duration = (distance / PERSON_MOVE_SPEED) / animationSpeed;
    const startTime = Date.now();
    
    function updatePosition() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Update position
        person.position.x = startX + (targetX - startX) * progress;
        person.position.z = startZ + (targetZ - startZ) * progress;
        
        // Animate walking
        animatePersonWalk(person, elapsed / 1000);
        
        if (progress < 1) {
            requestAnimationFrame(updatePosition);
        } else {
            resetPersonPose(person);
            if (callback) callback();
        }
    }
    
    updatePosition();
}

// Move elevator to floor
function moveElevatorToFloor(floor, callback) {
    const targetY = floor * FLOOR_HEIGHT;
    const startY = elevatorCar.position.y;
    
    function updateElevator() {
        if (Math.abs(elevatorCar.position.y - targetY) > 0.01) {
            const direction = targetY > elevatorCar.position.y ? 1 : -1;
            elevatorCar.position.y += direction * ELEVATOR_SPEED * animationSpeed;
            requestAnimationFrame(updateElevator);
        } else {
            elevatorCar.position.y = targetY;
            if (callback) callback();
        }
    }
    
    updateElevator();
}

// Board person into elevator
function boardPerson(person, callback) {
    // Open doors, then move person in
    animateDoors(true, () => {
        movePerson(person, 0, 1, () => { // Move to inside elevator
            // Add person as child of elevator
            const worldPosition = new THREE.Vector3();
            person.getWorldPosition(worldPosition);
            elevatorCar.add(person);
            person.position.copy(worldPosition);
            
            // Convert world position to local position relative to elevator
            const localPosition = elevatorCar.worldToLocal(worldPosition.clone());
            person.position.copy(localPosition);
            
            person.userData.isInElevator = true;
            
            setTimeout(() => {
                animateDoors(false, callback);
            }, 300 / animationSpeed);
        });
    });
}

// Exit person from elevator
function exitPerson(person, targetFloor, callback) {
    // Open doors
    animateDoors(true, () => {
        // Remove person from elevator and add to scene
        const worldPosition = new THREE.Vector3();
        person.getWorldPosition(worldPosition);
        scene.add(person);
        person.position.copy(worldPosition);
        
        person.userData.isInElevator = false;
        person.userData.currentFloor = targetFloor;
        
        // Move to waiting position in front of elevator
        movePerson(person, 0, 4, () => {
            setTimeout(() => {
                animateDoors(false, callback);
            }, 300 / animationSpeed);
        });
    });
}

// Main simulation sequence
function runElevatorSequence() {
    if (isAnimating) return;
    isAnimating = true;
    
    // Find a person to move
    const availablePeople = people.filter(p => p.userData.currentFloor !== emptyFloor);
    if (availablePeople.length === 0) {
        isAnimating = false;
        return;
    }
    
    const person = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    const fromFloor = person.userData.currentFloor;
    const toFloor = emptyFloor;
    
    // Update empty floor
    emptyFloor = fromFloor;
    
    // Sequence: Move to floor -> Board -> Move to target -> Exit
    moveElevatorToFloor(fromFloor, () => {
        boardPerson(person, () => {
            moveElevatorToFloor(toFloor, () => {
                exitPerson(person, toFloor, () => {
                    isAnimating = false;
                    // Start next sequence after delay
                    setTimeout(runElevatorSequence, 2000 / animationSpeed);
                });
            });
        });
    });
}

// Start simulation
function startSimulation() {
    runElevatorSequence();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize when page loads
window.addEventListener('load', init);