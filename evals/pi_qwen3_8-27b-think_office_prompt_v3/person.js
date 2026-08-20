// person.js - person mesh factory + walk/sit animation (classic script, no ES modules)

// Small color palettes so agents are visually distinct at a glance.
const SHIRT_PALETTE = [0x3b6ea5, 0xb5453b, 0x4a9b5d, 0xb5943b, 0x7a4ab5, 0xc56ba0, 0x2f9e93, 0x8a94a6];
const SKIN_PALETTE = [0xf2c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd2913c];
const PANT_PALETTE = [0x2b2b3a, 0x3a3f4a, 0x4a4a5a, 0x5b4a3a, 0x334155, 0x54452f];

function pickFromPalette(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

// Build a single limb group that pivots at a joint.
// jointY is the world/local height of the joint; the mesh hangs below it.
function buildLimb(radius, length, color, jointX, jointY) {
    const pivot = new THREE.Group();
    pivot.position.set(jointX, jointY, 0);
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.85, length, 8),
        new THREE.MeshLambertMaterial({ color: color })
    );
    mesh.position.y = -length / 2;
    mesh.castShadow = false;
    pivot.add(mesh);
    return pivot;
}

function createPerson(opts) {
    opts = opts || {};
    const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pickFromPalette(SHIRT_PALETTE);
    const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickFromPalette(SKIN_PALETTE);
    const legColor = opts.legColor !== undefined ? opts.legColor : pickFromPalette(PANT_PALETTE);

    const group = new THREE.Group();

    // --- Legs: pivot at the hip (hip height 0.5), cylinders hang down so feet reach y=0.
    const hipHeight = 0.5;
    const legLength = 0.5;
    const leftLeg = buildLimb(0.09, legLength, legColor, -0.11, hipHeight);
    const rightLeg = buildLimb(0.09, legLength, legColor, 0.11, hipHeight);
    group.add(leftLeg);
    group.add(rightLeg);

    // --- Torso: box from hips (0.5) up to shoulders (1.1).
    const torsoHeight = 0.6;
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, torsoHeight, 0.26),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    torso.position.y = hipHeight + torsoHeight / 2; // 0.8
    group.add(torso);

    // --- Arms: pivot at the shoulder (y = 1.1), hang down.
    const shoulderY = hipHeight + torsoHeight; // 1.1
    const armLength = 0.46;
    const leftArm = buildLimb(0.06, armLength, bodyColor, -0.28, shoulderY);
    const rightArm = buildLimb(0.06, armLength, bodyColor, 0.28, shoulderY);
    group.add(leftArm);
    group.add(rightArm);

    // --- Head + nose. Nose on the +Z face so facing reads from a top-down camera.
    const headRadius = 0.16;
    const headY = shoulderY + headRadius * 0.85;
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 12),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.position.set(0, headY, 0);
    group.add(head);

    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    nose.position.set(0, headY + 0.01, headRadius * 0.9);
    nose.rotation.x = Math.PI / 2; // hemisphere dome points +Z
    group.add(nose);

    // --- Per-agent state used by the animator and the sim.
    group.userData.isSitting = false;
    group.userData.isWalking = false;
    group.userData.walkPhase = 0;
    group.userData.leftLeg = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;
    group.userData.bodyColor = bodyColor;
    group.userData.skinColor = skinColor;
    group.userData.legColor = legColor;
    group.userData.seatFacing = 0;
    group.userData.standY = 0;

    return group;
}

// Per-frame walk / sit / idle animator. dt is the already-scaled motion delta.
function animatePersonWalking(person, dt) {
    const ud = person.userData;
    const leftLeg = ud.leftLeg;
    const rightLeg = ud.rightLeg;
    const leftArm = ud.leftArm;
    const rightArm = ud.rightArm;
    if (!leftLeg || !rightLeg) return;

    if (ud.isSitting) {
        // Legs rotate -pi/2 at the hip (feet forward), arms drop.
        leftLeg.rotation.x = -Math.PI / 2;
        rightLeg.rotation.x = -Math.PI / 2;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        return;
    }

    if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        leftLeg.rotation.x = s * 0.6;
        rightLeg.rotation.x = -s * 0.6;
        if (leftArm) leftArm.rotation.x = -s * 0.5;
        if (rightArm) rightArm.rotation.x = s * 0.5;
    } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        if (leftArm) leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
