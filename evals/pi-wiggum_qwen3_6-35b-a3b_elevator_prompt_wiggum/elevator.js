// === Required Constants ===
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// === Required Globals ===
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

// === Animation State ===
let doorAnimBusy = false;
let elevatorAnimBusy = false;
let tripBusy = false;
var speedMultiplier = 1;
var emptyFloor = -1;

// === Utility Helpers ===
function delay(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms / speedMultiplier);
    });
}

// === Floor Y Helper ===
function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

// === Building Creation ===
function createBuilding() {
    var group = new THREE.Group();

    // Ground floor (solid)
    var groundGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    var ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.y = -0.05;
    group.add(ground);

    // Floor surfaces for usable floors (gray, transparent)
    for (var f = 0; f < FLOOR_COUNT; f++) {
        var floorGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.05, BUILDING_DEPTH);
        var floorMat = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3
        });
        var floorMesh = new THREE.Mesh(floorGeom, floorMat);
        floorMesh.position.y = floorY(f) + 0.025;
        group.add(floorMesh);
    }

    // Roof (solid)
    var roofGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    var roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.y = floorY(FLOOR_COUNT) + 0.1;
    group.add(roof);

    // Walls (semi-transparent blue)
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2
    });

    // Back wall
    var backWallGeom = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, 0.1);
    var backWall = new THREE.Mesh(backWallGeom, wallMat);
    backWall.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    group.add(backWall);

    // Left wall (with shaft cutout simulated by partial walls)
    var halfW = BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2;
    var sideWallGeom = new THREE.BoxGeometry(halfW, FLOOR_COUNT * FLOOR_HEIGHT, 0.1);
    var leftWall = new THREE.Mesh(sideWallGeom, wallMat);
    leftWall.position.set(-halfW / 2 - SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    group.add(leftWall);

    var rightWall = new THREE.Mesh(sideWallGeom, wallMat);
    rightWall.position.set(halfW / 2 + SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    group.add(rightWall);

    // Front wall (with shaft opening)
    var frontWallGeom1 = new THREE.BoxGeometry(halfW, FLOOR_COUNT * FLOOR_HEIGHT, 0.1);
    var frontWall1 = new THREE.Mesh(frontWallGeom1, wallMat);
    frontWall1.position.set(-halfW / 2 - SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
    group.add(frontWall1);

    var frontWall2 = new THREE.Mesh(frontWallGeom1, wallMat);
    frontWall2.position.set(halfW / 2 + SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
    group.add(frontWall2);

    return group;
}

// === Elevator Car Creation ===
function createElevatorCar() {
    var elevatorCar = new THREE.Group();

    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });

    // Solid back wall
    var backWallGeom = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT - 0.2, 0.05);
    var backWall = new THREE.Mesh(backWallGeom, frameMat);
    backWall.position.set(0, (FLOOR_HEIGHT - 0.2) / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    // Transparent side walls
    var sideMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.2
    });

    var sideWallGeom = new THREE.BoxGeometry(0.05, FLOOR_HEIGHT - 0.2, SHAFT_DEPTH);
    var leftWall = new THREE.Mesh(sideWallGeom, sideMat);
    leftWall.position.set(-SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(leftWall);

    var rightWall = new THREE.Mesh(sideWallGeom, sideMat);
    rightWall.position.set(SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, 0);
    elevatorCar.add(rightWall);

    // Top frame bar
    var topBarGeom = new THREE.BoxGeometry(SHAFT_WIDTH, 0.05, SHAFT_DEPTH);
    var topBar = new THREE.Mesh(topBarGeom, frameMat);
    topBar.position.set(0, FLOOR_HEIGHT - 0.1, 0);
    elevatorCar.add(topBar);

    // Door frames
    var doorFrameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });

    var doorFrameGeom = new THREE.BoxGeometry(0.05, FLOOR_HEIGHT - 0.2, 0.05);
    var leftFrame = new THREE.Mesh(doorFrameGeom, doorFrameMat);
    leftFrame.position.set(-SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(leftFrame);

    var rightFrame = new THREE.Mesh(doorFrameGeom, doorFrameMat);
    rightFrame.position.set(SHAFT_WIDTH / 2, (FLOOR_HEIGHT - 0.2) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(rightFrame);

    // Dark yellow doors
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7
    });

    var doorGeom = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.05, FLOOR_HEIGHT - 0.3, 0.05);
    var leftDoor = new THREE.Mesh(doorGeom, doorMat);
    leftDoor.position.set(-SHAFT_WIDTH / 4, (FLOOR_HEIGHT - 0.3) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(leftDoor);

    var rightDoor = new THREE.Mesh(doorGeom, doorMat);
    rightDoor.position.set(SHAFT_WIDTH / 4, (FLOOR_HEIGHT - 0.3) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;
    return elevatorCar;
}

// === Animation Helpers ===
function animateElevatorToFloor(targetFloor) {
    return new Promise(function(resolve) {
        if (elevatorAnimBusy) {
            resolve();
            return;
        }
        elevatorAnimBusy = true;
        var targetY = floorY(targetFloor);
        var startCarY = elevatorCar.position.y;
        var duration = Math.abs(targetY - startCarY) / (ELEVATOR_SPEED * speedMultiplier);
        var startTime = performance.now();

        function tick() {
            var elapsed = (performance.now() - startTime) / 1000;
            var t = Math.min(elapsed / duration, 1);
            elevatorCar.position.y = startCarY + (targetY - startCarY) * t;

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                elevatorCar.position.y = targetY;
                elevatorAnimBusy = false;
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function animateDoors(open) {
    return new Promise(function(resolve) {
        if (doorAnimBusy) {
            resolve();
            return;
        }
        doorAnimBusy = true;
        var duration = 0.6 / speedMultiplier;
        var startTime = performance.now();
        var startLX = elevatorCar.leftDoor.position.x;
        var startRX = elevatorCar.rightDoor.position.x;
        var travel = SHAFT_WIDTH / 4;

        function tick() {
            var elapsed = (performance.now() - startTime) / 1000;
            var t = Math.min(elapsed / duration, 1);
            var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            if (open) {
                elevatorCar.leftDoor.position.x = startLX - eased * travel;
                elevatorCar.rightDoor.position.x = startRX + eased * travel;
            } else {
                elevatorCar.leftDoor.position.x = startLX + eased * travel;
                elevatorCar.rightDoor.position.x = startRX - eased * travel;
            }

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                doorAnimBusy = false;
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function walkPersonToZ(person, targetZ) {
    return new Promise(function(resolve) {
        var startX = person.position.x;
        var startZ = person.position.z;
        var dx = targetZ - startZ;
        var dy = targetZ - startZ;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.01) {
            resolve();
            return;
        }
        var duration = distance / (PERSON_MOVE_SPEED * speedMultiplier);
        var startTime = performance.now();
        person.userData.isWalking = true;

        function tick() {
            var elapsed = (performance.now() - startTime) / 1000;
            var t = Math.min(elapsed / duration, 1);
            person.position.z = startZ + dx * t;

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                person.position.z = targetZ;
                person.userData.isWalking = false;
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function animateWalkingLegs(time) {
    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.userData.isWalking) {
            var angle = Math.sin(time * 8) * 0.4;
            p.userData.leftLeg.rotation.x = angle;
            p.userData.rightLeg.rotation.x = -angle;
        } else {
            p.userData.leftLeg.rotation.x = 0;
            p.userData.rightLeg.rotation.x = 0;
        }
    }
}

// === Create People ===
function createPeople() {
    var colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffaa00, 0xaa44ff];
    var floorAssignments = [0, 1, 2, 3, 4]; // 5 floors, floor 5 will be empty
    emptyFloor = 5;

    for (var i = 0; i < 5; i++) {
        var person = createPerson(colors[i]);
        var floor = floorAssignments[i];
        person.userData.currentFloor = floor;
        person.userData.inElevator = false;
        person.position.set(0, floorY(floor) + 0.01, 3.5);
        person.rotation.y = Math.PI;
        scene.add(person);
        people.push(person);
    }
}

// === Passenger Trip Sequence ===
async function doTrip() {
    if (tripBusy) return;
    tripBusy = true;

    // Pick a random person whose floor is not empty
    var candidates = people.filter(function(p) {
        return p.userData.currentFloor !== emptyFloor;
    });

    if (candidates.length === 0) {
        tripBusy = false;
        return;
    }

    var passenger = candidates[Math.floor(Math.random() * candidates.length)];
    var sourceFloor = passenger.userData.currentFloor;
    var destFloor = emptyFloor;

    // 1. Move elevator to passenger's floor
    await animateElevatorToFloor(sourceFloor);

    // 2. Open doors
    await animateDoors(true);
    await delay(300);

    // 3. Walk person into elevator
    await walkPersonToZ(passenger, 2.2);
    await delay(300);

    // 4. Board
    elevatorCar.attach(passenger);
    passenger.userData.inElevator = true;

    // 5. Close doors
    await animateDoors(false);

    // 6. Move elevator to destination
    await animateElevatorToFloor(destFloor);

    // 7. Open doors
    await animateDoors(true);
    await delay(300);

    // 8. Exit
    scene.attach(passenger);
    passenger.userData.inElevator = false;

    // 9. Walk person out
    await walkPersonToZ(passenger, 3.5);
    await delay(300);

    // 10. Close doors
    await animateDoors(false);

    // 11. Update state
    emptyFloor = sourceFloor;
    passenger.userData.currentFloor = destFloor;

    tripBusy = false;
}

// === Start Simulation ===
function startSimulation() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(15, 12, 20);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Lights
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

    // Building
    var building = createBuilding();
    scene.add(building);

    // Elevator
    elevatorCar = createElevatorCar();
    elevatorCar.position.y = floorY(0);
    scene.add(elevatorCar);

    // People
    createPeople();

    // Speed slider
    var slider = document.getElementById("speed-slider");
    var label = document.getElementById("speed-label");
    slider.addEventListener("input", function() {
        speedMultiplier = parseFloat(slider.value);
        label.textContent = slider.value;
    });

    // Start first trip quickly
    setTimeout(function() {
        doTrip();
    }, 200);

    // Loop
    var clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        var time = clock.getElapsedTime();
        animateWalkingLegs(time);

        // Slow orbit camera for visible motion
        camera.position.x = 15 + Math.cos(time * 0.15) * 3;
        camera.position.z = 20 + Math.sin(time * 0.15) * 3;
        camera.position.y = 12;
        camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

        controls.update();
        renderer.render(scene, camera);

        // Start next trip if idle
        if (!tripBusy && !elevatorAnimBusy) {
            tripBusy = true;
            doTrip().then(function() {
                // trip done
            }).catch(function() {
                tripBusy = false;
            });
        }
    }

    animate();

    // Resize
    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Auto-start
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
