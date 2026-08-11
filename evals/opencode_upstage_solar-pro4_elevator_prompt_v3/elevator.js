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
let targetFloor = -1;
let isElevatorMoving = false;
let isDoorsOpen = false;
let isPersonMoving = false;
let simSpeed = 1;
let emptyFloor = FLOOR_COUNT - 1;
let moveState = "idle";
let moveQueue = [];
let animationStartTime = 0;
let animationState = null;

const FLOOR_Y = [];
for (let i = 0; i < FLOOR_COUNT; i++) {
    FLOOR_Y.push(i * FLOOR_HEIGHT);
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const solidMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.8,
        metalness: 0.1
    });

    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeometry, solidMaterial);
    ground.position.y = -0.25;
    buildingGroup.add(ground);

    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
        const floorY = FLOOR_Y[floor];

        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.y = floorY;
        floorMesh.renderOrder = 0;
        buildingGroup.add(floorMesh);

        const wallHeight = FLOOR_HEIGHT - 0.1;

        const backWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.1);
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, floorY + wallHeight / 2, -BUILDING_DEPTH / 2 + 0.05);
        backWall.renderOrder = 0;
        buildingGroup.add(backWall);

        const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.1);
        const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
        frontWall.position.set(0, floorY + wallHeight / 2, BUILDING_DEPTH / 2 - 0.05);
        frontWall.renderOrder = 0;
        buildingGroup.add(frontWall);

        const leftWallGeometry = new THREE.BoxGeometry(0.1, wallHeight, BUILDING_DEPTH - SHAFT_DEPTH);
        const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        leftWall.position.set(-BUILDING_WIDTH / 2 + 0.05, floorY + wallHeight / 2, 0);
        leftWall.renderOrder = 0;
        buildingGroup.add(leftWall);

        const rightWallGeometry = new THREE.BoxGeometry(0.1, wallHeight, BUILDING_DEPTH - SHAFT_DEPTH);
        const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
        rightWall.position.set(BUILDING_WIDTH / 2 - 0.05, floorY + wallHeight / 2, 0);
        rightWall.renderOrder = 0;
        buildingGroup.add(rightWall);
    }

    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeometry, solidMaterial);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    buildingGroup.add(roof);

    scene.add(buildingGroup);
}

function createElevatorCar() {
    const car = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const solidBackMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        roughness: 0.5,
        metalness: 0.2
    });

    const carWidth = SHAFT_WIDTH;
    const carDepth = SHAFT_DEPTH;
    const carHeight = FLOOR_HEIGHT - 0.3;

    const backWallGeometry = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
    const backWall = new THREE.Mesh(backWallGeometry, solidBackMaterial);
    backWall.position.set(0, carHeight / 2, -carDepth / 2 + 0.05);
    car.add(backWall);

    const leftWallGeometry = new THREE.BoxGeometry(0.1, carHeight, carDepth);
    const leftWall = new THREE.Mesh(leftWallGeometry, frameMaterial);
    leftWall.position.set(-carWidth / 2 + 0.05, carHeight / 2, 0);
    car.add(leftWall);

    const rightWallGeometry = new THREE.BoxGeometry(0.1, carHeight, carDepth);
    const rightWall = new THREE.Mesh(rightWallGeometry, frameMaterial);
    rightWall.position.set(carWidth / 2 - 0.05, carHeight / 2, 0);
    car.add(rightWall);

    const frameThickness = 0.08;
    const topFrameGeometry = new THREE.BoxGeometry(carWidth + frameThickness * 2, frameThickness, carDepth + frameThickness * 2);
    const topFrame = new THREE.Mesh(topFrameGeometry, frameMaterial);
    topFrame.position.set(0, carHeight, 0);
    car.add(topFrame);

    const bottomFrameGeometry = new THREE.BoxGeometry(carWidth + frameThickness * 2, frameThickness, carDepth + frameThickness * 2);
    const bottomFrame = new THREE.Mesh(bottomFrameGeometry, frameMaterial);
    bottomFrame.position.set(0, 0, 0);
    car.add(bottomFrame);

    const doorWidth = (carWidth - 0.4) / 2;
    const doorHeight = carHeight - 0.3;
    const doorThickness = 0.05;

    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);

    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-doorWidth / 2 - 0.1, doorHeight / 2, carDepth / 2 - doorThickness / 2 - 0.05);
    leftDoor.renderOrder = 1;
    car.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(doorWidth / 2 + 0.1, doorHeight / 2, carDepth / 2 - doorThickness / 2 - 0.05);
    rightDoor.renderOrder = 1;
    car.add(rightDoor);

    car.leftDoor = leftDoor;
    car.rightDoor = rightDoor;

    return car;
}

function initializePeople() {
    people = [];
    const personStartZ = BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2 - 1.5;

    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;

        const person = createPerson();
        const floorY = FLOOR_Y[i];
        person.position.set(0, floorY, personStartZ);
        person.rotation.y = Math.PI;

        person.userData.targetFloor = emptyFloor;
        person.userData.currentFloor = i;
        person.userData.state = "waiting";

        scene.add(person);
        people.push(person);
    }
}

function moveElevatorToFloor(floor, callback) {
    if (isElevatorMoving) return;
    isElevatorMoving = true;

    const targetY = FLOOR_Y[floor] + FLOOR_HEIGHT / 2;
    const startY = elevatorCar.position.y;
    const distance = targetY - startY;
    const duration = Math.abs(distance) / ELEVATOR_SPEED * simSpeed;
    let elapsed = 0;

    animationState = {
        type: "elevatorMove",
        startY: startY,
        targetY: targetY,
        distance: distance,
        duration: duration,
        callback: callback
    };

    animationStartTime = performance.now();
}

function openDoors(callback) {
    if (isDoorsOpen || isDoorsAnimating) return;
    isDoorsAnimating = true;
    isDoorsOpen = false;

    const leftStartX = -0.1;
    const rightStartX = 0.1;
    const leftTargetX = -0.1 - 0.1 - (SHAFT_WIDTH - 0.4) / 4;
    const rightTargetX = 0.1 + 0.1 + (SHAFT_WIDTH - 0.4) / 4;
    const duration = 0.3 * simSpeed;
    let elapsed = 0;

    animationState = {
        type: "openDoors",
        leftStartX: leftStartX,
        leftTargetX: leftTargetX,
        rightStartX: rightStartX,
        rightTargetX: rightTargetX,
        duration: duration,
        callback: callback
    };

    animationStartTime = performance.now();
}

function closeDoors(callback) {
    if (!isDoorsOpen || isDoorsAnimating) return;
    isDoorsAnimating = true;

    const leftStartX = -0.1 - 0.1 - (SHAFT_WIDTH - 0.4) / 4;
    const rightStartX = 0.1 + 0.1 + (SHAFT_WIDTH - 0.4) / 4;
    const leftTargetX = -0.1;
    const rightTargetX = 0.1;
    const duration = 0.3 * simSpeed;
    let elapsed = 0;

    animationState = {
        type: "closeDoors",
        leftStartX: leftStartX,
        leftTargetX: leftTargetX,
        rightStartX: rightStartX,
        rightTargetX: rightTargetX,
        duration: duration,
        callback: callback
    };

    animationStartTime = performance.now();
}

function movePersonToTarget(person, callback) {
    person.userData.isWalking = true;
    const startPos = person.position.clone();

    let targetPos;
    if (person.userData.state === "boarding") {
        targetPos = new THREE.Vector3(0, person.position.y, SHAFT_DEPTH / 2 - 0.5);
    } else {
        const waitingZ = BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2 - 1.5;
        targetPos = new THREE.Vector3(0, person.position.y, waitingZ);
    }

    const distance = startPos.distanceTo(targetPos);
    const duration = distance / PERSON_MOVE_SPEED * simSpeed;

    animationState = {
        type: "personMove",
        person: person,
        startPos: startPos,
        targetPos: targetPos,
        duration: duration,
        callback: callback
    };

    animationStartTime = performance.now();
}

function updateAnimation() {
    if (!animationState) return;

    const now = performance.now();
    const elapsed = (now - animationStartTime) / 1000 * simSpeed;

    if (animationState.type === "elevatorMove") {
        const t = Math.min(elapsed / animationState.duration, 1);
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const currentY = animationState.startY + animationState.distance * easedT;
        elevatorCar.position.y = currentY;

        if (t >= 1 || Math.abs(elevatorCar.position.y - animationState.targetY) < 0.01) {
            elevatorCar.position.y = animationState.targetY;
            isElevatorMoving = false;
            animationState.callback();
            animationState = null;
        }
    } else if (animationState.type === "openDoors") {
        const t = Math.min(elapsed / animationState.duration, 1);
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        elevatorCar.leftDoor.position.x = animationState.leftStartX + (animationState.leftTargetX - animationState.leftStartX) * easedT;
        elevatorCar.rightDoor.position.x = animationState.rightStartX + (animationState.rightTargetX - animationState.rightStartX) * easedT;

        if (t >= 1) {
            elevatorCar.leftDoor.position.x = animationState.leftTargetX;
            elevatorCar.rightDoor.position.x = animationState.rightTargetX;
            isDoorsOpen = true;
            isDoorsAnimating = false;
            animationState.callback();
            animationState = null;
        }
    } else if (animationState.type === "closeDoors") {
        const t = Math.min(elapsed / animationState.duration, 1);
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        elevatorCar.leftDoor.position.x = animationState.leftStartX + (animationState.leftTargetX - animationState.leftStartX) * easedT;
        elevatorCar.rightDoor.position.x = animationState.rightStartX + (animationState.rightTargetX - animationState.rightStartX) * easedT;

        if (t >= 1) {
            elevatorCar.leftDoor.position.x = animationState.leftTargetX;
            elevatorCar.rightDoor.position.x = animationState.rightTargetX;
            isDoorsOpen = false;
            isDoorsAnimating = false;
            animationState.callback();
            animationState = null;
        }
    } else if (animationState.type === "personMove") {
        const t = Math.min(elapsed / animationState.duration, 1);

        animationState.person.position.x = animationState.startPos.x + (animationState.targetPos.x - animationState.startPos.x) * t;
        animationState.person.position.y = animationState.startPos.y + (animationState.targetPos.y - animationState.startPos.y) * t;
        animationState.person.position.z = animationState.startPos.z + (animationState.targetPos.z - animationState.startPos.z) * t;

        if (t >= 1 || animationState.person.position.distanceTo(animationState.targetPos) < 0.05) {
            animationState.person.position.copy(animationState.targetPos);
            animationState.person.userData.isWalking = false;
            animationState.callback();
            animationState = null;
        }
    }
}

function animateLegs(time) {
    for (const person of people) {
        if (person.userData.isWalking) {
            const legSwing = Math.sin(time * 8) * 0.3;
            person.userData.leftLeg.rotation.x = legSwing;
            person.userData.rightLeg.rotation.x = -legSwing;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }
}

function processMoveQueue() {
    if (moveQueue.length === 0 || isElevatorMoving || isDoorsAnimating || isPersonMoving) return;

    const nextMove = moveQueue.shift();
    executeMove(nextMove);
}

function executeMove(move) {
    const person = move.person;

    if (person.userData.state === "waiting") {
        person.userData.targetFloor = emptyFloor;
        person.userData.state = "boarding";
        moveState = "boarding";

        moveElevatorToFloor(person.userData.currentFloor, () => {
            setTimeout(() => {
                openDoors(() => {
                    setTimeout(() => {
                        movePersonToTarget(person, () => {
                            person.userData.isWalking = false;
                            elevatorCar.attach(person);
                            setTimeout(() => {
                                closeDoors(() => {
                                    setTimeout(() => {
                                        moveState = "traveling";
                                        moveElevatorToFloor(person.userData.targetFloor, () => {
                                            setTimeout(() => {
                                                openDoors(() => {
                                                    setTimeout(() => {
                                                        person.userData.state = "exiting";
                                                        scene.attach(person);
                                                        movePersonToTarget(person, () => {
                                                            person.userData.isWalking = false;
                                                            person.userData.currentFloor = person.userData.targetFloor;
                                                            person.userData.state = "waiting";
                                                            emptyFloor = move.originalFloor;
                                                            moveState = "idle";
                                                            processMoveQueue();
                                                        });
                                                    }, 300);
                                                });
                                            }, 300);
                                        });
                                    }, 300);
                                });
                            }, 300);
                        });
                    }, 500);
                });
            }, 300);
        });
    }
}

function scheduleRandomMove() {
    const waitingPeople = people.filter(p => p.userData.state === "waiting" && p.userData.currentFloor !== emptyFloor);

    if (waitingPeople.length === 0) {
        setTimeout(scheduleRandomMove, 500);
        return;
    }

    const person = waitingPeople[Math.floor(Math.random() * waitingPeople.length)];

    moveQueue.push({
        person: person,
        originalFloor: person.userData.currentFloor
    });

    setTimeout(scheduleRandomMove, 1000 + Math.random() * 3000);
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    createBuilding();
    elevatorCar = createElevatorCar();
    elevatorCar.position.y = FLOOR_HEIGHT / 2;
    scene.add(elevatorCar);

    const slider = document.getElementById("speedSlider");
    const speedValue = document.getElementById("speedValue");
    slider.addEventListener("input", (event) => {
        simSpeed = parseFloat(event.target.value);
        speedValue.textContent = simSpeed + "x";
    });

    initializePeople();
    setTimeout(scheduleRandomMove, 2000);

    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now() / 1000;

        controls.update();
        updateAnimation();
        animateLegs(time);

        renderer.render(scene, camera);
    }
    animate();
}

window.addEventListener("resize", () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

let isDoorsAnimating = false;

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
