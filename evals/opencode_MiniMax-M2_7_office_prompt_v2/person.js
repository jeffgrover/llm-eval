/**
 * Person mesh factory + walk/sit animation.
 * Each person is a THREE.Group with legs, torso, head, arms.
 */
(function(root) {
    'use strict';

    const SHIRT_COLORS = [0x3366cc, 0xcc3333, 0x33cc33, 0xcc6633, 0x9933cc, 0x33cccc, 0xcccc33, 0xcc3399];
    const SKIN_COLORS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdb58];
    const PANTS_COLORS = [0x222222, 0x333344, 0x443333, 0x334433, 0x444455, 0x3d3d5c];

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(options = {}) {
        options = options || {};
        const bodyColor = options.bodyColor || randomFrom(SHIRT_COLORS);
        const skinColor = options.skinColor || randomFrom(SKIN_COLORS);
        const legColor = options.legColor || randomFrom(PANTS_COLORS);

        const group = new THREE.Group();
        group.userData.isWalking = false;
        group.userData.isSitting = false;
        group.userData.walkPhase = 0;
        group.userData.legColor = legColor;
        group.userData.bodyColor = bodyColor;

        const legMat = new THREE.MeshLambertMaterial({ color: legColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });

        const leftLegGroup = new THREE.Group();
        leftLegGroup.position.set(-0.13, 0.9, 0);
        const leftLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.85, 8),
            legMat
        );
        leftLeg.position.y = -0.425;
        leftLegGroup.add(leftLeg);
        group.add(leftLegGroup);
        group.userData.leftLeg = leftLegGroup;

        const rightLegGroup = new THREE.Group();
        rightLegGroup.position.set(0.13, 0.9, 0);
        const rightLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.85, 8),
            legMat
        );
        rightLeg.position.y = -0.425;
        rightLegGroup.add(rightLeg);
        group.add(rightLegGroup);
        group.userData.rightLeg = rightLegGroup;

        const leftArmGroup = new THREE.Group();
        leftArmGroup.position.set(-0.28, 1.6, 0);
        const leftArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
            shirtMat
        );
        leftArm.position.y = -0.35;
        leftArmGroup.add(leftArm);
        group.add(leftArmGroup);
        group.userData.leftArm = leftArmGroup;

        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set(0.28, 1.6, 0);
        const rightArm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
            shirtMat
        );
        rightArm.position.y = -0.35;
        rightArmGroup.add(rightArm);
        group.add(rightArmGroup);
        group.userData.rightArm = rightArmGroup;

        const torsoGroup = new THREE.Group();
        torsoGroup.position.y = 0.95;
        const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.18, 0.7, 10),
            shirtMat
        );
        torso.position.y = 0.35;
        torsoGroup.add(torso);
        group.add(torsoGroup);

        const neckGroup = new THREE.Group();
        neckGroup.position.y = 1.73;
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 12, 10),
            skinMat
        );
        head.position.y = 0.12;
        neckGroup.add(head);

        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 6, 5),
            skinMat
        );
        nose.position.set(0, 0.1, 0.22);
        neckGroup.add(nose);

        group.add(neckGroup);

        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        const leftLeg = ud.leftLeg;
        const rightLeg = ud.rightLeg;
        const leftArm = ud.leftArm;
        const rightArm = ud.rightArm;

        if (!leftLeg || !rightLeg) return;

        if (ud.isSitting) {
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            if (leftArm) leftArm.rotation.x = -Math.PI / 4;
            if (rightArm) rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }

        if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            const legSwing = Math.sin(phase) * 0.6;
            const armSwing = -Math.sin(phase) * 0.5;

            leftLeg.rotation.x = legSwing;
            rightLeg.rotation.x = -legSwing;
            if (leftArm) leftArm.rotation.x = armSwing;
            if (rightArm) rightArm.rotation.x = -armSwing;
        } else {
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            if (leftArm) leftArm.rotation.x = 0;
            if (rightArm) rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;

})(typeof window !== 'undefined' ? window : globalThis);
