function createPerson(color) {
    // Basic humanoid structure using Three.js primitives
    const person = new THREE.Group();
    person.name = "Person";

    // Torso (main body)
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshLambertMaterial({ color: color })
    );
    torso.position.y = 1;

    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshLambertMaterial({ color: color })
    );
    head.position.y = 2.5;
    torso.add(head);

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.2, 1, 0.2);
    const legMaterial = new THREE.MeshLambertMaterial({ color: color });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);

    // Position legs relative to torso
    leftLeg.position.set(-0.2, 0, 0);
    rightLeg.position.set(0.2, 0, 0);
    torso.add(leftLeg);
    torso.add(rightLeg);

    // Arms (simplified as simple boxes hanging from torso)
    const armGeometry = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    const armMaterial = new THREE.MeshLambertMaterial({ color: color });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.7, 1.2, 0);
    torso.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.7, 1.2, 0);
    torso.add(rightArm);

    person.add(torso);

    // Store references for animation
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    // Set initial position (feet on y=0)
    person.position.y = 0;
    return person;
}