const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene, camera, renderer, controls;
let elevatorCar;
let people = [];
let speedMultiplier = 1;

function createBuilding() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    
    const ground = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH), floorMat);
    ground.position.set(0, 0, 0);
    scene.add(ground);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH), roofMat);
    roof.position.set(0, FLOOR_HEIGHT * FLOOR_COUNT, 0);
    scene.add(roof);

    for (let i = 1; i < FLOOR_COUNT; i++) {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.1, BUILDING_DEPTH), floorMat);
        floor.position.set(0, i * FLOOR_HEIGHT, 0);
        scene.add(floor);
    }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const wallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1);
    const sideWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT, BUILDING_DEPTH);

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const y = i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
        const backWall = new THREE.Mesh(wallGeo, wallMat);
        backWall.position.set(0, y, -BUILDING_DEPTH / 2);
        scene.add(backWall);

        const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
        leftWall.position.set(-BUILDING_WIDTH / 2, y, 0);
        scene.add(leftWall);

        const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
        rightWall.position.set(BUILDING_WIDTH / 2, y, 0);
        scene.add(rightWall);

        const frontWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.1);
        const frontWall = new THREE.Mesh(frontWallGeo, wallMat);
        frontWall.position.set(0, y, BUILDING_DEPTH / 2);
        scene.add(frontWall);
        
        scene.remove(frontWall);
        
        const leftFrontWall = new THREE.Mesh(new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, 0.1), wallMat);
        leftFrontWall.position.set(-(BUILDING_WIDTH - SHAFT_WIDTH) / 4, y, BUILDING_DEPTH / 2);
        scene.add(leftFrontWall);

        const rightFrontWall = new THREE.Mesh(new THREE.BoxGeometry((BUILDING_WIDTH - SHAFT_WIDTH) / 2, FLOOR_HEIGHT, 0.1), wallMat);
        rightFrontWall.position.set((BUILDING_WIDTH - SHAFT_WIDTH) / 4, y, BUILDING_DEPTH / 2);
        scene.add(rightFrontWall);
    }
}

function createElevatorCar() {
    elevatorCar = new THREE.Group();
    const frameGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, (FLOOR_HEIGHT * FLOOR_COUNT) / 2, 0);
    elevatorCar.add(frame);

    const backWallGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * FLOOR_COUNT, 0.1);
    const backWallMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, (FLOOR_HEIGHT * FLOOR_COUNT) / 2, -SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);

    const sideWallGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT * FLOOR_COUNT, SHAFT_DEPTH);
    const sideWallMat = new THREE.MeshStandardMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const leftSide = new THREE.Mesh(sideWallGeo, sideWallMat);
    leftSide.position.set(-SHAFT_WIDTH / 2, (FLOOR_HEIGHT * FLOOR_COUNT) / 2, 0);
    elevatorCar.add(leftSide);

    const rightSide = new THREE.Mesh(sideWallGeo, sideWallMat);
    rightSide.position.set(SHAFT_WIDTH / 2, (FLOOR_HEIGHT * FLOOR_COUNT) / 2, 0);
    elevatorCar.add(rightSide);

    const doorGeo = new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.05, FLOOR_HEIGHT * 0.8, 0.1);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    
    elevatorCar.leftDoor = new THREE.Mesh(doorGeo, doorMat);
    elevatorCar.leftDoor.position.set(-SHAFT_WIDTH / 4, (FLOOR_HEIGHT * 0.8) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(elevatorCar.leftDoor);

    elevatorCar.rightDoor = new THREE.Mesh(doorGeo, doorMat);
    elevatorCar.rightDoor.position.set(SHAFT_WIDTH / 4, (FLOOR_HEIGHT * 0.8) / 2, SHAFT_DEPTH / 2);
    elevatorCar.add(elevatorCar.rightDoor);

    return elevatorCar;
}

async function walkTo(obj, targetX, targetY, targetZ) {
    return new Promise(resolve => {
        const interval = setInterval(() => {
            const dx = targetX - obj.position.x;
            const dy = targetY - obj.position.y;
            const dz = targetZ - obj.position.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < 0.05) {
                obj.position.set(targetX, targetY, targetZ);
                clearInterval(interval);
                resolve();
            } else {
                const stepX = (dx / dist) * PERSON_MOVE_SPEED * 0.01 * speedMultiplier;
                const stepY = (dy / dist) * PERSON_MOVE_SPEED * 0.01 * speedMultiplier;
                const stepZ = (dz / dist) * PERSON_MOVE_SPEED * 0.01 * speedMultiplier;
                obj.position.x += stepX;
                obj.position.y += stepY;
                obj.position.z += stepZ;
            }
        }, 16);
    });
}

async function openDoors() {
    isDoorOpening = true;
    const targetX = SHAFT_WIDTH / 2 - 0.1;
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (elevatorCar.leftDoor.position.x > -targetX) {
                elevatorCar.leftDoor.position.x -= 0.05 * speedMultiplier;
                elevatorCar.rightDoor.position.x += 0.05 * speedMultiplier;
            } else {
                elevatorCar.leftDoor.position.x = -targetX;
                elevatorCar.rightDoor.position.x = targetX;
                isDoorOpening = false;
                clearInterval(interval);
                resolve();
            }
        }, 16);
    });
}

async function closeDoors() {
    isDoorClosing = true;
    const targetX = 0;
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (elevatorCar.leftDoor.position.x > targetX) {
                elevatorCar.leftDoor.position.x -= 0.05 * speedMultiplier;
                elevatorCar.rightDoor.position.x += 0.05 * speedMultiplier;
            } else {
                elevatorCar.leftDoor.position.x = 0;
                elevatorCar.rightDoor.position.x = 0;
                isDoorClosing = false;
                clearInterval(interval);
                resolve();
            }
        }, 16);
    });
}

async function moveToFloor(floorY) {
    isElevatorMoving = true;
    const targetY = floorY + (FLOOR_HEIGHT * FLOOR_COUNT) / 2;
    return new Promise(resolve => {
        const interval = setInterval(() => {
            const dy = targetY - elevatorCar.position.y;
            if (Math.abs(dy) < 0.01) {
                elevatorCar.position.y = targetY;
                isElevatorMoving = false;
                clearInterval(interval);
                resolve();
            } else {
                elevatorCar.position.y += Math.sign(dy) * ELEVATOR_SPEED * 0.01 * speedMultiplier;
            }
        }, 16);
    });
}

let isDoorOpening = false;
let isDoorClosing = false;
let isElevatorMoving = false;
let isPersonMoving = false;

async function runSimulationSequence() {
    if (isElevatorMoving || isDoorOpening || isDoorClosing || isPersonMoving) return;

    const person = people.find(p => p.parent === scene && !p.userData.isWalking && p.userData.isWorking === false);
    if (!person) return;

    const floorIdx = Math.round(person.position.y / FLOOR_HEIGHT);
    const targetY = floorIdx * FLOOR_HEIGHT;
    
    await moveToFloor(targetY);
    await openDoors();

    person.userData.isWalking = true;
    await walkTo(person, 0, targetY + 0.4, 0);
    person.userData.isWalking = false;

    elevatorCar.attach(person);
    await closeDoors();

    const nextFloorIdx = (floorIdx + 1) % FLOOR_COUNT;
    const destY = nextFloorIdx * FLOOR_HEIGHT;
    await moveToFloor(destY);

    await openDoors();

    person.userData.isWalking = true;
    person.rotation.y = 0;
    scene.attach(person);
    await walkTo(person, 0, destY + 0.4, SHAFT_DEPTH/2 + 1);
    person.userData.isWalking = false;

    await closeDoors();
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(20, 30, 10);
    scene.add(sun);

    createBuilding();
    elevatorCar = createElevatorCar();
    scene.add(elevatorCar);

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const person = createPerson();
        person.position.set(0, i * FLOOR_HEIGHT + 0.4, SHAFT_DEPTH/2 + 1);
        person.rotation.y = Math.PI; 
        scene.add(person);
        people.push(person);
    }

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = '1';
    slider.style.position = 'absolute';
    slider.style.top = '10px';
    slider.style.left = '10px';
    slider.style.zIndex = '100';
    slider.addEventListener('input', (e) => {
        speedMultiplier = parseFloat(e.target.value);
    });
    document.body.appendChild(slider);

    setInterval(() => {
        runSimulationSequence();
    }, 1000);

    function animate() {
        requestAnimationFrame(animate);
        const time = Date.now() * 0.005 * speedMultiplier;
        people.forEach(person => {
            if (person.userData.isWalking) {
                person.userData.leftLeg.rotation.x = Math.sin(time) * 0.5;
                person.userData.rightLeg.rotation.x = -Math.sin(time) * 0.5;
            } else {
                person.userData.leftLeg.rotation.x = 0;
                person.userData.rightLeg.rotation.x = 0;
            }
        });
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
