const SHIRT_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd35400, 0x16a085, 0xf1c40f, 0x2c3e50, 0xe74c3c, 0x7f8c8d];
const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS_COLORS = [0x2c3e50, 0x34495e, 0x4a4a4a, 0x5d4037, 0x1e3a5f, 0x37474f];

function createPerson(options) {
    const opts = options || {};
    const shirtColor = opts.bodyColor !== undefined ? opts.bodyColor : SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const legColor = opts.legColor !== undefined ? opts.legColor : PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];

    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });

    const person = new THREE.Group();

    const legL = new THREE.Group();
    legL.position.set(-0.14, 0.95, 0);
    const legLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), legMat);
    legLMesh.position.y = -0.4;
    legL.add(legLMesh);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.32), shoeMat);
    shoeL.position.set(0, -0.78, 0.06);
    legL.add(shoeL);
    person.add(legL);

    const legR = new THREE.Group();
    legR.position.set(0.14, 0.95, 0);
    const legRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), legMat);
    legRMesh.position.y = -0.4;
    legR.add(legRMesh);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.32), shoeMat);
    shoeR.position.set(0, -0.78, 0.06);
    legR.add(shoeR);
    person.add(legR);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.62, 10), shirtMat);
    torso.position.y = 1.26;
    person.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
    head.position.y = 1.78;
    person.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skinMat);
    nose.position.set(0, 1.8, 0.18);
    person.add(nose);

    const armL = new THREE.Group();
    armL.position.set(-0.33, 1.5, 0);
    const armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8), shirtMat);
    armLMesh.position.y = -0.275;
    armL.add(armLMesh);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), skinMat);
    handL.position.y = -0.55;
    armL.add(handL);
    person.add(armL);

    const armR = new THREE.Group();
    armR.position.set(0.33, 1.5, 0);
    const armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8), shirtMat);
    armRMesh.position.y = -0.275;
    armR.add(armRMesh);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), skinMat);
    handR.position.y = -0.55;
    armR.add(handR);
    person.add(armR);

    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;
    person.userData.legL = legL;
    person.userData.legR = legR;
    person.userData.armL = armL;
    person.userData.armR = armR;

    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    const legL = ud.legL;
    const legR = ud.legR;
    const armL = ud.armL;
    const armR = ud.armR;
    if (!legL || !legR || !armL || !armR) return;
    if (ud.isSitting) {
        legL.rotation.x = -Math.PI / 2;
        legR.rotation.x = -Math.PI / 2;
        armL.rotation.x = -Math.PI / 4;
        armR.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const swing = Math.sin(ud.walkPhase);
        legL.rotation.x = swing * 0.6;
        legR.rotation.x = -swing * 0.6;
        armL.rotation.x = -swing * 0.5;
        armR.rotation.x = swing * 0.5;
    } else {
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        armL.rotation.x = 0;
        armR.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
