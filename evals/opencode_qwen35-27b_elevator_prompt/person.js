function createPerson() {
    const person = new THREE.Group();

    // Materials
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    // Dimensions
    const legHeight = 1.2;
    const torsoHeight = 1.0;
    const headRadius = 0.35;

    // Left leg - positioned at floor level (y=0)
    const leftLegGeometry = new THREE.CylinderGeometry(0.15, 0.15, legHeight);
    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    leftLeg.position.set(-0.25, legHeight / 2, 0);
    leftLeg.name = 'leftLeg';
    person.add(leftLeg);

    // Right leg - positioned at floor level (y=0)
    const rightLegGeometry = new THREE.CylinderGeometry(0.15, 0.15, legHeight);
    const rightLeg = new THREE.Mesh(rightLegGeometry, legMaterial);
    rightLeg.position.set(0.25, legHeight / 2, 0);
    rightLeg.name = 'rightLeg';
    person.add(rightLeg);

    // Torso - sits on top of legs
    const torsoGeometry = new THREE.BoxGeometry(0.6, torsoHeight, 0.4);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, legHeight + torsoHeight / 2, 0);
    person.add(torso);

    // Head - sits on top of torso
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, legHeight + torsoHeight + headRadius / 2, 0);
    person.add(head);

    // Left arm - hangs from shoulder level (top of torso)
    const armLength = 0.6;
    const leftArmGeometry = new THREE.CylinderGeometry(0.12, 0.12, armLength);
    const leftArm = new THREE.Mesh(leftArmGeometry, bodyMaterial);
    leftArm.position.set(-0.45, legHeight + torsoHeight - armLength / 2, 0);
    leftArm.name = 'leftArm';
    person.add(leftArm);

    // Right arm - hangs from shoulder level (top of torso)
    const rightArmGeometry = new THREE.CylinderGeometry(0.12, 0.12, armLength);
    const rightArm = new THREE.Mesh(rightArmGeometry, bodyMaterial);
    rightArm.position.set(0.45, legHeight + torsoHeight - armLength / 2, 0);
    rightArm.name = 'rightArm';
    person.add(rightArm);

    // Store references for animation
    person.leftLeg = leftLeg;
    person.rightLeg = rightLeg;
    person.leftArm = leftArm;
    person.rightArm = rightArm;
    person.totalHeight = legHeight + torsoHeight + headRadius;

    return person;
}
