(function () {
    "use strict";

    var SHIRTS = [0x4f7cac, 0xc9635b, 0x7c9d62, 0xb078c0, 0xd1943c, 0x4c9e9b];
    var SKINS = [0xf0c7a4, 0xd99c73, 0xb97653, 0x8d5c42, 0xf4d7bd];
    var PANTS = [0x28354a, 0x41454e, 0x584d45, 0x263e52, 0x3d3f42];

    function pick(list, supplied) {
        return supplied === undefined ? list[Math.floor(Math.random() * list.length)] : supplied;
    }

    function makeMat(color) {
        return new THREE.MeshStandardMaterial({ color: color, roughness: 0.78, metalness: 0.02 });
    }

    function roundedPart(geometry, material, x, y, z) {
        var mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    function createPerson(options) {
        options = options || {};
        var bodyColor = pick(SHIRTS, options.bodyColor);
        var skinColor = pick(SKINS, options.skinColor);
        var legColor = pick(PANTS, options.legColor);
        var group = new THREE.Group();
        var bodyMat = makeMat(bodyColor);
        var skinMat = makeMat(skinColor);
        var pantsMat = makeMat(legColor);
        var shoeMat = makeMat(0x202128);
        var legGeo = new THREE.CylinderGeometry(0.115, 0.135, 0.72, 8);
        var armGeo = new THREE.CylinderGeometry(0.095, 0.105, 0.62, 8);
        var torsoGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.72, 10);
        var headGeo = new THREE.SphereGeometry(0.23, 12, 10);
        var handGeo = new THREE.SphereGeometry(0.105, 8, 7);
        var footGeo = new THREE.BoxGeometry(0.18, 0.12, 0.28);
        var noseGeo = new THREE.SphereGeometry(0.057, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        var side;
        var legPivot;
        var leg;
        var foot;
        var armPivot;
        var arm;
        var hand;

        for (side = -1; side <= 1; side += 2) {
            legPivot = new THREE.Group();
            legPivot.position.set(side * 0.13, 0.82, 0);
            leg = roundedPart(legGeo, pantsMat, 0, -0.36, 0);
            legPivot.add(leg);
            foot = roundedPart(footGeo, shoeMat, 0, -0.75, 0.055);
            legPivot.add(foot);
            group.add(legPivot);
            if (side < 0) group.userData.leftLeg = legPivot;
            else group.userData.rightLeg = legPivot;
        }

        group.add(roundedPart(torsoGeo, bodyMat, 0, 1.2, 0));
        group.add(roundedPart(headGeo, skinMat, 0, 1.77, 0));
        group.add(roundedPart(noseGeo, skinMat, 0, 1.77, 0.225));

        for (side = -1; side <= 1; side += 2) {
            armPivot = new THREE.Group();
            armPivot.position.set(side * 0.33, 1.47, 0);
            arm = roundedPart(armGeo, bodyMat, 0, -0.31, 0);
            armPivot.add(arm);
            hand = roundedPart(handGeo, skinMat, 0, -0.65, 0);
            armPivot.add(hand);
            group.add(armPivot);
            if (side < 0) group.userData.leftArm = armPivot;
            else group.userData.rightArm = armPivot;
        }

        group.userData.isWalking = false;
        group.userData.isSitting = false;
        group.userData.walkPhase = Math.random() * Math.PI * 2;
        group.userData.bodyColor = bodyColor;
        return group;
    }

    function animatePersonWalking(person, dt) {
        var data = person.userData;
        var legAmount = 0;
        var armAmount = 0;
        if (data.isSitting) {
            data.walkPhase = 0;
            if (data.leftLeg) data.leftLeg.rotation.x = -Math.PI / 2;
            if (data.rightLeg) data.rightLeg.rotation.x = -Math.PI / 2;
            if (data.leftArm) data.leftArm.rotation.x = -Math.PI / 4;
            if (data.rightArm) data.rightArm.rotation.x = -Math.PI / 4;
            return;
        }
        if (data.isWalking) {
            data.walkPhase += dt * 8;
            legAmount = Math.sin(data.walkPhase) * 0.6;
            armAmount = -Math.sin(data.walkPhase) * 0.5;
        }
        if (data.leftLeg) data.leftLeg.rotation.x = legAmount;
        if (data.rightLeg) data.rightLeg.rotation.x = -legAmount;
        if (data.leftArm) data.leftArm.rotation.x = armAmount;
        if (data.rightArm) data.rightArm.rotation.x = -armAmount;
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
}());
