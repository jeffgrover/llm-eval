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
let emptyFloor = 0;
let animating = false;
let speedMultiplier = 1;
let doorState = 'closed';
let currentElevatorFloor = 0;

window.addEventListener('DOMContentLoaded', function () {
    init();
});

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    controls.update();

    // Speed slider
    var slider = document.getElementById('speed-slider');
    var speedVal = document.getElementById('speed-value');
    slider.addEventListener('input', function () {
        speedMultiplier = parseInt(slider.value);
        speedVal.textContent = speedMultiplier + 'x';
    });

    // Lighting
    var ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 30, 10);
    scene.add(directionalLight);

    var directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-10, 20, -10);
    scene.add(directionalLight2);

    // Build the building
    createBuilding();

    // Build the elevator
    elevatorCar = createElevator();
    scene.add(elevatorCar);

    // Create people on each floor except floor 0 (which is empty)
    for (var i = 1; i < FLOOR_COUNT; i++) {
        var person = createPerson('#3498db');
        person.position.set(0, i * FLOOR_HEIGHT, BUILDING_DEPTH / 2 - 2);
        person.rotation.y = Math.PI;
        person.userData.targetFloor = i;
        scene.add(person);
        people.push(person);
    }

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();

    // Start first simulation cycle after a brief delay
    setTimeout(function () {
        startSimulationCycle();
    }, 1000);
}

function createBuilding() {
    var buildingGroup = new THREE.Group();

    // Floor material (transparent)
    var floorMat = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Wall material (semi-transparent)
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Ground floor (solid)
    var groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, 0.1, 0);
    ground.renderOrder = 0;
    buildingGroup.add(ground);

    // Intermediate floors (transparent, with shaft cutout)
    for (var i = 1; i < FLOOR_COUNT; i++) {
        var floorY = i * FLOOR_HEIGHT;

        // Create floor with shaft cutout using 4 sections
        var halfW = BUILDING_WIDTH / 2;
        var halfD = BUILDING_DEPTH / 2;
        var shaftHalfW = SHAFT_WIDTH / 2;
        var shaftHalfD = SHAFT_DEPTH / 2;

        // Front section (positive Z)
        var frontW = halfD - shaftHalfD;
        var frontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.15, frontW);
        var front = new THREE.Mesh(frontGeo, floorMat);
        front.position.set(0, floorY, shaftHalfD + frontW / 2);
        front.renderOrder = 0;
        buildingGroup.add(front);

        // Back section (negative Z)
        var backGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.15, frontW);
        var back = new THREE.Mesh(backGeo, floorMat);
        back.position.set(0, floorY, -shaftHalfD - frontW / 2);
        back.renderOrder = 0;
        buildingGroup.add(back);

        // Left section (negative X)
        var sideLen = halfW - shaftHalfW;
        var sideGeo = new THREE.BoxGeometry(sideLen, 0.15, SHAFT_DEPTH);
        var left = new THREE.Mesh(sideGeo, floorMat);
        left.position.set(-shaftHalfW - sideLen / 2, floorY, 0);
        left.renderOrder = 0;
        buildingGroup.add(left);

        // Right section (positive X)
        var right = new THREE.Mesh(sideGeo, floorMat);
        right.position.set(shaftHalfW + sideLen / 2, floorY, 0);
        right.renderOrder = 0;
        buildingGroup.add(right);
    }

    // Roof (solid)
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT + 0.1, 0);
    roof.renderOrder = 0;
    buildingGroup.add(roof);

    // Walls (4 walls with shaft opening)
    // Front wall
    var frontWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, 0.2);
    var frontWall = new THREE.Mesh(frontWallGeo, wallMat);
    frontWall.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
    frontWall.renderOrder = 0;
    buildingGroup.add(frontWall);

    // Back wall
    var backWall = new THREE.Mesh(frontWallGeo, wallMat);
    backWall.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    backWall.renderOrder = 0;
    buildingGroup.add(backWall);

    // Left wall
    var sideWallGeo = new THREE.BoxGeometry(0.2, FLOOR_COUNT * FLOOR_HEIGHT, BUILDING_DEPTH);
    var leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    leftWall.renderOrder = 0;
    buildingGroup.add(leftWall);

    // Right wall
    var rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    rightWall.renderOrder = 0;
    buildingGroup.add(rightWall);

    // Shaft walls (inside the elevator shaft)
    var shaftWallMat = new THREE.MeshLambertMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    var shaftSideGeo = new THREE.BoxGeometry(0.1, FLOOR_COUNT * FLOOR_HEIGHT, SHAFT_DEPTH);
    var shaftLeft = new THREE.Mesh(shaftSideGeo, shaftWallMat);
    shaftLeft.position.set(-SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(shaftLeft);

    var shaftRight = new THREE.Mesh(shaftSideGeo, shaftWallMat);
    shaftRight.position.set(SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(shaftRight);

    scene.add(buildingGroup);
}

function createElevator() {
    var car = new THREE.Group();

    // Elevator frame material
    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Door material
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Floor of elevator car
    var carFloorGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, 0.1, SHAFT_DEPTH - 0.4);
    var carFloorMat = new THREE.MeshLambertMaterial({
        color: 0xdddd00,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    var carFloor = new THREE.Mesh(carFloorGeo, carFloorMat);
    carFloor.position.set(0, 0.05, 0);
    carFloor.renderOrder = 1;
    car.add(carFloor);

    // Back wall (solid)
    var backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, 2.8, 0.15);
    var backWallMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    var backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 1.5, -(SHAFT_DEPTH - 0.4) / 2);
    backWall.renderOrder = 1;
    car.add(backWall);

    // Ceiling
    var ceilingGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, 0.1, SHAFT_DEPTH - 0.4);
    var ceiling = new THREE.Mesh(ceilingGeo, frameMat);
    ceiling.position.set(0, 2.8, 0);
    ceiling.renderOrder = 1;
    car.add(ceiling);

    // Side walls (transparent)
    var sideWallGeo = new THREE.BoxGeometry(0.15, 2.8, SHAFT_DEPTH - 0.4);
    var sideWallMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    var leftWall = new THREE.Mesh(sideWallGeo, sideWallMat);
    leftWall.position.set(-(SHAFT_WIDTH - 0.4) / 2, 1.5, 0);
    leftWall.renderOrder = 1;
    car.add(leftWall);

    var rightWall = new THREE.Mesh(sideWallGeo, sideWallMat);
    rightWall.position.set((SHAFT_WIDTH - 0.4) / 2, 1.5, 0);
    rightWall.renderOrder = 1;
    car.add(rightWall);

    // Doors (left and right halves)
    var doorHeight = 2.2;
    var doorHalfWidth = (SHAFT_WIDTH - 0.4) / 2;
    var doorGeo = new THREE.BoxGeometry(doorHalfWidth, doorHeight, 0.1);

    var leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-doorHalfWidth / 2, doorHeight / 2 + 0.2, (SHAFT_DEPTH - 0.4) / 2);
    leftDoor.renderOrder = 1;
    car.add(leftDoor);
    car.leftDoor = leftDoor;

    var rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(doorHalfWidth / 2, doorHeight / 2 + 0.2, (SHAFT_DEPTH - 0.4) / 2);
    rightDoor.renderOrder = 1;
    car.add(rightDoor);
    car.rightDoor = rightDoor;

    // Position elevator at ground floor
    car.position.set(0, 0, 0);

    return car;
}

function animate() {
    requestAnimationFrame(animate);

    var delta = 0.016 * speedMultiplier;
    var time = performance.now() * 0.001 * speedMultiplier;

    // Walking animation for all people
    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.userData.isWalking && p.userData.leftLeg && p.userData.rightLeg) {
            var swing = Math.sin(time * 8) * 0.5;
            p.userData.leftLeg.rotation.x = swing;
            p.userData.rightLeg.rotation.x = -swing;
        } else if (p.userData.leftLeg && p.userData.rightLeg) {
            p.userData.leftLeg.rotation.x = 0;
            p.userData.rightLeg.rotation.x = 0;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startSimulationCycle() {
    if (animating) return;

    // Find a person and an empty floor
    if (people.length === 0) return;

    // Pick a random person
    var personIdx = Math.floor(Math.random() * people.length);
    var person = people[personIdx];
    var pickupFloor = person.userData.targetFloor;

    // Pick a random destination floor (not the pickup floor, not the empty floor)
    var destFloor = emptyFloor;

    // If pickup floor equals empty floor, pick another person
    if (pickupFloor === emptyFloor) {
        personIdx = (personIdx + 1) % people.length;
        person = people[personIdx];
        pickupFloor = person.userData.targetFloor;
    }

    // Run the full animation sequence
    animating = true;

    // Step 1: Move elevator to pickup floor
    moveElevatorToFloor(pickupFloor, function () {
        // Step 2: Open doors
        openDoors(function () {
            // Step 3: Person walks into elevator
            personBoardElevator(person, function () {
                // Step 4: Close doors
                closeDoors(function () {
                    // Step 5: Move elevator to destination floor
                    moveElevatorToFloor(destFloor, function () {
                        // Step 6: Open doors at destination
                        openDoors(function () {
                            // Step 7: Person exits elevator
                            personExitElevator(person, destFloor, function () {
                                // Step 8: Close doors
                                closeDoors(function () {
                                    // Update state
                                    person.userData.targetFloor = destFloor;

                                    // The old pickup floor is now empty
                                    emptyFloor = pickupFloor;

                                    animating = false;

                                    // Start next cycle after a delay
                                    setTimeout(function () {
                                        startSimulationCycle();
                                    }, 1500);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function moveElevatorToFloor(floor, callback) {
    var targetY = floor * FLOOR_HEIGHT;
    var startTime = performance.now();
    var startY = elevatorCar.position.y;
    var distance = Math.abs(targetY - startY);
    var duration = distance / ELEVATOR_SPEED;

    currentElevatorFloor = floor;

    function step() {
        var elapsed = (performance.now() - startTime) / 1000 * speedMultiplier;
        var t = Math.min(elapsed / duration, 1);
        elevatorCar.position.y = startY + (targetY - startY) * t;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            elevatorCar.position.y = targetY;
            if (callback) callback();
        }
    }

    step();
}

function openDoors(callback) {
    if (doorState === 'open') {
        if (callback) callback();
        return;
    }
    doorState = 'opening';

    var startTime = performance.now();
    var doorHalfWidth = (SHAFT_WIDTH - 0.4) / 2;
    var openDistance = doorHalfWidth * 0.8;
    var duration = 0.5;

    var leftStartX = elevatorCar.leftDoor.position.x;
    var rightStartX = elevatorCar.rightDoor.position.x;

    function step() {
        var elapsed = (performance.now() - startTime) / 1000 * speedMultiplier;
        var t = Math.min(elapsed / duration, 1);

        elevatorCar.leftDoor.position.x = leftStartX - openDistance * t;
        elevatorCar.rightDoor.position.x = rightStartX + openDistance * t;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            doorState = 'open';
            if (callback) callback();
        }
    }

    step();
}

function closeDoors(callback) {
    if (doorState === 'closed') {
        if (callback) callback();
        return;
    }
    doorState = 'closing';

    var startTime = performance.now();
    var doorHalfWidth = (SHAFT_WIDTH - 0.4) / 2;
    var openDistance = doorHalfWidth * 0.8;
    var duration = 0.5;

    var leftClosedX = -doorHalfWidth / 2;
    var rightClosedX = doorHalfWidth / 2;
    var leftOpenX = leftClosedX - openDistance;
    var rightOpenX = rightClosedX + openDistance;

    function step() {
        var elapsed = (performance.now() - startTime) / 1000 * speedMultiplier;
        var t = Math.min(elapsed / duration, 1);

        elevatorCar.leftDoor.position.x = leftOpenX + (leftClosedX - leftOpenX) * t;
        elevatorCar.rightDoor.position.x = rightOpenX + (rightClosedX - rightOpenX) * t;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            doorState = 'closed';
            if (callback) callback();
        }
    }

    step();
}

function personBoardElevator(person, callback) {
    // Person is currently in front of elevator (positive Z), facing elevator (rotation.y = PI)
    // They need to walk forward (negative Z direction in world space) into the elevator

    // Get the world position of the elevator entrance (inside the car, at floor level)
    var elevatorWorldPos = new THREE.Vector3();
    elevatorCar.getWorldPosition(elevatorWorldPos);

    var targetPos = new THREE.Vector3(
        person.position.x,
        elevatorWorldPos.y + 0,
        elevatorWorldPos.z - 1
    );

    // Set walking
    person.userData.isWalking = true;

    var startTime = performance.now();
    var startPos = person.position.clone();
    var distance = startPos.distanceTo(targetPos);
    var duration = distance / PERSON_MOVE_SPEED;

    function step() {
        var elapsed = (performance.now() - startTime) / 1000 * speedMultiplier;
        var t = Math.min(elapsed / duration, 1);

        person.position.x = startPos.x + (targetPos.x - startPos.x) * t;
        person.position.y = startPos.y + (targetPos.y - startPos.y) * t;
        person.position.z = startPos.z + (targetPos.z - startPos.z) * t;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            person.position.copy(targetPos);
            person.userData.isWalking = false;

            // Board: reparent person to elevatorCar using attach (H8)
            elevatorCar.attach(person);

            // Small delay then callback
            setTimeout(function () {
                if (callback) callback();
            }, 300);
        }
    }

    step();
}

function personExitElevator(person, destFloor, callback) {
    // Person is inside elevator, needs to walk out through doors (positive Z direction)
    // Target: in front of elevator doors on the destination floor

    var floorY = destFloor * FLOOR_HEIGHT;
    var exitPos = new THREE.Vector3(
        0,
        floorY,
        BUILDING_DEPTH / 2 - 2
    );

    // Set walking
    person.userData.isWalking = true;

    var startTime = performance.now();
    var startPos = person.position.clone();
    var distance = startPos.distanceTo(exitPos);
    var duration = distance / PERSON_MOVE_SPEED;

    function step() {
        var elapsed = (performance.now() - startTime) / 1000 * speedMultiplier;
        var t = Math.min(elapsed / duration, 1);

        person.position.x = startPos.x + (exitPos.x - startPos.x) * t;
        person.position.y = startPos.y + (exitPos.y - startPos.y) * t;
        person.position.z = startPos.z + (exitPos.z - startPos.z) * t;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            person.position.copy(exitPos);
            person.userData.isWalking = false;

            // Exit: reparent person to scene using attach (H8)
            scene.attach(person);

            // Ensure person faces the elevator (rotation should be PI)
            person.rotation.y = Math.PI;

            // Small delay then callback
            setTimeout(function () {
                if (callback) callback();
            }, 300);
        }
    }

    step();
}
