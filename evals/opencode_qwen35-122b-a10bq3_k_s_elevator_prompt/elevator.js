// Elevator Simulation - Main controller for 3D elevator system

(function() {
    // ========== CONFIGURATION CONSTANTS ==========
    const FLOOR_HEIGHT = 4;
    const FLOOR_COUNT = 6;
    const BUILDING_WIDTH = 12;
    const BUILDING_DEPTH = 10;
    const SHAFT_WIDTH = 3;
    const SHAFT_DEPTH = 3.5;
    const ELEVATOR_SPEED = 8;
    const PERSON_MOVE_SPEED = 4;

    // ========== GLOBAL VARIABLES ==========
    let scene, camera, renderer, controls;
    let elevatorCar, elevatorDoors = {};
    let people = [];
    let currentFloor = 0;
    let targetFloor = 1;
    let doorState = 'closed'; // 'closed', 'opening', 'open', 'closing'
    let animationSpeed = 1;
    
    // Floor occupancy tracking (one floor always empty)
    const occupiedFloors = new Set([0, 2, 3, 4, 5]); // Floor 1 starts empty
    
    // Animation queue for sequential operations
    let animationQueue = [];
    let isAnimating = false;

    // ========== INITIALIZATION ==========
    function init() {
        // Create scene
        scene = new THREE.Scene();
        
        // Set up camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(25, 25, 25);
        camera.lookAt(0, FLOOR_COUNT * FLOOR_HEIGHT / 2, 0);

        // Set up renderer with transparency support
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true; // Critical for proper depth sorting of transparent objects
        document.body.appendChild(renderer.domElement);

        // Add OrbitControls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        scene.add(directionalLight);

        // Create building and elevator
        createBuilding();
        createElevator();

        // Add initial people to floors
        initializePeople();

        // Set up event listeners
        window.addEventListener('resize', onWindowResize);
        
        // Setup speed slider
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                animationSpeed = parseFloat(e.target.value);
                speedValue.textContent = animationSpeed + 'x';
            });
        }

        // Start animation loop
        animate();

        // Start the elevator simulation cycle
        setTimeout(startElevatorCycle, 1000);
    }

    // ========== BUILDING CREATION ==========
    function createBuilding() {
        const buildingGroup = new THREE.Group();
        buildingGroup.renderOrder = 0;

        // Floor material (transparent gray)
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        // Wall material (semi-transparent blue)
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0x9999ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        // Create each floor
        for (let i = 0; i < FLOOR_COUNT; i++) {
            const y = i * FLOOR_HEIGHT;
            
            // Floor slab (with shaft cutout)
            const floorGeom = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
            const floor = new THREE.Mesh(floorGeom, floorMaterial);
            floor.position.set(0, y + 0.1, 0);
            floor.renderOrder = 0;
            buildingGroup.add(floor);

            // Create shaft cutout by not drawing in the center area
            // We'll draw walls around the perimeter instead
            
            // Walls (4 sides with gap for elevator shaft)
            const wallThickness = 0.2;
            
            // Front wall (with door opening)
            const frontWallLeft = new THREE.Mesh(
                new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2 - 0.5, 0.2, wallThickness),
                wallMaterial
            );
            frontWallLeft.position.set(-BUILDING_WIDTH / 4 + 0.25, y + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
            frontWallLeft.renderOrder = 0;
            buildingGroup.add(frontWallLeft);

            const frontWallRight = new THREE.Mesh(
                new THREE.BoxGeometry(BUILDING_WIDTH / 2 - SHAFT_WIDTH / 2 - 0.5, 0.2, wallThickness),
                wallMaterial
            );
            frontWallRight.position.set(BUILDING_WIDTH / 4 - 0.25, y + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
            frontWallRight.renderOrder = 0;
            buildingGroup.add(frontWallRight);

            // Back wall (solid)
            const backWall = new THREE.Mesh(
                new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, wallThickness),
                wallMaterial
            );
            backWall.position.set(0, y + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
            backWall.renderOrder = 0;
            buildingGroup.add(backWall);

            // Left wall (with gap for shaft)
            const leftWallTop = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, 0.2, BUILDING_DEPTH / 2 - SHAFT_DEPTH / 2 - 0.5),
                wallMaterial
            );
            leftWallTop.position.set(-BUILDING_WIDTH / 2, y + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 4 + 0.25);
            leftWallTop.renderOrder = 0;
            buildingGroup.add(leftWallTop);

            const leftWallBottom = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, 0.2, BUILDING_DEPTH / 2 - SHAFT_WIDTH / 2 - 0.5),
                wallMaterial
            );
            leftWallBottom.position.set(-BUILDING_WIDTH / 2, y + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 4 - 0.25);
            leftWallBottom.renderOrder = 0;
            buildingGroup.add(leftWallBottom);

            // Right wall (with gap for shaft)
            const rightWallTop = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, 0.2, BUILDING_DEPTH / 2 - SHAFT_WIDTH / 2 - 0.5),
                wallMaterial
            );
            rightWallTop.position.set(BUILDING_WIDTH / 2, y + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 4 + 0.25);
            rightWallTop.renderOrder = 0;
            buildingGroup.add(rightWallTop);

            const rightWallBottom = new THREE.Mesh(
                new THREE.BoxGeometry(wallThickness, 0.2, BUILDING_DEPTH / 2 - SHAFT_WIDTH / 2 - 0.5),
                wallMaterial
            );
            rightWallBottom.position.set(BUILDING_WIDTH / 2, y + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 4 - 0.25);
            rightWallBottom.renderOrder = 0;
            buildingGroup.add(rightWallBottom);
        }

        // Solid ground floor (i=0)
        const groundGeom = new THREE.BoxGeometry(BUILDING_WIDTH + 1, 0.3, BUILDING_DEPTH + 1);
        const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
        const ground = new THREE.Mesh(groundGeom, groundMaterial);
        ground.position.set(0, -0.2, 0);
        buildingGroup.add(ground);

        // Solid roof (above top floor)
        const roofGeom = new THREE.BoxGeometry(BUILDING_WIDTH + 1, 0.3, BUILDING_DEPTH + 1);
        const roofMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
        const roof = new THREE.Mesh(roofGeom, roofMaterial);
        roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT + 0.15, 0);
        buildingGroup.add(roof);

        scene.add(buildingGroup);
    }

    // ========== ELEVATOR CREATION ==========
    function createElevator() {
        elevatorCar = new THREE.Group();
        
        // Elevator frame material (semi-transparent yellow)
        const frameMaterial = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });

        // Door material (darker yellow, slightly more opaque)
        const doorMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccc00,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        });

        // Elevator car dimensions
        const carWidth = SHAFT_WIDTH - 0.2;
        const carHeight = 3.5;
        const carDepth = SHAFT_DEPTH - 0.2;

        // Position elevator at starting floor (floor 1)
        const baseY = FLOOR_HEIGHT + carHeight / 2;
        
        // Back wall (solid, not transparent so we can see inside from front)
        const backWallGeom = new THREE.BoxGeometry(carWidth, carHeight, 0.1);
        const backWallMat = new THREE.MeshPhongMaterial({ color: 0xffff00 });
        const backWall = new THREE.Mesh(backWallGeom, backWallMat);
        backWall.position.set(0, 0, -carDepth / 2);
        elevatorCar.add(backWall);

        // Side walls (transparent yellow)
        const sideWallHeight = carHeight;
        const sideWallThickness = 0.1;
        
        const leftWallGeom = new THREE.BoxGeometry(sideWallThickness, sideWallHeight, carDepth * 0.6);
        const leftWall = new THREE.Mesh(leftWallGeom, frameMaterial);
        leftWall.position.set(-carWidth / 2, 0, 0);
        elevatorCar.add(leftWall);

        const rightWallGeom = new THREE.BoxGeometry(sideWallThickness, sideWallHeight, carDepth * 0.6);
        const rightWall = new THREE.Mesh(rightWallGeom, frameMaterial);
        rightWall.position.set(carWidth / 2, 0, 0);
        elevatorCar.add(rightWall);

        // Floor of elevator car
        const carFloorGeom = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
        const carFloorMat = new THREE.MeshPhongMaterial({ color: 0x8b4513 });
        const carFloor = new THREE.Mesh(carFloorGeom, carFloorMat);
        carFloor.position.set(0, -carHeight / 2 + 0.05, 0);
        elevatorCar.add(carFloor);

        // Ceiling of elevator car
        const carCeilingGeom = new THREE.BoxGeometry(carWidth, 0.1, carDepth);
        const carCeilingMat = new THREE.MeshPhongMaterial({ color: 0xdddddd });
        const carCeiling = new THREE.Mesh(carCeilingGeom, carCeilingMat);
        carCeiling.position.set(0, carHeight / 2 - 0.05, 0);
        elevatorCar.add(carCeiling);

        // Elevator doors (split into left and right halves)
        const doorWidth = carWidth * 0.4;
        const doorHeight = carHeight * 0.8;
        const doorThickness = 0.1;

        // Left door - starts at center-left position
        const leftDoorGeom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        elevatorDoors.left = new THREE.Mesh(leftDoorGeom, doorMaterial);
        elevatorDoors.left.position.set(-carWidth / 4, carHeight * 0.15, carDepth / 2 + doorThickness / 2);
        elevatorCar.add(elevatorDoors.left);

        // Right door - starts at center-right position
        const rightDoorGeom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        elevatorDoors.right = new THREE.Mesh(rightDoorGeom, doorMaterial);
        elevatorDoors.right.position.set(carWidth / 4, carHeight * 0.15, carDepth / 2 + doorThickness / 2);
        elevatorCar.add(elevatorDoors.right);

        // Store door state and dimensions for animation
        elevatorDoors.state = 'closed';
        elevatorDoors.closedPosition = { x: Math.abs(carWidth / 4) };
        elevatorDoors.openPosition = { x: carWidth / 2 + 0.5 };

        // Set initial position at floor 1
        currentFloor = 1;
        targetFloor = 1;
        elevatorCar.position.y = FLOOR_HEIGHT * currentFloor + carHeight / 2;
        
        scene.add(elevatorCar);
    }

    // ========== PEOPLE INITIALIZATION ==========
    function initializePeople() {
        // Create one person per occupied floor
        occupiedFloors.forEach(floor => {
            const person = Person.create();
            
            // Position person in front of elevator doors on their floor
            // Z position: in front of elevator (positive Z)
            // X position: centered with elevator opening
            const yPos = FLOOR_HEIGHT * floor + 1.0; // Feet at floor level (person height from center is ~1.7, so feet at -1.7)
            
            person.position.set(0, yPos, BUILDING_DEPTH / 2 - 3);
            
            // Rotate to face the elevator (rotate 180 degrees around Y)
            person.rotation.y = Math.PI;

            scene.add(person);
            people.push({
                mesh: person,
                floor: floor,
                state: 'waiting' // waiting, boarding, inside, exiting
            });
        });
    }

    // ========== DOOR ANIMATION ==========
    function openDoors(callback) {
        if (doorState !== 'closed') return;
        
        doorState = 'opening';
        const startTime = Date.now();
        const duration = 800 / animationSpeed;

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Smooth easing
            const easedProgress = easeInOutCubic(progress);
            
            const targetX = elevatorDoors.openPosition.x * easedProgress;
            elevatorDoors.left.position.x = -targetX;
            elevatorDoors.right.position.x = targetX;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                doorState = 'open';
                if (callback) callback();
            }
        }
        
        animate();
    }

    function closeDoors(callback) {
        if (doorState !== 'open') return;
        
        doorState = 'closing';
        const startTime = Date.now();
        const duration = 800 / animationSpeed;

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Smooth easing
            const easedProgress = easeInOutCubic(progress);
            
            const targetX = elevatorDoors.openPosition.x * (1 - easedProgress);
            elevatorDoors.left.position.x = -targetX;
            elevatorDoors.right.position.x = targetX;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                doorState = 'closed';
                if (callback) callback();
            }
        }
        
        animate();
    }

    // ========== ELEVATOR MOVEMENT ==========
    function moveElevator(targetY, callback) {
        const startY = elevatorCar.position.y;
        const distance = targetY - startY;
        const duration = Math.abs(distance / ELEVATOR_SPEED * 1000);
        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Smooth easing
            const easedProgress = easeInOutCubic(progress);
            
            elevatorCar.position.y = startY + distance * easedProgress;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                if (callback) callback();
            }
        }
        
        animate();
    }

    // ========== ANIMATION SEQUENCES ==========
    
    // Queue-based animation system for sequential operations
    function addToQueue(operation) {
        animationQueue.push(operation);
        processQueue();
    }

    function processQueue() {
        if (isAnimating || animationQueue.length === 0) return;
        
        isAnimating = true;
        const operation = animationQueue.shift();
        operation();
    }

    // Pick up a person from their floor
    function pickupPerson(personData, callback) {
        const targetY = FLOOR_HEIGHT * personData.floor + elevatorCar.position.y % FLOOR_HEIGHT;
        const targetFloorHeight = FLOOR_HEIGHT * personData.floor + (elevatorCar.position.y - Math.floor(elevatorCar.position.y / FLOOR_HEIGHT) * FLOOR_HEIGHT);
        
        // Calculate exact Y position for the target floor
        const carHeight = 3.5;
        const exactTargetY = FLOOR_HEIGHT * personData.floor + carHeight / 2;

        moveElevator(exactTargetY, () => {
            // Elevator arrived at floor
            currentFloor = personData.floor;
            
            // Open doors
            openDoors(() => {
                // Delay before person walks in
                setTimeout(() => {
                    // Position for elevator entrance (just outside the door)
                    const entranceZ = FLOOR_HEIGHT * personData.floor + 1.0;
                    const entranceX = 0;
                    
                    // Create a temporary target for walking
                    const walkTarget = new THREE.Vector3(entranceX, entranceZ, BUILDING_DEPTH / 2 - 1);
                    
                    // Start walking towards elevator
                    personData.mesh.userData.onArrival = () => {
                        // Person has reached the door, now move them inside
                        
                        // Move person into elevator (slightly forward)
                        const insidePosition = new THREE.Vector3(0, FLOOR_HEIGHT * personData.floor + 1.0, carDepth / 2 - 0.5);
                        
                        // Add person as child of elevator so they travel with it
                        scene.remove(personData.mesh);
                        elevatorCar.add(personData.mesh);
                        personData.mesh.position.copy(insidePosition);
                        personData.state = 'inside';
                        personData.floor = currentFloor;
                        
                        if (callback) callback();
                    };
                    
                    Person.walk(personData.mesh, walkTarget, PERSON_MOVE_SPEED * animationSpeed);
                }, 300);
            });
        });
    }

    // Drop off a person at their destination
    function dropoffPerson(personData, callback) {
        // Open doors first
        openDoors(() => {
            // Delay before person exits
            setTimeout(() => {
                // Calculate exit position (in front of elevator at this floor)
                const exitZ = FLOOR_HEIGHT * currentFloor + 1.0;
                const exitX = 0;
                
                // Move person to door threshold first
                const doorThreshold = new THREE.Vector3(exitX, exitZ, carDepth / 2);
                
                personData.mesh.position.copy(doorThreshold);
                
                // Remove from elevator and add to scene
                elevatorCar.remove(personData.mesh);
                scene.add(personData.mesh);
                
                // Rotate to face away from elevator (same as waiting position)
                personData.mesh.rotation.y = Math.PI;
                
                // Walk to final waiting position
                const finalPosition = new THREE.Vector3(0, exitZ, BUILDING_DEPTH / 2 - 3);
                
                personData.mesh.userData.onArrival = () => {
                    personData.state = 'waiting';
                    if (callback) callback();
                };
                
                Person.walk(personData.mesh, finalPosition, PERSON_MOVE_SPEED * animationSpeed);
            }, 300);
        });
    }

    // ========== MAIN SIMULATION CYCLE ==========
    function startElevatorCycle() {
        // Find a person to move (from an occupied floor to the empty floor)
        const emptyFloor = getEmptyFloor();
        
        if (emptyFloor === null) return;
        
        // Select a random person from occupied floors (not already at destination)
        const availablePeople = people.filter(p => p.floor !== emptyFloor);
        if (availablePeople.length === 0) return;
        
        const selectedPerson = availablePeople[Math.floor(Math.random() * availablePeople.length)];
        const destinationFloor = emptyFloor;

        // Step 1: Move elevator to pickup location
        addToQueue(() => {
            pickupPerson(selectedPerson, () => {
                // Step 2: Close doors after person is inside
                setTimeout(() => {
                    closeDoors(() => {
                        // Step 3: Move elevator to destination
                        const carHeight = 3.5;
                        const targetY = FLOOR_HEIGHT * destinationFloor + carHeight / 2;
                        
                        moveElevator(targetY, () => {
                            // Step 4: Open doors at destination
                            dropoffPerson(selectedPerson, () => {
                                // Step 5: Close doors after person exits
                                setTimeout(() => {
                                    closeDoors(() => {
                                        // Update floor tracking
                                        occupiedFloors.delete(selectedPerson.floor);
                                        selectedPerson.floor = destinationFloor;
                                        occupiedFloors.add(destinationFloor);
                                        
                                        // Continue the cycle
                                        setTimeout(startElevatorCycle, 1000);
                                    });
                                }, 500);
                            });
                        });
                    });
                }, 500);
            });
        });
    }

    function getEmptyFloor() {
        for (let i = 0; i < FLOOR_COUNT; i++) {
            if (!occupiedFloors.has(i)) return i;
        }
        return null;
    }

    // ========== UTILITY FUNCTIONS ==========
    
    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ========== ANIMATION LOOP ==========
    function animate() {
        requestAnimationFrame(animate);
        
        controls.update();
        renderer.render(scene, camera);
    }

    // Start the simulation
    init();

})();
