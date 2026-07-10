(function personModule(root) {
    var PERSON_SHIRTS = [0x2e86ab, 0x7b61a8, 0xd96c52, 0x3e9b73, 0xc58b35, 0x4169a1];
    var PERSON_SKINS = [0xf2c6a0, 0xd99b72, 0x9f6447, 0x6f432e];
    var PERSON_PANTS = [0x26354a, 0x38465f, 0x514236, 0x273b32, 0x5b526e];

    function personPick(palette) {
        return palette[Math.floor(Math.random() * palette.length)];
    }

    function personMaterial(color, roughness) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness || 0.8,
            metalness: 0.03,
        });
    }

    function createPerson(options) {
        var settings = options || {};
        var bodyColor = settings.bodyColor || personPick(PERSON_SHIRTS);
        var skinColor = settings.skinColor || personPick(PERSON_SKINS);
        var legColor = settings.legColor || personPick(PERSON_PANTS);
        var person = new THREE.Group();
        person.name = "OfficePerson";
        person.userData.isWalking = false;
        person.userData.isSitting = false;
        person.userData.walkPhase = 0;
        person.userData.baseY = 0;
        person.userData.bodyHeight = 2.55;

        var shirtMaterial = personMaterial(bodyColor);
        var skinMaterial = personMaterial(skinColor);
        var pantsMaterial = personMaterial(legColor);

        var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.4), shirtMaterial);
        torso.position.y = 1.38;
        person.add(torso);

        var hipLeft = new THREE.Group();
        hipLeft.position.set(-0.18, 0.9, 0);
        var legLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.82, 8), pantsMaterial);
        legLeft.position.y = -0.41;
        hipLeft.add(legLeft);
        var shoeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.38), personMaterial(0x1f2025));
        shoeLeft.position.set(0, -0.84, 0.08);
        hipLeft.add(shoeLeft);
        person.add(hipLeft);

        var hipRight = new THREE.Group();
        hipRight.position.set(0.18, 0.9, 0);
        var legRight = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.82, 8), pantsMaterial);
        legRight.position.y = -0.41;
        hipRight.add(legRight);
        var shoeRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.38), personMaterial(0x1f2025));
        shoeRight.position.set(0, -0.84, 0.08);
        hipRight.add(shoeRight);
        person.add(hipRight);

        var head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skinMaterial);
        head.position.y = 2.45;
        person.add(head);
        var nose = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), skinMaterial);
        nose.position.set(0, 2.43, 0.255);
        nose.rotation.x = -Math.PI / 2;
        person.add(nose);

        var shoulderLeft = new THREE.Group();
        shoulderLeft.position.set(-0.4, 1.78, 0);
        var armLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.72, 8), shirtMaterial);
        armLeft.position.y = -0.35;
        shoulderLeft.add(armLeft);
        var handLeft = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), skinMaterial);
        handLeft.position.y = -0.76;
        shoulderLeft.add(handLeft);
        person.add(shoulderLeft);

        var shoulderRight = new THREE.Group();
        shoulderRight.position.set(0.4, 1.78, 0);
        var armRight = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.72, 8), shirtMaterial);
        armRight.position.y = -0.35;
        shoulderRight.add(armRight);
        var handRight = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), skinMaterial);
        handRight.position.y = -0.76;
        shoulderRight.add(handRight);
        person.add(shoulderRight);

        person.userData.leftLeg = hipLeft;
        person.userData.rightLeg = hipRight;
        person.userData.leftArm = shoulderLeft;
        person.userData.rightArm = shoulderRight;
        return person;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        var data = person.userData;
        var leftLeg = data.leftLeg;
        var rightLeg = data.rightLeg;
        var leftArm = data.leftArm;
        var rightArm = data.rightArm;
        if (!leftLeg || !rightLeg || !leftArm || !rightArm) return;
        if (data.isSitting) {
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            data.walkPhase = 0;
            return;
        }
        if (data.isWalking) {
            data.walkPhase += (dt || 0) * 8;
            var swing = Math.sin(data.walkPhase) * 0.6;
            leftLeg.rotation.x = swing;
            rightLeg.rotation.x = -swing;
            leftArm.rotation.x = -Math.sin(data.walkPhase) * 0.5;
            rightArm.rotation.x = Math.sin(data.walkPhase) * 0.5;
            return;
        }
        data.walkPhase = 0;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(window);
