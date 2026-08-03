(function(global) {
    function createPerson(options) {
        options = options || {};
        var bodyColor = options.bodyColor || getRandomBodyColor();
        var skinColor = options.skinColor || getRandomSkinColor();
        var legColor = options.legColor || getRandomLegColor();

        var personGroup = new THREE.Group();

        // Legs group pivoting at hip (origin at hip)
        var legGroup = new THREE.Group();
        legGroup.position.y = 0.25; // slightly up from feet

        // Left leg
        var leftLeg = new THREE.Group();
        leftLeg.position.x = -0.15;
        var leftLegCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8),
            new THREE.MeshLambertMaterial({ color: legColor })
        );
        leftLegCylinder.position.y = -0.3;
        leftLegCylinder.geometry.computeVertexNormals();
        leftLeg.add(leftLegCylinder);

        // Right leg
        var rightLeg = new THREE.Group();
        rightLeg.position.x = 0.15;
        var rightLegCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8),
            new THREE.MeshLambertMaterial({ color: legColor })
        );
        rightLegCylinder.position.y = -0.3;
        rightLegCylinder.geometry.computeVertexNormals();
        rightLeg.add(rightLegCylinder);

        legGroup.add(leftLeg);
        legGroup.add(rightLeg);

        // Torso
        var torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 0.65, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        torso.position.y = 0.575;
        torso.geometry.computeVertexNormals();

        // Arms - shoulder pivot groups
        var armGroup = new THREE.Group();
        armGroup.position.y = 0.7;

        var leftArm = new THREE.Group();
        leftArm.position.x = -0.35;
        var leftArmCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        leftArmCylinder.position.y = -0.2;
        leftArmCylinder.geometry.computeVertexNormals();
        leftArm.add(leftArmCylinder);

        var rightArm = new THREE.Group();
        rightArm.position.x = 0.35;
        var rightArmCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
            new THREE.MeshLambertMaterial({ color: bodyColor })
        );
        rightArmCylinder.position.y = -0.2;
        rightArmCylinder.geometry.computeVertexNormals();
        rightArm.add(rightArmCylinder);

        armGroup.add(leftArm);
        armGroup.add(rightArm);

        // Head
        var head = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 16, 16),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        head.position.y = 0.88;
        head.geometry.computeVertexNormals();

        // Nose - small hemisphere on +Z face of head
        var nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 8, 8),
            new THREE.MeshLambertMaterial({ color: skinColor })
        );
        nose.position.set(0, 0, 0.18);
        nose.geometry.computeVertexNormals();
        head.add(nose);

        // Assemble person
        personGroup.add(legGroup);
        personGroup.add(torso);
        personGroup.add(armGroup);
        personGroup.add(head);

        personGroup.userData = {
            isSitting: false,
            isWalking: false,
            walkPhase: 0,
            plan: [],
            currentAction: null,
            role: null,
            name: "",
            targetSeat: null
        };

        return personGroup;
    }

    function getRandomBodyColor() {
        var colors = ['#e85e46', '#4a90e2', '#f5a623', '#7ab14c', '#d484d4'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function getRandomSkinColor() {
        var colors = ['#f8d2b6', '#eebe9f', '#d59170', '#a56548', '#f5a623'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function getRandomLegColor() {
        var colors = ['#333344', '#222233', '#444455', '#3d5a80', '#2c3e50'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function animatePersonWalking(person, dt) {
        if (!person) return;

        var userData = person.userData;

        if (userData.isSitting) {
            // Sitting animation: legs bend forward, arms drop slightly
            userData.isWalking = false;

            var legGroup = person.children[0];
            var leftLeg = legGroup.children[0];
            var rightLeg = legGroup.children[1];
            var armGroup = person.children[2];
            var leftArm = armGroup.children[0];
            var rightArm = armGroup.children[1];

            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            userData.walkPhase = 0;
        } else {
            // Walking animation: legs and arms swing
            if (userData.isWalking) {
                userData.walkPhase += dt * 8;
                var sinPhase = Math.sin(userData.walkPhase);

                var legGroup = person.children[0];
                var leftLeg = legGroup.children[0];
                var rightLeg = legGroup.children[1];
                var armGroup = person.children[2];
                var leftArm = armGroup.children[0];
                var rightArm = armGroup.children[1];

                // Legs swing with sin(phase) * 0.6
                leftLeg.rotation.x = Math.sin(userData.walkPhase) * 0.6;
                rightLeg.rotation.x = -Math.sin(userData.walkPhase) * 0.6;

                // Arms swing opposite with -sin(phase) * 0.5
                leftArm.rotation.x = -Math.sin(userData.walkPhase) * 0.5;
                rightArm.rotation.x = Math.sin(userData.walkPhase) * 0.5;
            } else {
                // Standing idle: reset limbs to zero
                var legGroup = person.children[0];
                var leftLeg = legGroup.children[0];
                var rightLeg = legGroup.children[1];
                var armGroup = person.children[2];
                var leftArm = armGroup.children[0];
                var rightArm = armGroup.children[1];

                leftLeg.rotation.x = 0;
                rightLeg.rotation.x = 0;
                leftArm.rotation.x = 0;
                rightArm.rotation.x = 0;
                userData.walkPhase = 0;
            }
        }
    }

    global.createPerson = createPerson;
    global.animatePersonWalking = animatePersonWalking;
})(typeof window !== "undefined" ? window : globalThis);
