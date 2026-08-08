// elevator.js - main 3D elevator simulation logic (plain script, no modules).

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
let clock;
let speedSlider;
let hudStatus;

let emptyFloor = FLOOR_COUNT - 1;
let roundIndex = 0;
let doorState = 0;        // 0 = fully closed, 1 = fully open
let doorsAnimating = null;
let elevatorY = 0;
let elevatorTargetY = 0;
let elevatorOnArrive = null;
let elapsed = 0;

let currentAction = null;
let actionQueue = [];

const WAIT_Z = BUILDING_DEPTH / 2 + 2.5;

function floorY(floorIndex) {
  return floorIndex * FLOOR_HEIGHT;
}

function makeTransparentMaterial(color, opacity) {
  return new THREE.MeshLambertMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function makeTransparentBox(width, height, depth, color, opacity, renderOrder) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeTransparentMaterial(color, opacity));
  mesh.renderOrder = renderOrder;
  return mesh;
}

function setGroupRenderOrder(root, order) {
  root.traverse(function (node) {
    if (node.isMesh) {
      node.renderOrder = order;
    }
  });
}

function createBuilding() {
  const building = new THREE.Group();
  const halfW = BUILDING_WIDTH / 2;
  const halfD = BUILDING_DEPTH / 2;
  const halfShaftX = SHAFT_WIDTH / 2;
  const halfShaftZ = SHAFT_DEPTH / 2;
  const wallHeight = FLOOR_COUNT * FLOOR_HEIGHT;

  // Solid opaque ground slab.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  ground.position.y = -0.15;
  building.add(ground);

  // Transparent interior floor slabs (one per upper floor), each split into
  // four pieces around the elevator shaft cutout.
  for (let f = 1; f < FLOOR_COUNT; f++) {
    const y = floorY(f);
    const backPiece = makeTransparentBox(BUILDING_WIDTH, 0.12, halfD - halfShaftZ, 0xcccccc, 0.3, 0);
    backPiece.position.set(0, y, -(halfShaftZ + (halfD - halfShaftZ) / 2));
    building.add(backPiece);

    const frontPiece = makeTransparentBox(BUILDING_WIDTH, 0.12, halfD - halfShaftZ, 0xcccccc, 0.3, 0);
    frontPiece.position.set(0, y, halfShaftZ + (halfD - halfShaftZ) / 2);
    building.add(frontPiece);

    const sideWidth = halfW - halfShaftX;
    const leftPiece = makeTransparentBox(sideWidth, 0.12, SHAFT_DEPTH, 0xcccccc, 0.3, 0);
    leftPiece.position.set(-(halfShaftX + sideWidth / 2), y, 0);
    building.add(leftPiece);

    const rightPiece = makeTransparentBox(sideWidth, 0.12, SHAFT_DEPTH, 0xcccccc, 0.3, 0);
    rightPiece.position.set(halfShaftX + sideWidth / 2, y, 0);
    building.add(rightPiece);
  }

  // Solid opaque roof.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  roof.position.y = wallHeight + 0.15;
  building.add(roof);

  // Semi-transparent outer walls.
  const frontWall = makeTransparentBox(BUILDING_WIDTH, wallHeight, 0.1, 0x9999ff, 0.2, 1);
  frontWall.position.set(0, wallHeight / 2, halfD);
  building.add(frontWall);

  const backWall = makeTransparentBox(BUILDING_WIDTH, wallHeight, 0.1, 0x9999ff, 0.2, 1);
  backWall.position.set(0, wallHeight / 2, -halfD);
  building.add(backWall);

  const leftWall = makeTransparentBox(0.1, wallHeight, BUILDING_DEPTH, 0x9999ff, 0.2, 1);
  leftWall.position.set(-halfW, wallHeight / 2, 0);
  building.add(leftWall);

  const rightWall = makeTransparentBox(0.1, wallHeight, BUILDING_DEPTH, 0x9999ff, 0.2, 1);
  rightWall.position.set(halfW, wallHeight / 2, 0);
  building.add(rightWall);

  // Subtle translucent shaft walls lining the cutout, full building height.
  const shaftBack = makeTransparentBox(SHAFT_WIDTH, wallHeight, 0.06, 0xdddddd, 0.08, 0);
  shaftBack.position.set(0, wallHeight / 2, -halfShaftZ);
  building.add(shaftBack);

  const shaftLeft = makeTransparentBox(0.06, wallHeight, SHAFT_DEPTH, 0xdddddd, 0.08, 0);
  shaftLeft.position.set(-halfShaftX, wallHeight / 2, 0);
  building.add(shaftLeft);

  const shaftRight = makeTransparentBox(0.06, wallHeight, SHAFT_DEPTH, 0xdddddd, 0.08, 0);
  shaftRight.position.set(halfShaftX, wallHeight / 2, 0);
  building.add(shaftRight);

  scene.add(building);
}

function createElevatorCar() {
  const car = new THREE.Group();
  const halfShaftX = SHAFT_WIDTH / 2;
  const halfShaftZ = SHAFT_DEPTH / 2;
  const doorHeight = 2.3;
  const doorWidth = SHAFT_WIDTH / 2 - 0.05;

  const frameMaterial = new THREE.MeshLambertMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const doorMaterial = new THREE.MeshLambertMaterial({
    color: 0xcccc00,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const sideMaterial = makeTransparentMaterial(0xffff00, 0.25);
  const backMaterial = new THREE.MeshLambertMaterial({ color: 0xddbb00 });

  // Corner posts.
  const postOffsets = [
    [-halfShaftX + 0.09, -halfShaftZ + 0.09],
    [halfShaftX - 0.09, -halfShaftZ + 0.09],
    [-halfShaftX + 0.09, halfShaftZ - 0.09],
    [halfShaftX - 0.09, halfShaftZ - 0.09]
  ];
  for (let i = 0; i < postOffsets.length; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, FLOOR_HEIGHT, 0.18), frameMaterial);
    post.position.set(postOffsets[i][0], FLOOR_HEIGHT / 2, postOffsets[i][1]);
    post.renderOrder = 2;
    car.add(post);
  }

  // Top and bottom edge beams.
  const beamLevels = [0.09, FLOOR_HEIGHT - 0.09];
  for (let i = 0; i < beamLevels.length; i++) {
    const beamY = beamLevels[i];

    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.18, 0.18), frameMaterial);
    frontBeam.position.set(0, beamY, halfShaftZ - 0.09);
    frontBeam.renderOrder = 2;
    car.add(frontBeam);

    const backBeam = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, 0.18, 0.18), frameMaterial);
    backBeam.position.set(0, beamY, -halfShaftZ + 0.09);
    backBeam.renderOrder = 2;
    car.add(backBeam);

    const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, SHAFT_DEPTH), frameMaterial);
    leftBeam.position.set(-halfShaftX + 0.09, beamY, 0);
    leftBeam.renderOrder = 2;
    car.add(leftBeam);

    const rightBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, SHAFT_DEPTH), frameMaterial);
    rightBeam.position.set(halfShaftX - 0.09, beamY, 0);
    rightBeam.renderOrder = 2;
    car.add(rightBeam);
  }

  // Car floor slab at local y = 0 so passengers' feet rest on the floor.
  const carFloor = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, 0.12, SHAFT_DEPTH - 0.2), frameMaterial);
  carFloor.position.y = 0.06;
  carFloor.renderOrder = 2;
  car.add(carFloor);

  // Solid opaque back wall.
  const carBack = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH - 0.2, FLOOR_HEIGHT - 0.3, 0.12), backMaterial);
  carBack.position.set(0, FLOOR_HEIGHT / 2, -halfShaftZ + 0.15);
  carBack.renderOrder = 2;
  car.add(carBack);

  // Transparent side walls.
  const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, FLOOR_HEIGHT - 0.3, SHAFT_DEPTH - 0.3), sideMaterial);
  leftSide.position.set(-halfShaftX + 0.12, FLOOR_HEIGHT / 2, 0);
  leftSide.renderOrder = 2;
  car.add(leftSide);

  const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, FLOOR_HEIGHT - 0.3, SHAFT_DEPTH - 0.3), sideMaterial);
  rightSide.position.set(halfShaftX - 0.12, FLOOR_HEIGHT / 2, 0);
  rightSide.renderOrder = 2;
  car.add(rightSide);

  // Two sliding front doors. Closed: they meet at x = 0. Open: they retract
  // outward toward their own side.
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.1), doorMaterial);
  leftDoor.position.set(-doorWidth / 2, doorHeight / 2 + 0.12, halfShaftZ - 0.05);
  leftDoor.renderOrder = 3;
  car.add(leftDoor);

  const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.1), doorMaterial);
  rightDoor.position.set(doorWidth / 2, doorHeight / 2 + 0.12, halfShaftZ - 0.05);
  rightDoor.renderOrder = 3;
  car.add(rightDoor);

  car.leftDoor = leftDoor;
  car.rightDoor = rightDoor;
  car.userData.doorWidth = doorWidth;

  return car;
}

// ---------------------------------------------------------------------------
// Sequential action pipeline
// ---------------------------------------------------------------------------

function queueActions(actions) {
  for (let i = 0; i < actions.length; i++) {
    actionQueue.push(actions[i]);
  }
}

function beginAction(action) {
  currentAction = action;
  if (action.type === "move") {
    action.startPos = action.person.position.clone();
    action.direction = new THREE.Vector3().subVectors(action.target, action.startPos);
    action.distance = action.direction.length();
    action.person.userData.isWalking = action.distance > 0.0001;
    if (action.distance > 0.0001) {
      action.direction.normalize();
    }
    action.traveled = 0;
  } else if (action.type === "rotateTo") {
    action.startQuat = action.person.quaternion.clone();
    action.person.lookAt(action.target.x, action.person.position.y, action.target.z);
    action.endQuat = action.person.quaternion.clone();
    action.person.quaternion.copy(action.startQuat);
    action.t = 0;
    action.duration = action.duration || 0.3;
  } else if (action.type === "doors") {
    doorsAnimating = { target: action.target };
  } else if (action.type === "delay" || action.type === "function") {
    action.t = 0;
  }
}

function advanceAction(deltaTime) {
  const action = currentAction;
  if (action.type === "move") {
    action.traveled += PERSON_MOVE_SPEED * speedSlider.value * deltaTime;
    if (action.traveled >= action.distance - 0.01) {
      action.person.position.copy(action.target);
      action.person.userData.isWalking = false;
      return true;
    }
    action.person.position.copy(action.startPos).addScaledVector(action.direction, action.traveled);
    return false;
  }
  if (action.type === "rotateTo") {
    action.t += deltaTime;
    const t = Math.min(action.t / action.duration, 1);
    action.person.quaternion.slerpQuaternions(action.startQuat, action.endQuat, t);
    return t >= 1 - 0.0001;
  }
  if (action.type === "delay") {
    action.t += deltaTime;
    return action.t >= action.seconds;
  }
  if (action.type === "reparent") {
    action.targetParent.attach(action.person);
    return true;
  }
  if (action.type === "doors") {
    advanceDoors(deltaTime);
    return doorsAnimating === null;
  }
  if (action.type === "function") {
    action.fn();
    return true;
  }
  return true;
}

function updateActions(deltaTime) {
  if (!currentAction && actionQueue.length > 0) {
    beginAction(actionQueue.shift());
  }
  if (currentAction && advanceAction(deltaTime)) {
    currentAction = null;
  }
}

function queueWalkWorld(person, worldTarget) {
  queueActions([
    { type: "rotateTo", person: person, target: worldTarget.clone() },
    { type: "move", person: person, target: worldTarget.clone() }
  ]);
}

function queueWalkCarLocal(person, worldTarget) {
  elevatorCar.updateWorldMatrix(true, false);
  const localTarget = worldTarget.clone().applyMatrix4(new THREE.Matrix4().copy(elevatorCar.matrixWorld).invert());
  queueActions([
    { type: "rotateTo", person: person, target: localTarget.clone() },
    { type: "move", person: person, target: localTarget }
  ]);
}

// ---------------------------------------------------------------------------
// Doors and elevator travel
// ---------------------------------------------------------------------------

function advanceDoors(deltaTime) {
  if (!doorsAnimating) {
    return;
  }
  const target = doorsAnimating.target;
  const step = (2 / 3) * speedSlider.value * deltaTime;
  if (doorState < target) {
    doorState = Math.min(doorState + step, target);
  } else {
    doorState = Math.max(doorState - step, target);
  }
  const doorWidth = elevatorCar.userData.doorWidth;
  elevatorCar.leftDoor.position.x = -doorWidth / 2 - doorState * (doorWidth - 0.1);
  elevatorCar.rightDoor.position.x = doorWidth / 2 + doorState * (doorWidth - 0.1);
  if (Math.abs(doorState - target) < 0.01) {
    doorState = target;
    doorsAnimating = null;
  }
}

function updateElevator(deltaTime) {
  if (Math.abs(elevatorY - elevatorTargetY) < 0.01) {
    elevatorY = elevatorTargetY;
    if (elevatorOnArrive) {
      const callback = elevatorOnArrive;
      elevatorOnArrive = null;
      callback();
    }
    return;
  }
  const step = ELEVATOR_SPEED * speedSlider.value * deltaTime;
  if (elevatorY < elevatorTargetY) {
    elevatorY = Math.min(elevatorY + step, elevatorTargetY);
  } else {
    elevatorY = Math.max(elevatorY - step, elevatorTargetY);
  }
}

function moveElevatorTo(floorIndex, onArrive) {
  elevatorTargetY = floorY(floorIndex);
  elevatorOnArrive = onArrive;
}

function updateHud(text) {
  if (hudStatus) {
    hudStatus.textContent = text;
  }
}

function updatePeople() {
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (!person) {
      continue;
    }
    if (person.userData.isWalking) {
      const swing = Math.sin(elapsed * 9) * 0.6;
      person.userData.leftLeg.rotation.x = swing;
      person.userData.rightLeg.rotation.x = -swing;
    } else {
      person.userData.leftLeg.rotation.x = 0;
      person.userData.rightLeg.rotation.x = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation logic: one floor is always empty; every other floor has a person.
// Each round, the closest occupied floor's person rides to the empty floor.
// ---------------------------------------------------------------------------

function pickPickupFloor() {
  let bestFloor = -1;
  let bestDistance = Infinity;
  const carFloor = Math.round(elevatorY / FLOOR_HEIGHT);
  for (let f = 0; f < FLOOR_COUNT; f++) {
    if (f === emptyFloor) {
      continue;
    }
    const distance = Math.abs(f - carFloor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFloor = f;
    }
  }
  return bestFloor;
}

function queueRound() {
  roundIndex++;
  const pickupFloor = pickPickupFloor();
  const rider = people[pickupFloor];
  const destFloor = emptyFloor;
  updateHud("Round " + roundIndex + ": picking up on floor " + pickupFloor);

  moveElevatorTo(pickupFloor, function () {
    updateHud("Round " + roundIndex + ": boarding on floor " + pickupFloor);
    queueActions([
      { type: "doors", target: 1 },
      { type: "delay", seconds: 0.3 }
    ]);
    queueWalkWorld(rider, new THREE.Vector3(0, floorY(pickupFloor), BUILDING_DEPTH / 2 + 0.6));
    queueActions([
      { type: "reparent", person: rider, targetParent: elevatorCar }
    ]);
    queueWalkCarLocal(rider, new THREE.Vector3(0, 0, -0.8));
    queueActions([
      { type: "delay", seconds: 0.3 },
      { type: "doors", target: 0 },
      { type: "delay", seconds: 0.3 },
      { type: "function", fn: function () {
        updateHud("Round " + roundIndex + ": riding to floor " + destFloor);
        moveElevatorTo(destFloor, function () {
          queueActions([
            { type: "doors", target: 1 },
            { type: "delay", seconds: 0.3 },
            { type: "reparent", person: rider, targetParent: scene }
          ]);
          queueWalkWorld(rider, new THREE.Vector3(0, floorY(destFloor), WAIT_Z));
          queueActions([
            { type: "delay", seconds: 0.3 },
            { type: "doors", target: 0 },
            { type: "function", fn: function () {
              emptyFloor = pickupFloor;
              updateHud("Round " + roundIndex + " complete: floor " + destFloor + " occupied");
              queueRound();
            } }
          ]);
        });
      } }
    ]);
  });
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function createPeople() {
  for (let f = 0; f < FLOOR_COUNT; f++) {
    if (f === emptyFloor) {
      people[f] = null;
      continue;
    }
    const person = createPerson();
    person.position.set(1.6 + f * 0.7, floorY(f), WAIT_Z);
    person.lookAt(0, floorY(f), 0);
    setGroupRenderOrder(person, 5);
    scene.add(person);
    people[f] = person;
  }
}

function startSimulation() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x20242a);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(25, 25, 25);
  camera.lookAt(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.sortObjects = true;
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
  controls.enableDamping = true;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  createBuilding();

  elevatorCar = createElevatorCar();
  elevatorCar.position.y = floorY(0);
  scene.add(elevatorCar);

  clock = new THREE.Clock();
  speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  if (speedSlider && speedValue) {
    speedSlider.addEventListener("input", function () {
      speedValue.textContent = speedSlider.value + "x";
    });
  }

  const hud = document.createElement("div");
  hud.style.cssText = "position:fixed;top:12px;right:12px;z-index:10;padding:8px 12px;" +
    "background:rgba(15,18,24,0.75);color:#e8ecf2;border:1px solid rgba(255,255,255,0.25);" +
    "border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;";
  document.body.appendChild(hud);
  hudStatus = hud;

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  createPeople();
  queueRound();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();
  elapsed += deltaTime * speedSlider.value;
  updateElevator(deltaTime);
  updateActions(deltaTime);
  updatePeople();
  elevatorCar.position.y = elevatorY;
  controls.update();
  renderer.render(scene, camera);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startSimulation);
} else {
  startSimulation();
}
