(function(root) {

var SHIRT_COLORS = [0x3366cc, 0xcc3333, 0x339933, 0xcc9933, 0x9933cc,
    0xcc6633, 0x336699, 0x993366, 0x669933, 0x996633,
    0x336666, 0x663366, 0x666633, 0x336633, 0x663333,
    0x3366cc, 0xcc6699, 0x66cc99, 0xcc9966, 0x9966cc];
var SKIN_TONES = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
var PANTS_COLORS = [0x222233, 0x333344, 0x2a2a3a, 0x1a1a2a, 0x3a3a4a];

function createPerson(opts) {
    opts = opts || {};
    var bodyColor = opts.bodyColor != null ? opts.bodyColor :
        SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    var skinColor = opts.skinColor != null ? opts.skinColor :
        SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    var legColor = opts.legColor != null ? opts.legColor :
        PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];

    var group = new THREE.Group();

    var skinMat = new THREE.MeshLambertMaterial({color: skinColor});
    var bodyMat = new THREE.MeshLambertMaterial({color: bodyColor});
    var legMat = new THREE.MeshLambertMaterial({color: legColor});

    var leftLeg = new THREE.Group();
    leftLeg.position.set(-0.12, 0.55, 0);
    var leftLegCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), legMat);
    leftLegCyl.position.y = -0.275;
    leftLeg.add(leftLegCyl);
    var leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), skinMat);
    leftFoot.position.set(0, -0.55, 0.03);
    leftLeg.add(leftFoot);
    group.add(leftLeg);

    var rightLeg = new THREE.Group();
    rightLeg.position.set(0.12, 0.55, 0);
    var rightLegCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), legMat);
    rightLegCyl.position.y = -0.275;
    rightLeg.add(rightLegCyl);
    var rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), skinMat);
    rightFoot.position.set(0, -0.55, 0.03);
    rightLeg.add(rightFoot);
    group.add(rightLeg);

    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.22), bodyMat);
    torso.position.y = 0.775;
    group.add(torso);

    var leftArm = new THREE.Group();
    leftArm.position.set(-0.25, 0.95, 0);
    var leftArmCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), skinMat);
    leftArmCyl.position.y = -0.2;
    leftArm.add(leftArmCyl);
    group.add(leftArm);

    var rightArm = new THREE.Group();
    rightArm.position.set(0.25, 0.95, 0);
    var rightArmCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), skinMat);
    rightArmCyl.position.y = -0.2;
    rightArm.add(rightArmCyl);
    group.add(rightArm);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), skinMat);
    head.position.y = 1.12;
    group.add(head);

    var nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6, 0, Math.PI),
        skinMat
    );
    nose.position.set(0, 1.1, 0.14);
    nose.rotation.y = 0;
    group.add(nose);

    group.userData.leftLeg = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.walkPhase = 0;

    return group;
}

function animatePersonWalking(person, dt) {
    var ll = person.userData.leftLeg;
    var rl = person.userData.rightLeg;
    var la = person.userData.leftArm;
    var ra = person.userData.rightArm;

    if (person.userData.isSitting) {
        ll.rotation.x = -Math.PI / 2;
        rl.rotation.x = -Math.PI / 2;
        la.rotation.x = -Math.PI / 4;
        ra.rotation.x = -Math.PI / 4;
        person.userData.walkPhase = 0;
    } else if (person.userData.isWalking) {
        person.userData.walkPhase += dt * 8;
        var phase = person.userData.walkPhase;
        ll.rotation.x = Math.sin(phase) * 0.6;
        rl.rotation.x = Math.sin(phase + Math.PI) * 0.6;
        la.rotation.x = -Math.sin(phase) * 0.5;
        ra.rotation.x = -Math.sin(phase + Math.PI) * 0.5;
    } else {
        ll.rotation.x = 0;
        rl.rotation.x = 0;
        la.rotation.x = 0;
        ra.rotation.x = 0;
    }
}

root.createPerson = createPerson;
root.animatePersonWalking = animatePersonWalking;

})(window);
