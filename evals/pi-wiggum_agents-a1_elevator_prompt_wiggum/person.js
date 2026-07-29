function createPerson(color) {
    const person = new THREE.Group();

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.6, 1, 0.3);
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: color });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 1;
    person.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffccaa });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.9;
    person.add(head);

    // Left Leg
    const leftLegGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.3);
    const leftLegMaterial = new THREE.MeshLambertMaterial({ color: 0x3366cc });
    const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
    leftLeg.position.set(-0.2, 0.4, 0);
    person.add(leftLeg);

    // Right Leg
    const rightLegGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.3);
    const rightLegMaterial = new THREE.MeshLambertMaterial({ color: 0x3366cc });
    const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
    rightLeg.position.set(0.2, 0.4, 0);
    person.add(rightLeg);

    // Arms (hanging down)
    const armGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.25);
    const armMaterial = new THREE.MeshLambertMaterial({ color: color });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.45, 1.1, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.45, 1.1, 0);
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
