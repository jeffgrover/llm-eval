// elevator.js
// Main logic for the 3D elevator simulation.
// Plain script — everything lives in top-level globals.

// ---------------------------------------------------------------------------
// Core constants (top-level, exact names per contract)
// ---------------------------------------------------------------------------
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// Additional layout / animation constants
const FLOOR_THICKNESS = 0.2;
const CAR_WIDTH = 4;
const CAR_DEPTH = 4;
const CAR_HEIGHT = 2.6;
const DOOR_PANEL_WIDTH = 1.25;
const DOOR_HEIGHT = 2.4;
const DOOR_SLIDE_DISTANCE = 1.25;
const DOOR_SPEED = 1.5;
const TURN_SPEED = 4;
const WAIT_DISTANCE = 4.5;
const STEP_DELAY_MS = 300;

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let scene, camera, renderer, controls;
let elevatorCar;
const people = [];
let emptyFloor = 0;
let speedMultiplier = 1;
let lastFrameTime = null;
const activeAnimations = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function floorY(i) {
  return i * FLOOR_HEIGHT;
}

function makeTransparent(color, opacity) {
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
  const solidMat = new THREE.MeshLambertMaterial({ color: 0x8899aa, side: THREE.DoubleSide });
  const floorMat = makeTransparent(0xbbccd8, 0.35);
  const wallMat = makeTransparent(0x9999ff, 0.15);

  function addBox(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 0;
    scene.add(mesh);
    return mesh;
  }

  // Solid ground floor and roof slabs.
  addBox(solidMat, BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH,
         0, -FLOOR_THICKNESS / 2, 0);
  addBox(solidMat, BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH,
         0, totalHeight + FLOOR_THICKNESS / 2, 0);

  // Transparent floor slabs (floors 1–5) with shaft cutout.
  const sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
  const apronDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
  for (let i = 1; i < FLOOR_COUNT; i++) {
    const y = floorY(i) - FLOOR_THICKNESS / 2;
    // Left piece
    addBox(floorMat, sideWidth, FLOOR_THICKNESS, BUILDING_DEPTH,
           -(SHAFT_WIDTH + sideWidth) / 2, y, 0);
    // Right piece
    addBox(floorMat, sideWidth, FLOOR_THICKNESS, BUILDING_DEPTH,
           (SHAFT_WIDTH + sideWidth) / 2, y, 0);
    // Front apron
    addBox(floorMat, SHAFT_WIDTH, FLOOR_THICKNESS, apronDepth,
           0, y, (SHAFT_DEPTH + apronDepth) / 2);
    // Back apron
    addBox(floorMat, SHAFT_WIDTH, FLOOR_THICKNESS, apronDepth,
           0, y, -(SHAFT_DEPTH + apronDepth) / 2);
  }

  // Semi-transparent exterior walls.
  function addWall(w, h, x, y, z, rotY) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    wall.renderOrder = 0;
    scene.add(wall);
  }
  addWall(BUILDING_WIDTH, totalHeight, 0, totalHeight / 2, BUILDING_DEPTH / 2, 0);
  addWall(BUILDING_WIDTH, totalHeight, 0, totalHeight / 2, -BUILDING_DEPTH / 2, 0);
  addWall(BUILDING_DEPTH, totalHeight, -BUILDING_WIDTH / 2, totalHeight / 2, 0, Math.PI / 2);
  addWall(BUILDING_DEPTH, totalHeight, BUILDING_WIDTH / 2, totalHeight / 2, 0, Math.PI / 2);

  // Ground plane for spatial orientation.
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
function createElevator() {
  const car = new THREE.Group();
  const frameMat = makeTransparent(0xffd600, 0.5);
  const doorMat = makeTransparent(0xcccc00, 0.7);
  const backWallMat = new THREE.MeshLambertMaterial({ color: 0xffd600, side: THREE.DoubleSide });

  function addPart(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 1;
    car.add(mesh);
    return mesh;
  }

  // Floor sill (extends slightly toward landing).
  addPart(frameMat, CAR_WIDTH, 0.1, CAR_DEPTH + 0.5, 0, -0.05, 0.25);
  // Ceiling.
  addPart(frameMat, CAR_WIDTH, 0.1, CAR_DEPTH, 0, CAR_HEIGHT + 0.05, 0);
  // Solid back wall.
  addPart(backWallMat, CAR_WIDTH, CAR_HEIGHT, 0.1,
          0, CAR_HEIGHT / 2, -(CAR_DEPTH / 2 - 0.05));
  // Transparent side walls.
  addPart(frameMat, 0.1, CAR_HEIGHT, CAR_DEPTH,
          -(CAR_WIDTH / 2 - 0.05), CAR_HEIGHT / 2, 0);
  addPart(frameMat, 0.1, CAR_HEIGHT, CAR_DEPTH,
          (CAR_WIDTH / 2 - 0.05), CAR_HEIGHT / 2, 0);

  // Front pillars.
  const pillarWidth = (CAR_WIDTH - 2 * DOOR_PANEL_WIDTH) / 2;
  addPart(frameMat, pillarWidth, CAR_HEIGHT, 0.1,
          -(CAR_WIDTH - pillarWidth) / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2 - 0.05);
  addPart(frameMat, pillarWidth, CAR_HEIGHT, 0.1,
          (CAR_WIDTH - pillarWidth) / 2, CAR_HEIGHT / 2, CAR_DEPTH / 2 - 0.05);

  // Sliding doors.
  const doorGeometry = new THREE.BoxGeometry(DOOR_PANEL_WIDTH, DOOR_HEIGHT, 0.08);
  const doorZ = CAR_DEPTH / 2 + 0.06;

  const leftDoor = new THREE.Mesh(doorGeometry, doorMat);
  leftDoor.position.set(-DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
  leftDoor.renderOrder = 1;
  leftDoor.userData.closedX = leftDoor.position.x;
  car.add(leftDoor);

  const rightDoor = new THREE.Mesh(doorGeometry, doorMat);
  rightDoor.position.set(DOOR_PANEL_WIDTH / 2, DOOR_HEIGHT / 2, doorZ);
  rightDoor.renderOrder = 1;
  rightDoor.userData.closedX = rightDoor.position.x;
  car.add(rightDoor);

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
    person.position.set(0, floorY(f), WAIT_DISTANCE);
    person.rotation.y = Math.PI;
    person.userData.currentFloor = f;
    scene.add(person);
    people.push(person);
  }
}

// ---------------------------------------------------------------------------
// Animation task pipeline
// ---------------------------------------------------------------------------
function addAnimationTask(update, onComplete) {
  activeAnimations.push({ update, onComplete });
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
  const ld = elevatorCar.leftDoor;
  const rd = elevatorCar.rightDoor;
  const lTarget = ld.userData.closedX - (open ? DOOR_SLIDE_DISTANCE : 0);
  const rTarget = rd.userData.closedX + (open ? DOOR_SLIDE_DISTANCE : 0);

  addAnimationTask(function (dt) {
    const step = DOOR_SPEED * dt;
    let done = true;
    const pairs = [[ld, lTarget], [rd, rTarget]];
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
    elevatorCar.doorsOpen = open;
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

function walkPersonTo(person, targetX, targetZ, callback) {
  const startDx = targetX - person.position.x;
  const startDz = targetZ - person.position.z;
  if (Math.sqrt(startDx * startDx + startDz * startDz) > 0.01) {
    person.rotation.y = Math.atan2(startDx, startDz);
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
function runCycle() {
  if (people.length === 0) return;

  const passenger = people[Math.floor(Math.random() * people.length)];
  const pickupFloor = passenger.userData.currentFloor;
  const destinationFloor = emptyFloor;

  moveElevatorToFloor(pickupFloor, function () {
    delay(STEP_DELAY_MS, function () {
      openDoors(function () {
        delay(STEP_DELAY_MS, function () {
          walkPersonTo(passenger, 0, 0, function () {
            elevatorCar.attach(passenger);
            turnPersonTo(passenger, 0, function () {
              delay(STEP_DELAY_MS, function () {
                closeDoors(function () {
                  delay(STEP_DELAY_MS, function () {
                    moveElevatorToFloor(destinationFloor, function () {
                      delay(STEP_DELAY_MS, function () {
                        openDoors(function () {
                          delay(STEP_DELAY_MS, function () {
                            walkPersonTo(passenger, 0, WAIT_DISTANCE, function () {
                              scene.attach(passenger);
                              passenger.userData.currentFloor = destinationFloor;
                              emptyFloor = pickupFloor;
                              turnPersonTo(passenger, Math.PI, function () {
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
  renderer.sortObjects = true;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  // Lighting.
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
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
  delay(800, runCycle);
}

// ---------------------------------------------------------------------------
// Auto-start on page load
// ---------------------------------------------------------------------------
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
