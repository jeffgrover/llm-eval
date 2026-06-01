(function (root) {
    const SHIRT_COLORS = [0x3366cc, 0xcc4444, 0x44aa44, 0xddaa33, 0x9966cc, 0xee6688, 0x33aaaa, 0x886633];
    const SKIN_COLORS = [0xffd8b1, 0xe6b58a, 0xb88860, 0x8a5a3a, 0xf2c098, 0xc9926b];
    const PANTS_COLORS = [0x222244, 0x333355, 0x553311, 0x222222, 0x444466, 0x2b2b3d];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function makeLeg(color) {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: color });
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.85, 10), mat);
        cyl.position.y = -0.425;
        g.add(cyl);
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.45), new THREE.MeshLambertMaterial({ color: 0x111122 }));
        shoe.position.set(0, -0.85, 0.08);
        g.add(shoe);
        return g;
    }

    function makeArm(color) {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: color });
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), mat);
        cyl.position.y = -0.35;
        g.add(cyl);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd8b1 }));
        hand.position.y = -0.72;
        g.add(hand);
        return g;
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor != null ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor != null ? opts.skinColor : pick(SKIN_COLORS);
        const legColor = opts.legColor != null ? opts.legColor : pick(PANTS_COLORS);

        const g = new THREE.Group();
        g.userData = {
            isWalking: false,
            isSitting: false,
            walkPhase: 0,
        };

        const legL = makeLeg(legColor);
        const legR = makeLeg(legColor);
        legL.position.set(-0.13, 0.95, 0);
        legR.position.set(0.13, 0.95, 0);
        g.add(legL, legR);
        g.userData.legL = legL;
        g.userData.legR = legR;

        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.7, 0.32),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = 1.45;
        torso.renderOrder = 1;
        g.add(torso);

        const armL = makeArm(bodyColor);
        const armR = makeArm(bodyColor);
        armL.position.set(-0.36, 1.78, 0);
        armR.position.set(0.36, 1.78, 0);
        g.add(armL, armR);
        g.userData.armL = armL;
        g.userData.armR = armR;

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 12, 10),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = 1.98;
        g.add(head);

        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.position.set(0, 1.96, 0.22);
        nose.rotation.x = Math.PI / 2;
        g.add(nose);

        const hairColor = pick([0x222222, 0x553311, 0x886633, 0xddbb88, 0x444444]);
        const hair = new THREE.Mesh(
            new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
            new THREE.MeshLambertMaterial({ color: hairColor })
        );
        hair.position.y = 2.02;
        g.add(hair);

        g.userData.baseY = 0;
        g.traverse(function (c) {
            if (c.isMesh) {
                c.castShadow = false;
                c.receiveShadow = false;
            }
        });
        return g;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud) return;
        if (ud.isSitting) {
            ud.legL.rotation.x = -Math.PI / 2;
            ud.legR.rotation.x = -Math.PI / 2;
            ud.armL.rotation.x = -Math.PI / 4;
            ud.armR.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }
        if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const s = Math.sin(ud.walkPhase);
            ud.legL.rotation.x = s * 0.6;
            ud.legR.rotation.x = -s * 0.6;
            ud.armL.rotation.x = -s * 0.5;
            ud.armR.rotation.x = s * 0.5;
        } else {
            ud.legL.rotation.x = 0;
            ud.legR.rotation.x = 0;
            ud.armL.rotation.x = 0;
            ud.armR.rotation.x = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
