// person.js - Person model factory function

function createPerson() {
    const group = new THREE.Group();
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(1, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: '#ffdbac',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 4;
    group.add(head);
    
    // Torso (cylinder)
    const torsoGeometry = new THREE.CylinderGeometry(1.2, 1.5, 3, 16);
    const torsoMaterial = new THREE.MeshStandardMaterial({
        color: '#3498db',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 2;
    group.add(torso);
    
    // Legs (cylinders)
    const legGeometry = new THREE.CylinderGeometry(0.8, 1, 4, 16);
    const legMaterial = new THREE.MeshStandardMaterial({
        color: '#2c3e50',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.x = -1;
    leftLeg.position.y = 0;
    group.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.x = 1;
    rightLeg.position.y = 0;
    group.add(rightLeg);
    
    // Arms (cylinders)
    const armGeometry = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 16);
    const armMaterial = new THREE.MeshStandardMaterial({
        color: '#3498db',
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-2.5, 3.5, 0);
    leftArm.rotation.z = -Math.PI / 4;
    group.add(leftArm);
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(2.5, 3.5, 0);
    rightArm.rotation.z = Math.PI / 4;
    group.add(rightArm);
    
    // Initial rotation to face elevator
    group.rotation.y = Math.PI; // Face negative Z direction (toward elevator)
    
    return group;
}

// Animation functions for walking
function startWalking(person) {
    let time = 0;
    const walkAnimation = () => {
        time += 0.1;
        // Alternating leg swing using sine wave
        const leftLegAngle = Math.sin(time * 0.5) * 0.3;
        const rightLegAngle = Math.sin(time * 0.5 + Math.PI) * 0.3;
        
        person.children[2].rotation.x = leftLegAngle; // Left leg
        person.children[3].rotation.x = rightLegAngle; // Right leg
    };
    return walkAnimation;
}

function stopWalking(person) {
    person.children[2].rotation.x = 0; // Left leg
    person.children[3].rotation.x = 0; // Right leg
}