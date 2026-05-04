// Color palettes
const SHIRT_COLORS = ['#4477aa', '#6699cc', '#88aadd', '#aaccff', '#ccddff', '#4499bb', '#55aacc', '#66bbdd'];
const SKIN_COLORS = ['#ffdab9', '#f4c2a1', '#d2b48c', '#c68c6f', '#a0522d', '#8b4513', '#deb887', '#f5deb3'];
const PANT_COLORS = ['#333333', '#444444', '#555555', '#222255', '#333366', '#444477', '#111122'];

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function createPerson({ bodyColor, skinColor, legColor } = {}) {
    const group = new THREE.Group();
    group.userData = { isWalking: false, isSitting: false, walkPhase: 0 };

    // Sample colors if not provided
    bodyColor = bodyColor || randomChoice(SHIRT_COLORS);
    skinColor = skinColor || randomChoice(SKIN_COLORS);
    legColor = legColor || randomChoice(PANT_COLORS);

    // Legs - each is a Group pivoting at the hip
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.08, 0.6, 8);
    const legMaterial = new THREE.MeshPhongMaterial({ color: legColor });
    
    const leftLeg = new THREE.Group();
    const leftLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    leftLegMesh.position.y = -0.3;
    leftLegMesh.rotation.x = Math.PI / 2;
    leftLeg.add(leftLegMesh);
    leftLeg.position.set(-0.08, 0, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    const rightLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    rightLegMesh.position.y = -0.3;
    rightLegMesh.rotation.x = Math.PI / 2;
    rightLeg.add(rightLegMesh);
    rightLeg.position.set(0.08, 0, 0);
    group.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.CylinderGeometry(0.18, 0.15, 0.5, 12);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.25;
    torso.rotation.x = Math.PI / 2;
    group.add(torso);

    // Arms - each is a Group pivoting at the shoulder
    const armGeometry = new THREE.CylinderGeometry(0.05, 0.04, 0.45, 8);
    const armMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });

    const leftArm = new THREE.Group();
    const leftArmMesh = new THREE.Mesh(armGeometry, armMaterial);
    leftArmMesh.position.y = -0.225;
    leftArmMesh.rotation.x = Math.PI / 2;
    leftArm.add(leftArmMesh);
    leftArm.position.set(-0.22, 0.42, 0);
    group.add(leftArm);

    const rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeometry, armMaterial);
    rightArmMesh.position.y = -0.225;
    rightArmMesh.rotation.x = Math.PI / 2;
    rightArm.add(rightArmMesh);
    rightArm.position.set(0.22, 0.42, 0);
    group.add(rightArm);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.12, 16, 12);
    const headMaterial = new THREE.MeshPhongMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.62;
    group.add(head);

    // Nose - small hemisphere on +Z face of head
    const noseGeometry = new THREE.SphereGeometry(0.03, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const noseMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.set(0, 0, 0.12);
    head.add(nose);

    // Store references for animation
    group.userData.leftLeg = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;

    return group;
}

function animatePersonWalking(person, dt) {
    const data = person.userData;

    if (data.isSitting) {
        // Sitting: legs rotate -PI/2 at hip (feet forward), arms drop to -PI/4
        data.leftLeg.rotation.x = -Math.PI / 2;
        data.rightLeg.rotation.x = -Math.PI / 2;
        data.leftArm.rotation.x = -Math.PI / 4;
        data.rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
    } else if (data.isWalking) {
        // Walking: advance phase, legs and arms swing
        data.walkPhase = (data.walkPhase + dt * 8) % (Math.PI * 2);
        const legSwing = Math.sin(data.walkPhase) * 0.6;
        const armSwing = -Math.sin(data.walkPhase) * 0.5;
        data.leftLeg.rotation.x = legSwing;
        data.rightLeg.rotation.x = -legSwing;
        data.leftArm.rotation.x = armSwing;
        data.rightArm.rotation.x = -armSwing;
    } else {
        // Standing idle: reset limbs to zero rotation
        data.leftLeg.rotation.x = 0;
        data.rightLeg.rotation.x = 0;
        data.leftArm.rotation.x = 0;
        data.rightArm.rotation.x = 0;
        data.walkPhase = 0;
    }
}
