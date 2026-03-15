// elevator.js
// Main simulation logic for the 3D elevator
// No build steps – pure global script using Three.js from CDN

(function(){
  if (typeof THREE === 'undefined') {
    console.error('THREE not loaded before elevator.js');
    return;
  }

  // ------------------------------------------------------------
  // Constants (configurable)
  // ------------------------------------------------------------
  const FLOOR_COUNT = 6;
  const FLOOR_HEIGHT = 4; // distance between floor centers
  const BUILDING_WIDTH = 20;
  const BUILDING_DEPTH = 20;
  const SHAFT_WIDTH = 4;
  const SHAFT_DEPTH = 4;
  const ELEVATOR_SPEED = 2; // units per second (vertical)
  const PERSON_MOVE_SPEED = 2; // units per second (horizontal)

  // ------------------------------------------------------------
  // Three.js setup
  // ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.sortObjects = true; // proper depth sorting for transparency
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.set(25, 25, 25);
  camera.lookAt(new THREE.Vector3(0, FLOOR_HEIGHT * (FLOOR_COUNT-1)/2, 0));

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Light
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(30, 50, 30);
  scene.add(dirLight);

  // ------------------------------------------------------------
  // Helper material creator for transparent objects
  // ------------------------------------------------------------
  function createMaterial(color, opacity, doubleSide=true){
    return new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  // ------------------------------------------------------------
  // Building creation
  // ------------------------------------------------------------
  const building = new THREE.Group();
  building.renderOrder = 0;

  // Floors (transparent except ground)
  for (let i = 0; i < FLOOR_COUNT; i++) {
    const y = i * FLOOR_HEIGHT;
    const opacity = i === 0 ? 1.0 : 0.3; // ground solid
    const floorMat = createMaterial(0xcccccc, opacity);
    const floorGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.position.y = y;
    floor.renderOrder = 0;
    building.add(floor);
  }

  // Walls (semi-transparent)
  const wallMat = createMaterial(0x9999ff, 0.2);
  const halfW = BUILDING_WIDTH/2;
  const halfD = BUILDING_DEPTH/2;
  const wallHeight = FLOOR_HEIGHT * FLOOR_COUNT;
  // Front wall (positive Z)
  const frontWallGeo = new THREE.BoxGeometry(BUILDING_WIDTH, wallHeight, 0.2);
  const frontWall = new THREE.Mesh(frontWallGeo, wallMat);
  frontWall.position.set(0, wallHeight/2 - FLOOR_HEIGHT/2, halfD);
  building.add(frontWall);
  // Back wall
  const backWall = frontWall.clone();
  backWall.position.z = -halfD;
  building.add(backWall);
  // Left wall
  const sideWallGeo = new THREE.BoxGeometry(0.2, wallHeight, BUILDING_DEPTH);
  const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
  leftWall.position.set(-halfW, wallHeight/2 - FLOOR_HEIGHT/2, 0);
  building.add(leftWall);
  // Right wall
  const rightWall = leftWall.clone();
  rightWall.position.x = halfW;
  building.add(rightWall);

  // Roof (solid top)
  const roofMat = new THREE.MeshPhongMaterial({color: 0xcccccc});
  const roofGeo = new THREE.PlaneGeometry(BUILDING_WIDTH, BUILDING_DEPTH);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.x = Math.PI/2;
  roof.position.y = (FLOOR_COUNT-1) * FLOOR_HEIGHT + 0.01; // slight offset
  building.add(roof);

  scene.add(building);

  // ------------------------------------------------------------
  // Elevator creation
  // ------------------------------------------------------------
  const elevatorCar = new THREE.Group();
  elevatorCar.renderOrder = 1;

  // Frame (transparent yellow)
  const frameMat = createMaterial(0xffff00, 0.5);
  const frameGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT*0.9, SHAFT_DEPTH);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.y = FLOOR_HEIGHT/2; // start at ground floor center height
  elevatorCar.add(frame);

  // Back wall (solid)
  const backWallMat = new THREE.MeshPhongMaterial({color: 0x9999ff});
  const backWallElevGeo = new THREE.BoxGeometry(SHAFT_WIDTH, FLOOR_HEIGHT*0.9, 0.1);
  const backWallElev = new THREE.Mesh(backWallElevGeo, backWallMat);
  backWallElev.position.set(0, FLOOR_HEIGHT/2, -SHAFT_DEPTH/2 + 0.05);
  elevatorCar.add(backWallElev);

  // Side walls (transparent)
  const sideWallElevMat = createMaterial(0x9999ff, 0.2);
  const sideWallElevGeo = new THREE.BoxGeometry(0.1, FLOOR_HEIGHT*0.9, SHAFT_DEPTH);
  const leftSideElev = new THREE.Mesh(sideWallElevGeo, sideWallElevMat);
  leftSideElev.position.set(-SHAFT_WIDTH/2 + 0.05, FLOOR_HEIGHT/2, 0);
  const rightSideElev = leftSideElev.clone();
  rightSideElev.position.x = SHAFT_WIDTH/2 - 0.05;
  elevatorCar.add(leftSideElev);
  elevatorCar.add(rightSideElev);

  // Doors (two sliding halves)
  const doorMat = createMaterial(0xcccc00, 0.7);
  const doorWidth = SHAFT_WIDTH/2 - 0.05;
  const doorHeight = FLOOR_HEIGHT*0.85;
  const doorDepth = 0.2;
  const leftDoorGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth);
  const rightDoorGeo = leftDoorGeo.clone();
  const leftDoor = new THREE.Mesh(leftDoorGeo, doorMat);
  const rightDoor = new THREE.Mesh(rightDoorGeo, doorMat);
  // initial closed position (centered)
  leftDoor.position.set(-doorWidth/2, FLOOR_HEIGHT/2, SHAFT_DEPTH/2 - doorDepth/2);
  rightDoor.position.set(doorWidth/2, FLOOR_HEIGHT/2, SHAFT_DEPTH/2 - doorDepth/2);
  elevatorCar.add(leftDoor);
  elevatorCar.add(rightDoor);

  // Store doors on elevatorCar for easy access
  elevatorCar.userData = {
    doors: {left: leftDoor, right: rightDoor},
    doorOpen: false,
    moving: false,
    currentFloor: 0
  };

  // Position shaft at building centre
  elevatorCar.position.set(0, 0, 0);
  scene.add(elevatorCar);

  // ------------------------------------------------------------
  // Slider for speed control (1x-20x)
  // ------------------------------------------------------------
  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '1';
  speedSlider.max = '20';
  speedSlider.value = '1';
  speedSlider.style.position = 'absolute';
  speedSlider.style.top = '10px';
  speedSlider.style.left = '10px';
  speedSlider.title = 'Animation speed multiplier';
  document.body.appendChild(speedSlider);

  const speedLabel = document.createElement('div');
  speedLabel.style.position = 'absolute';
  speedLabel.style.top = '35px';
  speedLabel.style.left = '10px';
  speedLabel.style.color = '#fff';
  speedLabel.style.fontFamily = 'sans-serif';
  speedLabel.innerText = 'Speed: 1x';
  document.body.appendChild(speedLabel);
  speedSlider.addEventListener('input',()=>{
    speedLabel.innerText = `Speed: ${speedSlider.value}x`;
  });

  // ------------------------------------------------------------
  // Utility animation helpers (Promise based)
  // ------------------------------------------------------------
  function animateProperty(object, prop, to, duration){
    return new Promise(resolve=>{
      const from = object[prop];
      const start = performance.now();
      function step(now){
        const elapsed = (now - start) / 1000; // seconds
        const t = Math.min(elapsed / duration, 1);
        object[prop] = from + (to - from) * t;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function moveElevatorToFloor(targetFloor){
    const distance = Math.abs(targetFloor - elevatorCar.userData.currentFloor) * FLOOR_HEIGHT;
    const speed = ELEVATOR_SPEED * (speedSlider.value/1);
    const duration = distance / speed;
    // animate group position.y
    return animateProperty(elevatorCar.position, 'y', targetFloor * FLOOR_HEIGHT, duration).then(()=>{
      elevatorCar.userData.currentFloor = targetFloor;
    });
  }

  function openDoors(){
    if (elevatorCar.userData.doorOpen) return Promise.resolve();
    const left = elevatorCar.userData.doors.left;
    const right = elevatorCar.userData.doors.right;
    const slideDist = doorWidth; // move each half outward by its width
    const speed = ELEVATOR_SPEED * (speedSlider.value);
    const duration = slideDist / speed;
    const promises = [];
    promises.push(animateProperty(left.position, 'x', left.position.x - slideDist, duration));
    promises.push(animateProperty(right.position, 'x', right.position.x + slideDist, duration));
    return Promise.all(promises).then(()=>{ elevatorCar.userData.doorOpen = true; });
  }

  function closeDoors(){
    if (!elevatorCar.userData.doorOpen) return Promise.resolve();
    const left = elevatorCar.userData.doors.left;
    const right = elevatorCar.userData.doors.right;
    const slideDist = doorWidth; // return to center
    const speed = ELEVATOR_SPEED * (speedSlider.value);
    const duration = slideDist / speed;
    const promises = [];
    promises.push(animateProperty(left.position, 'x', left.position.x + slideDist, duration));
    promises.push(animateProperty(right.position, 'x', right.position.x - slideDist, duration));
    return Promise.all(promises).then(()=>{ elevatorCar.userData.doorOpen = false; });
  }

  // Person walking animation (forward along Z, legs swing)
  function walkPerson(person, distance){
    const speed = PERSON_MOVE_SPEED * (speedSlider.value);
    const duration = distance / speed;
    const startZ = person.position.z;
    const targetZ = startZ + distance;
    const legSwingAmplitude = Math.PI/6; // 30 degrees
    const legSwingFreq = 4; // swings per second
    return new Promise(resolve=>{
      const start = performance.now();
      function step(now){
        const elapsed = (now - start) / 1000;
        const t = Math.min(elapsed / duration, 1);
        person.position.z = startZ + (targetZ - startZ) * t;
        // swing legs
        const phase = elapsed * legSwingFreq * Math.PI * 2;
        const angle = Math.sin(phase) * legSwingAmplitude;
        person.userData.legs[0].rotation.x = angle; // left leg
        person.userData.legs[1].rotation.x = -angle; // right leg opposite
        if (t < 1) requestAnimationFrame(step);
        else {
          // reset leg rotation
          person.userData.legs.forEach(l=>l.rotation.x = 0);
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------
  // Floor management & simulation loop
  // ------------------------------------------------------------
  const floorPersons = new Array(FLOOR_COUNT).fill(null);
  const floorPositions = [];
  for (let i=0;i<FLOOR_COUNT;i++){
    // waiting spot in front of elevator (positive Z axis)
    floorPositions[i] = new THREE.Vector3(0, i*FLOOR_HEIGHT + 0.01, SHAFT_DEPTH/2 + 2);
  }

  // Initialize one person on each floor except floor 0 (ground) which stays empty initially
  for (let i=1;i<FLOOR_COUNT;i++){
    const person = createPerson();
    person.position.copy(floorPositions[i]);
    // Face elevator (rotate 180 degrees around Y)
    person.rotation.y = Math.PI;
    scene.add(person);
    floorPersons[i] = person;
  }

  // Ensure one floor stays empty; we start with floor 0 empty.

  // Main simulation step
  async function simulationStep(){
    // Find occupied floor(s) and empty floor(s)
    const occupiedFloors = [];
    const emptyFloors = [];
    for (let i=0;i<FLOOR_COUNT;i++){
      if (floorPersons[i]) occupiedFloors.push(i);
      else emptyFloors.push(i);
    }
    // Randomly pick a person to move
    const fromFloor = occupiedFloors[Math.floor(Math.random()*occupiedFloors.length)];
    const toFloor = emptyFloors[Math.floor(Math.random()*emptyFloors.length)];
    const person = floorPersons[fromFloor];

    // Sequence:
    // 1. Elevator moves to pickup floor
    await moveElevatorToFloor(fromFloor);
    await new Promise(r=>setTimeout(r, 300)); // brief pause
    // 2. Doors open
    await openDoors();
    await new Promise(r=>setTimeout(r, 300));
    // 3. Person walks forward into elevator (distance = - (SHAFT_DEPTH/2 + 2) )
    const walkDist = -(SHAFT_DEPTH/2 + 2);
    await walkPerson(person, walkDist);
    // attach to elevator
    elevatorCar.add(person);
    // Adjust local position relative to elevator (so it stays inside)
    person.position.set(0, 0.01, 0);
    // 4. Doors close
    await closeDoors();
    await new Promise(r=>setTimeout(r, 300));
    // 5. Elevator travels to destination floor
    await moveElevatorToFloor(toFloor);
    await new Promise(r=>setTimeout(r, 300));
    // 6. Doors open
    await openDoors();
    await new Promise(r=>setTimeout(r, 300));
    // 7. Person walks out to waiting spot (positive Z)
    // Detach from elevator first
    scene.add(person);
    // Set world position to elevator interior before walking
    const worldPos = new THREE.Vector3();
    person.getWorldPosition(worldPos);
    person.position.copy(worldPos);
    // Walk forward (same distance as before but opposite direction)
    await walkPerson(person, -walkDist);
    // Update floor tracking
    floorPersons[fromFloor] = null;
    floorPersons[toFloor] = person;
    // Ensure person stands at waiting spot
    person.position.copy(floorPositions[toFloor]);
    // 8. Doors close
    await closeDoors();
    await new Promise(r=>setTimeout(r, 300));
  }

  // Run simulation continuously
  async function runSimulation(){
    while(true){
      await simulationStep();
      await new Promise(r=>setTimeout(r, 1000)); // pause between moves
    }
  }

  runSimulation();

  // ------------------------------------------------------------
  // Render loop
  // ------------------------------------------------------------
  function animate(){
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Handle resize
  window.addEventListener('resize',()=>{
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w,h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  });
})();
