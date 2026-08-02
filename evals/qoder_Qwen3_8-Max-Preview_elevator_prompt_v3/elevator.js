// elevator.js - Main simulation: building, elevator car, people, animation loop.
// Plain classic script (no modules). Depends on THREE (CDN) and createPerson()
// from person.js, which must be loaded first.

// --- Required constants (top-level, bare names) ---
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// --- Shared simulation globals ---
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let elevatorCar = null;
let people = [];

let emptyFloor = FLOOR_COUNT - 1;
let speedMultiplier = 1;
let simulationTime = 0;
let lastFrameTime = 0;

let animationQueue = [];
let currentStep = null;
let doorsOpen = false;
let doorAnimating = false;

// Waiting spot: on the positive Z axis, in front of the elevator doors.
const WAIT_Z = SHAFT_DEPTH / 2 + 2;
const CAR_INTERIOR_Z = 0;

function floorY(floor) {
    return floor * FLOOR_HEIGHT;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function createFloorSlabGeometry(withShaftHole) {
    const halfWidth = BUILDING_WIDTH / 2;
    const halfDepth = BUILDING_DEPTH / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, -halfDepth);
    shape.lineTo(halfWidth, -halfDepth);
    shape.lineTo(halfWidth, halfDepth);
    shape.lineTo(-halfWidth, halfDepth);
    shape.closePath();

    if (withShaftHole) {
        const halfShaftWidth = SHAFT_WIDTH / 2;
        const halfShaftDepth = SHAFT_DEPTH / 2;
        const holePath = new THREE.Path();
        holePath.moveTo(-halfShaftWidth, -halfShaftDepth);
        holePath.lineTo(-halfShaftWidth, halfShaftDepth);
        holePath.lineTo(halfShaftWidth, halfShaftDepth);
        holePath.lineTo(halfShaftWidth, -halfShaftDepth);
        holePath.closePath();
        shape.holes.push(holePath);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.2,
        bevelEnabled: false
    });
    // Lay the slab flat: after this the slab occupies y in [0, 0.2].
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

function createBuilding() {
    const building = new THREE.Group();
    building.name = "building";

    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const solidSlabMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        side: THREE.DoubleSide
    });

    const slabWithHole = createFloorSlabGeometry(true);
    const solidSlab = createFloorSlabGeometry(false);

    // Solid ground floor (top surface exactly at y = 0).
    const ground = new THREE.Mesh(solidSlab, solidSlabMaterial);
    ground.position.y = -0.2;
    building.add(ground);

    // Transparent upper floors with the shaft cutout; top surface at floorY(f).
    for (let f = 1; f < FLOOR_COUNT; f++) {
        const slab = new THREE.Mesh(slabWithHole, floorMaterial);
        slab.position.y = floorY(f) - 0.2;
        building.add(slab);
    }

    // Solid roof on top.
    const roof = new THREE.Mesh(solidSlab, solidSlabMaterial);
    roof.position.y = floorY(FLOOR_COUNT) - 0.2;
    building.add(roof);

    // Semi-transparent perimeter walls.
    const wallHeight = FLOOR_COUNT * FLOOR_HEIGHT;
    const halfWidth = BUILDING_WIDTH / 2;
    const halfDepth = BUILDING_DEPTH / 2;

    const frontBackGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, wallHeight);
    const frontWall = new THREE.Mesh(frontBackGeometry, wallMaterial);
    frontWall.position.set(0, wallHeight / 2, halfDepth);
    building.add(frontWall);

    const backWall = new THREE.Mesh(frontBackGeometry, wallMaterial);
    backWall.position.set(0, wallHeight / 2, -halfDepth);
    building.add(backWall);

    const sideGeometry = new THREE.PlaneGeometry(BUILDING_DEPTH, wallHeight);
    const leftWall = new THREE.Mesh(sideGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-halfWidth, wallHeight / 2, 0);
    building.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeometry, wallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(halfWidth, wallHeight / 2, 0);
    building.add(rightWall);

    // Subtle outline of the shaft so the cutout reads clearly.
    const shaftOutline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(SHAFT_WIDTH, wallHeight, SHAFT_DEPTH)),
        new THREE.LineBasicMaterial({ color: 0x667788 })
    );
    shaftOutline.position.y = wallHeight / 2;
    building.add(shaftOutline);

    building.traverse(function (child) {
        child.renderOrder = 0;
    });
    return building;
}

function createGroundPlane() {
    const groundPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(140, 140),
        new THREE.MeshPhongMaterial({ color: 0x2a2f36 })
    );
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.25;
    groundPlane.renderOrder = 0;
    return groundPlane;
}

// ---------------------------------------------------------------------------
// Elevator car
// ---------------------------------------------------------------------------

function createElevatorCar() {
    const car = new THREE.Group();
    car.name = "elevatorCar";

    const carWidth = SHAFT_WIDTH - 0.4;
    const carDepth = SHAFT_DEPTH - 0.4;
    const carHeight = FLOOR_HEIGHT - 0.5;

    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const solidYellowMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide
    });

    // Solid platform; its top surface sits at the car's local y = 0.
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, 0.2, carDepth),
        solidYellowMaterial
    );
    platform.position.y = -0.1;
    car.add(platform);

    // Solid back wall.
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carHeight),
        solidYellowMaterial
    );
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    car.add(backWall);

    // Transparent side walls and ceiling.
    const sideGeometry = new THREE.PlaneGeometry(carDepth, carHeight);
    const leftWall = new THREE.Mesh(sideGeometry, frameMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    car.add(leftWall);

    const rightWall = new THREE.Mesh(sideGeometry, frameMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    car.add(rightWall);

    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(carWidth, carDepth),
        frameMaterial
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = carHeight;
    car.add(ceiling);

    // Visible yellow frame edges.
    const frameEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(carWidth, carHeight, carDepth)),
        new THREE.LineBasicMaterial({ color: 0xffff00 })
    );
    frameEdges.position.y = carHeight / 2;
    car.add(frameEdges);

    // Two sliding door halves on the front (+Z face). Closed, they meet in the
    // middle; open, they retract outward along the X axis.
    const doorHeight = carHeight - 0.15;
    const doorGeometry = new THREE.BoxGeometry(carWidth / 2, doorHeight, 0.08);

    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-carWidth / 4, doorHeight / 2 + 0.05, carDepth / 2);
    car.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(carWidth / 4, doorHeight / 2 + 0.05, carDepth / 2);
    car.add(rightDoor);

    car.leftDoor = leftDoor;
    car.rightDoor = rightDoor;

    const openTravel = carWidth / 2 - 0.1;
    car.userData = {
        doorLeftClosedX: -carWidth / 4,
        doorRightClosedX: carWidth / 4,
        doorLeftOpenX: -carWidth / 4 - openTravel,
        doorRightOpenX: carWidth / 4 + openTravel
    };

    car.traverse(function (child) {
        child.renderOrder = 1;
    });
    return car;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function createPeople() {
    for (let f = 0; f < FLOOR_COUNT; f++) {
        if (f === emptyFloor) {
            continue;
        }
        const person = createPerson();
        person.position.set(0, floorY(f), WAIT_Z);
        // Face the elevator doors (model faces +Z by default; the doors are at
        // smaller Z, so turn around).
        person.rotation.y = Math.PI;
        person.userData.homeFloor = f;
        person.renderOrder = 2;
        scene.add(person);
        people.push(person);
    }
}

// ---------------------------------------------------------------------------
// Sequential animation pipeline (callback/step based)
// ---------------------------------------------------------------------------

function queueStep(step) {
    animationQueue.push(step);
}

function moveToward(position, axis, target, stepAmount) {
    const current = position[axis];
    const diff = target - current;
    if (Math.abs(diff) < 0.01) {
        position[axis] = target;
        return true;
    }
    if (Math.abs(diff) <= stepAmount) {
        position[axis] = target;
        return true;
    }
    position[axis] = current + Math.sign(diff) * stepAmount;
    return false;
}

function processSteps(delta) {
    if (!currentStep && animationQueue.length > 0) {
        currentStep = animationQueue.shift();
        if (currentStep.onStart) {
            currentStep.onStart();
        }
    }
    if (!currentStep) {
        return;
    }
    const finished = currentStep.update(delta);
    if (finished) {
        const completedStep = currentStep;
        currentStep = null;
        if (completedStep.onComplete) {
            completedStep.onComplete();
        }
    }
}

function makeDelayStep(seconds) {
    let elapsed = 0;
    return {
        update: function (delta) {
            elapsed += delta;
            return elapsed >= seconds;
        }
    };
}

function makeElevatorMoveStep(targetFloor) {
    const targetY = floorY(targetFloor);
    return {
        update: function (delta) {
            return moveToward(elevatorCar.position, "y", targetY, ELEVATOR_SPEED * delta);
        }
    };
}

function makeDoorStep(open) {
    let skip = false;
    return {
        onStart: function () {
            if (doorsOpen === open && !doorAnimating) {
                skip = true;
            } else {
                doorAnimating = true;
            }
        },
        update: function (delta) {
            if (skip) {
                return true;
            }
            const meta = elevatorCar.userData;
            const leftTarget = open ? meta.doorLeftOpenX : meta.doorLeftClosedX;
            const rightTarget = open ? meta.doorRightOpenX : meta.doorRightClosedX;
            const doorSpeed = 2.5 * delta;
            const leftDone = moveToward(elevatorCar.leftDoor.position, "x", leftTarget, doorSpeed);
            const rightDone = moveToward(elevatorCar.rightDoor.position, "x", rightTarget, doorSpeed);
            if (leftDone && rightDone) {
                doorsOpen = open;
                doorAnimating = false;
                return true;
            }
            return false;
        }
    };
}

function makeBoardStep(person) {
    return {
        onStart: function () {
            person.userData.isWalking = true;
        },
        update: function (delta) {
            const arrived = moveToward(
                person.position,
                "z",
                CAR_INTERIOR_Z,
                PERSON_MOVE_SPEED * delta
            );
            if (arrived) {
                person.userData.isWalking = false;
                // Reparent while preserving the world transform so the rider
                // travels with the car from here on.
                elevatorCar.attach(person);
                return true;
            }
            return false;
        }
    };
}

function makeExitStep(person) {
    return {
        onStart: function () {
            // Reparent back to the scene while preserving the world transform
            // (the person stays on the destination floor, no teleport).
            scene.attach(person);
            // Turn around and walk out through the doors.
            person.rotation.y = 0;
            person.userData.isWalking = true;
        },
        update: function (delta) {
            const arrived = moveToward(
                person.position,
                "z",
                WAIT_Z,
                PERSON_MOVE_SPEED * delta
            );
            if (arrived) {
                person.userData.isWalking = false;
                // Settle facing the elevator again.
                person.rotation.y = Math.PI;
                return true;
            }
            return false;
        }
    };
}

// ---------------------------------------------------------------------------
// Simulation logic: always one empty floor, move a random rider there
// ---------------------------------------------------------------------------

function scheduleNextTrip() {
    if (people.length === 0) {
        return;
    }
    const person = people[Math.floor(Math.random() * people.length)];
    const fromFloor = person.userData.homeFloor;
    const toFloor = emptyFloor;

    queueStep(makeDelayStep(0.5));
    queueStep(makeElevatorMoveStep(fromFloor));
    queueStep(makeDelayStep(0.3));
    queueStep(makeDoorStep(true));
    queueStep(makeDelayStep(0.3));
    queueStep(makeBoardStep(person));
    queueStep(makeDelayStep(0.3));
    queueStep(makeDoorStep(false));
    queueStep(makeDelayStep(0.3));
    queueStep(makeElevatorMoveStep(toFloor));
    queueStep(makeDelayStep(0.3));
    queueStep(makeDoorStep(true));
    queueStep(makeDelayStep(0.3));
    queueStep(makeExitStep(person));
    queueStep(makeDelayStep(0.3));
    queueStep(makeDoorStep(false));
    queueStep({
        update: function () {
            emptyFloor = fromFloor;
            person.userData.homeFloor = toFloor;
            return true;
        }
    });
    queueStep({
        update: function () {
            scheduleNextTrip();
            return true;
        }
    });
}

// ---------------------------------------------------------------------------
// Per-frame updates
// ---------------------------------------------------------------------------

function updateLegs() {
    for (let i = 0; i < people.length; i++) {
        const person = people[i];
        const data = person.userData;
        if (!data.leftLeg || !data.rightLeg) {
            continue;
        }
        if (data.isWalking) {
            const swing = Math.sin(simulationTime * 10) * 0.6;
            data.leftLeg.rotation.x = swing;
            data.rightLeg.rotation.x = -swing;
        } else {
            data.leftLeg.rotation.x = 0;
            data.rightLeg.rotation.x = 0;
        }
    }
}

function animate(now) {
    requestAnimationFrame(animate);
    const rawDelta = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.1);
    lastFrameTime = now;
    const delta = rawDelta * speedMultiplier;
    simulationTime += delta;

    processSteps(delta);
    updateLegs();

    controls.update();
    renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function bindSpeedSlider() {
    const slider = document.getElementById("speedSlider");
    if (!slider) {
        return;
    }
    slider.addEventListener("input", function (event) {
        const value = parseFloat(event.target.value);
        if (!isNaN(value)) {
            speedMultiplier = value;
        }
        const label = document.getElementById("speedValue");
        if (label) {
            label.textContent = speedMultiplier + "x";
        }
    });
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.alpha = true;
    renderer.sortObjects = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    scene.add(createGroundPlane());
    scene.add(createBuilding());

    elevatorCar = createElevatorCar();
    elevatorCar.position.set(0, floorY(0), 0);
    scene.add(elevatorCar);

    createPeople();
    bindSpeedSlider();

    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    scheduleNextTrip();

    lastFrameTime = performance.now();
    requestAnimationFrame(animate);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
