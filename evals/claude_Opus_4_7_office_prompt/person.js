// person.js — person mesh factory + walk/sit animation

(function () {
    const SHIRT_COLORS = [
        0xd1495b, 0x2e86ab, 0x5b8c5a, 0xe2b04a, 0x8e6fbf,
        0xc97d5d, 0x4f6d7a, 0xdb6c79, 0x3a7d7b, 0xb56576,
        0xeaa83c, 0x6b5b95, 0x9b2915, 0x5d737e
    ];
    const SKIN_COLORS = [
        0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac,
        0xf3c891, 0xd4a373, 0xa57551
    ];
    const PANT_COLORS = [
        0x2b2d42, 0x3d4451, 0x4a4e69, 0x2f2f3f, 0x1a1a2e,
        0x574b3e, 0x454545, 0x3c2f2f
    ];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function createPerson(opts) {
        opts = opts || {};
        const shirtColor = opts.bodyColor != null ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor != null ? opts.skinColor : pick(SKIN_COLORS);
        const pantColor = opts.legColor != null ? opts.legColor : pick(PANT_COLORS);

        const group = new THREE.Group();

        const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const pantMat = new THREE.MeshLambertMaterial({ color: pantColor });
        const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

        // Dimensions — legLen chosen so the spec's ~0.35 SIT drop lands hips near chair-seat height.
        const legLen = 0.85;
        const legR = 0.09;
        const torsoH = 0.62;
        const torsoW = 0.38;
        const torsoD = 0.22;
        const headR = 0.18;
        const armLen = 0.55;
        const armR = 0.075;

        // Hips: a pivot group at the top of each leg (hip joint).
        // Feet sit at local y=0 of the person group, hips at y = legLen.
        const hipY = legLen;

        function makeLeg(sign) {
            const leg = new THREE.Group();
            leg.position.set(sign * 0.11, hipY, 0);
            // Leg cylinder hanging below the pivot
            const legGeom = new THREE.CylinderGeometry(legR, legR * 0.95, legLen, 8);
            const legMesh = new THREE.Mesh(legGeom, pantMat);
            legMesh.position.y = -legLen / 2;
            leg.add(legMesh);
            // Shoe
            const shoeGeom = new THREE.BoxGeometry(0.15, 0.07, 0.25);
            const shoeMesh = new THREE.Mesh(shoeGeom, shoeMat);
            shoeMesh.position.set(0, -legLen + 0.035, 0.04);
            leg.add(shoeMesh);
            return leg;
        }

        const leftLeg = makeLeg(-1);
        const rightLeg = makeLeg(1);
        group.add(leftLeg, rightLeg);

        // Torso
        const torsoGeom = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
        const torso = new THREE.Mesh(torsoGeom, shirtMat);
        torso.position.y = hipY + torsoH / 2;
        group.add(torso);

        // Arms pivot at shoulder
        const shoulderY = hipY + torsoH - 0.04;
        function makeArm(sign) {
            const arm = new THREE.Group();
            arm.position.set(sign * (torsoW / 2 + armR * 0.7), shoulderY, 0);
            const armGeom = new THREE.CylinderGeometry(armR, armR * 0.85, armLen, 8);
            const armMesh = new THREE.Mesh(armGeom, shirtMat);
            armMesh.position.y = -armLen / 2;
            arm.add(armMesh);
            // Hand
            const handGeom = new THREE.SphereGeometry(armR * 1.15, 8, 6);
            const handMesh = new THREE.Mesh(handGeom, skinMat);
            handMesh.position.y = -armLen - armR * 0.4;
            arm.add(handMesh);
            return arm;
        }
        const leftArm = makeArm(-1);
        const rightArm = makeArm(1);
        group.add(leftArm, rightArm);

        // Head
        const headGeom = new THREE.SphereGeometry(headR, 12, 10);
        const head = new THREE.Mesh(headGeom, skinMat);
        head.position.y = shoulderY + 0.04 + headR;
        group.add(head);

        // Nose (hemisphere on +Z)
        const noseGeom = new THREE.SphereGeometry(headR * 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeom, skinMat);
        nose.position.set(0, head.position.y - headR * 0.05, headR * 0.95);
        nose.rotation.x = Math.PI / 2;
        group.add(nose);

        group.userData.leftLeg = leftLeg;
        group.userData.rightLeg = rightLeg;
        group.userData.leftArm = leftArm;
        group.userData.rightArm = rightArm;
        group.userData.head = head;
        group.userData.torso = torso;
        group.userData.hipY = hipY;
        group.userData.walkPhase = 0;
        group.userData.isWalking = false;
        group.userData.isSitting = false;

        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud || !ud.leftLeg) return;

        if (ud.isSitting) {
            // Sitting pose: legs rotated forward (-π/2 at hip, cylinder pointing +Z),
            // arms slightly drooped.
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }

        if (ud.isWalking) {
            ud.walkPhase = (ud.walkPhase || 0) + dt * 8;
            const ph = ud.walkPhase;
            const legSwing = Math.sin(ph) * 0.6;
            const armSwing = -Math.sin(ph) * 0.5;
            ud.leftLeg.rotation.x = legSwing;
            ud.rightLeg.rotation.x = -legSwing;
            ud.leftArm.rotation.x = armSwing;
            ud.rightArm.rotation.x = -armSwing;
        } else {
            // Standing idle
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
