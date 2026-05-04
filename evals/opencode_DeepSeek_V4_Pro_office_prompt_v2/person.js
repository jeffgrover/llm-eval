var SHIRT_COLORS = [0x3366cc, 0xcc3333, 0x33cc66, 0xcccc33, 0xcc66cc, 0x66cccc, 0xcc6633, 0x336699, 0x993366, 0x669933];
var SKIN_COLORS = [0xffcc99, 0xf5c6a0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdab9, 0xd4a574];
var PANT_COLORS = [0x333366, 0x333333, 0x444444, 0x3d3d5c, 0x4a4a38, 0x2c2c3e, 0x3a3a4a];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createPerson(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor || pick(SHIRT_COLORS);
    var skinColor = opts.skinColor || pick(SKIN_COLORS);
    var legColor = opts.legColor || pick(PANT_COLORS);

    var group = new THREE.Group();

    // Torso: box 0.35w x 0.45h x 0.2d, centered above hips
    var torsoGeo = new THREE.BoxGeometry(0.35, 0.45, 0.2);
    var torsoMat = new THREE.MeshLambertMaterial({color: bodyColor});
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.7 + 0.225;
    torso.castShadow = true;
    group.add(torso);

    // Head: sphere
    var headGeo = new THREE.SphereGeometry(0.14, 12, 12);
    var headMat = new THREE.MeshLambertMaterial({color: skinColor});
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.7 + 0.45 + 0.14;
    head.castShadow = true;
    group.add(head);

    // Nose: small hemisphere on +Z face
    var noseGeo = new THREE.SphereGeometry(0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    var noseMat = new THREE.MeshLambertMaterial({color: skinColor});
    var nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0.7 + 0.45 + 0.14, 0.14);
    group.add(nose);

    // Left leg
    var leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.1, 0.7, 0);
    var legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.65, 8);
    var legMat = new THREE.MeshLambertMaterial({color: legColor});
    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.y = -0.325;
    leftLeg.castShadow = true;
    leftLegGroup.add(leftLeg);

    // Left foot
    var footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.14);
    var footMat = new THREE.MeshLambertMaterial({color: 0x222222});
    var leftFoot = new THREE.Mesh(footGeo, footMat);
    leftFoot.position.set(0, -0.65, 0.04);
    leftLegGroup.add(leftFoot);

    group.add(leftLegGroup);
    group.userData.leftLeg = leftLegGroup;

    // Right leg
    var rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.1, 0.7, 0);
    var rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.y = -0.325;
    rightLeg.castShadow = true;
    rightLegGroup.add(rightLeg);

    var rightFoot = new THREE.Mesh(footGeo, footMat);
    rightFoot.position.set(0, -0.65, 0.04);
    rightLegGroup.add(rightFoot);

    group.add(rightLegGroup);
    group.userData.rightLeg = rightLegGroup;

    // Left arm (pivot at shoulder)
    var leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.22, 0.7 + 0.40, 0);
    var armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8);
    var armMat = new THREE.MeshLambertMaterial({color: bodyColor});
    var leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.y = -0.20;
    leftArm.castShadow = true;
    leftArmGroup.add(leftArm);
    group.add(leftArmGroup);
    group.userData.leftArm = leftArmGroup;

    // Right arm
    var rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.22, 0.7 + 0.40, 0);
    var rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.y = -0.20;
    rightArm.castShadow = true;
    rightArmGroup.add(rightArm);
    group.add(rightArmGroup);
    group.userData.rightArm = rightArmGroup;

    // Store metadata
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = 0;

    return group;
}

function animatePersonWalking(person, dt) {
    var ud = person.userData;
    var ll = ud.leftLeg, rl = ud.rightLeg;
    var la = ud.leftArm, ra = ud.rightArm;
    if (!ll || !rl || !la || !ra) return;

    if (ud.isSitting) {
        ll.rotation.x = -Math.PI / 2;
        rl.rotation.x = -Math.PI / 2;
        la.rotation.x = -Math.PI / 4;
        ra.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        person.position.y = (ud._sitY !== undefined ? ud._sitY : 0);
    } else if (ud.isWalking) {
        ud.walkPhase = (ud.walkPhase || 0) + dt * 8;
        var ph = ud.walkPhase;
        ll.rotation.x = Math.sin(ph) * 0.6;
        rl.rotation.x = -Math.sin(ph) * 0.6;
        la.rotation.x = -Math.sin(ph) * 0.5;
        ra.rotation.x = Math.sin(ph) * 0.5;
        person.position.y = (ud._standY !== undefined ? ud._standY : 0);
    } else {
        ll.rotation.x = 0;
        rl.rotation.x = 0;
        la.rotation.x = 0;
        ra.rotation.x = 0;
        person.position.y = (ud._standY !== undefined ? ud._standY : 0);
    }
}
