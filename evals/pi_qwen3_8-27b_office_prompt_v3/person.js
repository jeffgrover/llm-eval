/**
 * person.js - person mesh factory + per-frame walk/sit animation.
 * Feet sit at local y=0 (the group origin). Legs pivot at the hip, arms at
 * the shoulder, so walk/sit is a simple rotation.x tween at each pivot.
 * A small hemisphere nose on the +Z face of the head makes facing readable.
 */

const PERSON_SHIRT_COLORS = [0x3d6cb9, 0xb8543f, 0x4f9d69, 0xc2a53c, 0x7d5ba6, 0xd97b8f];
const PERSON_SKIN_COLORS = [0xf2c6a0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423];
const PERSON_PANTS_COLORS = [0x2e3440, 0x3f4a5a, 0x4a4034, 0x274156, 0x393939];

function pickPersonColor(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

function createPerson(options) {
    options = options || {};
    const bodyColor = (typeof options.bodyColor === "number") ? options.bodyColor : pickPersonColor(PERSON_SHIRT_COLORS);
    const skinColor = (typeof options.skinColor === "number") ? options.skinColor : pickPersonColor(PERSON_SKIN_COLORS);
    const legColor = (typeof options.legColor === "number") ? options.legColor : pickPersonColor(PERSON_PANTS_COLORS);

    const person = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });

    // ---- legs (pivot at hip, y=0.8; feet reach local y=0) ----
    function makeLeg(sideX) {
        const leg = new THREE.Group();
        leg.position.set(sideX, 0.8, 0);
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.8, 8), legMat);
        limb.position.set(0, -0.4, 0);
        leg.add(limb);
        // small foot box pointing forward (+Z) so the gait reads from above
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.24), legMat);
        foot.position.set(0, -0.78, 0.06);
        leg.add(foot);
        return leg;
    }
    const leftLeg = makeLeg(-0.12);
    const rightLeg = makeLeg(0.12);
    person.add(leftLeg);
    person.add(rightLeg);

    // ---- torso (hips 0.8 -> shoulders ~1.34) ----
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.56, 10), bodyMat);
    torso.position.set(0, 1.1, 0);
    person.add(torso);

    // ---- arms (pivot at shoulder) ----
    function makeArm(sideX) {
        const arm = new THREE.Group();
        arm.position.set(sideX, 1.3, 0);
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.54, 8), bodyMat);
        limb.position.set(0, -0.27, 0);
        arm.add(limb);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
        hand.position.set(0, -0.56, 0);
        arm.add(hand);
        return arm;
    }
    const leftArm = makeArm(-0.3);
    const rightArm = makeArm(0.3);
    person.add(leftArm);
    person.add(rightArm);

    // ---- head with +Z nose ----
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), skinMat);
    head.position.set(0, 1.52, 0);
    person.add(head);
    const noseGeo = new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.rotation.x = Math.PI / 2; // flat side toward +Z, bump forward
    nose.position.set(0, 1.53, 0.16);
    person.add(nose);

    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    person.userData.walkPhase = 0;
    person.userData.isSitting = false;
    person.userData.isWalking = false;

    return person;
}

function animatePersonWalking(person, dt) {
    const data = person.userData;
    const leftLeg = data.leftLeg;
    const rightLeg = data.rightLeg;
    const leftArm = data.leftArm;
    const rightArm = data.rightArm;
    if (!leftLeg || !rightLeg) return;

    if (data.isSitting) {
        // Legs horizontal with feet forward (+Z), arms resting toward the desk.
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
    } else if (data.isWalking) {
        data.walkPhase += dt * 8;
        const swing = Math.sin(data.walkPhase) * 0.6;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -Math.sin(data.walkPhase) * 0.5;
        if (rightArm) rightArm.rotation.x = Math.sin(data.walkPhase) * 0.5;
    } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
        data.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
