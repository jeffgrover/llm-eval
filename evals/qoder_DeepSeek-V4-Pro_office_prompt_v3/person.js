// person.js - person mesh factory + walk/sit animation
// Uses THREE global from CDN. No ES modules.

var SHIRT_COLORS = [0x4466aa, 0x66aa44, 0xaa6644, 0x8844aa, 0x4488aa, 0xcc5555, 0x55aa88, 0x998844, 0x665588, 0x336699];
var SKIN_COLORS = [0xf5d0b0, 0xe8bea0, 0xd4a574, 0xc4956a, 0xf0c8a0, 0xdeb887];
var PANT_COLORS = [0x333344, 0x444455, 0x3a3a4a, 0x2a2a3a, 0x4a4a3a, 0x3a3a50];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createPerson(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor || pickRandom(SHIRT_COLORS);
    var skinColor = opts.skinColor || pickRandom(SKIN_COLORS);
    var legColor = opts.legColor || pickRandom(PANT_COLORS);

    var group = new THREE.Group();
    group.userData = {
        isWalking: false,
        isSitting: false,
        walkPhase: Math.random() * Math.PI * 2
    };

    // Materials
    var skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    var shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var pantsMat = new THREE.MeshLambertMaterial({ color: legColor });
    var shoeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // === LEGS (pivoting at hip) ===
    var leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.13, 1.15, 0);
    leftLegGroup.userData = { isArm: false };
    var leftUpperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.55, 8), pantsMat);
    leftUpperLeg.position.y = -0.275;
    leftLegGroup.add(leftUpperLeg);
    var leftLowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.55, 8), pantsMat);
    leftLowerLeg.position.y = -0.825;
    leftLegGroup.add(leftLowerLeg);
    var leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.18), shoeMat);
    leftShoe.position.set(0, -1.1, 0.04);
    leftLegGroup.add(leftShoe);
    group.add(leftLegGroup);

    var rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.13, 1.15, 0);
    rightLegGroup.userData = { isArm: false };
    var rightUpperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.55, 8), pantsMat);
    rightUpperLeg.position.y = -0.275;
    rightLegGroup.add(rightUpperLeg);
    var rightLowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.55, 8), pantsMat);
    rightLowerLeg.position.y = -0.825;
    rightLegGroup.add(rightLowerLeg);
    var rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.18), shoeMat);
    rightShoe.position.set(0, -1.1, 0.04);
    rightLegGroup.add(rightShoe);
    group.add(rightLegGroup);

    // === TORSO ===
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.7, 10), shirtMat);
    torso.position.y = 1.5;
    group.add(torso);

    // === ARMS (pivoting at shoulder) ===
    var leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.24, 1.8, 0);
    leftArmGroup.userData = { isArm: true };
    var leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), shirtMat);
    leftUpperArm.position.y = -0.25;
    leftArmGroup.add(leftUpperArm);
    var leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), skinMat);
    leftForearm.position.y = -0.725;
    leftArmGroup.add(leftForearm);
    group.add(leftArmGroup);

    var rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.24, 1.8, 0);
    rightArmGroup.userData = { isArm: true };
    var rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), shirtMat);
    rightUpperArm.position.y = -0.25;
    rightArmGroup.add(rightUpperArm);
    var rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), skinMat);
    rightForearm.position.y = -0.725;
    rightArmGroup.add(rightForearm);
    group.add(rightArmGroup);

    // === HEAD ===
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
    head.position.y = 1.95;
    group.add(head);

    // Nose (small hemisphere on +Z face)
    var noseGeo = new THREE.SphereGeometry(0.04, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    var nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0, 1.95, 0.15);
    group.add(nose);

    // Eyes (tiny dark dots)
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    var leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), eyeMat);
    leftEye.position.set(-0.06, 1.99, 0.13);
    group.add(leftEye);
    var rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), eyeMat);
    rightEye.position.set(0.06, 1.99, 0.13);
    group.add(rightEye);

    // Store limb references for animation
    group.userData.limbs = [leftLegGroup, rightLegGroup, leftArmGroup, rightArmGroup];

    return group;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;

    var limbs = person.userData.limbs;
    if (!limbs || limbs.length < 4) return;

    var leftLeg = limbs[0];
    var rightLeg = limbs[1];
    var leftArm = limbs[2];
    var rightArm = limbs[3];

    if (person.userData.isSitting) {
        // Sitting: legs forward at hip, arms drop
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        leftArm.rotation.x = -Math.PI / 4;
        rightArm.rotation.x = -Math.PI / 4;
        person.userData.walkPhase = 0;
        return;
    }

    if (person.userData.isWalking) {
        person.userData.walkPhase += dt * 8;
        var phase = person.userData.walkPhase;
        leftLeg.rotation.x = Math.sin(phase) * 0.6;
        rightLeg.rotation.x = -Math.sin(phase) * 0.6;
        leftArm.rotation.x = -Math.sin(phase) * 0.5;
        rightArm.rotation.x = Math.sin(phase) * 0.5;
        return;
    }

    // Standing idle
    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
