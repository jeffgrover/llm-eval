function createPerson() {
    var person = new THREE.Group();

    var skinColor = 0xffdbac;
    var bodyColor = 0x3498db;
    var legColor = 0x2c3e50;

    var torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    var torsoMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.15;
    person.add(torso);

    var headGeo = new THREE.SphereGeometry(0.2, 12, 12);
    var headMat = new THREE.MeshLambertMaterial({ color: skinColor });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    person.add(head);

    var leftLegPivot = new THREE.Group();
    leftLegPivot.position.y = 0.8;

    var legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
    var legMat = new THREE.MeshLambertMaterial({ color: legColor });

    var leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y = -0.3;
    leftLegPivot.add(leftLegMesh);
    person.add(leftLegPivot);

    var rightLegPivot = new THREE.Group();
    rightLegPivot.position.y = 0.8;

    var rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -0.3;
    rightLegPivot.add(rightLegMesh);
    person.add(rightLegPivot);

    var armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
    var armMat = new THREE.MeshLambertMaterial({ color: bodyColor });

    var leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 1.15, 0);
    person.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 1.15, 0);
    person.add(rightArm);

    person.userData = {
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        isWalking: false
    };

    person.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return person;
}
