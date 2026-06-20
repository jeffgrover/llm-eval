// person.js — Person model factory (global scope, no modules)

/**
 * Creates a 3D humanoid figure made from Three.js primitives.
 * Returns a THREE.Group with userData populated per contract:
 *   { leftLeg, rightLeg, isWalking }
 */
function createPerson() {
    var person = new THREE.Group();

    // Materials
    var bodyMat = new THREE.MeshPhongMaterial({ color: 0x3498db });       // blue torso/arms
    var headMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });      // skin tone
    var legMat  = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });      // dark legs

    // --- LEGS (pivoting from hips) ---
    // Each leg is a Group acting as the hip joint, with a Mesh child for the lower leg.
    var leftLegGroup = new THREE.Group();
    var leftLowerLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.9, 0.3),
        legMat
    );
    leftLowerLeg.position.y = -0.45; // bottom of mesh is at y = -0.9 from hip joint
    leftLegGroup.add(leftLowerLeg);
    person.add(leftLegGroup);

    var rightLegGroup = new THREE.Group();
    var rightLowerLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.9, 0.3),
        legMat
    );
    rightLowerLeg.position.y = -0.45;
    rightLegGroup.add(rightLowerLeg);
    person.add(rightLegGroup);

    // Leg pivot positions: hips are at y = 0.9 above feet (ground)
    leftLegGroup.position.set(-0.2, 0.9, 0);
    rightLegGroup.position.set(0.2, 0.9, 0);

    // --- TORSO ---
    var torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.8, 0.35),
        bodyMat
    );
    // Bottom of torso is at hip level (y=0.9), center of box at y=0.9+0.4=1.3
    torso.position.y = 1.3;
    person.add(torso);

    // --- ARMS (attached to torso sides, hanging down from shoulder level) ---
    var leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.7, 0.2),
        bodyMat
    );
    // Shoulder is at top of torso: y=1.3+0.4=1.7; arm hangs down from there
    leftArm.position.set(-0.5, 1.3 - 0.35, 0);
    person.add(leftArm);

    var rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.7, 0.2),
        bodyMat
    );
    rightArm.position.set(0.5, 1.3 - 0.35, 0);
    person.add(rightArm);

    // --- HEAD ---
    var head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 16),
        headMat
    );
    // Top of torso is at y=1.3+0.4=1.7; center head sits just above that
    head.position.y = 1.7 + 0.22;
    person.add(head);

    // Total height: feet(0) → hips(0.9) → top of torso(1.7) → top of head(1.7+0.22*2=2.14)
    // Person stands on the floor (feet at y=0 relative to person group origin).

    // Populate userData per contract H7
    person.userData = {
        leftLeg:  leftLegGroup,
        rightLeg: rightLegGroup,
        isWalking: false
    };

    return person;
}
