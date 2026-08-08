// person.js - person mesh factory + walk/sit animation (classic script, no modules)

function createPerson(options) {
    options = options || {};

    const SHIRTS = [0x4477cc, 0xcc5544, 0x55aa66, 0xddaa33, 0x8855bb, 0x3fb0a8, 0xd06a9e, 0x6688dd];
    const SKINS = [0xf0c8a0, 0xd9a06b, 0xa86e3f, 0x8a5a34, 0xffdbac];
    const PANTS = [0x33415c, 0x4a3b2a, 0x2d2d33, 0x556b2f, 0x5a4632];

    const pick = function (palette, provided) {
        if (provided !== undefined && provided !== null) return provided;
        return palette[Math.floor(Math.random() * palette.length)];
    };

    const bodyColor = pick(SHIRTS, options.bodyColor);
    const skinColor = pick(SKINS, options.skinColor);
    const legColor = pick(PANTS, options.legColor);

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });

    const person = new THREE.Group();

    // Legs: each leg is a group pivoting at the hip (group origin at hip,
    // cylinder hanging below). Feet rest at local y = 0.
    const LEG_LEN = 0.6;
    const HIP_Y = LEG_LEN;

    const makeLeg = function (xOff) {
        const leg = new THREE.Group();
        leg.position.set(xOff, HIP_Y, 0);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, LEG_LEN, 8), legMat);
        cyl.position.y = -LEG_LEN / 2;
        leg.add(cyl);
        return leg;
    };
    const legL = makeLeg(-0.1);
    const legR = makeLeg(0.1);
    person.add(legL);
    person.add(legR);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), bodyMat);
    torso.position.y = HIP_Y + 0.25;
    person.add(torso);

    // Arms pivot at the shoulder, same pattern as legs
    const SHOULDER_Y = HIP_Y + 0.44;
    const ARM_LEN = 0.45;
    const makeArm = function (xOff) {
        const arm = new THREE.Group();
        arm.position.set(xOff, SHOULDER_Y, 0);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, ARM_LEN, 8), bodyMat);
        cyl.position.y = -ARM_LEN / 2;
        arm.add(cyl);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
        hand.position.y = -ARM_LEN;
        arm.add(hand);
        return arm;
    };
    const armL = makeArm(-0.23);
    const armR = makeArm(0.23);
    person.add(armL);
    person.add(armR);

    // Head with a nose on the +Z face so facing direction is readable
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
    head.position.y = SHOULDER_Y + 0.24;
    person.add(head);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
    nose.position.set(0, SHOULDER_Y + 0.22, 0.16);
    person.add(nose);

    person.userData.isSitting = false;
    person.userData.isWalking = false;
    person.userData.walkPhase = 0;
    person.userData.legL = legL;
    person.userData.legR = legR;
    person.userData.armL = armL;
    person.userData.armR = armR;

    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (!ud.legL) return;

    if (ud.isSitting) {
        // Seated: legs bent forward at the hip, arms resting slightly forward
        ud.legL.rotation.x = -Math.PI / 2;
        ud.legR.rotation.x = -Math.PI / 2;
        ud.armL.rotation.x = -Math.PI / 4;
        ud.armR.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        return;
    }

    if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        ud.legL.rotation.x = s * 0.6;
        ud.legR.rotation.x = -s * 0.6;
        ud.armL.rotation.x = -s * 0.5;
        ud.armR.rotation.x = s * 0.5;
        return;
    }

    ud.legL.rotation.x = 0;
    ud.legR.rotation.x = 0;
    ud.armL.rotation.x = 0;
    ud.armR.rotation.x = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
