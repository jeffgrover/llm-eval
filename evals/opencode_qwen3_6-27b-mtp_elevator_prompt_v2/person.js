function createPerson(color) {
    var bodyColor = color || 0x3498db;
    var headColor = 0xffdbac;
    var legColor = 0x2c3e50;

    var person = new THREE.Group();

    /* Torso */
    var torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    var torsoMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.0;
    person.add(torso);

    /* Head */
    var headGeo = new THREE.SphereGeometry(0.22, 8, 8);
    var headMat = new THREE.MeshLambertMaterial({ color: headColor });
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    person.add(head);

    /* Left leg - pivot at hip */
    var leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.15, 0.65, 0);
    var leftLegGeo = new THREE.BoxGeometry(0.18, 0.65, 0.2);
    var legMat = new THREE.MeshLambertMaterial({ color: legColor });
    var leftLegMesh = new THREE.Mesh(leftLegGeo, legMat);
    leftLegMesh.position.y = -0.325;
    leftLegPivot.add(leftLegMesh);
    person.add(leftLegPivot);

    /* Right leg - pivot at hip */
    var rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.15, 0.65, 0);
    var rightLegGeo = new THREE.BoxGeometry(0.18, 0.65, 0.2);
    var rightLegMesh = new THREE.Mesh(rightLegGeo, legMat);
    rightLegMesh.position.y = -0.325;
    rightLegPivot.add(rightLegMesh);
    person.add(rightLegPivot);

    /* Left arm - at shoulder level */
    var leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.35, 1.25, 0);
    var armGeo = new THREE.BoxGeometry(0.14, 0.55, 0.16);
    var armMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -0.275;
    leftArmPivot.add(leftArmMesh);
    person.add(leftArmPivot);

    /* Right arm */
    var rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.35, 1.25, 0);
    var rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -0.275;
    rightArmPivot.add(rightArmMesh);
    person.add(rightArmPivot);

    /* Total height: legs reach to y=0 (feet), head top ~1.77 */
    person.userData = {
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        isWalking: false
    };

    return person;
}
