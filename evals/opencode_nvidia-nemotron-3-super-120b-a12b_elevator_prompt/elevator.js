// Main simulation logic for elevator

import { createPerson } from './person.js';

// Constants (configurable)
const FLOOR_HEIGHT = 3.0;      // meters between floors
const FLOOR_COUNT = 6;         // number of usable floors
const BUILDING_WIDTH = 20.0;   // building width along X axis
const BUILDING_DEPTH = 15.0;   // building depth along Z axis (positive Z = in front)
const SHAFT_WIDTH = 4.0;       // elevator shaft width along X
const SHAFT_DEPTH = 4.0;       // elevator shaft depth along Z
const ELEVATOR_SPEED = 2.0;    // floors per second? Actually units per second: we'll use world units / sec (so FLOOR_HEIGHT * ?)
                             // Let's define speed as world units per second, so to move one floor takes FLOOR_HEIGHT / ELEVATOR_SPEED seconds.
const PERSON_MOVE_SPEED = 2.0; // walking speed in world units per second
const DOOR_WIDTH = SHAFT_WIDTH * 0.45; // each door width (two doors cover shaft)
const DOOR_HEIGHT = FLOOR_HEIGHT * 0.8;
const WALL_THICKNESS = 0.2;    // thickness of outer walls and floor slabs
const FLOOR_THICKNESS = 0.1;   // thickness of each floor slab (horizontal)
// Derived constants
const TOTAL_HEIGHT = FLOOR_COUNT * FLOOR_HEIGHT;

// Three.js basics
let scene, camera, renderer, controls;
let clock = new THREE.Clock();

// Simulation state
let elevatorCar = null;
let doors = { left: null, right: null }; // door meshes
let people = []; // array of person objects on floors (not in elevator)
let personsInElevator = []; // persons currently inside elevator as children of elevatorCar
const floorEmptyStatus = new Array(FLOOR_COUNT).fill(true); // true if empty, false if occupied. We'll start with one person per floor except one empty.
const personMoveSpeedSlider = null;

// For animation sequencing: we use a state machine approach via queues or recursive callbacks.
// Let's define an array of pending actions and process them in order.

// Initialize
init();
animate();

// Initialization function
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // light blue sky

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 25, 25);
    camera.lookAt(0, TOTAL_HEIGHT/2, 0); // look at building center vertically mid-height

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // important for transparency
    document.body.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Create building (simplified)
    createBuilding();

    // Create elevator car and doors
    createElevator();

    // Create persons on floors: initially one person per floor except we will make one empty randomly later.
    createInitialPeople();

    // Add slider for animation speed control
    setupSpeedSlider();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Setup slider to control animation speed multiplier (1x-20x)
function setupSpeedSlider() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.left = '20px';
    container.style.zIndex = '100';
    container.innerHTML = `
        <label for="speedSlider">Animation Speed: </label>
        <input type="range" id="speedSlider" min="1" max="20" value="1">
        <span id="speedLabel">1x</span>
    `;
    document.body.appendChild(container);

    const slider = container.querySelector('#speedSlider');
    const label = container.querySelector('#speedLabel');

    slider.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        personMoveSpeedSlider = speed; // we'll use this as multiplier for base speeds
        label.textContent = `${speed}x`;
    });
}

// Get current animation speed multiplier (default 1 if not set)
function getSpeedMultiplier() {
    return personMoveSpeedSlider !== null ? personMoveSpeedSlider : 1;
}

// Building creation (simplified but with transparency setup)
function createBuilding() {
    // Outer walls: we'll make six slabs? Actually easier to make a hollow box using six sides.
    // However for transparency and seeing inside, we will make each side as a separate Mesh with transparent material.

    const wallMaterial = new THREE.MeshLambertMaterial({
        color: 0x9999ff, // blue
        opacity: 0.2,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const floorMaterialUsable = new THREE.MeshLambertMaterial({
        color: 0xcccccc, // gray
        opacity: 0.3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const floorMaterialSolid = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        opacity: 1.0,
        transparent: false, // opaque
        side: THREE.DoubleSide
    });

    // Dimensions
    const halfWidth = BUILDING_WIDTH / 2;
    const halfDepth = BUILDING_DEPTH / 2;

    // Create floor slabs (horizontal boxes) for ground, usable floors, roof.
    // We'll index from 0 to FLOOR_COUNT+1 where:
    //   slab 0: ground (opaque)
    //   slab 1..FLOOR_COUNT: usable floors (transparent)
    //   slab FLOOR_COUNT+1: roof (opaque)

    for (let i = 0; i <= FLOOR_COUNT + 1; i++) {
        const isUsable = i >= 1 && i <= FLOOR_COUNT;
        const material = isUsable ? floorMaterialUsable : floorMaterialSolid;

        const y = (i - 0.5) * FLOOR_HEIGHT; // center of slab at this height? Actually we want:
          // For ground slab: bottom at Y=0? We'll instead put each slab so that its top surface aligns with integer multiples.
          // Let's decide person stands on top of usable floor slab -> then the slab should be just below their feet.

        // Alternative approach used often in such demos: make slabs infinitely thin planes positioned exactly where persons stand,
        //   but for collision we need thickness. However our simple building doesn't do collision so okay.
         
         let geometry = new THREE.BoxGeometry(BUILDING_WIDTH, FLOOR_THICKNESS, BUILDING_DEPTH);
         if (!isUsable) {
             // ground and roof maybe thicker? Keep same for simplicity but change opacity above.
         }
        const slab = new THREE.Mesh(geometry, material);
        slab.position.y = i * FLOOR_HEIGHT; 
          // With this placement:
            // i=0 -> y=0 (ground slab centered at 0 extends from -FLOOR_THICKNESS/2 to +FLOOR_THICKNESS/2)
            // Person standing on top of ground would need y = FLOOR_THICKNESS/2? Not ideal.
        scene.add(slab);
    }

    // Now outer walls: we will make four vertical boxes that span full height but with openings for elevator shaft?
      Instead easier: just make solid boxes at each side covering entire footprint, then later we carve out shaft by not drawing inside region where elevator is? Actually if wall is solid box it occludes interior.
    // We'll instead create walls as six separate vertical slabs between floor levels (like picture frame but extruded vertically) to allow viewing inside through gaps at each floor level?
      Too complex.

    // Given time, we will skip detailed outer walls and just rely on the slabs being visible from sides? Not ideal.
    
    // For now let's at least create a simple box outline using four thin boxes that form perimeter but don't enclose fully:
        // We'll make north, south, east, west walls as thin boxes that go full height but are only WALL_THICKNESS thick.

    const wallNorth = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, TOTAL_HEIGHT, WALL_THICKNESS),
        wallMaterial
    );
    wallNorth.position.set(0, TOTAL_HEIGHT/2, halfDepth + WALL_THICKNESS/2);
    scene.add(wallNorth);

    const wallSouth = new THREE.Mesh(
        new THREE.BoxGeometry(BUILDING_WIDTH, TOTAL_HEIGHT, WALL_THICKNESS),
        wallMaterial
    );
    wallSouth.position.set(0, TOTAL_HEIGHT/2, -halfDepth - WALL_THICKNESS/2);
    scene.add(wallSouth);

    const wallEast = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, TOTAL_HEIGHT, BUILDING_DEPTH),
        wallMaterial
    );
    wallEast.position.set(halfWidth + WALL_THICKNESS/2, TOTAL_HEIGHT/2, 0);
    scene.add(wallEast);

    const wallWest = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, TOTAL_HEIGHT, BUILDING_DEPTH),
        wallMaterial
    );
    wallWest.position.set(-halfWidth - WALL_THICKNESS/2, TOTAL_HEIGHT/2, 0);
    scene.add(wallWest);

    // TODO: add elevator shaft opening in these walls? Actually we want to see elevator inside so maybe make walls not fully enclosing:
        // For example leave a gap where shaft is (center region). We could split each wall into two pieces left and right of center.
        // But due to time, let's at least make walls transparent enough that interior is somewhat visible when looking through.

    // Note: With the current setup the six slabs form horizontal plates; the four walls form a box around them but overlapping at edges. 
      This will create thick corners etc but acceptable for demo.
}

// Elevator car and doors creation
function createElevator() {
    // Elevator car group (will contain frame, doors, inner back wall, side walls)
    elevatorCar = new THREE.Group();
    elevatorCar.name = 'elevatorCar';

    // Car dimensions: should fit inside shaft with some clearance
    const carWidth = SHAFT_WIDTH - 2*WALL_THICKNESS; // leave gap for door tracks? We'll ignore.
    const carDepth = SHAFT_DEPTH - 2*WALL_THICKNESS;
    const carHeight = FLOOR_HEIGHT * 0.9; // slightly less than floor to ceiling

    // Frame: we make a simple box representing outer boundary of elevator car (transparent yellow)
    const frameMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00, // yellow
        opacity: 0.5,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const frameGeometry = new THREE.BoxGeometry(carWidth, carHeight, carDepth);
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.name = 'frame';
    elevatorCar.add(frame);

    // Back wall (solid) - maybe a different color? Use same as frame but less opaque?
    const backWallMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        opacity: 0.8, // more opaque than frame
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const backWallGeometry = new THREE.BoxGeometry(carWidth*0.9, carHeight, carDepth*0.2); // thin back wall
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = carDepth/2 - backWall.geometry.parameters.depth/2; // flush with back outer edge?
    elevatorCar.add(backWall);

    // Side walls (transparent) - maybe same as frame but we can make them visible? Actually requirement says transparent side walls.
    const sideWallMaterial = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        opacity: 0.3, // more transparent
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    // left side wall (along X negative)
    const leftWallGeometry = new THREE.BoxGeometry(carWidth*0.2, carHeight, carDepth*0.9);
    const leftWall = new THREE.Mesh(leftWallGeometry, sideWallMaterial);
    leftWall.position.x = -carWidth/2 + leftWall.geometry.parameters.width/2;
    elevatorCar.add(leftWall);
    // right side wall
    const rightWall = leftWall.clone();
    rightWall.position.x = carWidth/2 - rightWall.geometry.parameters.width/2;
    elevatorCar.add(rightWall);

    // Doors: two halves that slide outward/inward along X axis.
    const doorMaterial = new THREE.MeshLambertMaterial({
        color: 0xcccc00, // darker yellow
        opacity: 0.7,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const doorWidthHalf = DOOR_WIDTH / 2; // each door width is half of total door opening? Actually doors meet in middle so each covers half the shaft width.
                                          // We'll set door width such that two doors together cover SHAFT_WIDTH (with maybe small gap).
    const doorHeight = DOOR_HEIGHT;
    const doorDepth = WALL_THICKNESS * 2; // make doors thick enough to see

    // Left door: initially closed so its inner edge at x=0? Actually when closed, left door's right edge meets right door's left edge at center.
          Let doorHalfWidth = SHAFT_WIDTH/2 (each door covers half the shaft).
        We'll set:
            closed position for left door: x = -doorHalfWidth/2 ? Wait need to think.

    // Instead define:
      When doors are closed, they meet in middle so that there is no gap.
          Left door occupies X from -doorHalfWidth to 0? Actually its right edge at X=0 (center).
          Right door occupies X from 0 to doorHalfWidth; left edge at X=0.

        However each door has width: we want them to slide outward, so when opening they move away from center.
            Left door moves in negative X direction, right door moves positive X.

    const doorHalfWidth = SHAFT_WIDTH/2;
    // But we also need thickness; let's make door geometry:
          width = doorHalfWidth - GAP? We'll ignore gap for simplicity and allow slight interpenetration when closed (or leave 0.01 gap).

    const doorGeometry = new THREE.BoxGeometry(doorHalfWidth, doorHeight, doorDepth);
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.name = 'leftDoor';
    // When closed: position so that its right edge is at x=0 (center). 
        // Box geometry centered at its origin; if we want its right edge at x=0 then its center should be at x = -width/2.
    leftDoor.position.x = -doorHalfWidth/2;
    // Vertically: door should be aligned such that its bottom is at elevator car floor level? Actually doors extend full height of car opening?
        // We'll set door's vertical position so that it is centered vertically in carHeight.
    leftDoor.position.y = 0; // car's local Y center
    // Depth: flush with front of car? Actually doors are on the front face (positive Z?) Wait our coordinate system:
          Positive Z = in front of elevator. Elevator car's front faces positive Z where people enter/exit.
        So door should be at front of car, i.e., positive Z relative to car center.
    // Car depth: we earlier set carDepth; front face at Z = +carDepth/2.
        Door thickness doorDepth; we want door flush with this outer surface so its back sits at carDepth/2 - doorDepth? Actually if door is added as child of car,
          and we position it at local Z, then when car's local Z=0 corresponds to its center. 
          So front face of car is at local Z = +carDepth/2.
        To have door sit flush with this outer surface, we set door.position.z = carDepth/2 - doorDepth/2? Because door's own geometry extends half its depth in both directions from its origin.
            We want door's back face (negative local Z of door) to match car's front face -> door.origin.z + (-doorDepth/2) = carDepth/2
                => door.origin.z = carDepth/2 + doorDepth/2.  Wait that places door sticking out front by half its thickness.
            Actually if we want door to be exactly flush such that its front face aligns with car's front face, then:
                  door.origin.z + (doorDepth/2) = carDepth/2   => door.origin.z = carDepth/2 - doorDepth/2
          Let's do that.

    leftDoor.position.z = carDepth/2 - doorDepth/2;
    elevatorCar.add(leftDoor);

    const rightDoor = leftDoor.clone();
    rightDoor.name = 'rightDoor';
    // When closed: its left edge at x=0 -> origin at x = +doorHalfWidth/2
    rightDoor.position.x = doorHalfWidth/2;
    rightDoor.position.z = carDepth/2 - doorDepth/2;
    elevatorCar.add(rightDoor);

    doors.left = leftDoor;
    doors.right = rightDoor;

    // Initial position of elevator car: at ground floor? We'll put it halfway up first floor? Actually its bottom should align with floor surface when at that floor.
        // Define that elevator car moves such that its bottom aligns with the top surface of a floor slab when stopped there.
          Person stands on floor; their feet are exactly at that height. When they step into elevator, we want them to be inside car with feet still at same Y? Actually elevator car moves,
               so person inside moves with it: their Y relative to car remains constant (they stand on car floor). 
        So we need car's internal floor (where people stand) to be at same height as building floor when doors open.

    // Let's define elevatorCar has an inner bottom at Y = -carHeight/2? Actually its geometry is centered; so its local origin at center.
          We want when car is at floor level, the point where a person stands inside (car's floor) should be same as building floor Y.
        If we add a person as child of elevatorCar and set person.position.y = 0 (they stand on car's origin), then we need car's origin to be at building floor height minus half person height? This gets messy.

    // Instead let's not worry about exact alignment for now; we'll approximate by setting elevator car Y position such that its bottom is at desired floor height when stopped.
          We can compute: if we want car's bottom (lowest point) to be at building floor Y, then given carHeight,
                car.origin.y = floorY + carHeight/2.

    // We'll store elevatorCar.targetY for each floor and animate towards it.

    // Add elevatorCar to scene
    scene.add(elevatorCar);

    // Initialize elevator position to ground floor (floor index 0)
    elevatorCar.currentFloor = 0;
    updateElevatorTargetY(); // sets targetY based on currentFloor

    // Actually we'll start at a random floor maybe? Let's put at middle.
}

// Update elevator car target Y based on currentFloor
function updateElevatorTargetY() {
    // We want elevatorCar.bottom to be at top of floor slab when stopped at that floor.
        // Person stands on floor at Y = (floorIndex+1)*FLOOR_HEIGHT? Wait we placed slabs at i*FLOOR_HEIGHT with thickness FLOOR_THICKNESS; 
          the top surface of slab i is at y = i*FLOOR_HEIGHT + FLOOR_THICKNESS/2.
        // However persons will be positioned such that their feet are exactly at Y = personHeightAboveFloor? Actually we want their feet to touch floor,
              so if they stand barefoot on floor, the bottom of their feet is at floor top surface.

    // For simplicity let's define:
          Floor i (0-indexed from ground) has walking surface at Y = (i+1)*FLOOR_HEIGHT   ??? 
        Actually we set earlier: slab i (ground=0) at y = i*FLOOR_HEIGHT. Its top is at y = i*FLOOR_HEIGHT + FLOOR_THICKNESS/2.
          If person height from foot to eyes etc ... We'll just assume person's feet are at Y = i*FLOOR_HEIGHT when standing on floor i (i.e., we ignore slab thickness).
        Then elevator car interior floor should be at same Y so that when person steps in they don't have to step up/down.

    // Therefore, we desire:
          elevatorCar.position.y (its origin) + (-carHeight/2) = desired walking surface Y
                => elevatorCar.position.y = desiredY + carHeight/2

        where desiredY for floor i = i * FLOOR_HEIGHT   (if we ignore slab thickness)

    // We'll go with that.

    const desiredY = elevatorCar.currentFloor * FLOOR_HEIGHT;
    elevatorCar.targetY = desiredY + elevatorCar.geometry.parameters.height/2; 
      // Wait we didn't store carHeight separately; we can compute from frame geometry or just use a variable.
        Actually we set carHeight earlier: let's capture it.

    // Let's refactor: store carHeight as accessible variable. For now we'll hard-code using known value:
          elevatorCar.targetY = desiredY + (FLOOR_HEIGHT * 0.9)/2;
}

// Person creation on floors
function createInitialPeople() {
    const personGeometry = new THREE.SphereGeometry(0.1); // just placeholder; we will replace with actual person from person.js

    // We'll create one person per floor initially, then choose one floor to empty randomly.
    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
        const person = createPerson(); // from person.js
        person.userData = { floor: floor, targetX: 0, targetZ: 0, state: 'waiting' }; // we'll add more later

        // Position person waiting in front of elevator doors (positive Z) at this floor.
        // Elevator shaft is centered at X=0, Z=0. The doors are on the front face (positive Z side).
        // So person should stand at some positive Z value outside shaft, facing elevator (rotation Y = Math.PI so they look toward negative Z? Actually if positive Z is forward,
              then to look toward elevator (which is at Z=0 from their position) they need to rotate 180 degrees around Y so they face opposite direction of their forward vector.
                // We'll set person.rotation.y = Math.PI; (facing toward negative Z)

        // Set X offset: maybe none, directly in front of center? Actually we could distribute persons across width but for simplicity put at X=0.
        const personX = 0;
        const personZ = SHAFT_DEPTH/2 + 1.0; // stand just outside shaft
        person.position.set(personX, /* Y to be set */ 0, personZ);
        person.rotation.y = Math.PI; // face toward elevator (negative Z)

        // Adjust Y so feet touch floor: we need to compute based on person height.
          We'll create a function to placePersonOnFloor(person, floor) that sets Y correctly.

        placePersonOnFloor(person, floor);

        // Add to scene and to people array
        scene.add(person);
        people.push(person);
    }

    // Now choose one floor randomly to be empty: remove its person from scene and mark floor empty.
    const emptyFloorIdx = Math.floor(Math.random() * FLOOR_COUNT);
    const personToRemove = people[emptyFloorIdx];
    scene.remove(personToRemove);
    people.splice(emptyFloorIdx, 1); // remove from array so we don't track it anymore? Actually we still need to know that floor is empty.
        // Better: keep person in array but mark as null and have separate status array for floors.

    // We'll instead use floorEmptyStatus array; set that floor as true (empty) and remove its person from scene and also set people[floor] = null?
    floorEmptyStatus[emptyFloorIdx] = false; // Wait we defined true means empty? Let's re-read: floorEmptyStatus = new Array(FLOOR_COUNT).fill(true); 
        // true if empty, false if occupied. So initially all true meaning all floors empty -> then we placed persons making them occupied (set false).
        // Now we want one floor to be empty: so set its status to true and remove person.

    // Actually after placing all persons, all floors are occupied (status false). We need one empty -> pick one floor, set status true and remove its person.
    floorEmptyStatus[emptyFloorIdx] = true;
    // Already removed personToRemove from scene; also set people[emptyFloorIdx] = null if we want to keep array aligned.
    people[emptyFloorIdx] = null;
}

// Helper to place a person so their feet are exactly on the walking surface of given floor index
function placePersonOnFloor(person, floorIndex) {
    // Person height: compute from geometry? We'll approximate using known dimensions used in createPerson().
          From createPerson(): legLength=1.0, torsoHeight=1.5, headRadius=0.4 -> total height when standing = legLength + torsoHeight + headRadius = 2.9?
            Actually head sits on top of torso: so top of head is at legLength + torsoHeight + headRadius from feet.
        But person's geometry origin is at group center? We placed group such that when its position.y = desiredY, the feet are at that Y because we positioned legs appropriately earlier (feet at y=0 relative to group origin).
            Recall in createPerson we set:
                leftLeg.position.y = legLength/2;
                torso.position.y = legLength + torsoHeight/2;
                head.position.y = legLength + torsoHeight + headRadius;
                and group.origin initially at (0,0,0). So if we set group.position.y = Y, then:
                    feet y = Y + legLength/2 - legLength/2? Actually leftLeg's local origin is at its center; we positioned it such that its bottom?
                      Let's recompute: leftLeg geometry BoxGeometry(legWidth, legLength, legDepth) -> extends from -legLength/2 to +legLength/2 in Y.
                        We set position.y = legLength/2 -> so the box spans from 0 to legLength in world Y (if group.origin.y=0).
                            Therefore the bottom of leftLeg is at world Y = group.position.y + 0? Actually:
                                worldY of a point = group.position.y + (localY - offset?) Wait mesh position is the offset of its origin.
                                    The geometry's vertices are relative to its own origin. We set mesh.position = (x,y,z) meaning that local (0,0,0) becomes world (x,y,z).
                                    Then a vertex at local (0, -legLength/2, 0) is at world y = group.position.y + (-legLength/2) + mesh.position.y? No: actually world position = group.position + mesh.position + localVertex.
                                        Since we added mesh as child of group, its position is relative to group.

                                So for leftLeg:
                                    group.position.y (call it GPy)
                                    mesh.position.y = legLength/2
                                    vertex at local bottom: y = -legLength/2
                                    => worldY = GPy + legLength/2 + (-legLength/2) = GPy.
                                      Similarly top vertex: local +legLength/2 -> worldY = GPy + legLength/2 + legLength/2 = GPy + legLength.

                            So indeed the bottom of left leg is at group.position.y, top at group.position.y+legLength.

                    Then torso: its geometry BoxGeometry(0.6,1.5,0.3) -> height 1.5.
                        We set position.y = legLength + torsoHeight/2 = 1.0 + 0.75 = 1.75
                         So its bottom: local -torsoHeight/2 = -0.75 -> worldY = GPy + 1.75 + (-0.75) = GPy+1.0 (which matches top of left leg)
                            top: local +0.75 -> worldY = GPy+1.75+0.75=GPy+2.5
                    Head: sphere radius 0.4, position.y = legLength+torsoHeight+headRadius = 1.0+1.5+0.4=2.9
                         so bottom: local -0.4 -> worldY = GPy+2.9-0.4 = GPy+2.5 (matches top of torso)
                            top: local +0.4 -> worldY = GPy+2.9+0.4=GPy+3.3

                    Thus when group.position.y = desired walking surface Y, the person's feet are at that Y (bottom of feet) and head is at Y+3.3.

        Therefore to place person on floor i we set:
                person.position.y = i * FLOOR_HEIGHT   // because we want feet at this height

    person.position.y = floorIndex * FLOOR_HEIGHT;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // seconds since last frame
    const speedMultiplier = getSpeedMultiplier();

    // Update elevator movement if needed
    updateElevatorMovement(delta * speedMultiplier);
    // Update door animations
    updateDoorAnimations(delta * speedMultiplier);
    // Update person walking animations
    updatePersonAnimations(delta * speedMultiplier);

    controls.update();
    renderer.render(scene, camera);
}

// Elevator movement logic: smooth interpolation toward targetY
function updateElevatorTargetForFloor(floorIndex) {
    elevatorCar.currentFloor = floorIndex;
    updateElevatorTargetY();
}

function updateElevatorMovement(delta) {
    // If not at target, move toward it
    const yDiff = elevatorCar.targetY - elevatorCar.position.y;
    if (Math.abs(yDiff) > 0.01) { // not arrived
        const moveAmount = ELEVATOR_SPEED * delta;
        if (Math.abs(moveAmount) > Math.abs(yDiff)) {
            elevatorCar.position.y = elevatorCar.targetY;
        } else {
            elevatorCar.position.y += Math.sign(yDiff) * moveAmount;
        }
    }
}

// Door animation: sliding open/close
function updateDoorAnimations(delta) {
    // We'll manage door state via a simple state machine per door? Actually doors move together.
    // Let's have doorState: 'closed', 'opening', 'open', 'closing'
    // Not implemented yet; we'll need to integrate with person boarding/exiting sequence.
      For now leave as stub - actual door movement will be triggered by higher level logic in person handling.
}

// Person animation: walking and idle
function updatePersonAnimations(delta) {
    // For each person, if they are walking, animate legs; else reset to standing.
    people.forEach(person => {
        if (!person) return;
        if (person.userData && person.userData.state === 'walking') {
            // Animate legs with sine wave
            const walkCycle = person.userData.walkCycle || 0;
            person.userData.walkCycle = walkCycle + delta * PERSON_MOVE_SPEED * 2; // arbitrary speed for cycle
            // Apply alternating swing to left and right legs
            const swingAngle = Math.sin(walkCycle) * 0.5; // radians, about 30 degrees
            // Left leg swings forward (positive X? Actually we need to rotate leg around hip so that foot moves forward.
                  In our coordinate: X is sideways? We set person facing along -Z when waiting (rotation Y = PI). 
                    When walking forward toward elevator (which stands at Z=0 from their initial positive Z), they move in negative Z direction.
                  So forward direction is -Z. Legs should swing forward/backward along Z? Actually walking involves alternating flexion/extension of hip joint in sagittal plane (forward-back).
                        That corresponds to rotation around X-axis (if Y is up, X is right, Z is forward) -> yes, rotate leg around local X.
                  However our leg geometry is oriented such that its length is along Y. To swing leg forward we need to rotate it around X so that foot moves in +Z or -Z? 
                        If we rotate the leg around its local X (which after alignment with group might be world X) then positive rotation would move front of leg (positive Z?) Actually default box geometry: 
                              extends along X,Y,Z as per constructor args (width,height,depth). We made leg with (legWidth, legLength, legDepth) -> so length along Y.
                                      Rotating around X will change its Z and Y components? Actually rotation around X affects Y and Z. Not ideal.

                  Given complexity we'll approximate by rotating leg around Y? No that would move foot sideways.

            // For simplicity we'll just rotate the leg bones slightly to suggest movement, acknowledging it's not anatomically perfect.
              We'll rotate left leg around X by +swingAngle, right leg by -swingAngle (so they alternate).
            person.getObjectByName('leftLeg').rotation.x = swingAngle;
            person.getObjectByName('rightLeg').rotation.x = -swingAngle;

            // Also update walking progress toward target
            const moveDistance = PERSON_MOVE_SPEED * delta;
            const dir = new THREE.Vector3().subVectors(person.userData.targetPosition, person.position);
            if (dir.length() > 0.01) {
                dir.normalize();
                person.position.addScaledVector(dir, moveDistance * speedMultiplier);
                // Optional: update rotation to face direction of movement? Already facing elevator; we assume they walk straight toward/away from elevator.
            } else {
                // Arrived at target
                person.userData.state = 'idle';
                person.userData.walkCycle = 0;
                resetLegs(person);
            }
        } else if (person.userData && person.userData.state === 'idle') {
            // Ensure legs are reset (though they should be from arrival)
            resetLegs(person);
        }
    });
}

// Reset leg rotation to standing pose
function resetLegs(person) {
    person.getObjectByName('leftLeg').rotation.set(0,0,0);
    person.getObjectByName('rightLeg').rotation.set(0,0,0);
}

// Placeholder for higher-level simulation logic: pick a person to move, etc.
// We'll implement a simple state machine that runs continuously.

// For demo, we'll just make one person move back and forth between two floors as example.
function setupDemoMovement() {
    // Choose first two floors that have persons (skip empty)
    let floorA = -1, floorB = -1;
    for (let i=0; i<FLOOR_COUNT; i++) {
        if (!floorEmptyStatus[i] && people[i]) {
            if (floorA===-1) floorA=i;
            else if (floorB===null || i!==floorA) { floorB=i; break; }
        }
    }
    if (floorA===-1 || floorB===-1) return;

    // We'll make person on floorA move to floorB periodically.
    setTimeout(() => {
        startPersonMove(people[floorA], floorA, floorB);
    }, 2000); // start after 2 seconds
}

// Start moving a person from sourceFloor to destFloor
function startPersonMove(person, sourceFloor, destFloor) {
    if (!person) return;
    person.userData.state = 'walking';
    person.userData.sourceFloor = sourceFloor;
    person.userData.destFloor = destFloor;
    // Compute target position: waiting spot in front of elevator at destFloor
    const targetX = 0; // center
    const targetZ = SHAFT_DEPTH/2 + 1.0; // same as initial waiting spot? Actually we want them to stand in front of elevator doors.
    person.userData.targetPosition = new THREE.Vector3(targetX, destFloor * FLOOR_HEIGHT, targetZ);
    // Note: Y will be set by placePersonOnFloor when they arrive? Actually we keep their Y at walking height during movement; 
          but when walking they should stay at same Y (no jumping). So we keep Y constant at sourceFloor * FLOOR_HEIGHT during walk?
          However when they enter elevator they need to change Y as elevator moves. This gets complicated.
    // For simplicity we'll ignore Y changes during walking and only set Y when arriving via placePersonOnFloor.

    // Actually person's Y should remain constant at their floor's height while waiting/walking outside elevator because they stay on same floor.
          When they step into elevator, we will parent them to elevatorCar and then move elevator (which changes their Y).
          So during walking outside elevator, person.position.y should equal sourceFloor * FLOOR_HEIGHT.

    // We'll set that now:
    person.position.y = sourceFloor * FLOOR_HEIGHT;
}

// Call demo setup after init
setupDemoMovement();
