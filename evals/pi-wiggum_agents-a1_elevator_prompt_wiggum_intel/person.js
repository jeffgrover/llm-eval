function createPerson(color) {
    const person = new THREE.Group();

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: color });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1.4;
    person.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffccaa });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.3;
    person.add(head);

    // Left leg
    const leftLegGeometry = new THREE.BoxGeometry(0.3, 1.0, 0.4);
    const leftLegMaterial = new THREE.MeshPhongMaterial({ color: 0x3366cc });
    const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
    leftLeg.position.set(-0.25, 0.5, 0);
    person.add(leftLeg);

    // Right leg
    const rightLegGeometry = new THREE.BoxGeometry(0.3, 1.0, 0.4);
    const rightLegMaterial = new THREE.MeshPhongMaterial({ color: 0x3366cc });
    const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
    rightLeg.position.set(0.25, 0.5, 0);
    person.add(rightLeg);

    // Arms hanging down
    const armGeometry = new THREE.BoxGeometry(0.25, 1.0, 0.3);
    const armMaterial = new THREE.MeshPhongMaterial({ color: color });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.6, 1.8, 0);
    person.add(leftArm);
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.6, 1.8, 0);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: 1,
        inElevator: false
    };

    return person;
}
