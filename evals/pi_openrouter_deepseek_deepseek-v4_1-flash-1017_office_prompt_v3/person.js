/* person.js - simple primitive people with hip/shoulder pivots. */
(function () {
    "use strict";

    const SHIRT_COLORS = [0x3f7fbf, 0xc0504d, 0x4f9d69, 0x9b6bb3, 0xd08a3d, 0x5aa8a8, 0x8a8f98];
    const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa86b3c];
    const PANTS_COLORS = [0x30364a, 0x4a4035, 0x2f4a3a, 0x555b66, 0x3b3b48];

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function createPerson(options) {
        const opts = options || {};
        const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : pick(SKIN_COLORS);
        const legColor = opts.legColor !== undefined ? opts.legColor : pick(PANTS_COLORS);

        const person = new THREE.Group();
        person.name = "person";

        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const pantsMat = new THREE.MeshLambertMaterial({ color: legColor });
        const shoeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

        function makeLeg(side) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.13, 0.9, 0);
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.8, 8), pantsMat);
            thigh.position.y = -0.4;
            hip.add(thigh);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.32), shoeMat);
            foot.position.set(0, -0.835, 0.09);
            hip.add(foot);
            return hip;
        }

        function makeArm(side) {
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.34, 1.52, 0);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.64, 8), shirtMat);
            upper.position.y = -0.32;
            shoulder.add(upper);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skinMat);
            hand.position.y = -0.66;
            shoulder.add(hand);
            return shoulder;
        }

        const leftLeg = makeLeg(-1);
        const rightLeg = makeLeg(1);
        person.add(leftLeg, rightLeg);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), shirtMat);
        torso.position.y = 1.25;
        person.add(torso);

        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 8), skinMat);
        collar.position.y = 1.61;
        person.add(collar);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
        head.position.y = 1.82;
        person.add(head);

        const hair = new THREE.Mesh(
            new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
            new THREE.MeshLambertMaterial({ color: 0x3a2a1e })
        );
        hair.position.y = 1.87;
        hair.rotation.x = -0.25;
        person.add(hair);

        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            skinMat
        );
        nose.position.set(0, 1.8, 0.19);
        nose.rotation.x = Math.PI / 2;
        person.add(nose);

        const leftArm = makeArm(-1);
        const rightArm = makeArm(1);
        person.add(leftArm, rightArm);

        person.userData.leftLeg = leftLeg;
        person.userData.rightLeg = rightLeg;
        person.userData.leftArm = leftArm;
        person.userData.rightArm = rightArm;
        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.walkPhase = 0;

        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const data = person.userData;
        const leftLeg = data.leftLeg;
        const rightLeg = data.rightLeg;
        const leftArm = data.leftArm;
        const rightArm = data.rightArm;
        if (!leftLeg || !rightLeg) return;

        if (data.isSitting) {
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            if (leftArm) leftArm.rotation.x = -Math.PI / 4;
            if (rightArm) rightArm.rotation.x = -Math.PI / 4;
            data.walkPhase = 0;
            return;
        }

        if (data.isWalking) {
            data.walkPhase += dt * 8;
            const swing = Math.sin(data.walkPhase) * 0.6;
            leftLeg.rotation.x = swing;
            rightLeg.rotation.x = -swing;
            if (leftArm) leftArm.rotation.x = -swing * 0.82;
            if (rightArm) rightArm.rotation.x = swing * 0.82;
        } else {
            data.walkPhase = 0;
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            if (leftArm) leftArm.rotation.x = 0;
            if (rightArm) rightArm.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
