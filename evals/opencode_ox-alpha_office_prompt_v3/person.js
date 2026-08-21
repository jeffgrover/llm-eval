const PERSON_SHIRT_COLORS = [0xd95f43, 0x4f9d8d, 0xd9a441, 0x7a9e4f, 0x8d6bb5, 0x5a7fb8, 0xc76b98, 0x9a8f6b, 0x4f7ea8, 0xb5723f];
const PERSON_SKIN_COLORS = [0xf1c7a3, 0xd9a06b, 0xb87a4e, 0x8d5a33, 0x6b4226, 0xf7d9bd];
const PERSON_PANT_COLORS = [0x2e3a52, 0x3c3f45, 0x6b5b3e, 0x50575e, 0x2f4a44, 0x44384f];

function createPerson(options) {
    const opts = options || {};
    const shirtColor = opts.bodyColor !== undefined ? opts.bodyColor : PERSON_SHIRT_COLORS[Math.floor(Math.random() * PERSON_SHIRT_COLORS.length)];
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : PERSON_SKIN_COLORS[Math.floor(Math.random() * PERSON_SKIN_COLORS.length)];
    const legColor = opts.legColor !== undefined ? opts.legColor : PERSON_PANT_COLORS[Math.floor(Math.random() * PERSON_PANT_COLORS.length)];
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const pantMat = new THREE.MeshLambertMaterial({ color: legColor });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x24262b });

    const group = new THREE.Group();

    function makeLeg(sideX) {
        const leg = new THREE.Group();
        leg.position.set(sideX, 0.8, 0);
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.74, 8), pantMat);
        limb.position.y = -0.37;
        leg.add(limb);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.24), shoeMat);
        foot.position.set(0, -0.77, 0.05);
        leg.add(foot);
        return leg;
    }
    const leftLeg = makeLeg(-0.11);
    const rightLeg = makeLeg(0.11);
    group.add(leftLeg);
    group.add(rightLeg);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), shirtMat);
    torso.position.y = 1.11;
    group.add(torso);

    function makeArm(sideX) {
        const arm = new THREE.Group();
        arm.position.set(sideX, 1.36, 0);
        const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8), shirtMat);
        limb.position.y = -0.3;
        arm.add(limb);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skinMat);
        hand.position.y = -0.62;
        arm.add(hand);
        return arm;
    }
    const leftArm = makeArm(-0.27);
    const rightArm = makeArm(0.27);
    group.add(leftArm);
    group.add(rightArm);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), skinMat);
    head.position.y = 1.58;
    group.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), skinMat);
    nose.position.set(0, 1.6, 0.16);
    group.add(nose);

    group.userData = {
        isWalking: false,
        isSitting: false,
        walkPhase: 0,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        leftArm: leftArm,
        rightArm: rightArm
    };
    return group;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (!ud || !ud.leftLeg) return;
    const k = dt > 0 ? Math.min(1, dt * 10) : 1;
    if (ud.isSitting) {
        ud.walkPhase = 0;
        ud.leftLeg.rotation.x += (-Math.PI / 2 - ud.leftLeg.rotation.x) * k;
        ud.rightLeg.rotation.x += (-Math.PI / 2 - ud.rightLeg.rotation.x) * k;
        ud.leftArm.rotation.x += (-Math.PI / 4 - ud.leftArm.rotation.x) * k;
        ud.rightArm.rotation.x += (-Math.PI / 4 - ud.rightArm.rotation.x) * k;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        ud.leftLeg.rotation.x = s * 0.6;
        ud.rightLeg.rotation.x = -s * 0.6;
        ud.leftArm.rotation.x = -s * 0.5;
        ud.rightArm.rotation.x = s * 0.5;
    } else {
        ud.leftLeg.rotation.x += (0 - ud.leftLeg.rotation.x) * k;
        ud.rightLeg.rotation.x += (0 - ud.rightLeg.rotation.x) * k;
        ud.leftArm.rotation.x += (0 - ud.leftArm.rotation.x) * k;
        ud.rightArm.rotation.x += (0 - ud.rightArm.rotation.x) * k;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
