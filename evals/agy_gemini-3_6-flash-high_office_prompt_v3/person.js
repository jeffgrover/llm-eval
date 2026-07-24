(function() {
    const SHIRT_PALETTE = [0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4, 0x64748b, 0xd97706];
    const PANTS_PALETTE = [0x1e293b, 0x334155, 0x475569, 0x1e1b4b, 0x2e1065, 0x451a03];
    const SKIN_PALETTE = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];

    function createPerson(options) {
        const opts = options || {};
        const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : SHIRT_PALETTE[Math.floor(Math.random() * SHIRT_PALETTE.length)];
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : SKIN_PALETTE[Math.floor(Math.random() * SKIN_PALETTE.length)];
        const legColor = opts.legColor !== undefined ? opts.legColor : PANTS_PALETTE[Math.floor(Math.random() * PANTS_PALETTE.length)];

        const group = new THREE.Group();

        const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const pantsMat = new THREE.MeshLambertMaterial({ color: legColor });

        // Legs - Hip pivots at y = 0.9
        const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.9, 8);
        legGeo.translate(0, -0.45, 0); // Origin at top of leg (hip)

        const leftLeg = new THREE.Group();
        leftLeg.position.set(-0.14, 0.9, 0);
        const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.add(leftLegMesh);
        group.add(leftLeg);

        const rightLeg = new THREE.Group();
        rightLeg.position.set(0.14, 0.9, 0);
        const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.add(rightLegMesh);
        group.add(rightLeg);

        // Torso - center y = 1.35 (height 0.9)
        const torsoGeo = new THREE.BoxGeometry(0.44, 0.85, 0.26);
        const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
        torsoMesh.position.set(0, 1.325, 0);
        group.add(torsoMesh);

        // Head - center y = 2.0
        const headGeo = new THREE.SphereGeometry(0.2, 12, 12);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, 1.95, 0);
        group.add(headMesh);

        // Nose - on +Z face of head (facing direction)
        const noseGeo = new THREE.ConeGeometry(0.05, 0.12, 8);
        noseGeo.rotateX(Math.PI / 2);
        const noseMesh = new THREE.Mesh(noseGeo, skinMat);
        noseMesh.position.set(0, 1.95, 0.22);
        group.add(noseMesh);

        // Arms - Shoulder pivots at y = 1.65
        const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.7, 8);
        armGeo.translate(0, -0.35, 0); // Origin at shoulder

        const leftArm = new THREE.Group();
        leftArm.position.set(-0.28, 1.65, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
        leftArm.add(leftArmMesh);
        group.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(0.28, 1.65, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
        rightArm.add(rightArmMesh);
        group.add(rightArm);

        group.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            isSitting: false,
            isWalking: false,
            walkPhase: Math.random() * Math.PI * 2
        };

        return group;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;

        if (ud.isSitting) {
            // Legs rotate -PI/2 at hip so legs bend forward along +Z (in local coordinates facing forward)
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            // Arms drop slightly forward/down
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            const legSwing = Math.sin(phase) * 0.6;
            const armSwing = Math.sin(phase) * 0.5;

            ud.leftLeg.rotation.x = legSwing;
            ud.rightLeg.rotation.x = -legSwing;
            ud.leftArm.rotation.x = -armSwing;
            ud.rightArm.rotation.x = armSwing;
        } else {
            // Standing idle
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
