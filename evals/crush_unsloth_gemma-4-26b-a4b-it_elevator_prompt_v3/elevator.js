/**
 * elevator.js
 * Main simulation logic for the 3D Elevator Simulation.
 */

// H6. CONSTANTS ARE TOP-LEVEL const DECLARATIONS
const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

// H5. NAMING CONTRACT - top-level Three.js objects
let scene, camera, renderer, controls;
let elevatorCar; // The THREE.Group representing the elevator
let people = []; // Array of person objects

// Simulation State
let simulationSpeed = 1;
let currentTask = null; // { person, pickupFloor, destFloor }
let elevatorState = 'IDLE'; // IDLE, MOVING_TO_PICKUP, DOORS_OPENING, DOORS_OPEN, PERSON_BOARDING, DOORS_CLOSING, MOVING_TO_DESTINATION, DOORS_OPENING_DEST, PERSON_EXITING, DOORS_CLOSING_DEST
let doorOpenProgress = 0; // 0 to 1
let doorClosingProgress = 0; // 0 to 1

// Helper for distance checks
const EPSILON = 0.01;

function startSimulation() {
    // Initialize Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // H4D/7. Transparency Setup
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    // Create Building and Elevator
    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    // Initialize People
    initPeople();

    // UI: Speed Slider
    const slider = document.getElementById('speedSlider');
    const speedValDisplay = document.getElementById('speedVal');
    if (slider) {
        slider.addEventListener('input', (e) => {
            simulationSpeed = parseFloat(e.target.value);
            speedValDisplay.innerText = simulationSpeed;
        });
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        const delta = 0.016 * simulationSpeed; // Approx 60fps base
        updateSimulation(delta);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Handle Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function createBuilding() {
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    // Create Floors
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;
        
        // Floor slab with cutout for shaft
        const ringParts = [
            { w: BUILDING_WIDTH, d: (BUILDING_DEPTH - SHAFT_DEPTH) / 2, x: 0, z: (BUILDING_DEPTH + SHAFT_DEPTH) / 4 }, // Front
            { w: BUILDING_WIDTH, d: (BUILDING_DEPTH - SHAFT_DEPTH) / 2, x: 0, z: -(BUILDING_DEPTH + SHAFT_DEPTH) / 4 }, // Back
            { w: (BUILDING_WIDTH - SHAFT_WIDTH) / 2, d: SHAFT_DEPTH, x: -(BUILDING_WIDTH + SHAFT_WIDTH) / 4, z: 0 }, // Left
            { w: (BUILDING_WIDTH - SHAFT_WIDTH) / 2, d: SHAFT_DEPTH, x: (BUILDING_WIDTH + SHAFT_WIDTH) / 4, z: 0 }  // Right
        ];

        ringParts.forEach(part => {
            const partGeo = new THREE.BoxGeometry(part.w, 0.1, part.d);
            const partMesh = new THREE.Mesh(partGeo, floorMaterial);
            partMesh.position.set(part.x, y, part.z);
            partMesh.renderOrder = 0;
            scene.add(partMesh);
        });

        // Walls (only on corners/edges to see inside)
        if (i < FLOOR_COUNT - 1) {
            const wallHeight = FLOOR_HEIGHT;
            const wallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.1);
            const backWall = new THREE.Mesh(wallGeo, wallMaterial);
            backWall.position.set(0, y + wallHeight/2, -BUILDING_DEPTH/2);
            backWall.renderOrder = 0;
            scene.add(backWall);

            const sideWallGeo = new THREE.BoxGeometry(0.1, wallHeight, BUILDING_DEPTH);
            const leftWall = new THREE.Mesh(sideWallGeo, wallMaterial);
            leftWall.position.set(-BUILDING_WIDTH/2, y + wallHeight/2, 0);
            leftWall.renderOrder = 0;
            scene.add(leftWall);

            const rightWall = new THREE.Mesh(sideWallGeo, wallMaterial);
            rightWall.position.set(BUILDING_WIDTH/2, y + wallHeight/2, 0);
            rightWall.renderOrder = 0;
            scene.add(rightWall);
        }
    }

    // Ground and Roof (Solid)
    const solidMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const groundGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const ground = new THREE.Mesh(groundGeo, solidMaterial);
    ground.position.set(0, -0.1, 0);
    scene.add(ground);

    const roofGeo = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const roof = new THREE.Mesh(roofGeo, solidMaterial);
    roof.position.set(0, (FLOOR_COUNT - 1) * FLOOR_HEIGHT + 0.1, 0);
    scene.add(roof);
}

function createElevatorCar() {
    const group = new THREE.Group();

    // Frame: Semi-transparent yellow
    const frameMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    // Shaft/Frame dimensions
    const frameGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, SHAFT_DEPTH);
    const frameMesh = new THREE.Mesh(frameGeo, frameMaterial);
    frameMesh.position.y = FLOOR_HEIGHT / 2; // Position so bottom is at y=0
    group.add(frameMesh);

    // Back wall (solid)
    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT, 0.1);
    const backWallMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.7 });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, FLOOR_HEIGHT / 2, -SHAFT_DEPTH / 2);
    group.add(backWall);

    // Doors: Sliding on X-axis
    const doorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    // Each door is half the width of the shaft
    const doorWidth = SHAFT_WIDTH / 2;
    const doorHeight = FLOOR_HEIGHT * 0.8;
    const doorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, 0.1);

    const leftDoor = new THREE.Mesh(doorGeo, doorMaterial);
    leftDoor.position.set(-doorWidth / 2, doorHeight / 2, SHAFT_DEPTH / 2);
    group.add(leftDoor);
    group.leftDoor = leftDoor; // H5 requirement

    const rightDoor = new THREE.Mesh(doorGeo, doorMaterial);
    rightDoor.position.set(doorWidth / 2, doorHeight / 2, SHAFT_DEPTH / 2);
    group.add(rightDoor);
    group.rightDoor = rightDoor; // H5 requirement

    return group;
}

function initPeople() {
    // One person on each floor except one empty floor
    const occupiedFloors = [0, 1, 2, 3, 4]; // Floor 5 is empty initially
    
    occupiedFloors.forEach((floorIdx) => {
        const personMesh = createPerson();
        const floorY = floorIdx * FLOOR_HEIGHT;
        personMesh.position.set(0, floorY, (BUILDING_DEPTH / 2) + 1); // In front of elevator shaft
        personMesh.rotation.y = Math.PI; // Face the building/elevator
        scene.add(personMesh);
        people.push({
            mesh: personMesh,
            currentFloor: floorIdx,
            state: 'WAITING' // WAITING, MOVING_TO_PICKUP, BOARDING, IN_ELEVATOR, EXITING_ELEVATOR, WALKING_AWAY
        });
    });
}

function updateSimulation(delta) {
    // 1. Update People Animations (Legs)
    people.forEach(p => {
        if (p.mesh.userData.isWalking) {
            const time = performance.now() * 0.01 * simulationSpeed;
            const swing = Math.sin(time) * 0.5;
            p.mesh.userData.leftLeg.rotation.x = swing;
            p.mesh.userData.rightLeg.rotation.x = -swing;
        } else {
            p.mesh.userData.leftLeg.rotation.x = 0;
            p.mesh.userData.rightLeg.rotation.x = 0;
        }
    });

    // 2. Elevator State Machine
    if (currentTask) {
        handleElevatorLogic(delta);
    } else {
        // Check if anyone needs a ride
        const personToMove = people.find(p => p.state === 'WAITING');
        if (personToMove) {
            const destFloor = Math.floor(Math.random() * FLOOR_COUNT);
            if (destFloor !== personToMove.currentFloor) {
                // Check if destination floor is "empty"
                const occupied = people.map(p => p.currentFloor);
                let emptyFloor = -1;
                for (let i = 0; i < FLOOR_COUNT; i++) {
                    if (!occupied.includes(i)) {
                        emptyFloor = i;
                        break;
                    }
                }

                if (emptyFloor !== -1 && emptyFloor !== personToMove.currentFloor) {
                    currentTask = {
                        person: personToMove,
                        pickupFloor: personToMove.currentFloor,
                        destFloor: emptyFloor
                    };
                    personToMove.state = 'MOVING_TO_PICKUP';
                    elevatorState = 'MOVING_TO_PICKUP';
                }
            }
        }
    }
}

function handleElevatorLogic(delta) {
    const person = currentTask.person;
    const pickupFloor = currentTask.pickupFloor;
    const destFloor = currentTask.destFloor;

    switch (elevatorState) {
        case 'MOVING_TO_PICKUP':
            // Move elevator to pickup floor
            const targetY = pickupFloor * FLOOR_HEIGHT;
            if (Math.abs(elevatorCar.position.y - targetY) < EPSILON) {
                elevatorCar.position.y = targetY;
                elevatorState = 'DOORS_OPENING';
            } else {
                const dir = elevatorCar.position.y < targetY ? 1 : -1;
                elevatorCar.position.y += dir * ELEVATOR_SPEED * delta;
            }
            break;

        case 'DOORS_OPENING':
            doorOpenProgress += delta * 2;
            if (doorOpenProgress >= 1) {
                doorOpenProgress = 1;
                elevatorState = 'DOORS_OPEN';
            }
            updateDoors();
            break;

        case 'DOORS_OPEN':
            // Person walks to elevator
            const personTargetZ = SHAFT_DEPTH / 2 + 0.5; // Just inside the door
            const currentZ = person.mesh.position.z;
            
            if (Math.abs(currentZ - personTargetZ) < EPSILON) {
                person.state = 'BOARDING';
                elevatorState = 'PERSON_BOARDING';
            } else {
                person.mesh.userData.isWalking = true;
                const dir = currentZ > personTargetZ ? -1 : 1;
                person.mesh.position.z += dir * PERSON_MOVE_SPEED * delta;
            }
            break;

        case 'PERSON_BOARDING':
            // Person enters elevator (reparenting)
            person.mesh.userData.isWalking = false;
            // H8: Use .attach() to preserve world position
            elevatorCar.attach(person.mesh);
            // Position person inside the car
            person.mesh.position.set(0, 0, 0); // Local center of elevatorCar
            // Wait a bit then close doors
            setTimeout(() => {
                if (elevatorState === 'PERSON_BOARDING') {
                    elevatorState = 'DOORS_CLOSING';
                }
            }, 500);
            break;

        case 'DOORS_CLOSING':
            doorClosingProgress += delta * 2;
            if (doorClosingProgress >= 1) {
                doorClosingProgress = 1;
                updateDoors();
                elevatorState = 'MOVING_TO_DESTINATION';
            }
            updateDoors();
            break;

        case 'MOVING_TO_DESTINATION':
            const destY = destFloor * FLOOR_HEIGHT;
            if (Math.abs(elevatorCar.position.y - destY) < EPSILON) {
                elevatorCar.position.y = destY;
                elevatorState = 'DOORS_OPENING_DEST';
            } else {
                const dir = elevatorCar.position.y < destY ? 1 : -1;
                elevatorCar.position.y += dir * ELEVATOR_SPEED * delta;
            }
            break;

        case 'DOORS_OPENING_DEST':
            doorOpenProgress += delta * 2;
            if (doorOpenProgress >= 1) {
                doorOpenProgress = 1;
                elevatorState = 'PERSON_EXITING'; 
            }
            updateDoors();
            break;

        case 'PERSON_EXITING':
            // Person walks out of elevator
            person.mesh.userData.isWalking = true;
            const exitTargetZ = (BUILDING_DEPTH / 2) + 1; // Back to waiting spot
            const currentExitZ = person.mesh.position.z;

            if (Math.abs(currentExitZ - exitTargetZ) < EPSILON) {
                person.mesh.userData.isWalking = false;
                // H8: Reparent back to scene
                scene.attach(person.mesh);
                person.mesh.position.set(0, destFloor * FLOOR_HEIGHT, exitTargetZ);
                person.currentFloor = destFloor;
                person.state = 'WAITING';
                elevatorState = 'DOORS_CLOSING_DEST';
            } else {
                const dir = currentExitZ < exitTargetZ ? 1 : -1;
                person.mesh.position.z += dir * PERSON_MOVE_SPEED * delta;
            }
            break;

        case 'DOORS_CLOSING_DEST':
            doorClosingProgress += delta * 2;
            if (doorClosingProgress >= 1) {
                doorClosingProgress = 1;
                updateDoors();
                // Task complete!
                currentTask = null;
                elevatorState = 'IDLE';
                doorOpenProgress = 0;
                doorClosingProgress = 0;
            }
            updateDoors();
            break;
    }
}

function updateDoors() {
    let progress = 0;
    if (elevatorState === 'DOORS_OPENING' || elevatorState === 'DOORS_OPEN' || elevatorState === 'DOORS_OPENING_DEST') {
        progress = doorOpenProgress;
    } else if (elevatorState === 'DOORS_CLOSING' || elevatorState === 'DOORS_CLOSING_DEST') {
        progress = 1 - doorClosingProgress; 
    } else {
        progress = 0;
    }

    const offset = (SHAFT_WIDTH / 2 + 0.5) * progress;
    elevatorCar.leftDoor.position.x = - (SHAFT_WIDTH / 4) - offset;
    elevatorCar.rightDoor.position.x = (SHAFT_WIDTH / 4) + offset;
}

// H3. AUTO-START ON PAGE LOAD
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
