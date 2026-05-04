(function() {
    const SHIRT_COLORS = [0xcc4444, 0x44cc44, 0x4444cc, 0xcc8844, 0xcc44cc, 0x44cccc, 0xcccc44, 0x4466cc];
    const SKIN_COLORS = [0xf5d0a9, 0xe0ac69, 0x8d5524, 0xc68642, 0xf1c27d, 0xe0b090];
    const PANT_COLORS = [0x333333, 0x444466, 0x665544, 0x223344, 0x554433, 0x664444];

    function randPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function createPerson({bodyColor, skinColor, legColor} = {}) {
        const group = new THREE.Group();
        const sc = skinColor !== undefined ? skinColor : randPick(SKIN_COLORS);
        const bc = bodyColor !== undefined ? bodyColor : randPick(SHIRT_COLORS);
        const lc = legColor !== undefined ? legColor : randPick(PANT_COLORS);

        // Legs (pivot at hip, cylinder hangs below)
        const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.85, 8);
        const legMat = new THREE.MeshLambertMaterial({ color: lc });
        const leftLegGroup = new THREE.Group();
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.y = -0.425;
        leftLegGroup.add(leftLeg);
        leftLegGroup.position.set(-0.14, 0.85, 0);
        group.add(leftLegGroup);

        const rightLegGroup = new THREE.Group();
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.y = -0.425;
        rightLegGroup.add(rightLeg);
        rightLegGroup.position.set(0.14, 0.85, 0);
        group.add(rightLegGroup);

        // Torso
        const torsoGeo = new THREE.BoxGeometry(0.48, 0.65, 0.28);
        const torsoMat = new THREE.MeshLambertMaterial({ color: bc });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 1.35;
        group.add(torso);

        // Head
        const headGeo = new THREE.BoxGeometry(0.28, 0.32, 0.3);
        const headMat = new THREE.MeshLambertMaterial({ color: sc });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.84;
        group.add(head);

        // Nose (hemisphere on +Z face)
        const noseGeo = new THREE.SphereGeometry(0.06, 8, 8, 0, Math.PI, 0, Math.PI/2);
        const noseMat = new THREE.MeshLambertMaterial({ color: sc });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.rotation.x = -Math.PI/2;
        nose.position.set(0, 1.84, 0.16);
        group.add(nose);

        // Arms (pivot at shoulder)
        const armGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8);
        const armMat = new THREE.MeshLambertMaterial({ color: bc });
        const leftArmGroup = new THREE.Group();
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.y = -0.35;
        leftArmGroup.add(leftArm);
        leftArmGroup.position.set(-0.32, 1.58, 0);
        group.add(leftArmGroup);

        const rightArmGroup = new THREE.Group();
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.y = -0.35;
        rightArmGroup.add(rightArm);
        rightArmGroup.position.set(0.32, 1.58, 0);
        group.add(rightArmGroup);

        group.userData = {
            leftLeg: leftLegGroup, rightLeg: rightLegGroup,
            leftArm: leftArmGroup, rightArm: rightArmGroup,
            isSitting: false, isWalking: false, walkPhase: 0
        };
        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud) return;
        const ll = ud.leftLeg, rl = ud.rightLeg, la = ud.leftArm, ra = ud.rightArm;
        if (ud.isSitting) {
            ll.rotation.x = -Math.PI / 2;
            rl.rotation.x = -Math.PI / 2;
            la.rotation.x = -Math.PI / 4;
            ra.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            ll.rotation.x = Math.sin(phase) * 0.6;
            rl.rotation.x = -Math.sin(phase) * 0.6;
            la.rotation.x = -Math.sin(phase) * 0.5;
            ra.rotation.x = Math.sin(phase) * 0.5;
        } else {
            ll.rotation.x = 0; rl.rotation.x = 0;
            la.rotation.x = 0; ra.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
