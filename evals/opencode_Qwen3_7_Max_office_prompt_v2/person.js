(function() {
    const SHIRT_COLORS = [0x4a90e2, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e];
    const SKIN_COLORS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
    const PANTS_COLORS = [0x2c3e50, 0x34495e, 0x1a1a1a, 0x4a4a4a, 0x5d6d7e];

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor || SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
        const skinColor = opts.skinColor || SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)];
        const legColor = opts.legColor || PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];

        const group = new THREE.Group();
        group.userData.isWalking = false;
        group.userData.isSitting = false;
        group.userData.walkPhase = 0;

        const legMat = new THREE.MeshLambertMaterial({ color: legColor });
        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });

        const legGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
        const torsoGeom = new THREE.BoxGeometry(0.35, 0.5, 0.25);
        const headGeom = new THREE.SphereGeometry(0.18, 12, 12);
        const armGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8);
        const noseGeom = new THREE.SphereGeometry(0.05, 8, 8);

        const leftLegGroup = new THREE.Group();
        leftLegGroup.position.set(-0.1, 0.5, 0);
        const leftLeg = new THREE.Mesh(legGeom, legMat);
        leftLeg.position.y = -0.25;
        leftLegGroup.add(leftLeg);
        group.add(leftLegGroup);

        const rightLegGroup = new THREE.Group();
        rightLegGroup.position.set(0.1, 0.5, 0);
        const rightLeg = new THREE.Mesh(legGeom, legMat);
        rightLeg.position.y = -0.25;
        rightLegGroup.add(rightLeg);
        group.add(rightLegGroup);

        const torso = new THREE.Mesh(torsoGeom, bodyMat);
        torso.position.y = 1.0;
        group.add(torso);

        const leftArmGroup = new THREE.Group();
        leftArmGroup.position.set(-0.25, 1.2, 0);
        const leftArm = new THREE.Mesh(armGeom, skinMat);
        leftArm.position.y = -0.225;
        leftArmGroup.add(leftArm);
        group.add(leftArmGroup);

        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(0.25, 1.2, 0);
        const rightArm = new THREE.Mesh(armGeom, skinMat);
        rightArm.position.y = -0.225;
        rightArmGroup.add(rightArm);
        group.add(rightArmGroup);

        const head = new THREE.Mesh(headGeom, skinMat);
        head.position.y = 1.45;
        group.add(head);

        const nose = new THREE.Mesh(noseGeom, skinMat);
        nose.position.set(0, 1.45, 0.2);
        group.add(nose);

        group.userData.leftLeg = leftLegGroup;
        group.userData.rightLeg = rightLegGroup;
        group.userData.leftArm = leftArmGroup;
        group.userData.rightArm = rightArmGroup;

        return group;
    }

    function animatePersonWalking(person, dt) {
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
