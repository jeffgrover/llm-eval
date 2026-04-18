// Person model factory — builds a simple humanoid out of Three.js primitives.
// Body is assembled so feet sit at y = 0 (the person's local origin).
// Structure (bottom -> top): legs -> torso -> head, with arms at shoulder level.

// Dimensions (exposed so elevator.js can compute total height for alignment).
const PERSON = {
    LEG_HEIGHT: 0.8,
    LEG_RADIUS: 0.1,
    TORSO_HEIGHT: 0.8,
    TORSO_WIDTH: 0.5,
    TORSO_DEPTH: 0.3,
    HEAD_RADIUS: 0.2,
    ARM_HEIGHT: 0.7,
    ARM_RADIUS: 0.08,
    get TOTAL_HEIGHT() {
        return this.LEG_HEIGHT + this.TORSO_HEIGHT + this.HEAD_RADIUS * 2;
    }
};

function createPerson() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const legMat  = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    // --- Legs ---
    // Each leg is a group whose origin is at the hip; the cylinder hangs below.
    // This lets us rotate the group on X to swing the leg from the hip, not the knee.
    const leftLeg  = new THREE.Group();
    const rightLeg = new THREE.Group();

    const legGeo = new THREE.CylinderGeometry(PERSON.LEG_RADIUS, PERSON.LEG_RADIUS, PERSON.LEG_HEIGHT, 12);
    const leftLegMesh  = new THREE.Mesh(legGeo, legMat);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    // Push the cylinder down so the top of it sits at the hip (group origin).
    leftLegMesh.position.y  = -PERSON.LEG_HEIGHT / 2;
    rightLegMesh.position.y = -PERSON.LEG_HEIGHT / 2;
    leftLeg.add(leftLegMesh);
    rightLeg.add(rightLegMesh);

    // Position hip joints so the bottoms of the legs are at y = 0.
    leftLeg.position.set(-0.12, PERSON.LEG_HEIGHT, 0);
    rightLeg.position.set( 0.12, PERSON.LEG_HEIGHT, 0);

    group.add(leftLeg);
    group.add(rightLeg);

    // --- Torso ---
    const torsoGeo = new THREE.BoxGeometry(PERSON.TORSO_WIDTH, PERSON.TORSO_HEIGHT, PERSON.TORSO_DEPTH);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT / 2;
    group.add(torso);

    // --- Head ---
    const headGeo = new THREE.SphereGeometry(PERSON.HEAD_RADIUS, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT + PERSON.HEAD_RADIUS;
    group.add(head);

    // --- Arms ---
    // Same trick as legs: arm group pivots at shoulder, cylinder hangs below.
    // Default rotation is 0 so arms hang straight DOWN from the shoulders.
    const shoulderY = PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT - 0.05;
    const armGeo = new THREE.CylinderGeometry(PERSON.ARM_RADIUS, PERSON.ARM_RADIUS, PERSON.ARM_HEIGHT, 10);

    const leftArm  = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftArmMesh  = new THREE.Mesh(armGeo, bodyMat);
    const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
    leftArmMesh.position.y  = -PERSON.ARM_HEIGHT / 2;
    rightArmMesh.position.y = -PERSON.ARM_HEIGHT / 2;
    leftArm.add(leftArmMesh);
    rightArm.add(rightArmMesh);

    leftArm.position.set(-(PERSON.TORSO_WIDTH / 2 + PERSON.ARM_RADIUS), shoulderY, 0);
    rightArm.position.set( (PERSON.TORSO_WIDTH / 2 + PERSON.ARM_RADIUS), shoulderY, 0);
    group.add(leftArm);
    group.add(rightArm);

    // Expose limbs for walk animation.
    group.userData.leftLeg  = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm  = leftArm;
    group.userData.rightArm = rightArm;
    group.userData.walkPhase = 0;
    group.userData.isWalking = false;

    return group;
}

// Advances the walk cycle; call every frame with delta-time while walking.
function animatePersonWalking(person, dt) {
    if (!person.userData.isWalking) {
        person.userData.leftLeg.rotation.x  = 0;
        person.userData.rightLeg.rotation.x = 0;
        person.userData.leftArm.rotation.x  = 0;
        person.userData.rightArm.rotation.x = 0;
        person.userData.walkPhase = 0;
        return;
    }
    person.userData.walkPhase += dt * 8;
    const swing = Math.sin(person.userData.walkPhase) * 0.6;
    person.userData.leftLeg.rotation.x  =  swing;
    person.userData.rightLeg.rotation.x = -swing;
    // Arms swing opposite to legs for a natural gait.
    person.userData.leftArm.rotation.x  = -swing * 0.5;
    person.userData.rightArm.rotation.x =  swing * 0.5;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
window.PERSON = PERSON;
