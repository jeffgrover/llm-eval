/**
 * elevator.js - 3D Elevator Simulation
 * 6-floor building with elevator transporting people between floors.
 *
 * Coordinate conventions:
 *   Y = up/vertical
 *   Z = front/back  (positive Z = in front of elevator doors)
 *   X = left/right
 *
 * Floor surfaces are at world Y = floorYPositions[i] = i * FLOOR_HEIGHT.
 * Person group origin is at their feet (y=0 of group = floor level).
 * People wait at +Z (in front of elevator); elevator doors face +Z.
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
var FLOOR_HEIGHT      = 3.0;    // height of each floor (metres)
var FLOOR_COUNT       = 6;      // number of usable floors
var BUILDING_WIDTH    = 10;
var BUILDING_DEPTH    = 8;
var SHAFT_WIDTH       = 2.2;
var SHAFT_DEPTH       = 2.2;
var ELEVATOR_SPEED    = 4.0;    // units/sec (base, scaled by simulationSpeed)
var PERSON_MOVE_SPEED = 2.2;    // units/sec (base)
var WAIT_ZONE_Z       = 2.8;    // world Z where people stand waiting (in front of shaft)
var INSIDE_Z          = -0.5;   // local Z inside elevator car (person stands here)
var FLOOR_PANEL_THICK = 0.08;   // thickness of floor panels

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
var scene, camera, renderer, controls, clock;
var elevatorCar;
var buildingGroup;
var floorYPositions = []; // world-Y of the TOP surface of each floor (feet level)
var people = [];          // { group: THREE.Group, floorIndex: int }
var emptyFloor = 0;
var simulationSpeed = 1;
var statusEl;

// ─── STATE MACHINE ────────────────────────────────────────────────────────────
var STATE = {
    IDLE:            'IDLE',
    MOVING_TO_PICK:  'MOVING_TO_PICK',
    DOOR_OPEN_PICK:  'DOOR_OPEN_PICK',
    BOARDING:        'BOARDING',
    DOOR_CLOSE_PICK: 'DOOR_CLOSE_PICK',
    MOVING_TO_DROP:  'MOVING_TO_DROP',
    DOOR_OPEN_DROP:  'DOOR_OPEN_DROP',
    EXITING:         'EXITING',
    DOOR_CLOSE_DROP: 'DOOR_CLOSE_DROP',
    WAIT:            'WAIT'
};
var currentState    = STATE.IDLE;
var currentPerson   = null;   // { group, floorIndex }
var targetPickFloor = -1;
var targetDropFloor = -1;
var stateTimer      = 0;

// Door animation
var doorOpenAmount  = 0;  // 0 = closed, 1 = fully open

// ─── INITIALISE ───────────────────────────────────────────────────────────────
function init() {
    statusEl = document.getElementById('status');

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    // --- Scene ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 50, 90);

    // --- Camera ---
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(25, 25, 25);
    var buildingCentreY = (FLOOR_COUNT * FLOOR_HEIGHT) / 2;
    camera.lookAt(0, buildingCentreY, 0);

    // --- OrbitControls ---
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, buildingCentreY, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // --- Clock ---
    clock = new THREE.Clock();

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0x8899ff, 0.3);
    fill.position.set(-15, 8, -15);
    scene.add(fill);

    // --- Build world ---
    computeFloorPositions();
    buildBuilding();
    buildElevator();
    placePeople();

    // --- UI controls ---
    var slider    = document.getElementById('speedSlider');
    var speedLabel = document.getElementById('speedValue');
    slider.addEventListener('input', function () {
        simulationSpeed = parseFloat(slider.value);
        speedLabel.textContent = simulationSpeed + 'x';
    });

    window.addEventListener('resize', onResize);

    // Start
    animate();
    scheduleNextMove();
}

// Floor Y = TOP surface of that floor's panel (= feet level for people)
function computeFloorPositions() {
    for (var i = 0; i < FLOOR_COUNT; i++) {
        floorYPositions[i] = i * FLOOR_HEIGHT;
    }
}

// ─── MATERIALS HELPERS ────────────────────────────────────────────────────────
function transMat(color, opacity, order) {
    var m = new THREE.MeshLambertMaterial({
        color:       color,
        transparent: true,
        opacity:     opacity,
        side:        THREE.DoubleSide,
        depthWrite:  false
    });
    m._renderOrder = order || 0;
    return m;
}

function solidMat(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

function makeMesh(geo, mat, px, py, pz, renderOrder) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.receiveShadow = true;
    if (renderOrder !== undefined) m.renderOrder = renderOrder;
    return m;
}

// ─── BUILDING ─────────────────────────────────────────────────────────────────
function buildBuilding() {
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    var bw   = BUILDING_WIDTH;
    var bd   = BUILDING_DEPTH;
    var sw   = SHAFT_WIDTH;
    var sd   = SHAFT_DEPTH;
    var totH = FLOOR_COUNT * FLOOR_HEIGHT;
    var wt   = 0.1;   // wall thickness
    var ft   = FLOOR_PANEL_THICK;

    var wallM  = transMat(0x9999ff, 0.20, 0);
    var floorM = transMat(0xcccccc, 0.30, 0);
    var shaftM = transMat(0x555566, 0.12, 0);
    var solidM = solidMat(0x888888);
    var pillarM = solidMat(0x777777);

    // Ground slab (solid) — top surface at y=0
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(bw, 0.15, bd), solidM, 0, -0.075, 0));

    // Roof slab (solid)
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(bw, 0.15, bd), solidM, 0, totH + 0.075, 0));

    // ── Outer walls ──────────────────────────────────────────────────────────
    // Front wall (positive Z)
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(bw, totH, wt), wallM, 0, totH / 2, bd / 2));
    // Back wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(bw, totH, wt), wallM, 0, totH / 2, -bd / 2));
    // Left wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(wt, totH, bd), wallM, -bw / 2, totH / 2, 0));
    // Right wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(wt, totH, bd), wallM, bw / 2, totH / 2, 0));

    // ── Shaft walls ──────────────────────────────────────────────────────────
    // Left shaft wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(wt, totH, sd), shaftM, -sw / 2, totH / 2, 0));
    // Right shaft wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(wt, totH, sd), shaftM, sw / 2, totH / 2, 0));
    // Back shaft wall
    buildingGroup.add(makeMesh(
        new THREE.BoxGeometry(sw + wt, totH, wt), shaftM, 0, totH / 2, -sd / 2));

    // ── Floor panels (i = 1..FLOOR_COUNT-1) ──────────────────────────────────
    // Each floor's TOP surface must be at floorYPositions[i].
    // BoxGeometry is centred, so centre = floorYPositions[i] - ft/2.
    for (var i = 1; i < FLOOR_COUNT; i++) {
        var surfaceY = floorYPositions[i];
        var centreY  = surfaceY - ft / 2;

        var leftW  = (bw - sw) / 2;
        var frontD = (bd - sd) / 2;

        // Left section
        buildingGroup.add(makeMesh(
            new THREE.BoxGeometry(leftW, ft, bd), floorM,
            -(sw / 2 + leftW / 2), centreY, 0));
        // Right section
        buildingGroup.add(makeMesh(
            new THREE.BoxGeometry(leftW, ft, bd), floorM,
            sw / 2 + leftW / 2, centreY, 0));
        // Front section (in front of shaft opening)
        buildingGroup.add(makeMesh(
            new THREE.BoxGeometry(sw, ft, frontD), floorM,
            0, centreY, sd / 2 + frontD / 2));
        // Back section
        buildingGroup.add(makeMesh(
            new THREE.BoxGeometry(sw, ft, frontD), floorM,
            0, centreY, -(sd / 2 + frontD / 2)));
    }

    // ── Floor marker strips (coloured ledge on shaft edge at each floor) ──────
    for (var fi = 0; fi < FLOOR_COUNT; fi++) {
        var markerY = floorYPositions[fi];
        var markerGeo = new THREE.BoxGeometry(0.18, 0.06, sd);
        var markerMat = new THREE.MeshLambertMaterial({ color: 0xffaa00 });
        var mL = new THREE.Mesh(markerGeo, markerMat);
        mL.position.set(-sw / 2 - 0.09, markerY + 0.03, 0);
        buildingGroup.add(mL);
        var mR = mL.clone();
        mR.position.set(sw / 2 + 0.09, markerY + 0.03, 0);
        buildingGroup.add(mR);
    }

    // ── Corner pillars for structure ──────────────────────────────────────────
    [[-bw / 2, -bd / 2], [-bw / 2, bd / 2],
     [ bw / 2, -bd / 2], [ bw / 2, bd / 2]].forEach(function (c) {
        var pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, totH, 0.18), pillarM);
        pillar.position.set(c[0], totH / 2, c[1]);
        buildingGroup.add(pillar);
    });
}

// ─── ELEVATOR ─────────────────────────────────────────────────────────────────
function buildElevator() {
    elevatorCar = new THREE.Group();
    scene.add(elevatorCar);

    var sw  = SHAFT_WIDTH;
    var sd  = SHAFT_DEPTH;
    var carH = FLOOR_HEIGHT * 0.88;   // car interior height
    var ft  = 0.06;                   // frame thickness

    var frameMat = transMat(0xffff00, 0.50, 1);
    var doorMat  = transMat(0xcccc00, 0.70, 1);
    var sideMat  = transMat(0xffff88, 0.15, 1);
    var flrMat   = solidMat(0xaaaa00);
    var backMat  = transMat(0xffff00, 0.40, 1);

    function add(mesh) {
        mesh.renderOrder = 1;
        elevatorCar.add(mesh);
        return mesh;
    }

    // Car floor (solid) — top at local y = 0.04
    var carFloor = new THREE.Mesh(
        new THREE.BoxGeometry(sw - ft, 0.04, sd - ft), flrMat);
    carFloor.position.set(0, 0.02, 0);
    carFloor.renderOrder = 1;
    elevatorCar.add(carFloor);

    // Ceiling
    add(makeMesh(new THREE.BoxGeometry(sw - ft, ft, sd - ft),
        frameMat, 0, carH - ft / 2, 0, 1));

    // Back wall (more opaque)
    add(makeMesh(new THREE.BoxGeometry(sw - ft * 2, carH, ft),
        backMat, 0, carH / 2, -(sd / 2 - ft / 2), 1));

    // Side walls (transparent so passengers visible)
    add(makeMesh(new THREE.BoxGeometry(ft, carH, sd),
        sideMat, -(sw / 2 - ft / 2), carH / 2, 0, 1));
    add(makeMesh(new THREE.BoxGeometry(ft, carH, sd),
        sideMat,  sw / 2 - ft / 2,  carH / 2, 0, 1));

    // Front frame pillars
    add(makeMesh(new THREE.BoxGeometry(ft, carH, ft),
        frameMat, -(sw / 2 - ft / 2), carH / 2, sd / 2 - ft / 2, 1));
    add(makeMesh(new THREE.BoxGeometry(ft, carH, ft),
        frameMat,  sw / 2 - ft / 2,  carH / 2, sd / 2 - ft / 2, 1));

    // Top frame bar above door
    add(makeMesh(new THREE.BoxGeometry(sw - ft * 2, ft, ft),
        frameMat, 0, carH - ft / 2, sd / 2 - ft / 2, 1));

    // ── Sliding doors ─────────────────────────────────────────────────────────
    // Opening width = sw - ft*2
    // Each door half-width = half of opening
    var openingW = sw - ft * 2;
    var doorW    = openingW / 2;
    var doorH    = carH - ft * 2;

    var leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, ft * 1.5), doorMat);
    leftDoor.renderOrder = 2;
    // Closed: left door centre at x = -(doorW/2)
    leftDoor.position.set(-(doorW / 2), ft + doorH / 2, sd / 2);
    elevatorCar.add(leftDoor);

    var rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, ft * 1.5), doorMat);
    rightDoor.renderOrder = 2;
    // Closed: right door centre at x = +(doorW/2)
    rightDoor.position.set(doorW / 2, ft + doorH / 2, sd / 2);
    elevatorCar.add(rightDoor);

    // Store references for animation
    elevatorCar.leftDoor         = leftDoor;
    elevatorCar.rightDoor        = rightDoor;
    elevatorCar.leftDoorClosedX  = -(doorW / 2);
    elevatorCar.rightDoorClosedX =   doorW / 2;
    elevatorCar.doorW = doorW;
    elevatorCar.carH  = carH;
    // Local Y of car floor surface (where person stands inside)
    elevatorCar.floorLocalY = 0.04;

    // Start at floor 0
    elevatorCar.position.set(0, floorYPositions[0], 0);
    elevatorCar.currentFloor = 0;
}

// ─── PEOPLE ───────────────────────────────────────────────────────────────────
function placePeople() {
    for (var i = 0; i < FLOOR_COUNT; i++) {
        if (i === emptyFloor) continue;
        spawnPersonOnFloor(i);
    }
}

function spawnPersonOnFloor(floorIndex) {
    var person = createPerson();
    var floorY = floorYPositions[floorIndex];

    // Stand in front of elevator doors (positive Z), feet on floor surface
    person.position.set(0, floorY, WAIT_ZONE_Z);

    // Face toward elevator (rotate so visual front faces -Z = toward shaft)
    // Person model's visual front is on +Z local; rotating 180° on Y makes
    // +Z local → -Z world = facing the elevator which is at lower Z.
    person.rotation.y = Math.PI;

    scene.add(person);
    people.push({ group: person, floorIndex: floorIndex });
}

function getPersonOnFloor(floorIndex) {
    for (var i = 0; i < people.length; i++) {
        if (people[i].floorIndex === floorIndex) return people[i];
    }
    return null;
}

// ─── SIMULATION ───────────────────────────────────────────────────────────────
function scheduleNextMove() {
    var occupied = [];
    for (var i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) occupied.push(i);
    }
    if (!occupied.length) return;

    targetPickFloor = occupied[Math.floor(Math.random() * occupied.length)];
    targetDropFloor = emptyFloor;
    currentPerson   = getPersonOnFloor(targetPickFloor);

    setStatus('Moving to floor ' + (targetPickFloor + 1) + ' to collect passenger');
    currentState = STATE.MOVING_TO_PICK;
}

function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
}

// ─── DOOR ANIMATION ───────────────────────────────────────────────────────────
// Returns true when target is reached.
function updateDoors(target, dt) {
    var speed = simulationSpeed * 1.6;
    if (target > doorOpenAmount) {
        doorOpenAmount = Math.min(doorOpenAmount + dt * speed, target);
    } else {
        doorOpenAmount = Math.max(doorOpenAmount - dt * speed, target);
    }

    var offset = elevatorCar.doorW * doorOpenAmount;
    elevatorCar.leftDoor.position.x  = elevatorCar.leftDoorClosedX  - offset;
    elevatorCar.rightDoor.position.x = elevatorCar.rightDoorClosedX + offset;

    return Math.abs(doorOpenAmount - target) < 0.01;
}

// ─── PERSON MOVEMENT ──────────────────────────────────────────────────────────
// Move a person (in scene space) toward worldTarget. Returns true when arrived.
function movePerson(personObj, worldTarget, dt) {
    var p = personObj.group;
    var dx = worldTarget.x - p.position.x;
    var dy = worldTarget.y - p.position.y;
    var dz = worldTarget.z - p.position.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.025) {
        p.position.copy(worldTarget);
        resetPersonPose(p);
        return true;
    }

    var step = Math.min(PERSON_MOVE_SPEED * simulationSpeed * dt, dist);
    p.position.x += (dx / dist) * step;
    p.position.y += (dy / dist) * step;
    p.position.z += (dz / dist) * step;
    animatePersonWalking(p, dt);
    return false;
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    controls.update();
    updateSimulation(dt);
    renderer.render(scene, camera);
}

function updateSimulation(dt) {
    switch (currentState) {

        // ── 1. Move elevator to pickup floor ─────────────────────────────────
        case STATE.MOVING_TO_PICK: {
            var targetY = floorYPositions[targetPickFloor];
            var dy = targetY - elevatorCar.position.y;
            if (Math.abs(dy) < 0.02) {
                elevatorCar.position.y = targetY;
                elevatorCar.currentFloor = targetPickFloor;
                currentState = STATE.DOOR_OPEN_PICK;
                setStatus('Floor ' + (targetPickFloor + 1) + ': opening doors');
            } else {
                elevatorCar.position.y +=
                    Math.sign(dy) * Math.min(ELEVATOR_SPEED * simulationSpeed * dt, Math.abs(dy));
            }
            break;
        }

        // ── 2. Open doors at pickup ──────────────────────────────────────────
        case STATE.DOOR_OPEN_PICK: {
            if (updateDoors(1, dt)) {
                currentState = STATE.BOARDING;
                setStatus('Floor ' + (targetPickFloor + 1) + ': passenger boarding');
            }
            break;
        }

        // ── 3. Person walks forward into elevator ────────────────────────────
        case STATE.BOARDING: {
            if (!currentPerson) { currentState = STATE.DOOR_CLOSE_PICK; break; }

            // Board target in world space: walk through door into elevator
            var floorY = floorYPositions[targetPickFloor];
            var boardTarget = new THREE.Vector3(
                0,
                floorY,
                elevatorCar.position.z + INSIDE_Z  // cross the door, end up inside
            );

            if (movePerson(currentPerson, boardTarget, dt)) {
                // Reparent to elevator so they travel with it
                scene.remove(currentPerson.group);
                elevatorCar.add(currentPerson.group);

                // Local position inside elevator car (on car floor)
                currentPerson.group.position.set(0, elevatorCar.floorLocalY, INSIDE_Z);
                // Face the door (local +Z faces the door, which is at local +Z)
                currentPerson.group.rotation.y = 0;

                // Remove from floor people list (in transit)
                var idx = people.indexOf(currentPerson);
                if (idx !== -1) people.splice(idx, 1);

                currentState = STATE.DOOR_CLOSE_PICK;
                setStatus('Floor ' + (targetPickFloor + 1) + ': doors closing');
            }
            break;
        }

        // ── 4. Close doors after boarding ───────────────────────────────────
        case STATE.DOOR_CLOSE_PICK: {
            if (updateDoors(0, dt)) {
                currentState = STATE.MOVING_TO_DROP;
                setStatus('Travelling to floor ' + (targetDropFloor + 1));
            }
            break;
        }

        // ── 5. Move elevator to drop floor ───────────────────────────────────
        case STATE.MOVING_TO_DROP: {
            var targetY2 = floorYPositions[targetDropFloor];
            var dy2 = targetY2 - elevatorCar.position.y;
            if (Math.abs(dy2) < 0.02) {
                elevatorCar.position.y = targetY2;
                elevatorCar.currentFloor = targetDropFloor;
                currentState = STATE.DOOR_OPEN_DROP;
                setStatus('Floor ' + (targetDropFloor + 1) + ': opening doors');
            } else {
                elevatorCar.position.y +=
                    Math.sign(dy2) * Math.min(ELEVATOR_SPEED * simulationSpeed * dt, Math.abs(dy2));
            }
            break;
        }

        // ── 6. Open doors at drop floor ──────────────────────────────────────
        case STATE.DOOR_OPEN_DROP: {
            if (updateDoors(1, dt)) {
                // Move person back to scene space before they walk out
                if (currentPerson) {
                    var dropFloorY = floorYPositions[targetDropFloor];
                    elevatorCar.remove(currentPerson.group);
                    scene.add(currentPerson.group);

                    // Place at the elevator door threshold in world space
                    currentPerson.group.position.set(
                        0,
                        dropFloorY,
                        elevatorCar.position.z + SHAFT_DEPTH / 2 + 0.05
                    );
                    // Face outward (+Z toward waiting zone) — rotation.y = 0 means
                    // the model's local +Z (visual front) points toward +Z world.
                    // Since person was facing -Z (rotation.y = Math.PI) when waiting,
                    // rotation.y = 0 makes them face the opposite direction = toward zone.
                    currentPerson.group.rotation.y = 0;
                    currentPerson.floorIndex = targetDropFloor;
                }
                currentState = STATE.EXITING;
                setStatus('Floor ' + (targetDropFloor + 1) + ': passenger exiting');
            }
            break;
        }

        // ── 7. Person walks out to waiting spot ──────────────────────────────
        case STATE.EXITING: {
            if (!currentPerson) { currentState = STATE.DOOR_CLOSE_DROP; break; }

            var exitFloorY = floorYPositions[targetDropFloor];
            var exitTarget = new THREE.Vector3(0, exitFloorY, WAIT_ZONE_Z);

            if (movePerson(currentPerson, exitTarget, dt)) {
                // Person arrived; turn them to face elevator again
                currentPerson.group.rotation.y = Math.PI;
                currentPerson.floorIndex = targetDropFloor;
                people.push(currentPerson);

                // The pickup floor is now empty
                emptyFloor = targetPickFloor;
                currentPerson = null;

                currentState = STATE.DOOR_CLOSE_DROP;
                setStatus('Floor ' + (targetDropFloor + 1) + ': doors closing');
            }
            break;
        }

        // ── 8. Close doors after exit ────────────────────────────────────────
        case STATE.DOOR_CLOSE_DROP: {
            if (updateDoors(0, dt)) {
                currentState = STATE.WAIT;
                stateTimer   = 0.7;
            }
            break;
        }

        // ── 9. Brief pause before next cycle ─────────────────────────────────
        case STATE.WAIT: {
            stateTimer -= dt * simulationSpeed;
            if (stateTimer <= 0) {
                setStatus('Selecting next passenger…');
                scheduleNextMove();
            }
            break;
        }

        case STATE.IDLE:
        default:
            break;
    }
}

// ─── RESIZE ───────────────────────────────────────────────────────────────────
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
