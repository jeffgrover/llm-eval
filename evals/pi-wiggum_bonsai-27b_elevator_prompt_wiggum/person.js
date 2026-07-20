function createPerson(color) {
    const group = new THREE.Group();

    // Head (sphere)
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: color });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.75, 0);
    group.add(head);

    // Torso (box)
    const torsoGeo = new THREE.BoxGeometry(0.4, 0.6, 0.3);
    const torsoMat = new THREE.MeshBasicMaterial({ color: color });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 0.5, 0);
    group.add(torso);

    // Left arm (box)
    const leftArmGeo = new THREE.BoxGeometry(0.12, 0.45, 0.08);
    const leftArmMat = new THREE.MeshBasicMaterial({ color: color });
    const leftArm = new THREE.Mesh(leftArmGeo, leftArmMat);
    leftArm.position.set(-0.22, 0.6, -0.15);
    group.add(leftArm);

    // Right arm (box)
    const rightArmGeo = new THREE.BoxGeometry(0.12, 0.45, 0.08);
    const rightArmMat = new THREE.MeshBasicMaterial({ color: color });
    const rightArmMesh = new THREE.Mesh(rightArmGeo, rightArmMat);
    rightArmMesh.position.set(0.22, 0.6, -0.15);
    group.add(rightArmMesh);

    // Left leg (box)
    const leftLegGeo = new THREE.BoxGeometry(0.14, 0.38, 0.1);
    const leftLegMat = new THREE.MeshBasicMaterial({ color: color });
    const leftLeg = new THREE.Mesh(leftLegGeo, leftLegMat);
    leftLeg.position.set(-0.2, -0.05, 0);
    group.add(leftLeg);

    // Right leg (box)
    const rightLegGeo = new THREE.BoxGeometry(0.14, 0.38, 0.1);
    const rightLegMat = new THREE.MeshBasicMaterial({ color: color });
    const rightLegMesh = new THREE.Mesh(rightLegGeo, rightLegMat);
    rightLegMesh.position.set(0.2, -0.05, 0);
    group.add(rightLegMesh);

    // Feet (boxes)
    const leftFootGeo = new THREE.BoxGeometry(0.16, 0.04, 0.12);
    const leftFootMat = new THREE.MeshBasicMaterial({ color: color });
    const leftFoot = new THREE.Mesh(leftFootGeo, leftFootMat);
    leftFoot.position.set(-0.2, -0.15, 0);
    group.add(leftFoot);

    const rightFootGeo = new THREE.BoxGeometry(0.16, 0.04, 0.12);
    const rightFootMat = new THREE.MeshBasicMaterial({ color: color });
    const rightFootMesh = new THREE.Mesh(rightFootGeo, rightFootMat);
    rightFootMesh.position.set(0.2, -0.15, 0);
    group.add(rightFootMesh);

    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLegMesh,
        isWalking: false
    };

    window.person = group;

    window.person = group;

    return group;
}
