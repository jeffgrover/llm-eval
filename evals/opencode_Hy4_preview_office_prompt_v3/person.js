/* person.js - person mesh factory + walk/sit animation.
   Classic browser script: no import/export. Exposes window.createPerson and
   window.animatePersonWalking. */

const SHIRT_COLORS = [
    0x4f7cac, 0xc0504d, 0x9bbb59, 0x8064a2, 0x4bacc6,
    0xf79646, 0xd99694, 0x7f7f7f, 0x5f497a, 0x2e6b4f,
    0xb55088, 0x3c6e9f
];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0bd, 0xa9714b];
const PANTS_COLORS = [0x33383f, 0x4a4f56, 0x2f3b52, 0x594a3c, 0x3d3d4b, 0x232323];

const PERSON_HIP_Y = 0.85;
const PERSON_THIGH_LEN = 0.42;
const PERSON_SHIN_LEN = 0.42;
const PERSON_SHOULDER_Y = 1.38;
const PERSON_ARM_LEN = 0.42;

function pickPersonColor(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function makeLimbMaterial(color) {
    return new THREE.MeshLambertMaterial({ color: color });
}

function createPerson(options) {
    const opts = options || {};
    const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pickPersonColor(SHIRT_COLORS);
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickPersonColor(SKIN_COLORS);
    const legColor = opts.legColor !== undefined ? opts.legColor : pickPersonColor(PANTS_COLORS);

    const shirtMat = makeLimbMaterial(bodyColor);
    const skinMat = makeLimbMaterial(skinColor);
    const pantsMat = makeLimbMaterial(legColor);
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x2b2118 });

    const group = new THREE.Group();

    // ---- torso -------------------------------------------------------
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), shirtMat);
    torso.position.set(0, PERSON_HIP_Y + 0.31, 0);
    group.add(torso);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.23), pantsMat);
    hips.position.set(0, PERSON_HIP_Y - 0.04, 0);
    group.add(hips);

    // ---- head --------------------------------------------------------
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinMat);
    head.position.set(0, 1.62, 0);
    group.add(head);

    const noseGeo = new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.60, 0.15);
    group.add(nose);

    const hairGeo = new THREE.SphereGeometry(0.158, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 1.63, 0);
    group.add(hair);

    // ---- legs (pivot at the hip, hanging below) -----------------------
    function buildLeg(side) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.11, PERSON_HIP_Y, 0);
        const thigh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.075, 0.07, PERSON_THIGH_LEN, 8),
            pantsMat
        );
        thigh.position.set(0, -PERSON_THIGH_LEN / 2, 0);
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.set(0, -PERSON_THIGH_LEN, 0);
        const shin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.065, 0.06, PERSON_SHIN_LEN, 8),
            pantsMat
        );
        shin.position.set(0, -PERSON_SHIN_LEN / 2, 0);
        knee.add(shin);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.24), hairMat);
        foot.position.set(0, -PERSON_SHIN_LEN - 0.02, 0.05);
        knee.add(foot);

        hip.add(knee);
        hip.userData.knee = knee;
        group.add(hip);
        return hip;
    }

    // ---- arms (pivot at the shoulder, hanging below) ------------------
    function buildArm(side) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.27, PERSON_SHOULDER_Y, 0);
        const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.058, 0.05, PERSON_ARM_LEN, 8),
            side > 0 ? shirtMat : shirtMat
        );
        arm.position.set(0, -PERSON_ARM_LEN / 2, 0);
        shoulder.add(arm);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skinMat);
        hand.position.set(0, -PERSON_ARM_LEN - 0.02, 0);
        shoulder.add(hand);
        group.add(shoulder);
        return shoulder;
    }

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);
    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

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
    if (!person || !person.userData) return;
    const data = person.userData;
    const leftLeg = data.leftLeg;
    const rightLeg = data.rightLeg;
    const leftArm = data.leftArm;
    const rightArm = data.rightArm;
    if (!leftLeg || !rightLeg) return;

    if (data.isSitting) {
        // Hips bent, thighs forward (toward +Z local = the facing direction),
        // shins hanging straight down so the feet rest on the floor.
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        if (leftLeg.userData.knee) leftLeg.userData.knee.rotation.x = Math.PI / 2;
        if (rightLeg.userData.knee) rightLeg.userData.knee.rotation.x = Math.PI / 2;
        leftArm.rotation.x = -Math.PI / 4;
        rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
        data.isWalking = false;
        return;
    }

    if (data.isWalking) {
        data.walkPhase += dt * 8;
        const swing = Math.sin(data.walkPhase) * 0.6;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        if (leftLeg.userData.knee) {
            leftLeg.userData.knee.rotation.x = Math.max(0, -swing) * 0.8;
        }
        if (rightLeg.userData.knee) {
            rightLeg.userData.knee.rotation.x = Math.max(0, swing) * 0.8;
        }
        leftArm.rotation.x = -Math.sin(data.walkPhase) * 0.5;
        rightArm.rotation.x = Math.sin(data.walkPhase) * 0.5;
        return;
    }

    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    if (leftLeg.userData.knee) leftLeg.userData.knee.rotation.x = 0;
    if (rightLeg.userData.knee) rightLeg.userData.knee.rotation.x = 0;
    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
    data.walkPhase = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
