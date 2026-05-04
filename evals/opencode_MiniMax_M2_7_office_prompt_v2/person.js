function createPerson({ bodyColor, skinColor, legColor } = {}) {
    var bodyPalette = [0x3366cc, 0xcc6633, 0x33cc66, 0xcc3366, 0x6633cc, 0x33cccc, 0xcc9933, 0x9933cc];
    var skinPalette = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffd5b5, 0xdaa06d];
    var legPalette = [0x222222, 0x333344, 0x443355, 0x334433, 0x553333, 0x2a2a3a];

    var group = new THREE.Group();

    bodyColor = bodyColor || bodyPalette[Math.floor(Math.random() * bodyPalette.length)];
    skinColor = skinColor || skinPalette[Math.floor(Math.random() * skinPalette.length)];
    legColor = legColor || legPalette[Math.floor(Math.random() * legPalette.length)];

    var legMat = new THREE.MeshLambertMaterial({ color: legColor });
    var bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

    var legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8);
    var torsoGeometry = new THREE.CylinderGeometry(0.22, 0.18, 0.65, 8);
    var headGeometry = new THREE.SphereGeometry(0.22, 12, 8);
    var noseGeometry = new THREE.SphereGeometry(0.05, 6, 4);
    var armGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8);

    var leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.12, 0.45, 0);
    var leftLeg = new THREE.Mesh(legGeometry, legMat);
    leftLeg.position.y = -0.45;
    leftLegGroup.add(leftLeg);
    group.add(leftLegGroup);

    var rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.12, 0.45, 0);
    var rightLeg = new THREE.Mesh(legGeometry, legMat);
    rightLeg.position.y = -0.45;
    rightLegGroup.add(rightLeg);
    group.add(rightLegGroup);

    var torso = new THREE.Mesh(torsoGeometry, bodyMat);
    torso.position.y = 1.15;
    group.add(torso);

    var leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.28, 1.35, 0);
    var leftArm = new THREE.Mesh(armGeometry, bodyMat);
    leftArm.position.y = -0.275;
    leftArmGroup.add(leftArm);
    group.add(leftArmGroup);

    var rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.28, 1.35, 0);
    var rightArm = new THREE.Mesh(armGeometry, bodyMat);
    rightArm.position.y = -0.275;
    rightArmGroup.add(rightArm);
    group.add(rightArmGroup);

    var headGroup = new THREE.Group();
    headGroup.position.y = 1.7;
    var head = new THREE.Mesh(headGeometry, skinMat);
    headGroup.add(head);

    var nose = new THREE.Mesh(noseGeometry, skinMat);
    nose.position.set(0, 0.02, 0.2);
    headGroup.add(nose);
    group.add(headGroup);

    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = 0;
    group.userData.leftLegGroup = leftLegGroup;
    group.userData.rightLegGroup = rightLegGroup;
    group.userData.leftArmGroup = leftArmGroup;
    group.userData.rightArmGroup = rightArmGroup;

    return group;
}

function animatePersonWalking(person, dt) {
    var lg = person.userData.leftLegGroup;
    var rg = person.userData.rightLegGroup;
    var la = person.userData.leftArmGroup;
    var ra = person.userData.rightArmGroup;

    if (person.userData.isSitting) {
        lg.rotation.x = -Math.PI / 2;
        rg.rotation.x = -Math.PI / 2;
        la.rotation.x = -Math.PI / 4;
        ra.rotation.x = -Math.PI / 4;
        person.userData.walkPhase = 0;
        return;
    }

    if (person.userData.isWalking) {
        person.userData.walkPhase += dt * 8;
        var phase = person.userData.walkPhase;
        lg.rotation.x = Math.sin(phase) * 0.6;
        rg.rotation.x = -Math.sin(phase) * 0.6;
        la.rotation.x = -Math.sin(phase) * 0.5;
        ra.rotation.x = Math.sin(phase) * 0.5;
    } else {
        lg.rotation.x = 0;
        rg.rotation.x = 0;
        la.rotation.x = 0;
        ra.rotation.x = 0;
        person.userData.walkPhase = 0;
    }
}