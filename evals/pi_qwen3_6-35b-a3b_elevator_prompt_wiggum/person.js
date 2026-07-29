function createPerson(color) {
    var group = new THREE.Group();

    var head = new THREE.Group();
    var headGeo = new THREE.SphereGeometry(0.2, 16, 12);
    var headMat = new THREE.MeshLambertMaterial({ color: color });
    var headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.75;
    head.add(headMesh);
    group.add(head);

    // Torso
    var torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.7, 0.3),
        new THREE.MeshLambertMaterial({ color: color })
    );
    torso.position.y = 1.1;
    group.add(torso);

    // Arms
    var armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    var armMat = new THREE.MeshLambertMaterial({ color: color });
    var leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 1.0, 0);
    group.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 1.0, 0);
    group.add(rightArm);

    // Left leg
    var legGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    var legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.12, 0.3, 0);
    leftLeg.geometry.translate(0, -0.3, 0);
    group.add(leftLeg);

    // Right leg
    var rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.12, 0.3, 0);
    rightLeg.geometry.translate(0, -0.3, 0);
    group.add(rightLeg);

    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: 0,
        inElevator: false
    };

    return group;
}
