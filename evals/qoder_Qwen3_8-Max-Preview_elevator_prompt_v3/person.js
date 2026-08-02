// person.js - Person model factory for the elevator simulation.
// Plain classic script: defines the global createPerson() function only.
// No modules, no shared simulation globals (those live in elevator.js).

function createPerson() {
    const person = new THREE.Group();
    person.name = "person";

    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    const skinMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });

    // Dimensions (bottom to top): legs -> torso -> head, arms at shoulder level.
    const legHeight = 0.5;
    const torsoHeight = 0.6;
    const headRadius = 0.17;

    // Legs pivot from the hips: the pivot group sits at the top of the leg and
    // the visible leg mesh hangs below it, so rotation.x swings from the hip.
    const legGeometry = new THREE.BoxGeometry(0.16, legHeight, 0.16);

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.12, legHeight, 0);
    const leftLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    leftLegMesh.position.set(0, -legHeight / 2, 0);
    leftLeg.add(leftLegMesh);
    person.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.12, legHeight, 0);
    const rightLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    rightLegMesh.position.set(0, -legHeight / 2, 0);
    rightLeg.add(rightLegMesh);
    person.add(rightLeg);

    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, torsoHeight, 0.26),
        bodyMaterial
    );
    torso.position.set(0, legHeight + torsoHeight / 2, 0);
    person.add(torso);

    // Arms hang DOWN from the shoulders (shoulder line = top of torso).
    const shoulderY = legHeight + torsoHeight;
    const armLength = 0.55;
    const armGeometry = new THREE.BoxGeometry(0.12, armLength, 0.12);

    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.3, shoulderY - armLength / 2, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(0.3, shoulderY - armLength / 2, 0);
    person.add(rightArm);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 12),
        skinMaterial
    );
    head.position.set(0, shoulderY + headRadius + 0.03, 0);
    person.add(head);

    // Feet sit exactly at the group's local y = 0, so placing the group at a
    // floor's Y puts the feet flush with that floor surface.
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        homeFloor: 0
    };

    return person;
}
