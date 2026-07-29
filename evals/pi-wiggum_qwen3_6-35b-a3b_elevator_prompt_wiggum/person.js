function createPerson(color) {
    var person = new THREE.Group();

    // Torso
    var torsoGeom = new THREE.BoxGeometry(0.6, 1.0, 0.4);
    var torsoMat = new THREE.MeshLambertMaterial({ color: color });
    var torso = new THREE.Mesh(torsoGeom, torsoMat);
    torso.position.y = 1.3;
    person.add(torso);

    // Head
    var headGeom = new THREE.SphereGeometry(0.25, 8, 8);
    var headMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
    var head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 2.1;
    person.add(head);

    // Left leg (below torso, foot at y=0)
    var legGeom = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333366 });
    var leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.15, 0.35, 0);
    leftLeg.userData.localPivot = true;
    person.add(leftLeg);

    // Right leg (below torso, foot at y=0)
    var rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.15, 0.35, 0);
    rightLeg.userData.localPivot = true;
    person.add(rightLeg);

    // Left arm
    var armGeom = new THREE.BoxGeometry(0.15, 0.7, 0.15);
    var armMat = new THREE.MeshLambertMaterial({ color: color });
    var leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-0.45, 1.5, 0);
    person.add(leftArm);

    // Right arm
    var rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(0.45, 1.5, 0);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: 0,
        inElevator: false
    };

    return person;
}
