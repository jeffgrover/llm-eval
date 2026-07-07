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
let floorOccupied = [true, true, true, true, true, true];
let currentFloor = 0;
let targetFloor = 0;
let doorState = 'closed';
let animationSpeed = 1;
let isMoving = false;

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
    
    createPeople();
    
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        updatePeople();
        updateElevator();
        renderer.render(scene, camera);
    }
    animate();
    
    selectNextPerson();
}

function createBuilding() {
    const floorMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const wallMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x9999ff, 
        transparent: true, 
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH),
            floorMaterial
        );
        floor.position.set(0, i * FLOOR_HEIGHT, 0);
        scene.add(floor);
        
        const wallFront = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5),
            wallMaterial
        );
        wallFront.position.set(0, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, BUILDING_DEPTH / 2);
        scene.add(wallFront);
        
        const wallBack = new THREE.Mesh(
            new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, 0.5),
            wallMaterial
        );
        wallBack.position.set(0, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, -BUILDING_DEPTH / 2);
        scene.add(wallBack);
        
        const wallLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        wallLeft.position.set(-BUILDING_WIDTH / 2, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, 0);
        scene.add(wallLeft);
        
        const wallRight = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, FLOOR_HEIGHT, BUILDING_DEPTH),
            wallMaterial
        );
        wallRight.position.set(BUILDING_WIDTH / 2, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, 0);
        scene.add(wallRight);
    }
    
    const ground = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH),
        new THREE.MeshPhongMaterial({ color: 0x333333 })
    );
    ground.position.set(0, -0.25, 0);
    scene.add(ground);
    
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH),
        new THREE.MeshPhongMaterial({ color: 0x333333 })
    );
    roof.position.set(0, FLOOR_COUNT * FLOOR_HEIGHT + 0.25, 0);
    scene.add(roof);
}

function createElevatorCar() {
    const elevatorCar = new THREE.Group();
    
    const frameMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const doorMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xcccc00, 
        transparent: true, 
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH, 2.5, SHAFT_DEPTH),
        frameMaterial
    );
    backWall.position.set(0, 1.25, SHAFT_DEPTH / 2);
    elevatorCar.add(backWall);
    
    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH / 2, 2.5, 0.1),
        doorMaterial
    );
    leftDoor.position.set(-SHAFT_WIDTH / 4, 1.25, SHAFT_DEPTH / 2);
    elevatorCar.add(leftDoor);
    
    const rightDoor = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_WIDTH / 2, 2.5, 0.1),
        doorMaterial
    );
    rightDoor.position.set(SHAFT_WIDTH / 4, 1.25, SHAFT_DEPTH / 2);
    elevatorCar.add(rightDoor);
    
    const leftSide = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2.5, SHAFT_DEPTH),
        frameMaterial
    );
    leftSide.position.set(-SHAFT_WIDTH / 2, 1.25, 0);
    elevatorCar.add(leftSide);
    
    const rightSide = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2.5, SHAFT_DEPTH),
        frameMaterial
    );
    rightSide.position.set(SHAFT_WIDTH / 2, 1.25, 0);
    elevatorCar.add(rightSide);
    
    elevatorCar.leftDoor = leftDoor;
    elevatorCar.rightDoor = rightDoor;
    
    elevatorCar.position.set(0, 0, SHAFT_DEPTH / 2);
    
    return elevatorCar;
}

function createPeople() {
    for (let i = 0; i < FLOOR_COUNT; i++) {
        const person = createPerson(i * FLOOR_HEIGHT);
        person.position.set(0, i * FLOOR_HEIGHT, BUILDING_DEPTH / 2 + 0.5);
        scene.add(person);
        people.push(person);
        floorOccupied[i] = true;
    }
}

function updatePeople() {
    people.forEach((person, index) => {
        if (person.userData.isWalking) {
            const walkSpeed = PERSON_MOVE_SPEED * animationSpeed;
            person.userData.leftLeg.rotation.x = Math.sin(Date.now() * 0.01 * animationSpeed) * 0.5;
            person.userData.rightLeg.rotation.x = Math.sin(Date.now() * 0.01 * animationSpeed + Math.PI) * 0.5;
        } else {
            person.userData.leftLeg.rotation.x = 0;
            person.userData.rightLeg.rotation.x = 0;
        }
    });
}

function updateElevator() {
    if (elevatorCar) {
        if (doorState === 'opening') {
            const openSpeed = 0.05 * animationSpeed;
            elevatorCar.leftDoor.position.x += openSpeed;
            elevatorCar.rightDoor.position.x -= openSpeed;
            
            if (Math.abs(elevatorCar.leftDoor.position.x) >= SHAFT_WIDTH / 4) {
                doorState = 'open';
            }
        } else if (doorState === 'closing') {
            const closeSpeed = 0.05 * animationSpeed;
            elevatorCar.leftDoor.position.x -= closeSpeed;
            elevatorCar.rightDoor.position.x += closeSpeed;
            
            if (Math.abs(elevatorCar.leftDoor.position.x) <= 0.1) {
                doorState = 'closed';
            }
        }
    }
}

function selectNextPerson() {
    const emptyFloors = [];
    for (let i = 0; i < FLOOR_COUNT; i++) {
        if (!floorOccupied[i]) {
            emptyFloors.push(i);
        }
    }
    
    if (emptyFloors.length > 0) {
        const target = emptyFloors[Math.floor(Math.random() * emptyFloors.length)];
        
        const personIndex = people.findIndex((person, index) => {
            const personFloor = Math.round(person.position.y / FLOOR_HEIGHT);
            return personFloor === currentFloor && floorOccupied[index];
        });
        
        if (personIndex !== -1 && floorOccupied[target]) {
            currentFloor = target;
            targetFloor = people.findIndex((person, index) => floorOccupied[index] && index !== personIndex);
            
            if (targetFloor !== -1) {
                moveElevator();
            }
        }
    }
}

function moveElevator() {
    if (elevatorCar.position.y === currentFloor * FLOOR_HEIGHT) {
        doorState = 'opening';
        
        setTimeout(() => {
            const personIndex = people.findIndex((person, index) => {
                const personFloor = Math.round(person.position.y / FLOOR_HEIGHT);
                return personFloor === currentFloor && floorOccupied[index];
            });
            
            if (personIndex !== -1) {
                const person = people[personIndex];
                person.userData.isWalking = true;
                
                setTimeout(() => {
                    scene.attach(person);
                    elevatorCar.attach(person);
                    person.userData.isWalking = false;
                    floorOccupied[personIndex] = false;
                    
                    setTimeout(() => {
                        doorState = 'closing';
                        
                        setTimeout(() => {
                            elevatorCar.position.y = targetFloor * FLOOR_HEIGHT;
                            currentFloor = targetFloor;
                            
                            setTimeout(() => {
                                doorState = 'opening';
                                
                                setTimeout(() => {
                                    const personIndex = people.findIndex((person, index) => {
                                        const personFloor = Math.round(person.position.y / FLOOR_HEIGHT);
                                        return personFloor === currentFloor && floorOccupied[index];
                                    });
                                    
                                    if (personIndex !== -1) {
                                        const person = people[personIndex];
                                        person.userData.isWalking = true;
                                        
                                        setTimeout(() => {
                                            scene.attach(person);
                                            person.userData.isWalking = false;
                                            person.position.set(0, currentFloor * FLOOR_HEIGHT, BUILDING_DEPTH / 2 + 0.5);
                                            floorOccupied[personIndex] = true;
                                            
                                            setTimeout(() => {
                                                doorState = 'closing';
                                                
                                                setTimeout(() => {
                                                    selectNextPerson();
                                                }, 300);
                                            }, 300);
                                        }, 300);
                                    }
                                }, 300);
                            }, 300);
                        }, 300);
                    }, 300);
                }, 300);
            }
        }, 300);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startSimulation);
} else {
    startSimulation();
}