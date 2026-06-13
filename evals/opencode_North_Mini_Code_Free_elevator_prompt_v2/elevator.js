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
let currentFloor = 1;
let emptyFloor = 0;
let animationSpeed = 1;
let isAnimating = false;
let animationTime = 0;
let doorOpen = false;
let doorAnimationTime = 0;
let walkingAnimationTime = 0;
let personState = 'waiting';
let personTargetPosition = new THREE.Vector3();
let personCurrentPosition = new THREE.Vector3();
let personTargetFloor = 0;
let elevatorTargetFloor = 0;
let elevatorCurrentTarget = currentFloor;
let animationPhase = 0;
let lastFrameTime = 0;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 0, 100);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(25, 25, 25);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.minDistance = 10;
    controls.maxDistance = 50;

    createBuilding();
    createElevator();
    createPeople();

    window.addEventListener('resize', onWindowResize);
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        animationSpeed = parseInt(e.target.value);
        document.querySelector('label[for="speed-slider"]').textContent =
            `Animation Speed: ${animationSpeed}x`;
    });

    animate();
}

function createBuilding() {
    const floorGeometry = new THREE.BoxGeometry(
        BUILDING_WIDTH,
        0.2,
        BUILDING_DEPTH
    );
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        opacity: 0.3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x9999ff,
        opacity: 0.2,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(0, floorY, 0);
        floor.receiveShadow = true;
        scene.add(floor);

        if (i < FLOOR_COUNT - 1) {
            const floorTop = floorGeometry.clone();
            const floorTopMesh = new THREE.Mesh(floorTop, floorMaterial);
            floorTopMesh.position.set(0, floorY + 0.1, 0);
            scene.add(floorTopMesh);
        }

        const wallFront = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.2),
            wallMaterial
        );
        wallFront.position.set(0, floorY + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + 0.1);
        scene.add(wallFront);

        const wallBack = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.2),
            wallMaterial
        );
        wallBack.position.set(0, floorY + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 - 0.1);
        scene.add(wallBack);

        const wallLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        wallLeft.position.set(-BUILDING_WIDTH / 2 + 0.1, floorY + FLOOR_HEIGHT / 2, 0);
        scene.add(wallLeft);

        const wallRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        wallRight.position.set(BUILDING_WIDTH / 2 - 0.1, floorY + FLOOR_HEIGHT / 2, 0);
        scene.add(wallRight);
    }

    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT, 0);
    scene.add(roof);

    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(0, 0, 0);
    scene.add(ground);
}

function createElevator() {
    const elevatorGroup = new THREE.Group();
    elevatorGroup.position.set(0, FLOOR_HEIGHT, 0);
    scene.add(elevatorGroup);

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const shaftWidth = SHAFT_WIDTH;
    const shaftDepth = SHAFT_DEPTH;
    const wallThickness = 0.2;

    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, FLOOR_HEIGHT, shaftDepth),
        frameMaterial
    );
    leftWall.position.set(-shaftWidth / 2, 0, 0);
    elevatorGroup.add(leftWall);

    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, FLOOR_HEIGHT, shaftDepth),
        frameMaterial
    );
    rightWall.position.set(shaftWidth / 2, 0, 0);
    elevatorGroup.add(rightWall);

    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(shaftWidth, FLOOR_HEIGHT, wallThickness),
        frameMaterial
    );
    backWall.position.set(0, 0, -shaftDepth / 2);
    elevatorGroup.add(backWall);

    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        opacity: 0.7,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const doorWidth = shaftWidth / 2 - 0.1;
    const doorHeight = FLOOR_HEIGHT - 0.2;

    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, 0.1),
        doorMaterial
    );
    leftDoor.position.set(-shaftWidth / 4, 0, -shaftDepth / 2 + 0.05);
    elevatorGroup.add(leftDoor);

    const rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, 0.1),
        doorMaterial
    );
    rightDoor.position.set(shaftWidth / 4, 0, -shaftDepth / 2 + 0.05);
    elevatorGroup.add(rightDoor);

    const car = new THREE.Group();
    car.position.set(0, 0, 0);
    elevatorGroup.add(car);

    const carMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        renderOrder: 1
    });

    const carFront = new THREE.Mesh(
        new THREE.BoxGeometry(shaftWidth, 0.5, 0.2),
        carMaterial
    );
    carFront.position.set(0, -1.25, -shaftDepth / 2 + 0.1);
    car.add(carFront);

    const carBack = new THREE.Mesh(
        new THREE.BoxGeometry(shaftWidth, 0.5, 0.2),
        carMaterial
    );
    carBack.position.set(0, 1.25, -shaftDepth / 2 + 0.1);
    car.add(carBack);

    const carLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, FLOOR_HEIGHT - 1, shaftDepth - 0.2),
        carMaterial
    );
    carLeft.position.set(-shaftWidth / 2 + 0.1, 0, 0);
    car.add(carLeft);

    const carRight = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, FLOOR_HEIGHT - 1, shaftDepth - 0.2),
        carMaterial
    );
    carRight.position.set(shaftWidth / 2 - 0.1, 0, 0);
    car.add(carRight);

    elevatorCar = elevatorGroup;
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;
}

function createPeople() {
    for (let i = 1; i <= FLOOR_COUNT; i++) {
        if (i !== 1 && i !== emptyFloor) {
            const person = createPerson();
            person.position.set(0, i * FLOOR_HEIGHT, 5);
            person.rotation.y = Math.PI;
            scene.add(person);
            people.push({
                obj: person,
                floor: i,
                targetFloor: 0,
                isWalking: false,
                walkingTime: 0,
                state: 'waiting'
            });
        }
    }
}

function updatePeople() {
    let waitingPeople = people.filter(p => p.state === 'waiting');
    let boardingPeople = people.filter(p => p.state === 'boarding');
    let exitingPeople = people.filter(p => p.state === 'exiting');

    if (waitingPeople.length > 0 && !isAnimating && currentFloor !== emptyFloor) {
        const personToMove = waitingPeople[0];
        personToMove.targetFloor = emptyFloor;
        personToMove.state = 'boarding';
        personToMove.isWalking = true;
        personToMove.walkingTime = 0;
        updateEmptyFloor();
    }

    people.forEach(person => {
        if (person.state === 'waiting') {
            person.obj.position.z = 5;
            person.obj.rotation.y = Math.PI;
        }

        if (person.state === 'boarding') {
            person.walkingTime += animationSpeed * 0.016;
            const walkDistance = PERSON_MOVE_SPEED * person.walkingTime;

            const targetZ = 0;
            const currentZ = person.obj.position.z;

            if (walkDistance >= Math.abs(targetZ - currentZ)) {
                person.obj.position.z = targetZ;
                person.obj.rotation.y = 0;
                person.obj.getWorldPosition(personCurrentPosition);
                elevatorCar.attach(person.obj);
                person.obj.position.set(0, 0, 0);
                person.state = 'inside';
                person.isWalking = false;
                startDoorAnimation();
            } else {
                const direction = Math.sign(targetZ - currentZ);
                person.obj.position.z += direction * PERSON_MOVE_SPEED * animationSpeed * 0.016;
                person.obj.rotation.y = 0;
            }
        }

        if (person.state === 'exiting') {
            person.walkingTime += animationSpeed * 0.016;
            const walkDistance = PERSON_MOVE_SPEED * person.walkingTime;

            const targetZ = 5;
            const currentZ = person.obj.position.z;

            if (walkDistance >= Math.abs(targetZ - currentZ)) {
                person.obj.position.z = targetZ;
                person.obj.rotation.y = Math.PI;
                scene.attach(person.obj);
                person.obj.position.set(0, person.targetFloor * FLOOR_HEIGHT, 5);
                person.obj.rotation.y = Math.PI;
                person.state = 'waiting';
                person.isWalking = false;
                startDoorAnimation();
            } else {
                const direction = Math.sign(targetZ - currentZ);
                person.obj.position.z += direction * PERSON_MOVE_SPEED * animationSpeed * 0.016;
                person.obj.rotation.y = Math.PI;
            }
        }
    });
}

function startDoorAnimation() {
    if (doorOpen) return;

    doorOpen = true;
    doorAnimationTime = 0;

    setTimeout(() => {
        animateDoors();
    }, 300);
}

function animateDoors() {
    const doorSpeed = 2;
    const doorTravelDistance = SHAFT_WIDTH / 4;

    const animateDoor = (door, isLeft) => {
        const targetX = isLeft ? -doorTravelDistance : doorTravelDistance;
        const startX = door.position.x;
        const duration = doorTravelDistance / doorSpeed;

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed * doorSpeed, 1);

            door.position.x = startX + (isLeft ? -targetX * progress : targetX * progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                doorOpen = false;
                updateAnimationPhase();
            }
        };
        animate();
    };

    animateDoor(elevatorCar.leftDoor, true);
    animateDoor(elevatorCar.rightDoor, false);
}

function updateAnimationPhase() {
    if (animationPhase === 0) {
        animationPhase = 1;
        elevatorTargetFloor = emptyFloor;
        setTimeout(() => {
            animationPhase = 2;
        }, 500);
    } else if (animationPhase === 2) {
        animationPhase = 3;
        const exitingPerson = people.find(p => p.state === 'inside');
        if (exitingPerson) {
            exitingPerson.state = 'exiting';
            exitingPerson.targetFloor = currentFloor;
            exitingPerson.isWalking = true;
            exitingPerson.walkingTime = 0;
            startDoorAnimation();
        } else {
            animationPhase = 4;
            setTimeout(() => {
                resetAnimation();
            }, 500);
        }
    } else if (animationPhase === 4) {
        resetAnimation();
    }
}

function resetAnimation() {
    currentFloor = elevatorTargetFloor;
    isAnimating = false;
    animationPhase = 0;
    updatePeople();
}

function updateEmptyFloor() {
    const floors = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);
    const occupiedFloors = people.map(p => p.floor).filter(f => f > 0);
    emptyFloor = floors.find(f => !occupiedFloors.includes(f)) || 0;
}

function animateDoorsManual() {
    if (!doorOpen) return;

    doorAnimationTime += animationSpeed * 0.016;
    const doorProgress = Math.sin(doorAnimationTime * Math.PI);

    elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 * doorProgress;
    elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 * doorProgress;
}

function animateLegs() {
    people.forEach(person => {
        if (person.isWalking) {
            person.walkingTime += animationSpeed * 0.016;
            const legAngle = Math.sin(person.walkingTime * Math.PI) * 0.5;

            if (person.obj.userData.leftLeg) {
                person.obj.userData.leftLeg.rotation.x = legAngle;
            }
            if (person.obj.userData.rightLeg) {
                person.obj.userData.rightLeg.rotation.x = -legAngle;
            }
        } else {
            if (person.obj.userData.leftLeg) {
                person.obj.userData.leftLeg.rotation.x = 0;
            }
            if (person.obj.userData.rightLeg) {
                person.obj.userData.rightLeg.rotation.x = 0;
            }
        }
    });
}

function animateElevator() {
    if (animationPhase === 1 && !isAnimating) {
        isAnimating = true;
        const targetY = elevatorTargetFloor * FLOOR_HEIGHT;
        const startY = elevatorCar.position.y;
        const duration = Math.abs(targetY - startY) / (ELEVATOR_SPEED * animationSpeed);

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);

            const currentY = startY + (targetY - startY) * progress;
            elevatorCar.position.y = currentY;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                currentFloor = elevatorTargetFloor;
                isAnimating = false;
                updateAnimationPhase();
            }
        };
        animate();
    }
}

function animate(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const deltaTime = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    controls.update();

    if (animationPhase === 0) {
        animateDoorsManual();
    }

    animateLegs();
    animateElevator();
    updatePeople();

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('DOMContentLoaded', init);