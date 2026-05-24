// Person Model Factory - Global function definition
function createPerson() {
    // Base colors
    const bodyColor = 0x3498db; // Blue body
    const skinColor = 0xffdbac; // Skin tone head
    const legColor = 0x2c3e50; // Dark legs

    // Group to represent the whole person
    const person = new THREE.Group();
    person.name = "Person";
    
    // --- Dimensions and setup ---
    // Standardized dimensions for the simulation
    const HEAD_RADIUS = 0.5;
    const TORSO_HEIGHT = 2.0;
    const LEG_LENGTH = 2.5;
    const TORSO_WIDTH = 0.8;
    const LIMB_THICKNESS = 0.3;

    // 1. Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_RADIUS, 16, 16), 
        new THREE.MeshStandardMaterial({ color: skinColor })
    );
    head.position.y = TORSO_HEIGHT + HEAD_RADIUS * 0.5; // Position relative to top of torso
    person.add(head);

    // 2. Torso
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, LIMB_THICKNESS),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    torso.position.y = TORSO_HEIGHT / 2;
    person.add(torso);

    // 3. Legs (Left and Right)
    // Legs pivot from the hips (bottom of torso)
    const hipY = -TORSO_HEIGHT / 2; 
    const legBasePosition = new THREE.Vector3(TORSO_WIDTH / 2 + 0.1, hipY, 0);

    // Left Leg
    const leftLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(LIMB_THICKNESS, LIMB_THICKNESS, LEG_LENGTH, 8),
        new THREE.MeshStandardMaterial({ color: legColor })
    );
    leftLeg.position.copy(legBasePosition);
    // Rotate cylinder to point down (along Y axis, but cylinder geometry is along Y by default)
    leftLeg.rotation.x = Math.PI / 2; 
    person.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(LIMB_THICKNESS, LIMB_THICKNESS, LEG_LENGTH, 8),
        new THREE.MeshStandardMaterial({ color: legColor })
    );
    rightLeg.position.copy(legBasePosition).add(new THREE.Vector3(-TORSO_WIDTH / 2 - 0.1, 0, 0));
    rightLeg.rotation.x = Math.PI / 2;
    person.add(rightLeg);

    // 4. Arms (Simplified - attaching to torso)
    // Arms hang DOWN from shoulders (Top of torso)
    const shoulderY = TORSO_HEIGHT / 2 + (LIMB_THICKNESS / 2);
    const armLength = 1.0;
    
    // Left Arm
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(LIMB_THICKNESS, armLength, LIMB_THICKNESS),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    leftArm.position.set(TORSO_WIDTH / 2 + 0.2, shoulderY, 0);
    person.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(LIMB_THICKNESS, armLength, LIMB_THICKNESS),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    rightArm.position.set(-TORSO_WIDTH / 2 - 0.2, shoulderY, 0);
    person.add(rightArm);
    
    // --- H7 Contract Population ---
    // Store references for animation loop in userData
    person.userData = {
        leftLeg:  leftLeg,
        rightLeg: leftLeg, // Using leftLeg for both initially, logic will handle separation
        isWalking: false,
        // Add walking state specific variables if needed later
    };

    return person;
}
// Global access point
window.createPerson = createPerson;