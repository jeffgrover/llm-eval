function createPerson(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor || 0x4488cc;
    var skinColor = opts.skinColor || 0xffdbac;
    var legColor = opts.legColor || 0x333333;

    var shirtPalette = [0x4488cc, 0xcc4444, 0x44aa44, 0x8855cc, 0xcc8844, 0x44cccc, 0xcc44aa, 0xaaaa44];
    var skinPalette = [0xffdbac, 0xe8b899, 0xc68642, 0x8d5524, 0xf0c8a0, 0xd4a574];
    var pantsPalette = [0x222222, 0x334466, 0x553322, 0x333333, 0x224422, 0x444466];
    if (!opts.bodyColor) bodyColor = shirtPalette[Math.floor(Math.random() * shirtPalette.length)];
    if (!opts.skinColor) skinColor = skinPalette[Math.floor(Math.random() * skinPalette.length)];
    if (!opts.legColor) legColor = pantsPalette[Math.floor(Math.random() * pantsPalette.length)];

    var group = new THREE.Group();

    // Legs - each is a Group pivoting at hip
    var legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.5, 8);
    legGeo.translate(0, -0.25, 0);

    var leftLeg = new THREE.Group();
    var leftLegMesh = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: legColor }));
    leftLeg.add(leftLegMesh);
    leftLeg.position.set(-0.12, 0.5, 0);
    group.add(leftLeg);

    var rightLeg = new THREE.Group();
    var rightLegMesh = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: legColor }));
    rightLeg.add(rightLegMesh);
    rightLeg.position.set(0.12, 0.5, 0);
    group.add(rightLeg);

    // Shoes
    var shoeGeo = new THREE.BoxGeometry(0.12, 0.06, 0.22);
    var shoeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var ls = new THREE.Mesh(shoeGeo, shoeMat);
    ls.position.set(0, -0.48, 0.04);
    leftLeg.add(ls);
    var rs = new THREE.Mesh(shoeGeo, shoeMat);
    rs.position.set(0, -0.48, 0.04);
    rightLeg.add(rs);

    // Torso
    var torsoGeo = new THREE.BoxGeometry(0.4, 0.5, 0.22);
    var torso = new THREE.Mesh(torsoGeo, new THREE.MeshLambertMaterial({ color: bodyColor }));
    torso.position.set(0, 0.75, 0);
    group.add(torso);

    // Arms
    var armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
    armGeo.translate(0, -0.2, 0);
    var leftArm = new THREE.Group();
    var leftArmMesh = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: skinColor }));
    leftArm.add(leftArmMesh);
    leftArm.position.set(-0.26, 0.95, 0);
    group.add(leftArm);

    var rightArm = new THREE.Group();
    var rightArmMesh = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: skinColor }));
    rightArm.add(rightArmMesh);
    rightArm.position.set(0.26, 0.95, 0);
    group.add(rightArm);

    // Head
    var headGeo = new THREE.SphereGeometry(0.18, 12, 12);
    var head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: skinColor }));
    head.position.set(0, 1.18, 0);
    group.add(head);

    // Nose
    var noseGeo = new THREE.SphereGeometry(0.05, 8, 8);
    noseGeo.scale(1, 1, 1.6);
    var nose = new THREE.Mesh(noseGeo, new THREE.MeshLambertMaterial({ color: skinColor }));
    nose.position.set(0, 1.18, 0.17);
    group.add(nose);

    group.userData.leftLeg = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = Math.random() * Math.PI * 2;

    return group;
}

function animatePersonWalking(person, dt) {
    var ud = person.userData;
    if (ud.isSitting) {
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        ud.leftLeg.rotation.x = Math.sin(ud.walkPhase) * 0.6;
        ud.rightLeg.rotation.x = Math.sin(ud.walkPhase + Math.PI) * 0.6;
        ud.leftArm.rotation.x = -Math.sin(ud.walkPhase) * 0.5;
        ud.rightArm.rotation.x = -Math.sin(ud.walkPhase + Math.PI) * 0.5;
    } else {
        ud.leftLeg.rotation.x = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x = 0;
        ud.rightArm.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
