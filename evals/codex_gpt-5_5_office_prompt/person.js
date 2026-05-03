(function () {
    const shirts = [0x4f86f7, 0xe66a6a, 0x55aa77, 0xe6b655, 0x9a74d6, 0x33a6a6, 0xd98245];
    const skins = [0xffd0a6, 0xc98b5f, 0x8d5524, 0xf1c27d, 0x6f4e37];
    const pants = [0x27364d, 0x343434, 0x4c5c76, 0x5b4a42, 0x20302a];

    function pick(list, fallback) {
        return fallback === undefined ? list[Math.floor(Math.random() * list.length)] : fallback;
    }

    function mat(color) {
        return new THREE.MeshStandardMaterial({ color: color, roughness: 0.75 });
    }

    function limb(radius, length, color) {
        const g = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, length, 10), mat(color));
        mesh.position.y = -length / 2;
        g.add(mesh);
        return g;
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = pick(shirts, opts.bodyColor);
        const skinColor = pick(skins, opts.skinColor);
        const legColor = pick(pants, opts.legColor);
        const group = new THREE.Group();
        group.userData.walkPhase = Math.random() * Math.PI * 2;
        group.userData.isWalking = false;
        group.userData.isSitting = false;

        const leftLeg = limb(0.09, 0.72, legColor);
        const rightLeg = limb(0.09, 0.72, legColor);
        leftLeg.position.set(-0.15, 0.72, 0);
        rightLeg.position.set(0.15, 0.72, 0);
        group.add(leftLeg, rightLeg);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.34), mat(bodyColor));
        torso.position.y = 1.12;
        group.add(torso);

        const leftArm = limb(0.065, 0.62, skinColor);
        const rightArm = limb(0.065, 0.62, skinColor);
        leftArm.position.set(-0.43, 1.48, 0);
        rightArm.position.set(0.43, 1.48, 0);
        group.add(leftArm, rightArm);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), mat(skinColor));
        head.scale.y = 1.08;
        head.position.y = 1.78;
        group.add(head);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(skinColor));
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 1.79, 0.205);
        group.add(nose);

        group.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm };
        return group;
    }

    function animatePersonWalking(person, dt) {
        const limbs = person.userData.limbs;
        if (!limbs) return;
        if (person.userData.isSitting) {
            person.userData.walkPhase = 0;
            limbs.leftLeg.rotation.x = -Math.PI / 2;
            limbs.rightLeg.rotation.x = -Math.PI / 2;
            limbs.leftArm.rotation.x = -Math.PI / 4;
            limbs.rightArm.rotation.x = -Math.PI / 4;
            return;
        }
        if (person.userData.isWalking) {
            person.userData.walkPhase = (person.userData.walkPhase || 0) + dt * 8;
            const s = Math.sin(person.userData.walkPhase);
            limbs.leftLeg.rotation.x = s * 0.6;
            limbs.rightLeg.rotation.x = -s * 0.6;
            limbs.leftArm.rotation.x = -s * 0.5;
            limbs.rightArm.rotation.x = s * 0.5;
            return;
        }
        person.userData.walkPhase = 0;
        limbs.leftLeg.rotation.x = limbs.rightLeg.rotation.x = 0;
        limbs.leftArm.rotation.x = limbs.rightArm.rotation.x = 0;
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
