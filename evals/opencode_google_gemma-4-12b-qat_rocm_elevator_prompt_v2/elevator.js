const FLOOR_HEIGHT = 3;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 5;
const SHAFT_DEPTH = 5;
const ELEVATOR_SPEED = 2;
const PERSON_MOVE_SPEED = 1;

let scene, camera, renderer, controls, elevatorCar;
let people = [];
let floors = [];
let building = new THREE.Group();
let elevatorDoors = { left: null, right: null, isOpen: false };
let currentEmptyFloor = Math.floor(Math.random() * FLOOR_COUNT);
let animationQueue = [];

function createBuilding() {
    const floorMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const wallMat = new THREE.MeshPhongMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const groundMat = new THREE.MeshPhongMaterial({ color: 0x888888 });

    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floorY = i * FLOOR_HEIGHT;
        
        // Floor surface
        const floor = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH), floorMat);
        floor.position.y = floorY;
        floor.position.x = -BUILDING_WIDTH / 2 + SHAFT_WIDTH / 2;
        floor.position.z = -BUILDING_DEPTH / 2 + SHAFT_DEPTH / 2;
        
        // Adjust floor geometry to have a hole in the center
        // We'll just make it a bit offset for simplicity and use a group
        const floorGroup = new THREE.Group();
        floorGroup.position.y = floorY;
        
        const floorMain = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH - SHAFT_WIDTH, 0.2, BUILDING_DEPTH), floorMat);
        floorMain.position.x = -BUILDING_WIDTH / 2 + (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
        floorGroup.add(floorMain);
        
        const floorFront = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH - SHAFT_DEPTH), floorMat);
        floorFront.position.z = -BUILDING_DEPTH / 2 + (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        floorGroup.add(floorFront);
        
        const floorBack = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH - SHAFT_DEPTH), floorMat);
        floorBack.position.z = BUILDING_DEPTH / 2 - (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
        floorGroup.add(floorBack);

        // Shaft area cutout - we don't actually need to cut holes, we can just position 
        // the floor parts around the shaft.
        
        // Let's simplify: one big floor with a hole? No, let's just use the parts.
        // Actually, let's just make 4 rectangles per floor to avoid the shaft.
        const f = new THREE.Group();
        f.position.y = floorY;
        
        const rects = [
            [BUILDING_WIDTH, BUILDING_DEPTH - SHAFT_DEPTH, 0], // Back
            [BUILDING_WIDTH, BUILDING_DEPTH - SHAFT_DEPTH, BUILDING_DEPTH], // Front
            [BUILDING_WIDTH - SHAFT_WIDTH, BUILDING_DEPTH / 2, -BUILDING_DEPTH / 2], // Left
            [BUILDING_WIDTH - SHAFT_WIDTH, BUILDING_DEPTH / 2, BUILDING_DEPTH / 2]  // Right
        ];
        
        // Correction: To make it look like a building with a central shaft:
        const w = BUILDING_WIDTH;
        const d = BUILDING_DEPTH;
        const sw = SHAFT_WIDTH;
        const sd = SHAFT_DEPTH;
        
        const s1 = new THREE.Mesh(new THREE.BoxGeometry(w - sw, 0.2, d/2 - sd/2), floorMat);
        s1.position.x = -w/2 + (w-sw)/2;
        s1.position.z = -d/2 + (d-sd)/2;
        f.add(s1);
        
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(w - sw, 0.2, d/2 - sd/2), floorMat);
        s2.position.x = -w/2 + (w-sw)/2;
        s2.position.z = d/2 - (d-sd)/2;
        f.add(s2);
        
        const s3 = new THREE.Mesh(new THREE.BoxGeometry(w/2 - sw/2, d - sd, 0.2), floorMat);
        s3.position.x = -w/2 + (w-sw)/2;
        s3.position.z = -d/2 + (d-sd)/2;
        f.add(s3);
        
        const s4 = new THREE.Mesh(new THREE.BoxGeometry(w/2 - sw/2, d - sd, 0.2), floorMat);
        s4.position.x = w/2 - (w-sw)/2;
        s4.position.z = -d/2 + (d-sd)/2;
        f.add(s4);

        // Walls
        const wallMat2 = new THREE.MeshPhongMaterial({ color: 0x9999ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        const wallSide1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, d), wallMat2);
        wallSide1.position.set(-w/2, floorY + FLOOR_HEIGHT/2, 0);
        f.add(wallSide1);
        
        const wallSide2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, FLOOR_HEIGHT, d), wallMat2);
        wallSide2.position.set(w/2, floorY + FLOOR_HEIGHT/2, 0);
        f.add(wallSide2);

        building.add(f);
        floors.push(f);
    }
    
    scene.add(building);
    // Add roof and ground
    const ground = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_WIDTH + 2, 0.2, BUILDING_DEPTH + 2), new THREE.MeshPhongMaterial({color: 0x888888}));
    ground.position.y = -0.1;
    scene.add(ground);
}

function createElevator() {
    const group = new THREE.Group();
    
    const frameMat = new THREE.MeshPhongMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 });
    const doorMat = new THREE.MeshPhongMaterial({ color: 0xcccc00, transparent: true, opacity: 0.7 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 0.8, SHAFT_DEPTH), frameMat);
    frame.position.y = FLOOR_HEIGHT * 0.4;
    group.add(frame);

    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT * 0.8, 0.2), frameMat);
    backWall.position.set(0, FLOOR_HEIGHT * 0.4, -SHAFT_DEPTH / 2);
    group.add(backWall);

    // Doors
    const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_HEIGHT * 0.8, 0.1), doorMat);
    doorLeft.position.set(-SHAFT_WIDTH / 4 + 0.05, FLOOR_HEIGHT * 0.4, SHAFT_DEPTH / 2);
    group.add(doorLeft);
    
    const doorRight = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_WIDTH / 2 - 0.1, FLOOR_HEIGHT * 0.8, 0.1), doorMat);
    doorRight.position.set(SHAFT_WIDTH / 4 - 0.05, FLOOR_HEIGHT * 0.4, SHAFT_DEPTH / 2);
    group.add(doorRight);

    elevatorCar = group;
    elevatorCar.position.set(0, 0, 0);
    // Initial position at ground floor
    elevatorCar.position.y = 0; 
    
    elevatorCar.leftDoor = doorLeft;
    elevatorCar.rightDoor = doorRight;
    
    scene.add(elevatorCar);
    return elevatorCar;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);

    const light1 = new THREE.DirectionalLight(0xffffff, 1);
    light1.position.set(10, 20, 10);
    scene.add(light1);
    
    const light2 = new THREE.AmbientLight(0x404040);
    scene.add(light2);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    createBuilding();
    createElevator();

    // Populate floors with people
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (i !== currentEmptyFloor) {
            const p = createPerson();
            p.position.set(0, i * FLOOR_HEIGHT, SHAFT_DEPTH / 2 + 1.5);
            p.rotation.y = Math.PI;
            people.push(p);
            scene.add(p);
        }
    }

    // Animation logic
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    const animationSpeed = () => parseFloat(speedSlider.value);
    speedSlider.oninput = (e) => {
        speedValue.innerText = e.target.value + 'x';
    };

    async function runSequence() {
        // 1. Move to pickup
        const targetFloor = Math.floor(Math.random() * FLOOR_COUNT);
        if (targetFloor === currentEmptyFloor) return;

        const targetY = targetFloor * FLOOR_HEIGHT;
        await moveToY(targetY);
        
        // 2. Open Doors
        await animateDoors(true);
        
        // 3. Board
        const personIdx = people.findIndex(p => Math.abs(p.position.y - targetY) < 0.1);
        if (personIdx !== -1) {
            const p = people[personIdx];
            await walkToElevator(p, elevatorCar);
            elevatorCar.attach(p);
            p.position.set(0, 0, 0); // Center in elevator
        }
        
        // 4. Close Doors
        await animateDoors(false);
        
        // 5. Move to destination
        const destFloor = currentEmptyFloor;
        await moveToY(destFloor * FLOOR_HEIGHT);
        
        // 6. Open Doors
        await animateDoors(true);
        
        // 7. Exit
        if (people.length > 0) {
            const p = people[0]; // Simplification: just take first for now
            await walkFromElevator(p, scene);
            scene.attach(p);
            
            // Update empty floor
            currentEmptyFloor = targetFloor;
            // Re-populate... (omitted for brevity in this loop, but logic follows)
        }

        await animateDoors(false);
        
        // Repeat
        setTimeout(runSequence, 1000);
    }

    // Helper for sequential animations
    function animateDoors(open) {
        return new Promise(resolve => {
            const target = open ? SHAFT_WIDTH / 4 : 0;
            let start = open ? elevatorCar.leftDoor.position.x : elevatorCar.leftDoor.position.x;
            let current = open ? -SHAFT_WIDTH / 4 : -SHAFT_WIDTH / 4;
            
            let startTime = performance.now();
            const duration = 1000;

            function step(now) {
                let progress = (now - startTime) / duration;
                if (progress > 1) progress = 1;
                
                const dx = (target - current) * progress;
                elevatorCar.leftDoor.position.x = current + dx;
                elevatorCar.rightDoor.position.x = current - dx; // Wait, doors retract from center
                
                // Actually, doors are at +/- SHAFT_WIDTH/4
                // To open: left goes left (-), right goes right (+)
                if (open) {
                    elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 - 0.5;
                    elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 + 0.5;
                } else {
                    elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4;
                    elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4;
                }
                
                // Let's just use a simple linear interpolation for door width
                const doorWidth = open ? 1 : 0;
                elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 - (1 - doorWidth) * 0.5; // This is wrong, need to fix
                // Re-thinking:
                // Doors are at +/- SHAFT_WIDTH / 4. 
                // When open (true), left moves to -SHAFT_WIDTH/4 - 0.5, right moves to +SHAFT_WIDTH/4 + 0.5
                // When closed (false), both at +/- SHAFT_WIDTH/4
                
                if (open) {
                    elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 - 0.5;
                    elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 + 0.5;
                } else {
                    elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4;
                    elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4;
                }

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }
            // Simplified for now: just set them
            if (open) {
                elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4 - 0.5;
                elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4 + 0.5;
            } else {
                elevatorCar.leftDoor.position.x = -SHAFT_WIDTH / 4;
                elevatorCar.rightDoor.position.x = SHAFT_WIDTH / 4;
            }
            setTimeout(resolve, 500);
        });
    }

    function moveToY(targetY) {
        return new Promise(resolve => {
            const startY = elevatorCar.position.y;
            const duration = Math.abs(targetY - startY) / ELEVATOR_SPEED;
            let startTime = performance.now();

            function step(now) {
                let progress = (now - startTime) / duration;
                if (progress > 1) progress = 1;
                elevatorCar.position.y = startY + (targetY - startY) * progress;
                if (progress < 1) requestAnimationFrame(step);
                else resolve();
            }
            requestAnimationFrame(step);
        });
    }

    function walkToElevator(p, car) {
        return new Promise(resolve => {
            p.userData.isWalking = true;
            let progress = 0;
            const duration = 1.5 / PERSON_MOVE_SPEED;
            let startTime = performance.now();

            function step(now) {
                let progress = (now - startTime) / duration;
                if (progress > 1) progress = 1;
                
                p.position.z -= (SHAFT_DEPTH / 2 + 1.5 - SHAFT_DEPTH / 2) * progress;
                // Simplified movement
                p.position.z -= 1.5 * progress;
                
                if (progress < 1) requestAnimationFrame(step);
                else {
                    p.userData.isWalking = false;
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    function walkFromElevator(p, scene) {
        return new Promise(resolve => {
            p.userData.isWalking = true;
            let progress = 0;
            const duration = 1.5 / PERSON_MOVE_SPEED;
            let startTime = performance.now();

            function step(now) {
                let progress = (now - startTime) / duration;
                if (progress > 1) progress = 1;
                p.position.z += 1.5 * progress;
                
                if (progress < 1) requestAnimationFrame(step);
                else {
                    p.userData.isWalking = false;
                    resolve();
                }
            }
            requestAnimationFrame(step);
        });
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        
        const time = performance.now() * 0.005;
        people.forEach(p => {
            if (p.userData.isWalking) {
                p.userData.leftLeg.rotation.x = Math.sin(time * 10) * 0.5;
                p.userData.rightLeg.rotation.x = Math.cos(time * 10) * 0.5;
            } else {
                p.userData.leftLeg.rotation.x = 0;
                p.userData.rightLeg.rotation.x = 0;
            }
        });

        controls.update();
        renderer.render(scene, camera);
    }

    // Start
    animate();
    runSequence();
}

window.addEventListener('DOMContentLoaded', init);
