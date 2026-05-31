function createPerson() {
    const person = new THREE.Group();

    const legWidth = 0.3;
    const legHeight = 0.7;
    const legDepth = 0.3;
    const legColor = 0x2c3e50;

    const leftLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        new THREE.MeshLambertMaterial({ color: legColor })
    );
    leftLeg.position.set(-0.2, 0.35, 0);
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        new THREE.MeshLambertMaterial({ color: legColor })
    );
    rightLeg.position.set(0.2, 0.35, 0);
    person.add(rightLeg);

    const torsoWidth = 0.8;
    const torsoHeight = 1;
    const torsoDepth = 0.5;
    const torsoColor = 0x3498db;

    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        new THREE.MeshLambertMaterial({ color: torsoColor })
    );
    torso.position.y = 0.7 + legHeight / 2;
    person.add(torso);

    const headRadius = 0.25;
    const headColor = 0xffdbac;

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        new THREE.MeshLambertMaterial({ color: headColor })
    );
    head.position.y = 0.7 + legHeight / 2 + torsoHeight / 2 + headRadius;
    person.add(head);

    const armWidth = 0.2;
    const armHeight = 0.9;
    const armDepth = 0.2;

    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        new THREE.MeshLambertMaterial({ color: torsoColor })
    );
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, 0.5 + legHeight / 2 + torsoHeight / 2 - 0.3, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        new THREE.MeshLambertMaterial({ color: torsoColor })
    );
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, 0.5 + legHeight / 2 + torsoHeight / 2 - 0.3, 0);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}