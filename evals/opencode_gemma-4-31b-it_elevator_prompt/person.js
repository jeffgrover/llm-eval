function createPerson() {
    const group = new THREE.Group();

    // Colors
    const bodyColor = 0x3498db;
    const skinColor = 0xffdbac;
    const legColor = 0x2c3e50;

    // Dimensions
    const legHeight = 0.4;
    const torsoHeight = 0.6;
    const headRadius = 0.15;

    // Legs (Pivoting from hips)
    const legGeo = new THREE.BoxGeometry(0.1, legHeight, 0.1);
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });
    
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.1, legHeight/2, 0);
    leftLeg.geometry.translate(0, -legHeight/2, 0); // Pivot at top
    
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.1, legHeight/2, 0);
    rightLeg.geometry.translate(0, -legHeight/2, 0); // Pivot at top

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.3, torsoHeight, 0.2);
    const torsoMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, legHeight + torsoHeight/2, 0);

    // Head
    const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, legHeight + torsoHeight + headRadius, 0);

    // Arms (Hanging DOWN from shoulders)
    const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.2, legHeight + torsoHeight - 0.1, 0);
    leftArm.geometry.translate(0, -0.2, 0); // Pivot at top

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.2, legHeight + torsoHeight - 0.1, 0);
    rightArm.geometry.translate(0, -0.2, 0); // Pivot at top

    group.add(leftLeg);
    group.add(rightLeg);
    group.add(torso);
    group.add(head);
    group.add(leftArm);
    group.add(rightArm);

    // Store references for animation
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}

function animatePersonWalk(person, time, speedMultiplier) {
    if (!person.userData.isWalking) return;
    
    const swing = Math.sin(time * 10 * speedMultiplier) * 0.5;
    person.userData.leftLeg.rotation.x = swing;
    person.userData.rightLeg.rotation.x = -swing;
}

function resetPersonWalk(person) {
    person.userData.isWalking = false;
    person.userData.leftLeg.rotation.x = 0;
    person.userData.rightLeg.rotation.x = 0;
}
