function createPerson() {
    const person = new THREE.Group();

    const colors = {
        body: 0x3498db,
        skin: 0xffdbac,
        legs: 0x2c3e50
    };

    // Legs - Pivot point should be at the top (hip)
    const legGeometry = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    legGeometry.translate(0, -0.25, 0); // Move origin to top of leg

    const legMaterial = new THREE.MeshStandardMaterial({ color: colors.legs });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.1, 0.5, 0);
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.1, 0.5, 0);
    person.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.8, 0.2);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: colors.body });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 0.9, 0); // 0.5 (leg) + 0.4 (half torso)
    person.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: colors.skin });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.5, 0); // 0.5 (leg) + 0.8 (torso) + 0.2 (head radius)
    person.add(head);

    // Arms - Hanging DOWN from shoulders
    const armGeometry = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    armGeometry.translate(0, -0.25, 0); // Origin at shoulder
    const armMaterial = new THREE.MeshStandardMaterial({ color: colors.body });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.25, 1.2, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.25, 1.2, 0);
    person.add(rightArm);

    // Populating userData as required by H7
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
