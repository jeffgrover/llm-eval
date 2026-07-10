(function () {
    "use strict";

    var OFFICE_SHIRT_COLORS = [0x3976a8, 0xc45a4d, 0x6c8c55, 0xd09a42, 0x765c9c, 0x3c8d86, 0xa94f72];
    var OFFICE_SKIN_COLORS = [0xf3c9a5, 0xd99b73, 0xb8734f, 0x8b5438, 0x5c3527];
    var OFFICE_PANTS_COLORS = [0x26364a, 0x3b3b43, 0x5a493c, 0x283b35, 0x38405c];

    function officePalettePick(values) {
        return values[Math.floor(Math.random() * values.length)];
    }

    function officeLimbMaterial(color) {
        return new THREE.MeshStandardMaterial({ color: color, roughness: 0.76, metalness: 0.02 });
    }

    function officeMakePivotedLimb(length, radius, material, isLeg) {
        var pivot = new THREE.Group();
        var limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, length, 8), material);
        limb.position.y = -length * 0.5;
        limb.castShadow = false;
        pivot.add(limb);
        if (isLeg) {
            var shoe = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.65, 0.13, radius * 2.2), officeLimbMaterial(0x20252d));
            shoe.position.set(0, -length + 0.035, radius * 0.38);
            pivot.add(shoe);
        }
        return pivot;
    }

    function createPerson(options) {
        var personOptions = options || {};
        var bodyColor = personOptions.bodyColor === undefined ? officePalettePick(OFFICE_SHIRT_COLORS) : personOptions.bodyColor;
        var skinColor = personOptions.skinColor === undefined ? officePalettePick(OFFICE_SKIN_COLORS) : personOptions.skinColor;
        var legColor = personOptions.legColor === undefined ? officePalettePick(OFFICE_PANTS_COLORS) : personOptions.legColor;
        var person = new THREE.Group();
        var shirtMaterial = officeLimbMaterial(bodyColor);
        var skinMaterial = officeLimbMaterial(skinColor);
        var pantsMaterial = officeLimbMaterial(legColor);

        var leftLeg = officeMakePivotedLimb(0.72, 0.105, pantsMaterial, true);
        var rightLeg = officeMakePivotedLimb(0.72, 0.105, pantsMaterial, true);
        leftLeg.position.set(-0.14, 0.86, 0);
        rightLeg.position.set(0.14, 0.86, 0);
        person.add(leftLeg, rightLeg);

        var hips = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.28), pantsMaterial);
        hips.position.y = 0.88;
        person.add(hips);

        var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.68, 10), shirtMaterial);
        torso.position.y = 1.26;
        person.add(torso);

        var leftArm = officeMakePivotedLimb(0.62, 0.075, skinMaterial, false);
        var rightArm = officeMakePivotedLimb(0.62, 0.075, skinMaterial, false);
        leftArm.position.set(-0.36, 1.52, 0);
        rightArm.position.set(0.36, 1.52, 0);
        person.add(leftArm, rightArm);

        var head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 9), skinMaterial);
        head.position.y = 1.87;
        person.add(head);
        var hair = new THREE.Mesh(
            new THREE.SphereGeometry(0.252, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.46),
            officeLimbMaterial(officePalettePick([0x2c211c, 0x4a3327, 0x77563c, 0x1d2229, 0xb39767]))
        );
        hair.position.y = 1.91;
        person.add(hair);

        var nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), skinMaterial);
        nose.scale.set(0.8, 0.8, 1.15);
        nose.position.set(0, 1.87, 0.235);
        nose.rotation.x = Math.PI * 0.5;
        person.add(nose);

        person.userData.leftLeg = leftLeg;
        person.userData.rightLeg = rightLeg;
        person.userData.leftArm = leftArm;
        person.userData.rightArm = rightArm;
        person.userData.walkPhase = Math.random() * Math.PI * 2;
        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.baseFootY = 0;
        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData.leftLeg) {
            return;
        }
        var data = person.userData;
        if (data.isSitting) {
            data.walkPhase = 0;
            data.leftLeg.rotation.x = -Math.PI * 0.5;
            data.rightLeg.rotation.x = -Math.PI * 0.5;
            data.leftArm.rotation.x = -Math.PI * 0.25;
            data.rightArm.rotation.x = -Math.PI * 0.25;
            return;
        }
        if (data.isWalking) {
            data.walkPhase += dt * 8;
            var gait = Math.sin(data.walkPhase);
            data.leftLeg.rotation.x = gait * 0.6;
            data.rightLeg.rotation.x = -gait * 0.6;
            data.leftArm.rotation.x = -gait * 0.5;
            data.rightArm.rotation.x = gait * 0.5;
            return;
        }
        data.walkPhase = 0;
        data.leftLeg.rotation.x = 0;
        data.rightLeg.rotation.x = 0;
        data.leftArm.rotation.x = 0;
        data.rightArm.rotation.x = 0;
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
