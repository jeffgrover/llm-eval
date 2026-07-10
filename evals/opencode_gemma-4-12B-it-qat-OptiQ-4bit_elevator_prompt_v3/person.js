function createPerson() {
    const person = new THREE.Group();

    // Body Parts
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), bodyMat);
    torso.position.y = 1.1;
    person.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
    head.position.y = 1.7;
    person.add(head);

    // Arms (hang down from shoulders)
    const armGeom = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    const leftArm = new THREE.Mesh(armGeom, bodyMat);
    leftArm.position.set(-0.35, 1.3, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, bodyMat);
    rightArm.position.set(0.35, 1.3, 0);
    person.add(rightArm);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.15, 0.35, 0);
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.15, 0.35, 0);
    person.add(rightLeg);

    // Set contract requirements
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
