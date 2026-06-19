// elevator.js - Main simulation logic for 3D elevator simulation

// === CONSTANTS (H6) ===
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// === GLOBAL THREE.JS OBJECTS (H5) ===
var scene, camera, renderer, controls;
var elevatorCar, emptyFloorIndex = 0;
var people = [];
var isAnimating = false;

// === DOOR STATE ===
var doorState = 'closed'; // 'open', 'closing', 'opened', 'opening'
var doorsOpenProgress = 0; // 0 = closed, 1 = fully open

// Speed: how much to divide durations by (1-20)
var speedMultiplier = 5;

// === ELEVATOR POSITION TRACKING ===
var elevatorCurrentFloor = 0;
var elevatorTargetFloor = null;
var currentSimulationStep = null; // 'idle', 'boarding', 'moving', 'exiting'

// === DOOR DIMENSIONS (computed from constants for use in animation) ===
var ELEV_WIDTH = SHAFT_WIDTH - 0.4;
var ELEV_DEPTH = SHAFT_DEPTH - 0.4;
var FRAME_THICKNESS = 0.15;
var DOOR_WIDTH = ELEV_WIDTH / 2 - FRAME_THICKNESS;
var TOTAL_HEIGHT = FLOOR_COUNT * FLOOR_HEIGHT;

// Door open distance (how far doors slide outward from closed position)
var DOOR_OPEN_DISTANCE = SHAFT_WIDTH / 2 + 0.5;

// === ANIMATION HELPERS ===
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function animateLinear(current, target, durationMs) {
    var start = Date.now();
    var elapsed = 0;
    var animating = true;

    function step() {
        if (!animating) return false;
        elapsed = Date.now() - start;
        var t = Math.min(elapsed / (durationMs * speedMultiplier), 1);
        current = target * t;
        if (t >= 1) {
            animating = false;
            current = target;
        }
        return animating;
    }

    function getProgress() {
        var t = Math.min(elapsed / (durationMs * speedMultiplier), 1);
        return current / target;
    }

    return { step: step, progress: function() { return getProgress(); }, isAnimating: function() { return animating; } };
}

// === BUILDING CREATION ===
function createBuilding() {
    var floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x9999ff, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });

    // Ground floor - solid
    var groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH);
    var groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.15, 0);
    scene.add(ground);

    // Roof (solid)
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH);
    var roofMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, TOTAL_HEIGHT + 0.15, 0);
    scene.add(roof);

    // Transparent floors (floors 1-5) with shaft cutout - use 4 separate pieces around the shaft
    for (var i = 1; i < FLOOR_COUNT; i++) {
        var floorY = i * FLOOR_HEIGHT;
        var halfBuildingX = BUILDING_WIDTH / 2;
        var halfShaftX = SHAFT_WIDTH / 2;
        var halfBuildingZ = BUILDING_DEPTH / 2;
        var halfShaftZ = SHAFT_DEPTH / 2;

        // Left section of floor (left side of shaft)
        var leftFloorGeo = new THREE.BoxGeometry(halfBuildingX - halfShaftX, 0.15, BUILDING_DEPTH);
        var leftFloor = new THREE.Mesh(leftFloorGeo, floorMat);
        var leftCenterX = -(halfShaftX + (halfBuildingX - halfShaftX) / 2);
        leftFloor.position.set(leftCenterX, floorY, 0);
        scene.add(leftFloor);

        // Right section of floor (right side of shaft)
        var rightGeo = new THREE.BoxGeometry(halfBuildingX - halfShaftX, 0.15, BUILDING_DEPTH);
        var rightFloor = new THREE.Mesh(rightGeo, floorMat);
        var rightCenterX = halfShaftX + (halfBuildingX - halfShaftX) / 2;
        rightFloor.position.set(rightCenterX, floorY, 0);
        scene.add(rightFloor);

        // Front section of floor (in front of shaft along Z)
        var frontGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.15, halfBuildingZ - halfShaftZ);
        var frontFloor = new THREE.Mesh(frontGeo, floorMat);
        var frontCenterZ = halfShaftZ + (halfBuildingZ - halfShaftZ) / 2;
        frontFloor.position.set(0, floorY, frontCenterZ);
        scene.add(frontFloor);

        // Back section of floor (behind shaft along Z)
        var backGeo = new THREE.BoxGeometry(SHAFT_WIDTH, 0.15, halfBuildingZ - halfShaftZ);
        var backFloor = new THREE.Mesh(backGeo, floorMat);
        var backCenterZ = -(halfShaftZ + (halfBuildingZ - halfShaftZ) / 2);
        backFloor.position.set(0, floorY, backCenterZ);
        scene.add(backFloor);
    }

    // === BUILDING WALLS (transparent blue) with shaft opening ===
    var totalHeight = TOTAL_HEIGHT;

    // Front wall - split into pieces around the shaft opening
    // Left part of front wall
    var leftWallGeo = new THREE.BoxGeometry(halfBuildingX - halfShaftX, totalHeight, 0.2);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-(halfShaftX + (halfBuildingX - halfShaftX) / 2), totalHeight / 2, BUILDING_DEPTH / 2);
    scene.add(leftWall);

    // Right part of front wall
    var rightWallGeo = new THREE.BoxGeometry(halfBuildingX - halfShaftX, totalHeight, 0.2);
    var rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set((halfShaftX + (halfBuildingX - halfShaftX) / 2), totalHeight / 2, BUILDING_DEPTH / 2);
    scene.add(rightWall);

    // Top part of front wall (above shaft opening)
    var topWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, totalHeight - SHAFT_DEPTH, 0.2);
    var topWall = new THREE.Mesh(topWallGeo, wallMat);
    topWall.position.set(0, totalHeight - (totalHeight - SHAFT_DEPTH) / 2, BUILDING_DEPTH / 2);
    scene.add(topWall);

    // Bottom part of front wall (below shaft opening)
    var bottomWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, totalHeight - SHAFT_DEPTH, 0.2);
    var bottomWall = new THREE.Mesh(bottomWallGeo, wallMat);
    bottomWall.position.set(0, (totalHeight - SHAFT_DEPTH) / 2, BUILDING_DEPTH / 2);
    scene.add(bottomWall);

    // Back wall (full solid)
    var backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, totalHeight, 0.2);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, totalHeight / 2, -BUILDING_DEPTH / 2);
    scene.add(backWall);

    // Left side wall - split around shaft opening (along Z)
    var leftSideTopGeo = new THREE.BoxGeometry(0.2, totalHeight - SHAFT_DEPTH, halfBuildingZ - halfShaftZ);
    var leftSideTop = new THREE.Mesh(leftSideTopGeo, wallMat);
    leftSideTop.position.set(-BUILDING_WIDTH / 2, totalHeight - (totalHeight - SHAFT_DEPTH) / 2, halfShaftZ + (halfBuildingZ - halfShaftZ) / 2);
    scene.add(leftSideTop);

    var leftSideBotGeo = new THREE.BoxGeometry(0.2, totalHeight - SHAFT_DEPTH, halfBuildingZ - halfShaftZ);
    var leftSideBot = new THREE.Mesh(leftSideBotGeo, wallMat);
    leftSideBot.position.set(-BUILDING_WIDTH / 2, (totalHeight - SHAFT_DEPTH) / 2, halfShaftZ + (halfBuildingZ - halfShaftZ) / 2);
    scene.add(leftSideBot);

    var leftSideFrontGeo = new THREE.BoxGeometry(0.2, SHAFT_DEPTH, halfShaftZ);
    var leftSideFront = new THREE.Mesh(leftSideFrontGeo, wallMat);
    leftSideFront.position.set(-BUILDING_WIDTH / 2, totalHeight / 2, -(halfShaftZ) / 2);
    scene.add(leftSideFront);

    // Right side wall - split around shaft opening (along Z)
    var rightSideTopGeo = new THREE.BoxGeometry(0.2, totalHeight - SHAFT_DEPTH, halfBuildingZ - halfShaftZ);
    var rightSideTop = new THREE.Mesh(rightSideTopGeo, wallMat);
    rightSideTop.position.set(BUILDING_WIDTH / 2, totalHeight - (totalHeight - SHAFT_DEPTH) / 2, halfShaftZ + (halfBuildingZ - halfShaftZ) / 2);
    scene.add(rightSideTop);

    var rightSideBotGeo = new THREE.BoxGeometry(0.2, totalHeight - SHAFT_DEPTH, halfBuildingZ - halfShaftZ);
    var rightSideBot = new THREE.Mesh(rightSideBotGeo, wallMat);
    rightSideBot.position.set(BUILDING_WIDTH / 2, (totalHeight - SHAFT_DEPTH) / 2, halfShaftZ + (halfBuildingZ - halfShaftZ) / 2);
    scene.add(rightSideBot);

    var rightSideFrontGeo = new THREE.BoxGeometry(0.2, SHAFT_DEPTH, halfShaftZ);
    var rightSideFront = new THREE.Mesh(rightSideFrontGeo, wallMat);
    rightSideFront.position.set(BUILDING_WIDTH / 2, totalHeight / 2, -(halfShaftZ) / 2);
    scene.add(rightSideFront);

    // Floor number labels (simple colored blocks to indicate floor levels on the front)
    for (var i = 0; i < FLOOR_COUNT; i++) {
        var labelGeo = new THREE.BoxGeometry(0.3, 0.5, 0.1);
        var labelMat2 = new THREE.MeshStandardMaterial({ color: 0x3498db });
        var label = new THREE.Mesh(labelGeo, labelMat2);
        label.position.set(BUILDING_WIDTH / 2 + 0.3, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2 - 0.5);
        scene.add(label);
    }

    // Shaft interior walls (dark to show the shaft is empty)
    var shaftMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    for (var i = 0; i < FLOOR_COUNT; i++) {
        var fY = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
        // Shaft sides along X
        var sGeoX = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT - 0.15, SHAFT_DEPTH);
        var shaftLeftSide = new THREE.Mesh(sGeoX, shaftMat);
        shaftLeftSide.position.set(-SHAFT_WIDTH / 2 + 0.05, fY, 0);
        scene.add(shaftLeftSide);

        var shaftRightSide = new THREE.Mesh(sGeoX.clone(), shaftMat);
        shaftRightSide.position.set(SHAFT_WIDTH / 2 - 0.05, fY, 0);
        scene.add(shaftRightSide);
    }
}

// === ELEVATOR CREATION (H5: elevatorCar with leftDoor and rightDoor) ===
function createElevator() {
    // Create the car group first before adding any children (H5)
    elevatorCar = new THREE.Group();

    var frameMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    var doorMat = new THREE.MeshStandardMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    var sideWallMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });

    // === DOORS (on the front side of the elevator - positive Z) ===
    var doorHeight = TOTAL_HEIGHT;

    // Left door - closed state: positioned to meet at center from left side
    var leftDoorGeo = new THREE.BoxGeometry(DOOR_WIDTH, doorHeight, FRAME_THICKNESS);
    var leftDoor = new THREE.Mesh(leftDoorGeo, doorMat);
    elevatorCar.add(leftDoor);
    elevatorCar.leftDoor = leftDoor; // H5: store reference

    // Right door - closed state: positioned to meet at center from right side
    var rightDoorGeo = new THREE.BoxGeometry(DOOR_WIDTH, doorHeight, FRAME_THICKNESS);
    var rightDoor = new THREE.Mesh(rightDoorGeo, doorMat);
    elevatorCar.add(rightDoor);
    elevatorCar.rightDoor = rightDoor; // H5: store reference

    // Position doors in the closed state (meeting at center)
    leftDoor.position.set(-DOOR_WIDTH / 2 - FRAME_THICKNESS / 4, TOTAL_HEIGHT / 2, ELEV_DEPTH / 2);
    rightDoor.position.set(DOOR_WIDTH / 2 + FRAME_THICKNESS / 4, TOTAL_HEIGHT / 2, ELEV_DEPTH / 2);

    // Elevator bottom plate (solid)
    var elevBottomGeo = new THREE.BoxGeometry(ELEV_WIDTH - FRAME_THICKNESS * 2, 0.15, ELEV_DEPTH - FRAME_THICKNESS * 2);
    var elevBottom = new THREE.Mesh(elevBottomGeo, frameMat);
    elevBottom.position.y = 0;
    elevatorCar.add(elevBottom);

    // Elevator top plate (solid)
    var elevTop = new THREE.Mesh(elevBottom.clone(), frameMat);
    elevTop.position.y = TOTAL_HEIGHT - FRAME_THICKNESS * 2;
    elevatorCar.add(elevTop);

    // Left wall (transparent)
    var sideWallGeo = new THREE.BoxGeometry(FRAME_THICKNESS, TOTAL_HEIGHT - FRAME_THICKNESS * 2, ELEV_DEPTH - FRAME_THICKNESS * 2);
    var leftSide = new THREE.Mesh(sideWallGeo, sideWallMat);
    leftSide.position.set(-ELEV_WIDTH / 2 + FRAME_THICKNESS, (TOTAL_HEIGHT - FRAME_THICKNESS * 2) / 2, 0);
    elevatorCar.add(leftSide);

    // Right wall (transparent)
    var rightSide = new THREE.Mesh(sideWallGeo.clone(), sideWallMat);
    rightSide.position.set(ELEV_WIDTH / 2 - FRAME_THICKNESS, (TOTAL_HEIGHT - FRAME_THICKNESS * 2) / 2, 0);
    elevatorCar.add(rightSide);

    // Back wall (solid)
    var backWallGeo = new THREE.BoxGeometry(ELEV_WIDTH - FRAME_THICKNESS * 3, TOTAL_HEIGHT - FRAME_THICKNESS * 2, FRAME_THICKNESS);
    var backWall = new THREE.Mesh(backWallGeo, frameMat);
    backWall.position.set(0, (TOTAL_HEIGHT - FRAME_THICKNESS * 2) / 2, -ELEV_DEPTH / 2 + FRAME_THICKNESS);
    elevatorCar.add(backWall);

    // Elevator cables (visual)
    var cableMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (var i = 0; i < 4; i++) {
        var cableGeo = new THREE.BoxGeometry(0.05, TOTAL_HEIGHT + 10, 0.05);
        var cable = new THREE.Mesh(cableGeo, cableMat);
        var cx = -ELEV_WIDTH / 2 + (i % 2 === 0 ? FRAME_THICKNESS : ELEV_WIDTH - FRAME_THICKNESS);
        var cz = -(ELEV_DEPTH / 4) + Math.floor(i / 2) * (ELEV_DEPTH / 2);
        cable.position.set(cx, TOTAL_HEIGHT + (TOTAL_HEIGHT + 10) / 2, cz);
        elevatorCar.add(cable);
    }

    // Set renderOrder for transparency (H7)
    elevatorCar.renderOrder = 1;
}

// === DOOR ANIMATION ===
function animateDoorsOpen(callback) {
    doorState = 'opening';
    doorsOpenProgress = 0;

    var animDuration = 600 / speedMultiplier; // Time in ms for full open
    var start = Date.now();

    function animateLoop() {
        if (doorState !== 'opening') return;
        var elapsed = Date.now() - start;
        var t = Math.min(elapsed / animDuration, 1);
        var easedT = easeInOut(t);

        // Doors move outward from center - apply to meshes
        elevatorCar.leftDoor.position.x = -DOOR_WIDTH / 2 + easedT * DOOR_OPEN_DISTANCE;
        elevatorCar.rightDoor.position.x = DOOR_WIDTH / 2 - easedT * DOOR_OPEN_DISTANCE;

        if (t >= 1) {
            doorState = 'opened';
            doorsOpenProgress = 1;
            leftDoorX = DOOR_OPEN_DISTANCE;
            rightDoorX = DOOR_OPEN_DISTANCE;
            // Callback after brief delay for realism (H7 spec: 300ms between steps)
            setTimeout(callback, 200 / speedMultiplier);
            return;
        }

        requestAnimationFrame(animateLoop);
    }
    animateLoop();
}

function animateDoorsClose(callback) {
    doorState = 'closing';

    var animDuration = 600 / speedMultiplier; // Time in ms for full close
    var start = Date.now();

    function animateLoop() {
        if (doorState !== 'closing') return;
        var elapsed = Date.now() - start;
        var t = Math.min(elapsed / animDuration, 1);
        var easedT = easeInOut(t);

        // Doors move inward toward center - apply to meshes
        elevatorCar.leftDoor.position.x = DOOR_OPEN_DISTANCE * (1 - easedT) - DOOR_WIDTH / 2 + FRAME_THICKNESS / 4;
        elevatorCar.rightDoor.position.x = DOOR_OPEN_DISTANCE * (1 - easedT) + DOOR_WIDTH / 2 - FRAME_THICKNESS / 4;

        if (t >= 1) {
            doorState = 'closed';
            doorsOpenProgress = 0;
            // Position doors closed (meeting at center)
            leftDoorX = -DOOR_WIDTH / 2 + FRAME_THICKNESS / 4;
            rightDoorX = DOOR_WIDTH / 2 - FRAME_THICKNESS / 4;
            // Callback after brief delay for realism (H7 spec: 300ms between steps)
            setTimeout(callback, 200 / speedMultiplier);
            return;
        }

        requestAnimationFrame(animateLoop);
    }
    animateLoop();
}

// Global variables to track door positions during animation
var leftDoorX = -DOOR_WIDTH / 2 + FRAME_THICKNESS / 4;
var rightDoorX = DOOR_WIDTH / 2 - FRAME_THICKNESS / 4;

// === PERSON POSITIONING HELPERS ===
function getPersonFloorY(person) {
    if (elevatorCar.contains(person)) {
        // Person is inside the elevator car at local y=0, which corresponds to world floor level
        return elevatorCurrentFloor * FLOOR_HEIGHT;
    } else {
        // Find which floor based on person's world Y position
        var pPos = new THREE.Vector3();
        person.getWorldPosition(pPos);
        for (var i = 0; i < FLOOR_COUNT; i++) {
            if (i === emptyFloorIndex) continue;
            if (Math.abs(pPos.y - i * FLOOR_HEIGHT) < 1.5) {
                return i * FLOOR_HEIGHT;
            }
        }
    }
    return 0; // Default to ground floor
}

// Where people wait: in front of elevator doors (positive Z), facing the elevator
function getWaitingZPosition() {
    return ELEV_DEPTH / 2 + 1.5; // In front of the door opening
}

// === GLOBAL VARIABLES FOR WALKING TRACKING ===
var walkStartTime = 0;

function startWalking() {
    walkStartTime = Date.now();
}

function isWalkComplete(walkDurationSeconds) {
    var elapsed = (Date.now() - walkStartTime) / 1000; // seconds
    return elapsed >= walkDurationSeconds;
}

function getWalkProgress(walkDurationSeconds) {
    var elapsed = Math.min((Date.now() - walkStartTime) / 1000, walkDurationSeconds);
    return elapsed / walkDurationSeconds;
}

// === BOARDING SEQUENCE (H8: use .attach() for reparenting) ===
function sequenceBoard(personIndex, callback) {
    var person = people[personIndex];
    if (!person || !isAnimating) return;

    function step1_DoorsOpen() {
        animateDoorsOpen(step2_WalkForward);
    }

    function step2_WalkForward() {
        // Make person walk toward elevator (forward through doors, decreasing Z from waiting position)
        if (!person.userData.leftLeg || !person.userData.rightLeg) return;
        person.userData.isWalking = true;

        var startZ = getWaitingZPosition();
        var targetZ = ELEV_DEPTH / 2 - 0.3; // Just inside the door opening
        var walkDurationSeconds = Math.abs(targetZ - startZ) / PERSON_MOVE_SPEED;
        startWalking();

        function animateWalk() {
            if (person.userData.isWalking && isWalkComplete(walkDurationSeconds)) {
                person.userData.isWalking = false;
                person.position.z = targetZ;
                // Now board the elevator: reparent using .attach() (H8)
                elevatorCar.attach(person);
                animateDoorsClose(step4_BeStill);
            } else if (!person.userData.isWalking) {
                return;
            } else {
                var t = getWalkProgress(walkDurationSeconds);
                person.position.z = startZ + (targetZ - startZ) * t;
                requestAnimationFrame(animateWalk);
            }
        }

        animateWalk();
    }

    function step4_BeStill() {
        callback(null, { type: 'boarded' });
    }

    step1_DoorsOpen();
}

// === EXITING SEQUENCE (H8: use scene.attach() for reparenting) ===
function sequenceExit(personIndex, callback) {
    var person = people[personIndex];
    if (!person || !isAnimating) return;

    function step1_DoorsOpen() {
        animateDoorsOpen(step2_WalkForward);
    }

    function step2_WalkForward() {
        // Make person walk forward out of elevator (increasing Z from inside to outside)
        if (!person.userData.leftLeg || !person.userData.rightLeg) return;
        person.userData.isWalking = true;

        var startZ = ELEV_DEPTH / 2 - 0.3; // Inside the door
        var targetZ = getWaitingZPosition(); // Outside in front of elevator
        var walkDurationSeconds = Math.abs(targetZ - startZ) / PERSON_MOVE_SPEED;
        startWalking();

        function animateWalk() {
            if (person.userData.isWalking && isWalkComplete(walkDurationSeconds)) {
                person.userData.isWalking = false;
                person.position.z = targetZ;
                // Now exit the elevator: reparent using .attach() (H8)
                scene.attach(person);
                animateDoorsClose(step4_BeStill);
            } else if (!person.userData.isWalking) {
                return;
            } else {
                var t = getWalkProgress(walkDurationSeconds);
                person.position.z = startZ + (targetZ - startZ) * t;
                requestAnimationFrame(animateWalk);
            }
        }

        animateWalk();
    }

    function step4_BeStill() {
        callback(null, { type: 'exited' });
    }

    step1_DoorsOpen();
}

// === ELEVATOR MOVEMENT ===
function moveElevatorToFloor(targetFloor, callback) {
    if (targetFloor < 0 || targetFloor >= FLOOR_COUNT) return;

    elevatorTargetFloor = targetFloor;
    var startY = elevatorCurrentFloor * FLOOR_HEIGHT;
    var endY = targetFloor * FLOOR_HEIGHT;
    var durationMs = Math.abs(endY - startY) / ELEVATOR_SPEED; // seconds converted to ms

    function animateMove() {
        var elapsed = Date.now();
        if (elapsed - startMoveTime >= durationMs * speedMultiplier) {
            elevatorCar.position.y = endY;
            elevatorCurrentFloor = targetFloor;
            callback(null, { type: 'arrived' });
            return;
        }

        // Linear interpolation between startY and endY
        var t = Math.min((elapsed - startMoveTime) / (durationMs * speedMultiplier), 1);
        elevatorCar.position.y = startY + (endY - startY) * t;
        requestAnimationFrame(animateMove);
    }

    var startMoveTime = Date.now();
    animateMove();
}

// === SIMULATION LOGIC ===
function pickNextDestination() {
    // Pick a random person who is NOT in the empty floor to move
    var availablePeople = [];
    for (var i = 0; i < people.length; i++) {
        if (!elevatorCar.contains(people[i]) && i !== emptyFloorIndex) {
            availablePeople.push(i);
        }
    }

    if (availablePeople.length === 0) return null;

    var personIndex = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    var destinationFloor = emptyFloorIndex;

    // Determine which floor the person is currently on
    var startFloor = getPersonCurrentFloor(personIndex);

    return {
        person: personIndex,
        startFloor: startFloor,
        destination: destinationFloor
    };
}

function getPersonCurrentFloor(personIndex) {
    var person = people[personIndex];
    if (elevatorCar.contains(person)) {
        return elevatorCurrentFloor;
    } else {
        for (var i = 0; i < FLOOR_COUNT; i++) {
            if (i === emptyFloorIndex) continue;
            var pPos = new THREE.Vector3();
            person.getWorldPosition(pPos);
            if (Math.abs(pPos.y - i * FLOOR_HEIGHT) < 1.5) {
                return i;
            }
        }
    }
    return elevatorCurrentFloor;
}

// === MAIN SIMULATION STATE MACHINE ===
var currentPerson = null;
var personDestinationFloor = null;

function startSimulationSequence() {
    if (isAnimating) return; // Already animating

    var next = pickNextDestination();
    if (!next) return;

    currentPerson = next.person;
    personDestinationFloor = next.destination;

    // Elevator needs to be at the pickup floor before boarding can start
    if (elevatorTargetFloor === null || elevatorCar.position.y !== next.startFloor * FLOOR_HEIGHT + 0.15) {
        // Move elevator to pickup floor first, then board
        currentSimulationStep = 'moving';
        moveElevatorToFloor(next.startFloor, function(err, data) {
            if (data.type === 'arrived') {
                startBoardingSequence();
            }
        });
    } else {
        // Elevator is already at the pickup floor
        startBoardingSequence();
    }
}

function startBoardingSequence() {
    currentSimulationStep = 'boarding';
    sequenceBoard(currentPerson, function(err, data) {
        if (data.type === 'boarded') {
            // Now move elevator to destination floor
            isAnimating = true;
            currentSimulationStep = 'moving';
            moveElevatorToFloor(personDestinationFloor, function(err, data) {
                startExitingSequence();
            });
        } else if (err) {
            console.error('Boarding failed:', err);
        }
    });
}

function startExitingSequence() {
    currentSimulationStep = 'exiting';
    sequenceExit(currentPerson, function(err, data) {
        if (data.type === 'exited') {
            // Update empty floor and pick next person
            emptyFloorIndex = currentPerson;
            currentPerson = null;
            isAnimating = false;
            currentSimulationStep = 'idle';

            // Move to new random destination after a pause
            setTimeout(function() {
                startSimulationSequence();
            }, 800 / speedMultiplier);
        } else if (err) {
            console.error('Exiting failed:', err);
        }
    });
}

// === CAMERA SETUP ===
function createCamera() {
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(30, 30, 30);

    // Look at building center for better framing (H9)
    var centerX = 0;
    var centerY = TOTAL_HEIGHT / 2;
    var centerZ = 0;
    camera.lookAt(new THREE.Vector3(centerX, centerY, centerZ));

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    return camera;
}

// === ANIMATION LOOP ===
var clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);

    var delta = clock.getDelta();

    // Update controls
    if (controls) controls.update();

    // Animate person walking legs each frame
    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (!p.userData || !p.userData.leftLeg || !p.userData.rightLeg) continue;

        if (p.userData.isWalking) {
            // Walking: alternate leg swing using sine wave on X-axis (H7)
            p.userData.walkTime += delta * 5;
            p.userData.leftLeg.rotation.x = Math.sin(p.userData.walkTime * 3) * 0.4;
            p.userData.rightLeg.rotation.x = -Math.sin(p.userData.walkTime * 3 + Math.PI) * 0.4;
        } else {
            // Standing: reset legs to normal position (smoothly, no snap)
            p.userData.leftLeg.rotation.x *= 0.95;
            p.userData.rightLeg.rotation.x *= 0.95;
        }

        // Update person's world Y if inside elevator - should be handled by parent via .attach() (H8)
        // But ensure the person's local Y stays at ~0 inside the car so they don't sink into floor
    }

    renderer.render(scene, camera);
}

// === INITIALIZATION (H3: top-level call to start on page load) ===
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Create renderer with transparency support (H7)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // Important for transparency ordering (H7)
    document.body.appendChild(renderer.domElement);

    // Add speed slider control (1x-20x as specified in H12)
    var speedControlDiv = document.createElement('div');
    speedControlDiv.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999;background:#2a2a4e;padding:15px;border-radius:8px;color:white;font-family:sans-serif;';
    var sliderLabel = document.createElement('span');
    sliderLabel.textContent = 'Speed: ';
    speedControlDiv.appendChild(sliderLabel);

    var speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '1';
    speedSlider.max = '20';
    speedSlider.value = '5';
    speedSlider.style.cssText = 'width:120px;vertical-align:middle;margin-right:8px;cursor:pointer;';
    speedControlDiv.appendChild(speedSlider);

    var speedValue = document.createElement('span');
    speedValue.textContent = '5x';
    speedValue.id = 'speedDisplay';
    speedControlDiv.appendChild(speedValue);

    speedSlider.addEventListener('input', function() {
        speedMultiplier = parseInt(this.value, 10);
        document.getElementById('speedDisplay').textContent = this.value + 'x';
    });

    document.body.appendChild(speedControlDiv);

    // Create camera (H9)
    createCamera();

    // Add lights for visibility through transparent walls
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 15);
    scene.add(directionalLight);

    // Create building and elevator
    createBuilding();
    createElevator();

    // Position elevator at ground floor (floor 0)
    elevatorCar.position.y = 0;

    // Add people on each occupied floor (one person per non-empty floor, facing elevator)
    var xSpread = BUILDING_WIDTH * 0.5; // Width spread for people along X axis
    for (var i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloorIndex) continue;

        var person = createPerson();
        var zPos = getWaitingZPosition();

        // Spread people horizontally across the front of the building, avoiding shaft area
        var xPos = -xSpread / 2 + ((i + 0.5) / FLOOR_COUNT) * xSpread;

        person.position.set(xPos, i * FLOOR_HEIGHT, zPos);

        // Face the elevator (rotate toward the building center at Z=0 from positive Z)
        person.rotation.y = Math.PI; // Face negative Z direction = face the building

        scene.add(person);
        people.push(person);
    }

    // Set renderOrder for transparency on all non-elevator objects (H7)
    var allObjects = scene.children;
    for (var j = 0; j < allObjects.length; j++) {
        if (!elevatorCar.contains(allObjects[j])) {
            allObjects[j].renderOrder = 0;
        }
    }

    // Start animation loop AND simulation sequence (H3)
    animate();

    // Start the first simulation after a brief delay so user can see the scene
    setTimeout(function() {
        startSimulationSequence();
    }, 1500 / speedMultiplier);
}

// === TOP-LEVEL CALL TO START SIMULATION ON PAGE LOAD (H3) ===
window.addEventListener('DOMContentLoaded', function() {
    // Wait for Three.js to be ready before calling init()
    if (typeof THREE !== 'undefined') {
        init();
    } else {
        console.error('Three.js not loaded!');
    }
});
