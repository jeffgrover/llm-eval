function createPerson() {
    const group = new THREE.Group();

    // Dimensions
    const headRadius = 0.2;
    const bodyWidth = 0.4;
    const bodyHeight = 0.6;
    const legLength = 0.7;
    const armLength = 0.6;

    // Materials
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const legMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 16, 16), skinMat);
    head.position.y = bodyHeight + headRadius + 0.1;
    group.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth, bodyHeight, 0.2), bodyMat);
    torso.position.y = bodyHeight / 2;
    group.add(torso);

    // Legs
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-bodyWidth / 2 + 0.05, 0, 0);
    
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, legLength, 0.15), legMat);
    leftLegMesh.position.y = -legLength / 2;
    leftLegGroup.add(leftLegMesh);
    group.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(bodyWidth / 2 - 0.05, 0, 0);
    
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, legLength, 0.15), legMat);
    rightLegMesh.position.y = -legLength / 2;
    rightLegGroup.add(rightLegMesh);
    group.add(rightLegGroup);

    // Arms
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-bodyWidth / 2 - 0.05, bodyHeight / 4, 0);
    
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, armLength, 0.12), bodyMat);
    leftArmMesh.position.y = armLength / 2;
    leftArmGroup.add(leftArmMesh);
    group.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(bodyWidth / 2 + 0.05, bodyHeight / 4, 0);
    
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, armLength, 0.12), bodyMat);
    rightArmMesh.position.y = armLength / 2;
    rightArmGroup.add(rightArmMesh);
    group.add(rightArmGroup);

    // Position to ground
    group.position.y = -legLength;

    group.userData = {
        leftLeg: leftLegGroup,
        rightLeg: rightLegGroup,
        isWalking: false
    };

    return group;
}
