// person.js — Person mesh factory + walk/sit animation

(function () {
    const BODY_PALETTE = [
        0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b,
        0x8b5cf6, 0xec4899, 0x06b6d4, 0x84cc16,
        0xf97316, 0x6366f1, 0x14b8a6, 0xe11d48,
        0x0ea5e9, 0xa855f7, 0x22c55e, 0xd97706
    ];

    const SKIN_PALETTE = [
        0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642,
        0x8d5524, 0xffe0bd, 0xd2996c
    ];

    const LEG_PALETTE = [
        0x1e293b, 0x334155, 0x3f3f46, 0x1e3a8a,
        0x44403c, 0x27272a, 0x475569, 0x292524
    ];

    // Shared geometries for performance across 100 agents
    const legGeo = new THREE.CylinderGeometry(0.072, 0.06, 0.72, 10);
    const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.20);
    const torsoGeo = new THREE.BoxGeometry(0.36, 0.58, 0.22);
    const armGeo = new THREE.CylinderGeometry(0.055, 0.048, 0.52, 8);
    const handGeo = new THREE.SphereGeometry(0.052, 8, 6);
    const headGeo = new THREE.SphereGeometry(0.165, 14, 12);
    const noseGeo = new THREE.SphereGeometry(0.065, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);

    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x18181b });

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pickRandom(BODY_PALETTE);
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickRandom(SKIN_PALETTE);
        const legColor = opts.legColor !== undefined ? opts.legColor : pickRandom(LEG_PALETTE);

        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const legMat = new THREE.MeshLambertMaterial({ color: legColor });

        const person = new THREE.Group();

        // Hip height = 0.72 so feet rest cleanly at local y = 0
        const hipY = 0.72;

        // Left leg group pivoting at hip
        const leftLeg = new THREE.Group();
        leftLeg.position.set(-0.10, hipY, 0);
        const leftLegMesh = new THREE.Mesh(legGeo, legMat);
        leftLegMesh.position.set(0, -0.36, 0);
        leftLeg.add(leftLegMesh);
        const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
        leftShoe.position.set(0, -0.685, 0.035);
        leftLeg.add(leftShoe);
        person.add(leftLeg);

        // Right leg group pivoting at hip
        const rightLeg = new THREE.Group();
        rightLeg.position.set(0.10, hipY, 0);
        const rightLegMesh = new THREE.Mesh(legGeo, legMat);
        rightLegMesh.position.set(0, -0.36, 0);
        rightLeg.add(rightLegMesh);
        const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
        rightShoe.position.set(0, -0.685, 0.035);
        rightLeg.add(rightShoe);
        person.add(rightLeg);

        // Torso
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.set(0, hipY + 0.29, 0);
        person.add(torso);

        // Arms pivoting at shoulder
        const shoulderY = hipY + 0.53; // 1.25

        const leftArm = new THREE.Group();
        leftArm.position.set(-0.24, shoulderY, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, bodyMat);
        leftArmMesh.position.set(0, -0.26, 0);
        leftArm.add(leftArmMesh);
        const leftHand = new THREE.Mesh(handGeo, skinMat);
        leftHand.position.set(0, -0.52, 0);
        leftArm.add(leftHand);
        person.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(0.24, shoulderY, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
        rightArmMesh.position.set(0, -0.26, 0);
        rightArm.add(rightArmMesh);
        const rightHand = new THREE.Mesh(handGeo, skinMat);
        rightHand.position.set(0, -0.52, 0);
        rightArm.add(rightHand);
        person.add(rightArm);

        // Head + hemisphere nose on +Z face so facing reads clearly from above
        const headGroup = new THREE.Group();
        headGroup.position.set(0, hipY + 0.77, 0); // 1.49

        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headGroup.add(headMesh);

        const noseMesh = new THREE.Mesh(noseGeo, skinMat);
        noseMesh.rotation.x = Math.PI / 2; // dome points along +Z
        noseMesh.position.set(0, 0, 0.145);
        headGroup.add(noseMesh);

        person.add(headGroup);

        person.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            head: headGroup,
            torso: torso,
            walkPhase: Math.random() * Math.PI * 2,
            isWalking: false,
            isSitting: false
        };

        return person;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud || !ud.leftLeg) return;

        if (ud.isSitting) {
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase = (ud.walkPhase || 0) + dt * 8;
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
})();
