// person.js - Creates a 3D humanoid figure with proper userData

function createPerson() {
    const person = new THREE.Group();

    // Legs (dark blue)
    const legGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);

    // Position legs at bottom of person (feet at y=0)
    leftLeg.position.set(-0.15, 0.4, 0);
    rightLeg.position.set(0.15, 0.4, 0);

    // Torso (blue)
    const torsoGeometry = new THREE.BoxGeometry(0.6, 0.9, 0.3);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 1.3, 0);

    // Head (skin tone)
    const headGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.925, 0);

    // Arms (blue, hang DOWN from shoulders)
    const armGeometry = new THREE.BoxGeometry(0.15, 0.7, 0.15);
    const armMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);

    // Position arms at shoulder level (y=1.675)
    leftArm.position.set(-0.4, 1.675, 0);
    rightArm.position.set(0.4, 1.675, 0);

    // Add all parts to person group
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);

    // Populate userData per H7 contract - CRITICAL for animation loop
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
