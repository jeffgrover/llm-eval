function createPerson({bodyColor = 0xcccccc, skinColor = 0xffdbac, legColor = 0x333333}) {
    const group = new THREE.Group();

    const palettes = {
        shirts: [0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x34495e, 0xecf0f1, 0x95a5a6],
        skins: [0xffdbac, 0xf1c27d, 0xe0ac69, 0x8d5524, 0xc68642],
        pants: [0x2c3e50, 0x34495e, 0x2ecc71, 0x7f8c8d, 0x000000, 0x1a1a1a]
    };

    const shirtCol = bodyColor === 0xcccccc ? palettes.shirts[Math.floor(Math.random() * palettes.shirts.length)] : bodyColor;
    const skinCol = skinColor === 0xffdbac ? palettes.skins[Math.floor(Math.random() * palettes.skins.length)] : skinColor;
    const pantCol = legColor === 0x333333 ? palettes.pants[Math.floor(Math.random() * palettes.pants.length)] : legColor;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), new THREE.MeshStandardMaterial({color: shirtCol}));
    torso.position.y = 0.7;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({color: skinCol}));
    head.position.y = 1.0;
    group.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshStandardMaterial({color: skinCol}));
    nose.position.set(0, 0, 0.1);
    head.add(nose);

    const createLeg = (x) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(x, 0.6, 0);
        const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6), new THREE.MeshStandardMaterial({color: pantCol}));
        legMesh.position.y = -0.3;
        legGroup.add(legMesh);
        return legGroup;
    };

    const leftLeg = createLeg(-0.1);
    const rightLeg = createLeg(0.1);
    group.add(leftLeg, rightLeg);

    const createArm = (x) => {
        const armGroup = new THREE.Group();
        armGroup.position.set(x, 0.8, 0);
        const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), new THREE.MeshStandardMaterial({color: skinCol}));
        armMesh.position.y = -0.2;
        armGroup.add(armMesh);
        return armGroup;
    };

    const leftArm = createArm(-0.25);
    const rightArm = createArm(0.25);
    group.add(leftArm, rightArm);

    group.userData = {
        leftLeg, rightLeg, leftArm, rightArm,
        isWalking: false,
        isSitting: false,
        walkPhase: 0
    };

    return group;
}

function animatePersonWalking(person, dt) {
    const { userData } = person;
    if (userData.isSitting) {
        userData.leftLeg.rotation.x = -Math.PI / 2;
        userData.rightLeg.rotation.x = -Math.PI / 2;
        userData.leftArm.rotation.x = -Math.PI / 4;
        userData.rightArm.rotation.x = -Math.PI / 4;
        userData.walkPhase = 0;
        return;
    }

    if (userData.isWalking) {
        userData.walkPhase += dt * 8;
        const swing = Math.sin(userData.walkPhase) * 0.6;
        userData.leftLeg.rotation.x = swing;
        userData.rightLeg.rotation.x = -swing;
        userData.leftArm.rotation.x = -swing * 0.5;
        userData.rightArm.rotation.x = swing * 0.5;
    } else {
        userData.leftLeg.rotation.x = 0;
        userData.rightLeg.rotation.x = 0;
        userData.leftArm.rotation.x = 0;
        userData.rightArm.rotation.x = 0;
        userData.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
