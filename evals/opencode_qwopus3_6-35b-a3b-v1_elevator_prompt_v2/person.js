// person.js - Creates 3D humanoid figures using Three.js primitives

function createPerson() {
    var person = new THREE.Group();

    // Colors
    var skinColor = 0xffdbac;
    var bodyColor = 0x3498db;
    var legColor = 0x2c3e50;

    // Leg geometry and material shared between legs
    var legGeo = new THREE.BoxGeometry(0.18, 0.75, 0.18);
    var legMat = new THREE.MeshStandardMaterial({ color: legColor });

    // Torso geometry and material
    var torsoGeo = new THREE.BoxGeometry(0.36, 0.45, 0.2);
    var torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor, side: THREE.DoubleSide });

    // Head geometry and material
    var headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.26);
    var headMat = new THREE.MeshStandardMaterial({ color: skinColor, side: THREE.DoubleSide });

    // Arm geometry and material - arms hang DOWN from shoulders (negative Y direction)
    var armGeo = new THREE.BoxGeometry(0.14, 0.55, 0.14);
    var armMat = new THREE.MeshStandardMaterial({ color: bodyColor, side: THREE.DoubleSide });

    // === LEGS - pivot from hips (top of leg), standing on the ground ===
    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.12, -0.375, 0); // center at hip level, extends downward
    person.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.12, -0.375, 0);
    person.add(rightLeg);

    // === TORSO - sits on top of legs ===
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 0.225, 0); // above the hips
    person.add(torso);

    // === HEAD - sits on top of torso ===
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.61, 0); // above the torso
    person.add(head);

    // === ARMS - hang DOWN from shoulders (negative Y direction) ===
    var leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.28, 0.05, 0); // shoulder level, extends downward
    person.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.28, 0.05, 0);
    person.add(rightArm);

    // Set the required userData contract (H7)
    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.isWalking = false;
    person.userData.walkTime = 0;

    return person;
}
