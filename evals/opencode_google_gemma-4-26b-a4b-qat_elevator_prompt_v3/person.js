function createPerson() {
    const person = new THREE.Group();

    // Colors
    const skinColor = 0xffdbac;
    const bodyColor = 0x3498db;
    const legColor = 0x2c3e50;

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.4, 0.8, 0.4);
    const legMaterial = new THREE.MeshStandardMaterial({ color: legColor });
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);

    leftLeg.position.set(-0.2, 0.4, 0);
    rightLeg.position.set(0.2, 0.4, 0);
    person.add(leftLeg);
    person.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 1.4, 0);
    person.add(torso);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMaterial = new THREE.MeshStandardMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 2.4, 0);
    person.add(head);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    const armMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.5, 1.8, 0);
    rightArm.position.set(0.5, 1.8, 0);
    person.add(leftArm);
    person.add(rightArm);

    // H7: Populate userData
    // H7: Populate userData
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        isWorking: false
    };

    return person;
}
