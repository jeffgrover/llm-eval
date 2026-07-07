function createPerson(color) {
    var personColor = color || 0x3498db;

    var group = new THREE.Group();
    group.name = "person";

    // Left leg - box from hip to foot, positioned so top is at hip level
    var leftLegGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    var legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    var leftLeg = new THREE.Mesh(leftLegGeo, legMat);
    // Position: top of box at hip level (y=1.0), center of box at y=0.6
    leftLeg.position.set(-0.15, 0.6, 0);
    group.add(leftLeg);

    // Right leg
    var rightLegGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    var rightLeg = new THREE.Mesh(rightLegGeo, legMat);
    rightLeg.position.set(0.15, 0.6, 0);
    group.add(rightLeg);

    // Torso - positioned so bottom is at hip level, center at y=1.5
    var torsoGeo = new THREE.BoxGeometry(0.5, 0.9, 0.3);
    var torsoMat = new THREE.MeshStandardMaterial({ color: personColor });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 1.45, 0);
    group.add(torso);

    // Left arm - hanging down from shoulder, pivot at top
    var leftArmGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
    var leftArm = new THREE.Mesh(leftArmGeo, torsoMat);
    // Shoulder at y ~1.7 (top of torso), arm center below shoulder by 0.35
    leftArm.position.set(-0.35, 1.35, 0);
    group.add(leftArm);

    // Right arm - symmetric to left arm
    var rightArmGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
    var rightArm = new THREE.Mesh(rightArmGeo, torsoMat);
    rightArm.position.set(0.35, 1.35, 0);
    group.add(rightArm);

    // Head - sphere on top of torso, center at y=2.15
    var headGeo = new THREE.SphereGeometry(0.2, 8, 8);
    var headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 2.15, 0);
    group.add(head);

    // Face the elevator (rotate so person looks toward negative Z / doors)
    group.rotation.y = Math.PI;

    // CRITICAL: userData contract - animation loop reads these
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}
