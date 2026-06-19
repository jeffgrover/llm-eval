const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene, camera, renderer, controls, elevatorCar;
let people = [];
let simulationSpeed = 1;
let activePerson = null;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    createBuilding();
    createElevator();
    setupPeople();
    setupUI();

    window.addEventListener('resize', onWindowResize, false);
    
    animate();
    startSimulationLoop();
}

function setupUI() {
    const slider = document.getElementById('speedSlider');
    const display = document.getElementById('speedValue');
    if (slider) {
        slider.addEventListener('input', (e) => {
            simulationSpeed = parseFloat(e.target.value);
            if (display) display.innerText = simulationSpeed + 'x';
        });
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBuilding() {
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;

        const floorGroup = new THREE.Group();
        floorGroup.renderOrder = 0;
        const thickness = 0.1;
        
        const front = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, thickness, (BUILDING_DEPTH - SHAFT_DEPTH) / 2), floorMat);
        front.position.set(0, y, (SHAFT_DEPTH / 2) + (BUILDING_DEPTH - SHAFT_DEPTH) / 4);
        floorGroup.add(front);

        const back = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, thickness, (BUILDING_DEPTH - SHAFT_DEPTH) / 2), floorMat);
        back.position.set(0, y, -(SHAFT_DEPTH / 2) - (BUILDING_DEPTH - SHAFT_DEPTH) / 4);
        floorGroup.add(back);

        const left = new THREE.Mesh(new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, thickness, SHAFT_DEPTH), floorMat);
        left.position.set(-(BUILDING_WIDTH / 2 - (BUILDING_WIDTH - SHAFT_WIDTH) / 4), y, 0);
        floorGroup.add(left);

        const right = new THREE.Mesh(new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, thickness, SHAFT_DEPTH), floorMat);
        right.position.set((BUILDING_WIDTH / 2 - (BUILDING_WIDTH - SHAFT_WIDTH) / 4), y, 0);
        floorGroup.add(right);

        scene.add(floorGroup);

        const wallHeight = FLOOR_HEIGHT;
        const wallThickness = 0.1;
        const wFront = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, wallThickness), wallMat);
        wFront.position.set(0, y + wallHeight / 2, BUILDING_DEPTH / 2);
        wFront.renderOrder = 0;
        scene.add(wFront);

        const wBack = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, wallThickness), wallMat);
        wBack.position.set(0, y + wallHeight / 2, -BUILDING_DEPTH / 2);
        wBack.renderOrder = 0;
        scene.add(wBack);

        const wLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, BUILDING_DEPTH), wallMat);
        wLeft.position.set(-BUILDING_WIDTH / 2, y + wallHeight / 2, 0);
        wLeft.renderOrder = 0;
        scene.add(wLeft);

        const wRight = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, BUILDING_DEPTH), wallMat);
        wRight.position.set(BUILDING_WIDTH / 2, y + wallHeight / 2, 0);
        wRight.renderOrder = 0;
        scene.add(wRight);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH), floorMat);
    roof.position.set(0, (FLOOR_COUNT - 1) * FLOOR_HEIGHT + FLOOR_HEIGHT, 0);
    roof.renderOrder = 0;
    scene.add(roof);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const doorMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.2, 0.1), frameMat);
    backWall.position.set(0, (FLOOR_HEIGHT - 0.2) / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    const sideWallMat = new THREE.MeshStandardMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.1, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH), sideWallMat);
    leftWall.position.set(-SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH), sideWallMat);
    rightWall.position.set(SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(rightWall);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, SHAFT_DEPTH), frameMat);
    ceiling.position.set(0, FLOOR_HEIGHT - 0.1, 0);
    elevatorCar.add(ceiling);

    const eFloor = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, SHAFT_DEPTH), frameMat);
    eFloor.position.set(0, 0.05, 0);
    elevatorCar.add(eFloor);

    const doorWidth = SHAFT_WIDTH / 2;
    const doorHeight = FLOOR_HEIGHT - 0.2;
    const doorThickness = 0.05;

    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness), doorMat);
    leftDoor.position.set(-doorWidth / 2, doorHeight / 2, SHAFT_DEPTH / 2);
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness), doorMat);
    rightDoor.position.set(doorWidth / 2, doorHeight / 2, SHAFT_DEPTH / 2);
    elevatorCar.rightDoor = rightDoor;
    elevatorCar.add(rightDoor);

    scene.add(elevatorCar);
}

function setupPeople() {
    const emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;
        const person = createPerson();
        const y = i * FLOOR_HEIGHT;
        person.position.set(0, y, SHAFT_DEPTH / 2 + 2);
        person.rotation.y = Math.PI;
        scene.add(person);
        people.push({
            mesh: person,
            currentFloor: i,
            destinationFloor: -1
        });
    }
}

async function startSimulationLoop() {
    while (true) {
        const availablePeople = people.filter(p => p.destinationFloor === -1);
        if (availablePeople.length === 0) break;
        
        const personObj = availablePeople[Math.floor(Math.random() * availablePeople.length)];
        const pickupFloor = personObj.currentFloor;
        let destFloor;
        do {
            destFloor = Math.floor(Math.random() * FLOOR_COUNT);
        } while (destFloor === pickupFloor);

        personObj.destinationFloor = destFloor;
        activePerson = personObj;

        await moveElevatorTo(pickupFloor);
        await openDoors();
        await boardPerson(personObj);
        await closeDoors();
        await moveElevatorTo(destFloor);
        await openDoors();
        await exitPerson(personObj);
        await closeDoors();

        personObj.currentFloor = destFloor;
        personObj.destinationFloor = -1;
        activePerson = null;
    }
}

async function moveElevatorTo(floor) {
    return new Promise(resolve => {
        const targetY = floor * FLOOR_HEIGHT;
        const update = () => {
            const currentY = elevatorCar.position.y;
            const diff = targetY - currentY;
            if (Math.abs(diff) < 0.01) {
                elevatorCar.position.y = targetY;
                resolve();
            } else {
                elevatorCar.position.y += Math.sign(diff) * ELEVATOR_SPEED * 0.01 * simulationSpeed;
                requestAnimationFrame(update);
            }
        };
        update();
    });
}

async function openDoors() {
    return new Promise(resolve => {
        const targetOffset = SHAFT_WIDTH / 2;
        const update = () => {
            const currentLeft = elevatorCar.leftDoor.position.x;
            const currentRight = elevatorCar.rightDoor.position.x;
            const diff = targetOffset - Math.abs(currentLeft);
            if (diff < 0.01) {
                elevatorCar.leftDoor.position.x = -targetOffset;
                elevatorCar.rightDoor.position.x = targetOffset;
                setTimeout(resolve, 300);
            } else {
                const step = 0.5 * 0.01 * simulationSpeed;
                elevatorCar.leftDoor.position.x -= step;
                elevatorCar.rightDoor.position.x += step;
                requestAnimationFrame(update);
            }
        };
        update();
    });
}

async function closeDoors() {
    return new Promise(resolve => {
        const targetOffset = SHAFT_WIDTH / 4;
        const update = () => {
            const currentLeft = elevatorCar.leftDoor.position.x;
            const currentRight = elevatorCar.rightDoor.position.x;
            const diff = Math.abs(currentLeft) - targetOffset;
            if (diff < 0.01) {
                elevatorCar.leftDoor.position.x = -targetOffset;
                elevatorCar.rightDoor.position.x = targetOffset;
                setTimeout(resolve, 300);
            } else {
                const step = 0.5 * 0.01 * simulationSpeed;
                elevatorCar.leftDoor.position.x += step;
                elevatorCar.rightDoor.position.x -= step;
                requestAnimationFrame(update);
            }
        };
        update();
    });
}

async function boardPerson(personObj) {
    const person = personObj.mesh;
    person.userData.isWalking = true;
    
    return new Promise(resolve => {
        const targetZ = 0;
        const update = () => {
            const currentZ = person.position.z;
            const diff = targetZ - currentZ;
            if (Math.abs(diff) < 0.01) {
                person.position.z = targetZ;
                elevatorCar.attach(person);
                // After attach, the person's position becomes local to elevatorCar.
                // Since they were at (0, y, 0) world and elevator is at (0, y, 0),
                // their local position will be (0, 0, 0).
                person.userData.isWalking = false;
                resolve();
            } else {
                person.position.z += Math.sign(diff) * PERSON_MOVE_SPEED * 0.01 * simulationSpeed;
                requestAnimationFrame(update);
            }
        };
        update();
    });
}

async function exitPerson(personObj) {
    const person = personObj.mesh;
    person.userData.isWalking = true;
    
    return new Promise(resolve => {
        const targetZ = SHAFT_DEPTH / 2 + 2;
        const update = () => {
            // We move the person in local coordinates of elevatorCar first
            const currentZ = person.position.z;
            const diff = targetZ - currentZ;
            if (Math.abs(diff) < 0.01) {
                person.position.z = targetZ;
                scene.attach(person);
                person.userData.isWalking = false;
                resolve();
            } else {
                person.position.z += Math.sign(diff) * PERSON_MOVE_SPEED * 0.01 * simulationSpeed;
                requestAnimationFrame(update);
            }
        };
        update();
    });
}

function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.005 * simulationSpeed;
    
    people.forEach(p => {
        const person = p.mesh;
        if (person.userData.isWalking) {
            const swing = Math.sin(time) * 0.5;
            person.userData.leftLeg.rotation.x = swing;
            person.userData.rightLeg.rotation.x = -swing;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    });

    renderer.render(scene, camera);
}

init();
