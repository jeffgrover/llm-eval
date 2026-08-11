function createPerson() {
    const person = new THREE.Group();

    const legHeight = 0.8;
    const torsoHeight = 0.8;
    const headRadius = 0.2;
    const bodyHalfWidth = 0.2;

    const legGeometry = new THREE.BoxGeometry(bodyHalfWidth * 2, legHeight, bodyHalfWidth);
    const legMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        roughness: 0.7,
        metalness: 0.1
    });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.y = legHeight / 2;
    leftLeg.name = "leftLeg";
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.y = legHeight / 2;
    rightLeg.name = "rightLeg";
    person.add(rightLeg);

    const torsoGeometry = new THREE.BoxGeometry(bodyHalfWidth * 2, torsoHeight, bodyHalfWidth * 1.2);
    const torsoMaterial = new THREE.MeshStandardMaterial({
        color: 0x3498db,
        roughness: 0.6,
        metalness: 0.1
    });

    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = legHeight + torsoHeight / 2;
    person.add(torso);

    const armLength = 0.6;
    const armGeometry = new THREE.BoxGeometry(bodyHalfWidth * 0.6, armLength, bodyHalfWidth * 0.6);
    const armMaterial = new THREE.MeshStandardMaterial({
        color: 0x3498db,
        roughness: 0.6,
        metalness: 0.1
    });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-bodyHalfWidth * 1.5, legHeight + torsoHeight * 0.75, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(bodyHalfWidth * 1.5, legHeight + torsoHeight * 0.75, 0);
    person.add(rightArm);

    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        roughness: 0.8,
        metalness: 0.05
    });

    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = legHeight + torsoHeight + headRadius;
    person.add(head);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
