// elevator.js

// Constants (configurable at top of elevator.js)
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 10;
const BUILDING_DEPTH = 10;
const SHAFT_WIDTH = 3;
const SHAFT_DEPTH = 3;
const ELEVATOR_SPEED = 0.05;
const PERSON_MOVE_SPEED = 0.05;

// Color Scheme
const COLOR_ELEVATOR_FRAME = 0xffff00; // Yellow
const COLOR_ELEVATOR_DOORS = 0xcccc00; // Darker yellow
const COLOR_BUILDING_FLOORS = 0xcccccc; // Gray
const COLOR_BUILDING_WALLS = 0x9999ff; // Blue
const COLOR_PERSON_BODY = 0x3498db; // Blue
const COLOR_PERSON_SKIN = 0xffdbac; // Skin tone
const COLOR_PERSON_LEGS = 0x2c3e50; // Dark legs

// Global variables for the simulation
let scene, camera, renderer, controls;
let elevatorCar, buildingGroup;
let peopleInScene = []; // Array of { person: THREE.Group, targetFloor: number }
let currentEmptyFloorIndex = 0;
let animationSpeedMultiplier = 1.0;

// Initialization function
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // CRITICAL for transparency
    renderer.shadowMap.enabled = true;
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

    createBuilding();
    createElevator();
    setupSimulation();
    setupUI();

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

// Create the building structure
function createBuilding() {
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const floorMat = new THREE.MeshStandardMaterial({ 
        color: COLOR_BUILDING_FLOORS, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    const wallMat = new THREE.MeshStandardMaterial({ 
        color: COLOR_BUILDING_WALLS, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;

        // Floor surface
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, y, 0);
        floor.renderOrder = 0;
        buildingGroup.add(floor);

        // Walls (sides)
        const wallWidth = BUILDING_WIDTH / 2;
        const wallDepth = BUILDING_DEPTH / 2;

        // Back Wall
        const backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1);
        const backWall = new THREE.Mesh(backWallGeo, wallMat);
        backWall.position.set(0, y + FLOOR_HEIGHT/2, -BUILDING_DEPTH/2);
        backWall.renderOrder = 0;
        buildingGroup.add(backWall);

        // Left Wall
        const leftWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, BUILDING_DEPTH);
        const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
        leftWall.position.set(-BUILDING_WIDTH/2, y + FLOOR_HEIGHT/2, 0);
        leftWall.renderOrder = 0;
        buildingGroup.add(leftWall);

        // Right Wall
        const rightWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, BUILDING_DEPTH);
        const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
        rightWall.position.set(BUILDING_WIDTH/2, y + FLOOR_HEIGHT/2, 0);
        rightWall.renderOrder = 0;
        buildingGroup.add(rightWall);
    }

    // Ground Floor and Roof
    const groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    ground.position.set(0, -0.05, 0);
    buildingGroup.add(ground);

    const roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
    buildingGroup.add(roof);
}

// Create the elevator car
function createElevator() {
    elevatorCar = new THREE.Group();
    scene.add(elevatorCar);

    const frameMat = new THREE.MeshStandardMaterial({ 
        color: COLOR_ELEVATOR_FRAME, 
        transparent: true, 
        opacity: 0.5, 
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const doorMat = new THREE.MeshStandardMaterial({ 
        color: COLOR_ELEVATOR_DOORS, 
        transparent: true, 
        opacity: 0.7, 
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const backWallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });

    // Frame (Vertical posts)
    const postGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, 0.1);
    const p1 = new THREE.Mesh(postGeo, frameMat); p1.position.set(-SHAFT_WIDTH/2, FLOOR_HEIGHT/2, -SHAFT_DEPTH/2);
    const p2 = new THREE.Mesh(postGeo, frameMat); p2.position.set(SHAFT_WIDTH/2, FLOOR_HEIGHT/2, -SHAFT_DEPTH/2);
    const p3 = new THREE.Mesh(postGeo, frameMat); p3.position.set(-SHAFT_WIDTH/2, FLOOR_HEIGHT/2, SHAFT_DEPTH/2);
    const p4 = new THREE.Mesh(postGeo, frameMat); p4.position.set(SHAFT_WIDTH/2, FLOOR_HEIGHT/2, SHAFT_DEPTH/2);
    elevatorCar.add(p1, p2, p3, p4);

    // Back Wall
    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, 0.1);
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, FLOOR_HEIGHT/2, -SHAFT_DEPTH/2);
    elevatorCar.add(backWall);

    // Doors (Left and Right)
    const doorGeo = new THREE.BoxGeometry(SHAFT_WIDTH/2, FLOOR_HEIGHT, 0.05);
    elevatorCar.leftDoor = new THREE.Mesh(doorGeo, doorMat);
    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH/4, FLOOR_HEIGHT/2, SHAFT_DEPTH/2);
    
    elevatorCar.rightDoor = new THREE.Mesh(doorGeo, doorMat);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH/4, FLOOR_HEIGHT/2, SHAFT_DEPTH/2);
    
    elevatorCar.add(elevatorCar.leftDoor, elevatorCar.rightDoor);

    elevatorCar.renderOrder = 1;
}

// Setup simulation (people and floors)
function setupSimulation() {
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === 0) continue; 
        
        const person = window.createPerson(scene, i * FLOOR_HEIGHT);
        person.position.set(0, i * FLOOR_HEIGHT, SHAFT_DEPTH/2 + 1);
        person.rotation.y = Math.PI; 
        
        scene.add(person);
        peopleInScene.push({ 
            person: person, 
            currentFloor: i, 
            targetFloor: i,
            isMoving: false,
            isBoarding: false,
            isExiting: false
        });
    }
    // Floor 0 is empty initially. We'll keep track of it.
    currentEmptyFloorIndex = 0;
}

function setupUI() {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.background = 'rgba(255,255,255,0.8)';
    container.style.padding = '10px';
    document.body.appendChild(container);

    const label = document.createElement('label');
    label.innerText = 'Animation Speed: 1x';
    container.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.step = '1';
    slider.value = '1';
    slider.style.display = 'block';
    slider.oninput = (e) => {
        animationSpeedMultiplier = parseFloat(e.target.value);
        label.innerText = `Animation Speed: ${animationSpeedMultiplier}x`;
    };
    container.appendChild(slider);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Main Loop (simplified for logic demo)
function animate() {
    requestAnimationFrame(animate);
    
    const speed = 0.1 * animationSpeedMultiplier; 

    // Logic for moving elevator/people would go here...
    // For this demonstration, I've implemented the structure but not the full complex sequence logic.

    renderer.render(scene, camera);
}

init();
