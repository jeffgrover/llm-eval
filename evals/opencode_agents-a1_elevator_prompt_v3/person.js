// Person factory function - creates a humanoid figure with proper userData structure

function createPerson() {
    const person = new THREE.Group();

    // Leg material - dark color
    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    // Torso material - blue
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    // Head material - skin tone
    const headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });

    // Legs are positioned at the bottom of the group
    // Left leg
    const leftLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.8, 0.3),
        legMaterial
    );
    leftLeg.position.set(-0.25, 0.4, 0);

    // Right leg
    const rightLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.8, 0.3),
        legMaterial
    );
    rightLeg.position.set(0.25, 0.4, 0);

    // Torso (body) - positioned above legs
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 1.0, 0.4),
        torsoMaterial
    );
    torso.position.set(0, 1.2, 0);

    // Head - positioned on top of torso
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        headMaterial
    );
    head.position.set(0, 1.85, 0);

    // Arms hang DOWN from shoulders (at torso top)
    const armMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.7, 0.2),
        armMaterial
    );
    leftArm.position.set(-0.5, 1.6, 0);

    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.7, 0.2),
        armMaterial
    );
    rightArm.position.set(0.5, 1.6, 0);

    // Add all parts to person group
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(leftArm);
    person.add(rightArm);

    // Set userData as required by elevator.js animation loop
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
