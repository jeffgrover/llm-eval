// 3D elevator simulation — builds a 6-floor transparent building with a yellow
// elevator car that ferries people (one person per occupied floor; one floor
// empty at all times) between floors via a callback-driven animation pipeline.

// ---------- Configurable constants ----------
const FLOOR_HEIGHT    = 3;
const FLOOR_COUNT     = 6;
const BUILDING_WIDTH  = 12;
const BUILDING_DEPTH  = 10;
const SHAFT_WIDTH     = 3;
const SHAFT_DEPTH     = 3;
const ELEVATOR_SPEED  = 4;     // world units per second
const PERSON_MOVE_SPEED = 2;   // world units per second
const DOOR_SPEED      = 2;     // world units per second (per door half)
const DOOR_OPEN_OFFSET = SHAFT_WIDTH / 2; // how far each door slides open
const STEP_DELAY_MS   = 300;   // pause between pipeline steps

// Global speed multiplier driven by the UI slider (1x .. 20x).
let speedMultiplier = 1;

// ---------- Scene setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222233);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(25, 25, 25);
camera.lookAt(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.sortObjects = true;    // required for correct transparent depth sorting
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
controls.update();

// Lighting.
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 15);
scene.add(sun);

// ---------- Building ----------
const building = new THREE.Group();
building.renderOrder = 0;
scene.add(building);

function makeTransparentMaterial(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,          // prevents z-fighting between transparent surfaces
        side: THREE.DoubleSide
    });
}

const floorMat   = makeTransparentMaterial(0xcccccc, 0.3);
const wallMat    = makeTransparentMaterial(0x9999ff, 0.2);
const solidFloor = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });

// Floors with shaft cutout.
// We build each floor as four rectangles surrounding the shaft so the shaft
// is a clean hole through the center.
function buildFloorWithShaft(y, material) {
    const group = new THREE.Group();
    const halfW = BUILDING_WIDTH / 2;
    const halfD = BUILDING_DEPTH / 2;
    const halfSW = SHAFT_WIDTH / 2;
    const halfSD = SHAFT_DEPTH / 2;

    const slabs = [
        // front strip (positive Z side of shaft)
        { w: BUILDING_WIDTH,          d: halfD - halfSD, x: 0,               z:  (halfD + halfSD) / 2 },
        // back strip
        { w: BUILDING_WIDTH,          d: halfD - halfSD, x: 0,               z: -(halfD + halfSD) / 2 },
        // left strip (between front/back strips)
        { w: halfW - halfSW,          d: SHAFT_DEPTH,    x: -(halfW + halfSW) / 2, z: 0 },
        // right strip
        { w: halfW - halfSW,          d: SHAFT_DEPTH,    x:  (halfW + halfSW) / 2, z: 0 },
    ];
    for (const s of slabs) {
        const geo = new THREE.BoxGeometry(s.w, 0.1, s.d);
        const mesh = new THREE.Mesh(geo, material);
        // Offset so the slab's TOP is at y (floor level); a person standing at y has feet on the floor.
        mesh.position.set(s.x, y - 0.05, s.z);
        group.add(mesh);
    }
    return group;
}

// Ground (solid) and roof (solid).
const ground = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
    solidFloor
);
ground.position.y = -0.1;
building.add(ground);

const roof = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH),
    solidFloor
);
roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT + 0.1;
building.add(roof);

// Intermediate floors (between floor 1 and floor FLOOR_COUNT).
for (let i = 1; i < FLOOR_COUNT; i++) {
    const slab = buildFloorWithShaft(i * FLOOR_HEIGHT, floorMat);
    building.add(slab);
}

// Outer walls — 4 transparent panels. We leave the shaft open (no inner walls).
function addWall(w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z);
    building.add(mesh);
}
const totalH = FLOOR_COUNT * FLOOR_HEIGHT;
const midY = totalH / 2;
addWall(BUILDING_WIDTH, totalH, 0.1, 0, midY,  BUILDING_DEPTH / 2);  // front
addWall(BUILDING_WIDTH, totalH, 0.1, 0, midY, -BUILDING_DEPTH / 2);  // back
addWall(0.1, totalH, BUILDING_DEPTH, -BUILDING_WIDTH / 2, midY, 0);  // left
addWall(0.1, totalH, BUILDING_DEPTH,  BUILDING_WIDTH / 2, midY, 0);  // right

// Apply renderOrder to all building meshes.
building.traverse(obj => { if (obj.isMesh) obj.renderOrder = 0; });

// ---------- Elevator car ----------
// The car sits inside the shaft. Doors face +Z (front of building, where people wait).
const elevatorCar = new THREE.Group();
elevatorCar.renderOrder = 1;

const CAR_WIDTH  = SHAFT_WIDTH  - 0.1;
const CAR_DEPTH  = SHAFT_DEPTH  - 0.1;
const CAR_HEIGHT = FLOOR_HEIGHT - 0.4;

const frameMat = new THREE.MeshLambertMaterial({
    color: 0xffff00, transparent: true, opacity: 0.5,
    depthWrite: false, side: THREE.DoubleSide
});
const doorMat = new THREE.MeshLambertMaterial({
    color: 0xcccc00, transparent: true, opacity: 0.7,
    depthWrite: false, side: THREE.DoubleSide
});
const solidBackMat = new THREE.MeshLambertMaterial({ color: 0xffff00, side: THREE.DoubleSide });

// Car floor (solid-ish yellow frame).
// Top of car floor sits at local y = 0, so a person at local y = 0 stands on it.
const carFloor = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_DEPTH),
    frameMat
);
carFloor.position.y = -0.05;
elevatorCar.add(carFloor);

// Car ceiling.
const carCeil = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_WIDTH, 0.1, CAR_DEPTH),
    frameMat
);
carCeil.position.y = CAR_HEIGHT - 0.05;
elevatorCar.add(carCeil);

// Solid back wall.
const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, 0.05),
    solidBackMat
);
backWall.position.set(0, CAR_HEIGHT / 2, -CAR_DEPTH / 2);
elevatorCar.add(backWall);

// Transparent side walls.
const leftSide = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, CAR_HEIGHT, CAR_DEPTH),
    frameMat
);
leftSide.position.set(-CAR_WIDTH / 2, CAR_HEIGHT / 2, 0);
elevatorCar.add(leftSide);

const rightSide = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, CAR_HEIGHT, CAR_DEPTH),
    frameMat
);
rightSide.position.set(CAR_WIDTH / 2, CAR_HEIGHT / 2, 0);
elevatorCar.add(rightSide);

// Sliding doors on the front (+Z face). Each is half the car width; they meet at x = 0 when closed.
const doorWidth = CAR_WIDTH / 2;
const leftDoor = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth, CAR_HEIGHT, 0.05),
    doorMat
);
const rightDoor = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth, CAR_HEIGHT, 0.05),
    doorMat
);
// Closed positions: doors meet in the middle.
leftDoor.position.set(-doorWidth / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2);
rightDoor.position.set( doorWidth / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2);
elevatorCar.add(leftDoor);
elevatorCar.add(rightDoor);

// Store door state / references for the animation pipeline.
elevatorCar.userData.leftDoor  = leftDoor;
elevatorCar.userData.rightDoor = rightDoor;
elevatorCar.userData.leftDoorClosedX  = -doorWidth / 2;
elevatorCar.userData.rightDoorClosedX =  doorWidth / 2;
elevatorCar.userData.doorsOpen = false;

// Apply renderOrder so the elevator draws after the building.
elevatorCar.traverse(obj => { if (obj.isMesh) obj.renderOrder = 1; });

// Start the elevator at floor 1.
elevatorCar.position.set(0, 0, 0);
scene.add(elevatorCar);

// ---------- Floor geometry helpers ----------
// Where the elevator car must sit (y) to be on a given floor (0-indexed, 0..FLOOR_COUNT-1).
function elevatorYForFloor(floor) {
    return floor * FLOOR_HEIGHT;
}

// World-space waiting spot for a person on a given floor — in front of the shaft at +Z.
const WAIT_Z = SHAFT_DEPTH / 2 + 1.2;
function waitingSpotForFloor(floor) {
    return new THREE.Vector3(0, floor * FLOOR_HEIGHT, WAIT_Z);
}

// Interior spot inside the elevator (local coordinates for the car).
function interiorSpotLocal() {
    return new THREE.Vector3(0, 0, -CAR_DEPTH / 4);
}

// ---------- People ----------
// One person per floor initially, except one floor is empty.
const people = new Array(FLOOR_COUNT).fill(null); // people[floor] = person object OR null
let emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);

for (let f = 0; f < FLOOR_COUNT; f++) {
    if (f === emptyFloor) continue;
    const p = createPerson();
    const spot = waitingSpotForFloor(f);
    p.position.copy(spot);
    // Face the elevator (doors are at -Z relative to the waiting spot, so look toward -Z).
    p.rotation.y = Math.PI;
    scene.add(p);
    people[f] = p;
}

// ---------- Animation pipeline ----------
// Each step accepts a `done` callback; steps are chained via delays.
// All per-frame motion uses the speedMultiplier so the slider affects everything.

const clock = new THREE.Clock();
const activeWalkers = new Set(); // persons currently walking (for leg anim)

function delay(ms, done) {
    setTimeout(done, ms / speedMultiplier);
}

// Move the elevator to a target floor. Uses a per-frame tween.
function moveElevatorToFloor(targetFloor, done) {
    const targetY = elevatorYForFloor(targetFloor);
    function step() {
        const dt = clock.getDelta();
        const effSpeed = ELEVATOR_SPEED * speedMultiplier;
        const dy = targetY - elevatorCar.position.y;
        const dist = Math.abs(dy);
        if (dist < 0.01) {
            elevatorCar.position.y = targetY;
            done();
            return;
        }
        const move = Math.min(dist, effSpeed * dt) * Math.sign(dy);
        elevatorCar.position.y += move;
        requestAnimationFrame(step);
    }
    clock.getDelta(); // flush
    requestAnimationFrame(step);
}

// Slide doors to a target offset (0 = closed, DOOR_OPEN_OFFSET = fully open).
function animateDoors(targetOpen, done) {
    const left  = elevatorCar.userData.leftDoor;
    const right = elevatorCar.userData.rightDoor;
    const closedL = elevatorCar.userData.leftDoorClosedX;
    const closedR = elevatorCar.userData.rightDoorClosedX;
    const targetL = closedL - (targetOpen ? DOOR_OPEN_OFFSET : 0);
    const targetR = closedR + (targetOpen ? DOOR_OPEN_OFFSET : 0);

    function step() {
        const dt = clock.getDelta();
        const effSpeed = DOOR_SPEED * speedMultiplier;
        const dL = targetL - left.position.x;
        const dR = targetR - right.position.x;
        const distL = Math.abs(dL);
        const distR = Math.abs(dR);
        if (distL < 0.01 && distR < 0.01) {
            left.position.x  = targetL;
            right.position.x = targetR;
            elevatorCar.userData.doorsOpen = targetOpen;
            done();
            return;
        }
        left.position.x  += Math.min(distL, effSpeed * dt) * Math.sign(dL);
        right.position.x += Math.min(distR, effSpeed * dt) * Math.sign(dR);
        requestAnimationFrame(step);
    }
    clock.getDelta();
    requestAnimationFrame(step);
}

// Walk a person in world space toward a target world position (XZ only; Y is fixed by floor).
// `targetWorld` is a THREE.Vector3. Completes when within 0.01 units.
function walkPersonToWorld(person, targetWorld, done) {
    person.userData.isWalking = true;
    activeWalkers.add(person);

    function step() {
        const dt = clock.getDelta();
        const effSpeed = PERSON_MOVE_SPEED * speedMultiplier;

        // Get person's current world position.
        const worldPos = new THREE.Vector3();
        person.getWorldPosition(worldPos);
        const dx = targetWorld.x - worldPos.x;
        const dz = targetWorld.z - worldPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.01) {
            // Snap by converting target world -> parent-local.
            const local = targetWorld.clone();
            if (person.parent) person.parent.worldToLocal(local);
            person.position.x = local.x;
            person.position.z = local.z;
            person.userData.isWalking = false;
            activeWalkers.delete(person);
            done();
            return;
        }
        const move = Math.min(dist, effSpeed * dt);
        const nx = dx / dist, nz = dz / dist;
        // Translate in world space, then re-project into the parent's local space.
        worldPos.x += nx * move;
        worldPos.z += nz * move;
        const local = worldPos.clone();
        if (person.parent) person.parent.worldToLocal(local);
        person.position.x = local.x;
        person.position.z = local.z;

        requestAnimationFrame(step);
    }
    clock.getDelta();
    requestAnimationFrame(step);
}

// ---------- Simulation loop ----------
// On each cycle: pick a random occupied floor, move its person to the empty floor.

function runCycle() {
    // Find occupied floors.
    const occupied = [];
    for (let f = 0; f < FLOOR_COUNT; f++) {
        if (people[f] !== null) occupied.push(f);
    }
    if (occupied.length === 0) return; // shouldn't happen

    const fromFloor = occupied[Math.floor(Math.random() * occupied.length)];
    const toFloor = emptyFloor;
    const person = people[fromFloor];

    // 1. Move elevator to pickup floor.
    moveElevatorToFloor(fromFloor, () => {
        delay(STEP_DELAY_MS, () => {
            // 2. Open doors.
            animateDoors(true, () => {
                delay(STEP_DELAY_MS, () => {
                    // 3. Walk person INTO elevator (forward through doors = -Z).
                    // Target world position: directly in front of elevator at floor level, then inside.
                    const interiorLocal = interiorSpotLocal();
                    const interiorWorld = interiorLocal.clone();
                    elevatorCar.localToWorld(interiorWorld);
                    walkPersonToWorld(person, interiorWorld, () => {
                        // Reparent to elevator so they travel with it.
                        // Preserve current world transform.
                        const worldPos = new THREE.Vector3();
                        person.getWorldPosition(worldPos);
                        const worldQuat = new THREE.Quaternion();
                        person.getWorldQuaternion(worldQuat);

                        scene.remove(person);
                        elevatorCar.add(person);
                        const localPos = worldPos.clone();
                        elevatorCar.worldToLocal(localPos);
                        person.position.copy(localPos);
                        // Keep facing toward doors (+Z in car's local frame means outside).
                        // Person was facing -Z in world (rotation.y = PI). Car has no rotation,
                        // so keep rotation.y = PI.
                        person.rotation.y = Math.PI;

                        delay(STEP_DELAY_MS, () => {
                            // 4. Close doors.
                            animateDoors(false, () => {
                                delay(STEP_DELAY_MS, () => {
                                    // 5. Travel to destination.
                                    moveElevatorToFloor(toFloor, () => {
                                        delay(STEP_DELAY_MS, () => {
                                            // 6. Open doors at destination.
                                            animateDoors(true, () => {
                                                delay(STEP_DELAY_MS, () => {
                                                    // Before walking out, flip person to face outward (-Z world)
                                                    // so they walk forward through the doors.
                                                    // Actually person already faces -Z in world (rotation.y=PI on car).
                                                    // Walking target is waiting spot at toFloor (+Z world),
                                                    // and walkPersonToWorld moves toward it directly, so they
                                                    // will walk backward unless we turn them. Turn to face +Z.
                                                    person.rotation.y = 0;

                                                    const target = waitingSpotForFloor(toFloor);
                                                    walkPersonToWorld(person, target, () => {
                                                        // Reparent back to scene.
                                                        const wp = new THREE.Vector3();
                                                        person.getWorldPosition(wp);
                                                        elevatorCar.remove(person);
                                                        scene.add(person);
                                                        person.position.copy(wp);
                                                        // Face the elevator again.
                                                        person.rotation.y = Math.PI;

                                                        // Update bookkeeping.
                                                        people[fromFloor] = null;
                                                        people[toFloor] = person;
                                                        emptyFloor = fromFloor;

                                                        delay(STEP_DELAY_MS, () => {
                                                            // 8. Close doors.
                                                            animateDoors(false, () => {
                                                                delay(STEP_DELAY_MS, runCycle);
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
            });
        });
    });
}

// ---------- Render loop ----------
const walkClock = new THREE.Clock();
function render() {
    requestAnimationFrame(render);
    const dt = walkClock.getDelta() * speedMultiplier;
    activeWalkers.forEach(p => animatePersonWalking(p, dt));
    // Reset stationary persons to standing pose.
    for (let f = 0; f < FLOOR_COUNT; f++) {
        if (people[f] && !activeWalkers.has(people[f])) {
            animatePersonWalking(people[f], dt);
        }
    }
    controls.update();
    renderer.render(scene, camera);
}

// ---------- UI: speed slider ----------
function buildSpeedSlider() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.6);color:#fff;padding:10px;border-radius:6px;font-family:sans-serif;font-size:13px;z-index:10;';
    const label = document.createElement('div');
    label.textContent = 'Animation Speed: 1x';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.step = '1';
    slider.value = '1';
    slider.style.width = '200px';
    slider.addEventListener('input', () => {
        speedMultiplier = parseInt(slider.value, 10);
        label.textContent = 'Animation Speed: ' + speedMultiplier + 'x';
    });
    wrap.appendChild(label);
    wrap.appendChild(slider);
    document.body.appendChild(wrap);
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Boot ----------
buildSpeedSlider();
render();
runCycle();
