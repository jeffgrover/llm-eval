const SHIRT_COLORS = [0xeeeeee, 0x334455, 0x883333, 0x338833, 0x886622, 0x336688, 0x664488, 0xaaaaaa];
const SKIN_COLORS = [0xffddcc, 0xeebbaa, 0xcc9977, 0xaa7755, 0x885533, 0x663311];
const PANT_COLORS = [0x222222, 0x111133, 0x443322, 0x334444, 0x555555];

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createPerson(opts = {}) {
    const group = new THREE.Group();
    group.userData = { isSitting: false, isWalking: false, walkPhase: Math.random() * Math.PI * 2 };

    const bodyColor = opts.bodyColor || randomChoice(SHIRT_COLORS);
    const skinColor = opts.skinColor || randomChoice(SKIN_COLORS);
    const legColor = opts.legColor || randomChoice(PANT_COLORS);

    const matBody = new THREE.MeshLambertMaterial({ color: bodyColor });
    const matSkin = new THREE.MeshLambertMaterial({ color: skinColor });
    const matLegs = new THREE.MeshLambertMaterial({ color: legColor });

    const legW = 0.15, legH = 0.5, legD = 0.15;
    const torsoW = 0.4, torsoH = 0.6, torsoD = 0.25;
    const headS = 0.25;
    const armW = 0.12, armH = 0.5, armD = 0.12;

    const legGeo = new THREE.BoxGeometry(legW, legH, legD);
    
    // Hip origin for legs
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, legH, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, matLegs);
    leftLegMesh.position.y = -legH / 2;
    leftLegGroup.add(leftLegMesh);
    
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, legH, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, matLegs);
    rightLegMesh.position.y = -legH / 2;
    rightLegGroup.add(rightLegMesh);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
    const torso = new THREE.Mesh(torsoGeo, matBody);
    torso.position.y = legH + torsoH / 2;

    // Arms
    const armGeo = new THREE.BoxGeometry(armW, armH, armD);
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-torsoW / 2 - armW / 2, legH + torsoH - 0.05, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, matBody);
    leftArmMesh.position.y = -armH / 2;
    leftArmGroup.add(leftArmMesh);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(torsoW / 2 + armW / 2, legH + torsoH - 0.05, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, matBody);
    rightArmMesh.position.y = -armH / 2;
    rightArmGroup.add(rightArmMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(headS, headS, headS);
    const head = new THREE.Mesh(headGeo, matSkin);
    head.position.y = legH + torsoH + headS / 2;

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const nose = new THREE.Mesh(noseGeo, matSkin);
    nose.position.set(0, 0, headS / 2 + 0.02);
    head.add(nose);

    group.add(leftLegGroup);
    group.add(rightLegGroup);
    group.add(torso);
    group.add(leftArmGroup);
    group.add(rightArmGroup);
    group.add(head);

    group.userData.leftLeg = leftLegGroup;
    group.userData.rightLeg = rightLegGroup;
    group.userData.leftArm = leftArmGroup;
    group.userData.rightArm = rightArmGroup;

    return group;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (ud.isSitting) {
        ud.walkPhase = 0;
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const legSwing = Math.sin(ud.walkPhase) * 0.6;
        const armSwing = -Math.sin(ud.walkPhase) * 0.5;
        ud.leftLeg.rotation.x = legSwing;
        ud.rightLeg.rotation.x = -legSwing;
        ud.leftArm.rotation.x = armSwing;
        ud.rightArm.rotation.x = -armSwing;
    } else {
        ud.leftLeg.rotation.x = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x = 0;
        ud.rightArm.rotation.x = 0;
    }
}
