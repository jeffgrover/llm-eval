// person.js - Person mesh factory + walk/sit animation

(function() {
    // Color palettes for visual distinction
    const BODY_COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731, 0xa29bfe, 0xe17055];
    const SKIN_COLORS = [0xf8c4a7, 0xffdbac, 0xd1a68a, 0x8d5524, 0xc68642, 0xeebb99];
    const LEG_COLORS = [0x34495e, 0x2c3e50, 0x7f8c8d, 0x95a5a6, 0x3498db, 0x1abc9c];

    function createPerson(options) {
        options = options || {};
        const bodyColor = options.bodyColor || BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)];
        const skinColor = options.skinColor || SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)];
        const legColor = options.legColor || LEG_COLORS[Math.floor(Math.random() * LEG_COLORS.length)];

        const person = new THREE.Group();
        person.userData = {
            isSitting: false,
            isWalking: false,
            walkPhase: 0
        };

        // Legs - each leg is a group pivoting at hip
        function createLeg(color) {
            const legGroup = new THREE.Group();
            // Hip pivot point (group origin)
            const thigh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.1, 0.4, 8),
                new THREE.MeshLambertMaterial({ color: color })
            );
            thigh.position.y = -0.2; // Center of thigh below hip
            legGroup.add(thigh);

            const shin = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.08, 0.4, 8),
                new THREE.MeshLambertMaterial({ color: color })
            );
            shin.position.y = -0.6; // Below thigh
            legGroup.add(shin);

            const foot = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.08, 0.24),
                new THREE.MeshLambertMaterial({ color: 0x333333 })
            );
            foot.position.y = -0.88; // Bottom of shin
            legGroup.add(foot);

            return legGroup;
        }

        const leftLeg = createLeg(legColor);
        const rightLeg = createLeg(legColor);
        leftLeg.position.x = -0.15;
        rightLeg.position.x = 0.15;
        person.add(leftLeg, rightLeg);

        // Torso
        const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.2, 0.5, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = 0.3; // Above hips
        person.add(torso);

        // Head
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = 0.75; // Top of torso
        person.add(head);

        // Nose (small hemisphere on +Z face)
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 8, 8),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.position.set(0, 0.05, 0.18); // On front of head
        head.add(nose);

        // Arms - pivot at shoulder
        function createArm(color) {
            const armGroup = new THREE.Group();
            const upperArm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.08, 0.35, 8),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            upperArm.position.y = -0.17; // Below shoulder
            armGroup.add(upperArm);

            const forearm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.07, 0.32, 8),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            forearm.position.y = -0.5; // Below upper arm
            armGroup.add(forearm);

            const hand = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 8, 8),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            hand.position.y = -0.82; // Bottom of forearm
            armGroup.add(hand);

            return armGroup;
        }

        const leftArm = createArm(bodyColor);
        const rightArm = createArm(bodyColor);
        leftArm.position.set(-0.35, 0.4, 0);
        rightArm.position.set(0.35, 0.4, 0);
        person.add(leftArm, rightArm);

        // Store references for animation
        person.userData.leftLeg = leftLeg;
        person.userData.rightLeg = rightLeg;
        person.userData.leftArm = leftArm;
        person.userData.rightArm = rightArm;

        return person;
    }

    function animatePersonWalking(person, dt) {
        const data = person.userData;
        if (data.isSitting) {
            // Sitting pose: legs bent forward, arms down
            data.leftLeg.rotation.x = -Math.PI / 2;
            data.rightLeg.rotation.x = -Math.PI / 2;
            data.leftArm.rotation.x = -Math.PI / 4;
            data.rightArm.rotation.x = -Math.PI / 4;
            data.walkPhase = 0; // Reset walk phase when sitting
        } else if (data.isWalking) {
            // Walking animation: swing legs and arms
            data.walkPhase += dt * 8;
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

    // Expose globally for browser
    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
