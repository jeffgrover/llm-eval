// 3D Elevator Simulation
// Coordinate system: Y = vertical, Z = front/back (positive Z = in front of elevator doors)

// ---------------- Constants ----------------
const FLOOR_HEIGHT = 3.5;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 14;
const BUILDING_DEPTH = 10;
const SHAFT_WIDTH = 4;
const SHAFT_DEPTH = 4;
const ELEVATOR_SPEED = 4.0;      // units per second (base)
const PERSON_MOVE_SPEED = 2.0;   // units per second (base)
const DOOR_ANIM_SPEED = 2.0;     // units per second (base)
const STEP_DELAY_MS = 300;

const COLORS = {
    elevatorFrame: 0xffff00,
    elevatorDoor: 0xcccc00,
    floor: 0xcccccc,
    wall: 0x9999ff,
    ground: 0x888888,
    roof: 0x666666
};

// ---------------- Scene setup ----------------
let scene, camera, renderer, controls;
let elevatorCar;
let building;
let people = [];            // index = floor number (0..FLOOR_COUNT-1), value = person or null
let emptyFloor = 0;
let speedMultiplier = 1;
let clock;

// Animation state
let animating = false;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8ecf4);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    controls.update();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(20, 30, 15);
    scene.add(dirLight);

    buildBuilding();
    buildElevator();
    populateFloors();

    clock = new THREE.Clock();

    // Speed slider
    const slider = document.getElementById('speedSlider');
    const valueLabel = document.getElementById('speedValue');
    slider.addEventListener('input', () => {
        speedMultiplier = parseInt(slider.value, 10);
        valueLabel.textContent = speedMultiplier;
    });

    window.addEventListener('resize', onWindowResize);

    animate();
    // Kick off first move after a short delay
    setTimeout(runNextCycle, 500);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------- Building construction ----------------
function buildBuilding() {
    building = new THREE.Group();
    building.renderOrder = 0;

    const halfW = BUILDING_WIDTH / 2;
    const halfD = BUILDING_DEPTH / 2;

    // Floor material (transparent)
    const floorMat = new THREE.MeshStandardMaterial({
        color: COLORS.floor,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Solid ground (floor 0 base) and solid roof
    const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground });
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH + 2, 0.2, BUILDING_DEPTH + 2),
        groundMat
    );
    ground.position.y = -0.1;
    building.add(ground);

    const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof });
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
        roofMat
    );
    roof.position.y = FLOOR_HEIGHT * FLOOR_COUNT + 0.1;
    building.add(roof);

    // Build each floor surface with a rectangular cutout for the shaft using 4 panels.
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;
        addFloorWithShaftHole(y, floorMat);
    }

    // Walls (semi-transparent blue) — 4 walls surrounding the building
    const wallMat = new THREE.MeshStandardMaterial({
        color: COLORS.wall,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const totalHeight = FLOOR_HEIGHT * FLOOR_COUNT;
    // Back wall (negative Z)
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, totalHeight),
        wallMat
    );
    backWall.position.set(0, totalHeight / 2, -halfD);
    building.add(backWall);

    // Front wall (positive Z) - leave open so you can see in; draw it anyway
    const frontWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_WIDTH, totalHeight),
        wallMat
    );
    frontWall.position.set(0, totalHeight / 2, halfD);
    frontWall.rotation.y = Math.PI;
    building.add(frontWall);

    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_DEPTH, totalHeight),
        wallMat
    );
    leftWall.position.set(-halfW, totalHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    building.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(BUILDING_DEPTH, totalHeight),
        wallMat
    );
    rightWall.position.set(halfW, totalHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    building.add(rightWall);

    scene.add(building);
}

function addFloorWithShaftHole(y, mat) {
    // Create 4 panels around the shaft cutout (centered at origin on XZ plane).
    const halfW = BUILDING_WIDTH / 2;
    const halfD = BUILDING_DEPTH / 2;
    const shaftHalfW = SHAFT_WIDTH / 2;
    const shaftHalfD = SHAFT_DEPTH / 2;

    // Front panel (shaft-facing front, positive Z)
    const frontD = halfD - shaftHalfD;
    if (frontD > 0) {
        const front = new THREE.Mesh(
            new THREE.PlaneGeometry(BUILDING_WIDTH, frontD),
            mat
        );
        front.rotation.x = -Math.PI / 2;
        front.position.set(0, y, shaftHalfD + frontD / 2);
        building.add(front);
    }

    // Back panel (negative Z)
    const backD = halfD - shaftHalfD;
    if (backD > 0) {
        const back = new THREE.Mesh(
            new THREE.PlaneGeometry(BUILDING_WIDTH, backD),
            mat
        );
        back.rotation.x = -Math.PI / 2;
        back.position.set(0, y, -(shaftHalfD + backD / 2));
        building.add(back);
    }

    // Left panel (negative X), spans shaft depth
    const leftW = halfW - shaftHalfW;
    if (leftW > 0) {
        const left = new THREE.Mesh(
            new THREE.PlaneGeometry(leftW, SHAFT_DEPTH),
            mat
        );
        left.rotation.x = -Math.PI / 2;
        left.position.set(-(shaftHalfW + leftW / 2), y, 0);
        building.add(left);
    }

    // Right panel (positive X)
    const rightW = halfW - shaftHalfW;
    if (rightW > 0) {
        const right = new THREE.Mesh(
            new THREE.PlaneGeometry(rightW, SHAFT_DEPTH),
            mat
        );
        right.rotation.x = -Math.PI / 2;
        right.position.set(shaftHalfW + rightW / 2, y, 0);
        building.add(right);
    }
}

// ---------------- Elevator construction ----------------
function buildElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    const carW = SHAFT_WIDTH - 0.4;
    const carD = SHAFT_DEPTH - 0.4;
    const carH = FLOOR_HEIGHT - 0.4;

    const frameMat = new THREE.MeshStandardMaterial({
        color: COLORS.elevatorFrame,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Floor of elevator (solid-ish but transparent for visibility)
    const carFloor = new THREE.Mesh(
        new THREE.BoxGeometry(carW, 0.1, carD),
        new THREE.MeshStandardMaterial({ color: COLORS.elevatorFrame, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
    );
    carFloor.position.y = 0.05;
    elevatorCar.add(carFloor);

    // Ceiling
    const carCeiling = new THREE.Mesh(
        new THREE.BoxGeometry(carW, 0.1, carD),
        frameMat
    );
    carCeiling.position.y = carH - 0.05;
    elevatorCar.add(carCeiling);

    // Solid back wall (negative Z, since front/doors at +Z)
    const backWallMat = new THREE.MeshStandardMaterial({ color: COLORS.elevatorFrame });
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carW, carH),
        backWallMat
    );
    backWall.position.set(0, carH / 2, -carD / 2);
    elevatorCar.add(backWall);

    // Transparent side walls
    const leftSide = new THREE.Mesh(
        new THREE.PlaneGeometry(carD, carH),
        frameMat
    );
    leftSide.rotation.y = Math.PI / 2;
    leftSide.position.set(-carW / 2, carH / 2, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(
        new THREE.PlaneGeometry(carD, carH),
        frameMat
    );
    rightSide.rotation.y = -Math.PI / 2;
    rightSide.position.set(carW / 2, carH / 2, 0);
    elevatorCar.add(rightSide);

    // --- Sliding doors (on +Z face) ---
    const doorMat = new THREE.MeshStandardMaterial({
        color: COLORS.elevatorDoor,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const doorW = carW / 2;
    const doorH = carH - 0.2;

    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, 0.08),
        doorMat
    );
    leftDoor.position.set(-doorW / 2, doorH / 2 + 0.1, carD / 2);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, 0.08),
        doorMat
    );
    rightDoor.position.set(doorW / 2, doorH / 2 + 0.1, carD / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.userData.leftDoor = leftDoor;
    elevatorCar.userData.rightDoor = rightDoor;
    elevatorCar.userData.doorClosedXLeft = -doorW / 2;
    elevatorCar.userData.doorClosedXRight = doorW / 2;
    elevatorCar.userData.doorOpenXLeft = -doorW - 0.05;   // slid outward
    elevatorCar.userData.doorOpenXRight = doorW + 0.05;
    elevatorCar.userData.doorOpen = false;
    elevatorCar.userData.carW = carW;
    elevatorCar.userData.carD = carD;
    elevatorCar.userData.carH = carH;

    elevatorCar.position.set(0, 0, 0);
    scene.add(elevatorCar);
}

// ---------------- People ----------------
function waitingSpotForFloor(floor) {
    // Waiting spot is in front of elevator on +Z side, on the floor surface.
    const y = floor * FLOOR_HEIGHT;
    const z = SHAFT_DEPTH / 2 + 1.5;
    return new THREE.Vector3(0, y, z);
}

function insideElevatorLocalPos() {
    // Local (relative to elevatorCar) position for a person inside the elevator.
    return new THREE.Vector3(0, 0, -elevatorCar.userData.carD / 4);
}

function populateFloors() {
    people = new Array(FLOOR_COUNT).fill(null);
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    for (let f = 0; f < FLOOR_COUNT; f++) {
        if (f === emptyFloor) continue;
        const p = createPerson();
        const pos = waitingSpotForFloor(f);
        p.position.copy(pos);
        p.rotation.y = Math.PI; // face the elevator (toward -Z)
        scene.add(p);
        people[f] = p;
    }
}

// ---------------- Animation primitives ----------------
function animateWalk(person, delta) {
    person.userData.walkPhase += delta * 6;
    const swing = Math.sin(person.userData.walkPhase) * 0.6;
    person.userData.leftLegPivot.rotation.x = swing;
    person.userData.rightLegPivot.rotation.x = -swing;
}

function resetLegs(person) {
    person.userData.leftLegPivot.rotation.x = 0;
    person.userData.rightLegPivot.rotation.x = 0;
    person.userData.walkPhase = 0;
}

// Move elevator car to a target floor
function moveElevatorToFloor(targetFloor, onComplete) {
    const targetY = targetFloor * FLOOR_HEIGHT;
    function step() {
        const dt = clock.getDelta() === 0 ? 0.016 : 0.016; // we won't rely on clock here
        const effSpeed = ELEVATOR_SPEED * speedMultiplier * 0.016;
        const dy = targetY - elevatorCar.position.y;
        if (Math.abs(dy) < 0.01) {
            elevatorCar.position.y = targetY;
            onComplete();
            return;
        }
        elevatorCar.position.y += Math.sign(dy) * Math.min(Math.abs(dy), effSpeed);
        requestAnimationFrame(step);
    }
    step();
}

// Open doors (slide outward from center)
function openDoors(onComplete) {
    const left = elevatorCar.userData.leftDoor;
    const right = elevatorCar.userData.rightDoor;
    const targetL = elevatorCar.userData.doorOpenXLeft;
    const targetR = elevatorCar.userData.doorOpenXRight;
    function step() {
        const sp = DOOR_ANIM_SPEED * speedMultiplier * 0.016;
        const dL = targetL - left.position.x;
        const dR = targetR - right.position.x;
        if (Math.abs(dL) < 0.01 && Math.abs(dR) < 0.01) {
            left.position.x = targetL;
            right.position.x = targetR;
            elevatorCar.userData.doorOpen = true;
            onComplete();
            return;
        }
        left.position.x += Math.sign(dL) * Math.min(Math.abs(dL), sp);
        right.position.x += Math.sign(dR) * Math.min(Math.abs(dR), sp);
        requestAnimationFrame(step);
    }
    step();
}

// Close doors (meet in center)
function closeDoors(onComplete) {
    const left = elevatorCar.userData.leftDoor;
    const right = elevatorCar.userData.rightDoor;
    const targetL = elevatorCar.userData.doorClosedXLeft;
    const targetR = elevatorCar.userData.doorClosedXRight;
    function step() {
        const sp = DOOR_ANIM_SPEED * speedMultiplier * 0.016;
        const dL = targetL - left.position.x;
        const dR = targetR - right.position.x;
        if (Math.abs(dL) < 0.01 && Math.abs(dR) < 0.01) {
            left.position.x = targetL;
            right.position.x = targetR;
            elevatorCar.userData.doorOpen = false;
            onComplete();
            return;
        }
        left.position.x += Math.sign(dL) * Math.min(Math.abs(dL), sp);
        right.position.x += Math.sign(dR) * Math.min(Math.abs(dR), sp);
        requestAnimationFrame(step);
    }
    step();
}

// Move person along Z-axis in world space, animating legs.
// targetWorldPos is a world-space Vector3.
function walkPersonTo(person, targetWorldPos, onComplete) {
    function step() {
        const sp = PERSON_MOVE_SPEED * speedMultiplier * 0.016;
        // Read world position of person
        const worldPos = new THREE.Vector3();
        person.getWorldPosition(worldPos);

        const dz = targetWorldPos.z - worldPos.z;
        const dx = targetWorldPos.x - worldPos.x;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.01) {
            resetLegs(person);
            onComplete();
            return;
        }

        // Compute step vector (world space)
        const stepLen = Math.min(dist, sp);
        const moveX = (dx / dist) * stepLen;
        const moveZ = (dz / dist) * stepLen;

        // Convert desired world translation to local translation of the person's parent.
        // Since parents (scene or elevatorCar) only translate (no rotation), world delta == local delta.
        person.position.x += moveX;
        person.position.z += moveZ;

        animateWalk(person, 0.016);
        requestAnimationFrame(step);
    }
    step();
}

function delay(ms, fn) {
    // Scale the delay by inverse of speed so the whole thing gets faster
    const scaled = ms / speedMultiplier;
    setTimeout(fn, scaled);
}

// ---------------- Simulation cycle ----------------
function runNextCycle() {
    if (animating) return;

    // Pick a random occupied floor to move a person from, target = emptyFloor.
    const occupied = [];
    for (let f = 0; f < FLOOR_COUNT; f++) {
        if (people[f] !== null) occupied.push(f);
    }
    if (occupied.length === 0) return;

    const fromFloor = occupied[Math.floor(Math.random() * occupied.length)];
    const toFloor = emptyFloor;
    if (fromFloor === toFloor) {
        setTimeout(runNextCycle, 500);
        return;
    }

    animating = true;
    const person = people[fromFloor];

    // 1. Elevator moves to pickup floor
    moveElevatorToFloor(fromFloor, () => {
        // 2. Doors open
        openDoors(() => {
            delay(STEP_DELAY_MS, () => {
                // 3. Person walks forward into elevator.
                // Target: elevator entry point in world space (just at the doorway)
                const entryWorld = new THREE.Vector3(
                    elevatorCar.position.x,
                    fromFloor * FLOOR_HEIGHT,
                    elevatorCar.position.z + insideElevatorLocalPos().z
                );
                walkPersonTo(person, entryWorld, () => {
                    // Reparent to elevator so they travel with it
                    const worldPos = new THREE.Vector3();
                    person.getWorldPosition(worldPos);
                    scene.remove(person);
                    elevatorCar.add(person);
                    // Convert worldPos to local elevator coords
                    const localPos = elevatorCar.worldToLocal(worldPos.clone());
                    person.position.copy(localPos);

                    delay(STEP_DELAY_MS, () => {
                        // 4. Doors close
                        closeDoors(() => {
                            // 5. Elevator travels to destination
                            moveElevatorToFloor(toFloor, () => {
                                // 6. Doors open at destination
                                openDoors(() => {
                                    delay(STEP_DELAY_MS, () => {
                                        // 7. Remove person from elevator, add back to scene, walk to waiting spot
                                        const worldPos2 = new THREE.Vector3();
                                        person.getWorldPosition(worldPos2);
                                        elevatorCar.remove(person);
                                        scene.add(person);
                                        person.position.copy(worldPos2);
                                        // Keep facing elevator (toward -Z), so rotation.y = PI
                                        person.rotation.y = Math.PI;

                                        const waitWorld = waitingSpotForFloor(toFloor);
                                        walkPersonTo(person, waitWorld, () => {
                                            delay(STEP_DELAY_MS, () => {
                                                // 8. Doors close
                                                closeDoors(() => {
                                                    // Update state
                                                    people[fromFloor] = null;
                                                    people[toFloor] = person;
                                                    emptyFloor = fromFloor;
                                                    animating = false;
                                                    setTimeout(runNextCycle, 500);
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// ---------------- Main loop ----------------
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start
init();
