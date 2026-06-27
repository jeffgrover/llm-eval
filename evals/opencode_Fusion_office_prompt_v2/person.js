(function (root) {
    const SHIRT_COLORS = [0x3366cc, 0xcc4444, 0x44aa66, 0xddaa33, 0x9955bb, 0x33aacc, 0xcc7744, 0x556677];
    const SKIN_COLORS = [0xf0c8a0, 0xe0a878, 0xc68642, 0x8d5524, 0xffdbac, 0xae7b53];
    const PANTS_COLORS = [0x222831, 0x33415c, 0x5a3825, 0x444444, 0x2d4a3e, 0x4a2d3e];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor != null ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor != null ? opts.skinColor : pick(SKIN_COLORS);
        const legColor = opts.legColor != null ? opts.legColor : pick(PANTS_COLORS);

        const group = new THREE.Group();

        const legLen = 0.7;
        const torsoH = 0.6;
        const headR = 0.18;
        const hipY = legLen;
        const shoulderY = legLen + torsoH;

        const legMat = new THREE.MeshLambertMaterial({ color: legColor });
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

        // Legs: each is a Group pivoting at the hip, cylinder hanging below.
        function makeLimb(len, radius, mat) {
            const pivot = new THREE.Group();
            const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = -len / 2;
            pivot.add(mesh);
            return pivot;
        }

        const leftLeg = makeLimb(legLen, 0.1, legMat);
        leftLeg.position.set(-0.12, hipY, 0);
        group.add(leftLeg);

        const rightLeg = makeLimb(legLen, 0.1, legMat);
        rightLeg.position.set(0.12, hipY, 0);
        group.add(rightLeg);

        // Torso
        const torsoGeo = new THREE.CylinderGeometry(0.22, 0.26, torsoH, 10);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = hipY + torsoH / 2;
        group.add(torso);

        // Arms: pivot at shoulder
        const leftArm = makeLimb(0.55, 0.07, bodyMat);
        leftArm.position.set(-0.30, shoulderY, 0);
        group.add(leftArm);

        const rightArm = makeLimb(0.55, 0.07, bodyMat);
        rightArm.position.set(0.30, shoulderY, 0);
        group.add(rightArm);

        // Head
        const headGeo = new THREE.SphereGeometry(headR, 12, 12);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = shoulderY + headR + 0.04;
        group.add(head);

        // Nose hemisphere on +Z face of head, so facing reads from top-down.
        const noseGeo = new THREE.SphereGeometry(headR * 0.45, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, skinMat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, head.position.y, headR * 0.85);
        group.add(nose);

        group.userData = {
            isWalking: false,
            isSitting: false,
            walkPhase: 0,
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm
        };

        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud) return;
        const ll = ud.leftLeg, rl = ud.rightLeg, la = ud.leftArm, ra = ud.rightArm;
        if (!ll) return;

        if (ud.isSitting) {
            // Legs forward (feet toward desk), arms relaxed.
            ll.rotation.x = -Math.PI / 2;
            rl.rotation.x = -Math.PI / 2;
            la.rotation.x = -Math.PI / 4;
            ra.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const s = Math.sin(ud.walkPhase);
            ll.rotation.x = s * 0.6;
            rl.rotation.x = -s * 0.6;
            la.rotation.x = -s * 0.5;
            ra.rotation.x = s * 0.5;
        } else {
            ll.rotation.x = 0;
            rl.rotation.x = 0;
            la.rotation.x = 0;
            ra.rotation.x = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
