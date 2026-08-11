function createPerson(color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({color: color || 0xffffff});
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.1, 0.3, 0);
    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.1, 0.3, 0);
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.8, 0.3);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.set(0, 1.0, 0);
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 1.7, 0);
    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.35, 1.0, 0);
    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.35, 1.0, 0);
    group.add(leftLeg, rightLeg, torso, head, leftArm, rightArm);
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    return group;
}
