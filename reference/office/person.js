// Person model factory — builds a simple humanoid out of Three.js primitives.
// Body is assembled so feet sit at y = 0 (the person's local origin).
// Structure (bottom -> top): legs -> torso -> head, with arms at shoulder level.

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

// Shirt color palette so people are visually distinguishable at a glance.
const BODY_PALETTE = [
    0x3498db, 0xe67e22, 0x16a085, 0x9b59b6, 0xe74c3c, 0xf1c40f,
    0x2ecc71, 0x34495e, 0xc0392b, 0x2980b9, 0x27ae60, 0xd35400,
    0x1abc9c, 0x8e44ad, 0xf39c12, 0x7f8c8d
];
const SKIN_PALETTE = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const LEG_PALETTE  = [0x2c3e50, 0x1a1a2e, 0x3d2817, 0x4a4a4a];

function createPerson(opts) {
    opts = opts || {};
    const bodyColor = opts.bodyColor != null ? opts.bodyColor :
        BODY_PALETTE[Math.floor(Math.random() * BODY_PALETTE.length)];
    const skinColor = opts.skinColor != null ? opts.skinColor :
        SKIN_PALETTE[Math.floor(Math.random() * SKIN_PALETTE.length)];
    const legColor  = opts.legColor  != null ? opts.legColor  :
        LEG_PALETTE[Math.floor(Math.random() * LEG_PALETTE.length)];

    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat  = new THREE.MeshLambertMaterial({ color: legColor });

    // Legs — each a group pivoting at the hip; cylinder hangs below.
    const leftLeg  = new THREE.Group();
    const rightLeg = new THREE.Group();

    const legGeo = new THREE.CylinderGeometry(PERSON.LEG_RADIUS, PERSON.LEG_RADIUS, PERSON.LEG_HEIGHT, 12);
    const leftLegMesh  = new THREE.Mesh(legGeo, legMat);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y  = -PERSON.LEG_HEIGHT / 2;
    rightLegMesh.position.y = -PERSON.LEG_HEIGHT / 2;
    leftLeg.add(leftLegMesh);
    rightLeg.add(rightLegMesh);
    leftLeg.position.set(-0.12, PERSON.LEG_HEIGHT, 0);
    rightLeg.position.set( 0.12, PERSON.LEG_HEIGHT, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    // Torso.
    const torsoGeo = new THREE.BoxGeometry(PERSON.TORSO_WIDTH, PERSON.TORSO_HEIGHT, PERSON.TORSO_DEPTH);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT / 2;
    group.add(torso);

    // Head.
    const headGeo = new THREE.SphereGeometry(PERSON.HEAD_RADIUS, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT + PERSON.HEAD_RADIUS;
    group.add(head);

    // Tiny "nose" bump on the +Z face of the head — makes facing direction
    // readable from above (useful since we look down at people a lot).
    const noseGeo = new THREE.SphereGeometry(PERSON.HEAD_RADIUS * 0.25, 8, 6);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.position.set(0,
        PERSON.LEG_HEIGHT + PERSON.TORSO_HEIGHT + PERSON.HEAD_RADIUS,
        PERSON.HEAD_RADIUS * 0.9);
    group.add(nose);

    // Arms — same pivot trick as legs.
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

    group.userData.leftLeg  = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm  = leftArm;
    group.userData.rightArm = rightArm;
    group.userData.walkPhase = 0;
    group.userData.isWalking = false;
    group.userData.isSitting = false;
    group.userData.torso = torso;
    group.userData.head  = head;

    return group;
}

// Advances the walk cycle; call every frame with delta-time.
function animatePersonWalking(person, dt) {
    const u = person.userData;
    if (u.isSitting) {
        // Sitting — legs bent forward (rotate at hip), arms resting.
        u.leftLeg.rotation.x  = -Math.PI / 2;
        u.rightLeg.rotation.x = -Math.PI / 2;
        u.leftArm.rotation.x  = -Math.PI / 4;
        u.rightArm.rotation.x = -Math.PI / 4;
        u.walkPhase = 0;
        return;
    }
    if (!u.isWalking) {
        u.leftLeg.rotation.x  = 0;
        u.rightLeg.rotation.x = 0;
        u.leftArm.rotation.x  = 0;
        u.rightArm.rotation.x = 0;
        u.walkPhase = 0;
        return;
    }
    u.walkPhase += dt * 8;
    const swing = Math.sin(u.walkPhase) * 0.6;
    u.leftLeg.rotation.x  =  swing;
    u.rightLeg.rotation.x = -swing;
    u.leftArm.rotation.x  = -swing * 0.5;
    u.rightArm.rotation.x =  swing * 0.5;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
window.PERSON = PERSON;
