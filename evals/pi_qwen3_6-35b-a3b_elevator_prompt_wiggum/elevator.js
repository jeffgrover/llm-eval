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

let doorsAnimating = false;
let elevatorAnimating = false;
let waitingTrip = null;
var speedMultiplier = 1;
var tripSequenceRunning = false;

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    var buildingGroup = new THREE.Group();

    // Ground floor (solid)
    var groundGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    buildingGroup.add(ground);

    // Roof
    var roofGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    buildingGroup.add(roof);

    // Floor slabs (floors 1 through 5 at their respective heights)
    for (var f = 1; f < FLOOR_COUNT; f++) {
        var slabGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        var slabMat = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3
        });
        var slab = new THREE.Mesh(slabGeo, slabMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.y = floorY(f);
        buildingGroup.add(slab);
    }

    // Side walls (semi-transparent blue)
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2
    });

    // Left wall
    var leftWallGeo = new THREE.PlaneGeometry(BUILDING_DEPTH, FLOOR_COUNT * FLOOR_HEIGHT);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    buildingGroup.add(leftWall);

    // Right wall
    var rightWall = new THREE.Mesh(leftWallGeo, wallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    buildingGroup.add(rightWall);

    // Back wall
    var backWallGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    // Side walls for the shaft opening on the front
    // We don't add front walls to leave the elevator visible

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

    // Back wall (solid)
    var backWallGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, FLOOR_HEIGHT);
    var backWallMat = new THREE.MeshLambertMaterial({ color: 0xcccc00 });
    var backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2);
    car.add(backWall);

    // Side walls (transparent)
    var sideWallGeo = new THREE.PlaneGeometry(SHAFT_DEPTH, FLOOR_HEIGHT);
    var sideWallMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3
    });

    var leftSideWall = new THREE.Mesh(sideWallGeo, sideWallMat);
    leftSideWall.position.set(-SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    leftSideWall.rotation.y = Math.PI / 2;
    car.add(leftSideWall);

    var rightSideWall = new THREE.Mesh(sideWallGeo, sideWallMat);
    rightSideWall.position.set(SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    rightSideWall.rotation.y = -Math.PI / 2;
    car.add(rightSideWall);

    // Ceiling
    var ceilGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, SHAFT_DEPTH);
    var ceilMat = new THREE.MeshLambertMaterial({ color: 0xcccc00 });
    var ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = FLOOR_HEIGHT;
    car.add(ceil);

    // Floor
    var floorGeo = new THREE.PlaneGeometry(SHAFT_WIDTH, SHAFT_DEPTH);
    var floorMat = new THREE.MeshLambertMaterial({ color: 0x999900 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    car.add(floor);

    // Frame edges
    var edgeMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    var edgeGeo = new THREE.BoxGeometry(0.08, FLOOR_HEIGHT, 0.08);
    var corners = [
        [-SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2],
        [SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2],
        [-SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2],
        [SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2]
    ];
    for (var i = 0; i < corners.length; i++) {
        var edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(corners[i][0], corners[i][1], corners[i][2]);
        car.add(edge);
    }

    // Doors
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7
    });
    var doorGeo = new THREE.PlaneGeometry(SHAFT_WIDTH / 2 - 0.05, FLOOR_HEIGHT - 0.1);
    var leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    leftDoor.rotation.y = Math.PI / 2;
    car.add(leftDoor);
    car.leftDoor = leftDoor;

    var rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    rightDoor.rotation.y = Math.PI / 2;
    car.add(rightDoor);
    car.rightDoor = rightDoor;

    return car;
}

function animateElevatorToFloor(targetFloor, done) {
    return new Promise(function(resolve) {
        var startY = floorY(elevatorCar.userData.currentFloor);
        var targetY = floorY(targetFloor);
        var start = performance.now();
        var duration = Math.abs(targetY - startY) / (ELEVATOR_SPEED * speedMultiplier) * 1000;

        elevatorAnimating = true;
        elevatorCar.userData.targetFloor = targetFloor;

        function tick(now) {
            var elapsed = (now - start) * speedMultiplier;
            var t = Math.min(elapsed / duration, 1);
            var currentY = startY + (targetY - startY) * t;
            elevatorCar.position.y = currentY;

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                elevatorCar.position.y = floorY(targetFloor);
                elevatorAnimating = false;
                elevatorCar.userData.currentFloor = targetFloor;
                if (done) done();
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function animateDoors(open, done) {
    return new Promise(function(resolve) {
        if (doorsAnimating) {
            if (done) done();
            resolve();
            return;
        }
        doorsAnimating = true;
        var start = performance.now();
        var duration = 500 / speedMultiplier;
        var openAmount = open ? SHAFT_WIDTH / 4 : -SHAFT_WIDTH / 4;

        function tick(now) {
            var elapsed = (now - start) * speedMultiplier;
            var t = Math.min(elapsed / duration, 1);

            var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            var leftX = -SHAFT_WIDTH / 4 + openAmount * eased;
            var rightX = SHAFT_WIDTH / 4 - openAmount * eased;

            elevatorCar.leftDoor.position.x = leftX;
            elevatorCar.rightDoor.position.x = rightX;

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                doorsAnimating = false;
                if (done) done();
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function walkPersonToZ(person, targetZ, done) {
    return new Promise(function(resolve) {
        var startX = person.position.x;
        var startY = person.position.y;
        var startZ = person.position.z;
        var start = performance.now();
        var duration = Math.abs(targetZ - startZ) / (PERSON_MOVE_SPEED * speedMultiplier) * 1000;
        person.userData.isWalking = true;

        function tick(now) {
            var elapsed = (now - start) * speedMultiplier;
            var t = Math.min(elapsed / duration, 1);

            person.position.x = startX + (targetZ - startZ >= 0 ? 0 : (startX - targetZ) * 0) ;
            person.position.y = startY;
            person.position.z = startZ + (targetZ - startZ) * t;

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                person.position.z = targetZ;
                person.userData.isWalking = false;
                if (done) done();
                resolve();
            }
        }
        requestAnimationFrame(tick);
    });
}

function delay(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms / speedMultiplier);
    });
}

function animateWalkingLegs(time) {
    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.userData.isWalking) {
            var phase = Math.sin(time * 0.008 * speedMultiplier) * 0.5;
            p.userData.leftLeg.rotation.x = phase;
            p.userData.rightLeg.rotation.x = -phase;
        } else {
            p.userData.leftLeg.rotation.x = 0;
            p.userData.rightLeg.rotation.x = 0;
        }
    }
}

function runTripSequence() {
    if (tripSequenceRunning) return;
    tripSequenceRunning = true;

    (function trip() {
        // Find empty floor
        var occupiedFloors = {};
        for (var i = 0; i < people.length; i++) {
            var pf = people[i].userData.currentFloor;
            if (!people[i].userData.inElevator) {
                occupiedFloors[pf] = true;
            }
        }

        var emptyFloor = -1;
        for (var f = 0; f < FLOOR_COUNT; f++) {
            if (!occupiedFloors[f]) {
                emptyFloor = f;
                break;
            }
        }

        // Find a person not already going to emptyFloor destination
        var bestPerson = null;
        var bestPersonFloor = -1;
        for (var j = 0; j < people.length; j++) {
            if (!people[j].userData.inElevator && people[j].userData.currentFloor !== emptyFloor) {
                bestPerson = people[j];
                bestPersonFloor = people[j].userData.currentFloor;
                break;
            }
        }

        if (!bestPerson || bestPersonFloor === emptyFloor) {
            tripSequenceRunning = false;
            // Try again next cycle
            setTimeout(function() { tripSequenceRunning = false; runTripSequence(); }, 500);
            return;
        }

        var passenger = bestPerson;
        var srcFloor = bestPersonFloor;

        (function doTrip() {
            // Move elevator to passenger's floor
            return animateElevatorToFloor(srcFloor).then(function() {
                // Open doors
                return animateDoors(true);
            }).then(function() {
                return delay(300);
            }).then(function() {
                // Walk person into elevator
                var walkDist = 1.0;
                return walkPersonToZ(passenger, walkDist);
            }).then(function() {
                // Board person
                elevatorCar.attach(passenger);
                passenger.userData.inElevator = true;
            }).then(function() {
                // Close doors
                return animateDoors(false);
            }).then(function() {
                // Move to destination
                return animateElevatorToFloor(emptyFloor);
            }).then(function() {
                // Open doors
                return animateDoors(true);
            }).then(function() {
                return delay(300);
            }).then(function() {
                // Exit person
                scene.attach(passenger);
                passenger.userData.inElevator = false;
            }).then(function() {
                // Walk person out
                var exitDist = -1.0;
                return walkPersonToZ(passenger, exitDist);
            }).then(function() {
                // Close doors
                return animateDoors(false);
            }).then(function() {
                // Update floor tracking
                passenger.userData.currentFloor = emptyFloor;
                return delay(500);
            }).then(function() {
                tripSequenceRunning = false;
                // Continue looping
                setTimeout(function() { runTripSequence(); }, 200);
            }).catch(function(err) {
                console.error("Trip error:", err);
                tripSequenceRunning = false;
                setTimeout(function() { runTripSequence(); }, 1000);
            });
        })();
    })();
}

var emptyFloor = 0;

function setupPeople() {
    var floorColors = [0xff4444, 0x44ff44, 0x4444ff, 0xff44ff, 0x44ffff];
    var assignedFloors = [0, 1, 2, 3, 4];
    emptyFloor = 5;

    // Place one person on each of floors 0-4
    for (var i = 0; i < 5; i++) {
        var p = createPerson(floorColors[i]);
        p.userData.currentFloor = assignedFloors[i];
        p.position.set(0, floorY(assignedFloors[i]), SHAFT_DEPTH / 2 + 1);
        p.rotation.y = Math.PI; // Face the elevator doors (negative Z direction)
        scene.add(p);
        people.push(p);
    }
}

function startSimulation() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 10, 25);
    camera.lookAt(0, 9, 0);

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
    controls.dampingFactor = 0.05;
    controls.target.set(0, 9, 0);

    // Building
    createBuilding();

    // Elevator
    elevatorCar = createElevatorCar();
    elevatorCar.userData.currentFloor = 0;
    scene.add(elevatorCar);

    // People
    setupPeople();

    // Speed slider
    var slider = document.getElementById("speed-slider");
    var label = document.getElementById("speed-label");
    if (slider) {
        slider.addEventListener("input", function() {
            speedMultiplier = parseInt(slider.value, 10);
            label.textContent = speedMultiplier + "x";
        });
    }

    // Window resize
    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start animation loop
    animate();

    // Start trips
    setTimeout(function() { runTripSequence(); }, 1000);
}

function animate() {
    requestAnimationFrame(animate);

    var time = performance.now();

    // Animate walking legs
    animateWalkingLegs(time);

    // Update controls
    if (controls) controls.update();

    renderer.render(scene, camera);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
