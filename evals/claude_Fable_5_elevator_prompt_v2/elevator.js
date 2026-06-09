// elevator.js
// Main logic for the 3D elevator simulation: scene setup, the 6-floor
// building, the elevator car with sliding doors, the people, and the
// endless pickup/drop-off animation cycle.
//
// Plain script (no ES module syntax). Load order: three.min.js,
// OrbitControls.js, person.js, then this file. Everything lives in
// top-level globals.

// ---------------------------------------------------------------------------
// Core constants — top-level consts, exact names per the project contract
// ---------------------------------------------------------------------------
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;       // vertical travel, units/second (scaled by slider)
const PERSON_MOVE_SPEED = 1;    // walking speed, units/second (scaled by slider)

// Additional layout / animation constants
const FLOOR_THICKNESS = 0.2;
const CAR_WIDTH = 4;
const CAR_DEPTH = 4;
const CAR_HEIGHT = 2.6;
const DOOR_PANEL_WIDTH = 1.25;  // width of each sliding half-door
const DOOR_HEIGHT = 2.4;
const DOOR_SLIDE_DISTANCE = 1.25;
const DOOR_SPEED = 1.5;         // door sliding speed, units/second
const TURN_SPEED = 4;           // person turn rate, radians/second
const WAIT_DISTANCE = 4.5;      // world Z of the waiting spot in front of the doors
const STEP_DELAY_MS = 300;      // pause between animation steps

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let scene, camera, renderer, controls;
let elevatorCar;                // THREE.Group — assigned in init()
const people = [];              // person groups, one per occupied floor
let emptyFloor = 0;             // the single unoccupied floor
let speedMultiplier = 1;        // 1x..20x, driven by the UI slider
let lastFrameTime = null;
const activeAnimations = [];    // { update(dt) -> boolean done, onComplete }

function floorY(floorIndex) {
  return floorIndex * FLOOR_HEIGHT;
}

// Every transparent surface gets depthWrite:false + DoubleSide so floors and
// walls never z-fight or vanish while the camera orbits.
function makeTransparentMaterial(color, opacity) {
  return new THREE.MeshLambertMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------
function createBuilding() {
  const totalHeight = FLOOR_COUNT * FLOOR_HEIGHT;
  const solidMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
  const floorMaterial = makeTransparentMaterial(0xcccccc, 0.3);
  const wallMaterial = makeTransparentMaterial(0x9999ff, 0.2);

  function addBox(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 0;       // building renders before the elevator
    scene.add(mesh);
    return mesh;
  }

  // Solid ground floor and roof (slab tops at y=0 and bottom of roof at y=18)
  addBox(solidMaterial, BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH, 0, -FLOOR_THICKNESS / 2, 0);
  addBox(solidMaterial, BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH, 0, totalHeight + FLOOR_THICKNESS / 2, 0);

  // Transparent floor slabs (floors 1..5), each built from four pieces so the
  // elevator shaft is cut out of the center of every floor.
  const sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
  const apronDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
  for (let i = 1; i < FLOOR_COUNT; i++) {
    const y = floorY(i) - FLOOR_THICKNESS / 2;   // slab top surface == floorY(i)
    addBox(floorMaterial, sideWidth, FLOOR_THICKNESS, BUILDING_DEPTH, -(SHAFT_WIDTH + sideWidth) / 2, y, 0);
    addBox(floorMaterial, sideWidth, FLOOR_THICKNESS, BUILDING_DEPTH, (SHAFT_WIDTH + sideWidth) / 2, y, 0);
    addBox(floorMaterial, SHAFT_WIDTH, FLOOR_THICKNESS, apronDepth, 0, y, (SHAFT_DEPTH + apronDepth) / 2);
    addBox(floorMaterial, SHAFT_WIDTH, FLOOR_THICKNESS, apronDepth, 0, y, -(SHAFT_DEPTH + apronDepth) / 2);
  }

  // Semi-transparent exterior walls
  function addWall(w, h, x, y, z, rotY) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMaterial);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    wall.renderOrder = 0;
    scene.add(wall);
    return wall;
  }
  addWall(BUILDING_WIDTH, totalHeight, 0, totalHeight / 2, BUILDING_DEPTH / 2, 0);            // front
  addWall(BUILDING_WIDTH, totalHeight, 0, totalHeight / 2, -BUILDING_DEPTH / 2, 0);           // back
  addWall(BUILDING_DEPTH, totalHeight, -BUILDING_WIDTH / 2, totalHeight / 2, 0, Math.PI / 2); // left
  addWall(BUILDING_DEPTH, totalHeight, BUILDING_WIDTH / 2, totalHeight / 2, 0, Math.PI / 2);  // right

  // Large opaque ground plane for spatial orientation
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshLambertMaterial({ color: 0x2f3640 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.renderOrder = 0;
  scene.add(ground);
}

// ---------------------------------------------------------------------------
// Elevator car
// ---------------------------------------------------------------------------
// The group's origin is at the car's walking surface: when the car is at
// floor i, elevatorCar.position.y === floorY(i) and passengers stand at
// local y = 0 — exactly level with the building floor.
function createElevator() {
  const car = new THREE.Group();
  const frameMaterial = makeTransparentMaterial(0xffff00, 0.5);
  const doorMaterial = makeTransparentMaterial(0xcccc00, 0.7);
  const backWallMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00, side: THREE.DoubleSide });

  function addPart(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 1;       // elevator renders after the building
    car.add(mesh);
    return mesh;
  }

  // Car floor: top surface at local y = 0, extended slightly toward the
  // landing (a sill) so there is no visible gap while people walk in.
  addPart(frameMaterial, CAR_WIDTH, 0.1, CAR_DEPTH + 0.5, 0, -0.05, 0.25);
  // Ceiling
  addPart(frameMaterial, CAR_WIDTH, 0.1, CAR_DEPTH, 0, CAR_HEIGHT + 0.05, 0);
  // Solid back wall
  addPart(backWallMaterial, CAR_WIDTH, CAR_HEIGHT, 0.1, 0, CAR_HEIGHT / 2, -(CAR_DEPTH / 2 - 0.05));
  // Transparent side walls
  addPart(frameMaterial, 0.1, CAR_HEIGHT, CAR_DEPTH, -(CAR_WIDTH / 2 - 0.05), CAR_HEIGHT / 2, 0);
  addPart(frameMaterial, 0.1, CAR_HEIGHT, CAR_DEPTH, CAR_WIDTH / 2 - 0.05, CAR_HEIGHT / 2, 0);
  // Front pillars on both sides of the door opening
  const pillarWidth = (CAR_WIDTH - 2 * DOOR_PANEL_WIDTH) / 2;
  addPart(frameMaterial, pillarWidth, CAR_HEIGHT, 0.1, -(CAR_WIDTH - pillarWidth) / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2 - 0.05);
  addPart(frameMaterial, pillarWidth, CAR_HEIGHT, 0.1, (CAR_WIDTH - pillarWidth) / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2 - 0.05);

  // Sliding doors just in front of the car face; they meet at x = 0 when
  // closed and retract outward from the center when opening.
  const doorGeometry = new THREE.BoxGeometry(DOOR_PANEL_WIDTH, DOOR_HEIGHT, 0.08);
  const doorZ = CAR_DEPTH / 2 + 0.06;

  const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
  leftDoor.position.set(-DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
  leftDoor.renderOrder = 1;
  leftDoor.userData.closedX = leftDoor.position.x;
  car.add(leftDoor);

  const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
  rightDoor.position.set(DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
  rightDoor.renderOrder = 1;
  rightDoor.userData.closedX = rightDoor.position.x;
  car.add(rightDoor);

  // Direct door references for the animation code (naming contract H5)
  car.leftDoor = leftDoor;
  car.rightDoor = rightDoor;
  car.doorsOpen = false;

  return car;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function createPeople() {
  emptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
  for (let f = 0; f < FLOOR_COUNT; f++) {
    if (f === emptyFloor) continue;
    const person = createPerson();
    // Initial placement: the person has no prior world position yet, so a
    // plain add() is correct here. All later reparenting uses attach().
    person.position.set(0, floorY(f), WAIT_DISTANCE);
    person.rotation.y = Math.PI;          // face the elevator doors (toward -Z)
    person.userData.currentFloor = f;
    scene.add(person);
    people.push(person);
  }
}

// ---------------------------------------------------------------------------
// Animation task pipeline (callback-based sequential steps)
// ---------------------------------------------------------------------------
// Each task's update(dt) runs once per frame (dt already scaled by the speed
// slider) and returns true when finished; onComplete then chains the next
// step of the sequence.
function addAnimationTask(update, onComplete) {
  activeAnimations.push({ update: update, onComplete: onComplete });
}

function delay(ms, callback) {
  let elapsed = 0;
  addAnimationTask(function (dt) {
    elapsed += dt * 1000;
    return elapsed >= ms;
  }, callback);
}

function moveElevatorToFloor(targetFloor, callback) {
  const targetHeight = floorY(targetFloor);
  addAnimationTask(function (dt) {
    const diff = targetHeight - elevatorCar.position.y;
    const step = ELEVATOR_SPEED * dt;
    if (Math.abs(diff) < 0.01 || step >= Math.abs(diff)) {
      elevatorCar.position.y = targetHeight;
      return true;
    }
    elevatorCar.position.y += Math.sign(diff) * step;
    return false;
  }, callback);
}

function animateDoors(open, callback) {
  const leftDoor = elevatorCar.leftDoor;
  const rightDoor = elevatorCar.rightDoor;
  const leftTarget = leftDoor.userData.closedX - (open ? DOOR_SLIDE_DISTANCE : 0);
  const rightTarget = rightDoor.userData.closedX + (open ? DOOR_SLIDE_DISTANCE : 0);

  addAnimationTask(function (dt) {
    const step = DOOR_SPEED * dt;
    let done = true;
    const pairs = [[leftDoor, leftTarget], [rightDoor, rightTarget]];
    for (let i = 0; i < pairs.length; i++) {
      const door = pairs[i][0];
      const target = pairs[i][1];
      const diff = target - door.position.x;
      if (Math.abs(diff) < 0.01 || step >= Math.abs(diff)) {
        door.position.x = target;
      } else {
        door.position.x += Math.sign(diff) * step;
        done = false;
      }
    }
    return done;
  }, function () {
    elevatorCar.doorsOpen = open;     // door state tracked to avoid conflicts
    if (callback) callback();
  });
}

function openDoors(callback) {
  if (elevatorCar.doorsOpen) { if (callback) callback(); return; }
  animateDoors(true, callback);
}

function closeDoors(callback) {
  if (!elevatorCar.doorsOpen) { if (callback) callback(); return; }
  animateDoors(false, callback);
}

// Walk a person to (targetX, targetZ) expressed in the person's CURRENT
// parent's coordinate space (scene or elevatorCar). Y is never touched, so
// the person's feet stay glued to the floor they are on.
function walkPersonTo(person, targetX, targetZ, callback) {
  const startDx = targetX - person.position.x;
  const startDz = targetZ - person.position.z;
  if (Math.sqrt(startDx * startDx + startDz * startDz) > 0.01) {
    person.rotation.y = Math.atan2(startDx, startDz);   // face walking direction
  }
  person.userData.isWalking = true;

  addAnimationTask(function (dt) {
    const dx = targetX - person.position.x;
    const dz = targetZ - person.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = PERSON_MOVE_SPEED * dt;
    if (dist < 0.01 || step >= dist) {
      person.position.x = targetX;
      person.position.z = targetZ;
      return true;
    }
    person.position.x += (dx / dist) * step;
    person.position.z += (dz / dist) * step;
    return false;
  }, function () {
    person.userData.isWalking = false;
    if (callback) callback();
  });
}

// Smoothly rotate a person around Y to targetAngle (shortest direction).
function turnPersonTo(person, targetAngle, callback) {
  addAnimationTask(function (dt) {
    let diff = targetAngle - person.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = TURN_SPEED * dt;
    if (Math.abs(diff) < 0.01 || step >= Math.abs(diff)) {
      person.rotation.y = targetAngle;
      return true;
    }
    person.rotation.y += Math.sign(diff) * step;
    return false;
  }, callback);
}

// Per-frame leg swing for everyone currently walking; legs ease back to the
// standing pose when stationary.
function updateWalkingAnimations(dt) {
  for (let i = 0; i < people.length; i++) {
    const data = people[i].userData;
    if (!data || !data.leftLeg || !data.rightLeg) continue;
    if (data.isWalking) {
      data.walkTime = (data.walkTime || 0) + dt;
      const swing = Math.sin(data.walkTime * 8) * 0.5;
      data.leftLeg.rotation.x = swing;
      data.rightLeg.rotation.x = -swing;
    } else {
      data.walkTime = 0;
      data.leftLeg.rotation.x *= 0.8;
      data.rightLeg.rotation.x *= 0.8;
      if (Math.abs(data.leftLeg.rotation.x) < 0.01) data.leftLeg.rotation.x = 0;
      if (Math.abs(data.rightLeg.rotation.x) < 0.01) data.rightLeg.rotation.x = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation cycle
// ---------------------------------------------------------------------------
// Pick a random person and move them to the currently empty floor; their old
// floor becomes the new empty one. Repeats forever.
function runCycle() {
  if (people.length === 0) return;

  const passenger = people[Math.floor(Math.random() * people.length)];
  const pickupFloor = passenger.userData.currentFloor;
  const destinationFloor = emptyFloor;

  // 1. Elevator moves to the pickup floor
  moveElevatorToFloor(pickupFloor, function () {
    delay(STEP_DELAY_MS, function () {
      // 2. Doors open
      openDoors(function () {
        delay(STEP_DELAY_MS, function () {
          // 3. Person walks forward through the doors into the car
          //    (scene coordinates; the car is centered at x=0, z=0)
          walkPersonTo(passenger, 0, 0, function () {
            // Board: scene -> elevator. attach() preserves the world
            // transform, so the passenger stays exactly at floor height.
            elevatorCar.attach(passenger);
            // Turn around to face the doors for the ride
            turnPersonTo(passenger, 0, function () {
              delay(STEP_DELAY_MS, function () {
                // 4. Doors close
                closeDoors(function () {
                  delay(STEP_DELAY_MS, function () {
                    // 5. Elevator travels; the passenger rides as a child
                    moveElevatorToFloor(destinationFloor, function () {
                      delay(STEP_DELAY_MS, function () {
                        // 6. Doors open at the destination
                        openDoors(function () {
                          delay(STEP_DELAY_MS, function () {
                            // 7. Person walks forward out to the waiting spot
                            //    (elevatorCar-local coords; car x/z = 0, so
                            //    local WAIT_DISTANCE == world WAIT_DISTANCE)
                            walkPersonTo(passenger, 0, WAIT_DISTANCE, function () {
                              // Exit: elevator -> scene, world position kept
                              scene.attach(passenger);
                              passenger.userData.currentFloor = destinationFloor;
                              emptyFloor = pickupFloor;
                              turnPersonTo(passenger, Math.PI, function () {
                                // 8. Doors close, then the next trip begins
                                closeDoors(function () {
                                  delay(STEP_DELAY_MS * 2, runCycle);
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
  });
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function animate(time) {
  requestAnimationFrame(animate);
  if (lastFrameTime === null) lastFrameTime = time;
  const rawDt = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;
  const dt = rawDt * speedMultiplier;

  // Advance active animation tasks; completed ones chain their next step.
  const finished = [];
  for (let i = activeAnimations.length - 1; i >= 0; i--) {
    const task = activeAnimations[i];
    if (task.update(dt)) {
      activeAnimations.splice(i, 1);
      finished.push(task);
    }
  }
  for (let i = 0; i < finished.length; i++) {
    if (finished[i].onComplete) finished[i].onComplete();
  }

  updateWalkingAnimations(dt);

  controls.update();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupSpeedSlider() {
  const slider = document.getElementById('speedSlider');
  const valueLabel = document.getElementById('speedValue');
  if (!slider) return;
  function applySpeed() {
    speedMultiplier = parseFloat(slider.value) || 1;
    if (valueLabel) valueLabel.textContent = speedMultiplier + 'x';
  }
  slider.addEventListener('input', applySpeed);
  applySpeed();
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(25, 25, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.sortObjects = true;    // proper depth sorting for transparency
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);  // building center
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.7);
  sun.position.set(30, 50, 25);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-20, 20, -30);
  scene.add(fill);

  createBuilding();

  elevatorCar = createElevator();
  elevatorCar.position.set(0, floorY(0), 0);
  scene.add(elevatorCar);

  createPeople();
  setupSpeedSlider();

  window.addEventListener('resize', onWindowResize);

  requestAnimationFrame(animate);
  delay(800, runCycle);           // kick off the first trip shortly after load
}

// ---------------------------------------------------------------------------
// Auto-start on page load (top-level invocation — rule H3)
// ---------------------------------------------------------------------------
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
