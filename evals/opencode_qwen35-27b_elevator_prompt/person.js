// Person model factory function
// Creates a 3D humanoid figure from Three.js primitives

function createPerson() {
    const person = new THREE.Group();

    // Material for body parts (transparent with depthWrite: false)
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const headMaterial = new THREE.MeshPhongMaterial({
        color: 0xffdbac,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const legMaterial = new THREE.MeshPhongMaterial({
        color: 0x2c3e50,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    // Dimensions
    const torsoWidth = 0.4;
    const torsoHeight = 0.6;
    const torsoDepth = 0.25;
    
    const headRadius = 0.18;
    
    const legWidth = 0.12;
    const legHeight = 0.5;
    const legDepth = 0.12;

    // Torso (center body)
    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = legHeight + torsoHeight / 2;
    person.add(torso);

    // Head (sphere on top of torso)
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = legHeight + torsoHeight + headRadius;
    person.add(head);

    // Left leg (box below torso)
    const leftLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    leftLeg.position.set(-0.15, legHeight / 2, 0);
    
    // Create pivot point for left leg at hip level
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.15, legHeight, 0);
    leftLeg.position.y = -legHeight / 2;
    leftLegPivot.add(leftLeg);
    person.add(leftLegPivot);

    // Right leg (box below torso)
    const rightLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    const rightLeg = new THREE.Mesh(rightLegGeometry, legMaterial);
    rightLeg.position.set(0.15, legHeight / 2, 0);
    
    // Create pivot point for right leg at hip level
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.15, legHeight, 0);
    rightLeg.position.y = -legHeight / 2;
    rightLegPivot.add(rightLeg);
    person.add(rightLegPivot);

    // Arms (cylinders hanging down from shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, torsoHeight * 0.8, 8);
    
    // Left arm - hangs from shoulder level
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-torsoWidth / 2 - 0.1, legHeight + torsoHeight * 0.4, 0);
    person.add(leftArm);

    // Right arm - hangs from shoulder level
    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(torsoWidth / 2 + 0.1, legHeight + torsoHeight * 0.4, 0);
    person.add(rightArm);

    // Store references for animation
    person.userData.leftLegPivot = leftLegPivot;
    person.userData.rightLegPivot = rightLegPivot;
    person.userData.isWalking = false;

    return person;
}
