const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let clock;

let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];
let floorStates = [];
let emptyFloorIndex = 0;
let animationSpeed = 1;
let doorOpen = false;
let doorState = 0;
let targetFloor = 0;
let personWalking = null;

function createBuilding() {
    const buildingGroup = new THREE.Group();

    const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, SHAFT_DEPTH);
    const wallMaterialColor = 0x9999ff;

    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        opacity: 0.3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: wallMaterialColor,
        opacity: 0.2,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;

        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, floorY, 0);
        floor.receiveShadow = true;
        buildingGroup.add(floor);
    }

    const groundFloor = new THREE.Mesh(floorGeometry, floorMaterial);
    groundFloor.rotation.x = -Math.PI / 2;
    groundFloor.position.set(0, 0, 0);
    groundFloor.receiveShadow = true;
    buildingGroup.add(groundFloor);

    const roofY = (FLOOR_COUNT - 1) * FLOOR_HEIGHT;
    const roof = new THREE.Mesh(floorGeometry, floorMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, roofY + 0.1, 0);
    roof.scale.y = 0.1;
    buildingGroup.add(roof);

    const wallHeight = FLOOR_COUNT * FLOOR_HEIGHT;

    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, wallHeight),
        wallMaterial
    );
    backWall.position.set(0, wallHeight / 2, BUILDING_DEPTH / 2);
    backWall.receiveShadow = true;
    buildingGroup.add(backWall);

    const frontWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, wallHeight),
        wallMaterial
    );
    frontWall.position.set(0, wallHeight / 2, -BUILDING_DEPTH / 2);
    frontWall.receiveShadow = true;
    buildingGroup.add(frontWall);

    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(wallHeight, wallHeight),
        wallMaterial
    );
    leftWall.position.set(-BUILDING_WIDTH / 2, wallHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    buildingGroup.add(leftWall);

    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(wallHeight, wallHeight),
        wallMaterial
    );
    rightWall.position.set(BUILDING_WIDTH / 2, wallHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    buildingGroup.add(rightWall);

    scene.add(buildingGroup);
    return buildingGroup;
}

function createElevatorCar() {
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccc00,
        opacity: 0.7,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const carWidth = 4;
    const carDepth = 3;
    const carHeight = 4;
    const doorWidth = 2;
    const doorHeight = 3.5;

    const carGroup = new THREE.Group();

    const frameGeometry = new THREE.BoxGeometry(carWidth, carHeight, carDepth);
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(0, carHeight / 2, 0);
    carGroup.add(frame);

    const backWallGeo = new THREE.PlaneGeometry(carWidth, carHeight);
    const backWall = new THREE.Mesh(backWallGeo, frameMaterial);
    backWall.position.set(0, carHeight / 2, -carDepth / 2 + 0.1);
    carGroup.add(backWall);

    const leftDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial);
    leftDoor.position.set(-doorWidth / 4, carHeight / 2, carDepth / 4);
    leftDoor.rotation.y = Math.PI / 2;
    leftDoor.userData = { openDist: 0 };
    carGroup.add(leftDoor);
    carGroup.leftDoor = leftDoor;

    const rightDoor = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial);
    rightDoor.position.set(doorWidth / 4, carHeight / 2, carDepth / 4);
    rightDoor.rotation.y = -Math.PI / 2;
    rightDoor.userData = { openDist: 0 };
    carGroup.add(rightDoor);
    carGroup.rightDoor = rightDoor;

    elevatorCar = carGroup;
    return carGroup;
}

function createPerson() {
    const group = new THREE.Group();

    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    const legWidth = 0.5;
    const legDepth = 0.5;
    const legHeight = 2.5;

    const leftLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    const rightLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);

    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(rightLegGeometry, legMaterial);

    leftLeg.position.set(-0.3, -legHeight / 2, 0);
    rightLeg.position.set(0.3, -legHeight / 2, 0);

    group.add(leftLeg);
    group.add(rightLeg);

    const torsoWidth = 1.5;
    const torsoDepth = 1.0;
    const torsoHeight = 2.0;
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });

    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, -legHeight + torsoHeight / 2, 0);
    group.add(torso);

    const headGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, -legHeight + torsoHeight + 0.5, 0);
    group.add(head);

    const armLength = 1.5;
    const armWidth = 0.3;
    const armDepth = 0.3;
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });

    const armGeometry = new THREE.BoxGeometry(armWidth, armLength, armDepth);

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.7, -legHeight + torsoHeight / 2 - armLength / 2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.7, -legHeight + torsoHeight / 2 - armLength / 2, 0);
    group.add(rightArm);

    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}

function getFloorIndex(positionY) {
    let floorIdx = Math.round(positionY / FLOOR_HEIGHT);
    if (floorIdx < 0) floorIdx = 0;
    if (floorIdx >= FLOOR_COUNT) floorIdx = FLOOR_COUNT - 1;
    return floorIdx;
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    createBuilding();

    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    clock = new THREE.Clock();

    // Initialize floor states: one empty, rest occupied
    floorStates = [];
    let emptyIdx = Math.floor(Math.random() * FLOOR_COUNT);
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyIdx) floorStates[i] = 'empty';
        else floorStates[i] = 'occupied';
    }
    emptyFloorIndex = emptyIdx;

    // Create people - one per occupied floor
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;
        const person = createPerson();
        const floorY = i * FLOOR_HEIGHT;
        person.position.set(0, floorY + 1, 5);
        person.rotation.y = Math.PI;
        scene.add(person);
        people.push(person);
    }

    function animate() {
        requestAnimationFrame(animate);

        for (const person of people) {
            if (person.userData && person.userData.isWalking) {
                person.userData.leftLeg.rotation.x =
                    Math.sin(clock.getElapsedTime()) * 0.5;
                person.userData.rightLeg.rotation.x =
                    Math.sin(clock.getElapsedTime() + Math.PI) * 0.5;
            } else {
                person.userData.leftLeg.rotation.x = 0;
                person.userData.rightLeg.rotation.x = 0;
            }
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Speed UI
    const speedContainer = document.createElement('div');
    speedContainer.style.position = 'absolute';
    speedContainer.style.top = '20px';
    speedContainer.style.left = '20px';
    speedContainer.style.background = 'rgba(0,0,0,0.5)';
    speedContainer.style.padding = '10px';
    speedContainer.style.zIndex = 10;

    const speedLabel = document.createElement('span');
    speedLabel.textContent = 'Speed: 1x';
    speedContainer.appendChild(speedLabel);

    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '1';
    speedSlider.max = '20';
    speedSlider.value = '1';
    speedSlider.style.width = '100px';
    speedContainer.appendChild(speedSlider);

    document.body.appendChild(speedContainer);

    speedSlider.addEventListener('input', (e) => {
        const speed = parseInt(e.target.value);
        animationSpeed = speed;
        speedLabel.textContent = 'Speed: ' + speed + 'x';
    });

    const doorWidth = 2;

    function openDoors() {
        if (doorOpen) return;
        doorOpen = true;
        doorState = 1;

        return new Promise((resolve) => {
            const openStep = () => {
                if (doorState === 2) {
                    resolve();
                    return;
                }
                const speedFactor = 0.1 * animationSpeed;
                const maxOpen = 2;

                if (doorState === 1) {
                    if (Math.abs(elevatorCar.leftDoor.userData.openDist) < maxOpen) {
                        elevatorCar.leftDoor.userData.openDist += speedFactor;
                        elevatorCar.leftDoor.position.x =
                            -doorWidth / 4 + elevatorCar.leftDoor.userData.openDist;
                    } else {
                        doorState = 2;
                    }
                    if (Math.abs(elevatorCar.rightDoor.userData.openDist) < maxOpen) {
                        elevatorCar.rightDoor.userData.openDist += speedFactor;
                        elevatorCar.rightDoor.position.x =
                            doorWidth / 4 - elevatorCar.rightDoor.userData.openDist;
                    } else {
                        doorState = 2;
                    }
                    requestAnimationFrame(openStep);
                } else if (doorState === 2) {
                    resolve();
                }
            };
            openStep();
        });
    }

    function closeDoors() {
        if (!doorOpen) return;
        doorOpen = false;
        doorState = 3;

        return new Promise((resolve) => {
            const closeStep = () => {
                if (doorState === 0) {
                    resolve();
                    return;
                }
                const speedFactor = 0.1 * animationSpeed;
                const maxOpen = 2;

                if (doorState === 3) {
                    if (elevatorCar.leftDoor.userData.openDist > 0) {
                        elevatorCar.leftDoor.userData.openDist -= speedFactor;
                        elevatorCar.leftDoor.position.x =
                            -doorWidth / 4 + elevatorCar.leftDoor.userData.openDist;
                    } else {
                        elevatorCar.leftDoor.userData.openDist = 0;
                        elevatorCar.leftDoor.position.x = -doorWidth / 4;
                    }
                    if (elevatorCar.rightDoor.userData.openDist > 0) {
                        elevatorCar.rightDoor.userData.openDist -= speedFactor;
                        elevatorCar.rightDoor.position.x =
                            doorWidth / 4 - elevatorCar.rightDoor.userData.openDist;
                    } else {
                        elevatorCar.rightDoor.userData.openDist = 0;
                        elevatorCar.rightDoor.position.x = doorWidth / 4;
                    }
                    if (
                        elevatorCar.leftDoor.userData.openDist === 0 &&
                        elevatorCar.rightDoor.userData.openDist === 0
                    ) {
                        doorState = 0;
                        resolve();
                    }
                    requestAnimationFrame(closeStep);
                }
            };
            closeStep();
        });
    }

    function boardPerson(person) {
        updatePersonLegs(person, true);
        personWalking = person;

        return new Promise((resolve) => {
            const walkInterval = setInterval(() => {
                const dist = person.position.z;
                if (dist > -0.5) {
                    person.position.z -= PERSON_MOVE_SPEED / animationSpeed;
                    if (dist <= 0.5) {
                        clearInterval(walkInterval);
                        elevatorCar.attach(person);
                        person.position.set(0, 0, 0);
                        updatePersonLegs(person, false);
                        personWalking = null;
                        resolve();
                    }
                }
            }, 50);
        });
    }

    function exitPerson(person) {
        updatePersonLegs(person, true);

        return new Promise((resolve) => {
            const walkInterval = setInterval(() => {
                const dist = Math.abs(person.position.z);
                if (dist < 6) {
                    person.position.z += PERSON_MOVE_SPEED / animationSpeed;
                    if (dist >= 6) {
                        clearInterval(walkInterval);
                        scene.attach(person);
                        if (person.userData && person.userData.floorY !== undefined) {
                            person.position.set(
                                0,
                                person.userData.floorY + 1,
                                5
                            );
                        } else {
                            person.position.set(0, 1, 5);
                        }
                        person.rotation.y = Math.PI;
                        updatePersonLegs(person, false);
                        resolve();
                    }
                }
            }, 50);
        });
    }

    function updatePersonLegs(person, walking) {
        if (!person.userData) return;
        person.userData.isWalking = walking;
        if (walking) {
            person.userData.leftLeg.rotation.x =
                Math.sin(clock.getElapsedTime()) * 0.5;
            person.userData.rightLeg.rotation.x =
                Math.sin(clock.getElapsedTime() + Math.PI) * 0.5;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }

    // Animation sequence
    function runAnimationSequence() {
        const occupiedFloors = [];
        for (let i = 0; i < FLOOR_COUNT; i++) {
            if (i !== emptyFloorIndex) occupiedFloors.push(i);
        }
        if (occupiedFloors.length === 0) return;

        const personIdx = Math.floor(Math.random() * people.length);
        const person = people[personIdx];

        let startFloor = -1;
        for (let i = 0; i < FLOOR_COUNT; i++) {
            const floorY = i * FLOOR_HEIGHT;
            if (Math.abs(person.position.y - floorY) < 1) {
                startFloor = i;
                break;
            }
        }

        targetFloor = startFloor === emptyFloorIndex
            ? occupiedFloors[Math.floor(Math.random() * occupiedFloors.length)]
            : emptyFloorIndex;

        const moveToStart = () => new Promise((resolve) => {
            const check = () => {
                const y = elevatorCar.position.y;
                if (Math.abs(y - startFloor * FLOOR_HEIGHT) < 0.1) {
                    elevatorCar.position.y = startFloor * FLOOR_HEIGHT;
                    resolve();
                } else {
                    elevatorCar.position.y =
                        y + ELEVATOR_SPEED / animationSpeed *
                        (startFloor * FLOOR_HEIGHT > y ? 1 : -1);
                    requestAnimationFrame(check);
                }
            };
            requestAnimationFrame(check);
        });

        const moveToDest = () => new Promise((resolve) => {
            const check = () => {
                const y = elevatorCar.position.y;
                if (Math.abs(y - targetFloor * FLOOR_HEIGHT) < 0.1) {
                    elevatorCar.position.y = targetFloor * FLOOR_HEIGHT;
                    resolve();
                } else {
                    elevatorCar.position.y =
                        y + ELEVATOR_SPEED / animationSpeed *
                        (targetFloor * FLOOR_HEIGHT > y ? 1 : -1);
                    requestAnimationFrame(check);
                }
            };
            requestAnimationFrame(check);
        });

        moveToStart()
            .then(() => openDoors())
            .then(() => boardPerson(person))
            .then(() => closeDoors())
            .then(() => moveToDest())
            .then(() => openDoors())
            .then(() => exitPerson(person))
            .then(() => closeDoors())
            .then(() => {
                floorStates[startFloor] = 'empty';
                floorStates[targetFloor] = 'occupied';
                emptyFloorIndex = targetFloor;
                setTimeout(runAnimationSequence, 1000);
            })
            .catch((e) => {
                console.error('Animation error:', e);
                setTimeout(runAnimationSequence, 1000);
            });
    }

    runAnimationSequence();
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}