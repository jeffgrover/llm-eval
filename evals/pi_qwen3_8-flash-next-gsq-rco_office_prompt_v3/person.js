// person.js - person mesh factory + walk/sit animation (classic browser script, no ES modules)

const PERSON_SHIRT_COLORS = [
    0x4a7bd6, 0xd9534f, 0x3f9c6d, 0xb8863b, 0x7a5cc8,
    0x2f7f8f, 0xc25b80, 0x5a6f8a, 0xa4463d, 0x4c9a2f
];

const PERSON_SKIN_COLORS = [
    0xf1c9a0, 0xe8b98a, 0xd29b72, 0xb5764f, 0x8c5a3b, 0xf7dcb8
];

const PERSON_LEG_COLORS = [
    0x2f3b4c, 0x3d4a5c, 0x4a4038, 0x5b5f6b, 0x334152, 0x6b4a3a
];

function paletteColor(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

const PERSON_HIP_Y = 0.82;
const PERSON_LEG_LEN = 0.80;
const PERSON_SHOULDER_Y = 1.44;
const PERSON_ARM_LEN = 0.60;
const PERSON_HEAD_Y = 1.63;

function buildLimb(pivotGroup, length, radius, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, length, 8), material);
    mesh.position.y = -length / 2;
    pivotGroup.add(mesh);
}

function createPerson(opts) {
    const options = opts || {};
    const shirtColor = options.bodyColor !== undefined ? options.bodyColor : paletteColor(PERSON_SHIRT_COLORS);
    const skinColor = options.skinColor !== undefined ? options.skinColor : paletteColor(PERSON_SKIN_COLORS);
    const legColor = options.legColor !== undefined ? options.legColor : paletteColor(PERSON_LEG_COLORS);

    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });

    const group = new THREE.Group();

    // Legs: each leg is its own group pivoting at the hip, cylinder hanging below.
    const legLeft = new THREE.Group();
    legLeft.position.set(-0.14, PERSON_HIP_Y, 0);
    buildLimb(legLeft, PERSON_LEG_LEN, 0.10, legMat);
    group.add(legLeft);

    const legRight = new THREE.Group();
    legRight.position.set(0.14, PERSON_HIP_Y, 0);
    buildLimb(legRight, PERSON_LEG_LEN, 0.10, legMat);
    group.add(legRight);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, PERSON_SHOULDER_Y - PERSON_HIP_Y, 10), shirtMat);
    torso.position.y = (PERSON_HIP_Y + PERSON_SHOULDER_Y) / 2;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
    head.position.y = PERSON_HEAD_Y;
    group.add(head);

    // Small hemisphere nose on the +Z face of the head so facing reads top-down.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6, 0, Math.PI), skinMat);
    nose.position.set(0, PERSON_HEAD_Y - 0.02, 0.17);
    group.add(nose);

    // Arms pivot at the shoulder.
    const armLeft = new THREE.Group();
    armLeft.position.set(-0.30, PERSON_SHOULDER_Y, 0);
    buildLimb(armLeft, PERSON_ARM_LEN, 0.075, shirtMat);
    group.add(armLeft);

    const armRight = new THREE.Group();
    armRight.position.set(0.30, PERSON_SHOULDER_Y, 0);
    buildLimb(armRight, PERSON_ARM_LEN, 0.075, shirtMat);
    group.add(armRight);

    // Feet marker so the origin sits at the feet (local y = 0).
    const feet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.28), legMat);
    feet.position.y = 0.02;
    group.add(feet);

    group.userData = {
        isWalking: false,
        isSitting: false,
        walkPhase: Math.random() * Math.PI * 2,
        legLeft: legLeft,
        legRight: legRight,
        armLeft: armLeft,
        armRight: armRight,
        shirtColor: shirtColor
    };

    return group;
}

function animatePersonWalking(person, dt) {
    const data = person.userData;
    if (!data || !data.legLeft) return;

    if (data.isSitting) {
        data.walkPhase = 0;
        data.legLeft.rotation.x = -Math.PI / 2;
        data.legRight.rotation.x = -Math.PI / 2;
        data.armLeft.rotation.x = -Math.PI / 4;
        data.armRight.rotation.x = -Math.PI / 4;
        return;
    }

    if (data.isWalking) {
        data.walkPhase += dt * 8;
        const swing = Math.sin(data.walkPhase);
        data.legLeft.rotation.x = swing * 0.6;
        data.legRight.rotation.x = -swing * 0.6;
        data.armLeft.rotation.x = -swing * 0.5;
        data.armRight.rotation.x = swing * 0.5;
        return;
    }

    data.walkPhase = 0;
    data.legLeft.rotation.x = 0;
    data.legRight.rotation.x = 0;
    data.armLeft.rotation.x = 0;
    data.armRight.rotation.x = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
