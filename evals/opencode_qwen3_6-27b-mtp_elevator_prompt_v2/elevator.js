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
var animationSpeed = 1;
var currentAnimation = null;
var emptyFloor = -1;
var clock = new THREE.Clock();

function init() {
    /* Scene */
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    /* Camera */
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);

    /* Renderer */
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    /* Controls */
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, FLOOR_HEIGHT * (FLOOR_COUNT - 1) / 2, 0);
    controls.update();

    /* Lights */
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(15, 30, 20);
    scene.add(dirLight);

    /* Speed slider */
    var slider = document.getElementById('speedSlider');
    if (slider) {
        slider.addEventListener('input', function () {
            animationSpeed = parseInt(slider.value);
            document.getElementById('speedVal').textContent = animationSpeed + 'x';
        });
    }

    /* Build scene */
    createBuilding();
    elevatorCar = createElevator();
    scene.add(elevatorCar);

    /* Create people on floors 0-4, floor 5 empty initially */
    for (var i = 0; i < FLOOR_COUNT - 1; i++) {
        var p = createPerson(0x3498db + Math.floor(Math.random() * 0x200000));
        var floorY = i * FLOOR_HEIGHT;
        p.position.set(0, floorY, SHAFT_DEPTH / 2 + 1.5);
        p.rotation.y = Math.PI;
        scene.add(p);
        people.push({
            mesh: p,
            currentFloor: i,
            destinationFloor: -1,
            state: 'waiting'
        });
    }
    emptyFloor = FLOOR_COUNT - 1;

    /* Start simulation loop */
    animate();
    scheduleNextMove();
}

function createBuilding() {
    var buildingGroup = new THREE.Group();

    /* Floor material (transparent) */
    var floorMat = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    /* Wall material (semi-transparent) */
    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    /* Ground floor (solid) */
    var groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 2, 0.3, BUILDING_DEPTH + 2);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.15;
    buildingGroup.add(ground);

    /* Roof (solid) */
    var roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 2, 0.3, BUILDING_DEPTH + 2);
    var roof = new THREE.Mesh(roofGeo, groundMat);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    buildingGroup.add(roof);

    /* Intermediate floors with shaft cutout */
    for (var f = 1; f < FLOOR_COUNT; f++) {
        var floorY = f * FLOOR_HEIGHT;

        /* Floor is made of 4 strips around the shaft opening */
        var halfW = BUILDING_WIDTH / 2;
        var halfD = BUILDING_DEPTH / 2;
        var shaftHalfW = SHAFT_WIDTH / 2;
        var shaftHalfD = SHAFT_DEPTH / 2;

        /* Front strip (positive Z) */
        var frontLen = halfD - shaftHalfD;
        if (frontLen > 0) {
            var geoF = new THREE.BoxGeometry(BUILDING_WIDTH, 0.15, frontLen);
            var meshF = new THREE.Mesh(geoF, floorMat);
            meshF.position.set(0, floorY, shaftHalfD + frontLen / 2);
            buildingGroup.add(meshF);
        }

        /* Back strip (negative Z) */
        if (frontLen > 0) {
            var geoB = new THREE.BoxGeometry(BUILDING_WIDTH, 0.15, frontLen);
            var meshB = new THREE.Mesh(geoB, floorMat);
            meshB.position.set(0, floorY, -shaftHalfD - frontLen / 2);
            buildingGroup.add(meshB);
        }

        /* Left strip (negative X) */
        var sideLen = halfW - shaftHalfW;
        if (sideLen > 0) {
            var geoL = new THREE.BoxGeometry(sideLen, 0.15, SHAFT_DEPTH);
            var meshL = new THREE.Mesh(geoL, floorMat);
            meshL.position.set(-shaftHalfW - sideLen / 2, floorY, 0);
            buildingGroup.add(meshL);
        }

        /* Right strip (positive X) */
        if (sideLen > 0) {
            var geoR = new THREE.BoxGeometry(sideLen, 0.15, SHAFT_DEPTH);
            var meshR = new THREE.Mesh(geoR, floorMat);
            meshR.position.set(shaftHalfW + sideLen / 2, floorY, 0);
            buildingGroup.add(meshR);
        }

        /* Floor label */
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 128, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Floor ' + f, 64, 44);
        var tex = new THREE.CanvasTexture(canvas);
        var labelGeo = new THREE.PlaneGeometry(2, 1);
        var labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        var labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.set(-halfW + 1.5, floorY + 0.5, halfD - 0.5);
        buildingGroup.add(labelMesh);
    }

    /* Walls */
    /* Back wall (negative Z) */
    var backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, 0.2);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    /* Left wall (negative X) */
    var leftWallGeo = new THREE.BoxGeometry(0.2, FLOOR_COUNT * FLOOR_HEIGHT, BUILDING_DEPTH);
    var leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(leftWall);

    /* Right wall (positive X) */
    var rightWall = new THREE.Mesh(leftWallGeo, wallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(rightWall);

    /* Front wall with shaft opening - split into left and right panels */
    var frontHalfW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    if (frontHalfW > 0) {
        var fLeftGeo = new THREE.BoxGeometry(frontHalfW, FLOOR_COUNT * FLOOR_HEIGHT, 0.2);
        var fLeftWall = new THREE.Mesh(fLeftGeo, wallMat);
        fLeftWall.position.set(-BUILDING_WIDTH / 2 + frontHalfW / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
        buildingGroup.add(fLeftWall);

        var fRightWall = new THREE.Mesh(fLeftGeo, wallMat);
        fRightWall.position.set(BUILDING_WIDTH / 2 - frontHalfW / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
        buildingGroup.add(fRightWall);

        /* Top panel above shaft */
        var topPanelGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT - (FLOOR_COUNT - 1) * FLOOR_HEIGHT, 0.2);
        // Actually let's put a small strip above the shaft opening on front wall
    }

    /* Elevator shaft walls */
    var shaftWallMat = new THREE.MeshLambertMaterial({
        color: 0x666699,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    /* Shaft left wall */
    var shaftLeftGeo = new THREE.BoxGeometry(0.1, FLOOR_COUNT * FLOOR_HEIGHT, SHAFT_DEPTH);
    var shaftLeft = new THREE.Mesh(shaftLeftGeo, shaftWallMat);
    shaftLeft.position.set(-SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(shaftLeft);

    /* Shaft right wall */
    var shaftRight = new THREE.Mesh(shaftLeftGeo, shaftWallMat);
    shaftRight.position.set(SHAFT_WIDTH / 2, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);
    buildingGroup.add(shaftRight);

    scene.add(buildingGroup);
}

function createElevator() {
    var car = new THREE.Group();

    /* Frame material */
    var frameMat = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    /* Door material */
    var doorMat = new THREE.MeshLambertMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    /* Back wall (solid) */
    var backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, FLOOR_HEIGHT - 0.5, 0.15);
    var backWall = new THREE.Mesh(backWallGeo, frameMat);
    backWall.position.set(0, (FLOOR_HEIGHT - 0.5) / 2, -SHAFT_DEPTH / 2 + 0.3);
    car.add(backWall);

    /* Left wall (transparent) */
    var sideWallGeo = new THREE.BoxGeometry(0.15, FLOOR_HEIGHT - 0.5, SHAFT_DEPTH - 0.6);
    var leftWall = new THREE.Mesh(sideWallGeo, frameMat);
    leftWall.position.set(-SHAFT_WIDTH / 2 + 0.3, (FLOOR_HEIGHT - 0.5) / 2, 0);
    car.add(leftWall);

    /* Right wall */
    var rightWall = new THREE.Mesh(sideWallGeo, frameMat);
    rightWall.position.set(SHAFT_WIDTH / 2 - 0.3, (FLOOR_HEIGHT - 0.5) / 2, 0);
    car.add(rightWall);

    /* Floor of elevator */
    var floorGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.6, 0.1, SHAFT_DEPTH - 0.6);
    var floorMat = new THREE.MeshLambertMaterial({ color: 0xdddd44, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    var carFloor = new THREE.Mesh(floorGeo, floorMat);
    carFloor.position.set(0, 0.05, 0);
    car.add(carFloor);

    /* Ceiling */
    var ceilGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 0.6, 0.1, SHAFT_DEPTH - 0.6);
    var carCeil = new THREE.Mesh(ceilGeo, frameMat);
    carCeil.position.set(0, FLOOR_HEIGHT - 0.55, 0);
    car.add(carCeil);

    /* Left door */
    var doorW = (SHAFT_WIDTH - 1.0) / 2;
    var doorH = FLOOR_HEIGHT - 1.0;
    var doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.1);
    var leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-doorW / 2 - 0.15, doorH / 2 + 0.3, SHAFT_DEPTH / 2 - 0.4);
    car.add(leftDoor);

    /* Right door */
    var rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(doorW / 2 + 0.15, doorH / 2 + 0.3, SHAFT_DEPTH / 2 - 0.4);
    car.add(rightDoor);

    /* Store references */
    car.leftDoor = leftDoor;
    car.rightDoor = rightDoor;
    car.doorState = 'closed';
    car.doorOpenAmount = 0;

    /* Position elevator at ground floor */
    car.position.set(0, 0, 0);

    return car;
}

function getFloorY(floor) {
    return floor * FLOOR_HEIGHT;
}

function animate() {
    requestAnimationFrame(animate);
    var delta = clock.getDelta() * animationSpeed;

    /* Walking animation for all people */
    for (var i = 0; i < people.length; i++) {
        var p = people[i];
        if (p.mesh.userData.isWalking) {
            var t = clock.elapsedTime * animationSpeed * 5;
            var swing = Math.sin(t + i) * 0.5;
            p.mesh.userData.leftLeg.rotation.x = swing;
            p.mesh.userData.rightLeg.rotation.x = -swing;
        } else {
            p.mesh.userData.leftLeg.rotation.x *= 0.85;
            p.mesh.userData.rightLeg.rotation.x *= 0.85;
        }
    }

    /* Run current animation step */
    if (currentAnimation) {
        currentAnimation(delta);
    }

    controls.update();
    renderer.render(scene, camera);
}

function scheduleNextMove() {
    var waitingPeople = [];
    for (var i = 0; i < people.length; i++) {
        if (people[i].state === 'waiting' && people[i].currentFloor !== emptyFloor) {
            waitingPeople.push(people[i]);
        }
    }

    if (waitingPeople.length === 0) return;

    var chosen = waitingPeople[Math.floor(Math.random() * waitingPeople.length)];
    chosen.destinationFloor = emptyFloor;

    setTimeout(function () {
        runElevatorCycle(chosen);
    }, 1500 / animationSpeed);
}

function runElevatorCycle(personData) {
    var pickupFloor = personData.currentFloor;
    var destFloor = personData.destinationFloor;
    var personMesh = personData.mesh;

    personData.state = 'moving';

    /* Step 1: Move elevator to pickup floor */
    var targetY = getFloorY(pickupFloor);
    moveElevatorTo(targetY, function () {
        /* Step 2: Open doors */
        openDoors(function () {
            /* Step 3: Person walks into elevator and boards */
            personMesh.userData.isWalking = true;

            var startZ = personMesh.position.z;
            var targetZ = SHAFT_DEPTH / 2 - 1.5;

            function walkIn() {
                if (personMesh.parent === scene) {
                    var worldPos = new THREE.Vector3();
                    personMesh.getWorldPosition(worldPos);
                    var moveDir = targetZ - worldPos.z;

                    if (Math.abs(moveDir) > 0.05) {
                        personMesh.position.z += Math.sign(moveDir) * PERSON_MOVE_SPEED * clock.getDelta() * animationSpeed;
                        requestAnimationFrame(walkIn);
                    } else {
                        /* Person reached elevator interior - board */
                        var wp = new THREE.Vector3();
                        personMesh.getWorldPosition(wp);
                        elevatorCar.attach(personMesh);
                        personMesh.position.y = 0.15;
                        personMesh.userData.isWalking = false;

                        /* Step 4: Close doors */
                        closeDoors(function () {
                            /* Step 5: Move to destination floor */
                            var destY = getFloorY(destFloor);
                            moveElevatorTo(destY, function () {
                                /* Step 6: Open doors at destination */
                                openDoors(function () {
                                    /* Step 7: Person exits elevator */
                                    personMesh.userData.isWalking = true;

                                    var exitZ = SHAFT_DEPTH / 2 + 1.5;

                                    function walkOut() {
                                        if (personMesh.parent === elevatorCar) {
                                            var localPos = personMesh.position.z;
                                            var moveDir = exitZ - localPos;

                                            if (Math.abs(moveDir) > 0.05) {
                                                personMesh.position.z += Math.sign(moveDir) * PERSON_MOVE_SPEED * clock.getDelta() * animationSpeed;
                                                requestAnimationFrame(walkOut);
                                            } else {
                                                /* Person reached exit spot - reparent to scene */
                                                var wp2 = new THREE.Vector3();
                                                personMesh.getWorldPosition(wp2);
                                                scene.attach(personMesh);
                                                personMesh.position.y = getFloorY(destFloor);
                                                personMesh.userData.isWalking = false;

                                                /* Update state */
                                                personData.currentFloor = destFloor;
                                                personData.state = 'waiting';
                                                emptyFloor = pickupFloor;

                                                /* Step 8: Close doors */
                                                closeDoors(function () {
                                                    setTimeout(scheduleNextMove, 500 / animationSpeed);
                                                });
                                            }
                                        } else {
                                            scene.attach(personMesh);
                                            personMesh.position.y = getFloorY(destFloor);
                                            personMesh.userData.isWalking = false;
                                            personData.currentFloor = destFloor;
                                            personData.state = 'waiting';
                                            emptyFloor = pickupFloor;
                                            closeDoors(function () {
                                                setTimeout(scheduleNextMove, 500 / animationSpeed);
                                            });
                                        }
                                    }
                                    walkOut();
                                });
                            });
                        });
                    }
                } else {
                    elevatorCar.attach(personMesh);
                    personMesh.position.y = 0.15;
                    personMesh.userData.isWalking = false;
                    closeDoors(function () {
                        var destY2 = getFloorY(destFloor);
                        moveElevatorTo(destY2, function () {
                            openDoors(function () {
                                personMesh.userData.isWalking = true;
                                var exitZ2 = SHAFT_DEPTH / 2 + 1.5;

                                function walkOut2() {
                                    if (personMesh.parent === elevatorCar) {
                                        var localPos2 = personMesh.position.z;
                                        var moveDir2 = exitZ2 - localPos2;
                                        if (Math.abs(moveDir2) > 0.05) {
                                            personMesh.position.z += Math.sign(moveDir2) * PERSON_MOVE_SPEED * clock.getDelta() * animationSpeed;
                                            requestAnimationFrame(walkOut2);
                                        } else {
                                            var wp3 = new THREE.Vector3();
                                            personMesh.getWorldPosition(wp3);
                                            scene.attach(personMesh);
                                            personMesh.position.y = getFloorY(destFloor);
                                            personMesh.userData.isWalking = false;
                                            personData.currentFloor = destFloor;
                                            personData.state = 'waiting';
                                            emptyFloor = pickupFloor;
                                            closeDoors(function () {
                                                setTimeout(scheduleNextMove, 500 / animationSpeed);
                                            });
                                        }
                                    }
                                }
                                walkOut2();
                            });
                        });
                    });
                }
            }
            walkIn();
        });
    });
}

function moveElevatorTo(targetY, callback) {
    var startY = elevatorCar.position.y;
    currentAnimation = function (delta) {
        var diff = targetY - elevatorCar.position.y;
        if (Math.abs(diff) < 0.01) {
            elevatorCar.position.y = targetY;
            currentAnimation = null;
            if (callback) callback();
        } else {
            elevatorCar.position.y += Math.sign(diff) * ELEVATOR_SPEED * delta;
        }
    };
}

function openDoors(callback) {
    elevatorCar.doorState = 'opening';
    var maxOpen = SHAFT_WIDTH / 4 - 0.3;
    currentAnimation = function (delta) {
        if (elevatorCar.doorOpenAmount < maxOpen) {
            elevatorCar.doorOpenAmount += 3 * delta;
            if (elevatorCar.doorOpenAmount > maxOpen) elevatorCar.doorOpenAmount = maxOpen;

            var leftDoor = elevatorCar.leftDoor;
            var rightDoor = elevatorCar.rightDoor;
            leftDoor.position.x = -SHAFT_WIDTH / 4 + 0.15 - elevatorCar.doorOpenAmount;
            rightDoor.position.x = SHAFT_WIDTH / 4 - 0.15 + elevatorCar.doorOpenAmount;

            if (elevatorCar.doorOpenAmount >= maxOpen) {
                elevatorCar.doorState = 'open';
                currentAnimation = null;
                if (callback) callback();
            }
        } else {
            elevatorCar.doorState = 'open';
            currentAnimation = null;
            if (callback) callback();
        }
    };
}

function closeDoors(callback) {
    elevatorCar.doorState = 'closing';
    currentAnimation = function (delta) {
        if (elevatorCar.doorOpenAmount > 0) {
            elevatorCar.doorOpenAmount -= 3 * delta;
            if (elevatorCar.doorOpenAmount < 0) elevatorCar.doorOpenAmount = 0;

            var leftDoor = elevatorCar.leftDoor;
            var rightDoor = elevatorCar.rightDoor;
            leftDoor.position.x = -SHAFT_WIDTH / 4 + 0.15 - elevatorCar.doorOpenAmount;
            rightDoor.position.x = SHAFT_WIDTH / 4 - 0.15 + elevatorCar.doorOpenAmount;

            if (elevatorCar.doorOpenAmount <= 0) {
                elevatorCar.doorState = 'closed';
                currentAnimation = null;
                if (callback) callback();
            }
        } else {
            elevatorCar.doorState = 'closed';
            currentAnimation = null;
            if (callback) callback();
        }
    };
}

window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('DOMContentLoaded', init);
