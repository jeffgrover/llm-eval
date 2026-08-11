const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

let emptyFloor;
let isAnimating = false;
let speedMultiplier = 1;

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    var buildingGroup = new THREE.Group();

    // Ground floor (solid)
    var groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.1;
    buildingGroup.add(ground);

    // Solid roof
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = floorY(FLOOR_COUNT) + 0.1;
    buildingGroup.add(roof);

    // Floor surfaces (transparent)
    for (var f = 0; f < FLOOR_COUNT; f++) {
        var floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
        var floorMat = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3
        });
        var floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = floorY(f);
        buildingGroup.add(floor);
    }

    // Walls with shaft opening
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2
    });

    // Left wall (positive Z side)
    var wallThickness = 0.2;
    var leftWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, wallThickness);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(leftWall);

    // Right wall (negative Z side)
    var rightWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, wallThickness);
    var rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(rightWall);

    // Back wall
    var backWallGeo = new THREE.BoxGeometry(wallThickness, FLOOR_COUNT * FLOOR_HEIGHT, BUILDING_DEPTH);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(-BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    buildingGroup.add(backWall);

    // Front walls (with shaft opening in the middle)
    // Left portion of front wall
    var frontLeftWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    var frontLeftGeo = new THREE.BoxGeometry(frontLeftWidth, FLOOR_COUNT * FLOOR_HEIGHT, wallThickness);
    var frontLeft = new THREE.Mesh(frontLeftGeo, wallMat);
    frontLeft.position.set(-BUILDING_WIDTH / 2 + frontLeftWidth / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontLeft);

    // Right portion of front wall
    var frontRight = new THREE.Mesh(frontLeftGeo.clone(), wallMat);
    frontRight.position.set(BUILDING_WIDTH / 2 - frontLeftWidth / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, BUILDING_DEPTH / 2);
    buildingGroup.add(frontRight);

    scene.add(buildingGroup);
}

function createElevatorCar() {
    var car = new THREE.Group();

    // Frame (semi-transparent yellow)
    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });

    // Car dimensions
    var carWidth = SHAFT_WIDTH - 0.4;
    var carDepth = SHAFT_DEPTH - 0.4;
    var carHeight = FLOOR_HEIGHT - 0.2;

    // Back wall (solid)
    var backWallGeo = new THREE.BoxGeometry(carWidth, carHeight, 0.15);
    var backWallMat = new THREE.MeshLambertMaterial({ color: 0xffff00 });
    var backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    car.add(backWall);

    // Side walls (transparent)
    var sideWallGeo = new THREE.BoxGeometry(0.15, carHeight, carDepth);
    var sideWallMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3
    });
    var leftSideWall = new THREE.Mesh(sideWallGeo, sideWallMat);
    leftSideWall.position.set(-carWidth / 2, carHeight / 2, 0);
    car.add(leftSideWall);

    var rightSideWall = new THREE.Mesh(sideWallGeo.clone(), sideWallMat.clone());
    rightSideWall.position.set(carWidth / 2, carHeight / 2, 0);
    car.add(rightSideWall);

    // Floor
    var carFloorGeo = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    var carFloorMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    var carFloor = new THREE.Mesh(carFloorGeo, carFloorMat);
    carFloor.position.y = 0.05;
    car.add(carFloor);

    // Top
    var carTopGeo = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
    var carTop = new THREE.Mesh(carTopGeo, carFloorMat.clone());
    carTop.position.y = carHeight;
    car.add(carTop);

    // Frame edges
    var edgeGeo = new THREE.BoxGeometry(carWidth + 0.2, 0.15, 0.15);
    var bottomEdge = new THREE.Mesh(edgeGeo, frameMat);
    bottomEdge.position.set(0, 0.075, carDepth / 2);
    car.add(bottomEdge);

    var topEdge = new THREE.Mesh(edgeGeo.clone(), frameMat);
    topEdge.position.set(0, carHeight + 0.075, carDepth / 2);
    car.add(topEdge);

    // Doors (dark yellow, opaque)
    var doorWidth = carWidth / 2 - 0.1;
    var doorHeight = carHeight - 0.2;
    var doorDepth = 0.1;
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        opacity: 0.7,
        transparent: true
    });

    var leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    var leftDoor = new THREE.Mesh(leftDoorGeo, doorMat);
    leftDoor.position.set(-doorWidth / 2 - 0.05, doorHeight / 2 + 0.1, carDepth / 2);
    car.add(leftDoor);

    var rightDoor = new THREE.Mesh(leftDoorGeo.clone(), doorMat.clone());
    rightDoor.position.set(doorWidth / 2 + 0.05, doorHeight / 2 + 0.1, carDepth / 2);
    car.add(rightDoor);

    elevatorCar = car;

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    return car;
}

function animateElevatorToFloor(targetFloor, done) {
    var targetY = floorY(targetFloor);
    var startTime = performance.now();
    var startCarY = elevatorCar.position.y;
    var distance = Math.abs(targetY - startCarY);
    var duration = distance / (ELEVATOR_SPEED * speedMultiplier);

    function step(currentTime) {
        var elapsed = (currentTime - startTime) / 1000;
        var progress = Math.min(elapsed / duration, 1);

        elevatorCar.position.y = startCarY + (targetY - startCarY) * progress;

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            elevatorCar.position.y = targetY;
            if (done) done();
        }
    }

    requestAnimationFrame(step);
}

function animateDoors(open, done) {
    var doorWidth = (SHAFT_WIDTH / 2) - 0.6;
    var openX = doorWidth;
    var closedX = -doorWidth / 2 - 0.05;
    var rightClosedX = doorWidth / 2 + 0.05;

    var startTime = performance.now();
    var duration = 0.4 / speedMultiplier;

    function step(currentTime) {
        var elapsed = (currentTime - startTime) / 1000;
        var progress = Math.min(elapsed / duration, 1);

        if (open) {
            // Open: doors slide outward
            elevatorCar.leftDoor.position.x = closedX + (openX - closedX) * progress;
            elevatorCar.rightDoor.position.x = rightClosedX + (openX - rightClosedX) * progress;
        } else {
            // Close: doors slide inward to center
            elevatorCar.leftDoor.position.x = openX + (closedX - openX) * progress;
            elevatorCar.rightDoor.position.x = openX + (rightClosedX - openX) * progress;
        }

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            if (done) done();
        }
    }

    requestAnimationFrame(step);
}

function walkPersonToZ(person, targetZ, done) {
    var startZ = person.position.z;
    var startTime = performance.now();
    var distance = Math.abs(targetZ - startZ);
    var duration = distance / (PERSON_MOVE_SPEED * speedMultiplier);

    person.userData.isWalking = true;

    function step(currentTime) {
        var elapsed = (currentTime - startTime) / 1000;
        var progress = Math.min(elapsed / duration, 1);

        person.position.z = startZ + (targetZ - startZ) * progress;

        if (progress >= 1) {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            if (done) done();
        }
    }

    requestAnimationFrame(step);
}

function delay(ms, done) {
    var adjustedMs = ms / speedMultiplier;
    setTimeout(function() {
        if (done) done();
    }, adjustedMs);
}

function animateWalkingLegs(time) {
    people.forEach(function(person) {
        if (person.userData.isWalking) {
            var speed = 5 * speedMultiplier;
            var angle = Math.sin(time * speed) * 0.5;
            person.userData.leftLeg.rotation.x = angle;
            person.userData.rightLeg.rotation.x = -angle;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    });
}

function pickRandomPerson() {
    var candidates = people.filter(function(p) {
        return !p.userData.inElevator;
    });
    if (candidates.length === 0) return null;
    var idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
}

function waitForElevatorArrival() {
    return new Promise(function(resolve) {
        function check() {
            var currentFloor = Math.round(elevatorCar.position.y / FLOOR_HEIGHT);
            if (currentFloor >= 0 && currentFloor < FLOOR_COUNT) {
                resolve(currentFloor);
            } else {
                setTimeout(check, 50);
            }
        }
        check();
    });
}

function runTripSequence() {
    if (isAnimating) return;
    isAnimating = true;

    var passenger = pickRandomPerson();
    if (!passenger) {
        isAnimating = false;
        return;
    }

    var currentFloor = passenger.userData.currentFloor;
    var destFloor = emptyFloor;

    // 1-3: Move elevator to passenger's floor
    animateElevatorToFloor(currentFloor, function() {
        // 4: Open doors
        animateDoors(true, function() {
            // 5: Walk person forward into elevator
            var boardingZ = 3; // in front of doors
            walkPersonToZ(passenger, boardingZ, function() {
                // 6-7: Attach and set inElevator
                elevatorCar.attach(passenger);
                passenger.position.set(0, floorY(currentFloor), boardingZ);
                passenger.userData.inElevator = true;

                // 8: Close doors
                delay(300, function() {
                    animateDoors(false, function() {
                        // 9: Move elevator to destination
                        animateElevatorToFloor(destFloor, function() {
                            // 10: Open doors
                            animateDoors(true, function() {
                                // 11-12: Exit elevator
                                delay(300, function() {
                                    scene.attach(passenger);
                                    passenger.position.set(0, floorY(destFloor), boardingZ);
                                    passenger.userData.inElevator = false;

                                    // 13: Walk person forward out
                                    walkPersonToZ(passenger, boardingZ, function() {
                                        // 14: Close doors
                                        delay(300, function() {
                                            animateDoors(false, function() {
                                                // 15-16: Update floors
                                                passenger.userData.currentFloor = destFloor;
                                                emptyFloor = currentFloor;

                                                isAnimating = false;

                                                // Continue looping
                                                delay(500, function() {
                                                    runTripSequence();
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

function setupPeople() {
    var colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
    var floorAssignments = [0, 1, 2, 3, 4];
    emptyFloor = 5;

    for (var i = 0; i < 5; i++) {
        var person = createPerson(colors[i]);
        var floor = floorAssignments[i];
        person.userData.currentFloor = floor;
        person.userData.inElevator = false;
        person.position.set(0, floorY(floor), 3);
        person.rotation.y = Math.PI; // Face the elevator doors

        scene.add(person);
        people.push(person);
    }
}

function startSimulation() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 20, 25);
    camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    controls.update();

    // Building
    createBuilding();

    // Elevator
    createElevatorCar();
    elevatorCar.position.y = floorY(0);
    scene.add(elevatorCar);

    // People
    setupPeople();

    // Speed slider
    var slider = document.getElementById('speed-slider');
    var speedDisplay = document.getElementById('speed-value');
    if (slider) {
        slider.addEventListener('input', function() {
            speedMultiplier = parseFloat(slider.value);
            speedDisplay.textContent = speedMultiplier + 'x';
        });
    }

    // Window resize
    window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation loop
    function animate(time) {
        requestAnimationFrame(animate);

        var timeSec = time / 1000;
        animateWalkingLegs(timeSec);
        controls.update();
        renderer.render(scene, camera);
    }

    animate(0);

    // Start trip sequence
    delay(1000, function() {
        runTripSequence();
    });
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
