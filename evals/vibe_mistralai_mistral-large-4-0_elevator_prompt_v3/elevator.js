// elevator.js
// Main simulation logic for the 3D elevator simulation.
// Plain classic script using global declarations only. Shares globals with
// person.js (createPerson is defined there; everything else lives here).

// ---- Required constants (H6) ----
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// ---- Additional constants ----
const FLOOR_THICKNESS = 0.2;
const BUILDING_HEIGHT = FLOOR_HEIGHT * FLOOR_COUNT;
const WALL_THICKNESS = 0.2;
const CAR_WIDTH = 4.4;
const CAR_DEPTH = 4.4;
const CAR_HEIGHT = 2.4;
const CAR_WALL = 0.2;
const DOOR_OPENING = 1.6;
const DOOR_PANEL_WIDTH = 0.8;
const DOOR_HEIGHT = 2.0;
const DOOR_THICKNESS = 0.08;
const DOOR_DURATION = 0.6;
const WAIT_Z = 3.5;

// ---- Colors ----
const COLOR_FLOOR = 0xcccccc;
const COLOR_GROUND = 0x999999;
const COLOR_WALL = 0x9999ff;
const COLOR_CAR_FRAME = 0xffff00;
const COLOR_CAR_DOOR = 0xcccc00;
const COLOR_GROUND_PLANE = 0x555555;

// ---- Top-level Three.js objects (H5) ----
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

// ---- Simulation state ----
let buildingGroup;
let simSpeed = 1;
let doorState = "closed";
let emptyFloor = 0;
let walkPhase = 0;
let simClock;

// ---- Small helpers ----

function floorY(floorIndex) {
    return floorIndex * FLOOR_HEIGHT;
}

function opaqueMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

function transparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function setRenderOrder(obj, order) {
    obj.renderOrder = order;
    for (var i = 0; i < obj.children.length; i++) {
        setRenderOrder(obj.children[i], order);
    }
}

function addBox(parent, width, height, depth, x, y, z, material) {
    var mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
}

// ---- Building ----

function createBuilding() {
    buildingGroup = new THREE.Group();
    buildingGroup.name = "building";

    var i;

    // Floor slabs with a shaft cutout through the centre.
    for (i = 0; i < FLOOR_COUNT; i++) {
        var slabY = floorY(i) - FLOOR_THICKNESS / 2;
        var isGround = (i === 0);
        var slabMat = isGround
            ? opaqueMat(COLOR_GROUND)
            : transparentMat(COLOR_FLOOR, 0.3);

        var frontDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        var sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        var frontZ = (SHAFT_DEPTH / 2 + BUILDING_DEPTH / 2) / 2;
        var sideX = SHAFT_WIDTH / 2 + sideWidth / 2;

        // Front part (positive Z, in front of the shaft)
        addBox(buildingGroup, BUILDING_WIDTH, FLOOR_THICKNESS, frontDepth,
            0, slabY, frontZ, slabMat);
        // Back part (negative Z)
        addBox(buildingGroup, BUILDING_WIDTH, FLOOR_THICKNESS, frontDepth,
            0, slabY, -frontZ, slabMat);
        // Left part (negative X)
        addBox(buildingGroup, sideWidth, FLOOR_THICKNESS, SHAFT_DEPTH,
            -sideX, slabY, 0, slabMat);
        // Right part (positive X)
        addBox(buildingGroup, sideWidth, FLOOR_THICKNESS, SHAFT_DEPTH,
            sideX, slabY, 0, slabMat);
    }

    // Roof (solid, full footprint, caps the shaft)
    var roofY = floorY(FLOOR_COUNT) - FLOOR_THICKNESS / 2;
    addBox(buildingGroup, BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH,
        0, roofY, 0, opaqueMat(COLOR_GROUND));

    // Exterior walls (semi-transparent so we can see inside)
    var wallMat = transparentMat(COLOR_WALL, 0.2);
    var wallY = BUILDING_HEIGHT / 2;
    addBox(buildingGroup, BUILDING_WIDTH, BUILDING_HEIGHT, WALL_THICKNESS,
        0, wallY, BUILDING_DEPTH / 2, wallMat);
    addBox(buildingGroup, BUILDING_WIDTH, BUILDING_HEIGHT, WALL_THICKNESS,
        0, wallY, -BUILDING_DEPTH / 2, wallMat);
    addBox(buildingGroup, WALL_THICKNESS, BUILDING_HEIGHT, BUILDING_DEPTH,
        -BUILDING_WIDTH / 2, wallY, 0, wallMat);
    addBox(buildingGroup, WALL_THICKNESS, BUILDING_HEIGHT, BUILDING_DEPTH,
        BUILDING_WIDTH / 2, wallY, 0, wallMat);

    // Ground plane outside the building
    addBox(buildingGroup, 60, 0.1, 60, 0, -FLOOR_THICKNESS / 2 - 0.05, 0,
        opaqueMat(COLOR_GROUND_PLANE));

    setRenderOrder(buildingGroup, 0);
    scene.add(buildingGroup);
}

// ---- Elevator car ----

function createElevatorCar() {
    elevatorCar = new THREE.Group();
    elevatorCar.name = "elevatorCar";

    var frameMat = transparentMat(COLOR_CAR_FRAME, 0.5);
    var backMat = opaqueMat(COLOR_CAR_FRAME);
    var doorMat = transparentMat(COLOR_CAR_DOOR, 0.7);

    var halfW = CAR_WIDTH / 2;
    var halfD = CAR_DEPTH / 2;
    var wallH = CAR_HEIGHT + FLOOR_THICKNESS;

    // Floor slab (top surface at local y = 0, where passengers stand)
    addBox(elevatorCar, CAR_WIDTH, FLOOR_THICKNESS, CAR_DEPTH,
        0, -FLOOR_THICKNESS / 2, 0, frameMat);
    // Ceiling slab
    addBox(elevatorCar, CAR_WIDTH, FLOOR_THICKNESS, CAR_DEPTH,
        0, CAR_HEIGHT, 0, frameMat);
    // Back wall (solid)
    addBox(elevatorCar, CAR_WIDTH, wallH, CAR_WALL,
        0, CAR_HEIGHT / 2, -halfD - CAR_WALL / 2, backMat);
    // Left side wall (transparent)
    addBox(elevatorCar, CAR_WALL, wallH, CAR_DEPTH,
        -halfW - CAR_WALL / 2, CAR_HEIGHT / 2, 0, frameMat);
    // Right side wall (transparent)
    addBox(elevatorCar, CAR_WALL, wallH, CAR_DEPTH,
        halfW + CAR_WALL / 2, CAR_HEIGHT / 2, 0, frameMat);

    // Front columns (frame the door opening on the +Z face)
    var colWidth = (CAR_WIDTH - DOOR_OPENING) / 2;
    var colX = DOOR_OPENING / 2 + colWidth / 2;
    var frontZ = halfD + CAR_WALL / 2;
    addBox(elevatorCar, colWidth, wallH, CAR_WALL,
        -colX, CAR_HEIGHT / 2, frontZ, frameMat);
    addBox(elevatorCar, colWidth, wallH, CAR_WALL,
        colX, CAR_HEIGHT / 2, frontZ, frameMat);

    // Front header (above the door opening)
    var headerH = wallH - DOOR_HEIGHT;
    addBox(elevatorCar, DOOR_OPENING, headerH, CAR_WALL,
        0, DOOR_HEIGHT + headerH / 2, frontZ, frameMat);

    // Sliding doors (meet in the middle when closed)
    var doorZ = halfD + CAR_WALL / 2;
    var leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_PANEL_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS),
        doorMat
    );
    leftDoor.position.set(-DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
    elevatorCar.add(leftDoor);

    var rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_PANEL_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS),
        doorMat
    );
    rightDoor.position.set(DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    // Park at the ground floor, floor surface flush with the building floor
    elevatorCar.position.y = floorY(0);

    setRenderOrder(elevatorCar, 1);
    return elevatorCar;
}

// ---- People ----

function createPersonOnFloor(floorIndex, color) {
    var person = createPerson(color);
    person.position.set(0, floorY(floorIndex), WAIT_Z);
    person.rotation.y = Math.PI; // face the elevator (look toward -Z)
    person.userData.floor = floorIndex;
    scene.add(person);
    people.push(person);
    return person;
}

// ---- Tween helper (callback-based, speed-scaled) ----

function tween(from, to, duration, onUpdate, onComplete) {
    var start = null;
    var lastTime = null;
    var elapsed = 0;
    function step(now) {
        if (start === null) {
            start = now;
            lastTime = now;
        }
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        elapsed += dt * simSpeed;
        var t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
        onUpdate(from + (to - from) * t);
        if (t < 1) {
            requestAnimationFrame(step);
        } else if (onComplete) {
            onComplete();
        }
    }
    requestAnimationFrame(step);
}

// ---- Animation steps ----

function moveElevatorTo(floorIndex, done) {
    var fromY = elevatorCar.position.y;
    var toY = floorY(floorIndex);
    var dist = Math.abs(toY - fromY);
    if (dist < 0.01) {
        elevatorCar.position.y = toY;
        if (done) done();
        return;
    }
    var dur = dist / ELEVATOR_SPEED;
    tween(fromY, toY, dur, function(val) {
        elevatorCar.position.y = val;
    }, done);
}

function openDoors(done) {
    doorState = "opening";
    var leftClosed = -DOOR_PANEL_WIDTH / 2;
    var leftOpen = -(DOOR_OPENING / 2 + DOOR_PANEL_WIDTH / 2);
    var rightClosed = DOOR_PANEL_WIDTH / 2;
    var rightOpen = DOOR_OPENING / 2 + DOOR_PANEL_WIDTH / 2;
    tween(0, 1, DOOR_DURATION, function(t) {
        elevatorCar.leftDoor.position.x = leftClosed + (leftOpen - leftClosed) * t;
        elevatorCar.rightDoor.position.x = rightClosed + (rightOpen - rightClosed) * t;
    }, function() {
        doorState = "open";
        if (done) done();
    });
}

function closeDoors(done) {
    doorState = "closing";
    var leftClosed = -DOOR_PANEL_WIDTH / 2;
    var leftOpen = -(DOOR_OPENING / 2 + DOOR_PANEL_WIDTH / 2);
    var rightClosed = DOOR_PANEL_WIDTH / 2;
    var rightOpen = DOOR_OPENING / 2 + DOOR_PANEL_WIDTH / 2;
    tween(0, 1, DOOR_DURATION, function(t) {
        elevatorCar.leftDoor.position.x = leftOpen + (leftClosed - leftOpen) * t;
        elevatorCar.rightDoor.position.x = rightOpen + (rightClosed - rightOpen) * t;
    }, function() {
        doorState = "closed";
        if (done) done();
    });
}

function walkPersonBoarding(person, done) {
    person.userData.isWalking = true;
    var fromZ = WAIT_Z;
    var toZ = 0;
    var dur = Math.abs(toZ - fromZ) / PERSON_MOVE_SPEED;
    tween(fromZ, toZ, dur, function(val) {
        person.position.z = val;
    }, function() {
        person.userData.isWalking = false;
        if (done) done();
    });
}

function walkPersonExiting(person, done) {
    person.userData.isWalking = true;
    var fromZ = 0;
    var toZ = WAIT_Z;
    var dur = Math.abs(toZ - fromZ) / PERSON_MOVE_SPEED;
    tween(fromZ, toZ, dur, function(val) {
        person.position.z = val;
    }, function() {
        person.userData.isWalking = false;
        if (done) done();
    });
}

// ---- Transport pipeline ----

function runTransport(person, pickupFloor, destFloor) {
    // 1. Elevator moves to the pickup floor
    moveElevatorTo(pickupFloor, function() {
        // 2. Doors open
        openDoors(function() {
            // 3. Person walks forward into the elevator
            walkPersonBoarding(person, function() {
                // Board: reparent to the elevator (preserves world transform)
                elevatorCar.attach(person);
                // 4. Doors close
                closeDoors(function() {
                    // 5. Elevator travels to the destination
                    moveElevatorTo(destFloor, function() {
                        // 6. Doors open at the destination
                        openDoors(function() {
                            // Turn to face the doors (+Z) and walk forward out
                            person.rotation.y = 0;
                            // 7. Person walks forward to the waiting spot
                            walkPersonExiting(person, function() {
                                // Exit: reparent back to the scene
                                scene.attach(person);
                                // Face the elevator again for the next wait
                                person.rotation.y = Math.PI;
                                // 8. Doors close
                                closeDoors(function() {
                                    // Update floor bookkeeping
                                    person.userData.floor = destFloor;
                                    emptyFloor = pickupFloor;
                                    // 9. Schedule the next move
                                    setTimeout(scheduleNextMove, 500);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function scheduleNextMove() {
    if (people.length === 0) return;
    var idx = Math.floor(Math.random() * people.length);
    var person = people[idx];
    var pickupFloor = person.userData.floor;
    var destFloor = emptyFloor;
    runTransport(person, pickupFloor, destFloor);
}

// ---- Render loop ----

function animateLegs(delta) {
    for (var i = 0; i < people.length; i++) {
        var person = people[i];
        var ud = person.userData;
        if (ud.isWalking) {
            walkPhase += delta * 10 * simSpeed;
            ud.leftLeg.rotation.x = Math.sin(walkPhase) * 0.6;
            ud.rightLeg.rotation.x = Math.sin(walkPhase + Math.PI) * 0.6;
        } else {
            var ease = Math.min(1, delta * 8);
            ud.leftLeg.rotation.x += (0 - ud.leftLeg.rotation.x) * ease;
            ud.rightLeg.rotation.x += (0 - ud.rightLeg.rotation.x) * ease;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    var delta = simClock.getDelta();
    animateLegs(delta);
    controls.update();
    renderer.render(scene, camera);
}

// ---- Speed slider ----

function setupSpeedSlider() {
    var slider = document.getElementById("speed-slider");
    var label = document.getElementById("speed-value");
    if (!slider) return;
    slider.addEventListener("input", function() {
        simSpeed = parseFloat(slider.value);
        if (isNaN(simSpeed) || simSpeed < 1) simSpeed = 1;
        if (label) label.textContent = simSpeed + "x";
    });
}

// ---- Init ----

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, BUILDING_HEIGHT / 2, 0);
    controls.update();

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-15, 10, -20);
    scene.add(fill);

    simClock = new THREE.Clock();

    // Build the world
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    // Place one person on each floor except the empty one
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    var palette = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c];
    var colorIdx = 0;
    for (var f = 0; f < FLOOR_COUNT; f++) {
        if (f === emptyFloor) continue;
        createPersonOnFloor(f, palette[colorIdx % palette.length]);
        colorIdx++;
    }

    setupSpeedSlider();

    // Handle window resize
    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();

    // Kick off the simulation
    setTimeout(scheduleNextMove, 800);
}

// ---- Auto-start (H3) ----
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
