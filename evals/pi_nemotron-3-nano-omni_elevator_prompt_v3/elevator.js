const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let currentFloor = 0;
let targetFloor = 0;
let isMoving = false;
let doorOpen = false;
let doorOpenProgress = 0;
let doorCloseProgress = 0;
let speedMultiplier = 1;

function startSimulation() {
    // Setup scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    
    // Setup camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    
    // Setup renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);
    
    // Setup controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    // Add lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    
    // Create building
    createBuilding();
    
    // Create elevator
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    
    // Create people
    createPeople();
    
    // Set up speed slider
    document.getElementById('speed-slider').addEventListener('input', function(e) {
        speedMultiplier = parseFloat(e.target.value);
    });
    
    // Start animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        
        // Update elevator position
        if (isMoving) {
            const direction = targetFloor > currentFloor ? 1 : -1;
            elevatorCar.position.y += direction * ELEVATOR_SPEED * speedMultiplier * 0.016;
            
            // Check if we've reached target floor
            const floorDiff = Math.abs(elevatorCar.position.y - targetFloor * FLOOR_HEIGHT);
            if (floorDiff < 0.1) {
                elevatorCar.position.y = targetFloor * FLOOR_HEIGHT;
                isMoving = false;
                doorOpen = true;
                doorOpenProgress = 0;
            }
        }
        
        // Update door animations
        if (doorOpen) {
            doorOpenProgress += 0.016 * speedMultiplier;
            if (doorOpenProgress >= 1) {
                doorOpen = false;
                // Person boarding/exiting logic here
                if (people.length > 0) {
                    const person = people[0];
                    if (person.userData.isWalking) {
                        // Wait for walking animation to complete
                        setTimeout(() => {
                            boardPerson(person);
                        }, 500);
                    } else {
                        boardPerson(person);
                    }
                }
            }
        } else if (doorCloseProgress > 0) {
            doorCloseProgress -= 0.016 * speedMultiplier;
            if (doorCloseProgress <= 0) {
                doorCloseProgress = 0;
                // Person exiting logic here
                exitPerson(people[0]);
                people.shift();
            }
        }
        
        renderer.render(scene, camera);
    }
    
    animate();
    
    // Handle DOMContentLoaded
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", () => {
            startSimulation();
        });
    } else {
        startSimulation();
    }
}

function createBuilding() {
    // Create floor geometry
    const floorGeom = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const floorMat = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc, 
        opacity: 0.3, 
        transparent: true,
        depthWrite: false 
    });
    
    // Create walls
    const wallGeom = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const wallMat = new THREE.MeshPhongMaterial({ 
        color: 0x9999ff, 
        opacity: 0.2, 
        transparent: true,
        depthWrite: false 
    });
    
    // Create shaft
    const shaftGeom = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const shaftMat = new THREE.MeshPhongMaterial({ 
        color: 0x333333, 
        depthWrite: true 
    });
    
    // Create floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.position.y = i * FLOOR_HEIGHT;
        scene.add(floor);
    }
    
    // Create walls (excluding shaft area)
    const wallWidth = BUILDING_WIDTH - SHAFT_WIDTH;
    const wallDepth = BUILDING_DEPTH - SHAFT_DEPTH;
    
    // Front and back walls
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const wall = new THREE.Mesh(wallGeom, wallMat);
        wall.position.y = i * FLOOR_HEIGHT + FLOOR_HEIGHT/2;
        wall.position.x = -BUILDING_WIDTH/2 + SHAFT_WIDTH/2;
        wall.position.z = 0;
        scene.add(wall);
    }
    
    // Left and right walls
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const wall = new THREE.Mesh(wallGeom, wallMat);
        wall.position.y = i * FLOOR_HEIGHT + FLOOR_HEIGHT/2;
        wall.position.x = 0;
        wall.position.z = -BUILDING_DEPTH/2 + SHAFT_DEPTH/2;
        scene.add(wall);
    }
    
    // Solid ground floor and roof
    const solidGeom = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const solidMat = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc, 
        depthWrite: true 
    });
    
    const ground = new THREE.Mesh(solidGeom, solidMat);
    ground.position.y = -0.1;
    scene.add(ground);
    
    const roof = new THREE.Mesh(solidGeom, solidMat);
    roof.position.y = (FLOOR_COUNT * FLOOR_HEIGHT) + 0.1;
    scene.add(roof);
}

function createElevatorCar() {
    // Create elevator frame
    const frameGeom = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, SHAFT_DEPTH);
    const frameMat = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        opacity: 0.5, 
        transparent: true,
        depthWrite: false 
    });
    
    elevatorCar = new THREE.Group();
    
    // Main frame
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.y = 0;
    elevatorCar.add(frame);
    
    // Left door
    const doorGeom = new THREE.PlaneGeometry(SHAFT_WIDTH/2, FLOOR_HEIGHT, 0.5);
    const doorMat = new THREE.MeshPhongMaterial({ 
        color: 0xcccc00, 
        opacity: 0.7, 
        transparent: true,
        depthWrite: false 
    });
    elevatorCar.leftDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.leftDoor.position.y = 0;
    elevatorCar.leftDoor.position.z = -SHAFT_DEPTH/4;
    elevatorCar.add(elevatorCar.leftDoor);
    
    // Right door
    elevatorCar.rightDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.rightDoor.position.y = 0;
    elevatorCar.rightDoor.position.z = SHAFT_DEPTH/4;
    elevatorCar.add(elevatorCar.rightDoor);
    
    // Position elevator at ground floor
    elevatorCar.position.y = 0;
    
    return elevatorCar;
}

function createPeople() {
    // Create multiple people
    for (let i = 0; i < 3; i++) {
        const person = createPerson();
        person.position.set(0, 0, 2); // Position in front of elevator
        person.rotation.y = Math.PI; // Face elevator
        scene.add(person);
        people.push(person);
    }
    
    // Position people on different floors
    for (let i = 0; i < people.length; i++) {
        const floor = Math.floor(i * (FLOOR_COUNT / people.length));
        people[i].position.y = floor * FLOOR_HEIGHT + FLOOR_HEIGHT/2 + 0.5;
    }
}

function createPerson() {
    const person = new THREE.Group();
    
    // Legs
    const legGeom = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    const leftLeg = new THREE.Mesh(legGeom, new THREE.MeshPhongMaterial({ color: 0x2c3e50 }));
    const rightLeg = new THREE.Mesh(legGeom, new THREE.MeshPhongMaterial({ color: 0x2c3e50 }));
    leftLeg.position.y = -0.5;
    rightLeg.position.y = -0.5;
    person.add(leftLeg);
    person.add(rightLeg);
    
    // Torso
    const torsoGeom = new THREE.BoxGeometry(0.5, 1, 0.5);
    const torso = new THREE.Mesh(torsoGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    torso.position.y = 0;
    person.add(torso);
    
    // Head
    const headGeom = new THREE.SphereGeometry(0.3, 16);
    const head = new THREE.Mesh(headGeom, new THREE.MeshPhongMaterial({ color: 0xffdbac }));
    head.position.y = 0.5;
    person.add(head);
    
    // Arms
    const armGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    const leftArm = new THREE.Mesh(armGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    const rightArm = new THREE.Mesh(armGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    leftArm.position.set(-0.5, 0.5, 0);
    rightArm.position.set(0.5, 0.5, 0);
    person.add(leftArm);
    person.add(rightArm);
    
    // Set up userData
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    return person;
}

function boardPerson(person) {
    // Animate door opening
    doorOpen = true;
    doorOpenProgress = 0;
    
    // Animate person walking into elevator
    person.userData.isWalking = true;
    const walkInterval = setInterval(() => {
        if (person.userData.isWalking) {
            // Animate legs
            person.userData.leftLeg.rotation.x = Math.sin(Date.now() * 0.001 * speedMultiplier) * 0.2;
            person.userData.rightLeg.rotation.x = Math.sin(Date.now() * 0.001 * speedMultiplier + 3.14) * 0.2;
        } else {
            clearInterval(walkInterval);
        }
    }, 16);
    
    // Move person to elevator after door opens
    setTimeout(() => {
        elevatorCar.attach(person);
        person.position.set(0, 0, 0);
    }, 1000);
}

function exitPerson(person) {
    // Animate door closing
    doorCloseProgress = 0;
    doorOpen = false;
    
    // Animate person walking out
    person.userData.isWalking = true;
    const walkInterval = setInterval(() => {
        if (person.userData.isWalking) {
            // Animate legs
            person.userData.leftLeg.rotation.x = Math.sin(Date.now() * 0.001 * speedMultiplier) * 0.2;
            person.userData.rightLeg.rotation.x = Math.sin(Date.now() * 0.001 * speedMultiplier + 3.14) * 0.2;
        } else {
            clearInterval(walkInterval);
        }
    }, 16);
    
    // Move person out of elevator after door closes
    setTimeout(() => {
        scene.attach(person);
        person.position.set(0, 0, 2);
    }, 1000);
}

// Start simulation
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}