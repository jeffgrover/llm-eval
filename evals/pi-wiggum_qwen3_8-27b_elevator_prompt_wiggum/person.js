function createPerson(color) {
    const person = new THREE.Group();

    const skinMaterial = new THREE.MeshLambertMaterial({ color: color });
    const shirtMaterial = new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: 0.55
    });
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x3a4a6b });
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });

    // Feet sit on local y = 0. Legs hang from the hips, torso above them,
    // head above the torso, arms hanging down from the shoulders.
    const legGeometry = new THREE.BoxGeometry(0.18, 0.75, 0.18);
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.13, 0.375, 0);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.13, 0.375, 0);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.24), shirtMaterial);
    torso.position.set(0, 1.075, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMaterial);
    head.position.set(0, 1.62, 0);

    const armGeometry = new THREE.BoxGeometry(0.13, 0.62, 0.13);
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.31, 1.18, 0);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.31, 1.18, 0);

    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
