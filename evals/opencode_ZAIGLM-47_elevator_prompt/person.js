function createPerson(color = 0x3498db) {
    const person = new THREE.Group();

    const legHeight = 0.8;
    const legWidth = 0.15;
    const torsoHeight = 1.0;
    const torsoWidth = 0.4;
    const headRadius = 0.25;
    const armLength = 0.7;
    const armWidth = 0.12;

    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: color });
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

    const legGeometry = new THREE.BoxGeometry(legWidth, legHeight, legWidth);
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, legHeight / 2, 0);
    leftLeg.userData.isLeg = true;
    leftLeg.userData.legSide = 'left';
    person.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, legHeight / 2, 0);
    rightLeg.userData.isLeg = true;
    rightLeg.userData.legSide = 'right';
    person.add(rightLeg);

    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoWidth);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, legHeight + torsoHeight / 2, 0);
    person.add(torso);

    const armGeometry = new THREE.BoxGeometry(armWidth, armLength, armWidth);
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, legHeight + torsoHeight - armLength / 2, 0);
    leftArm.position.y = legHeight + torsoHeight - armLength / 2;
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, legHeight + torsoHeight - armLength / 2, 0);
    rightArm.position.y = legHeight + torsoHeight - armLength / 2;
    person.add(rightArm);

    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, legHeight + torsoHeight + headRadius, 0);
    person.add(head);

    person.userData.legs = { left: leftLeg, right: rightLeg };
    person.userData.isWalking = false;
    person.userData.walkTime = 0;
    person.userData.originalLegRotation = { x: 0, y: 0, z: 0 };

    return person;
}

function animateLegs(person, speedMultiplier, deltaTime) {
    if (!person.userData.isWalking) {
        const legs = person.userData.legs;
        legs.left.rotation.x = 0;
        legs.right.rotation.x = 0;
        return;
    }

    person.userData.walkTime += deltaTime * 5 * speedMultiplier;
    const legs = person.userData.legs;
    const swingAmount = 0.5;

    legs.left.rotation.x = Math.sin(person.userData.walkTime) * swingAmount;
    legs.right.rotation.x = Math.sin(person.userData.walkTime + Math.PI) * swingAmount;
}

function startWalking(person) {
    person.userData.isWalking = true;
    person.userData.walkTime = 0;
}

function stopWalking(person) {
    person.userData.isWalking = false;
    const legs = person.userData.legs;
    legs.left.rotation.x = 0;
    legs.right.rotation.x = 0;
}