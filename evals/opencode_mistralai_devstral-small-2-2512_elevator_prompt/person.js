// Person factory function
function createPerson(floorIndex) {
    const personHeight = 3;
    const legWidth = 0.8;
    const torsoWidth = 1.5;
    const headSize = 1.2;

    // Create legs (blue)
    const legMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const leftLegGeometry = new THREE.BoxGeometry(legWidth, personHeight * 0.4, legWidth);
    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    leftLeg.position.y = personHeight * 0.2;
    leftLeg.position.x = -torsoWidth / 3;

    const rightLegGeometry = new THREE.BoxGeometry(legWidth, personHeight * 0.4, legWidth);
    const rightLeg = new THREE.Mesh(rightLegGeometry, legMaterial);
    rightLeg.position.y = personHeight * 0.2;
    rightLeg.position.x = torsoWidth / 3;

    // Create torso (blue)
    const torsoMaterial = new THREE.MeshStandardMaterial({
        color: 0x3498db,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, personHeight * 0.5, legWidth);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = personHeight * 0.7;

    // Create head (skin tone)
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const headGeometry = new THREE.BoxGeometry(headSize, headSize, headSize);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = personHeight * 1.2;

    // Create arms (blue)
    const armWidth = 0.5;
    const leftArmGeometry = new THREE.BoxGeometry(armWidth, personHeight * 0.3, legWidth);
    const leftArm = new THREE.Mesh(leftArmGeometry, torsoMaterial);
    leftArm.position.y = personHeight * 0.9;
    leftArm.position.x = -torsoWidth / 2 - armWidth / 2;

    const rightArmGeometry = new THREE.BoxGeometry(armWidth, personHeight * 0.3, legWidth);
    const rightArm = new THREE.Mesh(rightArmGeometry, torsoMaterial);
    rightArm.position.y = personHeight * 0.9;
    rightArm.position.x = torsoWidth / 2 + armWidth / 2;

    // Create person group
    const person = new THREE.Group();
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);

    // Position person in front of elevator on their floor
    const floorY = FLOOR_HEIGHT * floorIndex + FLOOR_HEIGHT / 4;
    person.position.y = floorY;
    person.position.z = -SHAFT_DEPTH / 2 - 3; // In front of elevator
    
    // Rotate to face the elevator (180 degrees)
    person.rotation.y = Math.PI;

    // Add walking animation state
    person.walking = false;
    person.walkTime = 0;
    person.targetPosition = new THREE.Vector3();
    person.currentFloor = floorIndex;

    scene.add(person);

    return person;
}

// Move elevator to target floor
function moveElevatorToFloor(target, callback) {
    if (animationInProgress) return;
    animationInProgress = true;

    const startY = currentFloor * FLOOR_HEIGHT + FLOOR_HEIGHT / 4;
    const endY = target * FLOOR_HEIGHT + FLOOR_HEIGHT / 4;
    const distance = Math.abs(endY - startY);

    let elapsed = 0;

    function update() {
        elapsed += ELEVATOR_SPEED * 0.016; // Approximate 60fps
        
        if (elapsed >= distance) {
            elevatorCar.position.y = endY;
            currentFloor = target;
            animationInProgress = false;
            callback();
        } else {
            const progress = elapsed / distance;
            elevatorCar.position.y = startY + (endY - startY) * progress;
            requestAnimationFrame(update);
        }
    }

    update();
}

// Open doors with animation
function openDoors(callback) {
    if (doors.open) callback();
    
    const startX = -SHAFT_WIDTH / 4;
    const endX = -SHAFT_WIDTH * 1.5;
    const distance = SHAFT_WIDTH;
    
    let elapsed = 0;

    function update() {
        elapsed += 3 * 0.016; // Faster door movement
        
        if (elapsed >= distance) {
            doors.left.position.x = endX;
            doors.right.position.x = -endX;
            doors.open = true;
            setTimeout(callback, 300); // Small delay before next action
        } else {
            const progress = elapsed / distance;
            doors.left.position.x = startX + (endX - startX) * progress;
            doors.right.position.x = -startX + (-endX + startX) * progress;
            requestAnimationFrame(update);
        }
    }

    update();
}

// Close doors with animation
function closeDoors(callback) {
    if (!doors.open) callback();
    
    const startX = -SHAFT_WIDTH / 4;
    const endX = -SHAFT_WIDTH * 1.5;
    const distance = SHAFT_WIDTH;
    
    let elapsed = 0;

    function update() {
        elapsed += 3 * 0.016; // Faster door movement
        
        if (elapsed >= distance) {
            doors.left.position.x = startX;
            doors.right.position.x = -startX;
            doors.open = false;
            callback();
        } else {
            const progress = elapsed / distance;
            doors.left.position.x = endX + (startX - endX) * progress;
            doors.right.position.x = -endX + (-startX + endX) * progress;
            requestAnimationFrame(update);
        }
    }

    update();
}

// Make person walk to target position
function makePersonWalk(person, targetPos, callback) {
    const startPos = new THREE.Vector3(
        person.position.x,
        person.position.y,
        person.position.z
    );
    
    const distance = Math.abs(targetPos.z - startPos.z);
    let elapsed = 0;

    function update() {
        elapsed += PERSON_MOVE_SPEED * 0.016;
        
        if (elapsed >= distance) {
            person.position.copy(targetPos);
            person.walking = false;
            callback();
        } else {
            const progress = elapsed / distance;
            person.position.z = startPos.z + (targetPos.z - startPos.z) * progress;
            
            // Animate legs during walking
            if (!person.walking) {
                person.walking = true;
                person.walkTime = 0;
            }
            
            person.walkTime += 0.1;
            const legRotation = Math.sin(person.walkTime) * 0.3;
            person.children[0].rotation.x = legRotation; // Left leg
            person.children[1].rotation.x = -legRotation; // Right leg (opposite)
            
            requestAnimationFrame(update);
        }
    }

    update();
}

// Start elevator simulation cycle
function startElevatorCycle() {
    if (animationInProgress) return;
    
    // Find a person to move
    const availablePeople = people.filter(p => p.currentFloor !== emptyFloor);
    if (availablePeople.length === 0) return;
    
    const personToMove = availablePeople[Math.floor(Math.random() * availablePeople.length)];
    targetFloor = emptyFloor;

    // Move elevator to pickup floor
    moveElevatorToFloor(personToMove.currentFloor, function() {
        openDoors(function() {
            // Person walks into elevator
            const elevatorPos = new THREE.Vector3(
                personToMove.position.x,
                personToMove.position.y,
                -SHAFT_DEPTH / 2 + 1 // Just inside elevator
            );
            
            makePersonWalk(personToMove, elevatorPos, function() {
                closeDoors(function() {
                    // Person becomes child of elevator
                    elevatorCar.add(personToMove);
                    personToMove.currentFloor = -1; // Mark as in transit
                    
                    // Move to destination floor
                    moveElevatorToFloor(targetFloor, function() {
                        openDoors(function() {
                            // Person walks out of elevator
                            const exitPos = new THREE.Vector3(
                                personToMove.position.x,
                                personToMove.position.y - FLOOR_HEIGHT / 4 + targetFloor * FLOOR_HEIGHT,
                                -SHAFT_DEPTH / 2 - 3 // Back to waiting position
                            );
                            
                            makePersonWalk(personToMove, exitPos, function() {
                                closeDoors(function() {
                                    // Person returns to scene
                                    scene.add(personToMove);
                                    personToMove.currentFloor = targetFloor;
                                    
                                    // Update empty floor
                                    emptyFloor = personToMove.currentFloor;
                                    
                                    // Start next cycle after delay
                                    setTimeout(startElevatorCycle, 2000);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// Start the simulation when page loads
window.onload = function() {
    init();
    setTimeout(startElevatorCycle, 1000);
};