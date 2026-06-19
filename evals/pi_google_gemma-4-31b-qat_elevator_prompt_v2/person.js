function createPerson() {
    const group = new THREE.Group();

    // Materials
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    // Legs (Pivot points for animation)
    const leftLegPivot = new THREE.Group();
    const rightLegPivot = new THREE.Group();

    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const leftLeg = new THREE.Mesh(legGeo, legMaterial);
    const rightLeg = new THREE.Mesh(legGeo, legMaterial);

    // Offset leg mesh so it pivots from the top
    leftLeg.position.y = -0.25;
    rightLeg.position.y = -0.25;

    leftLegPivot.add(leftLeg);
    rightLegPivot.add(rightLeg);

    leftLegPivot.position.set(-0.15, 0, 0);
    rightLegPivot.position.set(0.15, 0, 0);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    const torso = new THREE.Mesh(torsoGeo, bodyMaterial);
    torso.position.y = 0.3;

    // Head
    const headGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    head.position.y = 0.75;

    // Arms (Shoulder level, hanging DOWN)
    const armGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
    const leftArm = new THREE.Mesh(armGeo, bodyMaterial);
    const rightArm = new THREE.Mesh(armGeo, bodyMaterial);

    leftArm.position.set(-0.32, 0.4, 0);
    rightArm.position.set(0.32, 0.4, 0);

    group.add(leftLegPivot);
    group.add(rightLegPivot);
    group.add(torso);
    group.add(head);
    group.add(leftArm);
    group.add(rightArm);

    // H7: person.userData CONTRACT
    group.userData = {
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        isWalking: false
    };

    return group;
}
