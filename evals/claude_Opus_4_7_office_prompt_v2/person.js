// person.js — person mesh factory + walk/sit animation
// Feet sit at local y=0 so the person's origin matches the floor.

(function (root) {
    const SHIRT_PALETTE = [
        0x4477aa, 0xaa4444, 0x44aa66, 0xaa8844, 0x884499,
        0x447799, 0x99664a, 0x556677, 0x6688aa, 0xc46d3b,
        0x4d8b7a, 0x7a3b6d, 0x336688, 0x885566, 0x6a8855
    ];
    const SKIN_PALETTE = [
        0xfdd9b1, 0xeac39a, 0xd2a378, 0xb07b53,
        0x8b5a3c, 0x5c3a25, 0xf2c5a1
    ];
    const PANTS_PALETTE = [
        0x222244, 0x333333, 0x4a3b1f, 0x223344,
        0x2a3320, 0x444444, 0x554a3b, 0x2c2c4a
    ];

    function pickFromPalette(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor != null ? opts.bodyColor : pickFromPalette(SHIRT_PALETTE);
        const skinColor = opts.skinColor != null ? opts.skinColor : pickFromPalette(SKIN_PALETTE);
        const legColor = opts.legColor != null ? opts.legColor : pickFromPalette(PANTS_PALETTE);

        const person = new THREE.Group();

        // dimensions
        const legHeight = 0.7;
        const legRadius = 0.08;
        const torsoHeight = 0.65;
        const torsoRadiusTop = 0.22;
        const torsoRadiusBot = 0.24;
        const headRadius = 0.18;
        const armLength = 0.55;
        const armRadius = 0.07;

        const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
        const legMat = new THREE.MeshStandardMaterial({ color: legColor, roughness: 0.85 });
        const torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 });

        // ---- legs: each is a Group pivoting at the hip ----
        const hipY = legHeight; // hips sit at top of legs (feet at y=0)
        const legGeom = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
        // Translate geometry so the leg hangs below the pivot (cylinder centered at -legHeight/2)
        legGeom.translate(0, -legHeight / 2, 0);

        function makeLegGroup(xOffset) {
            const group = new THREE.Group();
            group.position.set(xOffset, hipY, 0);
            const legMesh = new THREE.Mesh(legGeom, legMat);
            legMesh.castShadow = false;
            group.add(legMesh);
            return group;
        }
        const leftLeg = makeLegGroup(-0.10);
        const rightLeg = makeLegGroup(0.10);
        person.add(leftLeg);
        person.add(rightLeg);

        // ---- torso ----
        const torsoGeom = new THREE.CylinderGeometry(torsoRadiusTop, torsoRadiusBot, torsoHeight, 12);
        const torso = new THREE.Mesh(torsoGeom, torsoMat);
        torso.position.set(0, hipY + torsoHeight / 2, 0);
        person.add(torso);

        // ---- arms: shoulder pivot groups ----
        const shoulderY = hipY + torsoHeight - 0.05;
        const armGeom = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8);
        armGeom.translate(0, -armLength / 2, 0);

        function makeArmGroup(xOffset) {
            const group = new THREE.Group();
            group.position.set(xOffset, shoulderY, 0);
            const armMesh = new THREE.Mesh(armGeom, torsoMat);
            group.add(armMesh);
            return group;
        }
        const leftArm = makeArmGroup(-(torsoRadiusTop + armRadius + 0.01));
        const rightArm = makeArmGroup((torsoRadiusTop + armRadius + 0.01));
        person.add(leftArm);
        person.add(rightArm);

        // ---- head ----
        const headGeom = new THREE.SphereGeometry(headRadius, 14, 12);
        const head = new THREE.Mesh(headGeom, skinMat);
        const headY = hipY + torsoHeight + headRadius + 0.02;
        head.position.set(0, headY, 0);
        person.add(head);

        // ---- nose: small hemisphere on +Z face of head ----
        const noseGeom = new THREE.SphereGeometry(headRadius * 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeom, skinMat);
        // place at front of head, rotated so flat face is against head
        nose.position.set(0, headY - 0.02, headRadius * 0.95);
        nose.rotation.x = Math.PI / 2;
        person.add(nose);

        person.userData = {
            isWalking: false,
            isSitting: false,
            walkPhase: 0,
            limbs: { leftLeg, rightLeg, leftArm, rightArm },
            standY: 0,
            // tunables for animator
            _walkSpeedHz: 8,
            _legAmp: 0.6,
            _armAmp: 0.5,
        };

        return person;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud || !ud.limbs) return;
        const { leftLeg, rightLeg, leftArm, rightArm } = ud.limbs;

        if (ud.isSitting) {
            // legs forward at -90deg, arms slightly down at -45deg
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }

        if (ud.isWalking) {
            ud.walkPhase += dt * (ud._walkSpeedHz || 8);
            const ph = ud.walkPhase;
            const legSwing = Math.sin(ph) * (ud._legAmp || 0.6);
            const armSwing = -Math.sin(ph) * (ud._armAmp || 0.5);
            leftLeg.rotation.x = legSwing;
            rightLeg.rotation.x = -legSwing;
            leftArm.rotation.x = armSwing;
            rightArm.rotation.x = -armSwing;
        } else {
            // standing idle — reset
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftArm.rotation.x = 0;
            rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
    root.PERSON_PALETTES = { shirts: SHIRT_PALETTE, skin: SKIN_PALETTE, pants: PANTS_PALETTE };
})(typeof window !== "undefined" ? window : globalThis);
