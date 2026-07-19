// person.js — person mesh factory + walk/sit animation.
// Exposes window.createPerson and window.animatePersonWalking.
// Classic script: no imports/exports; THREE comes from the global scope.

(function () {
    "use strict";

    const SHIRT_PALETTE = [0xcc4444, 0x4466cc, 0x44aa55, 0xcc8833, 0x8855cc, 0x33aaaa, 0xaa4488, 0x778899];
    const SKIN_PALETTE = [0xf2cba6, 0xd9a06b, 0xa9714b, 0x7a4f31, 0xeed3b8];
    const PANTS_PALETTE = [0x333a47, 0x55585e, 0x3d2f26, 0x26354a, 0x444444];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Dimensions (feet at local y=0). The hip pivot sits at 0.80 so that a
    // ~0.35 sit-drop lands the hips at ~0.45 — chair seat height.
    const LEG_LEN = 0.80;
    const LEG_R = 0.085;
    const TORSO_H = 0.62;
    const TORSO_RTOP = 0.21;
    const TORSO_RBOT = 0.26;
    const HEAD_R = 0.165;
    const ARM_LEN = 0.5;
    const ARM_R = 0.06;

    const HIP_Y = LEG_LEN;                       // hip pivot height
    const TORSO_Y = HIP_Y + TORSO_H / 2;         // torso center
    const SHOULDER_Y = HIP_Y + TORSO_H - 0.06;   // arm pivot height
    const HEAD_Y = HIP_Y + TORSO_H + HEAD_R + 0.04;

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pick(SHIRT_PALETTE);
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : pick(SKIN_PALETTE);
        const legColor = opts.legColor !== undefined ? opts.legColor : pick(PANTS_PALETTE);

        const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const legMat = new THREE.MeshLambertMaterial({ color: legColor });

        const person = new THREE.Group();

        // --- legs: each a group pivoting at the hip, cylinder hanging below ---
        function makeLeg(xOff) {
            const g = new THREE.Group();
            g.position.set(xOff, HIP_Y, 0);
            const geo = new THREE.CylinderGeometry(LEG_R, LEG_R, LEG_LEN, 8);
            const mesh = new THREE.Mesh(geo, legMat);
            mesh.position.y = -LEG_LEN / 2;   // hang below the hip pivot
            g.add(mesh);
            return g;
        }
        const leftLeg = makeLeg(-0.11);
        const rightLeg = makeLeg(0.11);
        person.add(leftLeg);
        person.add(rightLeg);

        // --- torso ---
        const torsoGeo = new THREE.CylinderGeometry(TORSO_RTOP, TORSO_RBOT, TORSO_H, 10);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.y = TORSO_Y;
        person.add(torso);

        // --- arms: pivot at the shoulder, cylinder hanging below ---
        function makeArm(xOff) {
            const g = new THREE.Group();
            g.position.set(xOff, SHOULDER_Y, 0);
            const geo = new THREE.CylinderGeometry(ARM_R, ARM_R, ARM_LEN, 8);
            const mesh = new THREE.Mesh(geo, bodyMat);
            mesh.position.y = -ARM_LEN / 2;
            g.add(mesh);
            return g;
        }
        const leftArm = makeArm(-(TORSO_RTOP + ARM_R + 0.03));
        const rightArm = makeArm(TORSO_RTOP + ARM_R + 0.03);
        person.add(leftArm);
        person.add(rightArm);

        // --- head ---
        const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 12, 10), skinMat);
        head.position.y = HEAD_Y;
        person.add(head);

        // nose: small hemisphere on the +Z face so facing reads top-down
        const noseGeo = new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, skinMat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, HEAD_Y, HEAD_R - 0.01);
        person.add(nose);

        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.walkPhase = 0;
        person.userData.limbs = {
            leftLeg: leftLeg, rightLeg: rightLeg,
            leftArm: leftArm, rightArm: rightArm
        };
        return person;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud || !ud.limbs) return;
        const L = ud.limbs;
        if (ud.isSitting) {
            // seated: legs rotate forward at the hip, arms drop, phase resets
            L.leftLeg.rotation.x = -Math.PI / 2;
            L.rightLeg.rotation.x = -Math.PI / 2;
            L.leftArm.rotation.x = -Math.PI / 4;
            L.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const s = Math.sin(ud.walkPhase);
            L.leftLeg.rotation.x = s * 0.6;
            L.rightLeg.rotation.x = -s * 0.6;
            L.leftArm.rotation.x = -s * 0.5;   // arms swing opposite the legs
            L.rightArm.rotation.x = s * 0.5;
        } else {
            L.leftLeg.rotation.x = 0;
            L.rightLeg.rotation.x = 0;
            L.leftArm.rotation.x = 0;
            L.rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
