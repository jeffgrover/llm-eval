// Global person model factory
// Returns a THREE.Group with populated userData per H7

// Head geometry (sphere)
function createHead() {
    const headGeometry = new THREE.SphereGeometry(0.3, 8, 6);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    return new THREE.Mesh(headGeometry, headMaterial);
}

// Torso geometry (cylinder)
function createTorso() {
    const torsoGeometry = new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
    return new THREE.Mesh(torsoGeometry, torsoMaterial);
}

// Leg geometry (cylinder)
function createLeg() {
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1.3, 8);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    return new THREE.Mesh(legGeometry, legMaterial);
}

// Create person factory function (global)
function createPerson() {
    // Create group structure
    const personGroup = new THREE.Group();
    
    // Head
    const head = createHead();
    head.position.y = 1.2 - 0.5/2;
    personGroup.add(head);
    
    // Torso
    const torso = createTorso();
    torso.position.y = 1.3 + 1.2/2;
    personGroup.add(torso);
    
    // Legs (two cylinders)
    const leftLeg = createLeg();
    leftLeg.position.set(-0.15, 0, 0);
    personGroup.add(leftLeg);
    
    const rightLeg = createLeg();
    rightLeg.position.set(0.15, 0, 0);
    personGroup.add(rightLeg);
    
    // Store leg references in userData
    personGroup.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    return personGroup;
}