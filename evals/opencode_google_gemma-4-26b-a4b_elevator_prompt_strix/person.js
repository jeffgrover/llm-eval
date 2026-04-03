/**
 * person.js
 * Factory function for creating a simple 3D humanoid figure.
 */

function createPerson() {
    const personGroup = new THREE.Group();

    // Colors from specification
    const colorBody = 0x3498db; // Blue body
    const colorHead = 0xffdbac; // Skin tone head
    const colorLegs = 0x2c3e50; // Dark legs
    const colorArms = 0x3498db; // Same as body

    // Dimensions
    const torsoHeight = 0.6;
    const torsoWidth = 0.3;
    const torsoDepth = 0.2;
    const headRadius = 0.15;
    const legHeight = 0.5;
    const legWidth = 0.12;
    const armHeight = 0.4;
    const armWidth = 0.08;

    // 1. Legs (using Groups for hip pivot rotation)
    const createLeg = () => {
        const legGroup = new THREE.Group();
        const legMesh = new THREE.Mesh(
            new THREE.BoxGeometry(legWidth, legHeight, legWidth),
            new THREE.MeshStandardMaterial({ color: colorLegs })
        );
        // Position mesh so pivot is at the top (the hip)
        legMesh.position.y = -legHeight / 2;
        legGroup.add(legMesh);
        return legGroup;
    };

    const leftLeg = createLeg();
    leftLeg.position.x = -legWidth / 2 - 0.02;
    leftLeg.position.y = 0; // Will be set relative to torso

    const rightLeg = createLeg();
    rightLeg.position.x = legWidth / 2 + 0.02;
    rightLeg.position.y = 0;

    personGroup.add(leftLeg);
    personGroup.add(rightLeg);

    // 2. Torso
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        new THREE.MeshStandardMaterial({ color: colorBody })
    );
    torso.position.y = legHeight + torsoHeight / 2; // Positioned above legs
    personGroup.add(torso);

    // 3. Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        new THREE.MeshStandardMaterial({ color: colorHead })
    );
    head.position.y = legHeight + torsoHeight + headRadius;
    personGroup.add(head);

    // 4. Arms (hanging DOWN from shoulders)
    const createArm = (isLeft) => {
        const armMesh = new THREE.Mesh(
            new THREE.BoxGeometry(armWidth, armHeight, armWidth),
            new THREE.MeshStandardMaterial({ color: colorArms })
        );
        // Position at shoulder level of torso
        const shoulderY = legHeight + torsoHeight - 0.1;
        const shoulderX = isLeft ? -torsoWidth / 2 - armWidth / 2 : torsoWidth / 2 + armWidth / 2;
        armMesh.position.set(shoulderX, shoulderY - armHeight / 2, 0);
        return armMesh;
    };

    const leftArm = createArm(true);
    const rightArm = createArm(false);
    personGroup.add(leftArm);
    personGroup.add(rightArm);

    // To make sure feet align with floor level (y=0):
    // The total height of the person is legHeight + torsoHeight + headRadius*2 (approx)
    // But we specifically set legs to start at y=0 via leftLeg/rightLeg position.
    // Let's ensure the group itself is positioned such that the bottom of the feet is at 0.
    // Since leftLeg.position.y = 0 and legMesh.position.y = -legHeight/2, the bottom is at -legHeight.
    // We need to shift the whole group up by legHeight.
    personGroup.position.y = legHeight;

    // Return object with references for animation
    return {
        mesh: personGroup,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        totalHeight: legHeight + torsoHeight + headRadius * 2
    };
}
