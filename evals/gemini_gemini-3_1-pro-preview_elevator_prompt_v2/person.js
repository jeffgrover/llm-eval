function createPerson() {
    const person = new THREE.Group();

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85;

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.8, 0.8, 0.4);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.2;

    // Arms hanging down from shoulders
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.5, 1.25, 0);
    
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.5, 1.25, 0);

    // Legs pivoting from hips
    const legGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.2, 0.8, 0); // Hip joint position
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.set(0, -0.4, 0); // Offset mesh down by half its height
    leftLeg.add(leftLegMesh);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.2, 0.8, 0); // Hip joint position
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.set(0, -0.4, 0);
    rightLeg.add(rightLegMesh);

    person.add(head);
    person.add(torso);
    person.add(leftArm);
    person.add(rightArm);
    person.add(leftLeg);
    person.add(rightLeg);

    // Populate userData contract
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
