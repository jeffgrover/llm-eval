// Person model factory function
function createPerson() {
    const person = new THREE.Group();
    
    // Colors
    const bodyColor = 0x3498db;
    const headColor = 0xffdbac;
    const legsColor = 0x2c3e50;
    
    // Body (torso) - positioned above legs
    const bodyGeometry = new THREE.BoxGeometry(0.4, 0.8, 0.3);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8; // Above legs
    person.add(body);
    
    // Legs - positioned at bottom
    const legGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const legMaterial = new THREE.MeshPhongMaterial({ color: legsColor });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.1, 0.3, 0);
    person.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.1, 0.3, 0);
    person.add(rightLeg);
    
    // Head - positioned above body
    const headGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    const headMaterial = new THREE.MeshPhongMaterial({ color: headColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5; // Above body
    person.add(head);
    
    // Arms - positioned at shoulder level, hanging down
    const armGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.1);
    const armMaterial = new THREE.MeshPhongMaterial({ color: headColor });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.25, 1.1, 0); // At shoulder level
    person.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.25, 1.1, 0); // At shoulder level
    person.add(rightArm);
    
    // Store references for animation
    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    
    // Total height for positioning
    person.userData.height = 1.7;
    
    return person;
}

// Walking animation function
function animatePersonWalk(person, time) {
    const walkCycle = Math.sin(time * 8) * 0.3;
    
    if (person.userData.leftLeg && person.userData.rightLeg) {
        person.userData.leftLeg.rotation.x = walkCycle;
        person.userData.rightLeg.rotation.x = -walkCycle;
        
        // Arms swing opposite to legs
        person.userData.leftArm.rotation.x = -walkCycle * 0.5;
        person.userData.rightArm.rotation.x = walkCycle * 0.5;
    }
}

// Reset person to standing position
function resetPersonPose(person) {
    if (person.userData.leftLeg && person.userData.rightLeg) {
        person.userData.leftLeg.rotation.x = 0;
        person.userData.rightLeg.rotation.x = 0;
        person.userData.leftArm.rotation.x = 0;
        person.userData.rightArm.rotation.x = 0;
    }
}