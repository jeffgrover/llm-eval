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
let emptyFloor = 3;

function startSimulation() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 25);

    // Create renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Create building and elevator
    createBuilding();
    createElevatorCar();

    // Create people on five different floors, leaving one empty
    const floorNumbers = [1, 2, 4, 5, 6];
    for (let i = 0; i < floorNumbers.length; i++) {
        const person = createPerson(Math.random() * 0xffffff);
        person.position.set(0, floorY(floorNumbers[i]), 3);
        person.lookAt(0, person.position.y, 0);
        person.userData.currentFloor = floorNumbers[i];
        scene.add(person);
        people.push(person);
    }

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Animation loop
    animate();

    // Start first trip after a short delay
    setTimeout(startTripSequence, 1000);
}

function floorY(floorNumber) {
    return (floorNumber - 1) * FLOOR_HEIGHT;
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Floor surfaces
    for (let floorNum = 1; floorNum <= FLOOR_COUNT; floorNum++) {
        const floorYPos = floorY(floorNum);
        const floorGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = floorYPos;
        buildingGroup.add(floorMesh);
    }

    // Walls (semi-transparent blue)
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.2
    });

    // Back wall
    const backWallGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, (FLOOR_COUNT * FLOOR_HEIGHT) / 2 - FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    // Left wall
    const leftWallGeometry = new THREE.PlaneGeometry(BUILDING_DEPTH, FLOOR_COUNT * FLOOR_HEIGHT);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2 - FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + SHAFT_WIDTH / 2);
    buildingGroup.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(BUILDING_WIDTH / 2, (FLOOR_COUNT * FLOOR_HEIGHT) / 2 - FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + SHAFT_WIDTH / 2);
    buildingGroup.add(rightWall);

    // Roof (solid)
    const roofGeometry = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    buildingGroup.add(roof);

    scene.add(buildingGroup);
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();

    // Car frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_COUNT * FLOOR_HEIGHT, SHAFT_DEPTH);
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.y = (FLOOR_COUNT * FLOOR_HEIGHT) / 2 - FLOOR_HEIGHT / 2;
    elevatorCar.add(frame);

    // Back wall (solid)
    const backWallGeometry = new THREE.PlaneGeometry(SHAFT_DEPTH, FLOOR_HEIGHT);
    const backWallMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00, opacity: 0.8 });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.rotation.y = Math.PI / 2;
    backWall.position.set(0, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    // Side walls (transparent)
    const sideWallMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3
    });

    const leftWallGeometry = new THREE.PlaneGeometry(SHAFT_DEPTH, FLOOR_HEIGHT);
    const leftWall = new THREE.Mesh(leftWallGeometry, sideWallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    elevatorCar.add(leftWall);

    const rightWall = new THREE.Mesh(leftWallGeometry, sideWallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(SHAFT_WIDTH / 2, FLOOR_HEIGHT / 2, 0);
    elevatorCar.add(rightWall);

    // Doors (dark yellow, sliding)
    const doorMaterial = new THREE.MeshPhongMaterial({
        color: 0xcccc00,
        transparent: true,
        opacity: 0.7
    });

    const doorGeometry = new THREE.PlaneGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_HEIGHT);

    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(leftDoor);

    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(SHAFT_WIDTH / 4, FLOOR_HEIGHT / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(rightDoor);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    // Start elevator at bottom floor
    elevatorCar.position.y = floorY(1) + FLOOR_HEIGHT / 2;
    scene.add(elevatorCar);
}

function animateElevatorToFloor(targetFloor, done) {
    const targetY = floorY(targetFloor) + FLOOR_HEIGHT / 2;
    const startY = elevatorCar.position.y;
    const distance = targetY - startY;
    const duration = Math.abs(distance) / ELEVATOR_SPEED * 1000;

    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        elevatorCar.position.y = startY + distance * progress;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            elevatorCar.position.y = targetY;
            if (done) done();
        }
    }

    animate();
}

function animateDoors(open, done) {
    const leftDoor = elevatorCar.leftDoor;
    const rightDoor = elevatorCar.rightDoor;

    if (open) {
        // Open doors: slide away from center
        const startTime = Date.now();
        const duration = 500;

        function openAnimation() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            leftDoor.position.x = -SHAFT_WIDTH / 4 * (1 - progress);
            rightDoor.position.x = SHAFT_WIDTH / 4 * (1 - progress);

            if (progress < 1) {
                requestAnimationFrame(openAnimation);
            } else {
                if (done) done();
            }
        }

        openAnimation();
    } else {
        // Close doors: meet in center
        const startTime = Date.now();
        const duration = 500;

        function closeAnimation() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            leftDoor.position.x = -SHAFT_WIDTH / 4 * (1 - progress);
            rightDoor.position.x = SHAFT_WIDTH / 4 * (1 - progress);

            if (progress < 1) {
                requestAnimationFrame(closeAnimation);
            } else {
                leftDoor.position.x = 0;
                rightDoor.position.x = 0;
                if (done) done();
            }
        }

        closeAnimation();
    }
}

function walkPersonToZ(person, targetZ, done) {
    const startZ = person.position.z;
    const distance = targetZ - startZ;
    const duration = Math.abs(distance) / PERSON_MOVE_SPEED * 1000;

    const startTime = Date.now();

    function walkAnimation() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        person.position.z = startZ + distance * progress;

        // Animate legs while walking
        if (progress < 1) {
            person.userData.isWalking = true;
            const time = elapsed / 200;
            person.userData.leftLeg.rotation.x = Math.sin(time) * 0.5;
            person.userData.rightLeg.rotation.x = Math.sin(time + Math.PI) * 0.5;
            requestAnimationFrame(walkAnimation);
        } else {
            person.userData.isWalking = false;
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
            if (done) done();
        }
    }

    walkAnimation();
}

function delay(ms, done) {
    setTimeout(done, ms);
}

function animateWalkingLegs(time) {
    // This function is available for general use during animation loops
    for (const person of people) {
        if (person.userData.isWalking) {
            const timeFactor = time / 200;
            person.userData.leftLeg.rotation.x = Math.sin(timeFactor) * 0.5;
            person.userData.rightLeg.rotation.x = Math.sin(timeFactor + Math.PI) * 0.5;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function startTripSequence() {
    // Pick a person not in elevator and not on empty floor
    const availablePeople = people.filter(p => !p.userData.inElevator && p.userData.currentFloor !== emptyFloor);
    if (availablePeople.length === 0) return;

    const passenger = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    const currentFloor = passenger.userData.currentFloor;
    const destinationFloor = emptyFloor;

    console.log(`Starting trip: ${passenger} from floor ${currentFloor} to floor ${destinationFloor}`);

    // Step 1-2: Move elevator to passenger's current floor
    animateElevatorToFloor(currentFloor, () => {
        // Step 3: Open doors
        animateDoors(true, () => {
            // Step 4: Delay after doors open
            delay(300, () => {
                // Step 5: Walk person into elevator
                walkPersonToZ(passenger, 0, () => {
                    // Step 6: Attach to elevator
                    elevatorCar.attach(passenger);

                    // Step 7: Update state
                    passenger.userData.inElevator = true;

                    // Step 8: Close doors
                    animateDoors(false, () => {
                        // Step 9: Move to destination floor
                        animateElevatorToFloor(destinationFloor, () => {
                            // Step 10: Open doors
                            animateDoors(true, () => {
                                // Step 11: Delay after doors open
                                delay(300, () => {
                                    // Step 12: Walk person out
                                    walkPersonToZ(passenger, 3, () => {
                                        // Step 13: Detach from elevator
                                        scene.attach(passenger);

                                        // Step 14: Update state
                                        passenger.userData.inElevator = false;

                                        // Step 15: Close doors
                                        animateDoors(false, () => {
                                            // Step 16: Update floor tracking
                                            emptyFloor = currentFloor;
                                            passenger.userData.currentFloor = destinationFloor;

                                            console.log(`Trip complete. Empty floor now: ${emptyFloor}`);

                                            // Schedule next trip after a delay
                                            setTimeout(startTripSequence, 2000);
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

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
