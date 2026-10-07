/* person.js — person mesh factory + walk/sit animation.
 * No ES modules. Exposes window.createPerson and window.animatePersonWalking.
 */
(function () {
    "use strict";

    var SHIRT_PALETTE = [0x4f7cac, 0xd96c6c, 0x5f9e6e, 0xb07cc6, 0xcc8a4a, 0x4aa3a3, 0x8a6d9e, 0x7a6a55];
    var SKIN_PALETTE = [0xf0c8a8, 0xe0b090, 0xc98e6b, 0xa06a45, 0x8a5a35];
    var PANTS_PALETTE = [0x333a44, 0x4a4a55, 0x2f3a46, 0x5a4a3a, 0x3a3a5a];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function mat(color) {
        return new THREE.MeshLambertMaterial({ color: color });
    }

    // Feet sit at local y = 0. Structure bottom-to-top: legs -> torso -> head.
    // Each leg is a Group pivoting at the hip (origin at hip, cylinder hangs below).
    // Arms pivot the same way at the shoulder.
    function createPerson(opts) {
        opts = opts || {};
        var group = new THREE.Group();
        group.userData.isSitting = false;
        group.userData.isWalking = false;
        group.userData.walkPhase = Math.random() * Math.PI * 2;

        var shirt = mat(opts.bodyColor !== undefined ? opts.bodyColor : pick(SHIRT_PALETTE));
        var skin = mat(opts.skinColor !== undefined ? opts.skinColor : pick(SKIN_PALETTE));
        var pants = mat(opts.legColor !== undefined ? opts.legColor : pick(PANTS_PALETTE));

        var bodyScale = 0.9 + Math.random() * 0.2;

        // ---- Legs (pivot at hip, ~ at y=0.9 * bodyScale) ----
        var legGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.9, 10);
        var leftLeg = new THREE.Group();
        var rightLeg = new THREE.Group();
        var leftCyl = new THREE.Mesh(legGeo, pants);
        var rightCyl = new THREE.Mesh(legGeo, pants);
        // cylinder centered at origin -> translate down so top is at hip pivot
        leftCyl.position.y = -0.45;
        rightCyl.position.y = -0.45;
        leftLeg.add(leftCyl);
        rightLeg.add(rightCyl);
        leftLeg.position.set(-0.11, 0.9 * bodyScale, 0);
        rightLeg.position.set(0.11, 0.9 * bodyScale, 0);

        // ---- Torso ----
        var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.6, 12), shirt);
        torso.position.y = 1.2 * bodyScale;

        // ---- Arms (pivot at shoulder) ----
        var armGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.5, 8);
        var leftArm = new THREE.Group();
        var rightArm = new THREE.Group();
        var leftArmCyl = new THREE.Mesh(armGeo, skin);
        var rightArmCyl = new THREE.Mesh(armGeo, skin);
        leftArmCyl.position.y = -0.25;
        rightArmCyl.position.y = -0.25;
        leftArm.add(leftArmCyl);
        rightArm.add(rightArmCyl);
        leftArm.position.set(-0.32, 1.5 * bodyScale, 0);
        rightArm.position.set(0.32, 1.5 * bodyScale, 0);

        // ---- Head ----
        var head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
        head.position.y = 1.72 * bodyScale;

        // ---- Nose on +Z face ----
        var nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), skin);
        nose.position.set(0, 1.72 * bodyScale, 0.15);

        group.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, nose);

        group.userData.leftLeg = leftLeg;
        group.userData.rightLeg = rightLeg;
        group.userData.leftArm = leftArm;
        group.userData.rightArm = rightArm;
        group.userData.height = 1.85 * bodyScale;

        return group;
    }

    function animatePersonWalking(person, dt) {
        if (!person) return;
        var ud = person.userData;
        if (!ud.leftLeg) return; // defensive

        if (ud.isSitting) {
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            ud.isWalking = false;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            var s = Math.sin(ud.walkPhase);
            ud.leftLeg.rotation.x = s * 0.6;
            ud.rightLeg.rotation.x = -s * 0.6;
            ud.leftArm.rotation.x = -s * 0.5;
            ud.rightArm.rotation.x = s * 0.5;
        } else {
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
