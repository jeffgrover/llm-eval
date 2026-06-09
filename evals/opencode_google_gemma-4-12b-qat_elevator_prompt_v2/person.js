function createPerson() {
    const person = new THREE.Group();

    // Dimensions
    const bodyHeight = 1.2;
    const legHeight = 0.8;
    const armLength = 0.7;
    const headRadius = 0.15;
    const torsoWidth = 0.4;
    const legWidth = 0.15;

    // Materials
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    const legMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });

    // Legs
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, -0.4, 0); // Pivot at hip
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(legWidth, legHeight, 0.15), legMat);
    leftLegMesh.position.y = -legHeight / 2; // Offset so pivot is at top
    leftLegGroup.add(leftLegMesh);
    person.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, -0.4, 0); // Pivot at hip
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(legWidth, legHeight, 0.15), legMat);
    rightLegMesh.position.y = -legHeight / 2;
    rightLegGroup.add(rightLegMesh);
    person.add(rightLegGroup);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, bodyHeight, 0.2), bodyMat);
    torso.position.y = 0.4;
    person.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 16, 16), skinMat);
    head.position.y = 0.4 + bodyHeight / 2 + 0.1;
    person.add(head);

    // Arms
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, armLength, 0.1), bodyMat);
    leftArm.position.set(-0.2, 0.4, 0); // Shoulder height
    person.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, armLength, 0.1), bodyMat);
    rightArm.position.set(0.2, 0.4, 0); // Shoulder height
    person.add(rightArm);

    // userData contract
    person.userData = {
        leftLeg: leftLegGroup,
        rightLeg: rightLegGroup,
        isWalking: false
    };

    // Set initial position so feet are on ground
    // Person height is ~1.6. Center is ~0.8. 
    // To have feet at 0, center should be at 0.8.
    // Currently torso.y = 0.4, head.y = 0.4 + 0.6 + 0.1 = 1.1.
    // Let's adjust base height.
    person.position.y = 0.4;

    return person;
}
