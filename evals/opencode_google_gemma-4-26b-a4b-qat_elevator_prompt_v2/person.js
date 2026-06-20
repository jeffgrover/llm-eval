function createPerson() {
    const person = new THREE.Group();

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.2);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, 0.3, 0); // Pivot point from center to bottom
    const leftLegGroup = new THREE.Group();
    leftLegGroup.add(leftLeg);
    leftLegGroup.position.y = 0.3; // Move pivot to bottom of leg

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, 0.3, 0);
    const rightLegGroup = new THREE.Group();
    rightLegGroup.add(rightLeg);
    rightLegGroup.position.y = 0.3; // Move pivot to bottom of leg

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.8, 1, 0.4);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1.1;

    // Arms (hanging down)
    const armGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.55, 1.5, 0); // Position relative to torso/center

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.55, 1.5, 0);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.9;

    person.add(leftLegGroup);
    person.add(rightLegGroup);
    person.add(torso);
    person.add(leftArm);
    person.add(rightArm);
    person.add(head);

    // H7: userData contract
    person.userData = {
        leftLeg: leftLegGroup,
        rightLeg: rightLegGroup,
        isWalking: false
    };

    return person;
}
