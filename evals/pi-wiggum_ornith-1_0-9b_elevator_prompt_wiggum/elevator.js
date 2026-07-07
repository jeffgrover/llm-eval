(function () {
    "use strict";

    // --- Required constants ---
    const FLOOR_HEIGHT = 3;
    const FLOOR_COUNT = 6;
    const BUILDING_WIDTH = 20;
    const BUILDING_DEPTH = 15;
    const SHAFT_WIDTH = 5;
    const SHAFT_DEPTH = 5;
    const ELEVATOR_SPEED = 2;
    const PERSON_MOVE_SPEED = 1;

    // --- Scene setup ---
    let scene;
    let camera;
    let renderer;
    let controls;

    function createBuilding() {
        var group = new THREE.Group();

        // Floor (bottom slab)
        var floorGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        var floorMat = new THREE.MeshPhongMaterial({ color: 0x3a5f2d });
        var floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        group.add(floor);

        // Ceiling (top slab)
        var ceilingMat = new THREE.MeshPhongMaterial({ color: 0x5a3f1d });
        var ceiling = new THREE.Mesh(floorGeo.clone(), ceilingMat);
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.position.y = FLOOR_HEIGHT;
        group.add(ceiling);

        // Back wall
        var backWallGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_HEIGHT + 0.5);
        var wallMat = new THREE.MeshPhongMaterial({ color: 0x4a2f1d });
        var backWall = new THREE.Mesh(backWallGeo, wallMat);
        backWall.rotation.y = Math.PI / 2;
        backWall.position.set(0, FLOOR_HEIGHT / 2 + 0.25, -BUILDING_DEPTH / 2);
        group.add(backWall);

        // Front wall (with door opening)
        var frontWallMat = new THREE.MeshPhongMaterial({ color: 0x4a2f1d });
        var frontWallGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_HEIGHT + 0.5);
        var frontWall = new THREE.Mesh(frontWallGeo, frontWallMat);
        frontWall.rotation.y = -Math.PI / 2;
        frontWall.position.set(0, FLOOR_HEIGHT / 2 + 0.25, BUILDING_DEPTH / 2);
        group.add(frontWall);

        // Left wall
        var leftWallGeo = new THREE.PlaneGeometry(BUILDING_DEPTH, FLOOR_HEIGHT + 0.5);
        var leftWall = new THREE.Mesh(leftWallGeo.clone(), frontWallMat.clone());
        leftWall.rotation.y = -Math.PI / 2;
        leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT / 2 + 0.25, 0);
        group.add(leftWall);

        // Right wall
        var rightWallGeo = new THREE.PlaneGeometry(BUILDING_DEPTH, FLOOR_HEIGHT + 0.5);
        var rightWall = new THREE.Mesh(rightWallGeo.clone(), frontWallMat.clone());
        rightWall.rotation.y = Math.PI / 2;
        rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT / 2 + 0.25, 0);
        group.add(rightWall);

        return group;
    }

    function createElevatorCar() {
        var carGroup = new THREE.Group();

        // Car body (box)
        var bodyW = 2.4;
        var bodyH = 1.8;
        var bodyD = 3.0;
        var bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
        var bodyMat = new THREE.MeshPhongMaterial({ color: 0xc8c8c8 });
        var body = new THREE.Mesh(bodyGeo, bodyMat);
        carGroup.add(body);

        // Car floor
        var carFloorGeo = new THREE.PlaneGeometry(bodyW, bodyD);
        var carFloorMat = new THREE.MeshPhongMaterial({ color: 0xf5f5dc });
        var carFloor = new THREE.Mesh(carFloorGeo, carFloorMat);
        carFloor.rotation.x = -Math.PI / 2;
        carGroup.add(carFloor);

        // Car ceiling
        var carCeilingMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        var carCeiling = new THREE.Mesh(carFloorGeo.clone(), carCeilingMat);
        carCeiling.rotation.x = Math.PI / 2;
        carGroup.add(carCeiling);

        // Left door (slab)
        var leftDoorH = bodyH;
        var leftDoorGeo = new THREE.BoxGeometry(bodyW, leftDoorH, 0.2);
        var leftDoorMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        var leftDoor = new THREE.Mesh(leftDoorGeo, leftDoorMat);
        leftDoor.position.x = -bodyW / 2;
        carGroup.add(leftDoor);

        // Right door (slab)
        var rightDoorGeo = new THREE.BoxGeometry(bodyW, leftDoorH, 0.2);
        var rightDoorMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        var rightDoor = new THREE.Mesh(rightDoorGeo, rightDoorMat);
        rightDoor.position.x = bodyW / 2;
        carGroup.add(rightDoor);

        // Car interior light
        var lightGeo = new THREE.SphereGeometry(0.15, 8, 8);
        var lightMat = new THREE.MeshPhongMaterial({ color: 0xffffaa });
        var light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(0, bodyH / 2 + 0.3, -0.3);
        carGroup.add(light);

        // Store doors as direct properties of the Group
        carGroup.leftDoor = leftDoor;
        carGroup.rightDoor = rightDoor;

        return { carGroup: carGroup, leftDoor: leftDoor, rightDoor: rightDoor };
    }

    // --- Main globals ---
    var leftDoor;
    var rightDoor;
    let elevatorCar;
    let people = [];

    // --- Animation state ---
    var elevY = 0;
    var elevDir = 1;
    var targetFloor = 0.5;
    var animTimer = 0;
    var leftDoorOpen = false;
    var rightDoorOpen = true;
    var doorAnimTimer = 0;

    // --- Helpers ---
    function boardElevator(person) {
        if (elevatorCar && person && !person.inElevator) {
            elevatorCar.attach(person);
            elevatorCar.leftDoor.position.x = 0;
            elevatorCar.rightDoor.position.x = 0;
            person.userData.currentFloor = Math.round(elevY / FLOOR_HEIGHT);
        }
    }

    function exitElevator(person) {
        if (elevatorCar && person && !person.inElevator) {
            scene.attach(person);
        }
    }

    // --- Animation loop ---
    function update() {
        var bodyW = 2.4;
        var bodyH = 1.8;
        var bodyD = 3.0;

        // Elevator movement
        var targetY = Math.round(targetFloor / FLOOR_HEIGHT) * FLOOR_HEIGHT;
        elevY += (targetY - elevY) * 0.15;
        elevatorCar.carGroup.position.y = elevY + SHAFT_DEPTH / 2 - bodyH / 2;

        // Door animation: doors open when near a floor, close after brief pause
        var isNearFloor = Math.abs(elevY - targetY) < 0.3;
        if (isNearFloor && !leftDoorOpen && animTimer > 0.8) {
            leftDoorOpen = true;
            rightDoorOpen = false;
        } else if (!isNearFloor && leftDoorOpen) {
            doorAnimTimer += 0.1;
            var t = Math.min(doorAnimTimer, 1);
            var openAmount = (Math.sin(t * Math.PI) + 1) / 2;
            elevatorCar.leftDoor.position.x = -bodyW / 2 * openAmount;
            elevatorCar.rightDoor.position.x = bodyW / 2 * openAmount;
            if (doorAnimTimer >= 0.8) {
                leftDoorOpen = false;
                rightDoorOpen = true;
            }
        }

        // Elevator car color changes slightly with movement for visual feedback
        var baseHue = elevY / FLOOR_HEIGHT * 50 + 200;
        elevatorCar.carGroup.children[0].material.color.setHSL(
            Math.min(baseHue, 360) / 360,
            0.4,
            0.7
        );

        // Animate people walking
        for (var i = people.length - 1; i >= 0; i--) {
            var p = people[i];
            if (p.walkState && !p.walkState.done) {
                p.tick();
            }
        }

        animTimer += 0.025;
        doorAnimTimer += 0.1;
    }

    // --- Main entry point ---
    function startSimulation() {
        if (!scene) return;

        // Initialize Three.js renderer and camera
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            document.body.appendChild(renderer.domElement);
        }
        if (!camera) {
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.set(20, 15, 20);
            camera.lookAt(0, FLOOR_HEIGHT / 2, 0);
        }

        var body = new THREE.Group();

        // Create the building structure
        scene.attach(body);
        var floorGroup = createBuilding();
        scene.attach(floorGroup);

        // Create elevator car
        var result = createElevatorCar();
        var carGroup = result.carGroup;
        leftDoor = result.leftDoor;
        rightDoor = result.rightDoor;
        elevatorCar = carGroup;
        elevatorCar.leftDoor = leftDoor;
        elevatorCar.rightDoor = rightDoor;
        elevatorCar.position = new THREE.Vector3(0, 1.5, 0);
        scene.attach(elevatorCar);

        // Create a few people walking into the elevator area
        for (var i = 0; i < 4; i++) {
            var personColor = [0xff6644, 0x4488ff, 0x44dd44, 0xaa44ff][i % 4];
            var p = window.createPerson(personColor);
            if (p) {
                p.position.set(
                    -1.5 + i * 0.6,
                    PERSON_MOVE_SPEED / 2,
                    -(SHAFT_WIDTH / 2 + 3) + Math.sin(i) * 1
                );
                people.push(p);
            }
        }

        // Start the animation loop
        animate();
    }

    function animate() {
        requestAnimationFrame(animate);
        update();
        renderer.render(scene, camera);
    }

    // --- DOMContentLoaded trigger ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }
})();
