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
let emptyFloor;
let speedMultiplier = 1;
let animationActive = false;
let doorAnimationActive = false;

function startSimulation() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 15, 25);
    camera.lookAt(0, 5, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Create building and elevator
    createBuilding();
    createElevatorCar();

    // Create people (5 people on 6 floors, leaving one empty)
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const floorNumbers = [0, 1, 2, 3, 4, 5];
    emptyFloor = 5; // Start with top floor empty

    for (let i = 0; i < 5; i++) {
        const person = createPerson(colors[i]);
        const floorNum = floorNumbers[i];
        person.position.set(0, floorY(floorNum), 4);
        person.lookAt(0, floorY(floorNum), 0);
        person.userData.currentFloor = floorNum;
        person.userData.inElevator = false;
        scene.add(person);
        people.push(person);
    }

    // Speed slider
    const speedSlider = document.getElementById('speedSlider');
    speedSlider.addEventListener('input', function(e) {
        speedMultiplier = parseInt(e.target.value, 10);
    });

    // Animation loop
    animate();
}

function floorY(floorNumber) {
    return floorNumber * FLOOR_HEIGHT;
}

function createBuilding() {
    const buildingGroup = new THREE.Group();

    // Ground floor (solid)
    const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = floorY(0) + FLOOR_HEIGHT / 2;
    ground.receiveShadow = true;
    buildingGroup.add(ground);

    // Upper floors (transparent with gray surfaces)
    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
        const floorMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            transparent: true, 
            opacity: 0.3 
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.y = floorY(i) + 0.1;
        floor.receiveShadow = true;
        buildingGroup.add(floor);

        // Walls for each floor (except ground)
        const wallMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x9999ff, 
            transparent: true, 
            opacity: 0.2 
        });

        // Front wall
        const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5);
        const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
        frontWall.position.set(0, floorY(i) + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
        buildingGroup.add(frontWall);

        // Back wall
        const backWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
        backWall.position.set(0, floorY(i) + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
        buildingGroup.add(backWall);

        // Left wall
        const leftWallGeometry = new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH);
        const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        leftWall.position.set(-BUILDING_WIDTH / 2, floorY(i) + FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        rightWall.position.set(BUILDING_WIDTH / 2, floorY(i) + FLOOR_HEIGHT / 2, 0);
        buildingGroup.add(rightWall);
    }

    // Roof (solid)
    const roofGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.3, BUILDING_DEPTH);
    const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = floorY(FLOOR_COUNT - 1) + FLOOR_HEIGHT;
    roof.receiveShadow = true;
    buildingGroup.add(roof);

    // Elevator shaft (open in center)
    const shaftDepth = SHAFT_DEPTH;
    const shaftWidth = SHAFT_WIDTH;
    
    for (let i = 0; i < FLOOR_COUNT; i++) {
        // Shaft walls on sides
        if (i === 0) {
            // Ground floor - solid back wall
            const backWallGeometry = new THREE.BoxGeometry(shaftWidth, FLOOR_HEIGHT, shaftDepth);
            const backWallMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
            const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
            backWall.position.set(0, floorY(i) + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + shaftDepth / 2);
            buildingGroup.add(backWall);
        } else {
            // Upper floors - transparent back wall
            const backWallGeometry = new THREE.BoxGeometry(shaftWidth, FLOOR_HEIGHT, shaftDepth);
            const backWallMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x9999ff, 
                transparent: true, 
                opacity: 0.2 
            });
            const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
            backWall.position.set(0, floorY(i) + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + shaftDepth / 2);
            buildingGroup.add(backWall);

            // Side walls for shaft
            const sideWallGeometry = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, shaftDepth);
            const sideWallMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x9999ff, 
                transparent: true, 
                opacity: 0.2 
            });

            const leftSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
            leftSideWall.position.set(-shaftWidth / 2, floorY(i) + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + shaftDepth / 2);
            buildingGroup.add(leftSideWall);

            const rightSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
            rightSideWall.position.set(shaftWidth / 2, floorY(i) + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2 + shaftDepth / 2);
            buildingGroup.add(rightSideWall);
        }
    }

    scene.add(buildingGroup);
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();

    // Frame (semi-transparent yellow)
    const frameGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, FLOOR_HEIGHT - 0.4, SHAFT_DEPTH - 0.4);
    const frameMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5 
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    elevatorCar.add(frame);

    // Back wall (solid)
    const backWallGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, FLOOR_HEIGHT - 0.4, 0.2);
    const backWallMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.set(0, 0, -SHAFT_DEPTH / 2 + 0.1);
    elevatorCar.add(backWall);

    // Side walls (transparent)
    const sideWallGeometry = new THREE.BoxGeometry(0.2, FLOOR_HEIGHT - 0.4, SHAFT_DEPTH - 0.4);
    const sideWallMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.3 
    });

    const leftSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    leftSideWall.position.set(-(SHAFT_WIDTH - 0.4) / 2, 0, 0);
    elevatorCar.add(leftSideWall);

    const rightSideWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
    rightSideWall.position.set((SHAFT_WIDTH - 0.4) / 2, 0, 0);
    elevatorCar.add(rightSideWall);

    // Floor of elevator car
    const carFloorGeometry = new THREE.BoxGeometry(SHAFT_WIDTH - 0.4, 0.1, SHAFT_DEPTH - 0.4);
    const carFloorMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const carFloor = new THREE.Mesh(carFloorGeometry, carFloorMaterial);
    carFloor.position.set(0, -0.2, 0);
    elevatorCar.add(carFloor);

    // Doors (dark yellow, sliding)
    const doorHeight = FLOOR_HEIGHT - 0.4;
    const doorWidth = (SHAFT_WIDTH - 0.4) / 2 - 0.1;
    const doorDepth = 0.1;
    const doorMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc00, 
        transparent: true, 
        opacity: 0.7 
    });

    const leftDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
    const rightDoorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);

    const leftDoor = new THREE.Mesh(leftDoorGeometry, doorMaterial);
    const rightDoor = new THREE.Mesh(rightDoorGeometry, doorMaterial);

    // Initial position (closed in center)
    leftDoor.position.set(-(doorWidth + 0.1) / 2, 0, SHAFT_DEPTH / 2 - 0.1);
    rightDoor.position.set((doorWidth + 0.1) / 2, 0, SHAFT_DEPTH / 2 - 0.1);

    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;

    elevatorCar.add(leftDoor);
    elevatorCar.add(rightDoor);

    // Position elevator at ground floor
    elevatorCar.position.y = floorY(0);
    scene.add(elevatorCar);
}

function animateElevatorToFloor(targetFloor, done) {
    if (animationActive) {
        setTimeout(() => {
            animateElevatorToFloor(targetFloor, done);
        }, 100);
        return;
    }

    animationActive = true;
    const targetY = floorY(targetFloor);
    const startY = elevatorCar.position.y;
    const distance = Math.abs(targetY - startY);
    const duration = (distance / ELEVATOR_SPEED) * 1000 / speedMultiplier;
    
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        elevatorCar.position.y = startY + (targetY - startY) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            elevatorCar.position.y = targetY;
            animationActive = false;
            if (done) done();
        }
    }

    requestAnimationFrame(update);
}

function animateDoors(open, done) {
    if (doorAnimationActive) {
        setTimeout(() => {
            animateDoors(open, done);
        }, 100);
        return;
    }

    doorAnimationActive = true;
    const leftDoor = elevatorCar.leftDoor;
    const rightDoor = elevatorCar.rightDoor;
    
    // Define target positions based on open/closed state
    let targetLeftX, targetRightX;
    if (open) {
        // Open: doors slide to sides
        targetLeftX = -(SHAFT_WIDTH - 0.4) / 2 + 0.1;
        targetRightX = (SHAFT_WIDTH - 0.4) / 2 - 0.1;
    } else {
        // Closed: doors meet in center
        targetLeftX = -0.1;
        targetRightX = 0.1;
    }

    const startLeftX = leftDoor.position.x;
    const startRightX = rightDoor.position.x;
    
    const duration = 1000 / speedMultiplier;
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease in-out
        const easedProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        leftDoor.position.x = startLeftX + (targetLeftX - startLeftX) * easedProgress;
        rightDoor.position.x = startRightX + (targetRightX - startRightX) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            doorAnimationActive = false;
            // Snap to final position
            leftDoor.position.x = targetLeftX;
            rightDoor.position.x = targetRightX;
            if (done) done();
        }
    }

    requestAnimationFrame(update);
}

function walkPersonToZ(person, targetZ, done) {
    if (animationActive) {
        setTimeout(() => {
            walkPersonToZ(person, targetZ, done);
        }, 100);
        return;
    }

    animationActive = true;
    person.userData.isWalking = true;
    const startZ = person.position.z;
    const distance = Math.abs(targetZ - startZ);
    const duration = (distance / PERSON_MOVE_SPEED) * 1000 / speedMultiplier;
    
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        person.position.z = startZ + (targetZ - startZ) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            person.position.z = targetZ;
            person.userData.isWalking = false;
            animationActive = false;
            if (done) done();
        }
    }

    requestAnimationFrame(update);
}

function delay(ms, done) {
    setTimeout(() => {
        if (done) done();
    }, ms / speedMultiplier);
}

function animateWalkingLegs(time) {
    people.forEach(person => {
        if (person.userData.isWalking) {
            const legAngle = Math.sin(time * 10) * 0.5;
            person.userData.leftLeg.rotation.x = legAngle;
            person.userData.rightLeg.rotation.x = -legAngle;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    });
}

function selectRandomPerson() {
    const availablePeople = people.filter(p => p.userData.currentFloor !== emptyFloor);
    if (availablePeople.length === 0) return null;
    return availablePeople[Math.floor(Math.random() * availablePeople.length)];
}

function completeTripSequence() {
    // Find a person to move
    const person = selectRandomPerson();
    if (!person) return;

    const sourceFloor = person.userData.currentFloor;
    const destFloor = emptyFloor;

    // Move elevator to source floor
    animateElevatorToFloor(sourceFloor, () => {
        // Open doors
        animateDoors(true, () => {
            delay(300, () => {
                // Walk person into elevator
                walkPersonToZ(person, 0, () => {
                    // Attach to elevator
                    elevatorCar.attach(person);
                    person.userData.inElevator = true;

                    // Close doors
                    animateDoors(false, () => {
                        // Move elevator to destination floor
                        animateElevatorToFloor(destFloor, () => {
                            // Open doors
                            animateDoors(true, () => {
                                delay(300, () => {
                                    // Walk person out
                                    walkPersonToZ(person, 4, () => {
                                        // Detach from elevator
                                        scene.attach(person);
                                        person.userData.inElevator = false;

                                        // Close doors
                                        animateDoors(false, () => {
                                            // Update floor tracking
                                            emptyFloor = sourceFloor;
                                            person.userData.currentFloor = destFloor;

                                            // Schedule next trip
                                            setTimeout(completeTripSequence, 1000);
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

function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;
    animateWalkingLegs(time);

    controls.update();
    renderer.render(scene, camera);
}

// Auto-start
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}

// Start the first trip after initialization
setTimeout(completeTripSequence, 2000);
