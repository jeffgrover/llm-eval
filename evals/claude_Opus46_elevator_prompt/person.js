// person.js - 3D humanoid figure factory using Three.js primitives
// No ES6 modules - uses global THREE object

function createPerson(id, color) {
    color = color || 0x3498db;
    var skinColor = 0xffdbac;
    var legColor = 0x2c3e50;

    var group = new THREE.Group();
    group.userData = { id: id, isWalking: false, walkPhase: 0 };

    // Dimensions
    var legHeight = 0.5;
    var legRadius = 0.08;
    var torsoHeight = 0.45;
    var torsoWidth = 0.3;
    var torsoDepth = 0.18;
    var headRadius = 0.13;
    var armLength = 0.4;
    var armRadius = 0.06;

    // Total height: legHeight + torsoHeight + headRadius*2 = 0.5 + 0.45 + 0.26 = 1.21

    // --- Legs ---
    var legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
    var legMaterial = new THREE.MeshLambertMaterial({ color: legColor });

    // Left leg pivot (at hip)
    var leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.08, legHeight, 0); // pivot at top of leg (hip)
    var leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(0, -legHeight / 2, 0); // leg hangs down from pivot
    leftLegPivot.add(leftLeg);
    group.add(leftLegPivot);
    group.userData.leftLegPivot = leftLegPivot;

    // Right leg pivot (at hip)
    var rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.08, legHeight, 0); // pivot at top of leg (hip)
    var rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0, -legHeight / 2, 0); // leg hangs down from pivot
    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);
    group.userData.rightLegPivot = rightLegPivot;

    // --- Torso ---
    var torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    var torsoMaterial = new THREE.MeshLambertMaterial({ color: color });
    var torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, legHeight + torsoHeight / 2, 0);
    group.add(torso);

    // --- Head ---
    var headGeometry = new THREE.SphereGeometry(headRadius, 12, 10);
    var headMaterial = new THREE.MeshLambertMaterial({ color: skinColor });
    var head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, legHeight + torsoHeight + headRadius, 0);
    group.add(head);

    // --- Arms (hanging down from shoulders) ---
    var armGeometry = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8);
    var armMaterial = new THREE.MeshLambertMaterial({ color: color });

    // Shoulder Y position
    var shoulderY = legHeight + torsoHeight - 0.05;

    // Left arm pivot (at shoulder)
    var leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-(torsoWidth / 2 + armRadius + 0.01), shoulderY, 0);
    var leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(0, -armLength / 2, 0); // arm hangs down from shoulder
    leftArmPivot.add(leftArm);
    group.add(leftArmPivot);
    group.userData.leftArmPivot = leftArmPivot;

    // Right arm pivot (at shoulder)
    var rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(torsoWidth / 2 + armRadius + 0.01, shoulderY, 0);
    var rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0, -armLength / 2, 0); // arm hangs down from shoulder
    rightArmPivot.add(rightArm);
    group.add(rightArmPivot);
    group.userData.rightArmPivot = rightArmPivot;

    // Person total height for positioning (feet at y=0 of group)
    group.userData.totalHeight = legHeight + torsoHeight + headRadius * 2;

    return group;
}

function animatePersonWalking(person, delta, speedMultiplier) {
    speedMultiplier = speedMultiplier || 1;
    if (!person.userData.isWalking) {
        // Reset legs and arms to standing
        if (person.userData.leftLegPivot) {
            person.userData.leftLegPivot.rotation.x = 0;
            person.userData.rightLegPivot.rotation.x = 0;
            person.userData.leftArmPivot.rotation.x = 0;
            person.userData.rightArmPivot.rotation.x = 0;
        }
        return;
    }

    person.userData.walkPhase += delta * 8 * speedMultiplier;
    var swing = Math.sin(person.userData.walkPhase) * 0.4;

    // Legs swing opposite to each other
    person.userData.leftLegPivot.rotation.x = swing;
    person.userData.rightLegPivot.rotation.x = -swing;

    // Arms swing opposite to legs (natural gait)
    person.userData.leftArmPivot.rotation.x = -swing * 0.6;
    person.userData.rightArmPivot.rotation.x = swing * 0.6;
}
