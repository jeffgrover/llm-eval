/* person.js — person mesh factory + walk/sit animation */

(function (root) {
    const SHIRT_PALETTE = [
        0x5b8c5a, 0x8c5a5a, 0x5a5a8c, 0x8c7a5a, 0x6a5a8c, 0x5a8c8c, 0x8c6a8c
    ];
    const SKIN_PALETTE = [
        0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf1c27d
    ];
    const PANTS_PALETTE = [
        0x3a3a4a, 0x4a3a3a, 0x2f4f4f, 0x4a4a4a, 0x5a4a3a
    ];

    function sample(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createLimb(radiusTop, radiusBottom, height, color, yOffset, name) {
        const group = new root.THREE.Group();
        group.name = name;
        const geo = new root.THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12);
        const mat = new root.THREE.MeshLambertMaterial({ color: color });
        const mesh = new root.THREE.Mesh(geo, mat);
        mesh.position.y = -height / 2 + yOffset;
        group.add(mesh);
        return { group, mesh };
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor || sample(SHIRT_PALETTE);
        const skinColor = opts.skinColor || sample(SKIN_PALETTE);
        const legColor = opts.legColor || sample(PANTS_PALETTE);

        const person = new root.THREE.Group();
        person.name = "Person";
        person.userData = {
            bodyColor, skinColor, legColor,
            isSitting: false, isWalking: false, walkPhase: 0
        };

        const legH = 0.9;
        const legR = 0.11;
        const leftLeg = createLimb(legR, legR * 0.85, legH, legColor, 0, "leftLeg");
        const rightLeg = createLimb(legR, legR * 0.85, legH, legColor, 0, "rightLeg");
        leftLeg.group.position.set(-0.16, legH, 0);
        rightLeg.group.position.set(0.16, legH, 0);
        person.add(leftLeg.group);
        person.add(rightLeg.group);
        person.userData.leftLeg = leftLeg.group;
        person.userData.rightLeg = rightLeg.group;

        const torsoW = 0.42;
        const torsoH = 0.65;
        const torsoD = 0.25;
        const torso = new root.THREE.Mesh(
            new root.THREE.BoxGeometry(torsoW, torsoH, torsoD),
            new root.THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = legH + torsoH / 2;
        torso.name = "torso";
        person.add(torso);

        const headR = 0.2;
        const head = new root.THREE.Mesh(
            new root.THREE.SphereGeometry(headR, 16, 16),
            new root.THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = legH + torsoH + headR;
        head.name = "head";
        person.add(head);

        const nose = new root.THREE.Mesh(
            new root.THREE.SphereGeometry(0.06, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
            new root.THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.position.set(0, legH + torsoH + headR, headR * 0.75);
        nose.rotation.x = -Math.PI / 2;
        nose.name = "nose";
        person.add(nose);

        const armH = 0.62;
        const armR = 0.08;
        const leftArm = createLimb(armR, armR * 0.75, armH, bodyColor, 0, "leftArm");
        const rightArm = createLimb(armR, armR * 0.75, armH, bodyColor, 0, "rightArm");
        leftArm.group.position.set(-(torsoW / 2 + armR), legH + torsoH - 0.08, 0);
        rightArm.group.position.set(torsoW / 2 + armR, legH + torsoH - 0.08, 0);
        person.add(leftArm.group);
        person.add(rightArm.group);
        person.userData.leftArm = leftArm.group;
        person.userData.rightArm = rightArm.group;

        person.userData.parts = [leftLeg.group, rightLeg.group, leftArm.group, rightArm.group];
        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;
        const legs = [ud.leftLeg, ud.rightLeg];
        const arms = [ud.leftArm, ud.rightArm];

        if (ud.isSitting) {
            legs[0].rotation.x = -Math.PI / 2;
            legs[1].rotation.x = -Math.PI / 2;
            arms[0].rotation.x = -Math.PI / 4;
            arms[1].rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            legs[0].rotation.x = Math.sin(phase) * 0.6;
            legs[1].rotation.x = Math.sin(phase + Math.PI) * 0.6;
            arms[0].rotation.x = -Math.sin(phase) * 0.5;
            arms[1].rotation.x = -Math.sin(phase + Math.PI) * 0.5;
        } else {
            legs[0].rotation.x = 0;
            legs[1].rotation.x = 0;
            arms[0].rotation.x = 0;
            arms[1].rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
