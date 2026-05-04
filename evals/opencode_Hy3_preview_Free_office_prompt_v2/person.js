const SHIRT_COLORS = ['#4a90e2', '#50e3c2', '#f5a623', '#bd10e0', '#7ed321'];
const SKIN_COLORS = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642'];
const PANTS_COLORS = ['#4a4a4a', '#2d5e3e', '#1a237e', '#795548'];

function createPerson({ bodyColor, skinColor, legColor } = {}) {
    const group = new THREE.Group();
    group.userData = { isSitting: false, isWalking: false, walkPhase: 0 };

    const shirt = bodyColor || SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
    const skin = skinColor || SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)];
    const pants = legColor || PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];

    const legLength = 0.4;
    const torsoHeight = 0.6;
    const headRadius = 0.15;
    const hipY = legLength; // hip height from feet (y=0)
    const shoulderY = hipY + torsoHeight - 0.1;

    // Legs (pivot at hip)
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, legLength, 8);
    const legMat = new THREE.MeshLambertMaterial({ color: pants });

    const leftLeg = new THREE.Group();
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y = -legLength / 2; // cylinder from y=-legLength to 0 relative to group
    leftLeg.add(leftLegMesh);
    leftLeg.position.set(-0.1, hipY, 0); // hip at y=hipY
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -legLength / 2;
    rightLeg.add(rightLegMesh);
    rightLeg.position.set(0.1, hipY, 0);
    group.add(rightLeg);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.3, torsoHeight, 0.2);
    const torsoMat = new THREE.MeshLambertMaterial({ color: shirt });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = hipY + torsoHeight / 2;
    group.add(torso);

    // Arms (pivot at shoulder)
    const armLength = 0.4;
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, armLength, 8);
    const armMat = new THREE.MeshLambertMaterial({ color: skin });

    const leftArm = new THREE.Group();
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.position.y = -armLength / 2;
    leftArm.add(leftArmMesh);
    leftArm.position.set(-0.2, shoulderY, 0);
    group.add(leftArm);

    const rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.position.y = -armLength / 2;
    rightArm.add(rightArmMesh);
    rightArm.position.set(0.2, shoulderY, 0);
    group.add(rightArm);

    // Head
    const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMat = new THREE.MeshLambertMaterial({ color: skin });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = hipY + torsoHeight + headRadius;
    group.add(head);

    // Nose (hemisphere on +Z face)
    const noseGeo = new THREE.SphereGeometry(0.05, 8, 4, Math.PI/2, Math.PI);
    const noseMat = new THREE.MeshLambertMaterial({ color: skin });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, head.position.y, headRadius + 0.05);
    group.add(nose);

    // Store references for animation
    group.userData.leftLeg = leftLeg;
    group.userData.rightLeg = rightLeg;
    group.userData.leftArm = leftArm;
    group.userData.rightArm = rightArm;

    return group;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (ud.isSitting) {
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        const legSwing = Math.sin(ud.walkPhase) * 0.6;
        const armSwing = -Math.sin(ud.walkPhase) * 0.5;
        ud.leftLeg.rotation.x = legSwing;
        ud.rightLeg.rotation.x = -legSwing;
        ud.leftArm.rotation.x = armSwing;
        ud.rightArm.rotation.x = -armSwing;
    } else {
        ud.leftLeg.rotation.x = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x = 0;
        ud.rightArm.rotation.x = 0;
        ud.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
