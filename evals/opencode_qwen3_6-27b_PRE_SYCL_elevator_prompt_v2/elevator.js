const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

var scene;
var camera;
var renderer;
var controls;
var elevatorCar;
var people;
var emptyFloor = 0;
var animSpeed = 1;
var animState = 'idle';

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.alpha = true;
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    var ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    var pointLight = new THREE.PointLight(0xffffff, 0.4);
    pointLight.position.set(0, 20, 0);
    scene.add(pointLight);

    createBuilding();
    createElevator();
    createPeople();

    var slider = document.getElementById('speed-slider');
    var valueSpan = document.getElementById('speed-value');
    if (slider) {
        slider.addEventListener('input', function () {
            animSpeed = parseInt(slider.value);
            valueSpan.textContent = animSpeed + 'x';
        });
    }

    window.addEventListener('resize', onWindowResize);

    startSimulation();
    animate();
}

function createTransparentMat(color, opacity, renderOrder) {
    var mat = new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    if (renderOrder !== undefined) {
        mat.renderOrder = renderOrder;
    }
    return mat;
}

function createBuilding() {
    var floorMat = createTransparentMat(0xcccccc, 0.3, 0);
    var wallMat = createTransparentMat(0x9999ff, 0.2, 0);
    var solidFloorMat = createTransparentMat(0xcccccc, 0.6, 0);

    var buildingGroup = new THREE.Group();

    for (var f = 0; f <= FLOOR_COUNT; f++) {
        var y = f * FLOOR_HEIGHT;

        var isGroundOrRoof = (f === 0 || f === FLOOR_COUNT);
        var mat = isGroundOrRoof ? solidFloorMat : floorMat;

        var halfW = BUILDING_WIDTH / 2;
        var halfD = BUILDING_DEPTH / 2;
        var shaftHalfW = SHAFT_WIDTH / 2;
        var shaftHalfD = SHAFT_DEPTH / 2;

        var floorThickness = 0.15;

        if (f === 0) {
            var ground = new THREE.Mesh(
                new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
                new THREE.MeshLambertMaterial({ color: 0x666666 })
            );
            ground.position.set(0, -0.15, 0);
            buildingGroup.add(ground);
        }

        var leftSlab = new THREE.Mesh(
            new THREE.BoxGeometry(halfW - shaftHalfW, floorThickness, BUILDING_DEPTH),
            mat
        );
        leftSlab.position.set(-(shaftHalfW + (halfW - shaftHalfW) / 2), y, 0);
        buildingGroup.add(leftSlab);

        var rightSlab = new THREE.Mesh(
            new THREE.BoxGeometry(halfW - shaftHalfW, floorThickness, BUILDING_DEPTH),
            mat
        );
        rightSlab.position.set(shaftHalfW + (halfW - shaftHalfW) / 2, y, 0);
        buildingGroup.add(rightSlab);

        var frontSlab = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH, floorThickness, halfD - shaftHalfD),
            mat
        );
        frontSlab.position.set(0, y, shaftHalfD + (halfD - shaftHalfD) / 2);
        buildingGroup.add(frontSlab);

        var backSlab = new THREE.Mesh(
            new THREE.BoxGeometry(SHAFT_WIDTH, floorThickness, halfD - shaftHalfD),
            mat
        );
        backSlab.position.set(0, y, -(shaftHalfD + (halfD - shaftHalfD) / 2));
        buildingGroup.add(backSlab);

        if (f > 0 && f < FLOOR_COUNT) {
            var floorLabel = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: createFloorLabelTexture(f),
                    transparent: true,
                    depthWrite: false
                })
            );
            floorLabel.position.set(-halfW - 1, y + FLOOR_HEIGHT / 2, 0);
            floorLabel.scale.set(2, 1, 1);
            buildingGroup.add(floorLabel);
        }
    }

    var wallHeight = FLOOR_COUNT * FLOOR_HEIGHT;
    var halfW = BUILDING_WIDTH / 2;
    var halfD = BUILDING_DEPTH / 2;

    var frontWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.15),
        wallMat
    );
    frontWall.position.set(0, wallHeight / 2, halfD);
    buildingGroup.add(frontWall);

    var backWall = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.15),
        wallMat
    );
    backWall.position.set(0, wallHeight / 2, -halfD);
    buildingGroup.add(backWall);

    var leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, wallHeight, BUILDING_DEPTH),
        wallMat
    );
    leftWall.position.set(-halfW, wallHeight / 2, 0);
    buildingGroup.add(leftWall);

    var rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, wallHeight, BUILDING_DEPTH),
        wallMat
    );
    rightWall.position.set(halfW, wallHeight / 2, 0);
    buildingGroup.add(rightWall);

    var roofMat = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    var roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH),
        roofMat
    );
    roof.position.set(0, wallHeight + 0.15, 0);
    buildingGroup.add(roof);

    scene.add(buildingGroup);
}

function createFloorLabelTexture(floorNum) {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Floor ' + floorNum, 64, 32);
    var tex = new THREE.CanvasTexture(canvas);
    return tex;
}

function createElevator() {
    elevatorCar = new THREE.Group();

    var frameMat = createTransparentMat(0xffff00, 0.5, 1);
    var doorMat = createTransparentMat(0xcccc00, 0.7, 1);
    var backMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    var sideMat = createTransparentMat(0xffff00, 0.3, 1);

    var carWidth = SHAFT_WIDTH - 0.4;
    var carDepth = SHAFT_DEPTH - 0.4;
    var carHeight = FLOOR_HEIGHT - 0.4;

    var floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, 0.1, carDepth),
        new THREE.MeshLambertMaterial({ color: 0xddddaa, transparent: true, opacity: 0.6, depthWrite: false })
    );
    floorMesh.position.y = 0.05;
    elevatorCar.add(floorMesh);

    var ceilingMesh = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, 0.1, carDepth),
        new THREE.MeshLambertMaterial({ color: 0xddddaa, transparent: true, opacity: 0.6, depthWrite: false })
    );
    ceilingMesh.position.y = carHeight;
    elevatorCar.add(ceilingMesh);

    var backWall = new THREE.Mesh(
        new THREE.BoxGeometry(carWidth, carHeight, 0.15),
        backMat
    );
    backWall.position.set(0, carHeight / 2, -carDepth / 2);
    elevatorCar.add(backWall);

    var leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, carHeight, carDepth),
        sideMat
    );
    leftWall.position.set(-carWidth / 2, carHeight / 2, 0);
    elevatorCar.add(leftWall);

    var rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, carHeight, carDepth),
        sideMat
    );
    rightWall.position.set(carWidth / 2, carHeight / 2, 0);
    elevatorCar.add(rightWall);

    var doorWidth = (carWidth - 0.2) / 2;
    var doorHeight = carHeight - 0.5;
    var doorDepth = 0.1;

    var leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMat
    );
    leftDoor.position.set(-doorWidth / 2 - 0.1, doorHeight / 2 + 0.25, carDepth / 2);
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.add(leftDoor);

    var rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
        doorMat
    );
    rightDoor.position.set(doorWidth / 2 + 0.1, doorHeight / 2 + 0.25, carDepth / 2);
    elevatorCar.rightDoor = rightDoor;
    elevatorCar.add(rightDoor);

    elevatorCar.position.set(0, 0, 0);
    elevatorCar.userData = { doorOpen: false, doorAnimating: false };

    scene.add(elevatorCar);
}

function createPeople() {
    people = [];

    for (var f = 0; f < FLOOR_COUNT; f++) {
        var color = '#3498db';
        var person = createPerson(color);

        var floorY = f * FLOOR_HEIGHT;
        person.position.set(0, floorY, SHAFT_DEPTH / 2 + 2);

        person.rotation.y = Math.PI;

        person.userData.floor = f;
        person.userData.state = 'waiting';

        scene.add(person);
        people.push(person);
    }
}

function startSimulation() {
    var occupiedFloors = [];
    for (var i = 0; i < FLOOR_COUNT; i++) {
        if (i !== emptyFloor) {
            occupiedFloors.push(i);
        }
    }
    runCycle(occupiedFloors);
}

function runCycle(occupiedFloors) {
    if (occupiedFloors.length === 0) {
        animState = 'idle';
        return;
    }

    var personIdx = Math.floor(Math.random() * occupiedFloors.length);
    var pickupFloor = occupiedFloors[personIdx];
    var person = people[pickupFloor];

    var destFloor = emptyFloor;

    var occupiedCopy = occupiedFloors.slice();
    occupiedCopy.splice(personIdx, 1);

    animState = 'moving_to_pickup';
    moveElevatorToFloor(pickupFloor, function () {
        animState = 'opening_doors';
        openDoors(function () {
            animState = 'person_entering';
            movePersonToElevator(person, pickupFloor, function () {
                animState = 'closing_doors';
                closeDoors(function () {
                    animState = 'moving_to_dest';
                    moveElevatorToFloor(destFloor, function () {
                        animState = 'opening_doors_dest';
                        openDoors(function () {
                            animState = 'person_exiting';
                            movePersonOut(person, destFloor, function () {
                                animState = 'closing_doors_dest';
                                closeDoors(function () {
                                    people[destFloor] = person;
                                    person.userData.floor = destFloor;
                                    person.userData.state = 'waiting';

                                    emptyFloor = pickupFloor;

                                    var newOccupied = occupiedFloors.filter(function (fl) {
                                        return fl !== pickupFloor && fl !== destFloor;
                                    });
                                    newOccupied.push(destFloor);

                                    runCycle(newOccupied);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function moveElevatorToFloor(floorNum, callback) {
    var targetY = floorNum * FLOOR_HEIGHT;
    var startY = elevatorCar.position.y;
    var distance = Math.abs(targetY - startY);
    var elapsed = 0;
    var direction = targetY > startY ? 1 : -1;

    function step() {
        var delta = (ELEVATOR_SPEED * animSpeed * 0.016);
        if (elapsed + delta >= distance) {
            elevatorCar.position.y = targetY;
            callback();
        } else {
            elevatorCar.position.y += delta * direction;
            elapsed += delta;
            requestAnimationFrame(step);
        }
    }
    step();
}

function openDoors(callback) {
    if (!elevatorCar || elevatorCar.userData.doorAnimating) return;
    elevatorCar.userData.doorAnimating = true;

    var leftDoor = elevatorCar.leftDoor;
    var rightDoor = elevatorCar.rightDoor;
    var maxOpen = 2.0;
    var elapsed = 0;
    var doorSpeed = 3 * animSpeed * 0.016;

    function step() {
        elapsed += doorSpeed;
        var openAmount = Math.min(elapsed, maxOpen);

        leftDoor.position.x = -openAmount;
        rightDoor.position.x = openAmount;

        if (elapsed < maxOpen) {
            requestAnimationFrame(step);
        } else {
            elevatorCar.userData.doorOpen = true;
            elevatorCar.userData.doorAnimating = false;
            callback();
        }
    }
    step();
}

function closeDoors(callback) {
    if (!elevatorCar || elevatorCar.userData.doorAnimating) return;
    elevatorCar.userData.doorAnimating = true;

    var leftDoor = elevatorCar.leftDoor;
    var rightDoor = elevatorCar.rightDoor;
    var maxOpen = 2.0;
    var elapsed = 0;
    var doorSpeed = 3 * animSpeed * 0.016;

    function step() {
        elapsed += doorSpeed;
        var remaining = Math.max(0, maxOpen - elapsed);

        leftDoor.position.x = -remaining;
        rightDoor.position.x = remaining;

        if (elapsed < maxOpen) {
            requestAnimationFrame(step);
        } else {
            leftDoor.position.x = 0;
            rightDoor.position.x = 0;
            elevatorCar.userData.doorOpen = false;
            elevatorCar.userData.doorAnimating = false;
            callback();
        }
    }
    step();
}

function movePersonToElevator(person, floorNum, callback) {
    person.userData.isWalking = true;
    person.userData.state = 'walking';

    var worldPos = new THREE.Vector3();
    person.getWorldPosition(worldPos);

    var targetZ = elevatorCar.position.z + SHAFT_DEPTH / 2 - 0.5;
    var startZ = worldPos.z;
    var distance = Math.abs(targetZ - startZ);
    var elapsed = 0;
    var walkSpeed = PERSON_MOVE_SPEED * animSpeed * 0.016;

    function step() {
        elapsed += walkSpeed;
        var remaining = Math.max(0, distance - elapsed);
        var direction = targetZ < startZ ? -1 : 1;

        person.position.z = startZ + (distance - remaining) * direction;

        if (elapsed < distance) {
            requestAnimationFrame(step);
        } else {
            person.position.z = targetZ;
            person.userData.isWalking = false;

            elevatorCar.attach(person);

            setTimeout(callback, 200 / animSpeed);
        }
    }
    step();
}

function movePersonOut(person, floorNum, callback) {
    var floorY = floorNum * FLOOR_HEIGHT;
    var targetZ = SHAFT_DEPTH / 2 + 2;

    var worldPos = new THREE.Vector3();
    person.getWorldPosition(worldPos);

    scene.attach(person);

    person.userData.isWalking = true;
    person.userData.state = 'walking';

    var startZ = person.position.z;
    var distance = Math.abs(targetZ - startZ);
    var elapsed = 0;
    var walkSpeed = PERSON_MOVE_SPEED * animSpeed * 0.016;
    var direction = targetZ > startZ ? 1 : -1;

    function step() {
        elapsed += walkSpeed;
        var remaining = Math.max(0, distance - elapsed);

        person.position.z = startZ + (distance - remaining) * direction;
        person.position.y = floorY;

        if (elapsed < distance) {
            requestAnimationFrame(step);
        } else {
            person.position.z = targetZ;
            person.position.y = floorY;
            person.userData.isWalking = false;
            person.userData.state = 'waiting';

            setTimeout(callback, 200 / animSpeed);
        }
    }
    step();
}

function animate() {
    requestAnimationFrame(animate);

    var time = Date.now() * 0.001;

    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.userData.isWalking && p.userData.leftLeg && p.userData.rightLeg) {
            var walkAngle = Math.sin(time * 8) * 0.5;
            p.userData.leftLeg.rotation.x = walkAngle;
            p.userData.rightLeg.rotation.x = -walkAngle;
        } else if (p.userData.leftLeg && p.userData.rightLeg) {
            p.userData.leftLeg.rotation.x *= 0.85;
            p.userData.rightLeg.rotation.x *= 0.85;
            if (Math.abs(p.userData.leftLeg.rotation.x) < 0.001) {
                p.userData.leftLeg.rotation.x = 0;
                p.userData.rightLeg.rotation.x = 0;
            }
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('DOMContentLoaded', init);
