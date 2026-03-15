const FLOOR_HEIGHT = 3.5;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 8;
const BUILDING_DEPTH = 8;
const SHAFT_WIDTH = 2.5;
const SHAFT_DEPTH = 2.5;
const ELEVATOR_SPEED = 4;
const PERSON_MOVE_SPEED = 2;

let scene, camera, renderer, controls;
let building, elevatorCar;
let leftDoor, rightDoor;
let floors = [];
let people = [];
let emptyFloor = 0;
let animationSpeedMultiplier = 1;
let lastTime = 0;
let doorState = { isOpen: false, isAnimating: false };
let activeAnimation = null;

const doorOpenPosition = 1.2;
const doorClosePosition = 0;
const doorAnimationSpeed = 4;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const speedSlider = document.getElementById('speedSlider');
    const speedLabel = document.getElementById('speedLabel');
    speedSlider.addEventListener('input', (e) => {
        animationSpeedMultiplier = parseFloat(e.target.value);
        speedLabel.textContent = `Speed: ${animationSpeedMultiplier}x`;
    });

    createBuilding();
    createElevator();
    initializePeople();

    window.addEventListener('resize', onWindowResize);

    animate();
    startNextMove();
}

function createBuilding() {
    building = new THREE.Group();
    building.renderOrder = 0;

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

    const solidMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floor = new THREE.Group();
        floor.userData.floorNumber = i;
        const floorY = i * FLOOR_HEIGHT;

        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.y = floorY;
        floor.add(floorMesh);

        const shaftCutoutLeft = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH / 2, 0.25, SHAFT_DEPTH),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        shaftCutoutLeft.position.set(-SHAFT_WIDTH / 4, floorY, 0);

        const shaftCutoutRight = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH / 2, 0.25, SHAFT_DEPTH),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        shaftCutoutRight.position.set(SHAFT_WIDTH / 4, floorY, 0);

        floor.add(shaftCutoutLeft);
        floor.add(shaftCutoutRight);

        const wallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * 0.9, 0.1);

        const frontWallLeft = new THREE.Mesh(wallGeometry, wallMaterial);
        frontWallLeft.position.set(-BUILDING_WIDTH / 4, floorY + FLOOR_HEIGHT * 0.45, BUILDING_DEPTH / 2);
        frontWallLeft.scale.x = 0.5;
        floor.add(frontWallLeft);

        const frontWallRight = new THREE.Mesh(wallGeometry, wallMaterial);
        frontWallRight.position.set(BUILDING_WIDTH / 4, floorY + FLOOR_HEIGHT * 0.45, BUILDING_DEPTH / 2);
        frontWallRight.scale.x = 0.5;
        floor.add(frontWallRight);

        const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
        backWall.position.set(0, floorY + FLOOR_HEIGHT * 0.45, -BUILDING_DEPTH / 2);
        floor.add(backWall);

        const sideWallGeometry = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT * 0.9, BUILDING_DEPTH - SHAFT_DEPTH);

        const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        leftWall.position.set(-BUILDING_WIDTH / 2, floorY + FLOOR_HEIGHT * 0.45, -SHAFT_DEPTH / 2);
        floor.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
        rightWall.position.set(BUILDING_WIDTH / 2, floorY + FLOOR_HEIGHT * 0.45, -SHAFT_DEPTH / 2);
        floor.add(rightWall);

        floors.push(floor);
        building.add(floor);
    }

    const groundFloor = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH),
        solidMaterial
    );
    groundFloor.position.y = -0.25;
    building.add(groundFloor);

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH),
        solidMaterial
    );
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT + 0.25;
    building.add(roof);

    scene.add(building);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const doorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const backWallMaterial = new THREE.MeshLambertMaterial({ color: 0xdddd00 });

    const elevatorWidth = SHAFT_WIDTH - 0.3;
    const elevatorDepth = SHAFT_DEPTH - 0.3;
    const elevatorHeight = FLOOR_HEIGHT * 0.85;

    const frameGeometry = new THREE.BoxGeometry(elevatorWidth, elevatorHeight, elevatorDepth);
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.y = elevatorHeight / 2;
    elevatorCar.add(frame);

    const doorHeight = elevatorHeight * 0.9;
    const doorDepth = 0.1;
    const doorWidth = elevatorWidth / 2;

    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);

    leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-doorWidth / 2, doorHeight / 2 + 0.3, elevatorDepth / 2 - doorDepth / 2);
    elevatorCar.add(leftDoor);

    rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(doorWidth / 2, doorHeight / 2 + 0.3, elevatorDepth / 2 - doorDepth / 2);
    elevatorCar.add(rightDoor);

    const backWallGeometry = new THREE.BoxGeometry(elevatorWidth, elevatorHeight, 0.1);
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.set(0, elevatorHeight / 2, -elevatorDepth / 2 + 0.05);
    elevatorCar.add(backWall);

    elevatorCar.userData.doors = { left: leftDoor, right: rightDoor };
    elevatorCar.userData.doorState = { isOpen: false, isAnimating: false };

    scene.add(elevatorCar);
}

function initializePeople() {
    const personColors = [0xe74c3c, 0x9b59b6, 0x27ae60, 0xf39c12, 0x3498db];

    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            const person = createPerson(personColors[i % personColors.length]);
            const floorY = i * FLOOR_HEIGHT;
            person.position.set(0, floorY, BUILDING_DEPTH / 2 - 2);
            person.rotation.y = Math.PI;
            person.userData.currentFloor = i;
            scene.add(person);
            people.push(person);
        }
    }
}

function startNextMove() {
    if (activeAnimation !== null) return;

    setTimeout(() => {
        const occupiedFloors = people.filter(p => scene.children.includes(p)).map(p => p.userData.currentFloor);
        if (occupiedFloors.length === 0) return;

        const randomPersonIndex = Math.floor(Math.random() * occupiedFloors.length);
        const sourceFloor = occupiedFloors[randomPersonIndex];
        const person = people.find(p => p.userData.currentFloor === sourceFloor);

        if (person) {
            runElevatorSequence(person, sourceFloor, emptyFloor);
            emptyFloor = sourceFloor;
        }
    }, 1000);
}

function runElevatorSequence(person, sourceFloor, destFloor) {
    activeAnimation = 'running';

    const sequence = [
        () => moveElevatorToFloor(sourceFloor),
        () => openDoors(),
        () => waitForMilliseconds(300),
        () => personEntersElevator(person, sourceFloor),
        () => waitForMilliseconds(300),
        () => closeDoors(),
        () => waitForMilliseconds(300),
        () => moveElevatorToFloor(destFloor),
        () => openDoors(),
        () => waitForMilliseconds(300),
        () => personExitsElevator(person, destFloor),
        () => waitForMilliseconds(300),
        () => closeDoors(),
        () => {
            activeAnimation = null;
            startNextMove();
        }
    ];

    let currentIndex = 0;

    function nextStep() {
        if (currentIndex < sequence.length) {
            const step = sequence[currentIndex];
            currentIndex++;
            step(nextStep);
        }
    }

    nextStep();
}

function moveElevatorToFloor(targetFloor, callback) {
    const targetY = targetFloor * FLOOR_HEIGHT;
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = (distance / ELEVATOR_SPEED) / animationSpeedMultiplier;
    let elapsed = 0;

    function animateMove(time) {
        elapsed += time;
        const progress = Math.min(elapsed / duration, 1);
        elevatorCar.position.y = startY + (targetY - startY) * progress;

        if (progress < 1) {
            activeAnimation = { type: 'move', animate: animateMove };
        } else {
            activeAnimation = null;
            if (callback) callback();
        }
    }

    activeAnimation = { type: 'move', animate: animateMove };
}

function openDoors(callback) {
    doorState.isAnimating = true;
    doorState.isOpen = true;

    function animateDoors(time) {
        const moveAmount = doorAnimationSpeed * time * animationSpeedMultiplier;

        if (leftDoor.position.x > -doorOpenPosition) {
            leftDoor.position.x -= moveAmount;
            rightDoor.position.x += moveAmount;
            activeAnimation = { type: 'doors', animate: animateDoors };
        } else {
            leftDoor.position.x = -doorOpenPosition;
            rightDoor.position.x = doorOpenPosition;
            doorState.isAnimating = false;
            activeAnimation = null;
            if (callback) callback();
        }
    }

    activeAnimation = { type: 'doors', animate: animateDoors };
}

function closeDoors(callback) {
    doorState.isAnimating = true;
    doorState.isOpen = false;

    function animateDoors(time) {
        const moveAmount = doorAnimationSpeed * time * animationSpeedMultiplier;

        if (leftDoor.position.x < -doorClosePosition) {
            leftDoor.position.x += moveAmount;
            rightDoor.position.x -= moveAmount;
            activeAnimation = { type: 'doors', animate: animateDoors };
        } else {
            leftDoor.position.x = -doorClosePosition;
            rightDoor.position.x = doorClosePosition;
            doorState.isAnimating = false;
            activeAnimation = null;
            if (callback) callback();
        }
    }

    activeAnimation = { type: 'doors', animate: animateDoors };
}

function personEntersElevator(person, floorNumber, callback) {
    const startZ = BUILDING_DEPTH / 2 - 2;
    const endZ = -1;
    const distance = Math.abs(endZ - startZ);
    const duration = (distance / PERSON_MOVE_SPEED) / animationSpeedMultiplier;
    let elapsed = 0;

    startWalking(person);

    function animateMove(time) {
        elapsed += time;
        const progress = Math.min(elapsed / duration, 1);
        person.position.z = startZ + (endZ - startZ) * progress;
        person.position.y = elevatorCar.position.y;

        if (progress < 1) {
            activeAnimation = { type: 'personEnter', animate: animateMove };
        } else {
            stopWalking(person);
            scene.remove(person);
            elevatorCar.add(person);
            person.position.set(0, 0.2, 0);
            person.rotation.y = Math.PI;
            person.userData.currentFloor = -1;
            activeAnimation = null;
            if (callback) callback();
        }
    }

    activeAnimation = { type: 'personEnter', animate: animateMove };
}

function personExitsElevator(person, floorNumber, callback) {
    const startZ = 0;
    const endZ = BUILDING_DEPTH / 2 - 2;
    const distance = Math.abs(endZ - startZ);
    const duration = (distance / PERSON_MOVE_SPEED) / animationSpeedMultiplier;
    let elapsed = 0;

    elevatorCar.remove(person);
    scene.add(person);
    person.position.set(0, floorNumber * FLOOR_HEIGHT, startZ);
    person.rotation.y = Math.PI;

    startWalking(person);

    function animateMove(time) {
        elapsed += time;
        const progress = Math.min(elapsed / duration, 1);
        person.position.z = startZ + (endZ - startZ) * progress;

        if (progress < 1) {
            activeAnimation = { type: 'personExit', animate: animateMove };
        } else {
            stopWalking(person);
            person.userData.currentFloor = floorNumber;
            activeAnimation = null;
            if (callback) callback();
        }
    }

    activeAnimation = { type: 'personExit', animate: animateMove };
}

function waitForMilliseconds(ms, callback) {
    const adjustedMs = ms / animationSpeedMultiplier;
    setTimeout(() => {
        if (callback) callback();
    }, adjustedMs);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
    requestAnimationFrame(animate);

    const deltaTime = (time - lastTime) / 1000;
    lastTime = time;

    controls.update();

    if (activeAnimation && activeAnimation.animate) {
        if (activeAnimation.type === 'move' || activeAnimation.type === 'doors' || 
            activeAnimation.type === 'personEnter' || activeAnimation.type === 'personExit') {
            activeAnimation.animate(deltaTime);
        }
    }

    people.forEach(person => {
        if (scene.children.includes(person)) {
            animateLegs(person, animationSpeedMultiplier, deltaTime);
        }
    });

    renderer.render(scene, camera);
}

init();