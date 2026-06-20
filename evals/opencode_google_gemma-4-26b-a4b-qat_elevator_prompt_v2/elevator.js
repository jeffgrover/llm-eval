
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

let simulationSpeed = 1;
let currentTargetFloor = 0;
let targetPerson = null;
let elevatorY = 0;
let doorOpenFactor = 0; 
let doorTargetFactor = 0;
let elevatorState = 'IDLE'; 

// States: IDLE, MOVING_TO_PICKUP, DOOR_OPEN_PICKUP, PERSON_BOARDING, DOOR_CLOSING_PICKUP, MOVING_TO_DEST, DOOR_OPEN_DEST, PERSON_EXITING, DOOR_CLOSING_DEST

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    renderer.shadowMap.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    createBuilding();
    createElevator();
    createPeople();

    const slider = document.getElementById('speedSlider');
    const valueDisplay = document.getElementById('speedValue');
    slider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value);
        valueDisplay.innerText = simulationSpeed + 'x';
    });

    window.addEventListener('resize', onWindowResize, false);

    startSimulation();
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createBuilding() {
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

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        const floor = new THREE.Mesh(floorGeo, floorMaterial);
        floor.position.set(0, y, 0);
        floor.renderOrder = 0;
        scene.add(floor);

        const createWall = (w, h, d, x, z, ry) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            const wall = new THREE.Mesh(geo, wallMaterial);
            wall.position.set(x, y + h/2, z);
            wall.rotation.y = ry;
            wall.renderOrder = 0;
            scene.add(wall);
        };

        createWall(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1, 0, -BUILDING_DEPTH/2, 0);
        createWall(0.1, FLOOR_HEIGHT, BUILDING_DEPTH, -BUILDING_WIDTH/2, 0, 0);
        createWall(0.1, FLOOR_HEIGHT, BUILDING_DEPTH, BUILDING_WIDTH/2, 0, 0);
        createWall(0.1, FLOOR_HEIGHT, SHAFT_WIDTH, -SHAFT_WIDTH/2, SHAFT_DEPTH/2, 0);
        createWall(0.1, FLOOR_HEIGHT, SHAFT_WIDTH, SHAFT_WIDTH/2, SHAFT_DEPTH/2, 0);
    }

    const groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
    ground.position.set(0, -0.05, 0);
    scene.add(ground);

    const roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
    scene.add(roof);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    
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

    const floorGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, SHAFT_DEPTH);
    const floorMesh = new THREE.Mesh(floorGeo, frameMaterial);
    floorMesh.position.y = -0.05;
    elevatorCar.add(floorMesh);

    const sideWallGeo = new THREE.BoxGeometry(0.1, 2.5, SHAFT_DEPTH);
    const leftSide = new THREE.Mesh(sideWallGeo, frameMaterial);
    leftSide.position.set(-SHAFT_WIDTH/2, 1.25, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(sideWallGeo, frameMaterial);
    rightSide.position.set(SHAFT_WIDTH/2, 1.25, 0);
    elevatorCar.add(rightSide);

    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 2.5, 0.1);
    const backWall = new THREE.Mesh(backWallGeo, frameMaterial);
    backWall.position.set(0, 1.25, -SHAFT_DEPTH/2);
    elevatorCar.add(backWall);

    const ceilingGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, SHAFT_DEPTH);
    const ceiling = new THREE.Mesh(ceilingGeo, frameMaterial);
    ceiling.position.set(0, 2.5, 0);
    elevatorCar.add(ceiling);

    const doorGeo = new THREE.BoxGeometry(SHAFT_WIDTH/2, 2.2, 0.1);
    elevatorCar.leftDoor = new THREE.Mesh(doorGeo, doorMaterial);
    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH/4, 1.1, -SHAFT_DEPTH/2);
    elevatorCar.add(elevatorCar.leftDoor);

    elevatorCar.rightDoor = new THREE.Mesh(doorGeo, doorMaterial);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH/4, 1.1, -SHAFT_DEPTH/2);
    elevatorCar.add(elevatorCar.rightDoor);

    elevatorCar.renderOrder = 1;
    scene.add(elevatorCar);
    elevatorCar.position.y = 0;
}

function createPeople() {
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const person = createPerson();
        const floorY = i * FLOOR_HEIGHT;
        person.position.set(0, floorY, SHAFT_DEPTH/2 + 1);
        person.rotation.y = Math.PI;
        scene.add(person);
        people.push(person);
        person.userData.currentFloor = i;
    }
}

function startSimulation() {
    elevatorState = 'MOVING_TO_PICKUP';
    currentTargetFloor = 1;
}

function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016 * simulationSpeed;

    updateSimulation(delta);
    animateLegs(delta);
    
    controls.update();
    renderer.render(scene, camera);
}

function animateLegs(delta) {
    const time = Date.now() * 0.005 * simulationSpeed;
    people.forEach(person => {
        if (person.userData.isWalking) {
            const swing = Math.sin(time) * 0.5;
            person.userData.leftLeg.rotation.x = swing;
            person.userData.rightLeg.rotation.x = -swing;
        } else {
            person.userData.leftLeg.rotation.x = THREE.MathUtils.lerp(person.userData.leftLeg.rotation.x, 0, 0.1);
            person.userData.rightLeg.rotation.x = THREE.MathUtils.lerp(person.userData.rightLeg.rotation.x, 0, 0.1);
        }
    });
}

function updateSimulation(delta) {
    switch (elevatorState) {
        case 'MOVING_TO_PICKUP':
            const pickY = currentTargetFloor * FLOOR_HEIGHT;
            if (Math.abs(elevatorY - pickY) < 0.05) {
                elevatorY = pickY;
                elevatorCar.position.y = elevatorY;
                elevatorState = 'DOOR_OPEN_PICKUP';
                doorTargetFactor = 1;
            } else {
                elevatorY += (pickY - elevatorY) * 0.05 * delta * ELEVATOR_SPEED;
                elevatorCar.position.y = elevatorY;
            }
            break;
        case 'DOOR_OPEN_PICKUP':
            doorOpenFactor = THREE.MathUtils.lerp(doorOpenFactor, 1, 0.1 * delta);
            if (doorOpenFactor >= 0.99) {
                elevatorState = 'PERSON_BOARDING';
                targetPerson = people.find(p => p.userData.currentFloor === currentTargetFloor && p.parent === scene);
            }
            break;
        case 'PERSON_BOARDING':
            if (targetPerson) {
                const targetZ = -SHAFT_DEPTH/2 + 0.5;
                if (Math.abs(targetPerson.position.z - targetZ) > 0.05) {
                    targetPerson.userData.isWalking = true;
                    targetPerson.position.z -= 0.1 * delta * PERSON_MOVE_SPEED;
                } else {
                    targetPerson.userData.isWalking = false;
                    targetPerson.position.z = targetZ;
                    elevatorCar.attach(targetPerson);
                    targetPerson.rotation.y = 0;
                    elevatorState = 'DOOR_CLOSING_PICKUP';
                    doorTargetFactor = 0;
                }
            }
            break;
        case 'DOOR_CLOSING_PICKUP':
            doorOpenFactor = THREE.MathUtils.lerp(doorOpenFactor, 0, 0.1 * delta);
            if (doorOpenFactor <= 0.01) {
                elevatorState = 'MOVING_TO_DEST';
                const otherFloors = [0,1,2,3,4,5].filter(f => f !== currentTargetFloor);
                currentTargetFloor = otherFloors[Math.floor(Math.random() * otherFloors.length)];
            }
            break;
        case 'DOOR_OPEN_DEST':
            doorOpenFactor = THREE.MathUtils.lerp(doorOpenFactor, 1, 0.1 * delta);
            if (doorOpenFactor >= 0.99) {
                elevatorState = 'PERSON_EXITING';
                targetPerson = people.find(p => p.parent === elevatorCar);
            }
            break;
        case 'PERSON_EXITING':
            if (targetPerson) {
                const exitZ = SHAFT_DEPTH/2 + 1;
                if (Math.abs(targetPerson.position.z - exitZ) > 0.05) {
                    targetPerson.userData.isWalking = true;
                    targetPerson.position.z += 0.1 * delta * PERSON_MOVE_SPEED;
                } else {
                    targetPerson.userData.isWalking = false;
                    targetPerson.position.z = exitZ;
                    scene.attach(targetPerson);
                    targetPerson.rotation.y = Math.PI;
                    targetPerson.userData.currentFloor = currentTargetFloor;
                    elevatorState = 'DOOR_CLOSING_DEST';
                    doorTargetFactor = 0;
                }
            }
            break;
        case 'DOOR_CLOSING_DEST':
            doorOpenFactor = THREE.MathUtils.lerp(doorOpenFactor, 0, 0.1 * delta);
            if (doorOpenFactor <= 0.01) {
                elevatorState = 'IDLE';
                const personInElevator = people.find(p => p.parent === elevatorCar);
                if (!personInElevator) {
                    const peopleOnFloors = people.filter(p => p.parent === scene);
                    if (peopleOnFloors.length > 0) {
                        targetPerson = peopleOnFloors[Math.floor(Math.random() * peopleOnFloors.length)];
                        currentTargetFloor = targetPerson.userData.currentFloor;
                        elevatorState = 'MOVING_TO_PICKUP';
                    } else {
                        elevatorState = 'MOVING_TO_PICKUP';
                        currentTargetFloor = 1;
                    }
                } else {
                    elevatorState = 'MOVING_TO_DEST';
                    const otherFloors = [0,1,2,3,4,5].filter(f => f !== currentTargetFloor);
                    currentTargetFloor = otherFloors[Math.floor(Math.random() * otherFloors.length)];
                    doorTargetFactor = 1; // Start opening for new dest? No, they're already in.
                    // Wait, if someone is in elevator, we just need to move to a new floor.
                    // Let's simplify: if someone is in elevator, we just pick a new destination.
                    // But they are already in elevator, so we need to go to the new dest.
                    // I'll let the loop handle it by checking if someone is in elevator.
                }
            }
            break;
    }

    // Update door positions
    if (elevatorCar.leftDoor && elevatorCar.rightDoor) {
        elevatorCar.leftDoor.position.x = -SHAFT_WIDTH/4 - (doorOpenFactor * SHAFT_WIDTH/4);
        elevatorCar.rightDoor.position.x = SHAFT_WIDTH/4 + (doorOpenFactor * SHAFT_WIDTH/4);
    }
    
    elevatorCar.position.y = elevatorY;
}

init();
