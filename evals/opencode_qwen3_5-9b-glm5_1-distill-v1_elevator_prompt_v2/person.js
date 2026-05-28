/**
 * person.js - Person model factory for 3D elevator simulation
 */

/**
 * Creates a humanoid person figure and returns it as a THREE.Group.
 * @returns {THREE.Group} A group containing the person's body parts with userData populated.
 */
function createPerson() {
    const person = new THREE.Group();

    // Material definitions
    const skinToneMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffdbac, 
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide 
    });

    const blueBodyMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x3498db, 
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide 
    });

    const darkLegMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2c3e50, 
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide 
    });

    // === LEGS (attached at hip level) ===
    const legHeight = 1;
    const legRadius = 0.15;

    // Left leg - attached to lower part of torso
    const leftLegGroup = new THREE.Group();
    const leftThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius, legRadius * 0.9, legHeight / 2),
        darkLegMaterial
    );
    leftThigh.position.y = legHeight / 4;
    leftThigh.rotation.x = -Math.PI / 2; // Point down
    leftLegGroup.add(leftThigh);

    const leftShin = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.85, legHeight / 2),
        darkLegMaterial
    );
    leftShin.position.y = -legHeight / 4;
    leftShin.rotation.x = -Math.PI / 2;
    leftLegGroup.add(leftShin);

    // Left foot
    const leftFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, legRadius * 2),
        darkLegMaterial
    );
    leftFoot.position.y = -legHeight / 2;
    leftFoot.rotation.x = -Math.PI / 2;
    leftLegGroup.add(leftFoot);

    // Store mesh references for animation
    person.userData.leftLeg = leftShin; // The shin is the part that rotates during walking

    // Right leg
    const rightLegGroup = new THREE.Group();
    const rightThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius, legRadius * 0.9, legHeight / 2),
        darkLegMaterial
    );
    rightThigh.position.y = legHeight / 4;
    rightThigh.rotation.x = -Math.PI / 2;
    rightLegGroup.add(rightThigh);

    const rightShin = new THREE.Mesh(
        new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.85, legHeight / 2),
        darkLegMaterial
    );
    rightShin.position.y = -legHeight / 4;
    rightShin.rotation.x = -Math.PI / 2;
    person.userData.rightLeg = rightShin; // The shin is the part that rotates during walking

    const rightFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, legRadius * 2),
        darkLegMaterial
    );
    rightFoot.position.y = -legHeight / 2;
    rightFoot.rotation.x = -Math.PI / 2;
    rightLegGroup.add(rightFoot);

    // === TORSO (at hip level, legs attach to it) ===
    const torsoWidth = 0.4;
    const torsoDepth = 0.3;
    const torsoHeight = 1.2;

    const torsoMesh = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        blueBodyMaterial
    );
    torsoMesh.position.y = legHeight / 2; // Legs attach at y=0 relative to torso
    person.add(leftLegGroup);
    person.add(rightLegGroup);
    person.add(torsoMesh);

    // Arms attached at shoulder level (above torso)
    const armWidth = 0.18;
    const armDepth = 0.25;
    const armHeight = 1.3;
    const armPositionY = torsoHeight / 2 + 0.2; // Shoulder height relative to hip

    // Left arm
    const leftArmMesh = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        skinToneMaterial
    );
    leftArmMesh.position.set(-torsoWidth / 2 - armWidth / 2, armPositionY, torsoDepth / 2);
    person.add(leftArmMesh);

    // Right arm
    const rightArmMesh = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armHeight, armDepth),
        skinToneMaterial
    );
    rightArmMesh.position.set(torsoWidth / 2 + armWidth / 2, armPositionY, torsoDepth / 2);
    person.add(rightArmMesh);

    // === HEAD (on top of torso) ===
    const headRadius = 0.18;
    const neckHeight = 0.15;

    const neckMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(headRadius * 0.7, headRadius * 0.6, neckHeight),
        skinToneMaterial
    );
    neckMesh.position.y = torsoHeight + neckHeight / 2;
    person.add(neckMesh);

    const headMesh = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        skinToneMaterial
    );
    headMesh.position.y = neckHeight;
    person.add(headMesh);

    // Person is initially created at position (0, 0, 0) facing positive Z
    // To face the elevator (which is at negative Z relative to waiting area),
    // we rotate 180 degrees around Y axis
    person.rotation.y = Math.PI;

    return person;
}