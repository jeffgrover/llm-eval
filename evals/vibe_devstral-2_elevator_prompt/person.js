// Person model factory function
function createPerson() {
    // Body parts dimensions
    const legHeight = 1.5;
    const torsoHeight = 2.0;
    const headRadius = 0.8;
    const armLength = 1.2;
    const armWidth = 0.3;
    
    // Create a group to hold all person parts
    const person = new THREE.Group();
    
    // Legs (dark color)
    const legGeometry = new THREE.BoxGeometry(0.6, legHeight, 0.6);
    const legMaterial = new THREE.MeshBasicMaterial({ color: 0x2c3e50 });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.3, legHeight / 2, 0);
    person.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.3, legHeight / 2, 0);
    person.add(rightLeg);
    
    // Torso (blue)
    const torsoGeometry = new THREE.BoxGeometry(1.5, torsoHeight, 0.8);
    const torsoMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, legHeight + torsoHeight / 2, 0);
    person.add(torso);
    
    // Arms (blue, attached to shoulders)
    const armGeometry = new THREE.BoxGeometry(armLength, armWidth, armWidth);
    const armMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-(1.5 / 2 + armLength / 2), legHeight + torsoHeight - 0.2, 0);
    person.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(1.5 / 2 + armLength / 2, legHeight + torsoHeight - 0.2, 0);
    person.add(rightArm);
    
    // Head (skin tone)
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, legHeight + torsoHeight + headRadius / 2, 0);
    person.add(head);
    
    // Store references for animation
    person.leftLeg = leftLeg;
    person.rightLeg = rightLeg;
    person.leftArm = leftArm;
    person.rightArm = rightArm;
    
    // Calculate total height for positioning
    person.totalHeight = legHeight + torsoHeight + headRadius * 2;
    
    // Set initial position (feet at floor level)
    person.position.y = person.totalHeight / 2;
    
    // Animation state
    person.isWalking = false;
    person.walkTime = 0;
    
    return person;
}

// Walking animation function
function animatePersonWalking(person, deltaTime) {
    if (!person.isWalking) return;
    
    person.walkTime += deltaTime * 0.005; // Adjust speed of leg movement
    
    // Leg animation using sine wave
    const legAngle = Math.sin(person.walkTime * 8) * 0.3; // 8 = frequency, 0.3 = amplitude
    
    // Left leg rotates forward when right leg rotates backward
    person.leftLeg.rotation.x = legAngle;
    person.rightLeg.rotation.x = -legAngle;
    
    // Arm animation (opposite of legs)
    person.leftArm.rotation.x = -legAngle * 0.5; // Less pronounced arm swing
    person.rightArm.rotation.x = legAngle * 0.5;
}

// Reset person to standing position
function resetPersonAnimation(person) {
    person.isWalking = false;
    person.walkTime = 0;
    person.leftLeg.rotation.x = 0;
    person.rightLeg.rotation.x = 0;
    person.leftArm.rotation.x = 0;
    person.rightArm.rotation.x = 0;
}