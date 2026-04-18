function createPerson(color, position) {
    var person = new THREE.Group();
    person.position.copy(position);

    // Legs (dark color #2c3e50)
    var legGeometry = new THREE.BoxGeometry(0.25, 0.9, 0.25);
    var legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });

    var leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, 0.45, 0);
    person.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, 0.45, 0);
    person.add(rightLeg);

    // Torso (blue #3498db)
    var torsoGeometry = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    var torsoMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    var torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 1.25, 0);
    person.add(torso);

    // Arms (hanging DOWN from shoulders)
    var armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    var armMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });

    var leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.35, 1.2, 0);
    person.add(leftArm);

    var rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.35, 1.2, 0);
    person.add(rightArm);

    // Head (skin tone #ffdbac)
    var headGeometry = new THREE.SphereGeometry(0.22, 12, 12);
    var headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    var head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.75, 0);
    person.add(head);

    // userData contract
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
