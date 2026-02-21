// elevator.js - Main simulation logic, building creation, animations
// No ES6 modules - uses global THREE object

// ============================================================
// Configurable Constants
// ============================================================
var FLOOR_HEIGHT = 2.5;
var FLOOR_COUNT = 6;
var BUILDING_WIDTH = 8;
var BUILDING_DEPTH = 6;
var SHAFT_WIDTH = 1.8;
var SHAFT_DEPTH = 1.8;
var ELEVATOR_SPEED = 2.0;       // floors per second (base)
var PERSON_MOVE_SPEED = 2.0;    // units per second (base)
var DOOR_SPEED = 1.5;           // units per second for door slide (base)
var STEP_DELAY = 300;           // ms between animation steps

// ============================================================
// Speed multiplier (controlled by slider)
// ============================================================
var speedMultiplier = 1.0;

// ============================================================
// Scene Setup
// ============================================================
var scene, camera, renderer, controls;
var elevatorCar;
var people = [];       // all person objects
var floorPeople = [];  // person on each floor (or null), 1-indexed
var emptyFloor = 0;    // which floor is currently empty
var animating = false; // is an animation sequence running?

function init() {
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    renderer.setClearColor(0x1a1a2e, 1);
    document.body.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.012);

    // Camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    // Lighting
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(15, 30, 20);
    scene.add(dirLight);
    var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-10, 20, -15);
    scene.add(dirLight2);

    // Build everything
    createBuilding();
    createElevator();
    createPeople_init();
    createUI();

    // Window resize
    window.addEventListener('resize', onResize);

    // Start render loop
    renderLoop();

    // Start simulation after a short delay
    setTimeout(startSimulationCycle, 1000);
}

// ============================================================
// Building Creation
// ============================================================
function createBuilding() {
    var buildingGroup = new THREE.Group();
    buildingGroup.renderOrder = 0;

    // Floor surfaces
    for (var i = 0; i <= FLOOR_COUNT; i++) {
        var y = i * FLOOR_HEIGHT;
        var isGround = (i === 0);
        var isRoof = (i === FLOOR_COUNT);
        var opacity = (isGround || isRoof) ? 0.8 : 0.3;

        var floorMat = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Left section of floor (left of shaft)
        var sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        var leftGeo = new THREE.BoxGeometry(sideWidth, 0.1, BUILDING_DEPTH);
        var leftFloor = new THREE.Mesh(leftGeo, floorMat);
        leftFloor.position.set(-(SHAFT_WIDTH / 2 + sideWidth / 2), y, 0);
        buildingGroup.add(leftFloor);

        // Right section of floor (right of shaft)
        var rightGeo = new THREE.BoxGeometry(sideWidth, 0.1, BUILDING_DEPTH);
        var rightFloor = new THREE.Mesh(rightGeo, floorMat);
        rightFloor.position.set(SHAFT_WIDTH / 2 + sideWidth / 2, y, 0);
        buildingGroup.add(rightFloor);

        // Front section (in front of shaft)
        var frontDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        var frontGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, frontDepth);
        var frontFloor = new THREE.Mesh(frontGeo, floorMat);
        frontFloor.position.set(0, y, SHAFT_DEPTH / 2 + frontDepth / 2);
        buildingGroup.add(frontFloor);

        // Back section (behind shaft)
        var backGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.1, frontDepth);
        var backFloor = new THREE.Mesh(backGeo, floorMat);
        backFloor.position.set(0, y, -(SHAFT_DEPTH / 2 + frontDepth / 2));
        buildingGroup.add(backFloor);
    }

    // Walls
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    var totalHeight = FLOOR_COUNT * FLOOR_HEIGHT;

    // Back wall
    var backWallGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, totalHeight);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, totalHeight / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    // Left wall
    var leftWallGeo = new THREE.PlaneGeometry(BUILDING_DEPTH, totalHeight);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, totalHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    buildingGroup.add(leftWall);

    // Right wall
    var rightWallGeo = new THREE.PlaneGeometry(BUILDING_DEPTH, totalHeight);
    var rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, totalHeight / 2, 0);
    rightWall.rotation.y = Math.PI / 2;
    buildingGroup.add(rightWall);

    // Front wall (two sections flanking shaft opening)
    var frontWallSideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    var frontWallLeftGeo = new THREE.PlaneGeometry(frontWallSideWidth, totalHeight);
    var frontWallLeft = new THREE.Mesh(frontWallLeftGeo, wallMat);
    frontWallLeft.position.set(-(SHAFT_WIDTH / 2 + frontWallSideWidth / 2), totalHeight / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontWallLeft);

    var frontWallRightGeo = new THREE.PlaneGeometry(frontWallSideWidth, totalHeight);
    var frontWallRight = new THREE.Mesh(frontWallRightGeo, wallMat);
    frontWallRight.position.set(SHAFT_WIDTH / 2 + frontWallSideWidth / 2, totalHeight / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontWallRight);

    // Shaft guide rails
    var railMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    var railGeo = new THREE.BoxGeometry(0.05, totalHeight, 0.05);
    var railPositions = [
        [-SHAFT_WIDTH / 2, totalHeight / 2, -SHAFT_DEPTH / 2],
        [SHAFT_WIDTH / 2, totalHeight / 2, -SHAFT_DEPTH / 2],
        [-SHAFT_WIDTH / 2, totalHeight / 2, SHAFT_DEPTH / 2],
        [SHAFT_WIDTH / 2, totalHeight / 2, SHAFT_DEPTH / 2]
    ];
    for (var r = 0; r < railPositions.length; r++) {
        var rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(railPositions[r][0], railPositions[r][1], railPositions[r][2]);
        buildingGroup.add(rail);
    }

    // Floor indicators (small yellow squares on front face)
    for (var f = 1; f <= FLOOR_COUNT; f++) {
        var indicatorGeo = new THREE.BoxGeometry(0.3, 0.3, 0.05);
        var indicatorMat = new THREE.MeshLambertMaterial({ color: 0xffff00 });
        var indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        indicator.position.set(SHAFT_WIDTH / 2 + 0.5, f * FLOOR_HEIGHT + 0.5, BUILDING_DEPTH / 2 + 0.03);
        buildingGroup.add(indicator);
    }

    scene.add(buildingGroup);
}

// ============================================================
// Elevator Creation
// ============================================================
function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    var carWidth = SHAFT_WIDTH - 0.2;
    var carDepth = SHAFT_DEPTH - 0.2;
    var carHeight = FLOOR_HEIGHT - 0.3;

    // Elevator frame material (semi-transparent yellow)
    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Elevator floor (solid)
    var floorGeo = new THREE.BoxGeometry(carWidth, 0.08, carDepth);
    var floorMat = new THREE.MeshLambertMaterial({ color: 0x888844 });
    var elevFloor = new THREE.Mesh(floorGeo, floorMat);
    elevFloor.position.set(0, 0.04, 0);
    elevatorCar.add(elevFloor);

    // Ceiling
    var ceilGeo = new THREE.BoxGeometry(carWidth, 0.05, carDepth);
    var ceil = new THREE.Mesh(ceilGeo, frameMat);
    ceil.position.set(0, carHeight, 0);
    elevatorCar.add(ceil);

    // Back wall (more opaque)
    var backMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    var backGeo = new THREE.PlaneGeometry(carWidth, carHeight);
    var back = new THREE.Mesh(backGeo, backMat);
    back.position.set(0, carHeight / 2, -carDepth / 2);
    elevatorCar.add(back);

    // Side walls (transparent)
    var sideGeo = new THREE.PlaneGeometry(carDepth, carHeight);

    var leftSide = new THREE.Mesh(sideGeo, frameMat);
    leftSide.position.set(-carWidth / 2, carHeight / 2, 0);
    leftSide.rotation.y = Math.PI / 2;
    elevatorCar.add(leftSide);

    var rightSide = new THREE.Mesh(sideGeo, frameMat);
    rightSide.position.set(carWidth / 2, carHeight / 2, 0);
    rightSide.rotation.y = Math.PI / 2;
    elevatorCar.add(rightSide);

    // Doors (front, split left/right, slide from center outward)
    var doorHeight = carHeight - 0.2;
    var doorWidth = carWidth / 2 - 0.05;
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    var doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.05);

    var doorLeft = new THREE.Mesh(doorGeo, doorMat);
    doorLeft.position.set(-doorWidth / 2, doorHeight / 2 + 0.1, carDepth / 2);
    elevatorCar.add(doorLeft);

    var doorRight = new THREE.Mesh(doorGeo, doorMat);
    doorRight.position.set(doorWidth / 2, doorHeight / 2 + 0.1, carDepth / 2);
    elevatorCar.add(doorRight);

    // Store references and dimensions on the elevator object
    elevatorCar.userData = {
        doorLeft: doorLeft,
        doorRight: doorRight,
        doorWidth: doorWidth,
        carWidth: carWidth,
        carDepth: carDepth,
        doorsOpen: false,
        currentFloor: 1,
        // Closed door X positions (doors meet in center)
        closedLeftX: -doorWidth / 2,
        closedRightX: doorWidth / 2,
        // Open door X positions (retracted outward)
        openLeftX: -(doorWidth + 0.05),
        openRightX: doorWidth + 0.05
    };

    // Initial position: floor 1
    elevatorCar.position.set(0, 1 * FLOOR_HEIGHT, 0);
    scene.add(elevatorCar);
}

// ============================================================
// People Initialization
// ============================================================
function getWaitZ() {
    return SHAFT_DEPTH / 2 + 1.2;
}

function createPeople_init() {
    var bodyColors = [0x3498db, 0xe74c3c, 0x2ecc71, 0x9b59b6, 0xe67e22];

    emptyFloor = 1; // floor 1 starts empty

    floorPeople = new Array(FLOOR_COUNT + 1);
    for (var i = 0; i <= FLOOR_COUNT; i++) {
        floorPeople[i] = null;
    }

    var personId = 0;
    for (var floor = 1; floor <= FLOOR_COUNT; floor++) {
        if (floor === emptyFloor) continue;

        var person = createPerson(personId, bodyColors[personId % bodyColors.length]);
        personId++;

        // Position in front of elevator doors, facing the elevator
        var floorY = floor * FLOOR_HEIGHT;
        person.position.set(0, floorY, getWaitZ());
        person.rotation.y = Math.PI; // face toward -Z (toward elevator)

        scene.add(person);
        people.push(person);
        floorPeople[floor] = person;
    }
}

// ============================================================
// Animation Utilities (using performance.now for timing)
// ============================================================

function moveElevatorToFloor(targetFloor, callback) {
    var targetY = targetFloor * FLOOR_HEIGHT;
    var distance = Math.abs(targetY - elevatorCar.position.y);
    if (distance < 0.01) {
        elevatorCar.position.y = targetY;
        elevatorCar.userData.currentFloor = targetFloor;
        if (callback) callback();
        return;
    }

    var direction = targetY > elevatorCar.position.y ? 1 : -1;
    var lastTime = performance.now();

    function step(now) {
        var dt = (now - lastTime) / 1000; // seconds
        lastTime = now;

        var move = ELEVATOR_SPEED * FLOOR_HEIGHT * dt * speedMultiplier;
        elevatorCar.position.y += direction * move;

        if ((direction > 0 && elevatorCar.position.y >= targetY) ||
            (direction < 0 && elevatorCar.position.y <= targetY)) {
            elevatorCar.position.y = targetY;
            elevatorCar.userData.currentFloor = targetFloor;
            if (callback) callback();
            return;
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function animateDoors(open, callback) {
    var ud = elevatorCar.userData;
    var doorLeft = ud.doorLeft;
    var doorRight = ud.doorRight;

    var targetLeftX = open ? ud.openLeftX : ud.closedLeftX;
    var targetRightX = open ? ud.openRightX : ud.closedRightX;

    var lastTime = performance.now();

    function step(now) {
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        var move = DOOR_SPEED * dt * speedMultiplier;

        // Slide left door
        var dxL = targetLeftX - doorLeft.position.x;
        if (Math.abs(dxL) > 0.005) {
            var stepL = Math.sign(dxL) * Math.min(move, Math.abs(dxL));
            doorLeft.position.x += stepL;
        } else {
            doorLeft.position.x = targetLeftX;
        }

        // Slide right door
        var dxR = targetRightX - doorRight.position.x;
        if (Math.abs(dxR) > 0.005) {
            var stepR = Math.sign(dxR) * Math.min(move, Math.abs(dxR));
            doorRight.position.x += stepR;
        } else {
            doorRight.position.x = targetRightX;
        }

        // Check completion
        if (Math.abs(doorLeft.position.x - targetLeftX) < 0.005 &&
            Math.abs(doorRight.position.x - targetRightX) < 0.005) {
            doorLeft.position.x = targetLeftX;
            doorRight.position.x = targetRightX;
            ud.doorsOpen = open;
            if (callback) callback();
            return;
        }
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function movePersonTo(person, targetPos, callback) {
    person.userData.isWalking = true;
    person.userData.walkPhase = 0;
    var lastTime = performance.now();

    function step(now) {
        var dt = (now - lastTime) / 1000;
        lastTime = now;

        var dx = targetPos.x - person.position.x;
        var dz = targetPos.z - person.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.05) {
            person.position.x = targetPos.x;
            person.position.z = targetPos.z;
            person.userData.isWalking = false;
            animatePersonWalking(person, 0, 1); // reset legs
            if (callback) callback();
            return;
        }

        var speed = PERSON_MOVE_SPEED * dt * speedMultiplier;
        var moveAmt = Math.min(speed, dist);
        person.position.x += (dx / dist) * moveAmt;
        person.position.z += (dz / dist) * moveAmt;

        // Leg/arm swing animation
        animatePersonWalking(person, dt, speedMultiplier);

        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ============================================================
// Delayed callback helper
// ============================================================
function delayThen(callback) {
    setTimeout(callback, STEP_DELAY / speedMultiplier);
}

// ============================================================
// Simulation Cycle
// ============================================================
function startSimulationCycle() {
    if (animating) return;
    animating = true;

    // Gather occupied floors
    var occupiedFloors = [];
    for (var f = 1; f <= FLOOR_COUNT; f++) {
        if (floorPeople[f] !== null) {
            occupiedFloors.push(f);
        }
    }

    if (occupiedFloors.length === 0) {
        animating = false;
        setTimeout(startSimulationCycle, 1000);
        return;
    }

    var pickupFloor = occupiedFloors[Math.floor(Math.random() * occupiedFloors.length)];
    var destinationFloor = emptyFloor;
    var person = floorPeople[pickupFloor];

    if (!person) {
        animating = false;
        setTimeout(startSimulationCycle, 500);
        return;
    }

    runSequence(person, pickupFloor, destinationFloor);
}

function runSequence(person, pickupFloor, destinationFloor) {
    // Step 1: Move elevator to pickup floor
    moveElevatorToFloor(pickupFloor, function () {
        delayThen(function () {

            // Step 2: Open doors
            animateDoors(true, function () {
                delayThen(function () {

                    // Step 3: Person walks forward into elevator
                    // Person is at (0, floorY, waitZ) facing -Z
                    // Walk to shaft center (0, floorY, 0)
                    var floorY = pickupFloor * FLOOR_HEIGHT;
                    var enterTarget = new THREE.Vector3(0, floorY, 0);
                    movePersonTo(person, enterTarget, function () {

                        // Re-parent person to elevator car
                        scene.remove(person);
                        elevatorCar.add(person);
                        // Local coordinates: person stands on elevator floor
                        person.position.set(0, 0.08, 0);
                        person.rotation.y = Math.PI; // face front (doors)

                        delayThen(function () {

                            // Step 4: Close doors
                            animateDoors(false, function () {
                                delayThen(function () {

                                    // Step 5: Elevator travels to destination
                                    moveElevatorToFloor(destinationFloor, function () {
                                        delayThen(function () {

                                            // Step 6: Open doors at destination
                                            animateDoors(true, function () {
                                                delayThen(function () {

                                                    // Step 7: Person walks out
                                                    // Re-parent to scene
                                                    elevatorCar.remove(person);
                                                    scene.add(person);
                                                    var destY = destinationFloor * FLOOR_HEIGHT;
                                                    // Place at elevator door position
                                                    person.position.set(0, destY, 0);
                                                    // Face outward (+Z) to walk forward out of elevator
                                                    person.rotation.y = 0;

                                                    var exitTarget = new THREE.Vector3(0, destY, getWaitZ());
                                                    movePersonTo(person, exitTarget, function () {
                                                        // Turn back to face elevator
                                                        person.rotation.y = Math.PI;

                                                        delayThen(function () {

                                                            // Step 8: Close doors
                                                            animateDoors(false, function () {

                                                                // Update floor state
                                                                floorPeople[pickupFloor] = null;
                                                                floorPeople[destinationFloor] = person;
                                                                emptyFloor = pickupFloor;

                                                                animating = false;

                                                                // Start next cycle
                                                                delayThen(startSimulationCycle);
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
            });
        });
    });
}

// ============================================================
// UI Controls
// ============================================================
function createUI() {
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.75);padding:15px 25px;border-radius:12px;color:white;' +
        'font-family:Arial,sans-serif;display:flex;align-items:center;gap:15px;z-index:100;' +
        'backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.15);';

    var label = document.createElement('span');
    label.textContent = 'Speed:';
    label.style.cssText = 'font-size:14px;font-weight:bold;white-space:nowrap;';
    container.appendChild(label);

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = '1';
    slider.step = '1';
    slider.style.cssText = 'width:180px;cursor:pointer;accent-color:#ffff00;';
    container.appendChild(slider);

    var valueLabel = document.createElement('span');
    valueLabel.textContent = '1x';
    valueLabel.style.cssText = 'font-size:14px;min-width:35px;text-align:center;font-weight:bold;color:#ffff00;';
    container.appendChild(valueLabel);

    slider.addEventListener('input', function () {
        speedMultiplier = parseFloat(slider.value);
        valueLabel.textContent = slider.value + 'x';
    });

    document.body.appendChild(container);

    // Title
    var title = document.createElement('div');
    title.textContent = '3D Elevator Simulation';
    title.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.75);padding:10px 25px;border-radius:12px;color:white;' +
        'font-family:Arial,sans-serif;font-size:18px;font-weight:bold;z-index:100;' +
        'backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.15);';
    document.body.appendChild(title);
}

// ============================================================
// Render Loop
// ============================================================
function renderLoop() {
    requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// Start
// ============================================================
init();
