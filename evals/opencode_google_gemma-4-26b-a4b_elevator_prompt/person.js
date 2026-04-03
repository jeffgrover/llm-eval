// person.js

/**
 * Factory function to create a simple 3D humanoid figure using Three.js primitives.
 * @param {THREE.Scene} scene - The scene to add the person to.
 * @param {number} floorY - The Y coordinate of the floor level.
 * @returns {THREE.Group} A group containing the person's parts for animation and movement.
 */
window.createPerson = function(scene, floorY) {
    const personGroup = new THREE.Group();
    personGroup.position.y = floorY;

    // Colors from requirements
    const skinTone = 0xffdbac;
    const bodyColor = 0x3498db;
    const legColor = 0x2c3e50;

    // 1. Legs (must align feet with floor level)
    const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const legMaterial = new THREE.MeshStandardMaterial({ color: legColor });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, 0.25, 0); 
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, 0.25, 0);

    personGroup.add(leftLeg);
    personGroup.add(rightLeg);

    // 2. Torso (starts at top of legs)
    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.3);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.5 + 0.3; 

    personGroup.add(torso);

    // 3. Head (on top of torso)
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: skinTone });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.1 + 0.15; 
    personGroup.add(head);

    // 4. Arms (hanging DOWN from shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
    const armMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    
    // Left Arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.25, 1.1 - 0.25, 0); 
    personGroup.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.25, 1.1 - 0.25, 0);
    personGroup.add(rightArm);

    // Store references for animation
    personGroup.userData.leftLeg = leftLeg;
    personGroup.userData.rightLeg = rightLeg;
    personGroup.userData.isWalking = false;

    return personGroup;
};
