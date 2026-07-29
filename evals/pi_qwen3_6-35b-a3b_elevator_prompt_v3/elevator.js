// elevator.js - Main simulation logic for the 3D elevator simulation.
// No ES6 import/export. All globals declared at top level.

// ---- CONSTANTS (H6) ----
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// ---- GLOBAL STATE ----
var scene, camera, renderer, controls;
var elevatorCar;
var people = [];
var emptyFloorIndex = 0;
var simClock = 0;
var simSpeed = 1;

// ---- DOOR STATE ----
var doorAnim = {
    active: false,
    direction: 0,
    startTime: 0,
    duration: 0.6,
    done: false
};

// ---- ANIMATION PIPELINE STATE MACHINE ----
var pipeline = {
    state: 'idle',
    stepStart: 0,
    sourceFloor: -1,
    destFloor: -1,
    personIdx: -1,
    walkAnimStart: 0,
    walkStartPosZ: 0,
    walkTargetPosZ: 0,
    walkDuration: 0,
    elevatorStartY: 0,
    elevatorTargetY: 0,
    elevatorDuration: 0
};

var _delayTimer = null;

// ---- HELPERS ----

function floorY(idx) {
    return idx * FLOOR_HEIGHT;
}

function easeInOut(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function doorHalfWidth() {
    return (SHAFT_WIDTH - 0.3) / 2 - 0.05;
}

function elapsed() {
    return simClock - doorAnim.startTime;
}

function animProgress() {
    var p = elapsed() / doorAnim.duration;
    return Math.max(0, Math.min(1, p));
}

// ---- BUILDING CREATION ----

function createBuilding() {
    // Ground floor - solid
    var groundMat = new THREE.MeshPhongMaterial({ color: 0x888888, side: THREE.DoubleSide });
    var ground = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH + 2, 0.3, BUILDING_DEPTH + 2), groundMat);
    ground.position.set(0, -0.15, 0);
    ground.renderOrder = 0;
    scene.add(ground);

    // Six usable floors with shaft cutout
    var floorThickness = 0.15;
    var floorMat = new THREE.MeshPhongMaterial({
        color: 0xcccccc, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false
    });

    var halfB = BUILDING_WIDTH / 2;
    var halfD = BUILDING_DEPTH / 2;
    var halfS = SHAFT_WIDTH / 2;
    var halfSD = SHAFT_DEPTH / 2;

    for (var f = 0; f < FLOOR_COUNT; f++) {
        var y = floorY(f);
        var frontD = halfD - halfSD;

        // Front strip
        var frontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, frontD);
        var frontMesh = new THREE.Mesh(frontGeo, floorMat);
        frontMesh.position.set(0, y, halfSD + frontD / 2);
        frontMesh.renderOrder = 0;
        scene.add(frontMesh);

        // Back strip
        var backMesh = new THREE.Mesh(frontGeo, floorMat);
        backMesh.position.set(0, y, -halfSD - frontD / 2);
        backMesh.renderOrder = 0;
        scene.add(backMesh);

        // Left strip
        var leftW = halfB - halfS;
        var leftGeo = new THREE.BoxGeometry(leftW, floorThickness, SHAFT_DEPTH);
        var leftMesh = new THREE.Mesh(leftGeo, floorMat);
        leftMesh.position.set(-halfS - leftW / 2, y, 0);
        leftMesh.renderOrder = 0;
        scene.add(leftMesh);

        // Right strip
        var rightMesh = new THREE.Mesh(leftGeo, floorMat);
        rightMesh.position.set(halfS + leftW / 2, y, 0);
        rightMesh.renderOrder = 0;
        scene.add(rightMesh);

        // Floor number marker
        var labelGeo = new THREE.BoxGeometry(1.2, 0.4, 0.05);
        var labelMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        var label = new THREE.Mesh(labelGeo, labelMat);
        label.position.set(-halfB + 0.8, y + 0.5, halfD + 0.3);
        scene.add(label);
    }

    // Semi-transparent walls
    var wallMat = new THREE.MeshPhongMaterial({
        color: 0x9999ff, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false
    });
    var wallFrontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, 0.1);
    var wallBackGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, 0.1);
    var wallSideGeo = new THREE.BoxGeometry(0.1, FLOOR_COUNT * FLOOR_HEIGHT, BUILDING_DEPTH);

    var wallFront = new THREE.Mesh(wallFrontGeo, wallMat);
    wallFront.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, BUILDING_DEPTH / 2);
    wallFront.renderOrder = 0;
    scene.add(wallFront);

    var wallBack = new THREE.Mesh(wallBackGeo, wallMat);
    wallBack.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, -BUILDING_DEPTH / 2);
    wallBack.renderOrder = 0;
    scene.add(wallBack);

    var wallLeft = new THREE.Mesh(wallSideGeo, wallMat);
    wallLeft.position.set(-BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    wallLeft.renderOrder = 0;
    scene.add(wallLeft);

    var wallRight = new THREE.Mesh(wallSideGeo, wallMat);
    wallRight.position.set(BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    wallRight.renderOrder = 0;
    scene.add(wallRight);

    // Roof (solid)
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 1, 0.3, BUILDING_DEPTH + 1);
    var roofMat = new THREE.MeshPhongMaterial({ color: 0x666666, side: THREE.DoubleSide });
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT + 0.15, 0);
    roof.renderOrder = 0;
    scene.add(roof);
}

// ---- ELEVATOR CREATION ----

function createElevatorCar() {
    var car = new THREE.Group();
    car.position.set(0, 0, 0);

    var frameMat = new THREE.MeshPhongMaterial({
        color: 0xffff00, transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false
    });
    frameMat.renderOrder = 1;

    var doorMat = new THREE.MeshPhongMaterial({
        color: 0xcccc00, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false
    });
    doorMat.renderOrder = 1;

    // Back wall
    var backW = SHAFT_WIDTH - 0.2;
    var backH = FLOOR_HEIGHT - 0.2;
    var backWall = new THREE.Mesh(new THREE.BoxGeometry(backW, backH, 0.08), frameMat);
    backWall.position.set(0, backH / 2, -SHAFT_DEPTH / 2 + 0.04);
    backWall.renderOrder = 1;
    car.add(backWall);

    // Side walls
    var sideH = FLOOR_HEIGHT - 0.2;
    var sideD = SHAFT_DEPTH - 0.2;
    var sideGeo = new THREE.BoxGeometry(0.08, sideH, sideD);

    var leftSide = new THREE.Mesh(sideGeo, frameMat);
    leftSide.position.set(-SHAFT_WIDTH / 2 + 0.04, sideH / 2, 0);
    leftSide.renderOrder = 1;
    car.add(leftSide);

    var rightSide = new THREE.Mesh(sideGeo, frameMat);
    rightSide.position.set(SHAFT_WIDTH / 2 - 0.04, sideH / 2, 0);
    rightSide.renderOrder = 1;
    car.add(rightSide);

    // Vertical corner pillars
    var pillarGeo = new THREE.BoxGeometry(0.15, FLOOR_HEIGHT - 0.1, 0.15);
    var cornerZ = -SHAFT_DEPTH / 2 + 0.075;
    var pillarPositions = [
        [-SHAFT_WIDTH / 2 + 0.075, (FLOOR_HEIGHT - 0.1) / 2, cornerZ],
        [SHAFT_WIDTH / 2 - 0.075, (FLOOR_HEIGHT - 0.1) / 2, cornerZ],
        [-SHAFT_WIDTH / 2 + 0.075, (FLOOR_HEIGHT - 0.1) / 2, SHAFT_DEPTH / 2 - 0.075],
        [SHAFT_WIDTH / 2 - 0.075, (FLOOR_HEIGHT - 0.1) / 2, SHAFT_DEPTH / 2 - 0.075]
    ];
    for (var i = 0; i < pillarPositions.length; i++) {
        var pillar = new THREE.Mesh(pillarGeo, frameMat);
        pillar.position.set(pillarPositions[i][0], pillarPositions[i][1], pillarPositions[i][2]);
        pillar.renderOrder = 1;
        car.add(pillar);
    }

    // Car floor
    var carFloorGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.3, 0.08, SHAFT_DEPTH - 0.3);
    var carFloor = new THREE.Mesh(carFloorGeo, frameMat);
    carFloor.position.set(0, 0.04, 0);
    carFloor.renderOrder = 1;
    car.add(carFloor);

    // Top bar
    var topBarGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.1, 0.1, 0.1);
    var topBar = new THREE.Mesh(topBarGeo, frameMat);
    topBar.position.set(0, FLOOR_HEIGHT - 0.2 - 0.05, 0);
    topBar.renderOrder = 1;
    car.add(topBar);

    // DOORS - split left/right halves
    var dhw = doorHalfWidth();
    var dHeight = FLOOR_HEIGHT - 0.4;
    var dDepth = 0.08;
    var doorFrontZ = SHAFT_DEPTH / 2 - dDepth / 2 - 0.01;

    var leftDoorGeo = new THREE.BoxGeometry(dhw, dHeight, dDepth);

    // Assign global BEFORE storing door references (H5)
    elevatorCar = car;

    // Left door - closed position: left edge of opening
    elevatorCar.leftDoor = new THREE.Mesh(leftDoorGeo, doorMat);
    elevatorCar.leftDoor.position.set(-dhw / 2 - 0.01, dHeight / 2 + 0.08, doorFrontZ);
    elevatorCar.leftDoor.renderOrder = 1;
    car.add(elevatorCar.leftDoor);

    // Right door - closed position: right edge of opening
    elevatorCar.rightDoor = new THREE.Mesh(leftDoorGeo.clone(), doorMat);
    elevatorCar.rightDoor.position.set(dhw / 2 + 0.01, dHeight / 2 + 0.08, doorFrontZ);
    elevatorCar.rightDoor.renderOrder = 1;
    car.add(elevatorCar.rightDoor);

    return car;
}

// ---- DOOR ANIMATION ----

function updateDoorAnimation() {
    if (!doorAnim.active) return;

    var t = animProgress();
    var eased = easeInOut(t);
    var hw = doorHalfWidth();

    if (doorAnim.direction === 1) {
        // Opening: left moves right, right moves left
        var gap = hw * eased;
        elevatorCar.leftDoor.position.x = -hw / 2 + gap;
        elevatorCar.rightDoor.position.x = hw / 2 - gap;
    } else {
        // Closing: move toward center
        var gap = hw * (1 - eased);
        elevatorCar.leftDoor.position.x = -hw / 2 + gap;
        elevatorCar.rightDoor.position.x = hw / 2 - gap;
    }

    if (t >= 1) {
        // Snap to final position
        if (doorAnim.direction === 1) {
            elevatorCar.leftDoor.position.x = hw;
            elevatorCar.rightDoor.position.x = -hw;
        } else {
            elevatorCar.leftDoor.position.x = -hw / 2 - 0.01;
            elevatorCar.rightDoor.position.x = hw / 2 + 0.01;
        }
        doorAnim.active = false;
        doorAnim.done = true;
    }
}

function startDoorAnim(direction) {
    doorAnim.active = true;
    doorAnim.done = false;
    doorAnim.direction = direction;
    doorAnim.startTime = simClock;
    doorAnim.duration = 0.6 / simSpeed;
}

// ---- WALK ANIMATION ----

function updateWalkAnimation() {
    var person = people[pipeline.personIdx];
    if (!person || !person.userData.isWalking) return;

    var walkT = (simClock - pipeline.walkAnimStart) / pipeline.walkDuration;
    walkT = Math.max(0, Math.min(1, walkT));

    if (walkT < 1) {
        // Leg swing
        var legSwing = Math.sin((simClock - pipeline.walkAnimStart) * 10 * simSpeed) * 0.5;
        person.userData.leftLeg.rotation.x = legSwing;
        person.userData.rightLeg.rotation.x = -legSwing;
    } else {
        person.userData.isWalking = false;
        person.userData.leftLeg.rotation.x = 0;
        person.userData.rightLeg.rotation.x = 0;
    }
}

// ---- ANIMATION STATE MACHINE ----

function transitionTo(newState) {
    pipeline.state = newState;
    pipeline.stepStart = simClock;
}

function nextState() {
    var elapsed = simClock - pipeline.stepStart;

    switch (pipeline.state) {
        case 'idle':
            pickNextPerson();
            break;

        case 'move_to_pickup':
            if (elapsed >= pipeline.elevatorDuration) {
                elevatorCar.position.y = pipeline.elevatorTargetY;
                transitionTo('open_doors_pickup');
                startDoorAnim(1);
            } else {
                var t = easeInOut(elapsed / pipeline.elevatorDuration);
                elevatorCar.position.y = pipeline.elevatorStartY + (pipeline.elevatorTargetY - pipeline.elevatorStartY) * t;
            }
            break;

        case 'open_doors_pickup':
            if (!doorAnim.active) {
                transitionTo('wait_pickup');
                pipeline.stepStart = simClock + 0.3 / simSpeed;
            }
            break;

        case 'wait_pickup':
            if (elapsed >= 0.3 / simSpeed) {
                transitionTo('board_pickup');
                people[pipeline.personIdx].userData.isWalking = true;
                pipeline.walkAnimStart = simClock;
                var boardingPerson = people[pipeline.personIdx];
                pipeline.walkStartPosZ = boardingPerson.position.z;
                pipeline.walkTargetPosZ = 0;
                pipeline.walkDuration = Math.abs(pipeline.walkTargetPosZ - pipeline.walkStartPosZ) / (PERSON_MOVE_SPEED * simSpeed);
                if (pipeline.walkDuration < 0.5) pipeline.walkDuration = 0.5;
            }
            break;

        case 'board_pickup':
            var walkT = (simClock - pipeline.walkAnimStart) / pipeline.walkDuration;
            if (walkT >= 1) {
                var person = people[pipeline.personIdx];
                person.userData.isWalking = false;
                person.userData.leftLeg.rotation.x = 0;
                person.userData.rightLeg.rotation.x = 0;
                person.position.set(0, 0, 0);

                // Boarding: reparent using .attach() (H8)
                elevatorCar.attach(person);

                transitionTo('close_doors_pickup');
                startDoorAnim(-1);
            } else {
                var person = people[pipeline.personIdx];
                var t = easeInOut(walkT);
                person.position.z = pipeline.walkStartPosZ + (pipeline.walkTargetPosZ - pipeline.walkStartPosZ) * t;
            }
            break;

        case 'close_doors_pickup':
            if (!doorAnim.active) {
                transitionTo('move_to_dest');
                pipeline.elevatorStartY = elevatorCar.position.y;
                pipeline.elevatorTargetY = floorY(pipeline.destFloor);
                var dist = Math.abs(pipeline.elevatorTargetY - pipeline.elevatorStartY);
                pipeline.elevatorDuration = dist / (ELEVATOR_SPEED * simSpeed);
                if (pipeline.elevatorDuration < 0.3) pipeline.elevatorDuration = 0.3;
            }
            break;

        case 'move_to_dest':
            if (elapsed >= pipeline.elevatorDuration) {
                elevatorCar.position.y = pipeline.elevatorTargetY;
                transitionTo('open_doors_dest');
                startDoorAnim(1);
            } else {
                var t = easeInOut(elapsed / pipeline.elevatorDuration);
                elevatorCar.position.y = pipeline.elevatorStartY + (pipeline.elevatorTargetY - pipeline.elevatorStartY) * t;
            }
            break;

        case 'open_doors_dest':
            if (!doorAnim.active) {
                transitionTo('wait_dest');
                pipeline.stepStart = simClock + 0.3 / simSpeed;
            }
            break;

        case 'wait_dest':
            if (elapsed >= 0.3 / simSpeed) {
                transitionTo('exit_dest');
                var exitingPerson = people[pipeline.personIdx];
                exitingPerson.userData.isWalking = true;
                pipeline.walkAnimStart = simClock;
                pipeline.walkStartPosZ = exitingPerson.position.z;
                pipeline.walkTargetPosZ = SHAFT_DEPTH / 2 + 1.5;
                pipeline.walkDuration = Math.abs(pipeline.walkTargetPosZ - pipeline.walkStartPosZ) / (PERSON_MOVE_SPEED * simSpeed);
                if (pipeline.walkDuration < 0.5) pipeline.walkDuration = 0.5;
            }
            break;

        case 'exit_dest':
            var person = people[pipeline.personIdx];
            var walkT = (simClock - pipeline.walkAnimStart) / pipeline.walkDuration;
            if (walkT >= 1) {
                person.userData.isWalking = false;
                person.userData.leftLeg.rotation.x = 0;
                person.userData.rightLeg.rotation.x = 0;

                // Exiting: reparent using .attach() (H8)
                scene.attach(person);

                var destFloor = pipeline.destFloor;
                person.position.set(0, floorY(destFloor), pipeline.walkTargetPosZ);
                person.rotation.y = Math.PI;

                // Update floor tracking
                people[pipeline.personIdx].userData.onFloor = destFloor;
                emptyFloorIndex = pipeline.sourceFloor;

                transitionTo('close_doors_dest');
                startDoorAnim(-1);
            } else {
                var t = easeInOut(walkT);
                person.position.z = pipeline.walkStartPosZ + (pipeline.walkTargetPosZ - pipeline.walkStartPosZ) * t;
            }
            break;

        case 'close_doors_dest':
            if (!doorAnim.active) {
                transitionTo('pause');
                pipeline.stepStart = simClock + 1.0 / simSpeed;
            }
            break;

        case 'pause':
            if (elapsed >= 1.0 / simSpeed) {
                transitionTo('idle');
            }
            break;
    }
}

function pickNextPerson() {
    // Find all people who have an assigned floor
    var candidates = [];
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.onFloor !== null && people[i].userData.onFloor !== emptyFloorIndex) {
            candidates.push(i);
        }
    }
    if (candidates.length === 0) return;

    pipeline.personIdx = candidates[Math.floor(Math.random() * candidates.length)];
    pipeline.sourceFloor = people[pipeline.personIdx].userData.onFloor;
    pipeline.destFloor = emptyFloorIndex;

    if (pipeline.sourceFloor === pipeline.destFloor) return;

    // Setup walk animation
    people[pipeline.personIdx].userData.isWalking = false;

    // Setup elevator move
    pipeline.elevatorStartY = elevatorCar.position.y;
    pipeline.elevatorTargetY = floorY(pipeline.sourceFloor);
    var dist = Math.abs(pipeline.elevatorTargetY - pipeline.elevatorStartY);
    pipeline.elevatorDuration = dist / (ELEVATOR_SPEED * simSpeed);
    if (pipeline.elevatorDuration < 0.3) pipeline.elevatorDuration = 0.3;

    transitionTo('move_to_pickup');
}

// ---- INIT / MAIN ----

function startSimulation() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    // Build
    createBuilding();

    // Create elevator car
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    // Create people - one on each floor except the empty one
    for (var f = 0; f < FLOOR_COUNT; f++) {
        if (f !== emptyFloorIndex) {
            var person = createPerson();
            person.position.set(0, floorY(f), SHAFT_DEPTH / 2 + 1.5);
            person.rotation.y = Math.PI;
            person.userData.onFloor = f;
            person.userData.targetZ = SHAFT_DEPTH / 2 + 1.5;
            people.push(person);
            scene.add(person);
        }
    }

    // Resize handler
    window.addEventListener('resize', onWindowResize);

    // Speed slider
    addSpeedSlider();

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        simClock += 0.016;

        // Update door animation
        updateDoorAnimation();

        // Update walk animation
        updateWalkAnimation();

        // Advance state machine
        nextState();

        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---- SPEED SLIDER ----

function addSpeedSlider() {
    var container = document.createElement('div');
    container.id = 'speed-control';
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.left = '10px';
    container.style.zIndex = '100';
    container.style.background = 'rgba(0,0,0,0.5)';
    container.style.padding = '10px';
    container.style.borderRadius = '8px';
    container.style.color = '#fff';
    container.style.fontFamily = 'sans-serif';
    container.style.fontSize = '14px';

    var label = document.createElement('label');
    label.textContent = 'Speed: ';
    container.appendChild(label);

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = '1';
    slider.step = '1';
    slider.style.width = '120px';
    slider.style.marginLeft = '8px';
    slider.id = 'speed-slider';
    container.appendChild(slider);

    var value = document.createElement('span');
    value.id = 'speed-value';
    value.textContent = ' 1x';
    container.appendChild(value);

    slider.addEventListener('input', function() {
        simSpeed = parseInt(slider.value, 10);
        value.textContent = ' ' + simSpeed + 'x';
    });

    document.body.appendChild(container);
}

// ---- AUTO-START (H3) ----

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
