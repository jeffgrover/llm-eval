// person.js — person mesh factory + walk/sit animation (global on window)
(function (root) {
    "use strict";
    const THREE = root.THREE;

    const SHIRT_COLORS = [0x4a6fa5, 0xb5651d, 0x2a9d8f, 0xe76f51, 0x6a4c93,
        0x8d99ae, 0x283618, 0xbc4749, 0x386641, 0x5e548e, 0xa5a58d];
    const SKIN_COLORS = [0xf1c27d, 0xffdbac, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0bd];
    const PANTS_COLORS = [0x2b2d42, 0x3d405b, 0x1d3557, 0x4a4e69, 0x22223b];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function createPerson(opts) {
        opts = opts || {};
        const bodyColor = opts.bodyColor != null ? opts.bodyColor : pick(SHIRT_COLORS);
        const skinColor = opts.skinColor != null ? opts.skinColor : pick(SKIN_COLORS);
        const legColor = opts.legColor != null ? opts.legColor : pick(PANTS_COLORS);

        const group = new THREE.Group();
        group.userData = {
            isWalking: false,
            isSitting: false,
            walkPhase: 0
        };

        // Materials
        const shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const pantsMat = new THREE.MeshLambertMaterial({ color: legColor });
        const shoeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

        // Dimensions
        const legLen = 0.85, torsoLen = 0.75, headR = 0.22;
        const hipY = legLen;          // hips at top of legs
        const shoulderY = hipY + torsoLen;
        const headY = shoulderY + headR + 0.05;

        // Legs (pivot at hip, cylinder hangs below)
        const legGeo = new THREE.CylinderGeometry(0.09, 0.08, legLen, 8);
        legGeo.translate(0, -legLen / 2, 0); // pivot at top
        const shoeGeo = new THREE.BoxGeometry(0.16, 0.1, 0.28);
        shoeGeo.translate(0, -legLen + 0.05, 0.06);

        const legL = new THREE.Group();
        legL.position.set(-0.13, hipY, 0);
        const legLMesh = new THREE.Mesh(legGeo, pantsMat);
        legL.add(legLMesh);
        const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
        legL.add(shoeL);
        group.add(legL);

        const legR = new THREE.Group();
        legR.position.set(0.13, hipY, 0);
        const legRMesh = new THREE.Mesh(legGeo, pantsMat);
        legR.add(legRMesh);
        const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
        legR.add(shoeR);
        group.add(legR);

        // Torso
        const torsoGeo = new THREE.CylinderGeometry(0.22, 0.26, torsoLen, 10);
        const torso = new THREE.Mesh(torsoGeo, shirtMat);
        torso.position.set(0, hipY + torsoLen / 2, 0);
        group.add(torso);

        // Arms (pivot at shoulder, hang down)
        const armLen = 0.6;
        const armGeo = new THREE.CylinderGeometry(0.06, 0.07, armLen, 8);
        armGeo.translate(0, -armLen / 2, 0);
        const armL = new THREE.Group();
        armL.position.set(-0.28, shoulderY, 0);
        armL.add(new THREE.Mesh(armGeo, shirtMat));
        group.add(armL);
        const armR = new THREE.Group();
        armR.position.set(0.28, shoulderY, 0);
        armR.add(new THREE.Mesh(armGeo, shirtMat));
        group.add(armR);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 12, 10), skinMat);
        head.position.set(0, headY, 0);
        group.add(head);

        // Nose on +Z face
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
        nose.position.set(0, headY, headR);
        nose.scale.z = 0.6;
        group.add(nose);

        group.userData.legs = [legL, legR];
        group.userData.arms = [armL, armR];
        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        const legs = ud.legs || [];
        const arms = ud.arms || [];
        if (ud.isSitting) {
            legs.forEach(function (l) { l.rotation.x = -Math.PI / 2; });
            arms.forEach(function (a) { a.rotation.x = -Math.PI / 4; });
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const s = Math.sin(ud.walkPhase);
            legs[0].rotation.x = s * 0.6;
            legs[1].rotation.x = -s * 0.6;
            arms[0].rotation.x = -s * 0.5;
            arms[1].rotation.x = s * 0.5;
        } else {
            legs.forEach(function (l) { l.rotation.x = 0; });
            arms.forEach(function (a) { a.rotation.x = 0; });
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
