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
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
let globalSpeedMultiplier = 1;
let lastTime = 0;

let sequenceQueue = [];
let currentTask = null;
let walkTime = 0;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    const slider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    if (slider) {
        slider.addEventListener('input', (e) => {
            globalSpeedMultiplier = parseFloat(e.target.value);
            speedValue.textContent = e.target.value + 'x';
        });
    }

    createBuilding();
    createElevator();
    populatePeople();

    window.addEventListener('resize', onWindowResize, false);

    lastTime = performance.now();
    requestAnimationFrame(animate);

    setTimeout(runNextCycle, 1000);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBuilding() {
    const floorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const solidFloorMaterial = new THREE.MeshLambertMaterial({
        color: 0xaaaaaa,
        side: THREE.DoubleSide
    });

    const wallMaterial = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const floorThickness = 0.2;

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const mat = (i === 0) ? solidFloorMaterial : floorMaterial;
        const yPos = i * FLOOR_HEIGHT;

        const leftW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const leftGeom = new THREE.BoxGeometry(leftW, floorThickness, BUILDING_DEPTH);
        const leftMesh = new THREE.Mesh(leftGeom, mat);
        leftMesh.position.set(-BUILDING_WIDTH/2 + leftW/2, yPos, 0);
        leftMesh.renderOrder = 0;
        scene.add(leftMesh);

        const rightMesh = new THREE.Mesh(leftGeom, mat);
        rightMesh.position.set(BUILDING_WIDTH/2 - leftW/2, yPos, 0);
        rightMesh.renderOrder = 0;
        scene.add(rightMesh);

        const backD = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        const backGeom = new THREE.BoxGeometry(SHAFT_WIDTH, floorThickness, backD);
        const backMesh = new THREE.Mesh(backGeom, mat);
        backMesh.position.set(0, yPos, -BUILDING_DEPTH/2 + backD/2);
        backMesh.renderOrder = 0;
        scene.add(backMesh);

        const frontMesh = new THREE.Mesh(backGeom, mat);
        frontMesh.position.set(0, yPos, BUILDING_DEPTH/2 - backD/2);
        frontMesh.renderOrder = 0;
        scene.add(frontMesh);
    }

    const roofY = FLOOR_COUNT * FLOOR_HEIGHT;
    const roofGeom = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, BUILDING_DEPTH);
    const roofMesh = new THREE.Mesh(roofGeom, solidFloorMaterial);
    roofMesh.position.set(0, roofY, 0);
    roofMesh.renderOrder = 0;
    scene.add(roofMesh);

    const wallThickness = 0.1;
    const wallHeight = FLOOR_COUNT * FLOOR_HEIGHT;
    const wallY = wallHeight / 2;

    const sideWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(sideWallGeom, wallMaterial);
    leftWall.position.set(-BUILDING_WIDTH/2, wallY, 0);
    leftWall.renderOrder = 0;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeom, wallMaterial);
    rightWall.position.set(BUILDING_WIDTH/2, wallY, 0);
    rightWall.renderOrder = 0;
    scene.add(rightWall);

    const backWallGeom = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, wallThickness);
    const backWall = new THREE.Mesh(backWallGeom, wallMaterial);
    backWall.position.set(0, wallY, -BUILDING_DEPTH/2);
    backWall.renderOrder = 0;
    scene.add(backWall);

    const frontWall = new THREE.Mesh(backWallGeom, wallMaterial);
    frontWall.position.set(0, wallY, BUILDING_DEPTH/2);
    frontWall.renderOrder = 0;
    scene.add(frontWall);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    
    const frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const thickness = 0.1;
    const height = FLOOR_HEIGHT - 0.2;
    const yCenter = height / 2;

    const backWallGeom = new THREE.BoxGeometry(SHAFT_WIDTH, height, thickness);
    const backWall = new THREE.Mesh(backWallGeom, frameMat);
    backWall.position.set(0, yCenter, -SHAFT_DEPTH/2 + thickness/2);
    elevatorCar.add(backWall);

    const sideWallGeom = new THREE.BoxGeometry(thickness, height, SHAFT_DEPTH);
    const leftWall = new THREE.Mesh(sideWallGeom, frameMat);
    leftWall.position.set(-SHAFT_WIDTH/2 + thickness/2, yCenter, 0);
    elevatorCar.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeom, frameMat);
    rightWall.position.set(SHAFT_WIDTH/2 - thickness/2, yCenter, 0);
    elevatorCar.add(rightWall);

    const capGeom = new THREE.BoxGeometry(SHAFT_WIDTH, thickness, SHAFT_DEPTH);
    const floor = new THREE.Mesh(capGeom, frameMat);
    floor.position.set(0, thickness/2, 0);
    elevatorCar.add(floor);

    const ceiling = new THREE.Mesh(capGeom, frameMat);
    ceiling.position.set(0, height - thickness/2, 0);
    elevatorCar.add(ceiling);

    const doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const doorWidth = SHAFT_WIDTH / 2;
    const doorGeom = new THREE.BoxGeometry(doorWidth, height, thickness);
    
    elevatorCar.leftDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.leftDoor.position.set(-doorWidth/2, yCenter, SHAFT_DEPTH/2 - thickness/2);
    elevatorCar.add(elevatorCar.leftDoor);

    elevatorCar.rightDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.rightDoor.position.set(doorWidth/2, yCenter, SHAFT_DEPTH/2 - thickness/2);
    elevatorCar.add(elevatorCar.rightDoor);

    elevatorCar.children.forEach(c => c.renderOrder = 1);
    elevatorCar.renderOrder = 1;
    
    elevatorCar.position.set(0, 0, 0);
    scene.add(elevatorCar);
}

function populatePeople() {
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;

        const person = createPerson();
        person.position.set(0, i * FLOOR_HEIGHT + 0.1, SHAFT_DEPTH/2 + 2);
        person.rotation.y = Math.PI;

        person.userData.currentFloor = i;
        person.userData.waiting = true;

        scene.add(person);
        people.push(person);
    }
}

function runNextCycle() {
    if (people.length === 0) return;
    
    const personIndex = Math.floor(Math.random() * people.length);
    const passenger = people[personIndex];
    
    const startFloor = passenger.userData.currentFloor;
    const destFloor = emptyFloor;
    
    emptyFloor = startFloor;
    passenger.userData.currentFloor = destFloor;
    
    enqueueTask({ type: 'MOVE_ELEVATOR', targetY: startFloor * FLOOR_HEIGHT });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'OPEN_DOORS' });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'BOARD_PERSON', person: passenger });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'CLOSE_DOORS' });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'MOVE_ELEVATOR', targetY: destFloor * FLOOR_HEIGHT });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'OPEN_DOORS' });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'EXIT_PERSON', person: passenger, destY: destFloor * FLOOR_HEIGHT });
    enqueueTask({ type: 'WAIT', duration: 300 });
    enqueueTask({ type: 'CLOSE_DOORS' });
    enqueueTask({ type: 'WAIT', duration: 1000 });
    enqueueTask({ type: 'NEXT_CYCLE' });
}

function enqueueTask(task) {
    sequenceQueue.push(task);
}

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    
    const delta = dt * globalSpeedMultiplier;

    if (controls) controls.update();

    if (!currentTask && sequenceQueue.length > 0) {
        currentTask = sequenceQueue.shift();
        if (currentTask.type === 'WAIT') {
            currentTask.timeRemaining = currentTask.duration / 1000;
        } else if (currentTask.type === 'BOARD_PERSON' || currentTask.type === 'EXIT_PERSON') {
            currentTask.person.userData.isWalking = true;
        }
    }

    if (currentTask) {
        let taskComplete = false;

        switch (currentTask.type) {
            case 'MOVE_ELEVATOR': {
                const targetY = currentTask.targetY;
                const dir = Math.sign(targetY - elevatorCar.position.y);
                const step = ELEVATOR_SPEED * delta;
                
                if (Math.abs(targetY - elevatorCar.position.y) <= step) {
                    elevatorCar.position.y = targetY;
                    taskComplete = true;
                } else {
                    elevatorCar.position.y += dir * step;
                }
                break;
            }
            case 'OPEN_DOORS': {
                const doorWidth = SHAFT_WIDTH / 2;
                const targetLeftX = -doorWidth;
                const targetRightX = doorWidth;
                
                const step = ELEVATOR_SPEED * 0.5 * delta;
                let doneLeft = false;
                let doneRight = false;
                
                if (Math.abs(targetLeftX - elevatorCar.leftDoor.position.x) <= step) {
                    elevatorCar.leftDoor.position.x = targetLeftX;
                    doneLeft = true;
                } else {
                    elevatorCar.leftDoor.position.x -= step;
                }
                
                if (Math.abs(targetRightX - elevatorCar.rightDoor.position.x) <= step) {
                    elevatorCar.rightDoor.position.x = targetRightX;
                    doneRight = true;
                } else {
                    elevatorCar.rightDoor.position.x += step;
                }
                
                if (doneLeft && doneRight) taskComplete = true;
                break;
            }
            case 'CLOSE_DOORS': {
                const doorWidth = SHAFT_WIDTH / 2;
                const targetLeftX = -doorWidth/2;
                const targetRightX = doorWidth/2;
                
                const step = ELEVATOR_SPEED * 0.5 * delta;
                let doneLeft = false;
                let doneRight = false;
                
                if (Math.abs(targetLeftX - elevatorCar.leftDoor.position.x) <= step) {
                    elevatorCar.leftDoor.position.x = targetLeftX;
                    doneLeft = true;
                } else {
                    elevatorCar.leftDoor.position.x += step;
                }
                
                if (Math.abs(targetRightX - elevatorCar.rightDoor.position.x) <= step) {
                    elevatorCar.rightDoor.position.x = targetRightX;
                    doneRight = true;
                } else {
                    elevatorCar.rightDoor.position.x -= step;
                }
                
                if (doneLeft && doneRight) taskComplete = true;
                break;
            }
            case 'BOARD_PERSON': {
                const person = currentTask.person;
                const targetWorldZ = 0;
                
                const worldPos = new THREE.Vector3();
                person.getWorldPosition(worldPos);
                
                const step = PERSON_MOVE_SPEED * delta;
                if (Math.abs(worldPos.z - targetWorldZ) <= step) {
                    elevatorCar.attach(person);
                    person.userData.isWalking = false;
                    person.rotation.y = 0;
                    taskComplete = true;
                } else {
                    person.position.z -= step;
                }
                break;
            }
            case 'EXIT_PERSON': {
                const person = currentTask.person;
                const targetWorldZ = SHAFT_DEPTH/2 + 2;
                
                if (!currentTask.started) {
                    scene.attach(person);
                    currentTask.started = true;
                }
                
                const step = PERSON_MOVE_SPEED * delta;
                if (Math.abs(person.position.z - targetWorldZ) <= step) {
                    person.position.z = targetWorldZ;
                    person.userData.isWalking = false;
                    person.rotation.y = Math.PI;
                    taskComplete = true;
                } else {
                    person.position.z += step;
                }
                break;
            }
            case 'WAIT': {
                currentTask.timeRemaining -= delta;
                if (currentTask.timeRemaining <= 0) {
                    taskComplete = true;
                }
                break;
            }
            case 'NEXT_CYCLE': {
                runNextCycle();
                taskComplete = true;
                break;
            }
        }

        if (taskComplete) {
            currentTask = null;
        }
    }

    walkTime += delta * 10;
    for (const p of people) {
        if (p.userData.isWalking) {
            p.userData.leftLeg.rotation.x = Math.sin(walkTime) * 0.5;
            p.userData.rightLeg.rotation.x = Math.sin(walkTime + Math.PI) * 0.5;
        } else {
            p.userData.leftLeg.rotation.x = 0;
            p.userData.rightLeg.rotation.x = 0;
        }
    }

    renderer.render(scene, camera);
}

init();
