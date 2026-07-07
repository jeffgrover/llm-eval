function createPerson(floorY) {
    const person = new THREE.Group();
    
    const bodyColor = 0x3498db;
    const skinColor = 0xffdbac;
    const legColor = 0x2c3e50;
    
    const personHeight = 1.8;
    const torsoHeight = 0.7;
    const headHeight = 0.25;
    const legHeight = 0.6;
    const armLength = 0.5;
    
    const torsoWidth = 0.3;
    const legWidth = 0.12;
    const headRadius = 0.15;
    
    person.position.y = floorY + legHeight;
    
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoWidth * 0.8),
        new THREE.MeshPhongMaterial({ color: bodyColor })
    );
    torso.position.y = legHeight + torsoHeight / 2;
    person.add(torso);
    
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        new THREE.MeshPhongMaterial({ color: skinColor })
    );
    head.position.y = legHeight + torsoHeight + headRadius;
    person.add(head);
    
    const leftLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legWidth * 0.8),
        new THREE.MeshPhongMaterial({ color: legColor })
    );
    leftLeg.position.set(-legWidth * 0.5, legHeight / 2, 0);
    person.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legWidth * 0.8),
        new THREE.MeshPhongMaterial({ color: legColor })
    );
    rightLeg.position.set(legWidth * 0.5, legHeight / 2, 0);
    person.add(rightLeg);
    
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(armLength * 0.6, armLength * 0.4, armLength * 0.4),
        new THREE.MeshPhongMaterial({ color: skinColor })
    );
    leftArm.position.set(-torsoWidth * 0.6, legHeight + torsoHeight * 0.4, 0);
    leftArm.rotation.z = 0.3;
    person.add(leftArm);
    
    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(armLength * 0.6, armLength * 0.4, armLength * 0.4),
        new THREE.MeshPhongMaterial({ color: skinColor })
    );
    rightArm.position.set(torsoWidth * 0.6, legHeight + torsoHeight * 0.4, 0);
    rightArm.rotation.z = -0.3;
    person.add(rightArm);
    
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    person.rotation.y = Math.PI;
    
    return person;
}