// person.js — person mesh factory + walk/sit animation.
// Exposes window.createPerson({...}) and window.animatePersonWalking(person, dt).
// Body is built bottom-to-top so the feet rest at local y = 0 (the group origin).
(function (root) {
    "use strict";

    // Small palettes so agents read as visually distinct at a glance.
    const SHIRT_COLORS = [
        0x3366cc, 0xcc4444, 0x44aa66, 0xddaa33, 0x8844aa,
        0x33aaaa, 0xdd7733, 0x556677, 0xbb4488, 0x668844,
    ];
    const SKIN_COLORS = [
        0xf1c39f, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbac, 0xa56b46,
    ];
    const PANT_COLORS = [
        0x222244, 0x445566, 0x333333, 0x554433, 0x224433, 0x663333,
    ];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Dimensions (metres). Feet at y=0, head near y=1.75.
    const LEG_LEN = 0.8;
    const LEG_R = 0.11;
    const HIP_Y = LEG_LEN;            // 0.8
    const TORSO_H = 0.7;
    const TORSO_Y = HIP_Y + TORSO_H / 2;   // 1.15
    const SHOULDER_Y = HIP_Y + TORSO_H - 0.05; // ~1.45
    const ARM_LEN = 0.6;
    const ARM_R = 0.07;
    const HEAD_R = 0.18;
    const HEAD_Y = HIP_Y + TORSO_H + HEAD_R + 0.04; // ~1.7

    // Build one limb as a Group whose origin is the pivot (hip/shoulder);
    // the cylinder hangs straight down so a rotation.x swing reads naturally.
    function makeLimb(length, radius, color, x, y) {
        const grp = new THREE.Group();
        grp.position.set(x, y, 0);
        const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
        const mat = new THREE.MeshLambertMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -length / 2; // hang below the pivot
        grp.add(mesh);
        return grp;
    }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor != null ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor != null ? opts.skinColor : pick(SKIN_COLORS);
        const legColor = opts.legColor != null ? opts.legColor : pick(PANT_COLORS);

        const person = new THREE.Group();

        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });

        // Torso
        const torsoGeo = new THREE.CylinderGeometry(0.22, 0.26, TORSO_H, 12);
        const torso = new THREE.Mesh(torsoGeo, shirtMat);
        torso.position.y = TORSO_Y;
        person.add(torso);

        // Head
        const headGeo = new THREE.SphereGeometry(HEAD_R, 16, 12);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = HEAD_Y;
        person.add(head);

        // Nose on the +Z face so facing direction reads from a top-down camera.
        const noseGeo = new THREE.SphereGeometry(HEAD_R * 0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, skinMat);
        nose.rotation.x = Math.PI / 2; // dome points +Z
        nose.position.set(0, HEAD_Y, HEAD_R * 0.92);
        person.add(nose);

        // Legs (own groups, pivot at hip)
        const legL = makeLimb(LEG_LEN, LEG_R, legColor, -0.12, HIP_Y);
        const legR = makeLimb(LEG_LEN, LEG_R, legColor, 0.12, HIP_Y);
        person.add(legL);
        person.add(legR);

        // Arms (own groups, pivot at shoulder)
        const armL = makeLimb(ARM_LEN, ARM_R, shirtMat.color.getHex(), -0.30, SHOULDER_Y);
        const armR = makeLimb(ARM_LEN, ARM_R, shirtMat.color.getHex(), 0.30, SHOULDER_Y);
        person.add(armL);
        person.add(armR);

        person.userData.legs = [legL, legR];
        person.userData.arms = [armL, armR];
        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.walkPhase = 0;
        person.userData.floorBaseY = 0; // tracked by sim for sit/stand height

        return person;
    }

    // Per-frame limb animation. Reads userData flags set by the sim.
    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        if (!ud || !ud.legs) return;
        const legs = ud.legs;
        const arms = ud.arms;

        if (ud.isSitting) {
            // Seated: thighs forward (feet out front), arms relaxed.
            legs[0].rotation.x = -Math.PI / 2;
            legs[1].rotation.x = -Math.PI / 2;
            arms[0].rotation.x = -Math.PI / 4;
            arms[1].rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }

        if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const s = Math.sin(ud.walkPhase);
            legs[0].rotation.x = s * 0.6;
            legs[1].rotation.x = -s * 0.6;
            arms[0].rotation.x = -s * 0.5;
            arms[1].rotation.x = s * 0.5;
            return;
        }

        // Idle: ease limbs back to neutral.
        legs[0].rotation.x = 0;
        legs[1].rotation.x = 0;
        arms[0].rotation.x = 0;
        arms[1].rotation.x = 0;
        ud.walkPhase = 0;
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
