var SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd35400, 0x16a085, 0xc0392b, 0x7f8c8d, 0x2c3e50, 0xf1c40f, 0x95a5a6, 0x34495e, 0xe91e63, 0x00bcd4];
var SKIN_COLORS = [0xf5d0a9, 0xe8b88a, 0xd4a574, 0xc49a6c, 0xb8855a, 0xa87550, 0x8b5e3c, 0x6d4c2a, 0x5a3e24, 0x3e2a18];
var PANTS_COLORS = [0x2c3e50, 0x34495e, 0x1a1a2e, 0x3d3d5c, 0x4a4a4a, 0x5a5a5a, 0x2d2d3f, 0x1e2a3a, 0x3b2f2f, 0x2f2f3b];

function createPerson(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    var skinColor = opts.skinColor !== undefined ? opts.skinColor : SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)];
    var legColor = opts.legColor !== undefined ? opts.legColor : PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];

    var group = new THREE.Group();
    group.userData.isSitting = false;
    group.userData.isWalking = false;
    group.userData.walkPhase = 0;

    // Left leg - pivot at hip
    var leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.14, 0.7, 0);
    var leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.7, 8), new THREE.MeshLambertMaterial({ color: legColor }));
    leftLeg.position.y = -0.35;
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);
    group.add(leftLegPivot);

    // Right leg
    var rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.14, 0.7, 0);
    var rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.7, 8), new THREE.MeshLambertMaterial({ color: legColor }));
    rightLeg.position.y = -0.35;
    rightLeg.castShadow = true;
    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);

    // Torso
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), new THREE.MeshLambertMaterial({ color: bodyColor }));
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);

    // Left arm - pivot at shoulder
    var leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.35, 0);
    var leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.55, 6), new THREE.MeshLambertMaterial({ color: skinColor }));
    leftArm.position.y = -0.275;
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);
    group.add(leftArmPivot);

    // Right arm
    var rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 1.35, 0);
    var rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.55, 6), new THREE.MeshLambertMaterial({ color: skinColor }));
    rightArm.position.y = -0.275;
    rightArm.castShadow = true;
    rightArmPivot.add(rightArm);
    group.add(rightArmPivot);

    // Head
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshLambertMaterial({ color: skinColor }));
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);

    // Nose (hemisphere on +Z face)
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshLambertMaterial({ color: skinColor }));
    nose.position.set(0, 1.5, 0.15);
    nose.scale.set(0.6, 0.5, 0.8);
    group.add(nose);

    group.userData.leftLegPivot = leftLegPivot;
    group.userData.rightLegPivot = rightLegPivot;
    group.userData.leftArmPivot = leftArmPivot;
    group.userData.rightArmPivot = rightArmPivot;

    return group;
}

function animatePersonWalking(personGroup, dt) {
    if (!personGroup) return;
    var ud = personGroup.userData;
    var leftLeg = ud.leftLegPivot;
    var rightLeg = ud.rightLegPivot;
    var leftArm = ud.leftArmPivot;
    var rightArm = ud.rightArmPivot;
    if (!leftLeg || !rightLeg) return;

    if (ud.isSitting) {
        // Legs forward, arms down
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        return;
    }

    if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        var phase = ud.walkPhase;
        leftLeg.rotation.x = Math.sin(phase) * 0.6;
        rightLeg.rotation.x = -Math.sin(phase) * 0.6;
        if (leftArm) leftArm.rotation.x = -Math.sin(phase) * 0.5;
        if (rightArm) rightArm.rotation.x = Math.sin(phase) * 0.5;
    } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        if (leftArm) leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;