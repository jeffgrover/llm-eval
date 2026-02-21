/**
 * person.js - Factory function for 3D humanoid figures.
 *
 * Group origin = bottom of feet (y=0 = floor level).
 * Body built bottom-to-top: legs → torso → head, arms at shoulder.
 * Leg pivots are at the HIP (top of leg) so they swing realistically.
 * Arm pivots are at the SHOULDER with arm hanging DOWN.
 */

var PERSON = {
    LEG_HEIGHT:   0.60,
    LEG_RADIUS:   0.07,
    TORSO_HEIGHT: 0.55,
    TORSO_WIDTH:  0.26,
    TORSO_DEPTH:  0.14,
    HEAD_RADIUS:  0.13,
    ARM_HEIGHT:   0.42,
    ARM_RADIUS:   0.055
};

/**
 * Creates a humanoid person group.
 *
 * Exposed references on the returned group:
 *   .leftLeg, .rightLeg   — pivot Groups at hip level
 *   .leftArm, .rightArm   — pivot Groups at shoulder level
 *   .walkPhase            — float for leg animation phase
 *
 * @returns {THREE.Group}
 */
function createPerson() {
    var group = new THREE.Group();

    var bodyMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    var headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    var legMat  = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    var armMat  = new THREE.MeshLambertMaterial({ color: 0x3498db });

    var LH = PERSON.LEG_HEIGHT;
    var LR = PERSON.LEG_RADIUS;
    var TH = PERSON.TORSO_HEIGHT;
    var TW = PERSON.TORSO_WIDTH;
    var TD = PERSON.TORSO_DEPTH;
    var HR = PERSON.HEAD_RADIUS;
    var AH = PERSON.ARM_HEIGHT;
    var AR = PERSON.ARM_RADIUS;

    // ── LEGS ──────────────────────────────────────────────────────────────────
    // Pivot placed at the HIP (y = LH from floor). The leg mesh hangs DOWN
    // from the pivot so its bottom reaches y=0 (floor level).
    var legGeo = new THREE.CylinderGeometry(LR * 0.85, LR * 1.1, LH, 8);

    var leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.09, LH, 0); // hip position
    var leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.set(0, -LH / 2, 0); // mesh centre is LH/2 below pivot
    leftLegPivot.add(leftLegMesh);
    group.add(leftLegPivot);

    var rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.09, LH, 0);
    var rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.set(0, -LH / 2, 0);
    rightLegPivot.add(rightLegMesh);
    group.add(rightLegPivot);

    // ── TORSO ─────────────────────────────────────────────────────────────────
    var torsoGeo = new THREE.BoxGeometry(TW, TH, TD);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    // Torso sits on top of legs: bottom at y=LH, centre at y=LH+TH/2
    torso.position.set(0, LH + TH / 2, 0);
    group.add(torso);

    // ── HEAD ──────────────────────────────────────────────────────────────────
    var headGeo = new THREE.SphereGeometry(HR, 12, 8);
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, LH + TH + HR, 0); // sits on top of torso
    group.add(head);

    // ── ARMS ──────────────────────────────────────────────────────────────────
    // Pivot at the SHOULDER (near top of torso). The arm mesh hangs DOWN.
    var armGeo = new THREE.CylinderGeometry(AR, AR * 0.9, AH, 7);
    var shoulderY = LH + TH * 0.88; // high on torso

    var leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-(TW / 2 + AR + 0.02), shoulderY, 0);
    var leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.set(0, -AH / 2, 0); // hangs down from shoulder
    leftArmPivot.add(leftArmMesh);
    group.add(leftArmPivot);

    var rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(TW / 2 + AR + 0.02, shoulderY, 0);
    var rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.set(0, -AH / 2, 0);
    rightArmPivot.add(rightArmMesh);
    group.add(rightArmPivot);

    // Expose limb pivots for animation
    group.leftLeg  = leftLegPivot;
    group.rightLeg = rightLegPivot;
    group.leftArm  = leftArmPivot;
    group.rightArm = rightArmPivot;
    group.walkPhase = 0;

    return group;
}

/**
 * Drives walking animation for one frame.
 * Legs and arms swing in alternating sine waves on the X axis.
 *
 * @param {THREE.Group} person
 * @param {number} dt   - frame delta time (seconds)
 */
function animatePersonWalking(person, dt) {
    if (!person) return;
    person.walkPhase = (person.walkPhase || 0) + dt * 9;
    var swing = Math.sin(person.walkPhase) * 0.40; // radians of swing

    // X-axis rotation: positive = forward tilt (toward -Z local)
    if (person.leftLeg)  person.leftLeg.rotation.x  =  swing;
    if (person.rightLeg) person.rightLeg.rotation.x = -swing;
    if (person.leftArm)  person.leftArm.rotation.x  = -swing * 0.4;
    if (person.rightArm) person.rightArm.rotation.x  =  swing * 0.4;
}

/**
 * Resets all limbs to neutral standing pose.
 * @param {THREE.Group} person
 */
function resetPersonPose(person) {
    if (!person) return;
    if (person.leftLeg)  person.leftLeg.rotation.x  = 0;
    if (person.rightLeg) person.rightLeg.rotation.x = 0;
    if (person.leftArm)  person.leftArm.rotation.x  = 0;
    if (person.rightArm) person.rightArm.rotation.x = 0;
}
