/**
 * Person factory function - creates a 3D humanoid figure
 * 
 * Structure from bottom to top:
 * - Legs (cylinder)
 * - Torso (box)
 * - Head (sphere)
 * - Arms (cylinders attached to torso)
 */
function createPerson() {
    // Create a group to hold all person parts
    const person = new THREE.Group();
    
    // Constants for person dimensions
    const LEG_RADIUS = 0.8;
    const LEG_HEIGHT = 3;
    const TORSO_WIDTH = 2;
    const TORSO_HEIGHT = 4;
    const TORSO_DEPTH = 1.5;
    const HEAD_RADIUS = 1.2;
    const ARM_RADIUS = 0.6;
    const ARM_LENGTH = 3;
    
    // Create legs (cylinder)
    const legsGeometry = new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS, LEG_HEIGHT, 8);
    const legsMaterial = new THREE.MeshBasicMaterial({ color: 0x2c3e50 }); // Dark blue for legs
    const legs = new THREE.Mesh(legsGeometry, legsMaterial);
    legs.rotation.x = Math.PI / 2; // Rotate to stand upright
    person.add(legs);
    
    // Create torso (box)
    const torsoGeometry = new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH);
    const torsoMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db }); // Blue for torso
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = LEG_HEIGHT; // Position on top of legs
    person.add(torso);
    
    // Create head (sphere)
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffdbac }); // Skin tone
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT; // Position on top of torso
    person.add(head);
    
    // Create left arm (cylinder)
    const leftArmGeometry = new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, 8);
    const leftArmMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db }); // Blue for arms
    const leftArm = new THREE.Mesh(leftArmGeometry, leftArmMaterial);
    leftArm.rotation.x = Math.PI / 2; // Rotate to horizontal position
    leftArm.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2 - ARM_LENGTH / 2; // Position at shoulder level
    leftArm.position.z = -TORSO_DEPTH / 2 - ARM_RADIUS; // Position on left side
    person.add(leftArm);
    
    // Create right arm (cylinder)
    const rightArmGeometry = new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, 8);
    const rightArmMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db }); // Blue for arms
    const rightArm = new THREE.Mesh(rightArmGeometry, rightArmMaterial);
    rightArm.rotation.x = Math.PI / 2; // Rotate to horizontal position
    rightArm.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2 - ARM_LENGTH / 2; // Position at shoulder level
    rightArm.position.z = TORSO_DEPTH / 2 + ARM_RADIUS; // Position on right side
    person.add(rightArm);
    
    // Store references for animation
    person.legs = legs;
    person.leftArm = leftArm;
    person.rightArm = rightArm;
    
    return person;
}

// Export as global function if not using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = createPerson;
}