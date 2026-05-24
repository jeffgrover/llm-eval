// person.js
// Global function to create a person model.
// Must adhere to H7: person.userData contract.

/**
 * Creates a simple 3D humanoid figure.
 * @returns {THREE.Group} The person object.
 */
function createPerson() {
    // Colors defined in the prompt
    const bodyColor = new THREE.Color(0x3498db); // Blue body
    const skinColor = new THREE.Color(0xffdbac); // Skin tone head
    const legColor = new THREE.Color(0x2c3e50); // Dark legs

    // 1. Head (Sphere)
    const headGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);

    // 2. Torso (Cylinder)
    const torsoGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 16);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);

    // 3. Legs (Cylinder, two of them)
    const legGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 12);
    const legMaterial = new THREE.MeshStandardMaterial({ color: legColor });

    // Left Leg
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.2, 0.5, 0); // Offset from center
    // Right Leg
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.2, 0.5, 0); // Offset from center

    // Assemble the person body
    const person = new THREE.Group();
    person.add(head);
    person.add(torso);
    person.add(leftLeg);
    person.add(rightLeg);

    // Position adjustments to ensure feet align with floor level (Y=0 for the base of the person)
    // Since the torso is 1.0 unit tall, and the legs are 1.0 unit tall, and the head is 0.5 unit radius (1.0 tall),
    // let's adjust the whole group so the bottom of the legs is at Y=0.
    // Current setup: Torso starts at Y=0, legs start at Y=0.5. This is complex.
    // Let's place the pivot point (the group's position) such that the feet are on the ground (Y=0).
    // Total height from ground to head top: 1.0 (torso) + 0.5 (head radius) = 1.5 units.
    // If the legs are placed at the base of the torso, we need to shift everything down.
    // A simpler approach: make the legs start at Y=0.
    leftLeg.position.y = 0;
    rightLeg.position.y = 0;
    torso.position.y = 1.0; // Torso starts above the legs
    head.position.y = 1.0 + 0.5; // Head starts above the torso

    // Final position adjustment for the person group to align the feet/base at Y=0
    person.position.y = 0; 
    
    // H7 Contract: Populate userData
    person.userData = {
        leftLeg:  leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
// No export statement (H2 compliance)
