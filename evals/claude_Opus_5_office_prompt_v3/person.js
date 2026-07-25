// person.js - person mesh factory + walk/sit animation.
// Classic browser script: no import / export. Globals are attached to window
// at the bottom of the file.

const PERSON_SHIRTS = [
    0x3b6ea5, 0xa8452f, 0x2f7a5a, 0x7a4a8c, 0xc4933f,
    0x4a5568, 0xb5566d, 0x2f8fa8, 0x8c6d3f, 0x5c7a3a,
    0xd06a3a, 0x415f9c
];
const PERSON_SKINS = [
    0xf1c9a5, 0xe0ac86, 0xc68a5f, 0x9c6b45, 0x7a4f31, 0x5c3a22
];
const PERSON_PANTS = [
    0x2c3242, 0x3f3f46, 0x5a4632, 0x24405c, 0x4a4a52, 0x6b5540
];

// Body metrics. Feet sit at local y = 0 so a person can be dropped straight
// onto a floor slab.
const PERSON_LEG_LEN = 0.74;
const PERSON_TORSO_H = 0.62;
const PERSON_ARM_LEN = 0.54;
const PERSON_HEAD_R = 0.16;

function personPick(palette, index) {
    if (typeof index === "number" && index >= 0) {
        return palette[index % palette.length];
    }
    return palette[Math.floor(Math.random() * palette.length)];
}

function createPerson(options) {
    const opts = options || {};
    const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : personPick(PERSON_SHIRTS, -1);
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : personPick(PERSON_SKINS, -1);
    const legColor = opts.legColor !== undefined ? opts.legColor : personPick(PERSON_PANTS, -1);

    const person = new THREE.Group();

    const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: legColor });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1f });

    // ---- legs: each leg is its own group pivoting at the hip -------------
    const hipY = PERSON_LEG_LEN;
    const legGeo = new THREE.CylinderGeometry(0.095, 0.085, PERSON_LEG_LEN, 8);
    const shoeGeo = new THREE.BoxGeometry(0.17, 0.09, 0.27);

    function buildLeg(offsetX) {
        const legGroup = new THREE.Group();
        legGroup.position.set(offsetX, hipY, 0);
        const shin = new THREE.Mesh(legGeo, pantsMat);
        shin.position.y = -PERSON_LEG_LEN / 2;
        legGroup.add(shin);
        const shoe = new THREE.Mesh(shoeGeo, shoeMat);
        shoe.position.set(0, -PERSON_LEG_LEN + 0.045, 0.05);
        legGroup.add(shoe);
        return legGroup;
    }

    const leftLeg = buildLeg(-0.115);
    const rightLeg = buildLeg(0.115);
    person.add(leftLeg);
    person.add(rightLeg);

    // ---- torso -----------------------------------------------------------
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, PERSON_TORSO_H, 0.27),
        shirtMat
    );
    torso.position.y = hipY + PERSON_TORSO_H / 2;
    person.add(torso);

    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.065, 0.09, 8),
        skinMat
    );
    neck.position.y = hipY + PERSON_TORSO_H + 0.04;
    person.add(neck);

    // ---- arms: pivot at the shoulder ------------------------------------
    const shoulderY = hipY + PERSON_TORSO_H - 0.06;
    const armGeo = new THREE.CylinderGeometry(0.062, 0.055, PERSON_ARM_LEN, 8);

    function buildArm(offsetX) {
        const armGroup = new THREE.Group();
        armGroup.position.set(offsetX, shoulderY, 0);
        const upper = new THREE.Mesh(armGeo, shirtMat);
        upper.position.y = -PERSON_ARM_LEN / 2;
        armGroup.add(upper);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), skinMat);
        hand.position.y = -PERSON_ARM_LEN - 0.02;
        armGroup.add(hand);
        return armGroup;
    }

    const leftArm = buildArm(-0.285);
    const rightArm = buildArm(0.285);
    person.add(leftArm);
    person.add(rightArm);

    // ---- head + nose (reads facing direction from a top-down camera) -----
    const head = new THREE.Mesh(new THREE.SphereGeometry(PERSON_HEAD_R, 14, 12), skinMat);
    head.position.y = hipY + PERSON_TORSO_H + 0.09 + PERSON_HEAD_R;
    person.add(head);

    const hair = new THREE.Mesh(
        new THREE.SphereGeometry(PERSON_HEAD_R * 1.03, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: 0x24201c })
    );
    hair.position.copy(head.position);
    hair.position.y += 0.012;
    person.add(hair);

    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        skinMat
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, head.position.y - 0.01, PERSON_HEAD_R * 0.94);
    person.add(nose);

    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    person.userData.head = head;
    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;

    return person;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;
    const data = person.userData;
    const leftLeg = data.leftLeg;
    const rightLeg = data.rightLeg;
    const leftArm = data.leftArm;
    const rightArm = data.rightArm;
    if (!leftLeg || !rightLeg) return;

    if (data.isSitting) {
        // Thighs forward (feet point out in front of the body, toward the desk),
        // arms resting down and slightly forward.
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
        return;
    }

    if (data.isWalking) {
        data.walkPhase += dt * 8;
        const swing = Math.sin(data.walkPhase);
        leftLeg.rotation.x = swing * 0.6;
        rightLeg.rotation.x = -swing * 0.6;
        if (leftArm) leftArm.rotation.x = -swing * 0.5;
        if (rightArm) rightArm.rotation.x = swing * 0.5;
        return;
    }

    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    if (leftArm) leftArm.rotation.x = 0;
    if (rightArm) rightArm.rotation.x = 0;
    data.walkPhase = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
