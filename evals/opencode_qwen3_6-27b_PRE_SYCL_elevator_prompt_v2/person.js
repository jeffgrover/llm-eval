function createPerson(color) {
    var personColor = color || '#3498db';
    var group = new THREE.Group();

    var legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    var bodyMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(personColor) });
    var headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

    var legHeight = 0.6;
    var legWidth = 0.15;
    var legDepth = 0.2;

    var leftLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        legMaterial
    );
    leftLeg.position.set(-0.2, legHeight / 2, 0);
    leftLeg.geometry.translate(0, -legHeight / 2, 0);

    var rightLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        legMaterial
    );
    rightLeg.position.set(0.2, legHeight / 2, 0);
    rightLeg.geometry.translate(0, -legHeight / 2, 0);

    var torsoWidth = 0.5;
    var torsoHeight = 0.8;
    var torsoDepth = 0.3;
    var torsoY = legHeight + torsoHeight / 2;

    var torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        bodyMaterial
    );
    torso.position.set(0, torsoY, 0);

    var armWidth = 0.12;
    var armHeight = 0.6;
    var armDepth = 0.15;
    var armY = torsoY + torsoHeight / 2 - armHeight / 2;

    var leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        bodyMaterial
    );
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, armY, 0);

    var rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        bodyMaterial
    );
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, armY, 0);

    var headRadius = 0.2;
    var headY = torsoY + torsoHeight / 2 + headRadius;

    var head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 12, 12),
        headMaterial
    );
    head.position.set(0, headY, 0);

    group.add(leftLeg);
    group.add(rightLeg);
    group.add(torso);
    group.add(leftArm);
    group.add(rightArm);
    group.add(head);

    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}
