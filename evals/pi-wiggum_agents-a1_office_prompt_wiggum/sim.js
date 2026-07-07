// sim.js - Main simulation loop, scene setup, person management

(function() {
    // Scene, camera, renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222233);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 8, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Create world
    const worldData = window.createWorld(scene);
    const world = worldData.buildingGroup;
    const floors = worldData.floors;

    // Create elevator
    const elevator = new Elevator(scene, { ...window.WORLD, floors });

    // Person management
    const persons = [];
    const personSpawnPoints = [
        { name: 'lobby_center', floor: 0 },
        { name: 'cafe_table1', floor: 0 },
        { name: 'front_lounge_N', floor: 0 },
        { name: 'back_lounge_N', floor: 0 },
        { name: 'hallS', floor: 1 },
        { name: 'conf_center', floor: 1 },
        { name: 'lounge_center', floor: 1 },
        { name: 'officeA_desk', floor: 1 },
        { name: 'officeB_desk', floor: 1 },
        { name: 'hallS', floor: 2 },
        { name: 'conf_center', floor: 2 },
        { name: 'lounge_center', floor: 2 },
        { name: 'officeA_desk', floor: 2 },
        { name: 'officeC_desk', floor: 2 },
    ];

    function spawnPerson(floorNum, targetNode) {
        const person = window.createPerson();
        person.castShadow = true;
        person.receiveShadow = true;

        // Get position from world nodes
        const floor = floors[floorNum];
        if (floor && floor.nodes && floor.nodes[targetNode]) {
            const pos = floor.nodes[targetNode].clone();
            person.position.copy(pos);
            person.userData.floor = floorNum;
            person.userData.targetNode = targetNode;
            person.userData.walkSpeed = 0.5 + Math.random() * 0.3;

            // Random initial rotation
            person.rotation.y = Math.random() * Math.PI * 2;

            scene.add(person);
            persons.push(person);
        } else {
            console.warn('Spawn failed: floor', floorNum, 'node', targetNode);
        }
    }

    // Spawn initial population
    for (let i = 0; i < 15; i++) {
        const spawn = personSpawnPoints[Math.floor(Math.random() * personSpawnPoints.length)];
        spawnPerson(spawn.floor, spawn.name);
    }

    // Animation loop variables
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsTime = lastTime;

    // Update persons
    function updatePersons(dt) {
        for (const person of persons) {
            const floor = floors[person.userData.floor];
            if (!floor || !floor.nodes) continue;

            const data = person.userData;
            const targetNode = floor.nodes[data.targetNode];
            if (!targetNode) continue;

            // Simple movement: walk toward target node
            const direction = new THREE.Vector3().subVectors(targetNode, person.position);
            direction.y = 0;
            const dist = direction.length();

            if (dist > 0.1) {
                data.isWalking = true;
                direction.normalize();
                person.lookAt(person.position.x + direction.x, person.position.y, person.position.z + direction.z);
                person.position.add(direction.multiplyScalar(data.walkSpeed * dt));
            } else {
                // Reached target, pick new random node on same floor
                const nodes = Object.keys(floor.nodes);
                const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
                data.targetNode = randomNode;
                data.isWalking = false;
            }

            // Animate walking
            window.animatePersonWalking(person, dt);
        }
    }

    // Elevator interaction
    function updateElevatorInteraction(dt) {
        for (const person of persons) {
            const floorNum = person.userData.floor;
            const floor = floors[floorNum];
            if (!floor) continue;

            // Check if near elevator call panel
            const elevWaitNode = floor.nodes['elevWait'];
            if (elevWaitNode) {
                const dist = person.position.distanceTo(new THREE.Vector3(elevWaitNode.x, person.position.y, elevWaitNode.z));
                if (dist < 1.5) {
                    // Simple interaction: call elevator randomly
                    if (Math.random() < 0.01) {
                        const direction = floorNum > elevator.logic.currentFloor ? 'up' : 'down';
                        if (direction === 'up') {
                            elevator.callUp(floorNum);
                        } else {
                            elevator.callDown(floorNum);
                        }
                    }
                }
            }

            // Check if near elevator doors for boarding
            const elevDoorPos = new THREE.Vector3(0, person.position.y, 2.5); // Approximate door position
            if (person.position.distanceTo(elevDoorPos) < 1.0 && elevator.logic.state === elevator.logic.DOOR_OPEN) {
                if (Math.random() < 0.02) {
                    // Try to board
                    const spot = elevator.reserveBoardingSpot(person);
                    if (spot) {
                        person.userData.inElevator = true;
                        person.position.copy(spot);
                    }
                }
            }

            // If in elevator, follow it
            if (person.userData.inElevator) {
                const elevPos = new THREE.Vector3(0, elevator.logic.currentFloor * WORLD.FLOOR_HEIGHT, 0);
                person.position.y = elevPos.y;
                person.position.x = elevPos.x;
                person.position.z = elevPos.z;

                // Check if at destination floor
                if (elevator.logic.currentFloor === Math.round(person.userData.targetFloor || floorNum)) {
                    if (Math.random() < 0.05) {
                        elevator.completeDisembark(person);
                        person.userData.inElevator = false;
                        person.position.y = elevator.logic.currentFloor * WORLD.FLOOR_HEIGHT + 0.1;
                        // Pick new target floor
                        person.userData.targetFloor = Math.floor(Math.random() * WORLD.FLOOR_COUNT);
                    }
                }
            }
        }
    }

    // Main animation loop
    function animate() {
        requestAnimationFrame(animate);

        const currentTime = performance.now();
        const dt = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Limit dt to avoid huge jumps
        const maxDt = 0.1;
        const safeDt = Math.min(dt, maxDt);

        // Update elevator logic and visuals
        elevator.tick(safeDt);

        // Update persons
        updatePersons(safeDt);
        updateElevatorInteraction(safeDt);

        // Update controls
        controls.update();

        // Render
        renderer.render(scene, camera);

        // FPS counter (every second)
        frameCount++;
        if (currentTime - lastFpsTime >= 1000) {
            const fps = Math.round(frameCount / ((currentTime - lastFpsTime) / 1000));
            document.title = `Office Sim - ${fps} FPS`;
            frameCount = 0;
            lastFpsTime = currentTime;
        }
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start simulation
    animate();

    // Expose for debugging
    window.simulation = {
        scene, camera, renderer, elevator, persons, floors, WORLD: window.WORLD
    };

})();
