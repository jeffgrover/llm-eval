function createPerson(color) {
    const person = new THREE.Group();

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: color });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1.2;
    person.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffccaa });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.1;
    person.add(head);

    // Left leg
    const leftLegGeometry = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    const leftLegMaterial = new THREE.MeshPhongMaterial({ color: 0x3366cc });
    const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
    leftLeg.position.y = 0.35;
    person.add(leftLeg);

    // Right leg
    const rightLegGeometry = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    const rightLegMaterial = new THREE.MeshPhongMaterial({ color: 0x3366cc });
    const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
    rightLeg.position.y = 0.35;
    person.add(rightLeg);

    // Left arm
    const leftArmGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const leftArmMaterial = new THREE.MeshPhongMaterial({ color: color });
    const leftArm = new THREE.Mesh(leftArmGeometry, leftArmMaterial);
    leftArm.position.set(-0.45, 1.3, 0);
    person.add(leftArm);

    // Right arm
    const rightArmGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const rightArmMaterial = new THREE.MeshPhongMaterial({ color: color });
    const rightArm = new THREE.Mesh(rightArmGeometry, rightArmMaterial);
    rightArm.position.set(0.45, 1.3, 0);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: null,
        inElevator: false
    };

    return person;
}
