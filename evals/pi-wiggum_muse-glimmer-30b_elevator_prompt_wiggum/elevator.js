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

let speedMultiplier = 1;
let emptyFloor = 0;
let isDoorAnimating = false;
let currentTripRunning = false;

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 12, 18);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    createBuilding();

    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    createPeople();

    window.addEventListener('resize', onResize);
    const slider = document.getElementById('speedSlider');
    if (slider) {
        slider.addEventListener('input', e => { speedMultiplier = parseFloat(e.target.value); });
    }

    animate();
    runTripLoop();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBuilding() {
    const building = new THREE.Group();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2 });
    const solidMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: false, opacity: 1 });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = floorY(i);
        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH), i === 0 || i === FLOOR_COUNT - 1 ? solidMat : floorMat);
        floorMesh.position.set(0, y, 0);
        building.add(floorMesh);

        const wallHeight = FLOOR_HEIGHT - 0.2;
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.2), wallMat);
        backWall.position.set(0, y + wallHeight / 2, -BUILDING_DEPTH / 2);
        building.add(backWall);

        const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2 - 0.5, wallHeight, 0.2), wallMat);
        frontLeft.position.set(-BUILDING_WIDTH / 4 - SHAFT_WIDTH / 4, y + wallHeight / 2, BUILDING_DEPTH / 2);
        building.add(frontLeft);
        const frontRight = frontLeft.clone();
        frontRight.position.x = BUILDING_WIDTH / 4 + SHAFT_WIDTH / 4;
        building.add(frontRight);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, wallHeight, BUILDING_DEPTH - SHAFT_DEPTH), wallMat);
        leftWall.position.set(-BUILDING_WIDTH / 2, y + wallHeight / 2, 0);
        building.add(leftWall);
        const rightWall = leftWall.clone();
        rightWall.position.x = BUILDING_WIDTH / 2;
        building.add(rightWall);
    }
    scene.add(building);
}

function createElevatorCar() {
    const elevatorCar = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: false, opacity: 1 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 });

    const height = FLOOR_HEIGHT * 0.9;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, height, SHAFT_DEPTH), frameMat);
    frame.position.y = height / 2;
    elevatorCar.add(frame);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, height, 0.2), backMat);
    backWall.position.set(0, height / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, SHAFT_DEPTH), sideMat);
    leftSide.position.set(-SHAFT_WIDTH / 2, height / 2, 0);
    elevatorCar.add(leftSide);
    const rightSide = leftSide.clone();
    rightSide.position.x = SHAFT_WIDTH / 2;
    elevatorCar.add(rightSide);

    const doorWidth = SHAFT_WIDTH / 2;
    const doorHeight = height * 0.8;
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.2), doorMat);
    leftDoor.position.set(-doorWidth / 2, doorHeight / 2, SHAFT_DEPTH / 2);
    const rightDoor = leftDoor.clone();
    rightDoor.position.x = doorWidth / 2;
    elevatorCar.add(leftDoor);
    elevatorCar.add(rightDoor);
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    elevatorCar.position.y = floorY(0) + height / 2;
    return elevatorCar;
}

function createPeople() {
    people = [];
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    const colors = [0xff5555, 0x55ff55, 0x5555ff, 0xffaa00, 0xaa55ff];
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;
        const person = createPerson(colors[i % colors.length]);
        person.position.set(0, floorY(i), 1.5);
        person.rotation.y = Math.PI;
        person.userData.currentFloor = i;
        person.userData.inElevator = false;
        person.userData.isWalking = false;
        scene.add(person);
        people.push(person);
    }
}

function animateWalkingLegs(time) {
    for (const p of people) {
        if (!p.userData.isWalking) continue;
        const leftLeg = p.userData.leftLeg;
        const rightLeg = p.userData.rightLeg;
        if (!leftLeg || !rightLeg) continue;
        const t = time * 10;
        leftLeg.rotation.x = Math.sin(t) * 0.5;
        rightLeg.rotation.x = Math.sin(t + Math.PI) * 0.5;
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;
    animateWalkingLegs(time);
    controls.update();
    renderer.render(scene, camera);
}

function animateElevatorToFloor(targetFloor, done) {
    const height = FLOOR_HEIGHT * 0.9;
    const targetY = floorY(targetFloor) + height / 2;
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    if (distance < 0.01) { if (done) done(); return; }
    const duration = Math.max(200, distance / ELEVATOR_SPEED * 1000 / speedMultiplier);
    const startTime = performance.now();
    function step() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        elevatorCar.position.y = THREE.MathUtils.lerp(startY, targetY, t);
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            elevatorCar.position.y = targetY;
            if (done) done();
        }
    }
    step();
}

function animateDoors(open, done) {
    if (isDoorAnimating) { if (done) done(); return; }
    isDoorAnimating = true;
    const duration = 500 / speedMultiplier;
    const startTime = performance.now();
    const leftDoor = elevatorCar.leftDoor;
    const rightDoor = elevatorCar.rightDoor;
    const doorWidth = SHAFT_WIDTH / 2;
    const closedLeft = -doorWidth / 2;
    const closedRight = doorWidth / 2;
    const openLeft = -doorWidth;
    const openRight = doorWidth;
    const targetLeft = open ? openLeft : closedLeft;
    const targetRight = open ? openRight : closedRight;
    const startLeft = leftDoor.position.x;
    const startRight = rightDoor.position.x;
    function step() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        leftDoor.position.x = THREE.MathUtils.lerp(startLeft, targetLeft, t);
        rightDoor.position.x = THREE.MathUtils.lerp(startRight, targetRight, t);
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            isDoorAnimating = false;
            if (done) done();
        }
    }
    step();
}

function walkPersonToZ(person, targetZ, done) {
    const startZ = person.position.z;
    if (Math.abs(targetZ - startZ) < 0.001) { if (done) done(); return; }
    const duration = Math.max(200, Math.abs(targetZ - startZ) / PERSON_MOVE_SPEED * 1000 / speedMultiplier);
    const startTime = performance.now();
    person.userData.isWalking = true;
    function step() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        person.position.z = THREE.MathUtils.lerp(startZ, targetZ, t);
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            person.userData.isWalking = false;
            // reset leg rotation
            const leftLeg = person.userData.leftLeg;
            const rightLeg = person.userData.rightLeg;
            if (leftLeg) leftLeg.rotation.x = 0;
            if (rightLeg) rightLeg.rotation.x = 0;
            if (done) done();
        }
    }
    step();
}

function delay(ms, done) {
    setTimeout(done, ms / speedMultiplier);
}

async function runTripLoop() {
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (currentTripRunning) continue;
        currentTripRunning = true;
        const candidates = people.filter(p => !p.userData.inElevator && p.userData.currentFloor !== emptyFloor);
        if (candidates.length === 0) {
            currentTripRunning = false;
            continue;
        }
        const person = candidates[Math.floor(Math.random() * candidates.length)];
        const fromFloor = person.userData.currentFloor;
        const toFloor = emptyFloor;

        await new Promise(res => animateElevatorToFloor(fromFloor, res));
        await new Promise(res => animateDoors(true, res));
        await new Promise(res => delay(300, res));

        const insideZ = 0.3;
        await new Promise(res => walkPersonToZ(person, insideZ, res));
        elevatorCar.attach(person);
        person.userData.inElevator = true;
        person.position.set(0, 0.5, 0);

        await new Promise(res => animateDoors(false, res));
        await new Promise(res => animateElevatorToFloor(toFloor, res));
        await new Promise(res => animateDoors(true, res));
        await new Promise(res => delay(300, res));

        scene.attach(person);
        person.userData.inElevator = false;
        person.position.y = floorY(toFloor);
        const waitingZ = 1.5;
        await new Promise(res => walkPersonToZ(person, waitingZ, res));

        await new Promise(res => animateDoors(false, res));

        emptyFloor = fromFloor;
        person.userData.currentFloor = toFloor;
        person.rotation.y = Math.PI;

        currentTripRunning = false;
    }
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
