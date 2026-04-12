// person.js

/**
 * Factory function to create a simple humanoid figure using Three.js primitives.
 * @param {THREE.Vector3} position - Initial world position for the base of the character.
 * @returns {THREE.Group} The assembled character group.
 */
function createPerson(position) {
    const person = new THREE.Group();

    // --- Constants derived from requirements ---
    const BODY_HEIGHT = 3.0; // Total height approximation for scaling
    const TORSO_HEIGHT = 1.5;
    const HEAD_RADIUS = 0.4;
    const LEG_LENGTH = 1.2;
    const ARM_LENGTH = 0.8;

    // --- Materials ---
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db }); // Blue body
    const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac }); // Skin tone head
    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 }); // Dark legs

    // --- Geometry Creation ---

    // 1. Legs (Two cylinders)
    const legGeometry = new THREE.CylinderGeometry(0.2, 0.2, LEG_LENGTH, 8);
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);

    // Position legs relative to the hip joint (which will be at the base of the torso)
    leftLeg.position.set(-0.15, LEG_LENGTH / 2, 0);
    rightLeg.position.set(0.15, LEG_LENGTH / 2, 0);

    // 2. Torso (Box)
    const torsoGeometry = new THREE.BoxGeometry(0.6, TORSO_HEIGHT, 0.3);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = LEG_LENGTH + TORSO_HEIGHT / 2; // Position above legs

    // 3. Head (Sphere)
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = LEG_LENGTH + TORSO_HEIGHT + HEAD_RADIUS / 2; // Position on top of torso

    // 4. Arms (Two boxes/cylinders attached to the torso)
    const armGeometry = new THREE.BoxGeometry(0.1, ARM_LENGTH, 0.3);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);

    // Initial position: Arms hanging down from shoulders (Torso top Y + half arm length)
    const shoulderY = LEG_LENGTH + TORSO_HEIGHT - 0.2; // Slightly below the very top of torso for visual balance
    leftArm.position.set(-0.35, shoulderY, 0);
    rightArm.position.set(0.35, shoulderY, 0);

    // --- Assembly and Parenting ---

    // Group legs together at hip level (relative to the character group origin)
    const legGroup = new THREE.Group();
    legGroup.add(leftLeg);
    legGroup.add(rightLeg);

    // Torso is parented to the main person group, but we need a pivot point for legs/arms relative to torso center
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);
    person.add(legGroup);

    // Set the base position of the character group so that its origin (0,0,0) is at the feet level
    // The legs are positioned relative to this pivot point.
    person.position.y = 0; // We will adjust final world Y later based on floor height

    return person;
}

/**
 * Updates the walking animation state for a person model.
 * @param {THREE.Group} person - The character group.
 * @param {number} time - Current time in seconds.
 * @param {boolean} isWalking - Whether the character should be animated.
 */
function animateWalk(person, time, isWalking) {
    if (!isWalking) return;

    // Simple leg swing animation using sine wave on X-axis rotation (pivoting from hips/body)
    const swingSpeed = 10; // radians per second influence
    const maxSwingAngle = Math.PI / 6; // ~30 degrees

    // Apply rotation to the leg group pivot point (which is relative to the torso/hips)
    person.children[4].rotation.x = Math.sin(time * swingSpeed) * maxSwingAngle;
}

window.createPerson = createPerson;
window.animateWalk = animateWalk;