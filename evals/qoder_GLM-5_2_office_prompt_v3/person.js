// person.js - person mesh factory + walk/sit animation
// Loaded as a classic browser script. Exposes globals on window.

const SHIRT_PALETTE = [0x3b6ea5, 0xb5483b, 0x3b8a5a, 0xb5913b, 0x6a3bb5, 0xb53b8a, 0x2c3e50, 0x7a5230];
const SKIN_PALETTE = [0xf1c9a5, 0xe0ac84, 0xc68642, 0x8d5524, 0xffdbac, 0xa9744f];
const PANTS_PALETTE = [0x2b2b3a, 0x3a2b22, 0x22303a, 0x4a4a52, 0x1a1a1a, 0x5a4632];

function makeLimb(radius, length, color) {
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(radius, radius * 0.82, length, 8);
    const mat = new THREE.MeshLambertMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -length / 2;
    mesh.renderOrder = 1;
    group.add(mesh);
    return group;
}

function createPerson(opts) {
    opts = opts || {};
    const bodyColor = opts.bodyColor != null ? opts.bodyColor : SHIRT_PALETTE[Math.floor(Math.random() * SHIRT_PALETTE.length)];
    const skinColor = opts.skinColor != null ? opts.skinColor : SKIN_PALETTE[Math.floor(Math.random() * SKIN_PALETTE.length)];
    const legColor = opts.legColor != null ? opts.legColor : PANTS_PALETTE[Math.floor(Math.random() * PANTS_PALETTE.length)];

    const person = new THREE.Group();

    const HIP_Y = 0.9;
    const SHOULDER_Y = 1.42;
    const LEG_LEN = 0.9;
    const ARM_LEN = 0.52;
    const LEG_R = 0.14;
    const ARM_R = 0.1;

    // Legs pivot at the hip (group origin at hip), cylinder hangs below.
    const leftLeg = makeLimb(LEG_R, LEG_LEN, legColor);
    leftLeg.position.set(-0.14, HIP_Y, 0);
    person.add(leftLeg);

    const rightLeg = makeLimb(LEG_R, LEG_LEN, legColor);
    rightLeg.position.set(0.14, HIP_Y, 0);
    person.add(rightLeg);

    // Feet (small boxes) at the bottom of each leg, local to the leg group.
    const footMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.3), footMat);
    leftFoot.position.set(0, -LEG_LEN + 0.045, 0.07);
    leftFoot.renderOrder = 1;
    leftLeg.add(leftFoot);
    const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.3), footMat);
    rightFoot.position.set(0, -LEG_LEN + 0.045, 0.07);
    rightFoot.renderOrder = 1;
    rightLeg.add(rightFoot);

    // Torso
    const torsoMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.3), torsoMat);
    torso.position.set(0, HIP_Y + 0.28, 0);
    torso.renderOrder = 1;
    person.add(torso);

    // Arms pivot at the shoulder.
    const leftArm = makeLimb(ARM_R, ARM_LEN, bodyColor);
    leftArm.position.set(-0.32, SHOULDER_Y, 0);
    person.add(leftArm);
    const rightArm = makeLimb(ARM_R, ARM_LEN, bodyColor);
    rightArm.position.set(0.32, SHOULDER_Y, 0);
    person.add(rightArm);

    // Hands
    const handMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(ARM_R * 1.05, 8, 6), handMat);
    leftHand.position.set(0, -ARM_LEN, 0);
    leftHand.renderOrder = 1;
    leftArm.add(leftHand);
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(ARM_R * 1.05, 8, 6), handMat);
    rightHand.position.set(0, -ARM_LEN, 0);
    rightHand.renderOrder = 1;
    rightArm.add(rightHand);

    // Neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), new THREE.MeshLambertMaterial({ color: skinColor }));
    neck.position.set(0, SHOULDER_Y + 0.1, 0);
    neck.renderOrder = 1;
    person.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), new THREE.MeshLambertMaterial({ color: skinColor }));
    head.position.set(0, SHOULDER_Y + 0.31, 0);
    head.renderOrder = 1;
    person.add(head);

    // Nose hemisphere on +Z face so facing direction reads from top-down.
    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    nose.position.set(0, SHOULDER_Y + 0.31, 0.17);
    nose.rotation.x = -Math.PI / 2;
    nose.renderOrder = 1;
    person.add(nose);

    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;
    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;

    return person;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;
    const ud = person.userData;
    const leftLeg = ud.leftLeg;
    const rightLeg = ud.rightLeg;
    const leftArm = ud.leftArm;
    const rightArm = ud.rightArm;
    if (ud.isSitting) {
        if (leftLeg) leftLeg.rotation.x = -Math.PI / 2;
        if (rightLeg) rightLeg.rotation.x = -Math.PI / 2;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const swing = Math.sin(ud.walkPhase) * 0.6;
        const armSwing = -Math.sin(ud.walkPhase) * 0.5;
        if (leftLeg) leftLeg.rotation.x = swing;
        if (rightLeg) rightLeg.rotation.x = -swing;
        if (leftArm) leftArm.rotation.x = armSwing;
        if (rightArm) rightArm.rotation.x = -armSwing;
    } else {
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
        if (leftArm) leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
