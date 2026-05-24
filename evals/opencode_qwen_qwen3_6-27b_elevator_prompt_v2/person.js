function createPerson(color) {
    color = color || '#3498db';

    var person = new THREE.Group();

    // Legs (dark)
    var legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    var legMat = new THREE.MeshLambertMaterial({ color: '#2c3e50' });

    var leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.4, 0);
    leftLeg.name = 'leftLeg';
    person.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.4, 0);
    rightLeg.name = 'rightLeg';
    person.add(rightLeg);

    // Torso (blue)
    var torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    var torsoMat = new THREE.MeshLambertMaterial({ color: color });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 1.15, 0);
    person.add(torso);

    // Arms (blue, at shoulder level)
    var armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    var leftArm = new THREE.Mesh(armGeo, torsoMat);
    leftArm.position.set(-0.35, 1.15, 0);
    person.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, torsoMat);
    rightArm.position.set(0.35, 1.15, 0);
    person.add(rightArm);

    // Head (skin tone)
    var headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    var headMat = new THREE.MeshLambertMaterial({ color: '#ffdbac' });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.7, 0);
    person.add(head);

    // userData contract (H7)
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
