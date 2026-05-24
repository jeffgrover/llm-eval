const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

var scene, camera, renderer, controls;
var elevatorCar;
var people = [];
var speedMultiplier = 1;
var animationState = 'idle';
var stateCallback = null;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    renderer.alpha = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();

    setupLights();
    createBuilding();
    createElevator();
    setupSpeedSlider();
    createInitialPeople();
    startSimulation();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function setupLights() {
    var ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(15, 30, 15);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 80;
    directionalLight.shadow.camera.left = -25;
    directionalLight.shadow.camera.right = 25;
    directionalLight.shadow.camera.top = 25;
    directionalLight.shadow.camera.bottom = -25;
    scene.add(directionalLight);

    var pointLight = new THREE.PointLight(0xffeebb, 0.5, 50);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);
}

function createTransparentMat(color, opacity) {
    return new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createBuilding() {
    var building = new THREE.Group();
    building.traverse(function(child) {
        if (child.isMesh) {
            child.renderOrder = 0;
        }
    });

    var floorMat = createTransparentMat(0xcccccc, 0.3);
    var wallMat = createTransparentMat(0x9999ff, 0.2);

    for (var f = 0; f <= FLOOR_COUNT; f++) {
        var y = f * FLOOR_HEIGHT;

        var floorGroup = new THREE.Group();
        floorGroup.position.y = y;

        if (f === 0) {
            var groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
            var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
            var ground = new THREE.Mesh(groundGeo, groundMat);
            ground.position.y = -0.1;
            ground.receiveShadow = true;
            ground.renderOrder = 0;
            floorGroup.add(ground);
        } else if (f === FLOOR_COUNT) {
            var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 1, 0.3, BUILDING_DEPTH + 1);
            var roofMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
            var roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.y = 0.15;
            roof.castShadow = true;
            roof.receiveShadow = true;
            roof.renderOrder = 0;
            floorGroup.add(roof);
        } else {
            var halfW = BUILDING_WIDTH / 2;
            var halfD = BUILDING_DEPTH / 2;
            var halfSw = SHAFT_WIDTH / 2;
            var halfSd = SHAFT_DEPTH / 2;

            var floorThickness = 0.15;

            var leftPartWidth = halfW - halfSw;
            var rightPartWidth = halfW - halfSw;

            var leftGeo = new THREE.BoxGeometry(leftPartWidth, floorThickness, BUILDING_DEPTH);
            var leftMesh = new THREE.Mesh(leftGeo, floorMat);
            leftMesh.position.set(-halfSw - leftPartWidth / 2, 0, 0);
            leftMesh.receiveShadow = true;
            leftMesh.renderOrder = 0;
            floorGroup.add(leftMesh);

            var rightGeo = new THREE.BoxGeometry(rightPartWidth, floorThickness, BUILDING_DEPTH);
            var rightMesh = new THREE.Mesh(rightGeo, floorMat);
            rightMesh.position.set(halfSw + rightPartWidth / 2, 0, 0);
            rightMesh.receiveShadow = true;
            rightMesh.renderOrder = 0;
            floorGroup.add(rightMesh);

            var frontPartDepth = halfD - halfSd;
            var backPartDepth = halfD - halfSd;

            var frontGeo = new THREE.BoxGeometry(SHAFT_WIDTH, floorThickness, frontPartDepth);
            var frontMesh = new THREE.Mesh(frontGeo, floorMat);
            frontMesh.position.set(0, 0, halfSd + frontPartDepth / 2);
            frontMesh.receiveShadow = true;
            frontMesh.renderOrder = 0;
            floorGroup.add(frontMesh);

            var backGeo = new THREE.BoxGeometry(SHAFT_WIDTH, floorThickness, backPartDepth);
            var backMesh = new THREE.Mesh(backGeo, floorMat);
            backMesh.position.set(0, 0, -halfSd - backPartDepth / 2);
            backMesh.receiveShadow = true;
            backMesh.renderOrder = 0;
            floorGroup.add(backMesh);
        }

        building.add(floorGroup);
    }

    var halfW = BUILDING_WIDTH / 2;
    var halfD = BUILDING_DEPTH / 2;
    var totalHeight = FLOOR_COUNT * FLOOR_HEIGHT;

    var backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, totalHeight, 0.2);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, totalHeight / 2, -halfD);
    backWall.renderOrder = 0;
    building.add(backWall);

    var frontWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, totalHeight, 0.2);
    var frontWall = new THREE.Mesh(frontWallGeo, wallMat);
    frontWall.position.set(0, totalHeight / 2, halfD);
    frontWall.renderOrder = 0;
    building.add(frontWall);

    var halfShw = SHAFT_WIDTH / 2;
    var sideWallWidth = halfW - halfShw;

    var leftWallGeo = new THREE.BoxGeometry(sideWallWidth, totalHeight, BUILDING_DEPTH);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-halfShw - sideWallWidth / 2, totalHeight / 2, 0);
    leftWall.renderOrder = 0;
    building.add(leftWall);

    var rightWallGeo = new THREE.BoxGeometry(sideWallWidth, totalHeight, BUILDING_DEPTH);
    var rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(halfShw + sideWallWidth / 2, totalHeight / 2, 0);
    rightWall.renderOrder = 0;
    building.add(rightWall);

    scene.add(building);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.position.y = 0;

    var frameMat = createTransparentMat(0xffff00, 0.5);
    var doorMat = createTransparentMat(0xcccc00, 0.7);
    var backMat = createTransparentMat(0xdddd00, 0.6);
    var sideMat = createTransparentMat(0xffff00, 0.3);

    var carW = SHAFT_WIDTH - 0.4;
    var carD = SHAFT_DEPTH - 0.4;
    var carH = FLOOR_HEIGHT - 0.5;

    var halfCarW = carW / 2;
    var halfCarD = carD / 2;

    var backWallGeo = new THREE.BoxGeometry(carW, carH, 0.15);
    var backWall = new THREE.Mesh(backWallGeo, backMat);
    backWall.position.set(0, carH / 2, -halfCarD);
    backWall.renderOrder = 1;
    elevatorCar.add(backWall);

    var leftSideGeo = new THREE.BoxGeometry(0.15, carH, carD);
    var leftSide = new THREE.Mesh(leftSideGeo, sideMat);
    leftSide.position.set(-halfCarW, carH / 2, 0);
    leftSide.renderOrder = 1;
    elevatorCar.add(leftSide);

    var rightSideGeo = new THREE.BoxGeometry(0.15, carH, carD);
    var rightSide = new THREE.Mesh(rightSideGeo, sideMat);
    rightSide.position.set(halfCarW, carH / 2, 0);
    rightSide.renderOrder = 1;
    elevatorCar.add(rightSide);

    var ceilingGeo = new THREE.BoxGeometry(carW, 0.1, carD);
    var ceiling = new THREE.Mesh(ceilingGeo, frameMat);
    ceiling.position.set(0, carH, 0);
    ceiling.renderOrder = 1;
    elevatorCar.add(ceiling);

    var doorWidth = carW / 2;
    var doorH = carH - 0.3;
    var doorDepth = 0.12;

    var leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorH, doorDepth);
    elevatorCar.leftDoor = new THREE.Mesh(leftDoorGeo, doorMat);
    elevatorCar.leftDoor.position.set(-doorWidth / 2, doorH / 2, halfCarD);
    elevatorCar.leftDoor.renderOrder = 1;
    elevatorCar.add(elevatorCar.leftDoor);

    var rightDoorGeo = new THREE.BoxGeometry(doorWidth, doorH, doorDepth);
    elevatorCar.rightDoor = new THREE.Mesh(rightDoorGeo, doorMat);
    elevatorCar.rightDoor.position.set(doorWidth / 2, doorH / 2, halfCarD);
    elevatorCar.rightDoor.renderOrder = 1;
    elevatorCar.add(elevatorCar.rightDoor);

    elevatorCar.userData = {
        doorOpen: false,
        targetY: 0
    };

    scene.add(elevatorCar);
}

var emptyFloor = 5;

function createInitialPeople() {
    for (var f = 0; f < FLOOR_COUNT; f++) {
        if (f === emptyFloor) continue;

        var person = createPerson();
        var floorY = f * FLOOR_HEIGHT;
        var waitingZ = SHAFT_DEPTH / 2 + 1.5;
        person.position.set(0, floorY, waitingZ);
        person.rotation.y = Math.PI;

        person.userData.currentFloor = f;
        person.userData.destinationFloor = -1;
        person.userData.phase = 'waiting';
        person.userData.targetY = floorY;

        scene.add(person);
        people.push(person);
    }
}

function startSimulation() {
    scheduleNextMove();
}

function scheduleNextMove() {
    animationState = 'idle';
    setTimeout(function() {
        if (people.length > 0) {
            executeMove();
        }
    }, 1500);
}

function executeMove() {
    var availableFloors = [];
    for (var f = 0; f < FLOOR_COUNT; f++) {
        var occupied = false;
        for (var p = 0; p < people.length; p++) {
            if (people[p].userData.currentFloor === f && people[p].userData.phase === 'waiting') {
                occupied = true;
                break;
            }
        }
        if (!occupied) {
            availableFloors.push(f);
        }
    }

    if (availableFloors.length === 0) {
        scheduleNextMove();
        return;
    }

    var srcPerson = null;
    var srcFloor = -1;
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.phase === 'waiting') {
            srcPerson = people[i];
            srcFloor = people[i].userData.currentFloor;
            break;
        }
    }

    if (!srcPerson) {
        scheduleNextMove();
        return;
    }

    var dstFloor = availableFloors[Math.floor(Math.random() * availableFloors.length)];
    if (dstFloor === srcFloor) {
        scheduleNextMove();
        return;
    }

    srcPerson.userData.destinationFloor = dstFloor;
    srcPerson.userData.phase = 'moving';
    emptyFloor = srcFloor;

    moveElevatorTo(srcFloor, function() {
        openDoors(function() {
            personBoard(srcPerson, function() {
                closeDoors(function() {
                    moveElevatorTo(dstFloor, function() {
                        openDoors(function() {
                            personExit(srcPerson, function() {
                                closeDoors(function() {
                                    scheduleNextMove();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function moveElevatorTo(floorNum, callback) {
    var targetY = floorNum * FLOOR_HEIGHT;
    animationState = 'moving_elevator';
    elevatorCar.userData.targetY = targetY;
    stateCallback = callback;
}

function openDoors(callback) {
    animationState = 'opening_doors';
    elevatorCar.userData.doorOpen = false;
    stateCallback = callback;
}

function closeDoors(callback) {
    animationState = 'closing_doors';
    elevatorCar.userData.doorOpen = true;
    stateCallback = callback;
}

function personBoard(person, callback) {
    animationState = 'boarding';
    person.userData.phase = 'boarding';

    var targetZ = elevatorCar.position.y + SHAFT_DEPTH / 2 - 1.2;
    person.userData.targetZ = targetZ;
    person.userData.boardingCallback = callback;
    person.userData.isWalking = true;
}

function personExit(person, callback) {
    animationState = 'exiting';
    person.userData.phase = 'exiting';

    var waitingZ = SHAFT_DEPTH / 2 + 1.5;
    person.userData.targetZ = waitingZ;
    person.userData.exitingCallback = callback;
    person.userData.isWalking = true;
}

function updateAnimation(delta) {
    var dt = delta * speedMultiplier;

    if (animationState === 'moving_elevator') {
        var targetY = elevatorCar.userData.targetY;
        var diff = targetY - elevatorCar.position.y;

        if (Math.abs(diff) < 0.01) {
            elevatorCar.position.y = targetY;
            if (stateCallback) {
                var cb = stateCallback;
                stateCallback = null;
                cb();
            }
        } else {
            var step = Math.sign(diff) * Math.min(ELEVATOR_SPEED * dt, Math.abs(diff));
            elevatorCar.position.y += step;
        }
    } else if (animationState === 'opening_doors') {
        var halfShaft = (SHAFT_WIDTH - 0.4) / 4;
        var leftPos = elevatorCar.leftDoor.position.x;
        var rightPos = elevatorCar.rightDoor.position.x;

        var leftTarget = -halfShaft - halfShaft;
        var rightTarget = halfShaft + halfShaft;

        var moved = false;
        var lDiff = leftTarget - leftPos;
        if (Math.abs(lDiff) > 0.01) {
            var step = Math.sign(lDiff) * Math.min(3 * dt, Math.abs(lDiff));
            elevatorCar.leftDoor.position.x += step;
            moved = true;
        } else {
            elevatorCar.leftDoor.position.x = leftTarget;
        }

        var rDiff = rightTarget - rightPos;
        if (Math.abs(rDiff) > 0.01) {
            var step2 = Math.sign(rDiff) * Math.min(3 * dt, Math.abs(rDiff));
            elevatorCar.rightDoor.position.x += step2;
            moved = true;
        } else {
            elevatorCar.rightDoor.position.x = rightTarget;
        }

        if (!moved) {
            elevatorCar.userData.doorOpen = true;
            if (stateCallback) {
                var cb = stateCallback;
                stateCallback = null;
                cb();
            }
        }
    } else if (animationState === 'closing_doors') {
        var centerLeft = -(SHAFT_WIDTH - 0.4) / 4;
        var centerRight = (SHAFT_WIDTH - 0.4) / 4;

        var moved = false;
        var lDiff = centerLeft - elevatorCar.leftDoor.position.x;
        if (Math.abs(lDiff) > 0.01) {
            var step = Math.sign(lDiff) * Math.min(3 * dt, Math.abs(lDiff));
            elevatorCar.leftDoor.position.x += step;
            moved = true;
        } else {
            elevatorCar.leftDoor.position.x = centerLeft;
        }

        var rDiff = centerRight - elevatorCar.rightDoor.position.x;
        if (Math.abs(rDiff) > 0.01) {
            var step2 = Math.sign(rDiff) * Math.min(3 * dt, Math.abs(rDiff));
            elevatorCar.rightDoor.position.x += step2;
            moved = true;
        } else {
            elevatorCar.rightDoor.position.x = centerRight;
        }

        if (!moved) {
            elevatorCar.userData.doorOpen = false;
            if (stateCallback) {
                var cb = stateCallback;
                stateCallback = null;
                cb();
            }
        }
    } else if (animationState === 'boarding') {
        var activePerson = null;
        for (var i = 0; i < people.length; i++) {
            if (people[i].userData.phase === 'boarding') {
                activePerson = people[i];
                break;
            }
        }

        if (activePerson) {
            var targetZ = activePerson.userData.targetZ;
            var diff = targetZ - activePerson.position.z;

            if (Math.abs(diff) < 0.05) {
                activePerson.position.z = targetZ;
                activePerson.userData.isWalking = false;
                activePerson.userData.phase = 'inside';

                var worldPos = new THREE.Vector3();
                activePerson.getWorldPosition(worldPos);

                elevatorCar.attach(activePerson);
                activePerson.position.y = 0;
                activePerson.position.z = -(SHAFT_DEPTH / 2) + 1.0;
                activePerson.rotation.y = 0;

                if (activePerson.userData.boardingCallback) {
                    var cb = activePerson.userData.boardingCallback;
                    activePerson.userData.boardingCallback = null;
                    cb();
                }
            } else {
                var step = Math.sign(diff) * Math.min(PERSON_MOVE_SPEED * dt, Math.abs(diff));
                activePerson.position.z += step;
            }
        }
    } else if (animationState === 'exiting') {
        var activePerson = null;
        for (var i = 0; i < people.length; i++) {
            if (people[i].userData.phase === 'exiting') {
                activePerson = people[i];
                break;
            }
        }

        if (activePerson) {
            scene.attach(activePerson);
            activePerson.rotation.y = Math.PI;

            var targetZ = activePerson.userData.targetZ;
            var diff = targetZ - activePerson.position.z;

            if (Math.abs(diff) < 0.05) {
                activePerson.position.z = targetZ;
                activePerson.userData.isWalking = false;
                activePerson.userData.phase = 'waiting';
                activePerson.userData.currentFloor = activePerson.userData.destinationFloor;

                if (activePerson.userData.exitingCallback) {
                    var cb = activePerson.userData.exitingCallback;
                    activePerson.userData.exitingCallback = null;
                    cb();
                }
            } else {
                var step = Math.sign(diff) * Math.min(PERSON_MOVE_SPEED * dt, Math.abs(diff));
                activePerson.position.z += step;
            }
        }
    }
}

function updateLegAnimations(delta) {
    var time = performance.now() / 1000;

    for (var i = 0; i < people.length; i++) {
        var person = people[i];
        if (person.userData.isWalking) {
            var speed = PERSON_MOVE_SPEED * 8;
            var leftAngle = Math.sin(time * speed) * 0.5;
            var rightAngle = Math.sin(time * speed + Math.PI) * 0.5;
            person.userData.leftLeg.rotation.x = leftAngle;
            person.userData.rightLeg.rotation.x = rightAngle;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    }
}

function setupSpeedSlider() {
    var slider = document.getElementById('speedSlider');
    var label = document.getElementById('speedLabel');

    if (slider && label) {
        slider.addEventListener('input', function() {
            speedMultiplier = parseFloat(slider.value);
            label.textContent = speedMultiplier.toFixed(1) + 'x';
        });
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

var lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    var now = performance.now();
    var delta = (now - lastTime) / 1000;
    lastTime = now;

    if (delta > 0.1) delta = 0.1;

    controls.update();
    updateAnimation(delta);
    updateLegAnimations(delta);

    renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', init);
