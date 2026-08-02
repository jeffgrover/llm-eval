// person.js - person mesh factory + walk/sit animation (classic script, no modules)

var PERSON_PALETTES = {
    shirts: [0xcc4444, 0x4466cc, 0x44aa66, 0xbb8833, 0x8855bb, 0x2299aa, 0xdd6699, 0x777788],
    skins: [0xf1c9a5, 0xd9a066, 0xa5673f, 0x8d5524, 0xffdbac],
    pants: [0x333344, 0x554433, 0x225533, 0x444444, 0x223355]
};

function pickFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function createPerson(opts) {
    opts = opts || {};
    var bodyColor = (opts.bodyColor !== undefined) ? opts.bodyColor : pickFrom(PERSON_PALETTES.shirts);
    var skinColor = (opts.skinColor !== undefined) ? opts.skinColor : pickFrom(PERSON_PALETTES.skins);
    var legColor = (opts.legColor !== undefined) ? opts.legColor : pickFrom(PERSON_PALETTES.pants);

    var group = new THREE.Group();

    var legLen = 0.55;
    var torsoH = 0.55;
    var headR = 0.17;
    var hipY = legLen;

    var legMat = new THREE.MeshLambertMaterial({ color: legColor });
    var bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

    function makeLeg(xOff) {
        var leg = new THREE.Group();
        leg.position.set(xOff, hipY, 0);
        var geo = new THREE.CylinderGeometry(0.07, 0.06, legLen, 8);
        var mesh = new THREE.Mesh(geo, legMat);
        mesh.position.y = -legLen / 2;
        leg.add(mesh);
        return leg;
    }
    var leftLeg = makeLeg(-0.11);
    var rightLeg = makeLeg(0.11);
    group.add(leftLeg);
    group.add(rightLeg);

    var torsoGeo = new THREE.CylinderGeometry(0.16, 0.19, torsoH, 10);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = hipY + torsoH / 2;
    group.add(torso);

    var shoulderY = hipY + torsoH - 0.06;
    var armLen = 0.45;
    function makeArm(xOff) {
        var arm = new THREE.Group();
        arm.position.set(xOff, shoulderY, 0);
        var geo = new THREE.CylinderGeometry(0.05, 0.045, armLen, 8);
        var mesh = new THREE.Mesh(geo, skinMat);
        mesh.position.y = -armLen / 2;
        arm.add(mesh);
        return arm;
    }
    var leftArm = makeArm(-0.22);
    var rightArm = makeArm(0.22);
    group.add(leftArm);
    group.add(rightArm);

    var headGeo = new THREE.SphereGeometry(headR, 12, 10);
    var head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = hipY + torsoH + headR + 0.03;
    group.add(head);

    var noseGeo = new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    var nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, head.position.y, headR - 0.01);
    nose.rotation.x = Math.PI / 2;
    group.add(nose);

    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = Math.random() * Math.PI * 2;
    group.userData.limbs = {
        leftLeg: leftLeg, rightLeg: rightLeg,
        leftArm: leftArm, rightArm: rightArm
    };

    return group;
}

function animatePersonWalking(person, dt) {
    var ud = person.userData;
    if (!ud || !ud.limbs) { return; }
    var limbs = ud.limbs;
    if (ud.isSitting) {
        limbs.leftLeg.rotation.x = -Math.PI / 2;
        limbs.rightLeg.rotation.x = -Math.PI / 2;
        limbs.leftArm.rotation.x = -Math.PI / 4;
        limbs.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        var s = Math.sin(ud.walkPhase);
        limbs.leftLeg.rotation.x = s * 0.6;
        limbs.rightLeg.rotation.x = -s * 0.6;
        limbs.leftArm.rotation.x = -s * 0.5;
        limbs.rightArm.rotation.x = s * 0.5;
    } else {
        limbs.leftLeg.rotation.x = 0;
        limbs.rightLeg.rotation.x = 0;
        limbs.leftArm.rotation.x = 0;
        limbs.rightArm.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
