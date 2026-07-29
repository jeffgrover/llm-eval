const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];
let emptyFloor;
let animationSpeed = 1;
let isAnimating = false;

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Floor material (transparent gray)
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2 });
    const solidMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });

    // Ground floor (solid)
    const groundFloorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const groundFloor = new THREE.Mesh(groundFloorGeometry, solidMaterial);
    groundFloor.rotation.x = -Math.PI / 2;
    buildingGroup.add(groundFloor);

    // Upper floors (transparent)
    for (let i = 1; i <= FLOOR_COUNT; i++) {
        const floorYPos = floorY(i);
        const floor = new THREE.Mesh(groundFloorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = floorYPos;
        buildingGroup.add(floor);
    }

    // Roof (solid)
    const roof = new THREE.Mesh(groundFloorGeometry, solidMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = floorY(FLOOR_COUNT + 1);
    buildingGroup.add(roof);

    // Walls (semi-transparent blue, with opening for shaft)
    const wallThickness = 0.5;
    const wallHeight = floorY(FLOOR_COUNT + 1);

    // Back wall
    const backWallGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, wallHeight);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, wallHeight / 2, -BUILDING_DEPTH / 2 + wallThickness / 2);
    buildingGroup.add(backWall);

    // Left wall
    const leftWallGeometry = new THREE.PlaneGeometry(BUILDING_DEPTH, wallHeight);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-BUILDING_WIDTH / 2 + wallThickness / 2, wallHeight / 2, 0);
    buildingGroup.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(BUILDING_WIDTH / 2 - wallThickness / 2, wallHeight / 2, 0);
    buildingGroup.add(rightWall);

    // Front wall (with shaft opening)
    const frontWallWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    const frontWallGeometry = new THREE.PlaneGeometry(frontWallWidth, wallHeight);

    // Left front wall section
    const leftFrontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    leftFrontWall.position.set(-(BUILDING_WIDTH / 2 - frontWallWidth / 2), wallHeight / 2, BUILDING_DEPTH / 2 - wallThickness / 2);
    buildingGroup.add(leftFrontWall);

    // Right front wall section
    const rightFrontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    rightFrontWall.position.set(BUILDING_WIDTH / 2 - frontWallWidth / 2, wallHeight / 2, BUILDING_DEPTH / 2 - wallThickness / 2);
    buildingGroup.add(rightFrontWall);

    scene.add(buildingGroup);
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();

    const frameMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const doorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });

    // Car dimensions
    const width = SHAFT_WIDTH - 1;
    const depth = SHAFT_DEPTH - 1;
    const height = FLOOR_HEIGHT - 0.5;

    // Frame (sides and back)
    const sideWallHeight = height;
    const sideWallGeometry = new THREE.PlaneGeometry(depth, sideWallHeight);

    const leftSide = new THREE.Mesh(sideWallGeometry, frameMaterial);
    leftSide.rotation.y = Math.PI / 2;
    leftSide.position.set(-width / 2, height / 2, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(sideWallGeometry, frameMaterial);
    rightSide.rotation.y = Math.PI / 2;
    rightSide.position.set(width / 2, height / 2, 0);
    elevatorCar.add(rightSide);

    // Back wall (negative Z)
    const backWallGeometry = new THREE.PlaneGeometry(width, sideWallHeight);
    const backWall = new THREE.Mesh(backWallGeometry, frameMaterial);
    backWall.position.set(0, height / 2, -depth / 2);
    elevatorCar.add(backWall);

    // Roof of elevator
    const roofGeometry = new THREE.PlaneGeometry(width, depth);
    const roof = new THREE.Mesh(roofGeometry, frameMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, height, 0);
    elevatorCar.add(roof);

    // Doors (sliding on X axis) - at positive Z (front)
    const doorWidth = (width - 0.5) / 2;
    const doorHeight = height;
    const doorGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);

    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-doorWidth / 2, height / 2, depth / 2);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(doorWidth / 2, height / 2, depth / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    return elevatorCar;
}

function createPeople() {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    // Use floors 1-5, leave floor 6 empty
    const floorAssignments = [1, 2, 3, 4, 5];
    emptyFloor = 6;

    for (let i = 0; i < 5; i++) {
        const person = createPerson(colors[i]);
        const floor = floorAssignments[i];
        // Place in front of elevator doors (positive Z)
        person.position.set(0, floorY(floor), 4);
        // Face the elevator doors (negative Z direction)
        person.rotation.y = Math.PI;
        person.userData.currentFloor = floor;
        person.userData.inElevator = false;
        scene.add(person);
        people.push(person);
    }
}

function delay(ms, done) {
    setTimeout(done, ms);
}

function animateElevatorToFloor(targetFloor, done) {
    if (isAnimating) return;
    isAnimating = true;

    const targetY = floorY(targetFloor) - 0.5;
    const startY = elevatorCar.position.y;
    const distance = targetY - startY;
    const duration = Math.abs(distance) / ELEVATOR_SPEED / animationSpeed;
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Linear interpolation
        elevatorCar.position.y = startY + distance * progress;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            elevatorCar.position.y = targetY;
            isAnimating = false;
            if (done) done();
        }
    }

    requestAnimationFrame(animate);
}

function animateDoors(open, done) {
    if (isAnimating) return;
    isAnimating = true;

    const doorOpenWidth = (SHAFT_WIDTH - 1 - 0.5) / 2;
    const doorHeight = FLOOR_HEIGHT - 0.5;
    const openDuration = 1000 / animationSpeed;
    const closeDuration = 1000 / animationSpeed;
    const startTime = performance.now();
    const startLeftX = elevatorCar.leftDoor.position.x;
    const startRightX = elevatorCar.rightDoor.position.x;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / (open ? openDuration : closeDuration), 1);

        if (open) {
            // Slide doors outward
            elevatorCar.leftDoor.position.x = startLeftX - doorOpenWidth * progress;
            elevatorCar.rightDoor.position.x = startRightX + doorOpenWidth * progress;
        } else {
            // Slide doors inward
            elevatorCar.leftDoor.position.x = startLeftX - doorOpenWidth + (doorOpenWidth * 2) * progress;
            elevatorCar.rightDoor.position.x = startRightX + doorOpenWidth - (doorOpenWidth * 2) * progress;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            isAnimating = false;
            if (done) done();
        }
    }

    requestAnimationFrame(animate);
}

function walkPersonToZ(person, targetZ, done) {
    if (isAnimating) return;
    isAnimating = true;
    person.userData.isWalking = true;

    const startY = person.position.y;
    const startZ = person.position.z;
    const distance = targetZ - startZ;
    const duration = Math.abs(distance) / PERSON_MOVE_SPEED / animationSpeed;
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        person.position.z = startZ + distance * progress;

        // Animate legs
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            isAnimating = false;
            if (done) done();
        }
    }

    requestAnimationFrame(animate);
}

function animateWalkingLegs(time) {
    people.forEach(person => {
        if (person.userData.isWalking) {
            const legAngle = Math.sin(time * 10) * 0.5;
            person.userData.leftLeg.rotation.x = legAngle;
            person.userData.rightLeg.rotation.x = -legAngle;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    });
}

async function runPassengerTrip() {
    // Find a person not in the elevator (on a floor)
    const availablePeople = people.filter(p => !p.userData.inElevator);
    if (availablePeople.length === 0 || isAnimating) return;

    // Randomly select one
    const person = availablePeople[Math.floor(Math.random() * availablePeople.length)];

    const sourceFloor = person.userData.currentFloor;
    const destFloor = emptyFloor;

    // Move elevator to passenger's floor
    await new Promise(resolve => {
        animateElevatorToFloor(sourceFloor, resolve);
    });

    // Open doors
    await new Promise(resolve => {
        animateDoors(true, resolve);
    });

    // Wait a bit for person to see doors open
    await new Promise(resolve => delay(300, resolve));

    // Walk person into elevator
    const personEnterZ = 0; // Center of elevator
    await new Promise(resolve => {
        walkPersonToZ(person, personEnterZ, resolve);
    });

    // Attach person to elevator
    elevatorCar.attach(person);
    person.userData.inElevator = true;

    // Close doors
    await new Promise(resolve => {
        animateDoors(false, resolve);
    });

    // Move elevator to destination floor
    await new Promise(resolve => {
        animateElevatorToFloor(destFloor, resolve);
    });

    // Open doors
    await new Promise(resolve => {
        animateDoors(true, resolve);
    });

    // Wait a bit for person to exit
    await new Promise(resolve => delay(300, resolve));

    // Detach person from elevator
    scene.attach(person);
    person.userData.inElevator = false;

    // Walk person out to waiting spot
    await new Promise(resolve => {
        walkPersonToZ(person, 4, resolve);
    });

    // Close doors
    await new Promise(resolve => {
        animateDoors(false, resolve);
    });

    // Update floor tracking
    emptyFloor = sourceFloor;
    person.userData.currentFloor = destFloor;
}

function startTripLoop() {
    // Run a trip, then schedule the next one after a short delay
    setTimeout(async () => {
        await runPassengerTrip();
        startTripLoop();
    }, 1000);
}

function startSimulation() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 25);
    camera.lookAt(0, 3, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Create building and elevator
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    createPeople();

    // Position elevator at ground floor initially
    elevatorCar.position.y = floorY(1) - 0.5;

    // Speed slider
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            animationSpeed = parseInt(e.target.value, 10);
        });
    }

    // Start trip loop after a short delay
    setTimeout(() => {
        startTripLoop();
    }, 2000);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);

        // Animate walking legs
        animateWalkingLegs(performance.now());
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
