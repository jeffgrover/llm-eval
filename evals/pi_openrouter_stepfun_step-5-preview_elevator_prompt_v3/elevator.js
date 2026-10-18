/*
 * elevator.js
 *
 * Three.js elevator simulation: a six floor building with a shaft cut
 * through the middle, a transparent yellow elevator car with sliding
 * doors, and passengers who ride the elevator between floors.
 *
 * Plain classic script (no modules, no module bindings). Everything is
 * attached to globals declared at the top of this file, and person.js
 * provides the createPerson() factory.
 */

const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

/* ------------------------------------------------------------------
 * Required Three.js globals.
 * ------------------------------------------------------------------ */
let scene;
let camera;
let renderer;
let controls;
let elevatorCar;
let people = [];

/* ------------------------------------------------------------------
 * Elevator car dimensions (world units).
 * ------------------------------------------------------------------ */
const CAR_WIDTH = 4.2;
const CAR_DEPTH = 4.2;
const CAR_HEIGHT = 2.4;
const DOOR_WIDTH = 1.5;
const DOOR_HEIGHT = 2.2;
const DOOR_THICKNESS = 0.12;
const DOOR_OPEN_OFFSET = 0.95;
const DOOR_SLIDE_SPEED = 2.4;
const SLAB_THICKNESS = 0.2;
const WALL_THICKNESS = 0.12;

/* ------------------------------------------------------------------
 * Passenger placement.
 * ------------------------------------------------------------------ */
const WAIT_Z = 4.2;
const RIDE_Z = 0.4;
const WAIT_X = 1.2;
const DOOR_DELAY_MS = 300;
const BODY_COLORS = [0x3498db, 0xe67e22, 0x2ecc71, 0x9b59b6, 0x1abc9c];

/* ------------------------------------------------------------------
 * Simulation state.
 * ------------------------------------------------------------------ */
let buildingGroup = null;
let statusEl = null;
let emptyFloor = 0;
let currentFloor = 0;
let doorsOpen = false;
let simSpeed = 1;
let walkPhase = 0;
let lastFrameTime = 0;

/* Active animations. Each entry is { update, onDone }; update() receives
 * the scaled delta time and returns true when the animation finished. */
const motions = [];

/* ------------------------------------------------------------------
 * Small helpers.
 * ------------------------------------------------------------------ */
function setStatus(message) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
}

function addMotion(updateFn, onDone) {
    motions.push({ update: updateFn, onDone: onDone });
}

/* Slide a single door panel towards targetX. Returns true when it has
 * arrived (completion test is distance based). */
function slideDoor(door, targetX, step) {
    if (!door) {
        return true;
    }
    const delta = targetX - door.position.x;
    if (Math.abs(delta) < 0.01 || Math.abs(delta) <= step) {
        door.position.x = targetX;
        return true;
    }
    door.position.x += Math.sign(delta) * step;
    return false;
}

function resetLegs(person) {
    const data = person.userData;
    if (!data) {
        return;
    }
    if (data.leftLeg) {
        data.leftLeg.rotation.x = 0;
    }
    if (data.rightLeg) {
        data.rightLeg.rotation.x = 0;
    }
    if (data.leftArm) {
        data.leftArm.rotation.x = 0;
    }
    if (data.rightArm) {
        data.rightArm.rotation.x = 0;
    }
}

/* ------------------------------------------------------------------
 * Animation steps. Each one registers a motion and reports back through
 * a callback, which keeps the whole sequence a linear callback chain.
 * ------------------------------------------------------------------ */
function moveElevatorTo(floorIndex, onDone) {
    const targetY = floorIndex * FLOOR_HEIGHT;
    currentFloor = floorIndex;
    setStatus("Elevator traveling to floor " + (floorIndex + 1));
    addMotion((deltaTime) => {
        const delta = targetY - elevatorCar.position.y;
        const step = ELEVATOR_SPEED * deltaTime;
        if (Math.abs(delta) < 0.01 || Math.abs(delta) <= step) {
            elevatorCar.position.y = targetY;
            if (onDone) {
                onDone();
            }
            return true;
        }
        elevatorCar.position.y += Math.sign(delta) * step;
        return false;
    });
}

function animateDoors(shouldOpen, onDone) {
    if (shouldOpen === doorsOpen) {
        if (onDone) {
            onDone();
        }
        return;
    }
    const closedLeft = -DOOR_WIDTH / 2;
    const closedRight = DOOR_WIDTH / 2;
    const targetLeft = shouldOpen ? closedLeft - DOOR_OPEN_OFFSET : closedLeft;
    const targetRight = shouldOpen ? closedRight + DOOR_OPEN_OFFSET : closedRight;
    addMotion((deltaTime) => {
        const step = DOOR_SLIDE_SPEED * deltaTime;
        const leftDone = slideDoor(elevatorCar.leftDoor, targetLeft, step);
        const rightDone = slideDoor(elevatorCar.rightDoor, targetRight, step);
        if (leftDone && rightDone) {
            doorsOpen = shouldOpen;
            setStatus(shouldOpen ? "Doors open" : "Doors closed");
            if (onDone) {
                onDone();
            }
            return true;
        }
        return false;
    });
}

/* Walk a passenger forward along Z. The person keeps its current parent,
 * so the target is converted into that parent's local frame. */
function walkPersonTo(person, targetWorldZ, onDone) {
    if (!person || !person.userData) {
        if (onDone) {
            onDone();
        }
        return;
    }
    const parent = person.parent;
    const anchor = new THREE.Vector3();
    parent.getWorldPosition(anchor);
    const targetLocalZ = targetWorldZ - anchor.z;
    person.userData.isWalking = true;
    setStatus("Passenger walking through the doors");
    addMotion((deltaTime) => {
        const delta = targetLocalZ - person.position.z;
        const step = PERSON_MOVE_SPEED * deltaTime;
        if (Math.abs(delta) < 0.01 || Math.abs(delta) <= step) {
            person.position.z = targetLocalZ;
            person.userData.isWalking = false;
            resetLegs(person);
            if (onDone) {
                onDone();
            }
            return true;
        }
        person.position.z += Math.sign(delta) * step;
        return false;
    });
}

function waitMilliseconds(durationMs, onDone) {
    const scaledMs = Math.max(1, durationMs / Math.max(simSpeed, 0.001));
    const handler = function () {
        if (onDone) {
            onDone();
        }
    };
    setTimeout(handler, scaledMs);
}

/* Runs the steps one after another; every step receives `next`. */
function chain(steps) {
    let index = 0;
    function next() {
        if (index >= steps.length) {
            return;
        }
        const step = steps[index];
        index += 1;
        step(next);
    }
    next();
}

/* ------------------------------------------------------------------
 * Walking animation, driven from the render loop.
 * ------------------------------------------------------------------ */
function updatePeopleAnimation(deltaTime) {
    for (const person of people) {
        const data = person.userData;
        if (!data) {
            continue;
        }
        if (data.isWalking) {
            const swing = Math.sin(walkPhase) * 0.55;
            data.leftLeg.rotation.x = swing;
            data.rightLeg.rotation.x = -swing;
            if (data.leftArm) {
                data.leftArm.rotation.x = -swing * 0.65;
            }
            if (data.rightArm) {
                data.rightArm.rotation.x = swing * 0.65;
            }
        } else {
            resetLegs(person);
        }
    }
}

/* ------------------------------------------------------------------
 * Scene construction.
 * ------------------------------------------------------------------ */

/* Floor slab: a rectangle with the shaft cut out of the middle, laid
 * flat so that the top surface sits exactly on the floor level. */
function createFloorSlabGeometry(thickness) {
    const halfW = BUILDING_WIDTH / 2;
    const halfD = BUILDING_DEPTH / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();

    const halfShaftW = SHAFT_WIDTH / 2;
    const halfShaftD = SHAFT_DEPTH / 2;
    const hole = new THREE.Path();
    hole.moveTo(-halfShaftW, -halfShaftD);
    hole.lineTo(halfShaftW, -halfShaftD);
    hole.lineTo(halfShaftW, halfShaftD);
    hole.lineTo(-halfShaftW, halfShaftD);
    hole.closePath();
    shape.holes.push(hole);

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
        steps: 1
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, thickness, 0);
    return geometry;
}

function createFloorLabel(floorNumber) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) {
        return null;
    }
    context.fillStyle = "rgba(18, 24, 32, 0.85)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ffdb45";
    context.lineWidth = 5;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = "#ffffff";
    context.font = "bold 34px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("F" + floorNumber, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const label = new THREE.Sprite(material);
    label.scale.set(1.5, 0.75, 1);
    return label;
}

function createWallsForFloor(floorIndex, floorY) {
    const height = FLOOR_HEIGHT - SLAB_THICKNESS;
    const centerY = floorY + height / 2;
    const material = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const frontPanelWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    const panels = [];
    /* Back wall, full width. */
    panels.push({
        width: BUILDING_WIDTH,
        depth: WALL_THICKNESS,
        x: 0,
        z: -BUILDING_DEPTH / 2 + WALL_THICKNESS / 2
    });
    /* Front wall is split so the shaft opening stays clear. */
    panels.push({
        width: frontPanelWidth,
        depth: WALL_THICKNESS,
        x: -(SHAFT_WIDTH / 2 + frontPanelWidth / 2),
        z: BUILDING_DEPTH / 2 - WALL_THICKNESS / 2
    });
    panels.push({
        width: frontPanelWidth,
        depth: WALL_THICKNESS,
        x: SHAFT_WIDTH / 2 + frontPanelWidth / 2,
        z: BUILDING_DEPTH / 2 - WALL_THICKNESS / 2
    });
    /* Side walls. */
    panels.push({
        width: WALL_THICKNESS,
        depth: BUILDING_DEPTH,
        x: -BUILDING_WIDTH / 2 + WALL_THICKNESS / 2,
        z: 0
    });
    panels.push({
        width: WALL_THICKNESS,
        depth: BUILDING_DEPTH,
        x: BUILDING_WIDTH / 2 - WALL_THICKNESS / 2,
        z: 0
    });

    for (const panel of panels) {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(panel.width, height, panel.depth),
            material
        );
        wall.position.set(panel.x, centerY, panel.z);
        wall.renderOrder = 0;
        buildingGroup.add(wall);
    }
}

function createBuilding() {
    buildingGroup = new THREE.Group();

    const solidSlabMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const glassSlabMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const slabGeometry = createFloorSlabGeometry(SLAB_THICKNESS);

    for (let i = 0; i < FLOOR_COUNT; i += 1) {
        const floorY = i * FLOOR_HEIGHT;
        const solid = i === 0;
        const slab = new THREE.Mesh(slabGeometry, solid ? solidSlabMaterial : glassSlabMaterial);
        slab.position.y = floorY - SLAB_THICKNESS;
        slab.renderOrder = 0;
        buildingGroup.add(slab);

        createWallsForFloor(i, floorY);

        const label = createFloorLabel(i + 1);
        if (label) {
            label.position.set(-4.8, floorY + 1.5, BUILDING_DEPTH / 2 - 0.5);
            buildingGroup.add(label);
        }
    }

    /* Roof keeps the shaft open so the car can be seen from above. */
    const roof = new THREE.Mesh(slabGeometry, solidSlabMaterial);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT - SLAB_THICKNESS;
    roof.renderOrder = 0;
    buildingGroup.add(roof);

    /* Guide rails inside the shaft. */
    const railMaterial = new THREE.MeshLambertMaterial({ color: 0x6a6a75 });
    const railHeight = FLOOR_COUNT * FLOOR_HEIGHT;
    const railGeometry = new THREE.BoxGeometry(0.14, railHeight, 0.14);
    const railOffsets = [SHAFT_WIDTH / 2 - 0.18, -(SHAFT_WIDTH / 2 - 0.18)];
    for (const railX of railOffsets) {
        const railNear = new THREE.Mesh(railGeometry, railMaterial);
        railNear.position.set(railX, railHeight / 2, SHAFT_DEPTH / 2 - 0.18);
        railNear.renderOrder = 0;
        buildingGroup.add(railNear);

        const railFar = new THREE.Mesh(railGeometry, railMaterial);
        railFar.position.set(railX, railHeight / 2, -(SHAFT_DEPTH / 2 - 0.18));
        railFar.renderOrder = 0;
        buildingGroup.add(railFar);
    }

    /* Plinth under the building, it also closes off the bottom of the shaft. */
    const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH + 4, 0.4, BUILDING_DEPTH + 4),
        new THREE.MeshLambertMaterial({ color: 0x3a4048 })
    );
    plinth.position.y = -0.35;
    plinth.renderOrder = 0;
    buildingGroup.add(plinth);

    buildingGroup.traverse((child) => {
        child.renderOrder = 0;
    });
    scene.add(buildingGroup);
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();

    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const sideMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const solidMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const trimMaterial = new THREE.MeshPhongMaterial({ color: 0x4a4a52 });

    /* Transparent cabin shell: passengers stay visible while riding. */
    const shell = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, CAR_DEPTH), frameMaterial);
    shell.position.y = CAR_HEIGHT / 2;
    elevatorCar.add(shell);

    /* Solid back wall. */
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, 0.12), solidMaterial);
    backWall.position.set(0, CAR_HEIGHT / 2, -CAR_DEPTH / 2 + 0.06);
    elevatorCar.add(backWall);

    /* Transparent side walls. */
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, CAR_HEIGHT, CAR_DEPTH - 0.12), sideMaterial);
    leftWall.position.set(-CAR_WIDTH / 2 + 0.06, CAR_HEIGHT / 2, 0);
    elevatorCar.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, CAR_HEIGHT, CAR_DEPTH - 0.12), sideMaterial);
    rightWall.position.set(CAR_WIDTH / 2 - 0.06, CAR_HEIGHT / 2, 0);
    elevatorCar.add(rightWall);

    /* Transparent roof so the cabin reads clearly from the default camera. */
    const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_DEPTH), sideMaterial);
    roof.position.y = CAR_HEIGHT - 0.05;
    elevatorCar.add(roof);

    /* Corner posts. */
    const postGeometry = new THREE.BoxGeometry(0.12, CAR_HEIGHT, 0.12);
    const postX = [CAR_WIDTH / 2 - 0.06, -(CAR_WIDTH / 2 - 0.06)];
    const postZ = [CAR_DEPTH / 2 - 0.06, -(CAR_DEPTH / 2 - 0.06)];
    for (const px of postX) {
        for (const pz of postZ) {
            const post = new THREE.Mesh(postGeometry, solidMaterial);
            post.position.set(px, CAR_HEIGHT / 2, pz);
            elevatorCar.add(post);
        }
    }

    /* Solid floor plate whose top surface is exactly at the car's y = 0. */
    const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.12, CAR_DEPTH), trimMaterial);
    floorPlate.position.y = -0.06;
    elevatorCar.add(floorPlate);

    /* Header above the door opening. */
    const header = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_WIDTH * 2, CAR_HEIGHT - DOOR_HEIGHT, 0.12),
        solidMaterial
    );
    header.position.set(0, DOOR_HEIGHT + (CAR_HEIGHT - DOOR_HEIGHT) / 2, CAR_DEPTH / 2);
    elevatorCar.add(header);

    /* Two sliding doors: closed they meet at x = 0, open they retract
     * outwards into the shaft walls. */
    const doorGeometry = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS);
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-DOOR_WIDTH / 2, DOOR_HEIGHT / 2, CAR_DEPTH / 2 + DOOR_THICKNESS / 2);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(DOOR_WIDTH / 2, DOOR_HEIGHT / 2, CAR_DEPTH / 2 + DOOR_THICKNESS / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    elevatorCar.position.y = currentFloor * FLOOR_HEIGHT;
    elevatorCar.traverse((child) => {
        child.renderOrder = 1;
    });
    return elevatorCar;
}

/* ------------------------------------------------------------------
 * Passengers: one per floor, exactly one floor left empty.
 * ------------------------------------------------------------------ */
function createPeople() {
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    const floors = [];
    for (let i = 0; i < FLOOR_COUNT; i += 1) {
        if (i !== emptyFloor) {
            floors.push(i);
        }
    }
    for (let i = 0; i < floors.length; i += 1) {
        const floorIndex = floors[i];
        const color = BODY_COLORS[i % BODY_COLORS.length];
        const person = createPerson(color);
        const offsetX = i % 2 === 0 ? -WAIT_X : WAIT_X;
        person.position.set(offsetX, floorIndex * FLOOR_HEIGHT, WAIT_Z);
        /* Face the elevator doors, which sit at -Z relative to the person. */
        person.rotation.y = Math.PI;
        person.userData.floor = floorIndex;
        person.userData.waitingX = offsetX;
        scene.add(person);
        people.push(person);
    }
}

/* ------------------------------------------------------------------
 * Simulation cycle: elevator travels, doors cycle, passenger walks,
 * elevator travels again. Written as a callback chain.
 * ------------------------------------------------------------------ */
function runCycle() {
    if (people.length === 0) {
        setTimeout(runCycle, 1000);
        return;
    }
    const index = Math.floor(Math.random() * people.length);
    const person = people[index];
    const fromFloor = person.userData.floor;
    const toFloor = emptyFloor;

    setStatus("Elevator traveling to floor " + (fromFloor + 1) + " to pick up a passenger");

    chain([
        (next) => moveElevatorTo(fromFloor, next),
        (next) => animateDoors(true, next),
        (next) => waitMilliseconds(DOOR_DELAY_MS, next),
        (next) => walkPersonTo(person, RIDE_Z, () => {
            /* attach() keeps the passenger's world position while the
             * parent switches from the scene to the elevator car. */
            elevatorCar.attach(person);
            person.userData.isWalking = false;
            resetLegs(person);
            next();
        }),
        (next) => waitMilliseconds(DOOR_DELAY_MS, next),
        (next) => animateDoors(false, next),
        (next) => moveElevatorTo(toFloor, next),
        (next) => animateDoors(true, next),
        (next) => waitMilliseconds(DOOR_DELAY_MS, next),
        (next) => walkPersonTo(person, WAIT_Z, () => {
            /* attach() keeps the passenger on the destination floor when
             * the parent switches back from the car to the scene. */
            scene.attach(person);
            person.userData.isWalking = false;
            resetLegs(person);
            next();
        }),
        (next) => waitMilliseconds(DOOR_DELAY_MS, next),
        (next) => animateDoors(false, next),
        () => {
            person.userData.floor = toFloor;
            emptyFloor = fromFloor;
            setStatus("Passenger delivered to floor " + (toFloor + 1));
            runCycle();
        }
    ]);
}

/* ------------------------------------------------------------------
 * Render loop.
 * ------------------------------------------------------------------ */
function animate(timestamp) {
    requestAnimationFrame(animate);

    const now = timestamp === undefined ? performance.now() : timestamp;
    let deltaSeconds = (now - lastFrameTime) / 1000;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        deltaSeconds = 0;
    }
    deltaSeconds = Math.min(deltaSeconds, 0.1);
    lastFrameTime = now;

    const scaledDelta = deltaSeconds * simSpeed;
    walkPhase += scaledDelta * 7.5;
    updatePeopleAnimation(scaledDelta);

    for (let i = motions.length - 1; i >= 0; i -= 1) {
        const entry = motions[i];
        const finished = entry.update(scaledDelta) === true;
        if (finished) {
            motions.splice(i, 1);
            if (entry.onDone) {
                entry.onDone();
            }
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    if (!camera || !renderer) {
        return;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindSpeedSlider() {
    const slider = document.getElementById("speedSlider");
    const valueEl = document.getElementById("speedValue");
    if (!slider) {
        return;
    }
    const apply = function () {
        const parsed = parseFloat(slider.value);
        const speed = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        simSpeed = speed;
        if (valueEl) {
            valueEl.textContent = speed + "x";
        }
    };
    slider.addEventListener("input", apply);
    slider.addEventListener("change", apply);
    apply();
}

/* ------------------------------------------------------------------
 * Startup.
 * ------------------------------------------------------------------ */
function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_COUNT * FLOOR_HEIGHT * 0.42, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 12;
    controls.maxDistance = 90;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-18, 12, -20);
    scene.add(fill);

    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    createPeople();

    statusEl = document.getElementById("status");
    bindSpeedSlider();
    window.addEventListener("resize", onWindowResize);

    lastFrameTime = performance.now();
    animate();
    runCycle();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
