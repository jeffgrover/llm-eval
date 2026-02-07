// Configuration constants
const FLOOR_HEIGHT = 4;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 20;
const BUILDING_DEPTH = 15;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 6;

const ELEVATOR_SPEED = 3;
const PERSON_MOVE_SPEED = 0.02;
const DOOR_DELAY = 300; // ms delay between door animation steps

// Elevator simulation state
let elevator = null;
let buildingGroup = null;
let people = [];
let emptyFloorIndex = -1;

// Animation control variables
let animationSpeed = 5;
let isAnimating = false;
let currentAnimationPromise = null;
let doorState = 'closed'; // 'open' or 'closed'

// Building creation function
function createBuilding() {
  const buildingGroup = new THREE.Group();
  
  // Ground floor (solid)
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: '#aaaaaa',
    side: THREE.DoubleSide,
    depthWrite: true
  });
  
  const groundGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, BUILDING_DEPTH);
  const groundFloor = new THREE.Mesh(groundGeometry, groundMaterial);
  groundFloor.position.y = -FLOOR_HEIGHT / 2;
  buildingGroup.add(groundFloor);
  
  // Create floors and walls
  for (let i = 1; i < FLOOR_COUNT; i++) {
    const floorY = -FLOOR_HEIGHT + i * FLOOR_HEIGHT;
    
    // Floor surface (transparent)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#cccccc',
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.2, BUILDING_DEPTH);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = floorY;
    buildingGroup.add(floor);
    
    // Semi-transparent walls with shaft cutout
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: '#9999ff',
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const wallThicknessX = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    const wallThicknessZ = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
    
    // Left wall
    const leftWallGeometry = new THREE.BoxGeometry(wallThicknessX, FLOOR_HEIGHT, BUILDING_DEPTH);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(
      -BUILDING_WIDTH/2 + wallThicknessX/2,
      floorY,
      0
    );
    buildingGroup.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    rightWall.position.set(
      BUILDING_WIDTH/2 - wallThicknessX/2,
      floorY,
      0
    );
    buildingGroup.add(rightWall);
    
    // Front wall
    const frontWallGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_HEIGHT, wallThicknessZ);
    const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    frontWall.position.set(
      0,
      floorY,
      BUILDING_DEPTH/2 - wallThicknessZ/2
    );
    buildingGroup.add(frontWall);
    
    // Back wall
    const backWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
    backWall.position.set(
      0,
      floorY,
      -BUILDING_DEPTH/2 + wallThicknessZ/2
    );
    buildingGroup.add(backWall);
    
    // Walls at corners
    const cornerWidth = (BUILDING_WIDTH - SHAFT_WIDTH) / 2;
    const cornerDepth = (BUILDING_DEPTH - SHAFT_DEPTH) / 2;
    
    // Front-left corner
    const frontLeftCornerGeometry = new THREE.BoxGeometry(cornerWidth, FLOOR_HEIGHT, cornerDepth);
    const frontLeftCorner = new THREE.Mesh(frontLeftCornerGeometry, wallMaterial);
    frontLeftCorner.position.set(
      -BUILDING_WIDTH/2 + cornerWidth/2,
      floorY,
      -BUILDING_DEPTH/2 + cornerDepth/2
    );
    buildingGroup.add(frontLeftCorner);
    
    // Front-right corner
    const frontRightCorner = new THREE.Mesh(frontLeftCornerGeometry, wallMaterial);
    frontRightCorner.position.set(
      BUILDING_WIDTH/2 - cornerWidth/2,
      floorY,
      -BUILDING_DEPTH/2 + cornerDepth/2
    );
    buildingGroup.add(frontRightCorner);
    
    // Back-left corner
    const backLeftCorner = new THREE.Mesh(frontLeftCornerGeometry, wallMaterial);
    backLeftCorner.position.set(
      -BUILDING_WIDTH/2 + cornerWidth/2,
      floorY,
      BUILDING_DEPTH/2 - cornerDepth/2
    );
    buildingGroup.add(backLeftCorner);
    
    // Back-right corner
    const backRightCorner = new THREE.Mesh(frontLeftCornerGeometry, wallMaterial);
    backRightCorner.position.set(
      BUILDING_WIDTH/2 - cornerWidth/2,
      floorY,
      BUILDING_DEPTH/2 - cornerDepth/2
    );
    buildingGroup.add(backRightCorner);
  }
  
  return buildingGroup;
}

// Elevator creation function
function createElevator() {
  const elevatorCar = new THREE.Group();
  
  // Back wall (solid)
  const backWallMaterial = new THREE.MeshStandardMaterial({
    color: '#ffff00',
    side: THREE.DoubleSide,
    depthWrite: true
  });
  
  const backWallGeometry = new THREE.BoxGeometry(3, 2.5, 1);
  const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
  backWall.position.set(0, 1.25, -0.75);
  elevatorCar.add(backWall);
  
  // Side walls (transparent)
  const sideWallMaterial = new THREE.MeshStandardMaterial({
    color: '#ffff00',
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  
  const leftWallGeometry = new THREE.BoxGeometry(1, 2.5, 3);
  const leftWall = new THREE.Mesh(leftWallGeometry, sideWallMaterial);
  leftWall.position.set(-1, 1.25, 0);
  elevatorCar.add(leftWall);
  
  // Right wall
  const rightWall = new THREE.Mesh(leftWallGeometry, sideWallMaterial);
  rightWall.position.set(1, 1.25, 0);
  elevatorCar.add(rightWall);
  
  // Floor inside elevator (solid)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#dddddd',
    side: THREE.DoubleSide,
    depthWrite: true
  });
  
  const floorGeometry = new THREE.BoxGeometry(3, 1, 3);
  const elevatorFloor = new THREE.Mesh(floorGeometry, floorMaterial);
  elevatorFloor.position.y = -0.5;
  elevatorCar.add(elevatorFloor);
  
  // Doors (darker yellow, opacity 0.7)
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: '#cccc00',
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  
  // Door geometry (1.5 wide x 2.5 high)
  const doorGeometry = new THREE.BoxGeometry(1.5, 2.5, 0.2);
  
  // Left door (initially at center position - will slide out)
  const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
  leftDoor.position.set(-0.75, 1.25, 0);
  elevatorCar.add(leftDoor);
  
  // Right door (initially at center position - will slide out)
  const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
  rightDoor.position.set(0.75, 1.25, 0);
  elevatorCar.add(rightDoor);
  
  // Mark the elevator car for animation access
  elevatorCar.userData = {
    leftDoor,
    rightDoor,
    doorsOpen: false,
    currentFloor: 0,
    floorIndex: 0
  };
  
  return elevatorCar;
}

// Create elevator group containing elevator + shaft
function createElevatorSystem() {
  const elevatorGroup = new THREE.Group();
  
  // Elevator car
  const elevatorCar = createElevator();
  elevatorGroup.add(elevatorCar);
  
  // Store references for animation access
  elevatorGroup.userData = {
    elevatorCar,
    doorsOpen: false,
    currentFloor: 0,
    floorIndex: 0
  };
  
  // Position at ground floor
  elevatorGroup.position.y = -FLOOR_HEIGHT + FLOOR_HEIGHT;
  
  return elevatorGroup;
}

// Main simulation setup
function initSimulation() {
  const scene = new THREE.Scene();
  
  // Create building
  buildingGroup = createBuilding();
  scene.add(buildingGroup);
  
  // Create elevator
  elevator = createElevatorSystem();
  scene.add(elevator);
  
  // Camera setup
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 100);
  camera.position.set(25, 25, 25);
  camera.lookAt(0, 0, 0);
  
  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // OrbitControls
  const controls = new THREE.OrbitControls(camera);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const pointLight = new THREE.PointLight(0xffffff, 1);
  pointLight.position.set(20, 30, 20);
  scene.add(pointLight);
  
  // Enable transparency rendering
  renderer.sortObjects = true;
  renderer.alpha = true;
  
  // Store reference to elevator for animation
  window.elevator = elevator;
  window.buildingGroup = buildingGroup;
  
  return { scene, camera, controls, renderer };
}

// Animation helper functions
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

// Wait for animation to complete
function waitForAnimation(endValue, currentValue, tolerance = 0.01) {
  return new Promise(resolve => {
    if (Math.abs(endValue - currentValue) < tolerance) {
      resolve();
    }
    
    const intervalId = setInterval(() => {
      if (Math.abs(endValue - currentValue) < tolerance) {
        clearInterval(intervalId);
        resolve();
      }
    }, 16);
    
    // Store cleanup function
    const cancel = () => clearInterval(intervalId);
    resolve(cancel);
  });
}

// Animate elevator movement
function animateElevatorMove(elevator, targetFloorIndex, durationMs) {
  return new Promise(resolve => {
    const startFloor = elevator.userData.floorIndex;
    const endFloor = targetFloorIndex;
    
    // Calculate target position
    const floorHeight = FLOOR_HEIGHT;
    const startY = -floorHeight + startFloor * floorHeight;
    const endY = -floorHeight + endFloor * floorHeight;
    
    let currentProgress = 0;
    
    const animateStep = () => {
      if (currentProgress >= 1) {
        // Animation complete
        elevator.userData.floorIndex = endFloor;
        resolve();
        return;
      }
      
      // Move elevator
      const progress = Math.min(currentProgress / 0.05, 1);
      elevator.position.y = startY + (endY - startY) * progress;
      
      currentProgress++;
      
      setTimeout(animateStep, 16);
    };
    
    animateStep();
  });
}

// Animate doors opening/closing
function animateDoor(elevatorCar, isOpening, durationMs = DOOR_DELAY) {
  return new Promise(resolve => {
    const leftDoor = elevatorCar.userData.leftDoor;
    const rightDoor = elevatorCar.userData.rightDoor;
    
    // Initial positions (centered)
    let leftPos = 0;
    let rightPos = 0;
    
    if (isOpening) {
      // Open doors - slide outward
      const targetLeft = -1.5;
      const targetRight = 1.5;
      
      let currentStep = 0;
      
      const animateStep = () => {
        if (currentStep >= durationMs / 16) {
          leftDoor.position.x = -1.5;
          rightDoor.position.x = 1.5;
          resolve();
          return;
        }
        
        // Move doors outward
        leftPos += 0.1;
        rightPos -= 0.1;
        
        leftDoor.position.x = -1.5 + 0.1 * (currentStep > 0 ? 1 : 0);
        rightDoor.position.x = 1.5 - 0.1 * (currentStep > 0 ? 1 : 0);
        
        currentStep++;
        setTimeout(animateStep, 16);
      };
      
      animateStep();
    } else {
      // Close doors - slide inward
      const targetLeft = 0;
      const targetRight = 0;
      
      let currentStep = 0;
      
      const animateStep = () => {
        if (currentStep >= durationMs / 16) {
          leftDoor.position.x = 0;
          rightDoor.position.x = 0;
          resolve();
          return;
        }
        
        // Move doors inward
        leftPos += 0.1;
        rightPos -= 0.1;
        
        leftDoor.position.x = -0.75 + 0.1 * (currentStep > 0 ? 1 : 0);
        rightDoor.position.x = 0.75 - 0.1 * (currentStep > 0 ? 1 : 0);
        
        currentStep++;
        setTimeout(animateStep, 16);
      };
      
      animateStep();
    }
  });
}

// Check if person should board elevator based on door state
function canBoard(elevator) {
  return elevator.userData.doorsOpen;
}

// Animate people walking with leg movement
function animateWalking(person, durationMs = 300) {
  return new Promise(resolve => {
    let startTime = Date.now();
    
    const animateStep = () => {
      if (Date.now() - startTime > durationMs) {
        resolve();
        return;
      }
      
      // Animate legs
      const phase = (Date.now() % 1000) / 1000; // 1 second cycle
      
      // Left leg swing
      const leftLegAngle = Math.sin(phase * Math.PI) * 0.5;
      person.userData.leftLeg.rotation.x = leftLegAngle;
      
      // Right leg swing (opposite phase)
      const rightLegAngle = Math.sin((phase + 0.5) * Math.PI) * 0.5;
      person.userData.rightLeg.rotation.x = rightLegAngle;
      
      setTimeout(animateStep, 16);
    };
    
    animateStep();
  });
}

// Main function to run simulation
async function startSimulation() {
  const { scene, camera, controls, renderer } = initSimulation();
  
  // Initialize people on floors (except ground floor)
  for (let i = 1; i < FLOOR_COUNT; i++) {
    const person = createPerson();
    
    // Position person in front of elevator doors
    const xPos = 6 + Math.random() * 2;
    const zPos = 5;
    
    person.position.set(xPos, -FLOOR_HEIGHT + i * FLOOR_HEIGHT, zPos);
    
    // Rotate to face elevator (180 degrees)
    person.rotation.y = Math.PI;
    
    scene.add(person);
    people.push({ person, floorIndex: i });
    
    // Person is currently waiting outside
  }
  
  let currentPersonIndex = 0;
  let emptyFloorIndex = -1;
  
  // Simulation loop
  const animate = () => {
    requestAnimationFrame(animate);
    
    if (currentAnimationPromise) {
      currentAnimationPromise();
    }
    
    renderer.render(scene, camera);
  };
  
  animate();
}

// Export functions for browser usage
if (typeof window !== 'undefined') {
  window.elevatorSimulation = function() {
    // Initialize when called
    initSimulation();
  };
}
