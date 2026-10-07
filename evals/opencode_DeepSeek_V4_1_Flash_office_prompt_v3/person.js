function createPerson(options) {
    options = options || {};

    var shirtPalette = [
        0xd9694f, 0x4f7fd9, 0x5aa85a, 0xb06fc0, 0xd9b04f,
        0x4fb0b0, 0xc05a7a, 0x6f7fbf, 0x9a9a9a, 0x3f6f5f
    ];
    var skinPalette = [0xf2c9a0, 0xe0a878, 0xc08858, 0x9a6b44, 0x6f4a30, 0xffdbb8];
    var legPalette = [0x39424f, 0x5a4632, 0x2f3a4a, 0x6b6b6b, 0x3a3a3a, 0x4a4038];

    function pick(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    }

    var bodyColor = options.bodyColor !== undefined ? options.bodyColor : pick(shirtPalette);
    var skinColor = options.skinColor !== undefined ? options.skinColor : pick(skinPalette);
    var legColor = options.legColor !== undefined ? options.legColor : pick(legPalette);

    var person = new THREE.Group();

    var bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    var legMat = new THREE.MeshLambertMaterial({ color: legColor });
    var shoeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

    var hipY = 0.86;

    function makeLeg(side) {
        var leg = new THREE.Group();
        leg.position.set(side * 0.13, hipY, 0);
        var thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.8, 8), legMat);
        thigh.position.y = -0.42;
        leg.add(thigh);
        var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.26), shoeMat);
        shoe.position.set(0, -0.83, 0.05);
        leg.add(shoe);
        return leg;
    }

    var leftLeg = makeLeg(-1);
    var rightLeg = makeLeg(1);
    person.add(leftLeg);
    person.add(rightLeg);

    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.62, 10), bodyMat);
    torso.position.y = 1.22;
    person.add(torso);

    var shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), bodyMat);
    shoulders.position.y = 1.44;
    person.add(shoulders);

    function makeArm(side) {
        var arm = new THREE.Group();
        arm.position.set(side * 0.28, 1.44, 0);
        var limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.52, 8), bodyMat);
        limb.position.y = -0.26;
        arm.add(limb);
        var hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skinMat);
        hand.position.y = -0.55;
        arm.add(hand);
        return arm;
    }

    var leftArm = makeArm(-1);
    var rightArm = makeArm(1);
    person.add(leftArm);
    person.add(rightArm);

    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), skinMat);
    neck.position.y = 1.57;
    person.add(neck);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skinMat);
    head.position.y = 1.72;
    person.add(head);

    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), skinMat);
    nose.position.set(0, 1.71, 0.155);
    nose.scale.set(1, 0.85, 1.2);
    person.add(nose);

    var hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
    hair.position.y = 1.75;
    person.add(hair);

    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;

    return person;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;
    var data = person.userData;
    var leftLeg = data.leftLeg;
    var rightLeg = data.rightLeg;
    var leftArm = data.leftArm;
    var rightArm = data.rightArm;
    if (!leftLeg || !rightLeg || !leftArm || !rightArm) return;

    if (data.isSitting) {
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        leftArm.rotation.x = -Math.PI / 4;
        rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
        return;
    }

    if (data.isWalking) {
        data.walkPhase += dt * 8;
        var swing = Math.sin(data.walkPhase);
        leftLeg.rotation.x = swing * 0.6;
        rightLeg.rotation.x = -swing * 0.6;
        leftArm.rotation.x = -swing * 0.5;
        rightArm.rotation.x = swing * 0.5;
        return;
    }

    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;