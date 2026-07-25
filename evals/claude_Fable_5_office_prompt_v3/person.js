// person.js - person mesh factory + walk/sit animation (classic script, no modules)

const PERSON_SHIRT_PALETTE = [0xd94f4f, 0x4f7bd9, 0x4fd98a, 0xd9c04f, 0x9a4fd9, 0xd97f4f, 0x4fc9d9, 0xd94fa6, 0x7a8a99, 0x66aa44];
const PERSON_SKIN_PALETTE = [0xf1c8a5, 0xe0ac7e, 0xc68a5a, 0x8d5a3b, 0x6b4226, 0xffdbc4];
const PERSON_PANTS_PALETTE = [0x2f3a4a, 0x4a3a2f, 0x33334a, 0x223322, 0x555566, 0x3a2f4a];

function createPerson(opts) {
    opts = opts || {};
    const bodyColor = (opts.bodyColor !== undefined) ? opts.bodyColor
        : PERSON_SHIRT_PALETTE[Math.floor(Math.random() * PERSON_SHIRT_PALETTE.length)];
    const skinColor = (opts.skinColor !== undefined) ? opts.skinColor
        : PERSON_SKIN_PALETTE[Math.floor(Math.random() * PERSON_SKIN_PALETTE.length)];
    const legColor = (opts.legColor !== undefined) ? opts.legColor
        : PERSON_PANTS_PALETTE[Math.floor(Math.random() * PERSON_PANTS_PALETTE.length)];

    const person = new THREE.Group();

    const legLen = 0.55;
    const torsoH = 0.55;
    const headR = 0.16;
    const hipY = legLen;                 // hips at top of legs
    const shoulderY = hipY + torsoH;     // shoulders at top of torso

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });

    // Legs: each a group with origin at the hip, cylinder hanging below.
    function makeLeg(xOff) {
        const g = new THREE.Group();
        g.position.set(xOff, hipY, 0);
        const geo = new THREE.CylinderGeometry(0.07, 0.06, legLen, 8);
        const mesh = new THREE.Mesh(geo, legMat);
        mesh.position.y = -legLen / 2;
        g.add(mesh);
        return g;
    }
    const legL = makeLeg(-0.11);
    const legR = makeLeg(0.11);
    person.add(legL);
    person.add(legR);

    // Torso
    const torsoGeo = new THREE.CylinderGeometry(0.16, 0.20, torsoH, 10);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = hipY + torsoH / 2;
    person.add(torso);

    // Arms: groups with origin at the shoulder.
    const armLen = 0.48;
    function makeArm(xOff) {
        const g = new THREE.Group();
        g.position.set(xOff, shoulderY - 0.04, 0);
        const geo = new THREE.CylinderGeometry(0.05, 0.045, armLen, 8);
        const mesh = new THREE.Mesh(geo, bodyMat);
        mesh.position.y = -armLen / 2;
        g.add(mesh);
        return g;
    }
    const armL = makeArm(-0.24);
    const armR = makeArm(0.24);
    person.add(armL);
    person.add(armR);

    // Head + nose on the +Z face so facing reads from above.
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), skinMat);
    head.position.y = shoulderY + headR + 0.05;
    person.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, head.position.y, headR + 0.02);
    person.add(nose);

    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = Math.random() * Math.PI * 2;
    person.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };

    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (!ud || !ud.limbs) { return; }
    const limbs = ud.limbs;
    if (ud.isSitting) {
        // Legs forward (feet toward +Z relative to body), arms relaxed.
        limbs.legL.rotation.x = -Math.PI / 2;
        limbs.legR.rotation.x = -Math.PI / 2;
        limbs.armL.rotation.x = -Math.PI / 4;
        limbs.armR.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        limbs.legL.rotation.x = s * 0.6;
        limbs.legR.rotation.x = -s * 0.6;
        limbs.armL.rotation.x = -s * 0.5;
        limbs.armR.rotation.x = s * 0.5;
    } else {
        limbs.legL.rotation.x = 0;
        limbs.legR.rotation.x = 0;
        limbs.armL.rotation.x = 0;
        limbs.armR.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
