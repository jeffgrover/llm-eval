(function(root) {
    function createPerson(options) {
        options = options || {};
        var bodyColor = options.bodyColor || getRandomShirt();
        var skinColor = options.skinColor || getRandomSkin();
        var legColor = options.legColor || getRandomPants();

        var person = new THREE.Group();

        // Legs - each is a group pivoting at hip
        var leftLeg = new THREE.Group();
        leftLeg.position.y = 0; // hip position
        var leftLegMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.06, 0.75, 8),
            new THREE.MeshLambertMaterial({ color: legColor })
        );
        leftLegMesh.position.y = -0.4; // center of cylinder below hip
        leftLeg.add(leftLegMesh);

        var rightLeg = new THREE.Group();
        rightLeg.position.y = 0;
        var rightLegMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.06, 0.75, 8),
            new THREE.MeshLambertMaterial({ color: legColor })
        );
        rightLegMesh.position.y = -0.4;
        rightLeg.add(rightLegMesh);

        person.add(leftLeg);
        person.add(rightLeg);

        // Torso
        var torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.7, 0.25),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = 0.8;
        person.add(torso);

        // Head
        var head = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 16),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = 1.25;
        person.add(head);

        // Nose (hemisphere on +Z face)
        var nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 8, 8),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.position.set(0, 1.25, 0.16);
        person.add(nose);

        // Arms - each pivoting at shoulder
        var leftArm = new THREE.Group();
        leftArm.position.set(-0.28, 1.0, 0);
        var leftArmMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.05, 0.65, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        leftArmMesh.position.y = -0.3;
        leftArm.add(leftArmMesh);

        var rightArm = new THREE.Group();
        rightArm.position.set(0.28, 1.0, 0);
        var rightArmMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.05, 0.65, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        rightArmMesh.position.y = -0.3;
        rightArm.add(rightArmMesh);

        person.add(leftArm);
        person.add(rightArm);

        // Store references for animation
        person.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            leftArm: leftArm,
            rightArm: rightArm,
            isSitting: false,
            isWalking: false,
            walkPhase: 0
        };

        return person;
    }

    function getRandomShirt() {
        var shirts = [0xcc4444, 0x4488cc, 0x44cc66, 0xcc8844, 0x9944cc, 0xcc9933, 0x555577];
        return shirts[Math.floor(Math.random() * shirts.length)];
    }

    function getRandomSkin() {
        var skins = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xd48a63, 0x8d5524];
        return skins[Math.floor(Math.random() * skins.length)];
    }

    function getRandomPants() {
        var pants = [0x333344, 0x222233, 0x444455, 0x1a1a2e, 0x2c3e50];
        return pants[Math.floor(Math.random() * pants.length)];
    }

    function animatePersonWalking(person, dt) {
        var data = person.userData;
        if (!data) return;

        if (data.isSitting) {
            // Sitting: legs bent forward at hip, arms down
            data.leftLeg.rotation.x = -Math.PI / 2;
            data.rightLeg.rotation.x = -Math.PI / 2;
            data.leftArm.rotation.x = -Math.PI / 4;
            data.rightArm.rotation.x = -Math.PI / 4;
            data.walkPhase = 0;
        } else if (data.isWalking) {
            // Walking: legs swing with sin, arms opposite
            data.walkPhase += dt * 8;
            var legSwing = Math.sin(data.walkPhase) * 0.6;
            var armSwing = -Math.sin(data.walkPhase) * 0.5;

            data.leftLeg.rotation.x = legSwing;
            data.rightLeg.rotation.x = -legSwing;
            data.leftArm.rotation.x = armSwing;
            data.rightArm.rotation.x = -armSwing;
        } else {
            // Standing idle: reset to zero
            data.leftLeg.rotation.x = 0;
            data.rightLeg.rotation.x = 0;
            data.leftArm.rotation.x = 0;
            data.rightArm.rotation.x = 0;
            data.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
