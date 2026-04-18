// Person model factory. Returns a THREE.Group.
// Origin (y=0) is at the person's feet.
// Structure bottom-to-top: legs -> torso -> head. Arms hang DOWN from shoulders.
function createPerson(colorOverrides) {
    const colors = Object.assign({
        body: 0x3498db,
        head: 0xffdbac,
        legs: 0x2c3e50,
        arms: 0x3498db
    }, colorOverrides || {});

    const LEG_HEIGHT = 0.9;
    const TORSO_HEIGHT = 1.0;
    const TORSO_WIDTH = 0.7;
    const TORSO_DEPTH = 0.4;
    const HEAD_RADIUS = 0.28;
    const ARM_HEIGHT = 0.9;

    const person = new THREE.Group();

    // --- Legs (two legs, pivot at the hip top so swing rotates from hips) ---
    const legGeom = new THREE.BoxGeometry(0.25, LEG_HEIGHT, 0.25);
    const legMat = new THREE.MeshStandardMaterial({ color: colors.legs });

    // Use pivot groups so rotation happens at the top of the leg (hip).
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.18, LEG_HEIGHT, 0); // hip position
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.y = -LEG_HEIGHT / 2; // hang below the pivot
    leftLegPivot.add(leftLeg);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.18, LEG_HEIGHT, 0);
    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.y = -LEG_HEIGHT / 2;
    rightLegPivot.add(rightLeg);

    person.add(leftLegPivot);
    person.add(rightLegPivot);

    // --- Torso ---
    const torsoGeom = new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH);
    const torsoMat = new THREE.MeshStandardMaterial({ color: colors.body });
    const torso = new THREE.Mesh(torsoGeom, torsoMat);
    torso.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2;
    person.add(torso);

    // --- Arms hanging DOWN from shoulder level ---
    const armGeom = new THREE.BoxGeometry(0.18, ARM_HEIGHT, 0.18);
    const armMat = new THREE.MeshStandardMaterial({ color: colors.arms });
    const shoulderY = LEG_HEIGHT + TORSO_HEIGHT - 0.05;
    const armCenterY = shoulderY - ARM_HEIGHT / 2;

    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-(TORSO_WIDTH / 2 + 0.1), armCenterY, 0);
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(TORSO_WIDTH / 2 + 0.1, armCenterY, 0);
    person.add(rightArm);

    // --- Head ---
    const headGeom = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: colors.head });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS;
    person.add(head);

    // Expose references for animation
    person.userData.leftLegPivot = leftLegPivot;
    person.userData.rightLegPivot = rightLegPivot;
    person.userData.walkPhase = 0;
    person.userData.totalHeight = LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS * 2;

    return person;
}

window.createPerson = createPerson;
