// person.js - person mesh factory + walk/sit animation (classic script, no ES modules)

const PERSON_SHIRT_COLORS = [0xd1495b, 0x2e86ab, 0x2f9c5b, 0xf4a259, 0x6a4c93, 0x4d4d4d, 0xc44536, 0x1b998b, 0xe0a458, 0x5c80bc];
const PERSON_SKIN_TONES = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21];
const PERSON_PANTS_COLORS = [0x2b2d42, 0x3a3a3a, 0x4a4e69, 0x22223b, 0x1d3557, 0x555555];

function pickPersonColor(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

function createPerson(options) {
    const opts = options || {};
    const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pickPersonColor(PERSON_SHIRT_COLORS);
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickPersonColor(PERSON_SKIN_TONES);
    const legColor = opts.legColor !== undefined ? opts.legColor : pickPersonColor(PERSON_PANTS_COLORS);

    const person = new THREE.Group();
    person.userData.isSitting = false;
    person.userData.isWalking = false;
    person.userData.walkPhase = Math.random() * Math.PI * 2;

    const legMat = new THREE.MeshLambertMaterial({ color: legColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });

    const hipY = 0.5;
    const legLength = 0.5;
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, legLength, 8);
    const footGeo = new THREE.BoxGeometry(0.13, 0.06, 0.22);

    function makeLeg(xOff) {
        const hip = new THREE.Group();
        hip.position.set(xOff, hipY, 0);
        const legMesh = new THREE.Mesh(legGeo, legMat);
        legMesh.position.set(0, -legLength / 2, 0);
        hip.add(legMesh);
        const foot = new THREE.Mesh(footGeo, skinMat);
        foot.position.set(0, -legLength - 0.03, 0.05);
        hip.add(foot);
        return hip;
    }
    const legL = makeLeg(-0.11);
    const legR = makeLeg(0.11);
    person.add(legL, legR);

    const torsoGeo = new THREE.BoxGeometry(0.42, 0.55, 0.24);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, hipY + 0.275, 0);
    person.add(torso);

    const shoulderY = hipY + 0.5;
    const armLength = 0.45;
    const armGeo = new THREE.CylinderGeometry(0.07, 0.07, armLength, 8);
    const handGeo = new THREE.SphereGeometry(0.07, 8, 8);

    function makeArm(xOff) {
        const shoulder = new THREE.Group();
        shoulder.position.set(xOff, shoulderY, 0);
        const armMesh = new THREE.Mesh(armGeo, shirtMat);
        armMesh.position.set(0, -armLength / 2, 0);
        shoulder.add(armMesh);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -armLength, 0);
        shoulder.add(hand);
        return shoulder;
    }
    const armL = makeArm(-0.27);
    const armR = makeArm(0.27);
    person.add(armL, armR);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, shoulderY + 0.22, 0);
    const headGeo = new THREE.SphereGeometry(0.18, 12, 10);
    const head = new THREE.Mesh(headGeo, skinMat);
    headGroup.add(head);
    const noseGeo = new THREE.SphereGeometry(0.055, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, 0.01, 0.16);
    nose.rotation.x = Math.PI / 2;
    headGroup.add(nose);
    person.add(headGroup);

    person.userData.legL = legL;
    person.userData.legR = legR;
    person.userData.armL = armL;
    person.userData.armR = armR;
    person.userData.head = headGroup;
    person.userData.baseY = 0;

    person.castShadow = false;
    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (ud.isSitting) {
        ud.legL.rotation.x = -Math.PI / 2;
        ud.legR.rotation.x = -Math.PI / 2;
        ud.armL.rotation.x = -Math.PI / 4;
        ud.armR.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const swing = Math.sin(ud.walkPhase) * 0.6;
        const armSwing = Math.sin(ud.walkPhase) * 0.5;
        ud.legL.rotation.x = swing;
        ud.legR.rotation.x = -swing;
        ud.armL.rotation.x = -armSwing;
        ud.armR.rotation.x = armSwing;
    } else {
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
        ud.armL.rotation.x = 0;
        ud.armR.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
