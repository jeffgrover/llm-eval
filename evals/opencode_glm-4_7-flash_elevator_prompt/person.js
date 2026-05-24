/**
 * Factory function to create a simple 3D humanoid figure.
 * @param {THREE.Color} bodyColor - Color for the main body parts.
 * @param {THREE.Color} headColor - Color for the head.
 * @param {THREE.Color} legColor - Color for the legs.
 * @returns {THREE.Group} The complete person model.
 */
function createPerson(bodyColor, headColor, legColor) {
    // Constants for sizing based on required proportions
    const HEAD_RADIUS = 0.5;
    const TORSO_HEIGHT = 2.0;
    const LEG_HEIGHT = 2.0;
    const LIMB_THICKNESS = 0.2;
    const ARM_LENGTH = 1.5;
    const SHOULDERS_HEIGHT = TORSO_HEIGHT * 0.7;

    const person = new THREE.Group();

    // --- Head ---
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ color: headColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = TORSO_HEIGHT + (HEAD_RADIUS / 2); // Position on top of torso
    person.add(head);

    // --- Torso ---
    const torsoGeometry = new THREE.CylinderGeometry(0.5, 0.5, TORSO_HEIGHT, 16);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = TORSO_HEIGHT / 2; // Centered vertically around the origin
    person.add(torso);

    // --- Legs (Simulating simple stick/cylinder structure for leg movement) ---
    const legGeometry = new THREE.CylinderGeometry(LIMB_THICKNESS, LIMB_THICKNESS, LEG_HEIGHT, 8);
    const legMaterial = new THREE.MeshPhongMaterial({ color: legColor });

    // Left Leg
    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.3, LEG_HEIGHT / 2, 0);
    person.add(legL);

    // Right Leg
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.3, LEG_HEIGHT / 2, 0);
    person.add(legR);

    // --- Arms (Hanging down from shoulders) ---
    const armGeometry = new THREE.CylinderGeometry(LIMB_THICKNESS / 2, LIMB_THICKNESS / 2, ARM_LENGTH, 8);
    const armMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
    
    // Left Arm (Starting position: hanging down)
    const armL = new THREE.Mesh(armGeometry, armMaterial);
    // Arm pivot point is shoulder level (TORSO_HEIGHT * 0.7)
    armL.position.set(-0.5, SHOULDERS_HEIGHT + (ARM_LENGTH / 2), 0); 
    armL.rotation.z = Math.PI / 2; // Adjust orientation
    person.add(armL);

    // Right Arm (Starting position: hanging down)
    const armR = new THREE.Mesh(armGeometry, armMaterial);
    armR.position.set(0.5, SHOULDERS_HEIGHT + (ARM_LENGTH / 2), 0);
    armR.rotation.z = -Math.PI / 2; // Adjust orientation
    person.add(armR);

    // Store necessary components for animation/interaction later
    person.userData.legs = { legL, legR };
    person.userData.arms = { armL, armR };
    person.userData.isWalking = false;
    person.userData.isBoarded = false;
    person.userData.originalPosition = new THREE.Vector3(0, 0, 0);

    return person;
}