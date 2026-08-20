/*
 * person.js - person mesh factory + per-frame walk/sit animation.
 *
 * Classic script: no import/export. Feet sit at local y = 0 (the
 * person's origin). Legs pivot at the hip, arms pivot at the shoulder,
 * so walking is a simple rotation.x tween at the pivot. A small
 * hemisphere nose on the +Z face of the head makes facing direction read
 * clearly from a top-down camera.
 */
(function () {
    "use strict";

    var SHIRT_COLORS = [
        0x5b7fb1, 0x9a5b8c, 0x5fa27a, 0xb1894f,
        0x7a6db1, 0xb15b5b, 0x4f9ab1, 0x8c864f
    ];
    var SKIN_COLORS = [0xf1c9a5, 0xe0ac7e, 0xc68954, 0x9c6b3f, 0x7a4f2a, 0xf7d7b5];
    var PANTS_COLORS = [0x2f3a4d, 0x3d3d46, 0x4d4436, 0x364d3d, 0x513a4d];

    function pickColor(paletteset) {
        return paletteset[Math.floor(Math.random() * paletteset.length)];
    }

    function makeLimbMesh(radius, length, color) {
        var geo = new THREE.CylinderGeometry(radius, radius * 0.85, length, 8);
        var mat = new THREE.MeshLambertMaterial({ color: color });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = -length / 2; // hang below the pivot
        return mesh;
    }

    function createPerson(opts) {
        opts = opts || {};
        var bodyColor = (typeof opts.bodyColor === "number") ? opts.bodyColor : pickColor(SHIRT_COLORS);
        var skinColor = (typeof opts.skinColor === "number") ? opts.skinColor : pickColor(SKIN_COLORS);
        var legColor = (typeof opts.legColor === "number") ? opts.legColor : pickColor(PANTS_COLORS);

        var group = new THREE.Group();

        // ---- legs (pivot at hip, hip height 0.85) ----
        var hipY = 0.85;
        var legLen = 0.8;
        var makeLeg = function (xOff) {
            var leg = new THREE.Group();
            leg.position.set(xOff, hipY, 0);
            leg.add(makeLimbMesh(0.09, legLen, legColor));
            var foot = new THREE.Mesh(
                new THREE.BoxGeometry(0.13, 0.07, 0.24),
                new THREE.MeshLambertMaterial({ color: 0x222222 })
            );
            foot.position.set(0, -legLen + 0.035, 0.05);
            leg.add(foot);
            group.add(leg);
            return leg;
        };
        var leftLeg = makeLeg(-0.11);
        var rightLeg = makeLeg(0.11);

        // ---- torso ----
        var torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.26, 0.62, 10),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = hipY + 0.31;
        group.add(torso);

        // ---- arms (pivot at shoulder) ----
        var shoulderY = hipY + 0.5;
        var armLen = 0.55;
        var makeArm = function (xOff) {
            var arm = new THREE.Group();
            arm.position.set(xOff, shoulderY, 0);
            arm.add(makeLimbMesh(0.055, armLen, bodyColor));
            var hand = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 8, 6),
                new THREE.MeshLambertMaterial({ color: skinColor })
            );
            hand.position.y = -armLen - 0.02;
            arm.add(hand);
            group.add(arm);
            return arm;
        };
        var leftArm = makeArm(-0.30);
        var rightArm = makeArm(0.30);

        // ---- head (+Z facing nose) ----
        var headY = hipY + 0.62 + 0.17;
        var head = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 12, 10),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = headY;
        group.add(head);

        var nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.rotation.x = Math.PI / 2; // dome faces +Z (the face direction)
        nose.position.set(0, headY - 0.01, 0.14);
        group.add(nose);

        group.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            walkPhase: 0,
            isWalking: false,
            isSitting: false
        };

        return group;
    }

    function animatePersonWalking(person, dt) {
        var ud = person && person.userData;
        if (!ud) return;
        var t = (typeof dt === "number" && dt > 0) ? dt : 0;
        if (ud.isSitting) {
            // Legs fold forward at the hip (feet toward where they face),
            // arms rest at a relaxed angle.
            ud.walkPhase = 0;
            if (ud.leftLeg) ud.leftLeg.rotation.x = -Math.PI / 2;
            if (ud.rightLeg) ud.rightLeg.rotation.x = -Math.PI / 2;
            if (ud.leftArm) ud.leftArm.rotation.x = -Math.PI / 4;
            if (ud.rightArm) ud.rightArm.rotation.x = -Math.PI / 4;
            return;
        }
        if (ud.isWalking) {
            ud.walkPhase = (ud.walkPhase || 0) + t * 8;
            var s = Math.sin(ud.walkPhase);
            if (ud.leftLeg) ud.leftLeg.rotation.x = s * 0.6;
            if (ud.rightLeg) ud.rightLeg.rotation.x = -s * 0.6;
            // Arms swing opposite the legs for a natural gait.
            if (ud.leftArm) ud.leftArm.rotation.x = -s * 0.5;
            if (ud.rightArm) ud.rightArm.rotation.x = s * 0.5;
        } else {
            ud.walkPhase = 0;
            if (ud.leftLeg) ud.leftLeg.rotation.x = 0;
            if (ud.rightLeg) ud.rightLeg.rotation.x = 0;
            if (ud.leftArm) ud.leftArm.rotation.x = 0;
            if (ud.rightArm) ud.rightArm.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
