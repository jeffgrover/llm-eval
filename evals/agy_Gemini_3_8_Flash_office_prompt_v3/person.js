/**
 * person.js
 * Person mesh factory and walk/sit animation.
 * Classic browser script attaching createPerson and animatePersonWalking to window.
 */

(function() {
    const SHIRT_PALETTE = [
        0x2d68c4, 0xbf360c, 0x1b5e20, 0x4a148c, 0xd81b60,
        0x00838f, 0x4e342e, 0x37474f, 0xf57f17, 0x5c6bc0
    ];

    const SKIN_PALETTE = [
        0xffdfc4, 0xf0c8a0, 0xd8a078, 0xae703f, 0x764b28, 0x503318
    ];

    const PANTS_PALETTE = [
        0x263238, 0x1a237e, 0x3e2723, 0x212121, 0x424242, 0x37474f
    ];

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(options) {
        const opts = options || {};
        const shirtCol = opts.bodyColor !== undefined ? opts.bodyColor : pickRandom(SHIRT_PALETTE);
        const skinCol = opts.skinColor !== undefined ? opts.skinColor : pickRandom(SKIN_PALETTE);
        const pantsCol = opts.legColor !== undefined ? opts.legColor : pickRandom(PANTS_PALETTE);

        const person = new THREE.Group();

        const shirtMat = new THREE.MeshLambertMaterial({ color: shirtCol });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinCol });
        const pantsMat = new THREE.MeshLambertMaterial({ color: pantsCol });

        // Origin (0,0,0) is at feet level on the walkable floor

        // Hip height = 0.75
        const legLength = 0.75;
        const legRadius = 0.065;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legLength, 8);

        // Left Leg Group (pivot at hip: -0.13, 0.75, 0)
        const leftLeg = new THREE.Group();
        leftLeg.position.set(-0.13, legLength, 0);
        const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
        leftLegMesh.position.set(0, -legLength / 2, 0);
        leftLeg.add(leftLegMesh);
        person.add(leftLeg);

        // Right Leg Group (pivot at hip: 0.13, 0.75, 0)
        const rightLeg = new THREE.Group();
        rightLeg.position.set(0.13, legLength, 0);
        const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
        rightLegMesh.position.set(0, -legLength / 2, 0);
        rightLeg.add(rightLegMesh);
        person.add(rightLeg);

        // Torso: box width 0.42, height 0.62, depth 0.24, centered at y = 0.75 + 0.31 = 1.06
        const torsoGeo = new THREE.BoxGeometry(0.42, 0.62, 0.24);
        const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
        torsoMesh.position.set(0, 1.06, 0);
        person.add(torsoMesh);

        // Arms: pivot at shoulder level y = 1.32
        const armLength = 0.55;
        const armRadius = 0.05;
        const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 8);

        // Left Arm
        const leftArm = new THREE.Group();
        leftArm.position.set(-0.27, 1.32, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
        leftArmMesh.position.set(0, -armLength / 2, 0);
        leftArm.add(leftArmMesh);
        person.add(leftArm);

        // Right Arm
        const rightArm = new THREE.Group();
        rightArm.position.set(0.27, 1.32, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
        rightArmMesh.position.set(0, -armLength / 2, 0);
        rightArm.add(rightArmMesh);
        person.add(rightArm);

        // Head: sphere radius 0.18, centered at y = 1.55
        const headGeo = new THREE.SphereGeometry(0.18, 12, 10);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, 1.55, 0);
        person.add(headMesh);

        // Nose on +Z face of head so facing direction is distinct from top-down
        const noseGeo = new THREE.ConeGeometry(0.045, 0.09, 8);
        noseGeo.rotateX(Math.PI / 2); // points +Z
        const noseMesh = new THREE.Mesh(noseGeo, skinMat);
        noseMesh.position.set(0, 1.55, 0.19);
        person.add(noseMesh);

        person.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            isWalking: false,
            isSitting: false,
            walkPhase: 0.0
        };

        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;
        const leftLeg = ud.leftLeg;
        const rightLeg = ud.rightLeg;
        const leftArm = ud.leftArm;
        const rightArm = ud.rightArm;
        if (!leftLeg || !rightLeg || !leftArm || !rightArm) return;

        if (ud.isSitting) {
            // Legs rotate -pi/2 at hip (feet forward)
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            // Arms drop to -pi/4
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            leftLeg.rotation.x = Math.sin(phase) * 0.6;
            rightLeg.rotation.x = -Math.sin(phase) * 0.6;
            leftArm.rotation.x = -Math.sin(phase) * 0.5;
            rightArm.rotation.x = Math.sin(phase) * 0.5;
        } else {
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftArm.rotation.x = 0;
            rightArm.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
