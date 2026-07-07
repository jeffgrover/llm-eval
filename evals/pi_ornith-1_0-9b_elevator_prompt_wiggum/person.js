(function () {
    "use strict";

    function createPerson(color) {
        var group = new THREE.Group();

        // --- Head (sphere, yellow) ---
        var headGeo = new THREE.SphereGeometry(0.25, 16, 16);
        var headMat = new THREE.MeshPhongMaterial({ color: 0xffffcc });
        var head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.3;
        group.add(head);

        // --- Torso (box) ---
        var torsoGeo = new THREE.BoxGeometry(0.4, 0.6, 0.25);
        var torsoMat = new THREE.MeshPhongMaterial({ color: color || 0xaaaaaa });
        var torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.7;
        group.add(torso);

        // --- Left Arm (arm hanging down) ---
        var armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
        var armMat = new THREE.MeshPhongMaterial({ color: 0xdddddd });
        var leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.3, 0.7, 0);
        group.add(leftArm);

        // --- Right Arm (arm hanging down) ---
        var rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.3, 0.7, 0);
        group.add(rightArm);

        // --- Left Leg ---
        var leftLegGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        var legMat = new THREE.MeshPhongMaterial({ color: 0x333344 });
        var leftLeg = new THREE.Mesh(leftLegGeo, legMat);
        leftLeg.position.y = -0.2;
        group.add(leftLeg);

        // --- Right Leg ---
        var rightLeg = new THREE.Mesh(leftLegGeo, legMat);
        rightLeg.position.set(0, -0.2, 0);
        group.add(rightLeg);

        // Position feet at local y = 0 (torso center y=0.7, legs extend down from there)
        // The group's origin is the feet level now since we offset everything above
        group.position.y = -0.3;

        // Store leg references in userData
        group.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            isWalking: false
        };

        return group;
    }

    window.createPerson = createPerson;
})();
