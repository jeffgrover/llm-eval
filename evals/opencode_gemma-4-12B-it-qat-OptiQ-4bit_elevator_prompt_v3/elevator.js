// Constants (H6)
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
let speedMultiplier = 1;

// Simulation State
let simulationState = {
    step: 'IDLE',
    person: null,
    pickupFloor: 0,
    destFloor: 0,
    doorPhase: 0 // 0: closed, 1: opening, 2: open, 3: closing
};

function createBuilding() {
    const buildingGroup = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;
        const floorGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeom, floorMat);
        floor.position.y = y;
        floor.renderOrder = 0;
        buildingGroup.add(floor);

        const sideGeom = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, BUILDING_DEPTH);
        const leftWall = new THREE.Mesh(sideGeom, wallMat);
        leftWall.position.set(-BUILDING_WIDTH/2, y + FLOOR_HEIGHT/2, 0);
        buildingGroup.add(leftWall);

        const rightWall = new THREE.Mesh(sideGeom, wallMat);
        rightWall.position.set(BUILDING_WIDTH/2, y + FLOOR_HEIGHT/2, 0);
        buildingGroup.add(rightWall);

        const backWallGeom = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1);
        const backWall = new THREE.Mesh(backWallGeom, wallMat);
        backWall.position.set(0, y + FLOOR_HEIGHT/2, -BUILDING_DEPTH/2);
        buildingGroup.add(backWall);

        const frontPartWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const frontWallGeom = new THREE.BoxGeometry(frontPartWidth, FLOOR_HEIGHT, 0.1);
        const leftFront = new THREE.Mesh(frontWallGeom, wallMat);
        leftFront.position.set(-BUILDING_WIDTH/2 + frontPartWidth/2, y + FLOOR_HEIGHT/2, BUILDING_DEPTH/2);
        buildingGroup.add(leftFront);

        const rightFront = new THREE.Mesh(frontWallGeom, wallMat);
        rightFront.position.set(BUILDING_WIDTH/2 - frontPartWidth/2, y + FLOOR_HEIGHT/2, BUILDING_DEPTH/2);
        buildingGroup.add(rightFront);
    }

    const roofGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeom, floorMat);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    buildingGroup.add(roof);

    scene.add(buildingGroup);
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });

    const frameGeom = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 1.1, SHAFT_DEPTH);
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.y = (FLOOR_HEIGHT * 1.1) / 2;
    elevatorCar.add(frame);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 1.1, 0.1), frameMat);
    backWall.position.set(0, (FLOOR_HEIGHT * 1.1) / 2, -SHAFT_DEPTH/2);
    elevatorCar.add(backWall);

    const sideGeom = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT * 1.1, SHAFT_DEPTH);
    const lWall = new THREE.Mesh(sideGeom, frameMat);
    lWall.position.set(-SHAFT_WIDTH/2, (FLOOR_HEIGHT * 1.1) / 2, 0);
    elevatorCar.add(lWall);
    const rWall = new THREE.Mesh(sideGeom, frameMat);
    rWall.position.set(SHAFT_WIDTH/2, (FLOOR_HEIGHT * 1.1) / 2, 0);
    elevatorCar.add(rWall);

    const doorGeom = new THREE.BoxGeometry(SHAFT_WIDTH/2 - 0.05, FLOOR_HEIGHT * 0.8, 0.1);
    elevatorCar.leftDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH/4, (FLOOR_HEIGHT * 0.8)/2, SHAFT_DEPTH/2 + 0.05);
    elevatorCar.add(elevatorCar.leftDoor);

    elevatorCar.rightDoor = new THREE.Mesh(doorGeom, doorMat);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH/4, (FLOOR_HEIGHT * 0.8)/2, SHAFT_DEPTH/2 + 0.05);
    elevatorCar.add(elevatorCar.rightDoor);

    scene.add(elevatorCar);
}

function setupSimulation() {
    const p1 = createPerson();
    p1.position.set(0, 0, 2); 
    scene.add(p1);
    people.push(p1);

    const p2 = createPerson();
    p2.position.set(2, FLOOR_HEIGHT, 2); 
    scene.add(p2);
    people.push(p2);

    const p3 = createPerson();
    p3.position.set(-2, FLOOR_HEIGHT * 2, 2); 
    scene.add(p3);
    people.push(p3);

    elevatorCar.position.y = 0;
}

function updateSimulation(dt) {
    const delta = dt * speedMultiplier;

    if (simulationState.step === 'MOVING_TO_PICKUP') {
        const targetY = simulationState.pickupFloor * FLOOR_HEIGHT;
        if (Math.abs(elevatorCar.position.y - targetY) < 0.05) {
            elevatorCar.position.y = targetY;
            simulationState.step = 'DOORS_OPENING';
        } else {
            const dir = targetY > elevatorCar.position.y ? 1 : -1;
            elevatorCar.position.y += dir * ELEVATOR_SPEED * delta;
        }
    } else if (simulationState.step === 'MOVING_TO_DEST') {
        const targetY = simulationState.destFloor * FLOOR_HEIGHT;
        if (Math.abs(elevatorCar.position.y - targetY) < 0.05) {
            elevatorCar.position.y = targetY;
            elevatorCar.position.y = targetY;
            simulationState.step = 'DOORS_OPENING_DEST';
        } else {
            const dir = targetY > elevatorCar.position.y ? 1 : -1;
            elevatorCar.position.y += dir * ELEVATOR_SPEED * delta;
        }
    }

    if (simulationState.step === 'DOORS_OPENING' || simulationState.step === 'DOORS_OPENING_DEST' || 
        simulationState.step === 'DOORS_CLOSING' || simulationState.step === 'DOORS_CLOSING_DEST') {
        const targetOpen = simulationState.step.includes('OPENING') ? 1 : 0;
        if (simulationState.doorPhase < targetOpen) {
            simulationState.doorPhase += 0.05 * delta;
            if (simulationState.doorPhase >= targetOpen) {
                simulationState.doorPhase = targetOpen;
                if (simulationState.step === 'DOORS_OPENING') simulationState.step = 'PERSON_BOARDING';
                if (simulationState.step === 'DOORS_OPENING_DEST') simulationState.step = 'PERSON_EXITING';
            }
        } else if (simulationState.doorPhase > targetOpen) {
            simulationState.doorPhase -= 0.05 * delta;
            if (simulationState.doorPhase <= targetOpen) {
                simulationState.step = 'IDLE';
                scheduleNextCycle();
            }
            if (simulationState.step === 'DOORS_CLOSING_DEST') {
                // Handled by IDLE logic
            }
        }
        elevatorCar.leftDoor.position.x = -SHAFT_WIDTH/4 + (simulationState.doorPhase * SHAFT_WIDTH/4);
        elevatorCar.rightDoor.position.x = SHAFT_WIDTH/4 - (simulationState.doorPhase * SHAFT_WIDTH/4);
    }

    if (simulationState.step === 'PERSON_BOARDING' || simulationState.step === 'PERSON_EXITING') {
        const p = simulationState.person;
        const targetZ = (simulationState.step === 'PERSON_BOARDING') ? 0 : 2;
        const dist = Math.abs(p.position.z - targetZ);
        if (dist < 0.05) {
            p.position.z = targetZ;
            if (simulationState.step === 'PERSON_BOARDING') {
                elevatorCar.attach(p);
                simulationState.step = 'DOORS_CLOSING';
            } else {
                scene.attach(p);
                simulationState.step = 'DOORS_CLOSING_DEST';
            }
        } else {
            p.position.z += ((targetZ > p.position.z ? 1 : -1) * PERSON_MOVE_SPEED * delta);
            p.userData.isWalking = true;
        }
    }
}

function scheduleNextCycle() {
    if (simulationState.step === 'IDLE') {
        const personIndex = Math.floor(Math.random() * people.length);
        const person = people[personIndex];
        const destFloor = Math.floor(Math.random() * FLOOR_COUNT);
        
        if (destFloor === person.position.y / FLOOR_HEIGHT) {
            scheduleNextCycle();
            return;
        }

        simulationState.person = person;
        simulationState.pickupFloor = Math.floor(person.position.y / FLOOR_HEIGHT);
        simulationState.destFloor = destFloor;
        simulationState.step = 'MOVING_TO_PICKUP';
    }
}

function animate() {
    requestAnimationFrame(animate);
    updateSimulation(0.016);
    people.forEach(p => {
        if (p.userData.isWalking) {
            const time = Date.now() * 0.005 * speedMultiplier;
            p.userData.leftLeg.rotation.x = Math.sin(time) * 0.5;
            p.userData.rightLeg.rotation.x = Math.sin(time + Math.PI) * 0.5;
        } else {
            p.userData.leftLeg.rotation.x = 0;
            p.userData.rightLeg.rotation.x = 0;
        }
    });
    controls.update();
    renderer.render(scene, camera);
}

function startSimulation() {
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.set(25, 25, 25);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    createBuilding();
    createElevatorCar();
    setupSimulation();
    scheduleNextCycle();
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
