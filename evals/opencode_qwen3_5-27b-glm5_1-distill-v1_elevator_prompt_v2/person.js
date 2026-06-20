// Person model factory function
function createPerson() {
    const group = new THREE.Group();

    // Body dimensions
    const torsoWidth = 0.4;
    const torsoHeight = 0.6;
    const torsoDepth = 0.25;
    
    const headRadius = 0.25;
    
    const legWidth = 0.15;
    const legHeight = 0.8;
    const legDepth = 0.15;

    // Torso - blue body
    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = legHeight + torsoHeight / 2;
    group.add(torso);

    // Head - skin tone
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = legHeight + torsoHeight + headRadius;
    group.add(head);

    // Left leg - dark legs
    const leftLegGeometry = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const leftLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    leftLeg.position.set(-torsoWidth / 4, legHeight / 2, 0);
    group.add(leftLeg);

    // Right leg - dark legs
    const rightLeg = new THREE.Mesh(leftLegGeometry, legMaterial);
    rightLeg.position.set(torsoWidth / 4, legHeight / 2, 0);
    group.add(rightLeg);

    // Arms attached at shoulder level (hanging down from shoulders)
    const armWidth = 0.1;
    const armHeight = torsoHeight * 0.8;
    const armDepth = 0.1;
    
    const leftArmGeometry = new THREE.BoxGeometry(armWidth, armHeight, armDepth);
    const leftArm = new THREE.Mesh(leftArmGeometry, legMaterial);
    // Attach at shoulder level - top of torso minus half arm height
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, legHeight + torsoHeight - armHeight / 2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(leftArmGeometry, legMaterial);
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, legHeight + torsoHeight - armHeight / 2, 0);
    group.add(rightArm);

    // Populate userData as required by H7
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}
