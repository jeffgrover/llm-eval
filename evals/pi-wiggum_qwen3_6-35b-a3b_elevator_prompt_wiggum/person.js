function createPerson(color) {
    var person = new THREE.Group();

    // Torso
    var torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    var torsoMat = new THREE.MeshLambertMaterial({ color: color });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.7 + 0.35; // 0.7 (legs) + half torso height
    person.add(torso);

    // Head
    var headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    var headMat = new THREE.MeshLambertMaterial({ color: color });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.7 + 0.7 + 0.175; // legs + torso + half head
    person.add(head);

    // Left arm
    var armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    var leftArmMat = new THREE.MeshLambertMaterial({ color: color });
    var leftArm = new THREE.Mesh(armGeo, leftArmMat);
    leftArm.position.set(-0.35, 0.7 + 0.7 - 0.15, 0);
    person.add(leftArm);

    // Right arm
    var rightArm = new THREE.Mesh(armGeo, leftArmMat.clone());
    rightArm.position.set(0.35, 0.7 + 0.7 - 0.15, 0);
    person.add(rightArm);

    // Left leg
    var legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.12, 0.35, 0);
    person.add(leftLeg);

    // Right leg
    var rightLeg = new THREE.Mesh(legGeo, legMat.clone());
    rightLeg.position.set(0.12, 0.35, 0);
    person.add(rightLeg);

    // Set feet on local y = 0
    person.children.forEach(function(child) {
        if (child === leftLeg || child === rightLeg) {
            // legs already sit on y=0 at bottom
        }
    });

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: 0,
        inElevator: false
    };

    return person;
}
