function createPerson(opts) {
    opts = opts || {};
    var shirts = [0xcc4444, 0x4477cc, 0x44aa66, 0xccaa33, 0x8844aa, 0x33bbbb, 0xdd7744, 0x5577aa, 0x99cc44, 0xcc66aa];
    var skins = [0xf2c89b, 0xd9a066, 0xa0683c, 0x7a4a28, 0xf7d7b5, 0xc98d5e];
    var pants = [0x334455, 0x555555, 0x223322, 0x442222, 0x2a3a5a, 0x444433];
    var bodyColor = (opts.bodyColor !== undefined) ? opts.bodyColor : shirts[Math.floor(Math.random() * shirts.length)];
    var skinColor = (opts.skinColor !== undefined) ? opts.skinColor : skins[Math.floor(Math.random() * skins.length)];
    var legColor = (opts.legColor !== undefined) ? opts.legColor : pants[Math.floor(Math.random() * pants.length)];

    var group = new THREE.Group();
    function mat(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }
    var legMat = mat(legColor);
    var torsoMat = mat(bodyColor);
    var skinMat = mat(skinColor);

    var legL = new THREE.Group();
    legL.position.set(-0.11, 0.85, 0);
    var legLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 8), legMat);
    legLMesh.position.set(0, -0.425, 0);
    legL.add(legLMesh);
    var legR = new THREE.Group();
    legR.position.set(0.11, 0.85, 0);
    var legRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 8), legMat);
    legRMesh.position.set(0, -0.425, 0);
    legR.add(legRMesh);

    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.62, 10), torsoMat);
    torso.position.set(0, 1.16, 0);

    var armL = new THREE.Group();
    armL.position.set(-0.28, 1.42, 0);
    var armLMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 8), torsoMat);
    armLMesh.position.set(0, -0.275, 0);
    armL.add(armLMesh);
    var armR = new THREE.Group();
    armR.position.set(0.28, 1.42, 0);
    var armRMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 8), torsoMat);
    armRMesh.position.set(0, -0.275, 0);
    armR.add(armRMesh);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
    head.position.set(0, 1.62, 0);
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.62, 0.155);

    group.add(legL);
    group.add(legR);
    group.add(torso);
    group.add(armL);
    group.add(armR);
    group.add(head);
    group.add(nose);
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = Math.random() * Math.PI * 2;
    return group;
}

function animatePersonWalking(person, dt) {
    var ud = person.userData;
    if (!ud || !ud.legL) { return; }
    if (ud.isSitting) {
        ud.legL.rotation.x = -Math.PI / 2;
        ud.legR.rotation.x = -Math.PI / 2;
        ud.armL.rotation.x = -Math.PI / 4;
        ud.armR.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        return;
    }
    if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        var s = Math.sin(ud.walkPhase);
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
    ud.walkPhase = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
