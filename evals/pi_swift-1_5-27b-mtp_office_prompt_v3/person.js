/*
 * person.js - person mesh factory + walk/sit animation (browser globals).
 * No ES modules. Feet sit at local y=0 (group origin).
 */
(function () {
    "use strict";

    var SHIRT_COLORS = [0x4f7fd9, 0xd94f5e, 0x55b36b, 0xe0a832, 0x8e6fc8, 0x3fb6b0, 0xc46b3f, 0x6079a8];
    var SKIN_COLORS = [0xf2c9a0, 0xe0a878, 0xc98d5e, 0x9c6b43, 0x7a4e2e, 0xf7d7b5];
    var LEG_COLORS = [0x2f3640, 0x4a4e69, 0x5c4a3a, 0x3a5a40, 0x6d597a, 0x2b2d33];

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(opts) {
        opts = opts || {};
        var bodyColor = opts.bodyColor !== undefined ? opts.bodyColor : pick(SHIRT_COLORS);
        var skinColor = opts.skinColor !== undefined ? opts.skinColor : pick(SKIN_COLORS);
        var legColor = opts.legColor !== undefined ? opts.legColor : pick(LEG_COLORS);

        var g = new THREE.Group();

        var skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        var shirtMat = new THREE.MeshLambertMaterial({ color: bodyColor });
        var legMat = new THREE.MeshLambertMaterial({ color: legColor });

        // --- Legs: pivot at hip (group origin at hip), cylinder hangs below.
        // Hip height 0.52, leg length 0.5.
        var hipY = 0.52;
        var legLen = 0.5;
        function makeLeg(side) {
            var leg = new THREE.Group();
            var cyl = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.08, legLen, 8),
                legMat
            );
            cyl.position.y = -legLen / 2;
            leg.add(cyl);
            // small foot
            var foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.24), legMat);
            foot.position.set(0, -legLen + 0.03, 0.06);
            leg.add(foot);
            leg.position.set(0.12 * side, hipY, 0);
            return leg;
        }
        var legL = makeLeg(-1);
        var legR = makeLeg(1);
        g.add(legL, legR);

        // --- Torso
        var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.5, 10), shirtMat);
        torso.position.y = hipY + 0.27;
        g.add(torso);

        // --- Arms: pivot at shoulder
        var armLen = 0.42;
        function makeArm(side) {
            var arm = new THREE.Group();
            var a = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, armLen, 8), shirtMat);
            a.position.y = -armLen / 2;
            arm.add(a);
            var hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
            hand.position.y = -armLen;
            arm.add(hand);
            arm.position.set(0.27 * side, hipY + 0.44, 0);
            return arm;
        }
        var armL = makeArm(-1);
        var armR = makeArm(1);
        g.add(armL, armR);

        // --- Head
        var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), skinMat);
        head.position.y = hipY + 0.63;
        g.add(head);

        // --- Nose: small hemisphere on the +Z face of the head (facing marker)
        var nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            skinMat
        );
        nose.rotation.x = Math.PI / 2; // dome points +Z
        nose.position.set(0, hipY + 0.65, 0.16);
        g.add(nose);

        g.userData = {
            legL: legL, legR: legR, armL: armL, armR: armR,
            walkPhase: 0,
            isWalking: false,
            isSitting: false
        };

        return g;
    }

    function animatePersonWalking(person, dt) {
        var ud = person.userData;
        if (ud.isSitting) {
            ud.legL.rotation.x = -Math.PI / 2;
            ud.legR.rotation.x = -Math.PI / 2;
            ud.armL.rotation.x = -Math.PI / 4;
            ud.armR.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            var swing = Math.sin(ud.walkPhase) * 0.6;
            ud.legL.rotation.x = swing;
            ud.legR.rotation.x = -swing;
            ud.armL.rotation.x = -Math.sin(ud.walkPhase) * 0.5;
            ud.armR.rotation.x = Math.sin(ud.walkPhase) * 0.5;
        } else {
            ud.legL.rotation.x = 0;
            ud.legR.rotation.x = 0;
            ud.armL.rotation.x = 0;
            ud.armR.rotation.x = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
