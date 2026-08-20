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

let emptyFloor = 0;
let doorBusy = false;
let elevatorBusy = false;
let tripActive = false;
let speedMultiplier = 1;
let lastFrameTime = 0;
let elapsed = 0;

function clampDelta(rawDelta) {
    if (!Number.isFinite(rawDelta) || rawDelta < 0) return 0.016;
    if (rawDelta > 0.1) return 0.1;
    return rawDelta;
}

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    const building = new THREE.Group();

    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x3a4750 });
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2e3a45 });
    const floorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const wallMaterial = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
    });

    // Solid ground floor.
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
        groundMaterial
    );
    ground.position.set(0, -0.15, 0);
    building.add(ground);

    // Solid roof above the top floor.
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
        roofMaterial
    );
    roof.position.set(0, (FLOOR_COUNT + 1) * FLOOR_HEIGHT - 0.15, 0);
    building.add(roof);

    // Six transparent usable floors with a clear central shaft opening.
    const frontDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
    const rearDepth = frontDepth;
    for (let floorNumber = 1; floorNumber <= FLOOR_COUNT; floorNumber += 1) {
        const y = floorY(floorNumber);

        const frontSlab = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, 0.12, frontDepth),
            floorMaterial
        );
        frontSlab.position.set(0, y, SHAFT_DEPTH / 2 + frontDepth / 2);
        building.add(frontSlab);

        const rearSlab = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, 0.12, rearDepth),
            floorMaterial
        );
        rearSlab.position.set(0, y, -(SHAFT_DEPTH / 2 + rearDepth / 2));
        building.add(rearSlab);

        const sideWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const leftSlab = new THREE.Mesh(
            new THREE.BoxGeometry(sideWidth, 0.12, SHAFT_DEPTH),
            floorMaterial
        );
        leftSlab.position.set(-(SHAFT_WIDTH / 2 + sideWidth / 2), y, 0);
        building.add(leftSlab);

        const rightSlab = new THREE.Mesh(
            new THREE.BoxGeometry(sideWidth, 0.12, SHAFT_DEPTH),
            floorMaterial
        );
        rightSlab.position.set(SHAFT_WIDTH / 2 + sideWidth / 2, y, 0);
        building.add(rightSlab);

        // Floor number marker in the front area (positive Z faces the viewer).
        const label = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.3, 0.08),
            new THREE.MeshLambertMaterial({ color: 0xbfd4e6 })
        );
        label.position.set(-BUILDING_WIDTH / 2 + 1.4, y + 0.85, BUILDING_DEPTH / 2 - 0.1);
        building.add(label);
    }

    // Semi-transparent blue outer walls: left, right and rear. The front is
    // left open so the interior stays visible from the default camera.
    const wallHeight = (FLOOR_COUNT + 1) * FLOOR_HEIGHT;
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.15),
        wallMaterial
    );
    backWall.position.set(0, wallHeight / 2, -BUILDING_DEPTH / 2);
    building.add(backWall);

    const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, wallHeight, BUILDING_DEPTH),
        wallMaterial
    );
    leftWall.position.set(-BUILDING_WIDTH / 2, wallHeight / 2, 0);
    building.add(leftWall);

    const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, wallHeight, BUILDING_DEPTH),
        wallMaterial
    );
    rightWall.position.set(BUILDING_WIDTH / 2, wallHeight / 2, 0);
    building.add(rightWall);

    // Elevator shaft guide rails running through the central opening.
    const railMaterial = new THREE.MeshLambertMaterial({ color: 0x556677 });
    const railGeometry = new THREE.BoxGeometry(0.12, wallHeight, 0.12);
    const railOffsetX = SHAFT_WIDTH / 2 - 0.1;
    const railOffsetZ = SHAFT_DEPTH / 2 - 0.1;
    for (const signX of [-1, 1]) {
        for (const signZ of [-1, 1]) {
            const rail = new THREE.Mesh(railGeometry, railMaterial);
            rail.position.set(signX * railOffsetX, wallHeight / 2, signZ * railOffsetZ);
            building.add(rail);
        }
    }

    return building;
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();

    const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    const doorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7
    });
    const backWallMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4d00 });

    // Car body: shaft sized, slightly shorter so it clears each floor slab.
    const carHeight = FLOOR_HEIGHT - 0.5;
    const carBottom = -carHeight / 2 + 0.15;
    const carTop = 0.15;

    // Solid back wall (local negative Z), transparent side walls, plus a
    // semi-transparent yellow frame: floor plate and ceiling.
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH - 0.3, carHeight, 0.12),
        backWallMaterial
    );
    backWall.position.set(0, (carBottom + carTop) / 2, -SHAFT_DEPTH / 2 + 0.1);
    elevatorCar.add(backWall);

    const sideWallMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
    });
    const sideWallGeometry = new THREE.BoxGeometry(0.1, carHeight, SHAFT_DEPTH - 0.4);
    for (const sign of [-1, 1]) {
        const sideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
        sideWall.position.set(sign * (SHAFT_WIDTH / 2 - 0.2), (carBottom + carTop) / 2, -0.05);
        elevatorCar.add(sideWall);
    }

    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH, 0.16, SHAFT_DEPTH),
        frameMaterial
    );
    plate.position.set(0, carBottom + 0.08, -0.05);
    elevatorCar.add(plate);

    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH, 0.16, SHAFT_DEPTH),
        frameMaterial
    );
    ceiling.position.set(0, carTop - 0.08, -0.05);
    elevatorCar.add(ceiling);

    // Vertical frame posts in the front opening (local positive Z is front).
    const postGeometry = new THREE.BoxGeometry(0.14, carHeight, 0.14);
    for (const sign of [-1, 1]) {
        const post = new THREE.Mesh(postGeometry, frameMaterial);
        post.position.set(sign * (SHAFT_WIDTH / 2 - 0.2), (carBottom + carTop) / 2, SHAFT_DEPTH / 2 - 0.3);
        elevatorCar.add(post);
    }

    // Two front sliding doors: they meet at x = 0 and slide apart on X.
    const doorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH / 2, carHeight - 0.15, 0.1);
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-SHAFT_WIDTH / 4 + 0.01, (carBottom + carTop) / 2, SHAFT_DEPTH / 2 - 0.25);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(SHAFT_WIDTH / 4 - 0.01, (carBottom + carTop) / 2, SHAFT_DEPTH / 2 - 0.25);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    // Car floor sits on floorY(1), so local y = 0 is the standing level.
    elevatorCar.position.set(0, floorY(1), 0);

    return elevatorCar;
}

function placePersonOnFloor(person, floorNumber) {
    person.position.set(0, floorY(floorNumber), 2.6);
    // Face the doors: local +Z (front of the person) points toward -Z world.
    person.rotation.y = Math.PI;
    person.userData.currentFloor = floorNumber;
    person.userData.inElevator = false;
}

function createPeople() {
    const colors = [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x845ef7, 0xff922b];
    for (let floorNumber = 1; floorNumber <= FLOOR_COUNT - 1; floorNumber += 1) {
        const person = createPerson(colors[floorNumber - 1]);
        placePersonOnFloor(person, floorNumber);
        scene.add(person);
        people.push(person);
    }
    emptyFloor = FLOOR_COUNT;
}

function delay(ms, done) {
    setTimeout(function () {
        if (done) done();
    }, ms);
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

function animateElevatorToFloor(targetFloor, done) {
    elevatorBusy = true;
    const targetY = floorY(targetFloor);
    if (done) delay(0, done);
    return new Promise(function (resolve) {
        let lastStepTime = -1;
        function step() {
            const now = performance.now();
            const dt = clampDelta(lastStepTime > 0 ? (now - lastStepTime) / 1000 : 0.016);
            lastStepTime = now;
            if (!elevatorBusy) {
                resolve();
                return;
            }
            const distance = targetY - elevatorCar.position.y;
            if (Math.abs(distance) < 0.01) {
                elevatorCar.position.y = targetY;
                elevatorBusy = false;
                resolve();
                return;
            }
            const stepSize = ELEVATOR_SPEED * speedMultiplier * dt;
            if (stepSize >= Math.abs(distance)) {
                elevatorCar.position.y = targetY;
                elevatorBusy = false;
                resolve();
            } else {
                elevatorCar.position.y += Math.sign(distance) * stepSize;
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    });
}

function animateDoors(open, done) {
    doorBusy = true;
    const openOffset = SHAFT_WIDTH / 2 + 0.5;
    if (done) delay(0, done);
    return new Promise(function (resolve) {
        let lastStepTime = -1;
        function step() {
            const now = performance.now();
            const dt = clampDelta(lastStepTime > 0 ? (now - lastStepTime) / 1000 : 0.016);
            lastStepTime = now;
            if (!doorBusy) {
                resolve();
                return;
            }
            const leftTargetX = -SHAFT_WIDTH / 4 + 0.01 + (open ? openOffset : 0);
            const rightTargetX = SHAFT_WIDTH / 4 - 0.01 - (open ? openOffset : 0);
            const doorSpeed = ELEVATOR_SPEED * speedMultiplier;
            if (Math.abs(leftTargetX - elevatorCar.leftDoor.position.x) < 0.01 &&
                Math.abs(rightTargetX - elevatorCar.rightDoor.position.x) < 0.01) {
                elevatorCar.leftDoor.position.x = leftTargetX;
                elevatorCar.rightDoor.position.x = rightTargetX;
                doorBusy = false;
                resolve();
                return;
            }
            const stepSize = Math.min(doorSpeed * dt, 0.5);
            if (elevatorCar.leftDoor.position.x < leftTargetX) {
                elevatorCar.leftDoor.position.x = Math.min(leftTargetX, elevatorCar.leftDoor.position.x + stepSize);
            } else if (elevatorCar.leftDoor.position.x > leftTargetX) {
                elevatorCar.leftDoor.position.x = Math.max(leftTargetX, elevatorCar.leftDoor.position.x - stepSize);
            }
            if (elevatorCar.rightDoor.position.x < rightTargetX) {
                elevatorCar.rightDoor.position.x = Math.min(rightTargetX, elevatorCar.rightDoor.position.x + stepSize);
            } else if (elevatorCar.rightDoor.position.x > rightTargetX) {
                elevatorCar.rightDoor.position.x = Math.max(rightTargetX, elevatorCar.rightDoor.position.x - stepSize);
            }
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    });
}

function walkPersonToZ(person, targetZ, done) {
    person.userData.isWalking = true;
    if (done) delay(0, done);
    return new Promise(function (resolve) {
        let lastStepTime = -1;
        function step() {
            const now = performance.now();
            const dt = clampDelta(lastStepTime > 0 ? (now - lastStepTime) / 1000 : 0.016);
            lastStepTime = now;
            const distance = targetZ - person.position.z;
            if (Math.abs(distance) < 0.01) {
                person.position.z = targetZ;
                stopWalking(person);
                resolve();
                return;
            }
            const stepSize = Math.min(Math.abs(distance), PERSON_MOVE_SPEED * speedMultiplier * dt);
            person.position.z += Math.sign(distance) * stepSize;
            animateWalkingLegs(elapsed);
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    });
}

function stopWalking(person) {
    person.userData.isWalking = false;
    if (person.userData.leftLeg) person.userData.leftLeg.rotation.x = 0;
    if (person.userData.rightLeg) person.userData.rightLeg.rotation.x = 0;
}

function animateWalkingLegs(time) {
    const swing = Math.sin(time * 9.0);
    for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (!person.userData.isWalking) continue;
        person.userData.leftLeg.rotation.x = swing * 0.75;
        person.userData.rightLeg.rotation.x = -swing * 0.75;
    }
}

function pickPassenger() {
    const candidates = [];
    for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (!person.userData.inElevator && person.userData.currentFloor !== emptyFloor) {
            candidates.push(person);
        }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function runTrip() {
    tripActive = true;
    (function nextCycle() {
        const passenger = pickPassenger();
        if (!passenger) {
            delay(500, function () {
                nextCycle();
            });
            return;
        }
        const fromFloor = passenger.userData.currentFloor;
        const toFloor = emptyFloor;

        animateElevatorToFloor(fromFloor)
            .then(function () {
                return animateDoors(true).then(function () {
                    return delay(300);
                });
            })
            .then(function () {
                // Passenger walks forward (world -Z) from the waiting spot
                // into the car, then is attached so they ride with it.
                return walkPersonToZ(passenger, 0).then(function () {
                    elevatorCar.attach(passenger);
                    passenger.userData.inElevator = true;
                    return delay(300);
                });
            })
            .then(function () {
                return animateDoors(false);
            })
            .then(function () {
                return animateElevatorToFloor(toFloor);
            })
            .then(function () {
                return animateDoors(true).then(function () {
                    return delay(300);
                });
            })
            .then(function () {
                // Hand the passenger back to the scene at world position,
                // then walk them out to the waiting spot on positive Z.
                scene.attach(passenger);
                passenger.userData.inElevator = false;
                return walkPersonToZ(passenger, 2.6).then(function () {
                    return delay(300);
                });
            })
            .then(function () {
                emptyFloor = fromFloor;
                passenger.userData.currentFloor = toFloor;
                return animateDoors(false);
            })
            .then(function () {
                tripActive = false;
                nextCycle();
            })
            .catch(function (err) {
                console.log("Trip error: " + err);
                tripActive = false;
                delay(1000, function () {
                    nextCycle();
                });
            });
    })();
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11151c);
    scene.fog = new THREE.Fog(0x11151c, 45, 120);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(26, 17, 34);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
    keyLight.position.set(18, 32, 24);
    scene.add(keyLight);
    const frontLight = new THREE.DirectionalLight(0xbfd9ff, 0.35);
    frontLight.position.set(0, 16, 30);
    scene.add(frontLight);

    const building = createBuilding();
    scene.add(building);

    createElevatorCar();
    scene.add(elevatorCar);

    createPeople();

    window.addEventListener("resize", function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const speedSlider = document.getElementById("speed-slider");
    if (speedSlider) {
        speedSlider.addEventListener("input", function () {
            const value = parseFloat(speedSlider.value);
            speedMultiplier = Number.isFinite(value) ? value : 1;
            const speedLabel = document.getElementById("speed-value");
            if (speedLabel) speedLabel.textContent = speedMultiplier + "x";
        });
    }

    lastFrameTime = performance.now();
    animate();

    delay(400, function () {
        runTrip();
    });
}

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const delta = clampDelta(lastFrameTime > 0 ? (now - lastFrameTime) / 1000 : 0.016);
    lastFrameTime = now;
    elapsed += delta * speedMultiplier;

    animateWalkingLegs(elapsed);
    controls.update();
    renderer.render(scene, camera);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
