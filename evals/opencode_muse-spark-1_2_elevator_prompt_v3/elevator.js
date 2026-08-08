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
var people = [];
var emptyFloor = 0;
var currentFloor = 0;
var simSpeed = 1;
var busy = false;

function floorY(f) {
    return f * FLOOR_HEIGHT;
}

function createBuilding() {
    // floors with shaft cutout (4 pieces per floor)
    for (var f = 0; f < FLOOR_COUNT; f++) {
        var y = floorY(f);
        var isGroundOrRoof = (f === 0 || f === FLOOR_COUNT - 1);
        // floor slab pieces: create 4 quads around shaft
        var floorMat = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: isGroundOrRoof ? 0.6 : 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        var thickness = 0.15;
        // front strip (positive Z)
        var frontH = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        var frontGeo = new THREE.BoxGeometry(BUILDING_WIDTH, thickness, frontH);
        var frontMesh = new THREE.Mesh(frontGeo, floorMat);
        frontMesh.position.set(0, y, (SHAFT_DEPTH / 2 + frontH / 2));
        frontMesh.renderOrder = 0;
        scene.add(frontMesh);
        // back strip
        var backMesh = new THREE.Mesh(frontGeo, floorMat);
        backMesh.position.set(0, y, -(SHAFT_DEPTH / 2 + frontH / 2));
        backMesh.renderOrder = 0;
        scene.add(backMesh);
        // left strip
        var sideW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        var sideGeo = new THREE.BoxGeometry(sideW, thickness, SHAFT_DEPTH);
        var leftMesh = new THREE.Mesh(sideGeo, floorMat);
        leftMesh.position.set(-(SHAFT_WIDTH / 2 + sideW / 2), y, 0);
        leftMesh.renderOrder = 0;
        scene.add(leftMesh);
        var rightMesh = new THREE.Mesh(sideGeo, floorMat);
        rightMesh.position.set((SHAFT_WIDTH / 2 + sideW / 2), y, 0);
        rightMesh.renderOrder = 0;
        scene.add(rightMesh);

        // roof at top
        if (f === FLOOR_COUNT - 1) {
            var roofY = y + FLOOR_HEIGHT;
            var roofMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
            var roofFront = new THREE.Mesh(frontGeo, roofMat);
            roofFront.position.set(0, roofY, (SHAFT_DEPTH / 2 + frontH / 2));
            roofFront.renderOrder = 0;
            scene.add(roofFront);
            var roofBack = new THREE.Mesh(frontGeo, roofMat);
            roofBack.position.set(0, roofY, -(SHAFT_DEPTH / 2 + frontH / 2));
            roofBack.renderOrder = 0;
            scene.add(roofBack);
            var roofLeft = new THREE.Mesh(sideGeo, roofMat);
            roofLeft.position.set(-(SHAFT_WIDTH / 2 + sideW / 2), roofY, 0);
            roofLeft.renderOrder = 0;
            scene.add(roofLeft);
            var roofRight = new THREE.Mesh(sideGeo, roofMat);
            roofRight.position.set((SHAFT_WIDTH / 2 + sideW / 2), roofY, 0);
            roofRight.renderOrder = 0;
            scene.add(roofRight);
            // center roof over shaft (solid cap)
            var capGeo = new THREE.BoxGeometry(SHAFT_WIDTH, thickness, SHAFT_DEPTH);
            var cap = new THREE.Mesh(capGeo, roofMat);
            cap.position.set(0, roofY, 0);
            cap.renderOrder = 0;
            scene.add(cap);
        }
    }

    // outer walls - semi transparent blue
    var wallMat = new THREE.MeshPhongMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    var wallThickness = 0.12;
    var totalH = FLOOR_COUNT * FLOOR_HEIGHT;
    // back wall
    var backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, totalH, wallThickness);
    var backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, totalH / 2, -BUILDING_DEPTH / 2);
    backWall.renderOrder = 0;
    scene.add(backWall);
    // left wall
    var sideWallGeo = new THREE.BoxGeometry(wallThickness, totalH, BUILDING_DEPTH);
    var leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, totalH / 2, 0);
    leftWall.renderOrder = 0;
    scene.add(leftWall);
    var rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, totalH / 2, 0);
    rightWall.renderOrder = 0;
    scene.add(rightWall);
    // front wall left and right of shaft (leave opening for view but still transparent)
    var frontWallW = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    var frontWallGeo = new THREE.BoxGeometry(frontWallW, totalH, wallThickness);
    var flWall = new THREE.Mesh(frontWallGeo, wallMat);
    flWall.position.set(-(SHAFT_WIDTH / 2 + frontWallW / 2), totalH / 2, BUILDING_DEPTH / 2);
    flWall.renderOrder = 0;
    scene.add(flWall);
    var frWall = new THREE.Mesh(frontWallGeo, wallMat);
    frWall.position.set((SHAFT_WIDTH / 2 + frontWallW / 2), totalH / 2, BUILDING_DEPTH / 2);
    frWall.renderOrder = 0;
    scene.add(frWall);
    // vertical shaft frame lines (thin)
    var shaftEdgeMat = new THREE.MeshPhongMaterial({ color: 0x8888aa, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false });
    var edgeGeoV = new THREE.BoxGeometry(0.08, totalH, 0.08);
    var sx = SHAFT_WIDTH / 2;
    var sz = SHAFT_DEPTH / 2;
    var corners = [[-sx, -sz], [sx, -sz], [-sx, sz], [sx, sz]];
    for (var ci = 0; ci < corners.length; ci++) {
        var edge = new THREE.Mesh(edgeGeoV, shaftEdgeMat);
        edge.position.set(corners[ci][0], totalH / 2, corners[ci][1]);
        scene.add(edge);
    }
}

function createElevatorCar() {
    var group = new THREE.Group();
    var carH = FLOOR_HEIGHT * 0.85;
    var carW = SHAFT_WIDTH * 0.9;
    var carD = SHAFT_DEPTH * 0.9;

    // floor
    var floorGeo = new THREE.BoxGeometry(carW, 0.1, carD);
    var floorMat = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    var floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 0.05, 0);
    floorMesh.renderOrder = 1;
    group.add(floorMesh);

    // ceiling
    var ceilMesh = new THREE.Mesh(floorGeo, floorMat);
    ceilMesh.position.set(0, carH, 0);
    ceilMesh.renderOrder = 1;
    group.add(ceilMesh);

    // back wall solid yellow-ish
    var backGeo = new THREE.BoxGeometry(carW, carH, 0.08);
    var backMat = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    var backWallMesh = new THREE.Mesh(backGeo, backMat);
    backWallMesh.position.set(0, carH / 2, -carD / 2);
    backWallMesh.renderOrder = 1;
    group.add(backWallMesh);

    // side walls transparent
    var sideGeo = new THREE.BoxGeometry(0.08, carH, carD);
    var sideMat = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    var leftWallMesh = new THREE.Mesh(sideGeo, sideMat);
    leftWallMesh.position.set(-carW / 2, carH / 2, 0);
    leftWallMesh.renderOrder = 1;
    group.add(leftWallMesh);
    var rightWallMesh = new THREE.Mesh(sideGeo, sideMat);
    rightWallMesh.position.set(carW / 2, carH / 2, 0);
    rightWallMesh.renderOrder = 1;
    group.add(rightWallMesh);

    // doors - two halves sliding on X
    var doorW = carW / 2;
    var doorH = carH * 0.92;
    var doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.06);
    var doorMat = new THREE.MeshPhongMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    var leftDoor = new THREE.Mesh(doorGeo, doorMat);
    leftDoor.position.set(-doorW / 2, carH / 2, carD / 2);
    leftDoor.renderOrder = 2;
    group.add(leftDoor);
    var rightDoor = new THREE.Mesh(doorGeo, doorMat);
    rightDoor.position.set(doorW / 2, carH / 2, carD / 2);
    rightDoor.renderOrder = 2;
    group.add(rightDoor);

    group.leftDoor = leftDoor;
    group.rightDoor = rightDoor;
    group.userData = { doorOpen: false, carW: carW, carD: carD, carH: carH };
    group.position.set(0, floorY(0), 0);
    return group;
}

function animateElevatorTo(targetFloor, onDone) {
    var targetY = floorY(targetFloor);
    function step() {
        var diff = targetY - elevatorCar.position.y;
        if (Math.abs(diff) < 0.01) {
            elevatorCar.position.y = targetY;
            currentFloor = targetFloor;
            if (onDone) onDone();
            return;
        }
        var dir = diff > 0 ? 1 : -1;
        var delta = ELEVATOR_SPEED * 0.016 * simSpeed * dir;
        if (Math.abs(delta) > Math.abs(diff)) delta = diff;
        elevatorCar.position.y += delta;
        requestAnimationFrame(step);
    }
    step();
}

function animateDoors(open, onDone) {
    var carW = elevatorCar.userData.carW;
    var doorW = carW / 2;
    // open: left to -doorW, right to +doorW ; closed: left -doorW/2 , right +doorW/2
    var leftTarget = open ? -doorW : -doorW / 2;
    var rightTarget = open ? doorW : doorW / 2;
    var speed = 3 * simSpeed;
    function step() {
        var ld = elevatorCar.leftDoor.position.x;
        var rd = elevatorCar.rightDoor.position.x;
        var dl = leftTarget - ld;
        var dr = rightTarget - rd;
        if (Math.abs(dl) < 0.01 && Math.abs(dr) < 0.01) {
            elevatorCar.leftDoor.position.x = leftTarget;
            elevatorCar.rightDoor.position.x = rightTarget;
            elevatorCar.userData.doorOpen = open;
            if (onDone) onDone();
            return;
        }
        var stepL = Math.sign(dl) * Math.min(Math.abs(dl), speed * 0.016);
        var stepR = Math.sign(dr) * Math.min(Math.abs(dr), speed * 0.016);
        // scale by simSpeed already in speed
        elevatorCar.leftDoor.position.x += stepL;
        elevatorCar.rightDoor.position.x += stepR;
        requestAnimationFrame(step);
    }
    step();
}

function walkPerson(person, targetX, targetZ, onDone) {
    person.userData.isWalking = true;
    var startX = person.position.x;
    var startZ = person.position.z;
    // face direction
    var angle = Math.atan2(targetX - startX, targetZ - startZ);
    person.rotation.y = angle;
    var totalDist = Math.sqrt((targetX - startX) * (targetX - startX) + (targetZ - startZ) * (targetZ - startZ));
    if (totalDist < 0.01) {
        person.userData.isWalking = false;
        person.rotation.y = Math.PI;
        if (onDone) onDone();
        return;
    }
    var progress = 0;
    var walkSpeed = PERSON_MOVE_SPEED * simSpeed;
    function step() {
        var stepSize = walkSpeed * 0.016;
        progress += stepSize / totalDist;
        if (progress >= 1) {
            person.position.x = targetX;
            person.position.z = targetZ;
            person.userData.isWalking = false;
            // reset legs
            if (person.userData.leftLeg) person.userData.leftLeg.rotation.x = 0;
            if (person.userData.rightLeg) person.userData.rightLeg.rotation.x = 0;
            person.rotation.y = Math.PI;
            if (onDone) onDone();
            return;
        }
        person.position.x = startX + (targetX - startX) * progress;
        person.position.z = startZ + (targetZ - startZ) * progress;
        // leg swing
        var t = Date.now() * 0.012 * simSpeed;
        var swing = Math.sin(t) * 0.6;
        if (person.userData.leftLeg) person.userData.leftLeg.rotation.x = swing;
        if (person.userData.rightLeg) person.userData.rightLeg.rotation.x = -swing;
        requestAnimationFrame(step);
    }
    step();
}

function doCycle() {
    if (busy) return;
    busy = true;
    // pick random person not on emptyFloor
    var candidates = [];
    for (var i = 0; i < people.length; i++) {
        if (people[i].userData.homeFloor !== emptyFloor) candidates.push(people[i]);
    }
    if (candidates.length === 0) { busy = false; setTimeout(doCycle, 800); return; }
    var person = candidates[Math.floor(Math.random() * candidates.length)];
    var pickupFloor = person.userData.homeFloor;
    var destFloor = emptyFloor;

    animateElevatorTo(pickupFloor, function() {
        animateDoors(true, function() {
            setTimeout(function() {
                // walk into elevator while still in scene
                var insideZ = 0;
                walkPerson(person, 0, insideZ, function() {
                    // reparent to elevator preserving world transform
                    elevatorCar.attach(person);
                    // keep facing forward inside
                    person.rotation.y = Math.PI;
                    setTimeout(function() {
                        animateDoors(false, function() {
                            setTimeout(function() {
                                animateElevatorTo(destFloor, function() {
                                    animateDoors(true, function() {
                                        setTimeout(function() {
                                            // walk out while still child of elevator to front waiting spot
                                            var waitZ = SHAFT_DEPTH / 2 + 2.2;
                                            // need target in elevator local coords: x=0, z=waitZ
                                            walkPerson(person, 0, waitZ, function() {
                                                // reparent back to scene preserving world pos
                                                scene.attach(person);
                                                person.rotation.y = Math.PI;
                                                // update floors
                                                var oldFloor = pickupFloor;
                                                emptyFloor = oldFloor;
                                                person.userData.homeFloor = destFloor;
                                                // ensure y aligns
                                                person.position.y = floorY(destFloor);
                                                setTimeout(function() {
                                                    animateDoors(false, function() {
                                                        setTimeout(function() {
                                                            busy = false;
                                                            doCycle();
                                                        }, 300);
                                                    });
                                                }, 300);
                                            });
                                        }, 300);
                                    });
                                });
                            }, 300);
                        });
                    }, 300);
                });
            }, 300);
        });
    });
}

function createPeople() {
    // one person per occupied floor, one empty floor
    var waitZ = SHAFT_DEPTH / 2 + 2.2;
    for (var f = 0; f < FLOOR_COUNT; f++) {
        if (f === emptyFloor) continue;
        var p = createPerson();
        p.position.set(0, floorY(f), waitZ);
        p.rotation.y = Math.PI;
        p.userData.homeFloor = f;
        // ensure legs reset
        p.userData.isWalking = false;
        if (p.userData.leftLeg) p.userData.leftLeg.rotation.x = 0;
        if (p.userData.rightLeg) p.userData.rightLeg.rotation.x = 0;
        people.push(p);
        scene.add(p);
    }
}

function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2, 0);
    controls.update();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);
    createPeople();

    var slider = document.getElementById("speedSlider");
    var label = document.getElementById("speedLabel");
    if (slider) {
        slider.addEventListener("input", function(event) {
            simSpeed = parseFloat(event.target.value);
            if (label) label.textContent = simSpeed + "x";
        });
    }

    window.addEventListener("resize", function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        // leg animation is handled in walkPerson steps; also keep idle reset
        renderer.render(scene, camera);
    }
    animate();

    setTimeout(doCycle, 1200);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
