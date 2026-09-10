// person.js - person mesh factory + walk/sit animation (browser global, no modules)
// Body assembled from primitives, feet at local y=0. Legs pivot at the hip,
// arms pivot at the shoulder, so walk/sit animation is a simple rotation.x tween.

const PERSON_SHIRT_COLORS = [0xd8574c, 0x3f7fbf, 0x4caf6e, 0xd9a441, 0x8e6fbf, 0x3aa6a0, 0xcc6688, 0x8a8f98];
const PERSON_SKIN_COLORS = [0xf1c7a3, 0xd9a06b, 0xa8703f, 0x7a4a26, 0xf7d7c4];
const PERSON_PANTS_COLORS = [0x2c3550, 0x4a4a55, 0x5d4a36, 0x2f4f3f, 0x333333];

function personPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createPerson(opts) {
    opts = opts || {};
    const shirtMat = new THREE.MeshLambertMaterial({
        color: opts.bodyColor !== undefined ? opts.bodyColor : personPick(PERSON_SHIRT_COLORS)
    });
    const skinMat = new THREE.MeshLambertMaterial({
        color: opts.skinColor !== undefined ? opts.skinColor : personPick(PERSON_SKIN_COLORS)
    });
    const pantsMat = new THREE.MeshLambertMaterial({
        color: opts.legColor !== undefined ? opts.legColor : personPick(PERSON_PANTS_COLORS)
    });

    const group = new THREE.Group();

    // Legs: pivot groups at the hip (origin at hip, mesh hangs below).
    const legGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.9, 8);
    const legL = new THREE.Group();
    legL.position.set(-0.11, 0.9, 0);
    const legLMesh = new THREE.Mesh(legGeo, pantsMat);
    legLMesh.position.y = -0.45;
    legL.add(legLMesh);

    const legR = new THREE.Group();
    legR.position.set(0.11, 0.9, 0);
    const legRMesh = new THREE.Mesh(legGeo, pantsMat);
    legRMesh.position.y = -0.45;
    legR.add(legRMesh);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.26), shirtMat);
    torso.position.y = 1.2;

    // Head + nose (nose on the +Z face so facing reads from above)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
    head.position.y = 1.64;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
    nose.position.set(0, 1.63, 0.16);
    nose.scale.z = 1.3;

    // Arms: pivot groups at the shoulder, mesh hanging below the pivot.
    const armGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.62, 8);
    const armL = new THREE.Group();
    armL.position.set(-0.27, 1.42, 0);
    const armLMesh = new THREE.Mesh(armGeo, shirtMat);
    armLMesh.position.y = -0.31;
    armL.add(armLMesh);

    const armR = new THREE.Group();
    armR.position.set(0.27, 1.42, 0);
    const armRMesh = new THREE.Mesh(armGeo, shirtMat);
    armRMesh.position.y = -0.31;
    armR.add(armRMesh);

    group.add(legL);
    group.add(legR);
    group.add(torso);
    group.add(head);
    group.add(nose);
    group.add(armL);
    group.add(armR);

    group.userData = {
        isWalking: false,
        isSitting: false,
        walkPhase: 0,
        legL: legL,
        legR: legR,
        armL: armL,
        armR: armR
    };
    return group;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (!ud || !ud.legL) return;
    const ease = Math.min(1, dt * 10);
    if (ud.isSitting) {
        // Seated: thighs horizontal (feet forward, +Z local), arms relaxed forward-down.
        ud.walkPhase = 0;
        ud.legL.rotation.x += (-Math.PI / 2 - ud.legL.rotation.x) * ease;
        ud.legR.rotation.x += (-Math.PI / 2 - ud.legR.rotation.x) * ease;
        ud.armL.rotation.x += (-Math.PI / 4 - ud.armL.rotation.x) * ease;
        ud.armR.rotation.x += (-Math.PI / 4 - ud.armR.rotation.x) * ease;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        ud.legL.rotation.x = s * 0.6;
        ud.legR.rotation.x = -s * 0.6;
        ud.armL.rotation.x = -s * 0.5;
        ud.armR.rotation.x = s * 0.5;
    } else {
        ud.walkPhase = 0;
        ud.legL.rotation.x += (0 - ud.legL.rotation.x) * ease;
        ud.legR.rotation.x += (0 - ud.legR.rotation.x) * ease;
        ud.armL.rotation.x += (0 - ud.armL.rotation.x) * ease;
        ud.armR.rotation.x += (0 - ud.armR.rotation.x) * ease;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
