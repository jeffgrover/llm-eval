// person.js - Person mesh factory and walk/sit animation
// Loaded as classic <script> in browser - no ES6 imports/exports.

(function (root) {
    // Color palettes for visual variety
    const SHIRT_COLORS = [
        0x3366cc, 0xcc4444, 0x44aa55, 0xaa55aa, 0xee8822,
        0x33aaaa, 0xdd5577, 0x6677cc, 0x55aa33, 0xcc8833,
        0x4477aa, 0xaa3344, 0x8866cc, 0xdd8855, 0x336655
    ];
    const SKIN_COLORS = [0xf5d0a9, 0xe8b88a, 0xd99a6a, 0xc68660, 0x8d5524, 0xffdfc4];
    const PANTS_COLORS = [0x222244, 0x333333, 0x442222, 0x223322, 0x553311, 0x2a2a3a];

    function rand(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(options) {
        options = options || {};
        const bodyColor = options.bodyColor !== undefined ? options.bodyColor : rand(SHIRT_COLORS);
        const skinColor = options.skinColor !== undefined ? options.skinColor : rand(SKIN_COLORS);
        const legColor = options.legColor !== undefined ? options.legColor : rand(PANTS_COLORS);

        const person = new THREE.Group();
        person.name = "Person";

        // Total height roughly 1.8. Feet at local y=0.
        const hipY = 0.9;
        const torsoH = 0.65;
        const headR = 0.16;
        const shoulderY = hipY + torsoH - 0.05;
        const hipR = 0.13;     // hip pivot radius
        const thighH = 0.45;   // leg upper part
        const shinH = 0.45;    // leg lower part
        const armLen = 0.55;
        const armR = 0.06;

        // ---------- Legs (hip-pivoted) ----------
        function makeLeg(side) {
            const leg = new THREE.Group();
            // Hip pivot is at group origin. Build the leg hanging below.
            const upper = new THREE.Mesh(
                new THREE.CylinderGeometry(legRForThigh(), legRForThigh(), thighH, 8),
                new THREE.MeshLambertMaterial({ color: legColor })
            );
            upper.position.y = -thighH / 2;
            leg.add(upper);

            // Shin (pivots at knee for additional bend)
            const shin = new THREE.Group();
            shin.position.y = -thighH;
            const lower = new THREE.Mesh(
                new THREE.CylinderGeometry(legRForShin(), legRForShin(), shinH, 8),
                new THREE.MeshLambertMaterial({ color: legColor })
            );
            lower.position.y = -shinH / 2;
            shin.add(lower);
            // Foot (small block)
            const foot = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.08, 0.28),
                new THREE.MeshLambertMaterial({ color: 0x111111 })
            );
            foot.position.set(0, -shinH, 0.08);
            shin.add(foot);
            leg.add(shin);

            // Store shin for fine rotation
            leg.userData.shin = shin;
            leg.position.x = side * 0.12;
            return leg;
        }
        function legRForThigh() { return 0.085; }
        function legRForShin() { return 0.07; }

        const leftLeg = makeLeg(-1);
        const rightLeg = makeLeg(1);
        leftLeg.position.y = hipY;
        rightLeg.position.y = hipY;
        person.add(leftLeg);
        person.add(rightLeg);

        // ---------- Torso ----------
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, torsoH, 0.24),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = hipY + torsoH / 2;
        person.add(torso);

        // Neck stub
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        neck.position.y = hipY + torsoH + 0.05;
        person.add(neck);

        // ---------- Head ----------
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(headR, 12, 10),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = hipY + torsoH + 0.1 + headR;
        person.add(head);

        // Nose (hemisphere on +Z face)
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.rotation.x = -Math.PI / 2;
        nose.position.set(0, hipY + torsoH + 0.1, headR - 0.01);
        person.add(nose);

        // ---------- Arms (shoulder-pivoted) ----------
        function makeArm(side) {
            const arm = new THREE.Group();
            // Upper arm
            const upper = new THREE.Mesh(
                new THREE.CylinderGeometry(armR, armR, armLen, 8),
                new THREE.MeshLambertMaterial({ color: bodyColor })
            );
            upper.position.y = -armLen / 2;
            arm.add(upper);
            // Forearm
            const fore = new THREE.Group();
            fore.position.y = -armLen;
            const lower = new THREE.Mesh(
                new THREE.CylinderGeometry(armR * 0.85, armR * 0.85, armLen * 0.85, 8),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            lower.position.y = -armLen * 0.85 / 2;
            fore.add(lower);
            // Hand
            const hand = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 8, 6),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            hand.position.y = -armLen * 0.85;
            fore.add(hand);
            arm.add(fore);
            arm.userData.fore = fore;
            arm.position.set(side * 0.28, shoulderY, 0);
            return arm;
        }
        const leftArm = makeArm(-1);
        const rightArm = makeArm(1);
        person.add(leftArm);
        person.add(rightArm);

        // Per-person animation state
        person.userData.walkPhase = 0;
        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.legs = { left: leftLeg, right: rightLeg };
        person.userData.arms = { left: leftArm, right: rightArm };

        // Allow downshifting the whole body when seated.
        person.userData.baseY = 0;
        person.userData.yOffset = 0;

        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;
        const leftLeg = ud.legs && ud.legs.left;
        const rightLeg = ud.legs && ud.legs.right;
        const leftArm = ud.arms && ud.arms.left;
        const rightArm = ud.arms && ud.arms.right;

        if (ud.isSitting) {
            // Sit: legs bent ~90deg at hip (knees forward, shins vertical),
            // shins slightly forward to mimic under-desk posture.
            if (leftLeg) leftLeg.rotation.x = -Math.PI / 2;
            if (rightLeg) rightLeg.rotation.x = -Math.PI / 2;
            if (leftLeg && leftLeg.userData.shin) {
                leftLeg.userData.shin.rotation.x = Math.PI / 2.6;
            }
            if (rightLeg && rightLeg.userData.shin) {
                rightLeg.userData.shin.rotation.x = Math.PI / 2.6;
            }
            // Arms drop slightly forward and rotate a bit
            if (leftArm) {
                leftArm.rotation.x = -Math.PI / 4;
                leftArm.rotation.z = 0.08;
                if (leftArm.userData.fore) leftArm.userData.fore.rotation.x = 0.2;
            }
            if (rightArm) {
                rightArm.rotation.x = -Math.PI / 4;
                rightArm.rotation.z = -0.08;
                if (rightArm.userData.fore) rightArm.userData.fore.rotation.x = 0.2;
            }
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const ph = ud.walkPhase;
            const swing = Math.sin(ph) * 0.6;
            const armSwing = -Math.sin(ph) * 0.5;
            if (leftLeg) leftLeg.rotation.x = swing;
            if (rightLeg) rightLeg.rotation.x = -swing;
            if (leftLeg && leftLeg.userData.shin) leftLeg.userData.shin.rotation.x = Math.max(0, -swing) * 0.4;
            if (rightLeg && rightLeg.userData.shin) rightLeg.userData.shin.rotation.x = Math.max(0, swing) * 0.4;
            if (leftArm) {
                leftArm.rotation.x = armSwing;
                leftArm.rotation.z = 0.08;
                if (leftArm.userData.fore) leftArm.userData.fore.rotation.x = 0;
            }
            if (rightArm) {
                rightArm.rotation.x = -armSwing;
                rightArm.rotation.z = -0.08;
                if (rightArm.userData.fore) rightArm.userData.fore.rotation.x = 0;
            }
        } else {
            // Standing idle: reset limbs to neutral
            if (leftLeg) {
                leftLeg.rotation.x = 0;
                if (leftLeg.userData.shin) leftLeg.userData.shin.rotation.x = 0;
            }
            if (rightLeg) {
                rightLeg.rotation.x = 0;
                if (rightLeg.userData.shin) rightLeg.userData.shin.rotation.x = 0;
            }
            if (leftArm) {
                leftArm.rotation.x = 0;
                leftArm.rotation.z = 0.08;
                if (leftArm.userData.fore) leftArm.userData.fore.rotation.x = 0;
            }
            if (rightArm) {
                rightArm.rotation.x = 0;
                rightArm.rotation.z = -0.08;
                if (rightArm.userData.fore) rightArm.userData.fore.rotation.x = 0;
            }
            ud.walkPhase *= 0.9;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
    root.SkinColors = SKIN_COLORS;
    root.ShirtColors = SHIRT_COLORS;
    root.PantsColors = PANTS_COLORS;
})(typeof window !== "undefined" ? window : globalThis);
