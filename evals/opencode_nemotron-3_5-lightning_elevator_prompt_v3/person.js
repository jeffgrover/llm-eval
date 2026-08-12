function createPerson() {
    const group = new THREE.Group();

    // Legs - pivot from hips
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    const legWidth = 0.5;
    const legDepth = 0.5;
    const legHeight = 2.5;

    const leftLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    const rightLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);

    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(rightLegGeometry, legMaterial);

    leftLeg.position.set(-0.3, -legHeight / 2, 0);
    rightLeg.position.set(0.3, -legHeight / 2, 0);

    group.add(leftLeg);
    group.add(rightLeg);

    // Torso
    const torsoWidth = 1.5;
    const torsoDepth = 1.0;
    const torsoHeight = 2.0;
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });

    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, -legHeight + torsoHeight / 2, 0);
    group.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, -legHeight + torsoHeight + 0.5, 0);
    group.add(head);

    // Arms - hang down from shoulders, not up from hips
    const armLength = 1.5;
    const armWidth = 0.3;
    const armDepth = 0.3;
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });

    const armGeometry = new THREE.BoxGeometry(armWidth, armLength, armDepth);

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.7, -legHeight + torsoHeight / 2 - armLength / 2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.7, -legHeight + torsoHeight / 2 - armLength / 2, 0);
    group.add(rightArm);

    // userData contract per H7
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}