function createPerson() {
    const person = new THREE.Group();
    
    // Legs
    const legGeom = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    const leftLeg = new THREE.Mesh(legGeom, new THREE.MeshPhongMaterial({ color: 0x2c3e50 }));
    const rightLeg = new THREE.Mesh(legGeom, new THREE.MeshPhongMaterial({ color: 0x2c3e50 }));
    leftLeg.position.y = -0.5;
    rightLeg.position.y = -0.5;
    person.add(leftLeg);
    person.add(rightLeg);
    
    // Torso
    const torsoGeom = new THREE.BoxGeometry(0.5, 1, 0.5);
    const torso = new THREE.Mesh(torsoGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    torso.position.y = 0;
    person.add(torso);
    
    // Head
    const headGeom = new THREE.SphereGeometry(0.3, 16);
    const head = new THREE.Mesh(headGeom, new THREE.MeshPhongMaterial({ color: 0xffdbac }));
    head.position.y = 0.5;
    person.add(head);
    
    // Arms
    const armGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    const leftArm = new THREE.Mesh(armGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    const rightArm = new THREE.Mesh(armGeom, new THREE.MeshPhongMaterial({ color: 0x3498db }));
    leftArm.position.set(-0.5, 0.5, 0);
    rightArm.position.set(0.5, 0.5, 0);
    person.add(leftArm);
    person.add(rightArm);
    
    // Set up userData
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    return person;
}