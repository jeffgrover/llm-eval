function createPerson(color) {
    // Base humanoid structure
    let person = new THREE.Group();
    person.name = "Person";

    // Torso (simple box)
    let torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2, 0.5),
        new THREE.MeshPhongMaterial({ color: color })
    );
    torso.position.y = 1;
    person.add(torso);

    // Head (simple sphere)
    let head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshPhongMaterial({ color: color })
    );
    head.position.y = 2.5;
    person.add(head);

    // Legs (simple cylinders)
    const legHeight = 1.5;
    const legRadius = 0.15;

    let leftLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8),
        new THREE.MeshPhongMaterial({ color: color })
    );
    leftLeg.position.set(-0.15, legHeight / 2, 0);
    person.add(leftLeg);

    let rightLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8),
        new THREE.MeshPhongMaterial({ color: color })
    );
    rightLeg.position.set(0.15, legHeight / 2, 0);
    person.add(rightLeg);

    // Arms (simple boxes/cylinders, hanging down)
    const armLength = 1.2;
    const armRadius = 0.08;

    let leftArm = new THREE.Mesh(
        new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8),
        new THREE.MeshPhongMaterial({ color: color })
    );
    leftArm.position.set(-0.4, 1.5, 0);
    person.add(leftArm);

    let rightArm = new THREE.Mesh(
        new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8),
        new THREE.MeshPhongMaterial({ color: color })
    );
    rightArm.position.set(0.4, 1.5, 0);
    person.add(rightArm);

    // User data contract fulfillment
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        currentFloor: 1, // Initialize floor
        inElevator: false // Initialize state
    };
    
    return person;
}
