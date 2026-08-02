// person.js - person mesh factory + walk/sit animation (classic script, no modules)

const SHIRT_PALETTE = [0xd9534f, 0x4a90d9, 0x5cb85c, 0xf0ad4e, 0x9b59b6, 0x3fb8af, 0xe8739e, 0x8a6d3b];
const SKIN_PALETTE = [0xf5d0b0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const PANTS_PALETTE = [0x34495e, 0x2c3e50, 0x5d4e37, 0x4a4a58, 0x37505c];

function pickPaletteColor(palette, explicit) {
    if (typeof explicit === "number") return explicit;
    return palette[Math.floor(Math.random() * palette.length)];
}

function makeLimb(length, radius, color) {
    const pivot = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85 });
    const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    return pivot;
}

function createPerson(opts) {
    const options = opts || {};
    const bodyColor = pickPaletteColor(SHIRT_PALETTE, options.bodyColor);
    const skinColor = pickPaletteColor(SKIN_PALETTE, options.skinColor);
    const legColor = pickPaletteColor(PANTS_PALETTE, options.legColor);

    const person = new THREE.Group();

    const HIP_Y = 0.82;
    const SHOULDER_Y = 1.34;
    const LEG_LEN = 0.82;
    const ARM_LEN = 0.56;

    const leftLeg = makeLimb(LEG_LEN, 0.085, legColor);
    leftLeg.position.set(-0.11, HIP_Y, 0);
    const rightLeg = makeLimb(LEG_LEN, 0.085, legColor);
    rightLeg.position.set(0.11, HIP_Y, 0);
    person.add(leftLeg);
    person.add(rightLeg);

    const torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.22), torsoMat);
    torso.position.y = HIP_Y + 0.28;
    person.add(torso);

    const leftArm = makeLimb(ARM_LEN, 0.06, bodyColor);
    leftArm.position.set(-0.25, SHOULDER_Y, 0);
    const rightArm = makeLimb(ARM_LEN, 0.06, bodyColor);
    rightArm.position.set(0.25, SHOULDER_Y, 0);
    person.add(leftArm);
    person.add(rightArm);

    const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), headMat);
    head.position.y = SHOULDER_Y + 0.32;
    person.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), headMat);
    nose.position.set(0, SHOULDER_Y + 0.31, 0.155);
    person.add(nose);

    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;

    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (ud.isSitting) {
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
        return;
    }
    if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const swing = Math.sin(ud.walkPhase);
        ud.leftLeg.rotation.x = swing * 0.6;
        ud.rightLeg.rotation.x = -swing * 0.6;
        ud.leftArm.rotation.x = -swing * 0.5;
        ud.rightArm.rotation.x = swing * 0.5;
        return;
    }
    ud.leftLeg.rotation.x = 0;
    ud.rightLeg.rotation.x = 0;
    ud.leftArm.rotation.x = 0;
    ud.rightArm.rotation.x = 0;
    ud.walkPhase = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
