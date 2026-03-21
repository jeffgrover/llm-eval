// person.js

function createPerson() {
    const personGroup = new THREE.Group();

    // Material definitions
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db }); // Blue body
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });  // Dark legs

    // Dimensions
    const legWidth = 0.25;
    const legHeight = 0.9;
    const legDepth = 0.25;
    const bodyWidth = 0.6;
    const bodyHeight = 0.9;
    const bodyDepth = 0.35;
    const headRadius = 0.25;
    const armWidth = 0.2;
    const armHeight = 0.8;
    const armDepth = 0.2;

    // --- LEGS ---
    // We need legs to rotate from the hip (top of the leg).
    // So we create a group for each leg at the hip position, and offset the leg mesh down.
    
    // Left Leg
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.15, legHeight, 0); // Hip position
    
    const leftLegGeo = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    // Move geometry down so the origin of the mesh is at the top
    leftLegGeo.translate(0, -legHeight / 2, 0); 
    const leftLeg = new THREE.Mesh(leftLegGeo, legMaterial);
    leftLegGroup.add(leftLeg);
    personGroup.add(leftLegGroup);

    // Right Leg
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.15, legHeight, 0); // Hip position

    const rightLegGeo = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    rightLegGeo.translate(0, -legHeight / 2, 0);
    const rightLeg = new THREE.Mesh(rightLegGeo, legMaterial);
    rightLegGroup.add(rightLeg);
    personGroup.add(rightLegGroup);

    // --- BODY (TORSO) ---
    const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    // Body sits on top of legs (legHeight) and extends up. 
    // Center is at legHeight + bodyHeight/2
    body.position.y = legHeight + bodyHeight / 2;
    personGroup.add(body);

    // --- HEAD ---
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4); // Using box for simplicity/style
    const head = new THREE.Mesh(headGeo, skinMaterial);
    head.position.y = legHeight + bodyHeight + 0.2; // On top of body
    personGroup.add(head);

    // --- ARMS ---
    // Arms should hang down from shoulders. Shoulders are at top of body.
    const shoulderHeight = legHeight + bodyHeight - 0.1;

    // Left Arm
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-(bodyWidth/2 + armWidth/2), shoulderHeight, 0);
    
    const leftArmGeo = new THREE.BoxGeometry(armWidth, armHeight, armDepth);
    leftArmGeo.translate(0, -armHeight / 2, 0); // Pivot at top
    const leftArm = new THREE.Mesh(leftArmGeo, bodyMaterial); // Sleeves same as body? Or skin? "Blue body" usually implies shirt. Let's make arms blue.
    // Maybe hands at bottom? Keep simple.
    leftArmGroup.add(leftArm);
    personGroup.add(leftArmGroup);

    // Right Arm
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set((bodyWidth/2 + armWidth/2), shoulderHeight, 0);

    const rightArmGeo = new THREE.BoxGeometry(armWidth, armHeight, armDepth);
    rightArmGeo.translate(0, -armHeight / 2, 0); // Pivot at top
    const rightArm = new THREE.Mesh(rightArmGeo, bodyMaterial);
    rightArmGroup.add(rightArm);
    personGroup.add(rightArmGroup);

    // Attach references for animation
    personGroup.userData = {
        leftLeg: leftLegGroup,
        rightLeg: rightLegGroup,
        leftArm: leftArmGroup,
        rightArm: rightArmGroup,
        isWalking: false,
        walkTime: 0
    };

    // Cast shadows? Not strictly required by prompt but good practice. 
    // Prompt says "Transparent" for environment, didn't specify shadows, keeping it simple to avoid artifacts with transparency.

    return personGroup;
}

function updatePersonAnimation(person, deltaTime, speedMultiplier) {
    if (!person.userData.isWalking) {
        // Reset to standing
        person.userData.leftLeg.rotation.x = 0;
        person.userData.rightLeg.rotation.x = 0;
        person.userData.leftArm.rotation.x = 0;
        person.userData.rightArm.rotation.x = 0;
        return;
    }

    person.userData.walkTime += deltaTime * speedMultiplier * 5; // *5 for reasonable cadence

    const angle = Math.sin(person.userData.walkTime) * 0.5; // 0.5 rad swing

    // Legs opposite
    person.userData.leftLeg.rotation.x = angle;
    person.userData.rightLeg.rotation.x = -angle;

    // Arms opposite to legs (natural movement)
    person.userData.leftArm.rotation.x = -angle * 0.5;
    person.userData.rightArm.rotation.x = angle * 0.5;
}
