// elevator.js
// Plain global script — no ES6 modules, no module syntax (see H2). Loaded AFTER three.min.js,
// OrbitControls.js and person.js. Auto-starts on page load (see bottom of file, H3).

// ============================================================================
// CONSTANTS — top-level `const` declarations (H6). NOT wrapped in a config object.
// ============================================================================
const FLOOR_HEIGHT   = 3;
const FLOOR_COUNT    = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH    = 5;
const SHAFT_DEPTH    = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// --- Derived / scene-tuning constants ---
const CAR_WIDTH  = 4;
const CAR_DEPTH  = 4;
const CAR_HEIGHT = 2.8;
const WAIT_Z     = 5;          // people wait IN FRONT of the doors (positive Z)

const DOOR_WIDTH  = 2;
const DOOR_HEIGHT = 2.6;
const DOOR_THICK  = 0.12;
const DOOR_Z      = CAR_DEPTH / 2 - 0.05;            // front face of the car
const DOOR_CLOSED_LEFT  = -DOOR_WIDTH / 2;           // -1  (doors meet in the middle)
const DOOR_CLOSED_RIGHT =  DOOR_WIDTH / 2;           //  1
const DOOR_OPEN_LEFT    = -DOOR_WIDTH / 2 - DOOR_WIDTH; // -3 (retract outward)
const DOOR_OPEN_RIGHT   =  DOOR_WIDTH / 2 + DOOR_WIDTH; //  3
const DOOR_SPEED  = 2.5;

const WALK_FREQ  = 9;          // leg-swing frequency (rad/sec)
const STEP_DELAY = 300;        // ms pause between sequence steps (H: "300ms")

// --- Colors ---
const COLOR_ELEVATOR_FRAME = 0xffff00; // yellow
const COLOR_ELEVATOR_DOOR  = 0xcccc00; // darker yellow
const COLOR_FLOOR          = 0xcccccc; // gray
const COLOR_WALL           = 0x9999ff; // blue

// ============================================================================
// GLOBALS — exact names required by the naming contract (H5).
// ============================================================================
let scene, camera, renderer, controls, clock;
let elevatorCar;            // THREE.Group for the elevator (doors stored on it)
let people = [];            // array of person objects
let emptyFloor = 0;         // the one floor that is currently empty
let activeAction = null;    // the currently-running animation step
let speedMultiplier = 1;    // controlled by the speed slider (1x - 20x)

// ============================================================================
// HELPERS
// ============================================================================
function floorY(i) {
    return i * FLOOR_HEIGHT;
}

// Transparent material with all the flags required for correct depth sorting (H: transparency rules).
function makeTransparent(color, opacity) {
    return new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function makeSolid(color) {
    return new THREE.MeshStandardMaterial({ color: color, side: THREE.DoubleSide });
}

// Move `cur` toward `target` by at most `step`. Returns the new value and whether we arrived.
function moveToward(cur, target, step) {
    const diff = target - cur;
    if (Math.abs(diff) <= step || Math.abs(diff) < 0.01) {
        return { v: target, done: true };
    }
    return { v: cur + Math.sign(diff) * step, done: false };
}

// ============================================================================
// BUILDING
// ============================================================================
function createBuilding() {
    const group = new THREE.Group();

    // Solid ground floor (lowered a hair so it never z-fights with the car floor).
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
        makeSolid(COLOR_FLOOR)
    );
    ground.position.set(0, -0.15, 0); // top surface at y = -0.05
    group.add(ground);

    // Floors 1..5: transparent surfaces (opacity 0.3) WITH a shaft cutout.
    for (let i = 1; i < FLOOR_COUNT; i++) {
        addFloorWithHole(group, floorY(i), makeTransparent(COLOR_FLOOR, 0.3));
    }

    // Solid roof, capping the top of the building.
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
        makeSolid(COLOR_FLOOR)
    );
    roof.position.set(0, floorY(FLOOR_COUNT) + 0.1, 0);
    group.add(roof);

    addWalls(group);

    group.traverse(function (o) { if (o.isMesh) { o.renderOrder = 0; } });
    return group;
}

// A floor surface built from 4 strips surrounding the central elevator-shaft hole.
function addFloorWithHole(parent, y, material) {
    const t = 0.1;
    const cy = y - t / 2; // top of the slab sits exactly at y

    const frontDepth = BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2;            // 5
    const frontCz    = (SHAFT_DEPTH / 2 + BUILDING_DEPTH / 2) / 2;       // 5
    const sideWidth  = BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2;            // 7.5
    const sideCx     = (SHAFT_WIDTH / 2 + BUILDING_WIDTH / 2) / 2;       // 6.25

    const strips = [
        [BUILDING_WIDTH, t, frontDepth, 0,        cy,  frontCz], // front strip
        [BUILDING_WIDTH, t, frontDepth, 0,        cy, -frontCz], // back strip
        [sideWidth,      t, SHAFT_DEPTH, -sideCx, cy,  0],       // left strip
        [sideWidth,      t, SHAFT_DEPTH,  sideCx, cy,  0]        // right strip
    ];

    for (let i = 0; i < strips.length; i++) {
        const s = strips[i];
        const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), material.clone());
        m.position.set(s[3], s[4], s[5]);
        parent.add(m);
    }
}

function addWalls(parent) {
    const h = floorY(FLOOR_COUNT); // 18
    const t = 0.1;
    const mat = makeTransparent(COLOR_WALL, 0.2);

    const walls = [
        [BUILDING_WIDTH, h, t, 0,                  h / 2,  BUILDING_DEPTH / 2], // front (+Z)
        [BUILDING_WIDTH, h, t, 0,                  h / 2, -BUILDING_DEPTH / 2], // back (-Z)
        [t, h, BUILDING_DEPTH, -BUILDING_WIDTH / 2, h / 2, 0],                  // left (-X)
        [t, h, BUILDING_DEPTH,  BUILDING_WIDTH / 2, h / 2, 0]                   // right (+X)
    ];

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const m = new THREE.Mesh(new THREE.BoxGeometry(w[0], w[1], w[2]), mat.clone());
        m.position.set(w[3], w[4], w[5]);
        parent.add(m);
    }
}

// ============================================================================
// ELEVATOR CAR
// ============================================================================
function createElevator() {
    const group = new THREE.Group();

    const frameMat = makeTransparent(COLOR_ELEVATOR_FRAME, 0.5); // semi-transparent yellow frame
    const backMat  = makeTransparent(COLOR_ELEVATOR_FRAME, 0.85); // "solid" back wall (more opaque)
    const doorMat  = makeTransparent(COLOR_ELEVATOR_DOOR, 0.7);   // doors slightly more opaque (0.7)
    const t = 0.1;

    // Car floor (people stand on this; the slab's TOP is at local y = 0, the
    // standing surface, so feet — at local y = 0 — rest exactly on it).
    const carFloor = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.08, CAR_DEPTH), frameMat.clone());
    carFloor.position.set(0, -0.04, 0);
    group.add(carFloor);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, t, CAR_DEPTH), frameMat.clone());
    ceiling.position.set(0, CAR_HEIGHT, 0);
    group.add(ceiling);

    // Solid back wall (-Z)
    const back = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, t), backMat);
    back.position.set(0, CAR_HEIGHT / 2, -CAR_DEPTH / 2 + t / 2);
    group.add(back);

    // Transparent side walls (+/-X)
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(t, CAR_HEIGHT, CAR_DEPTH), frameMat.clone());
    leftSide.position.set(-CAR_WIDTH / 2 + t / 2, CAR_HEIGHT / 2, 0);
    group.add(leftSide);
    const rightSide = new THREE.Mesh(new THREE.BoxGeometry(t, CAR_HEIGHT, CAR_DEPTH), frameMat.clone());
    rightSide.position.set(CAR_WIDTH / 2 - t / 2, CAR_HEIGHT / 2, 0);
    group.add(rightSide);

    // Two sliding front doors (+Z). Stored on the car for animation access (H5).
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICK), doorMat.clone());
    leftDoor.position.set(DOOR_CLOSED_LEFT, DOOR_HEIGHT / 2, DOOR_Z);
    group.add(leftDoor);

    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICK), doorMat.clone());
    rightDoor.position.set(DOOR_CLOSED_RIGHT, DOOR_HEIGHT / 2, DOOR_Z);
    group.add(rightDoor);

    group.leftDoor = leftDoor;
    group.rightDoor = rightDoor;
    group.userData.doorsOpen = false;

    group.traverse(function (o) { if (o.isMesh) { o.renderOrder = 1; } });
    return group;
}

// ============================================================================
// PEOPLE
// ============================================================================
function createPeople() {
    emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);

    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) { continue; } // one floor is always empty

        const p = createPerson(0x3498db);
        // First placement only — the person has no prior world position yet, so
        // .add() is correct here (reparenting later uses .attach(), see H8).
        p.position.set(0, floorY(i), WAIT_Z);
        p.rotation.y = Math.PI;          // face the elevator (look toward -Z)
        p.userData.floor = i;
        scene.add(p);
        people.push(p);
    }
}

// ============================================================================
// ANIMATION ACTIONS — each sets `activeAction`; the animate loop drives it and
// fires onDone when the distance-based completion check (< 0.01) passes.
// ============================================================================
function moveElevatorTo(floor, done) {
    const targetY = floorY(floor);
    activeAction = {
        update: function (dt) {
            const r = moveToward(elevatorCar.position.y, targetY, ELEVATOR_SPEED * dt);
            elevatorCar.position.y = r.v;
            return r.done;
        },
        onDone: done
    };
}

function setDoors(open, done) {
    const lt = open ? DOOR_OPEN_LEFT  : DOOR_CLOSED_LEFT;
    const rt = open ? DOOR_OPEN_RIGHT : DOOR_CLOSED_RIGHT;
    activeAction = {
        update: function (dt) {
            const l = moveToward(elevatorCar.leftDoor.position.x,  lt, DOOR_SPEED * dt);
            const r = moveToward(elevatorCar.rightDoor.position.x, rt, DOOR_SPEED * dt);
            elevatorCar.leftDoor.position.x  = l.v;
            elevatorCar.rightDoor.position.x = r.v;
            const finished = l.done && r.done;
            if (finished) { elevatorCar.userData.doorsOpen = open; }
            return finished;
        },
        onDone: done
    };
}

// Walk a person along Z to targetZ. faceOut=true -> face +Z (walking out),
// faceOut=false -> face -Z (walking in). Legs are animated by the main loop
// based on userData.isWalking.
function walkPersonZ(person, targetZ, faceOut, done) {
    person.userData.isWalking = true;
    person.rotation.y = faceOut ? 0 : Math.PI; // always face the direction of travel (forward)
    activeAction = {
        update: function (dt) {
            const r = moveToward(person.position.z, targetZ, PERSON_MOVE_SPEED * dt);
            person.position.z = r.v;
            return r.done;
        },
        onDone: function () {
            person.userData.isWalking = false;
            if (done) { done(); }
        }
    };
}

function delay(ms, done) {
    let elapsed = 0;
    activeAction = {
        update: function (dt) {
            elapsed += dt * 1000;
            return elapsed >= ms;
        },
        onDone: done
    };
}

// Run an array of step(next) functions sequentially, then call onComplete.
function runSteps(steps, onComplete) {
    let i = 0;
    function next() {
        if (i >= steps.length) {
            if (onComplete) { onComplete(); }
            return;
        }
        const step = steps[i++];
        step(next);
    }
    next();
}

// ============================================================================
// THE MAIN CYCLE — full pickup/dropoff sequence (H: Animation Sequence).
// ============================================================================
function startCycle() {
    // Randomly select a person to move to the empty floor.
    const person = people[Math.floor(Math.random() * people.length)];
    const fromFloor = person.userData.floor;
    const toFloor = emptyFloor;

    runSteps([
        // 1. Elevator moves to the pickup floor.
        function (next) { moveElevatorTo(fromFloor, next); },
        function (next) { delay(STEP_DELAY, next); },
        // 2. Doors open.
        function (next) { setDoors(true, next); },
        function (next) { delay(STEP_DELAY, next); },
        // 3. Person walks FORWARD into the elevator, then becomes a child of the car.
        function (next) {
            walkPersonZ(person, 0, false, function () {
                elevatorCar.attach(person); // reparent preserving world transform (H8)
                next();
            });
        },
        function (next) { delay(STEP_DELAY, next); },
        // 4. Doors close.
        function (next) { setDoors(false, next); },
        function (next) { delay(STEP_DELAY, next); },
        // 5. Elevator travels to the destination (empty) floor.
        function (next) { moveElevatorTo(toFloor, next); },
        function (next) { delay(STEP_DELAY, next); },
        // 6. Doors open at the destination.
        function (next) { setDoors(true, next); },
        function (next) { delay(STEP_DELAY, next); },
        // 7. Person is reparented back to the scene, then walks FORWARD to the waiting spot.
        function (next) {
            scene.attach(person); // reparent preserving world transform (H8)
            // Person has physically arrived at the destination floor: keep the
            // bookkeeping field consistent with the world position immediately.
            person.userData.floor = toFloor;
            walkPersonZ(person, WAIT_Z, true, function () {
                person.rotation.y = Math.PI; // turn back to face the elevator
                next();
            });
        },
        function (next) { delay(STEP_DELAY, next); },
        // 8. Doors close.
        function (next) { setDoors(false, next); },
        // The origin floor is now the designated empty floor for the next move.
        function (next) {
            emptyFloor = fromFloor;
            next();
        }
    ], function () {
        // Brief pause, then run the next cycle (continuous simulation).
        delay(600, startCycle);
    });
}

// ============================================================================
// SLIDER / RESIZE
// ============================================================================
function setupSlider() {
    const slider = document.getElementById('speedSlider');
    const label  = document.getElementById('speedValue');
    if (!slider) { return; }
    function apply() {
        const v = parseFloat(slider.value);
        speedMultiplier = (isNaN(v) || v < 1) ? 1 : v;
        if (label) { label.textContent = speedMultiplier + 'x'; }
    }
    slider.addEventListener('input', apply);
    apply();
}

function onResize() {
    if (!camera || !renderer) { return; }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1) * speedMultiplier;

    if (controls) { controls.update(); }

    // Drive the current sequence step.
    if (activeAction) {
        const finished = activeAction.update(dt);
        if (finished) {
            const cb = activeAction.onDone;
            activeAction = null;
            if (cb) { cb(); }
        }
    }

    // Walking leg animation — the loop reads userData.leftLeg/rightLeg/isWalking (H7).
    for (let i = 0; i < people.length; i++) {
        const ud = people[i].userData;
        if (!ud || !ud.leftLeg || !ud.rightLeg) { continue; } // defensive (H4)
        if (ud.isWalking) {
            ud.walkPhase = (ud.walkPhase || 0) + dt * WALK_FREQ;
            const s = Math.sin(ud.walkPhase) * 0.5; // smooth sine swing on X
            ud.leftLeg.rotation.x = s;
            ud.rightLeg.rotation.x = -s;            // legs alternate
        } else {
            // Reset to standing position when stationary.
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
        }
    }

    renderer.render(scene, camera);
}

// ============================================================================
// INIT
// ============================================================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f3);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25); // requested camera position
    camera.lookAt(0, floorY(FLOOR_COUNT) / 2, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // proper depth sorting for transparency
    renderer.alpha = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dir1.position.set(20, 30, 20);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-20, 20, -20);
    scene.add(dir2);

    // OrbitControls (depends on the global THREE created by three.min.js).
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, floorY(FLOOR_COUNT) / 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    // Build the world.
    scene.add(createBuilding());

    elevatorCar = createElevator();          // assign the GLOBAL (H5) before writing to its doors
    elevatorCar.position.set(0, floorY(0), 0); // rest at the ground floor (not floating)
    scene.add(elevatorCar);

    createPeople();

    setupSlider();

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);

    animate();

    // Kick off the simulation after a short beat.
    delay(800, startCycle);
}

// ============================================================================
// AUTO-START ON PAGE LOAD (H3) — actually invoke init(), not just define it.
// ============================================================================
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
