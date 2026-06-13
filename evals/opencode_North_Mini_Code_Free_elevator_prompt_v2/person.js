function createPerson() {
    const person = new THREE.Group();

    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 1),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    );
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );
    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );

    leftLeg.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    ));
    rightLeg.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    ));

    leftArm.position.set(1.2, 0.5, 0);
    rightArm.position.set(-1.2, 0.5, 0);

    leftLeg.position.set(0, -1, 0);
    rightLeg.position.set(0, -1, 0);
    torso.position.set(0, 1.5, 0);
    head.position.set(0, 4.5, 0);

    person.add(leftLeg, rightLeg, torso, head, leftArm, rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}