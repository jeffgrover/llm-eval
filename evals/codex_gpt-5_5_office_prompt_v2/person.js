(function(root) {
    "use strict";

    const shirts = [0x2f80ed, 0xeb5757, 0x27ae60, 0xf2c94c, 0x9b51e0, 0x56ccf2, 0xff8a3d];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    const pants = [0x243447, 0x2f3640, 0x4b4b4b, 0x1f3a5f, 0x5d4037];

    function pick(list, value) {
        return value !== undefined ? value : list[Math.floor(Math.random() * list.length)];
    }

    function mat(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }

    function limbCylinder(radius, height, color) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), mat(color));
        m.position.y = -height / 2;
        return m;
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = pick(shirts, opts.bodyColor);
        const skinColor = pick(skins, opts.skinColor);
        const legColor = pick(pants, opts.legColor);
        const g = new THREE.Group();
        g.userData.walkPhase = 0;
        g.userData.isWalking = false;
        g.userData.isSitting = false;
        g.userData.baseYOffset = 0;

        const leftLeg = new THREE.Group();
        leftLeg.name = "leftLeg";
        leftLeg.position.set(-0.14, 0.9, 0);
        leftLeg.add(limbCylinder(0.075, 0.9, legColor));
        const rightLeg = new THREE.Group();
        rightLeg.name = "rightLeg";
        rightLeg.position.set(0.14, 0.9, 0);
        rightLeg.add(limbCylinder(0.075, 0.9, legColor));
        g.add(leftLeg, rightLeg);

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.72, 14), mat(bodyColor));
        torso.position.y = 1.22;
        g.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), mat(skinColor));
        head.position.y = 1.78;
        g.add(head);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(skinColor));
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 1.78, 0.23);
        g.add(nose);

        const leftArm = new THREE.Group();
        leftArm.name = "leftArm";
        leftArm.position.set(-0.34, 1.5, 0);
        leftArm.rotation.z = -0.15;
        leftArm.add(limbCylinder(0.055, 0.62, skinColor));
        const rightArm = new THREE.Group();
        rightArm.name = "rightArm";
        rightArm.position.set(0.34, 1.5, 0);
        rightArm.rotation.z = 0.15;
        rightArm.add(limbCylinder(0.055, 0.62, skinColor));
        g.add(leftArm, rightArm);

        g.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm };
        return g;
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
        limbs.leftLeg.rotation.x = 0;
        limbs.rightLeg.rotation.x = 0;
        limbs.leftArm.rotation.x = 0;
        limbs.rightArm.rotation.x = 0;
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(window);
