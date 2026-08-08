function createPerson() {
    var person = new THREE.Group();

    var legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    var legMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.12, 0.25, 0);
    var rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.12, 0.25, 0);

    var torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.25);
    var torsoMat = new THREE.MeshPhongMaterial({ color: 0x3498db });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 0.8, 0);

    var headGeo = new THREE.SphereGeometry(0.22, 16, 16);
    var headMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.32, 0);

    var armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
    var armMat = new THREE.MeshPhongMaterial({ color: 0x3498db });
    var leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.31, 0.75, 0);
    var rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.31, 0.75, 0);

    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
