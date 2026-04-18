// Constants as top-level declarations
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Global Three.js objects
var scene, camera, renderer, controls;
var elevatorCar;
var people = [];
var emptyFloorIndex = 0;
var isAnimating = false;
var speedMultiplier = 5;

// Animation state
var currentFloor = 0;
var targetFloor = 0;
var elevatorDir = 1;
var doorsOpen = false;
var doorAnimProgress = 0;
var doorAnimDirection = 0;

// Person states
var STATE_IDLE = 0;
var STATE_WALKING_IN = 1;
var STATE_WALKING_OUT = 2;
var STATE_WAITING = 3;

function getFloorY(floorIndex) {
    return floorIndex * FLOOR_HEIGHT;
}

function getElevatorCenterX() {
    return 0;
}

function getElevatorCenterZ() {
    return 0;
}

function createBuilding() {
    var buildingGroup = new THREE.Group();

    // Ground floor (solid)
    var groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var groundMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    var ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.set(0, -0.1, 0);
    ground.renderOrder = 0;
    buildingGroup.add(ground);

    // Create each floor with a shaft cutout
    for (var i = 0; i < FLOOR_COUNT; i++) {
        var floorY = getFloorY(i);

        // Floor surface with shaft hole - use 4 panels around shaft
        var floorThickness = 0.15;
        var halfW = BUILDING_WIDTH / 2;
        var halfD = BUILDING_DEPTH / 2;
        var shaftHalfW = SHAFT_WIDTH / 2;
        var shaftHalfD = SHAFT_DEPTH / 2;

        // Floor material - transparent
        var floorMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        // Front panel (negative Z)
        var frontZ = -halfD + shaftHalfD;
        var frontDepth = shaftHalfD * 2;
        if (frontDepth > 0) {
            var frontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, frontDepth);
            var frontMesh = new THREE.Mesh(frontGeo, floorMaterial);
            frontMesh.position.set(0, floorY, -halfD + frontDepth / 2);
            frontMesh.renderOrder = 0;
            buildingGroup.add(frontMesh);
        }

        // Back panel (positive Z)
        var backZ = shaftHalfD;
        var backDepth = halfD - shaftHalfD;
        if (backDepth > 0) {
            var backGeo = new THREE.BoxGeometry(BUILDING_WIDTH, floorThickness, backDepth);
            var backMesh = new THREE.Mesh(backGeo, floorMaterial);
            backMesh.position.set(0, floorY, shaftHalfD + backDepth / 2);
            backMesh.renderOrder = 0;
            buildingGroup.add(backMesh);
        }

        // Left panel (negative X)
        var leftX = -halfW + shaftHalfW;
        var leftWidth = shaftHalfW * 2;
        if (leftWidth > 0) {
            var leftGeo = new THREE.BoxGeometry(leftWidth, floorThickness, BUILDING_DEPTH);
            var leftMesh = new THREE.Mesh(leftGeo, floorMaterial);
            leftMesh.position.set(-halfW + leftWidth / 2, floorY, 0);
            leftMesh.renderOrder = 0;
            buildingGroup.add(leftMesh);
        }

        // Right panel (positive X)
        var rightX = shaftHalfW;
        var rightWidth = halfW - shaftHalfW;
        if (rightWidth > 0) {
            var rightGeo = new THREE.BoxGeometry(rightWidth, floorThickness, BUILDING_DEPTH);
            var rightMesh = new THREE.Mesh(rightGeo, floorMaterial);
            rightMesh.position.set(shaftHalfW + rightWidth / 2, floorY, 0);
            rightMesh.renderOrder = 0;
            buildingGroup.add(rightMesh);
        }
    }

    // Walls - semi-transparent
    var wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Front wall (with door opening)
    var frontWallZ = -BUILDING_DEPTH / 2 + 0.5;
    // Left section of front wall
    var frontLeftWidth = BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2 - 0.5;
    if (frontLeftWidth > 0) {
        var flGeo = new THREE.BoxGeometry(frontLeftWidth, BUILDING_HEIGHT(), 0.1);
        var flMesh = new THREE.Mesh(flGeo, wallMaterial);
        flMesh.position.set(-BUILDING_WIDTH / 4 - frontLeftWidth / 2, BUILDING_HEIGHT() / 2, frontWallZ);
        flMesh.renderOrder = 0;
        buildingGroup.add(flMesh);
    }
    // Right section of front wall
    var frontRightWidth = BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2 - 0.5;
    if (frontRightWidth > 0) {
        var frGeo = new THREE.BoxGeometry(frontRightWidth, BUILDING_HEIGHT(), 0.1);
        var frMesh = new THREE.Mesh(frGeo, wallMaterial);
        frMesh.position.set(BUILDING_WIDTH / 4 + frontRightWidth / 2, BUILDING_HEIGHT() / 2, frontWallZ);
        frMesh.renderOrder = 0;
        buildingGroup.add(frMesh);
    }

    // Back wall
    var backWallZ = BUILDING_DEPTH / 2 - 0.5;
    var backGeo = new THREE.BoxGeometry(BUILDING_WIDTH, BUILDING_HEIGHT(), 0.1);
    var backMesh = new THREE.Mesh(backGeo, wallMaterial);
    backMesh.position.set(0, BUILDING_HEIGHT() / 2, backWallZ);
    backMesh.renderOrder = 0;
    buildingGroup.add(backMesh);

    // Left wall
    var leftWallX = -BUILDING_WIDTH / 2 + 0.5;
    var leftGeo = new THREE.BoxGeometry(0.1, BUILDING_HEIGHT(), BUILDING_DEPTH);
    var leftMesh = new THREE.Mesh(leftGeo, wallMaterial);
    leftMesh.position.set(leftWallX, BUILDING_HEIGHT() / 2, 0);
    leftMesh.renderOrder = 0;
    buildingGroup.add(leftMesh);

    // Right wall
    var rightWallX = BUILDING_WIDTH / 2 - 0.5;
    var rightGeo = new THREE.BoxGeometry(0.1, BUILDING_HEIGHT(), BUILDING_DEPTH);
    var rightMesh = new THREE.Mesh(rightGeo, wallMaterial);
    rightMesh.position.set(rightWallX, BUILDING_HEIGHT() / 2, 0);
    rightMesh.renderOrder = 0;
    buildingGroup.add(rightMesh);

    // Roof
    var roofY = getFloorY(FLOOR_COUNT - 1) + FLOOR_HEIGHT;
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH);
    var roofMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });
    var roof = new THREE.Mesh(roofGeo, roofMaterial);
    roof.position.set(0, roofY, 0);
    roof.renderOrder = 0;
    buildingGroup.add(roof);

    // Floor number labels
    for (var i = 0; i < FLOOR_COUNT; i++) {
        var floorYPos = getFloorY(i) + 0.5;
        var canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F' + (i + 1), 32, 32);

        var texture = new THREE.CanvasTexture(canvas);
        var spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        var sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(-BUILDING_WIDTH / 2 - 1, floorYPos, -BUILDING_DEPTH / 2 + 0.6);
        sprite.scale.set(1, 1, 1);
        buildingGroup.add(sprite);
    }

    return buildingGroup;
}

function BUILDING_HEIGHT() {
    return (FLOOR_COUNT - 1) * FLOOR_HEIGHT + FLOOR_HEIGHT;
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.position.set(getElevatorCenterX(), getFloorY(0), getElevatorCenterZ());

    var frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    var doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    var backWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Side walls (transparent)
    var sideWallThickness = 0.1;
    var sideWallHeight = FLOOR_HEIGHT - 0.3;
    var halfShaft = SHAFT_WIDTH / 2 - sideWallThickness / 2;

    // Left side wall
    var leftWallGeo = new THREE.BoxGeometry(sideWallThickness, sideWallHeight, SHAFT_DEPTH - sideWallThickness * 2);
    var leftWall = new THREE.Mesh(leftWallGeo, frameMaterial);
    leftWall.position.set(-halfShaft, sideWallHeight / 2, 0);
    elevatorCar.add(leftWall);

    // Right side wall
    var rightWall = new THREE.Mesh(leftWallGeo, frameMaterial);
    rightWall.position.set(halfShaft, sideWallHeight / 2, 0);
    elevatorCar.add(rightWall);

    // Back wall (solid)
    var backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH - sideWallThickness * 2, sideWallHeight, SHAFT_DEPTH - sideWallThickness * 2);
    var backWall = new THREE.Mesh(backWallGeo, backWallMaterial);
    backWall.position.set(0, sideWallHeight / 2, -SHAFT_DEPTH / 2 + sideWallThickness / 2);
    elevatorCar.add(backWall);

    // Floor of elevator
    var elevatorFloorGeo = new THREE.BoxGeometry(SHAFT_WIDTH - sideWallThickness * 2, 0.1, SHAFT_DEPTH - sideWallThickness * 2);
    var elevatorFloor = new THREE.Mesh(elevatorFloorGeo, frameMaterial);
    elevatorFloor.position.set(0, 0.05, 0);
    elevatorCar.add(elevatorFloor);

    // Top frame
    var topFrameGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.15, SHAFT_DEPTH);
    var topFrame = new THREE.Mesh(topFrameGeo, frameMaterial);
    topFrame.position.set(0, FLOOR_HEIGHT - 0.2, 0);
    elevatorCar.add(topFrame);

    // Vertical frame pillars
    var pillarGeo = new THREE.BoxGeometry(0.15, FLOOR_HEIGHT - 0.3, 0.15);
    var pillarPositions = [
        [-SHAFT_WIDTH / 2 + 0.075, (FLOOR_HEIGHT - 0.3) / 2, -SHAFT_DEPTH / 2 + 0.075],
        [SHAFT_WIDTH / 2 - 0.075, (FLOOR_HEIGHT - 0.3) / 2, -SHAFT_DEPTH / 2 + 0.075],
        [-SHAFT_WIDTH / 2 + 0.075, (FLOOR_HEIGHT - 0.3) / 2, SHAFT_DEPTH / 2 - 0.075],
        [SHAFT_WIDTH / 2 - 0.075, (FLOOR_HEIGHT - 0.3) / 2, SHAFT_DEPTH / 2 - 0.075]
    ];

    for (var i = 0; i < pillarPositions.length; i++) {
        var pillar = new THREE.Mesh(pillarGeo, frameMaterial);
        pillar.position.set(pillarPositions[i][0], pillarPositions[i][1], pillarPositions[i][2]);
        elevatorCar.add(pillar);
    }

    // Doors - left and right, meeting at center
    // Each door is half the shaft width
    var doorWidth = SHAFT_WIDTH / 2 - 0.1;
    var doorHeight = FLOOR_HEIGHT - 0.3;
    var doorDepth = SHAFT_DEPTH - 0.2;

    // Left door (slides left when opening)
    var leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.08);
    var leftDoor = new THREE.Mesh(leftDoorGeo, doorMaterial);
    leftDoor.position.set(-doorWidth / 2 - 0.01, doorHeight / 2, SHAFT_DEPTH / 2 - 0.04);
    elevatorCar.add(leftDoor);
    elevatorCar.leftDoor = leftDoor;

    // Right door (slides right when opening)
    var rightDoor = new THREE.Mesh(leftDoorGeo, doorMaterial);
    rightDoor.position.set(doorWidth / 2 + 0.01, doorHeight / 2, SHAFT_DEPTH / 2 - 0.04);
    elevatorCar.add(rightDoor);
    elevatorCar.rightDoor = rightDoor;

    // Store door rest positions
    elevatorCar.leftDoorRestX = -doorWidth / 2 - 0.01;
    elevatorCar.rightDoorRestX = doorWidth / 2 + 0.01;
    elevatorCar.doorTravel = doorWidth - 0.1;

    return elevatorCar;
}

function createPeople() {
    people = [];

    // One person per floor except the empty floor
    var waitingZ = SHAFT_DEPTH / 2 + 2;

    for (var i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;

        var person = createPerson(0x3498db, new THREE.Vector3(0, getFloorY(i), waitingZ));
        person.rotation.y = Math.PI;
        person.userData.state = STATE_IDLE;
        person.userData.targetFloor = i;
        person.userData.currentFloor = i;
        person.userData.boarded = false;
        person.userData.waitingTimer = 0;

        scene.add(person);
        people.push(person);
    }
}

function getPersonOnFloor(floorIndex) {
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.currentFloor === floorIndex && !people[i].userData.boarded) {
            return people[i];
        }
    }
    return null;
}

function selectNextMove() {
    // Pick a random person not on empty floor
    var candidates = [];
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.currentFloor !== emptyFloorIndex) {
            candidates.push(people[i]);
        }
    }

    if (candidates.length === 0) return false;

    var person = candidates[Math.floor(Math.random() * candidates.length)];
    var targetFloor = person.userData.currentFloor;
    person.userData.targetFloor = emptyFloorIndex;
    person.userData.state = STATE_WAITING;
    person.userData.waitingTimer = 0;
    person.userData.boarded = false;

    return true;
}

function animateDoorsOpen(callback) {
    if (doorsOpen || isAnimating) return;
    isAnimating = true;
    doorAnimDirection = 1;
    doorAnimProgress = 0;

    var startLeftX = elevatorCar.leftDoor.position.x;
    var startRightX = elevatorCar.rightDoor.position.x;
    var targetLeftX = elevatorCar.leftDoorRestX - elevatorCar.doorTravel;
    var targetRightX = elevatorCar.rightDoorRestX + elevatorCar.doorTravel;
    var duration = 800 / speedMultiplier;
    var startTime = Date.now();

    function update() {
        var elapsed = Date.now() - startTime;
        var t = Math.min(elapsed / duration, 1);
        t = t * t * (3 - 2 * t); // smoothstep

        elevatorCar.leftDoor.position.x = startLeftX + (targetLeftX - startLeftX) * t;
        elevatorCar.rightDoor.position.x = startRightX + (targetRightX - startRightX) * t;
        doorAnimProgress = t;

        if (t < 1) {
            requestAnimationFrame(update);
        } else {
            doorsOpen = true;
            isAnimating = false;
            if (callback) callback();
        }
    }
    requestAnimationFrame(update);
}

function animateDoorsClose(callback) {
    if (!doorsOpen || isAnimating) return;
    isAnimating = true;
    doorAnimDirection = -1;
    doorAnimProgress = 0;

    var startLeftX = elevatorCar.leftDoor.position.x;
    var startRightX = elevatorCar.rightDoor.position.x;
    var restLeftX = elevatorCar.leftDoorRestX;
    var restRightX = elevatorCar.rightDoorRestX;
    var duration = 800 / speedMultiplier;
    var startTime = Date.now();

    function update() {
        var elapsed = Date.now() - startTime;
        var t = Math.min(elapsed / duration, 1);
        t = t * t * (3 - 2 * t);

        elevatorCar.leftDoor.position.x = startLeftX + (restLeftX - startLeftX) * t;
        elevatorCar.rightDoor.position.x = startRightX + (restRightX - startRightX) * t;
        doorAnimProgress = t;

        if (t < 1) {
            requestAnimationFrame(update);
        } else {
            doorsOpen = false;
            isAnimating = false;
            if (callback) callback();
        }
    }
    requestAnimationFrame(update);
}

function animateElevatorToFloor(floorIndex, callback) {
    if (isAnimating) return;
    isAnimating = true;
    targetFloor = floorIndex;

    var startY = elevatorCar.position.y;
    var targetY = getFloorY(floorIndex);
    var distance = Math.abs(targetY - startY);
    var duration = (distance / ELEVATOR_SPEED) * 1000 / speedMultiplier;
    var startTime = Date.now();

    function update() {
        var elapsed = Date.now() - startTime;
        var t = Math.min(elapsed / duration, 1);
        t = t * t * (3 - 2 * t);

        elevatorCar.position.y = startY + (targetY - startY) * t;

        if (t < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.position.y = targetY;
            currentFloor = floorIndex;
            isAnimating = false;
            if (callback) callback();
        }
    }
    requestAnimationFrame(update);
}

function animatePersonWalk(person, targetZ, callback) {
    if (isAnimating) return;
    isAnimating = true;
    person.userData.isWalking = true;

    var startX = person.position.x;
    var startZ = person.position.z;
    var targetX = 0;
    var targetY = getFloorY(person.userData.currentFloor);
    var targetPos = new THREE.Vector3(targetX, targetY, targetZ);
    var distance = person.position.distanceTo(targetPos);
    var duration = (distance / PERSON_MOVE_SPEED) * 1000 / speedMultiplier;
    var startTime = Date.now();

    function update() {
        var elapsed = Date.now() - startTime;
        var t = Math.min(elapsed / duration, 1);

        person.position.x = startX + (targetX - startX) * t;
        person.position.z = startZ + (targetPos.z - startZ) * t;
        person.position.y = targetY;

        if (t < 1) {
            requestAnimationFrame(update);
        } else {
            person.position.x = targetX;
            person.position.z = targetPos.z;
            person.userData.isWalking = false;
            isAnimating = false;
            if (callback) callback();
        }
    }
    requestAnimationFrame(update);
}

function animateLegs(delta) {
    for (var i = 0; i < people.length; i++) {
        var person = people[i];
        var ud = person.userData;

        if (!ud.leftLeg || !ud.rightLeg) continue;

        if (ud.isWalking) {
            var legAngle = Math.sin(Date.now() * 0.01 * speedMultiplier) * 0.4;
            ud.leftLeg.rotation.x = legAngle;
            ud.rightLeg.rotation.x = -legAngle;
        } else {
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
        }
    }
}

function runSimulationSequence() {
    if (isAnimating) return;

    // Select a person to move
    var moved = selectNextMove();
    if (!moved) return;

    var person = null;
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.targetFloor === emptyFloorIndex && people[i].userData.state === STATE_WAITING) {
            person = people[i];
            break;
        }
    }
    if (!person) return;

    var fromFloor = person.userData.currentFloor;
    person.userData.state = STATE_WALKING_IN;

    // Step 1: Elevator moves to pickup floor
    animateElevatorToFloor(fromFloor, function () {
        // Step 2: Doors open
        animateDoorsOpen(function () {
            // Step 3: Person walks into elevator
            var walkingTargetZ = SHAFT_DEPTH / 2 - 1;
            animatePersonWalk(person, walkingTargetZ, function () {
                // Board person
                person.userData.boarded = true;
                person.userData.state = STATE_IDLE;
                elevatorCar.add(person);
                person.position.set(0, 0, walkingTargetZ);
                person.rotation.y = Math.PI;

                // Step 4: Close doors
                animateDoorsClose(function () {
                    // Step 5: Travel to destination
                    var toFloor = emptyFloorIndex;
                    animateElevatorToFloor(toFloor, function () {
                        // Step 6: Doors open at destination
                        animateDoorsOpen(function () {
                            // Step 7: Person walks out
                            person.userData.state = STATE_WALKING_OUT;
                            var exitZ = SHAFT_DEPTH / 2 + 2;
                            animatePersonWalk(person, exitZ, function () {
                                // Remove from elevator, add to scene
                                elevatorCar.remove(person);
                                scene.add(person);
                                person.userData.boarded = false;
                                person.userData.currentFloor = toFloor;
                                person.userData.targetFloor = emptyFloorIndex;
                                person.userData.state = STATE_IDLE;

                                // Update empty floor
                                emptyFloorIndex = fromFloor;

                                // Step 8: Close doors
                                animateDoorsClose(function () {
                                    // Reset person position for next cycle
                                    person.position.z = SHAFT_DEPTH / 2 + 2;
                                    person.position.y = getFloorY(toFloor);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, (FLOOR_COUNT - 1) * FLOOR_HEIGHT / 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT - 1) * FLOOR_HEIGHT / 2, 0);
    controls.update();

    // Lighting
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 15);
    scene.add(directionalLight);

    var pointLight = new THREE.PointLight(0xffffff, 0.4, 50);
    pointLight.position.set(0, 15, 5);
    scene.add(pointLight);

    // Create building and elevator
    var building = createBuilding();
    scene.add(building);

    createElevator();
    scene.add(elevatorCar);

    // Create people
    createPeople();

    // Speed slider
    var slider = document.getElementById('speed-slider');
    var speedValue = document.getElementById('speed-value');
    if (slider) {
        slider.addEventListener('input', function (e) {
            speedMultiplier = parseInt(e.target.value);
            speedValue.textContent = speedMultiplier + 'x';
        });
    }

    // Handle resize
    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start simulation sequence after a brief delay
    setTimeout(function () {
        runSimulationSequence();
    }, 1000);
}

// Animation loop
var lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);

    var delta = (time - lastTime) / 1000;
    if (delta > 0.1) delta = 0.016;
    lastTime = time;

    // Animate legs
    animateLegs(delta);

    // Check if we can start next move
    if (!isAnimating) {
        var allDone = true;
        for (var i = 0; i < people.length; i++) {
            if (people[i].userData.state === STATE_WALKING_IN || people[i].userData.state === STATE_WALKING_OUT) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            // Check if any person is waiting
            var someoneWaiting = false;
            for (var i = 0; i < people.length; i++) {
                if (people[i].userData.state === STATE_WAITING) {
                    someoneWaiting = true;
                    break;
                }
            }
            if (!someoneWaiting) {
                runSimulationSequence();
            }
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

// Start the simulation
init();
requestAnimationFrame(animate);
