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

// State tracking
let emptyFloor = 0;
let currentTrip = null;
let doorAnimating = false;
let speedMultiplier = 1.0;
let animationTime = 0;

function startSimulation() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 30);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.target.set(0, FLOOR_HEIGHT / 2, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x444466, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffaa00, 1.5, 30);
    pointLight.position.set(0, FLOOR_HEIGHT / 2, 0);
    scene.add(pointLight);

    // Create building and elevator
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    // Create people on floors
    createPeopleOnFloors();

    // Speed slider UI
    const speedSliderContainer = document.createElement('div');
    speedSliderContainer.id = 'speedSlider';
    speedSliderContainer.style.display = 'flex';
    speedSliderContainer.style.position = 'fixed';
    speedSliderContainer.style.top = '15px';
    speedSliderContainer.style.right = '15px';
    speedSliderContainer.style.flexDirection = 'column';
    speedSliderContainer.style.gap = '6px';
    speedSliderContainer.style.color = '#ccc';
    speedSliderContainer.style.fontFamily = 'monospace';
    speedSliderContainer.style.fontSize = '12px';

    const speedLabel = document.createElement('span');
    speedLabel.textContent = 'Speed: 1x';
    speedSliderContainer.appendChild(speedLabel);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0.5;
    slider.max = 20;
    slider.value = 1;
    slider.step = 0.1;
    slider.style.width = '140px';
    speedSliderContainer.appendChild(slider);

    slider.addEventListener('input', function() {
        speedMultiplier = parseFloat(this.value);
        document.getElementById('speedLabel').textContent = 'Speed: ' + this.value.toFixed(1) + 'x';
    });

    // Start the first trip
    startTrip();

    // Animation loop
    animate();
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Ground floor (solid)
    const groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -0.25, 0);
    buildingGroup.add(ground);

    // Roof (solid)
    const roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, FLOOR_HEIGHT + 0.25, 0);
    buildingGroup.add(roof);

    // Walls - back wall (solid)
    const backWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH / 2);
    const backWallMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT / 2, -BUILDING_DEPTH / 2);
    buildingGroup.add(backWall);

    // Walls - left wall (solid)
    const leftWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH);
    const leftWallMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const leftWall = new THREE.Mesh(leftWallGeo, leftWallMat);
    leftWall.position.set(-BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(leftWall);

    // Walls - right wall (solid)
    const rightWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT, BUILDING_DEPTH);
    const rightWallMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const rightWall = new THREE.Mesh(rightWallGeo, rightWallMat);
    rightWall.position.set(BUILDING_WIDTH / 2, FLOOR_HEIGHT * FLOOR_COUNT / 2, 0);
    buildingGroup.add(rightWall);

    // Floor surfaces (transparent)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH - 4, 0.2, BUILDING_DEPTH - SHAFT_DEPTH - 4);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, i * FLOOR_HEIGHT + 0.1, 0);
        buildingGroup.add(floor);
    }

    // Floor surfaces (transparent) - back side
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH - 4, 0.2, BUILDING_DEPTH / 2);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(0, i * FLOOR_HEIGHT + 0.1, -BUILDING_DEPTH / 2);
        buildingGroup.add(floor);
    }

    // Floor surfaces (transparent) - left side
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH / 2, 0.2, BUILDING_DEPTH - SHAFT_DEPTH - 4);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(-BUILDING_WIDTH / 2, i * FLOOR_HEIGHT + 0.1, 0);
        buildingGroup.add(floor);
    }

    // Floor surfaces (transparent) - right side
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeo = new THREE.BoxGeometry(BUILDING_WIDTH / 2, 0.2, BUILDING_DEPTH - SHAFT_DEPTH - 4);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.set(BUILDING_WIDTH / 2, i * FLOOR_HEIGHT + 0.1, 0);
        buildingGroup.add(floor);
    }

    // Semi-transparent blue walls (front side)
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const wallGeo = new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH - 4, FLOOR_HEIGHT, BUILDING_DEPTH / 2);
        const wallMat = new THREE.MeshBasicMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2 });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 4);
        buildingGroup.add(wall);
    }

    scene.add(buildingGroup);
}

function createElevatorCar() {
    const car = new THREE.Group();

    // Elevator frame (yellow)
    const frameGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 2, SHAFT_DEPTH);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, FLOOR_HEIGHT / 2, 0);
    car.add(frame);

    // Back wall (solid)
    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH - 1, FLOOR_HEIGHT * 2, SHAFT_DEPTH / 2);
    const backWallMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, FLOOR_HEIGHT * 2 / 2, -SHAFT_DEPTH / 2 + 0.5);
    car.add(backWall);

    // Side walls (transparent)
    for (let side of [-1, 1]) {
        const wallGeo = new THREE.BoxGeometry(1, FLOOR_HEIGHT * 2, SHAFT_DEPTH - 1);
        const wallMat = new THREE.MeshBasicMaterial({ color: 0x9999ff, transparent: true, opacity: 0.3 });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(side * (SHAFT_WIDTH / 2 - 0.5), FLOOR_HEIGHT * 2 / 2, 0);
        car.add(wall);
    }

    // Left door (dark yellow)
    const leftDoorGeo = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 1, FLOOR_HEIGHT * 2, SHAFT_DEPTH / 2 + 0.5);
    const leftDoorMat = new THREE.MeshBasicMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });
    const leftDoor = new THREE.Mesh(leftDoorGeo, leftDoorMat);
    car.add(leftDoor);

    // Right door (dark yellow)
    const rightDoorGeo = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 1, FLOOR_HEIGHT * 2, SHAFT_DEPTH / 2 + 0.5);
    const rightDoorMat = new THREE.MeshBasicMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });
    const rightDoor = new THREE.Mesh(rightDoorGeo, rightDoorMat);
    car.add(rightDoor);

    // Assign elevatorCar reference BEFORE using it for door properties
    elevatorCar = car;

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH / 4 + 0.5, FLOOR_HEIGHT * 2 / 2, -SHAFT_DEPTH / 4);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH / 4 - 0.5, FLOOR_HEIGHT * 2 / 2, -SHAFT_DEPTH / 4);

    return car;
}

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
}

function createPeopleOnFloors() {
    const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xf7dc6f];
    for (let i = 0; i < FLOOR_COUNT - 1; i++) {
        const person = createPerson(colors[i % colors.length]);
        const floorYVal = floorY(i);
        person.position.set(0, floorYVal + 0.3, SHAFT_DEPTH / 2 + 2);
        person.rotation.y = Math.PI / 2; // Face the elevator doors (positive Z)
        scene.add(person);
        people.push({
            mesh: person,
            currentFloor: i,
            inElevator: false,
            waitingZ: SHAFT_DEPTH / 2 + 2
        });
    }
}

function animateElevatorToFloor(targetFloor, done) {
    const targetY = floorY(targetFloor);
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = (distance / ELEVATOR_SPEED) * 1000;

    let startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out for smoother stopping
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        elevatorCar.position.y = startY + (targetY - startY) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.position.y = targetY;
            done();
        }
    }

    requestAnimationFrame(update);
}

function animateDoors(open, done) {
    const doorWidth = SHAFT_WIDTH / 2 - 1;
    const currentOpen = !doorAnimating ? (elevatorCar.leftDoor.position.x === -SHAFT_WIDTH / 4 + 0.5) : true;

    if (!open && currentOpen) return; // Already closed, do nothing

    doorAnimating = true;
    const targetX = open ? SHAFT_WIDTH / 2 : -SHAFT_WIDTH / 2;
    const startX = elevatorCar.leftDoor.position.x;
    const duration = 500;

    let startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease in-out
        const easedProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        elevatorCar.leftDoor.position.x = startX + (targetX - startX) * easedProgress;
        elevatorCar.rightDoor.position.x = startX + (targetX - startX) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.leftDoor.position.x = targetX;
            elevatorCar.rightDoor.position.x = targetX;
            doorAnimating = false;
            done();
        }
    }

    requestAnimationFrame(update);
}

function walkPersonToZ(personObj, targetZ, done) {
    const personMesh = personObj.mesh;
    const startX = personMesh.position.z;
    const distance = Math.abs(targetZ - startX);
    const duration = (distance / PERSON_MOVE_SPEED) * 1000;

    let startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        personMesh.position.z = startX + (targetZ - startX) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            personMesh.position.z = targetZ;
            done();
        }
    }

    requestAnimationFrame(update);
}

function delay(ms, done) {
    setTimeout(done, ms);
}

function animateWalkingLegs(time) {
    for (const personObj of people) {
        if (!personObj.inElevator && !personObj.mesh.userData.isWalking) continue;
        const leg = personObj.mesh.userData.leftLeg;
        const rightLeg = personObj.mesh.userData.rightLeg;

        // Only animate legs when walking
        if (personObj.mesh.userData.isWalking) {
            const walkSpeed = 10 * speedMultiplier;
            const leftPhase = Math.sin(time * walkSpeed);
            const rightPhase = -Math.sin(time * walkSpeed + Math.PI / 2);

            leg.rotation.x = leftPhase * 0.5;
            rightLeg.rotation.x = rightPhase * 0.5;
        } else {
            // Reset legs when not walking
            leg.rotation.x = 0;
            rightLeg.rotation.x = 0;
        }
    }
}

function startTrip() {
    if (currentTrip) return; // Already running a trip

    // Find a person on a non-empty floor
    let passenger = null;
    for (const personObj of people) {
        if (!personObj.inElevator && personObj.currentFloor !== emptyFloor) {
            passenger = personObj;
            break;
        }
    }

    if (!passenger) return; // No one to move

    currentTrip = {
        passenger: passenger,
        destinationFloor: emptyFloor,
        phase: 0
    };

    const destY = floorY(emptyFloor);
    const startY = floorY(passenger.currentFloor);

    // Phase 1: Move elevator to passenger's floor
    animateElevatorToFloor(passenger.currentFloor, function() {
        currentTrip.phase = 1;

        // Phase 2: Open doors
        animateDoors(true, function() {
            currentTrip.phase = 2;

            // Phase 3: Walk person into elevator
            walkPersonToZ(currentTrip.passenger.mesh, -SHAFT_DEPTH / 4, function() {
                currentTrip.phase = 3;

                // Phase 4: Attach person to elevator car
                elevatorCar.attach(currentTrip.passenger.mesh);
                currentTrip.passenger.inElevator = true;

                // Phase 5: Close doors
                animateDoors(false, function() {
                    currentTrip.phase = 4;

                    // Phase 6: Move elevator to destination
                    animateElevatorToFloor(emptyFloor, function() {
                        currentTrip.phase = 5;

                        // Phase 7: Open doors
                        animateDoors(true, function() {
                            currentTrip.phase = 6;

                            // Phase 8: Detach person from elevator car
                            scene.attach(currentTrip.passenger.mesh);
                            currentTrip.passenger.inElevator = false;

                            // Phase 9: Walk person out to waiting spot
                            walkPersonToZ(currentTrip.passenger.mesh, SHAFT_DEPTH / 2 + 2, function() {
                                currentTrip.phase = 7;

                                // Phase 10: Close doors
                                animateDoors(false, function() {
                                    currentTrip.phase = 8;

                                    // Phase 11: Update state
                                    emptyFloor = passenger.currentFloor;
                                    passenger.currentFloor = emptyFloor;

                                    // Reset waiting Z for this person
                                    passenger.waitingZ = SHAFT_DEPTH / 2 + 2;

                                    // Start next trip after delay
                                    delay(300, function() {
                                        currentTrip = null;
                                        startTrip();
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

function animate() {
    animationTime += 1 / 60 * speedMultiplier;

    // Update elevator position based on current floor
    const targetFloor = emptyFloor === -1 ? 0 : emptyFloor;
    const targetY = floorY(targetFloor);
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);

    if (distance > 0.01) {
        const duration = (distance / ELEVATOR_SPEED) * 1000;
        let startTime = performance.now();

        function update(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            elevatorCar.position.y = startY + (targetY - startY) * progress;
            if (progress < 1) requestAnimationFrame(update);
        }

        requestAnimationFrame(update);
    }

    // Update walking legs animation
    animateWalkingLegs(animationTime);

    // Rotate people to face elevator doors
    for (const personObj of people) {
        if (!personObj.inElevator) {
            personObj.mesh.rotation.y = Math.PI / 2;
        }
    }

    controls.update();
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Auto-start simulation with DOMContentLoaded pattern
document.addEventListener('DOMContentLoaded', function() {
    startSimulation();
});