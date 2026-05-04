// Person mesh factory and animation
// Uses THREE primitives with feet at local y=0

const PERSON_CONFIG = {
    // Body dimensions
    headRadius: 0.25,
    torsoHeight: 0.55,
    torsoWidth: 0.35,
    torsoDepth: 0.25,
    legLength: 0.6,
    legRadius: 0.08,
    armLength: 0.45,
    armRadius: 0.06,
    footRadius: 0.07,
    footHeight: 0.12,
    noseRadius: 0.04,
    noseHeight: 0.06,
    // Color palettes
    shirtColors: ['#4a90d9', '#d94a4a', '#4ad96b', '#9a4ad9', '#d99a4a', '#4a9ad9', '#c04a4a', '#4ac09a'],
    skinColors: ['#f5d5b0', '#e8c8a0', '#d4b89a', '#c1a080', '#b88c68', '#a87850', '#906040', '#784830'],
    pantsColors: ['#2c3e50', '#34495e', '#2c3e50', '#1a252f', '#4a4a4a', '#5d6d7e', '#34495e', '#2c3e50']
};

function createPerson(options = {}) {
    const { bodyColor, skinColor, legColor } = options;
    
    // Sample from palettes if not provided
    const shirtColor = bodyColor || PERSON_CONFIG.shirtColors[Math.floor(Math.random() * PERSON_CONFIG.shirtColors.length)];
    const actualSkinColor = skinColor || PERSON_CONFIG.skinColors[Math.floor(Math.random() * PERSON_CONFIG.skinColors.length)];
    const actualLegColor = legColor || PERSON_CONFIG.pantsColors[Math.floor(Math.random() * PERSON_CONFIG.pantsColors.length)];

    const group = new THREE.Group();
    group.userData = {
        isWalking: false,
        isSitting: false,
        walkPhase: 0
    };

    // Materials
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: actualSkinColor, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: actualLegColor, roughness: 0.8 });

    // ===== LEGS (each is a group pivoting at the hip) =====
    // Left leg group
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.12, 0, 0);
    group.add(leftLegGroup);
    
    // Left upper leg (thigh) - cylinder from hip down
    const leftThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.legRadius * 1.1, PERSON_CONFIG.legRadius, PERSON_CONFIG.legLength * 0.5, 8),
        pantsMat
    );
    leftThigh.position.y = -PERSON_CONFIG.legLength * 0.25;
    leftThigh.rotation.x = Math.PI / 2;
    leftLegGroup.add(leftThigh);
    
    // Left lower leg (calf)
    const leftCalf = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.legRadius, PERSON_CONFIG.legRadius * 0.85, PERSON_CONFIG.legLength * 0.5, 8),
        pantsMat
    );
    leftCalf.position.y = -PERSON_CONFIG.legLength * 0.75;
    leftCalf.rotation.x = Math.PI / 2;
    leftLegGroup.add(leftCalf);
    
    // Left foot
    const leftFoot = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.footRadius, PERSON_CONFIG.footRadius * 0.7, PERSON_CONFIG.footHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 })
    );
    leftFoot.position.y = -PERSON_CONFIG.legLength;
    leftFoot.rotation.x = Math.PI / 2;
    leftLegGroup.add(leftFoot);

    // Right leg group
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.12, 0, 0);
    group.add(rightLegGroup);
    
    const rightThigh = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.legRadius * 1.1, PERSON_CONFIG.legRadius, PERSON_CONFIG.legLength * 0.5, 8),
        pantsMat
    );
    rightThigh.position.y = -PERSON_CONFIG.legLength * 0.25;
    rightThigh.rotation.x = Math.PI / 2;
    rightLegGroup.add(rightThigh);
    
    const rightCalf = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.legRadius, PERSON_CONFIG.legRadius * 0.85, PERSON_CONFIG.legLength * 0.5, 8),
        pantsMat
    );
    rightCalf.position.y = -PERSON_CONFIG.legLength * 0.75;
    rightCalf.rotation.x = Math.PI / 2;
    rightLegGroup.add(rightCalf);
    
    const rightFoot = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.footRadius, PERSON_CONFIG.footRadius * 0.7, PERSON_CONFIG.footHeight, 8),
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 })
    );
    rightFoot.position.y = -PERSON_CONFIG.legLength;
    rightFoot.rotation.x = Math.PI / 2;
    rightLegGroup.add(rightFoot);

    // Store leg groups for animation
    group.userData.leftLeg = leftLegGroup;
    group.userData.rightLeg = rightLegGroup;

    // ===== TORSO =====
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(PERSON_CONFIG.torsoWidth, PERSON_CONFIG.torsoHeight, PERSON_CONFIG.torsoDepth),
        shirtMat
    );
    torso.position.y = PERSON_CONFIG.legLength + PERSON_CONFIG.torsoHeight * 0.5;
    group.add(torso);

    // ===== ARMS (each is a group pivoting at the shoulder) =====
    // Left arm group
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-PERSON_CONFIG.torsoWidth * 0.5 - PERSON_CONFIG.armRadius * 0.5, 
                               PERSON_CONFIG.legLength + PERSON_CONFIG.torsoHeight * 0.7, 0);
    group.add(leftArmGroup);
    
    const leftUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.armRadius, PERSON_CONFIG.armRadius * 0.8, PERSON_CONFIG.armLength * 0.6, 8),
        shirtMat
    );
    leftUpperArm.position.y = -PERSON_CONFIG.armLength * 0.3;
    leftUpperArm.rotation.x = Math.PI / 2;
    leftArmGroup.add(leftUpperArm);
    
    const leftForearm = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.armRadius * 0.8, PERSON_CONFIG.armRadius * 0.6, PERSON_CONFIG.armLength * 0.4, 8),
        shirtMat
    );
    leftForearm.position.y = -PERSON_CONFIG.armLength * 0.7;
    leftForearm.rotation.x = Math.PI / 2;
    leftArmGroup.add(leftForearm);
    
    // Right arm group
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(PERSON_CONFIG.torsoWidth * 0.5 + PERSON_CONFIG.armRadius * 0.5,
                               PERSON_CONFIG.legLength + PERSON_CONFIG.torsoHeight * 0.7, 0);
    group.add(rightArmGroup);
    
    const rightUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.armRadius, PERSON_CONFIG.armRadius * 0.8, PERSON_CONFIG.armLength * 0.6, 8),
        shirtMat
    );
    rightUpperArm.position.y = -PERSON_CONFIG.armLength * 0.3;
    rightUpperArm.rotation.x = Math.PI / 2;
    rightArmGroup.add(rightUpperArm);
    
    const rightForearm = new THREE.Mesh(
        new THREE.CylinderGeometry(PERSON_CONFIG.armRadius * 0.8, PERSON_CONFIG.armRadius * 0.6, PERSON_CONFIG.armLength * 0.4, 8),
        shirtMat
    );
    rightForearm.position.y = -PERSON_CONFIG.armLength * 0.7;
    rightForearm.rotation.x = Math.PI / 2;
    rightArmGroup.add(rightForearm);

    group.userData.leftArm = leftArmGroup;
    group.userData.rightArm = rightArmGroup;

    // ===== HEAD =====
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(PERSON_CONFIG.headRadius, 16, 12),
        skinMat
    );
    head.position.y = PERSON_CONFIG.legLength + PERSON_CONFIG.torsoHeight + PERSON_CONFIG.headRadius * 0.7;
    group.add(head);

    // Nose - hemisphere on +Z face of head
    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(PERSON_CONFIG.noseRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        skinMat
    );
    nose.position.set(0, PERSON_CONFIG.headRadius * 0.15, PERSON_CONFIG.headRadius * 0.85);
    nose.rotation.x = -Math.PI / 4;
    head.add(nose);

    // Eyes (simple small spheres)
    const eyeGeometry = new THREE.SphereGeometry(0.04, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMat);
    leftEye.position.set(-0.08, 0.05, PERSON_CONFIG.headRadius * 0.8);
    head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMat);
    rightEye.position.set(0.08, 0.05, PERSON_CONFIG.headRadius * 0.8);
    head.add(rightEye);

    return group;
}

function animatePersonWalking(person, dt) {
    const data = person.userData;
    const leftLeg = data.leftLeg;
    const rightLeg = data.rightLeg;
    const leftArm = data.leftArm;
    const rightArm = data.rightArm;

    if (data.isSitting) {
        // Sitting pose: legs forward, arms down
        if (leftLeg) leftLeg.rotation.x = -Math.PI / 2;
        if (rightLeg) rightLeg.rotation.x = -Math.PI / 2;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4;
        data.walkPhase = 0;
    } else if (data.isWalking) {
        // Walking animation
        data.walkPhase += dt * 8;
        const phase = data.walkPhase;
        const legSwing = Math.sin(phase) * 0.6;
        const armSwing = -Math.sin(phase) * 0.5;
        
        if (leftLeg) leftLeg.rotation.x = legSwing;
        if (rightLeg) rightLeg.rotation.x = -legSwing;
        if (leftArm) leftArm.rotation.x = armSwing;
        if (rightArm) rightArm.rotation.x = -armSwing;
    } else {
        // Standing idle - reset limbs
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
        if (leftArm) leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
    }
}

// Export to window
window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
