const SHIRT_PALETTE = [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x14b8a6, 0xf97316];
const SKIN_PALETTE = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const LEG_PALETTE = [0x1e293b, 0x334155, 0x475569, 0x3b2f2f, 0x1f2937];

function pickRandomColor(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createPerson(opts) {
    const options = opts || {};
    const bodyColor = options.bodyColor !== undefined ? options.bodyColor : pickRandomColor(SHIRT_PALETTE);
    const skinColor = options.skinColor !== undefined ? options.skinColor : pickRandomColor(SKIN_PALETTE);
    const legColor = options.legColor !== undefined ? options.legColor : pickRandomColor(LEG_PALETTE);

    const group = new THREE.Group();
    group.renderOrder = 2;

    const legMat = new THREE.MeshLambertMaterial({ color: legColor });
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.11, 0.72, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.72, 8), legMat);
    leftLegMesh.position.set(0, -0.36, 0);
    leftLeg.add(leftLegMesh);
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.11, 0.72, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.72, 8), legMat);
    rightLegMesh.position.set(0, -0.36, 0);
    rightLeg.add(rightLegMesh);
    group.add(rightLeg);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), bodyMat);
    torso.position.set(0, 1.03, 0);
    group.add(torso);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.27, 1.28, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.56, 8), bodyMat);
    leftArmMesh.position.set(0, -0.28, 0);
    leftArm.add(leftArmMesh);
    group.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.27, 1.28, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.56, 8), bodyMat);
    rightArmMesh.position.set(0, -0.28, 0);
    rightArm.add(rightArmMesh);
    group.add(rightArm);

    const head = new THREE.Group();
    head.position.set(0, 1.54, 0);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skinMat);
    head.add(headMesh);

    const noseGeo = new THREE.SphereGeometry(0.055, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 0.17);
    head.add(nose);
    group.add(head);

    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        leftArm: leftArm,
        rightArm: rightArm,
        head: head,
        isWalking: false,
        isSitting: false,
        walkPhase: Math.random() * Math.PI * 2
    };
    return group;
}

function animatePersonWalking(person, dt) {
    if (!person || !person.userData) return;
    const ud = person.userData;
    if (ud.isSitting) {
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const s = Math.sin(ud.walkPhase);
        ud.leftLeg.rotation.x = s * 0.6;
        ud.rightLeg.rotation.x = -s * 0.6;
        ud.leftArm.rotation.x = -s * 0.5;
        ud.rightArm.rotation.x = s * 0.5;
    } else {
        ud.leftLeg.rotation.x = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x = 0;
        ud.rightArm.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
