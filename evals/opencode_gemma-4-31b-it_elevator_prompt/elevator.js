// Constants
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 10;
const BUILDING_DEPTH = 10;
const SHAFT_WIDTH = 3;
const SHAFT_DEPTH = 3;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1.5;

let scene, camera, renderer, controls, speedMultiplier = 1;
let elevatorCar, doors = { left: null, right: null };
let people = []; // Array of { person: Mesh, floor: number }
let currentEmptyFloor = 0;
let isAnimating = false;

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true; // Critical for transparency
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(10, 20, 10);
    scene.add(sunLight);

    createBuilding();
    createElevator();
    setupSimulation();

    window.addEventListener('resize', onWindowResize, false);
    document.getElementById('speedRange').addEventListener('input', (e) => {
        speedMultiplier = parseFloat(e.target.value);
        document.getElementById('speedVal').innerText = speedMultiplier;
    });

    animate();
}

function createBuilding() {
    const floorMat = new THREE.MeshLambertMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const wallMat = new THREE.MeshLambertMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT;
        
        // Floor surface with cutout
        const floorGroup = new THREE.Group();
        const planeGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
        const floorPlane = new THREE.Mesh(planeGeo, floorMat);
        floorPlane.rotation.x = -Math.PI / 2;
        
        // Simple cutout simulation: use 4 smaller planes around the shaft
        const pWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        const pDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        
        const parts = [
            { w: pWidth, d: BUILDING_DEPTH, x: -SHAFT_WIDTH/2 - pWidth/2, z: 0 }, // Left
            { w: pWidth, d: BUILDING_DEPTH, x: SHAFT_WIDTH/2 + pWidth/2, z: 0 },  // Right
            { w: SHAFT_WIDTH, d: pDepth, x: 0, z: -SHAFT_DEPTH/2 - pDepth/2 }, // Back
            { w: SHAFT_WIDTH, d: pDepth, x: 0, z: SHAFT_DEPTH/2 + pDepth/2 }  // Front
        ];

        // For simplicity in this simulation, we'll use a large floor and just accept the overlap 
        // or create a proper hole. Let's do 4 rectangles for a clean cutout.
        const rectGeo = new THREE.PlaneGeometry(1, 1);
        
        // Top/Bottom strips
        const stripH = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        const createRect = (w, d, x, z) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(x, 0, z);
            return m;
        };

        floorGroup.add(createRect(BUILDING_WIDTH, stripH, 0, -SHAFT_DEPTH/2 - stripH/2)); // Back
        floorGroup.add(createRect(BUILDING_WIDTH, stripH, 0, SHAFT_DEPTH/2 + stripH/2));  // Front
        floorGroup.add(createRect(pWidth, SHAFT_DEPTH, -SHAFT_WIDTH/2 - pWidth/2, 0));      // Left
        floorGroup.add(createRect(pWidth, SHAFT_DEPTH, SHAFT_WIDTH/2 + pWidth/2, 0));       // Right

        floorGroup.position.y = y;
        scene.add(floorGroup);

        // Walls
        const wallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
        const walls = new THREE.Mesh(wallGeo, wallMat);
        walls.position.set(0, y + FLOOR_HEIGHT/2, 0);
        // To make it a "shell", we can scale it or use multiple planes. 
        // For this simulation, a semi-transparent box is acceptable as long as depthWrite is false.
        scene.add(walls);
    }

    // Roof and Ground (Solid)
    const solidMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH), solidMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH), solidMat);
    roof.position.y = FLOOR_COUNT * FLOOR_HEIGHT;
    scene.add(roof);
}

function createElevator() {
    elevatorCar = new THREE.Group();
    elevatorCar.renderOrder = 1;

    const frameMat = new THREE.MeshLambertMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });
    const doorMat = new THREE.MeshLambertMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7, 
        depthWrite: false, 
        side: THREE.DoubleSide 
    });

    // Frame (Box with cutout)
    const frame = new THREE.Group();
    const partW = (SHAFT_WIDTH - 1) / 2;
    const partD = (SHAFT_DEPTH - 1) / 2;

    const createPart = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
        m.position.set(x, y, z);
        return m;
    };

    frame.add(createPart(SHAFT_WIDTH, 2.5, 0.1, 0, 1.25, -SHAFT_DEPTH/2)); // Back wall
    frame.add(createPart(0.1, 2.5, SHAFT_DEPTH, -SHAFT_WIDTH/2, 1.25, 0)); // Left wall
    frame.add(createPart(0.1, 2.5, SHAFT_DEPTH, SHAFT_WIDTH/2, 1.25, 0));  // Right wall
    frame.add(createPart(SHAFT_WIDTH, 0.1, SHAFT_DEPTH, 0, 2.5, 0));     // Ceiling
    frame.add(createPart(SHAFT_WIDTH, 0.1, SHAFT_DEPTH, 0, 0, 0));         // Floor

    elevatorCar.add(frame);

    // Doors
    const doorGeo = new THREE.BoxGeometry(SHAFT_WIDTH/2 - 0.05, 2.4, 0.1);
    doors.left = new THREE.Mesh(doorGeo, doorMat);
    doors.left.position.set(-SHAFT_WIDTH/4, 1.2, SHAFT_DEPTH/2);
    
    doors.right = new THREE.Mesh(doorGeo, doorMat);
    doors.right.position.set(SHAFT_WIDTH/4, 1.2, SHAFT_DEPTH/2);

    elevatorCar.add(doors.left);
    elevatorCar.add(doors.right);

    scene.add(elevatorCar);
}

function setupSimulation() {
    // Randomly pick empty floor
    currentEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
    
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i === currentEmptyFloor) continue;
        
        const person = createPerson();
        // Position in front of elevator on floor i
        person.position.set(0, i * FLOOR_HEIGHT, SHAFT_DEPTH/2 + 1);
        person.rotation.y = Math.PI; // Face elevator
        
        scene.add(person);
        people.push({ person: person, floor: i });
    }
}

async function runSimulationCycle() {
    if (isAnimating) return;
    isAnimating = true;

    // 1. Select a random person to move
    const availablePeople = people.filter(p => p.floor !== currentEmptyFloor);
    const targetPersonIdx = Math.floor(Math.random() * availablePeople.length);
    const personData = availablePeople[targetPersonIdx];
    const startFloor = personData.floor;
    const endFloor = currentEmptyFloor;

    // 2. Elevator moves to pickup floor
    await animateElevatorTo(startFloor);
    
    // 3. Doors open
    await animateDoors(true);
    
    // 4. Person walks in
    await animatePersonMove(personData.person, { x: 0, y: startFloor * FLOOR_HEIGHT, z: 0 }, true);
    
    // Attach to elevator
    scene.remove(personData.person);
    elevatorCar.add(personData.person);
    personData.person.position.set(0, 0, 0); // Local to car

    // 5. Doors close
    await animateDoors(false);
    
    // 6. Elevator travels to destination
    await animateElevatorTo(endFloor);
    
    // 7. Doors open
    await animateDoors(true);
    
    // 8. Person walks out
    scene.add(personData.person); // Detach from car
    const worldPos = new THREE.Vector3();
    elevatorCar.getWorldPosition(worldPos);
    personData.person.position.copy(worldPos);
    personData.person.position.y = endFloor * FLOOR_HEIGHT;

    await animatePersonMove(personData.person, { x: 0, y: endFloor * FLOOR_HEIGHT, z: SHAFT_DEPTH/2 + 1 }, false);
    
    // Update simulation state
    personData.floor = endFloor;
    currentEmptyFloor = startFloor;

    // 9. Doors close
    await animateDoors(false);

    isAnimating = false;
}

function animateElevatorTo(floor) {
    return new Promise(resolve => {
        const targetY = floor * FLOOR_HEIGHT;
        const step = () => {
            const diff = targetY - elevatorCar.position.y;
            if (Math.abs(diff) < 0.01) {
                elevatorCar.position.y = targetY;
                resolve();
            } else {
                elevatorCar.position.y += Math.sign(diff) * ELEVATOR_SPEED * 0.016 * speedMultiplier;
                requestAnimationFrame(step);
            }
        };
        step();
    });
}

function animateDoors(open) {
    return new Promise(resolve => {
        const targetXLeft = open ? -SHAFT_WIDTH/2 : -SHAFT_WIDTH/4;
        const targetXRight = open ? SHAFT_WIDTH/2 : SHAFT_WIDTH/4;
        const speed = 2 * speedMultiplier;

        const step = () => {
            const dxL = targetXLeft - doors.left.position.x;
            const dxR = targetXRight - doors.right.position.x;
            if (Math.abs(dxL) < 0.01 && Math.abs(dxR) < 0.01) {
                doors.left.position.x = targetXLeft;
                doors.right.position.x = targetXRight;
                setTimeout(() => resolve(), 300); // Brief delay for realism
            } else {
                doors.left.position.x += Math.sign(dxL) * speed * 0.016;
                doors.right.position.x += Math.sign(dxR) * speed * 0.016;
                requestAnimationFrame(step);
            }
        };
        step();
    });
}

function animatePersonMove(person, target, boarding) {
    return new Promise(resolve => {
        person.userData.isWalking = true;
        const speed = PERSON_MOVE_SPEED * speedMultiplier;
        
        const step = () => {
            const dx = target.x - person.position.x;
            const dy = target.y - person.position.y;
            const dz = target.z - person.position.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (dist < 0.1) {
                person.position.set(target.x, target.y, target.z);
                resetPersonWalk(person);
                setTimeout(() => resolve(), 300);
            } else {
                const dir = new THREE.Vector3(dx, dy, dz).normalize();
                person.position.addScaledVector(dir, speed * 0.016);
                requestAnimationFrame(step);
            }
        };
        step();
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now() / 1000;
    people.forEach(p => animatePersonWalk(p.person, time, speedMultiplier));
    
    if (!isAnimating) {
        // Occasionally start a new cycle if not animating
        if (Math.random() < 0.005) runSimulationCycle();
    }

    renderer.render(scene, camera);
}

init();
