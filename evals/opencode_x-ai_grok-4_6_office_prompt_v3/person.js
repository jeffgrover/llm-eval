const PERSON_SHIRT_PALETTE = [0x3a7bd5, 0xc0392b, 0x27ae60, 0x8e44ad, 0xd35400, 0x16a085, 0x2c3e50, 0xe67e22];
const PERSON_SKIN_PALETTE = [0xf1c27d, 0xc68642, 0xffdbac, 0x8d5524, 0xe0ac69];
const PERSON_PANT_PALETTE = [0x2c3e50, 0x34495e, 0x4a3728, 0x1a1a2e, 0x3d3d5c];

function pickPersonColor(palette) {
    return palette[Math.floor(Math.random() * palette.length)];
}

function createPerson({ bodyColor, skinColor, legColor } = {}) {
    const shirt = bodyColor !== undefined ? bodyColor : pickPersonColor(PERSON_SHIRT_PALETTE);
    const skin = skinColor !== undefined ? skinColor : pickPersonColor(PERSON_SKIN_PALETTE);
    const pants = legColor !== undefined ? legColor : pickPersonColor(PERSON_PANT_PALETTE);

    const person = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const pantMat = new THREE.MeshLambertMaterial({ color: pants });

    function makeLimb(radius, length, material) {
        const pivot = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, length, 8), material);
        mesh.position.y = -length * 0.5;
        pivot.add(mesh);
        return pivot;
    }

    const leftLeg = makeLimb(0.08, 0.85, pantMat);
    leftLeg.position.set(-0.11, 0.85, 0);
    const rightLeg = makeLimb(0.08, 0.85, pantMat);
    rightLeg.position.set(0.11, 0.85, 0);
    person.add(leftLeg);
    person.add(rightLeg);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.68, 0.22), shirtMat);
    torso.position.y = 1.22;
    person.add(torso);

    const leftArm = makeLimb(0.055, 0.62, shirtMat);
    leftArm.position.set(-0.24, 1.50, 0);
    const rightArm = makeLimb(0.055, 0.62, shirtMat);
    rightArm.position.set(0.24, 1.50, 0);
    person.add(leftArm);
    person.add(rightArm);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
    head.position.y = 1.74;
    person.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), skinMat);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.set(0, 1.72, 0.16);
    person.add(nose);

    person.userData.leftLeg = leftLeg;
    person.userData.rightLeg = rightLeg;
    person.userData.leftArm = leftArm;
    person.userData.rightArm = rightArm;
    person.userData.isWalking = false;
    person.userData.isSitting = false;
    person.userData.walkPhase = 0;
    person.userData.bodyColor = shirt;
    return person;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;
    const data = person.userData;
    const leftLeg = data.leftLeg;
    const rightLeg = data.rightLeg;
    const leftArm = data.leftArm;
    const rightArm = data.rightArm;
    if (!leftLeg || !rightLeg) return;

    if (data.isSitting) {
        leftLeg.rotation.x = -Math.PI * 0.5;
        rightLeg.rotation.x = -Math.PI * 0.5;
        if (leftArm) leftArm.rotation.x = -Math.PI * 0.25;
        if (rightArm) rightArm.rotation.x = -Math.PI * 0.25;
        data.walkPhase = 0;
        return;
    }

    if (data.isWalking) {
        data.walkPhase += dt * 8;
        const phase = data.walkPhase;
        leftLeg.rotation.x = Math.sin(phase) * 0.6;
        rightLeg.rotation.x = Math.sin(phase + Math.PI) * 0.6;
        if (leftArm) leftArm.rotation.x = -Math.sin(phase) * 0.5;
        if (rightArm) rightArm.rotation.x = Math.sin(phase) * 0.5;
        return;
    }

    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    if (leftArm) leftArm.rotation.x = 0;
    if (rightArm) rightArm.rotation.x = 0;
    data.walkPhase = 0;
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
