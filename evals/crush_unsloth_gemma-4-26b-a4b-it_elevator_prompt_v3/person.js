/**
 * person.js
 * Factory for creating humanoid figures.
 */

function createPerson() {
    const group = new THREE.Group();

    // Colors
    const skinColor = 0xffdbac;
    const bodyColor = 0x3498db;
    const legColor = 0x2c3e50;

    // Legs (pivoted at top for swinging)
    const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const legMaterial = new THREE.MeshStandardMaterial({ color: legColor });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, 0.4, 0); // Pivot point at hip (y=0.4)
    // To make it pivot from the top, we offset the geometry or use a wrapper
    const leftLegPivot = new THREE.Group();
    leftLegPivot.add(leftLeg);
    leftLeg.position.set(0, -0.4, 0); // Offset mesh so top is at group center

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, 0.4, 0);
    const rightLegPivot = new THREE.Group();
    rightLegPivot.add(rightLeg);
    rightLeg.position.set(0, -0.4, 0);

    group.add(leftLegPivot);
    group.add(rightLegPivot);

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 1.2, 0); // Above legs (legs are 0.8 tall)
    group.add(torso);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMaterial = new THREE.MeshStandardMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.8, 0); // Above torso (torso is 0.8 tall + 0.4 offset)
    group.add(head);

    // Arms (hanging down from shoulders)
    const armGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const armMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.4, 1.5, 0); // Shoulder level (torso is at y=1.2, height 0.8 -> top is 1.6)
    // Adjusting: torso center is 1.2, top is 1.6. Let's put arms at 1.5.
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.4, 1.5, 0);
    group.add(rightArm);

    // Populate userData as required by H7
    group.userData = {
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        isWalking: false
    };

    return group;
}
