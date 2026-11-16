(function () {
    const SHIRT_COLORS = [
        0x3b6ea5, 0xc0392b, 0x27ae60, 0x8e44ad,
        0xd35400, 0x16a085, 0x2c3e50, 0xe67e22,
        0x7f8c8d, 0x2980b9, 0x9b59b6, 0x1abc9c
    ];
    const SKIN_COLORS = [
        0xf5cba7, 0xe0ac69, 0xc68642, 0x8d5524, 0xfad7b8
    ];
    const PANT_COLORS = [
        0x2c3e50, 0x34495e, 0x1f2833, 0x4a4a4a, 0x5d4037, 0x37474f
    ];

    function pickColor(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    }

    function createPerson(options) {
        const opts = options || {};
        const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pickColor(SHIRT_COLORS);
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickColor(SKIN_COLORS);
        const legColor = opts.legColor !== undefined ? opts.legColor : pickColor(PANT_COLORS);

        const group = new THREE.Group();

        const legMat = new THREE.MeshLambertMaterial({ color: legColor });
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

        const legGeo = new THREE.CylinderGeometry(0.068, 0.06, 0.72, 8);
        const leftLeg = new THREE.Group();
        leftLeg.position.set(-0.10, 0.72, 0);
        const leftLegMesh = new THREE.Mesh(legGeo, legMat);
        leftLegMesh.position.y = -0.36;
        leftLeg.add(leftLegMesh);
        group.add(leftLeg);

        const rightLeg = new THREE.Group();
        rightLeg.position.set(0.10, 0.72, 0);
        const rightLegMesh = new THREE.Mesh(legGeo, legMat);
        rightLegMesh.position.y = -0.36;
        rightLeg.add(rightLegMesh);
        group.add(rightLeg);

        const torsoGeo = new THREE.BoxGeometry(0.36, 0.56, 0.20);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = 1.00;
        group.add(torso);

        const armGeo = new THREE.CylinderGeometry(0.052, 0.045, 0.50, 8);
        const leftArm = new THREE.Group();
        leftArm.position.set(-0.24, 1.24, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, bodyMat);
        leftArmMesh.position.y = -0.25;
        leftArm.add(leftArmMesh);
        group.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(0.24, 1.24, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, bodyMat);
        rightArmMesh.position.y = -0.25;
        rightArm.add(rightArmMesh);
        group.add(rightArm);

        const headGeo = new THREE.SphereGeometry(0.15, 12, 10);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = 1.45;
        group.add(head);

        const noseGeo = new THREE.SphereGeometry(0.042, 8, 6);
        const nose = new THREE.Mesh(noseGeo, skinMat);
        nose.position.set(0, 1.44, 0.15);
        group.add(nose);

        group.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            isWalking: false,
            isSitting: false,
            walkPhase: 0
        };

        return group;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;
        if (ud.isSitting) {
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const legSwing = Math.sin(ud.walkPhase) * 0.6;
            const armSwing = -Math.sin(ud.walkPhase) * 0.5;
            ud.leftLeg.rotation.x = legSwing;
            ud.rightLeg.rotation.x = -legSwing;
            ud.leftArm.rotation.x = armSwing;
            ud.rightArm.rotation.x = -armSwing;
        } else {
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
