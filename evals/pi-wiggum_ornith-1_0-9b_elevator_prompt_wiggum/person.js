(function () {
    "use strict";

    function createPerson(color) {
        var group = new THREE.Group();

        // --- Head (sphere on top of torso) ---
        var headRadius = 0.3;
        var headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
        var headMat = new THREE.MeshPhongMaterial({ color: color });
        var head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 2.0;
        group.add(head);

        // --- Torso (box) ---
        var torsoH = 1.4;
        var torsoW = 0.5;
        var torsoD = 0.45;
        var torsoGeo = new THREE.BoxGeometry(torsoW, torsoH, torsoD);
        var torsoMat = new THREE.MeshPhongMaterial({ color: color });
        var torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = torsoH / 2 - headRadius;
        group.add(torso);

        // --- Left Leg (below torso) ---
        var legLGeo = new THREE.BoxGeometry(0.15, 0.9, 0.25);
        var legMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        var leftLeg = new THREE.Mesh(legLGeo, legMat);
        leftLeg.position.set(-0.17, -torsoH / 2 + headRadius - 0.45, 0);
        group.add(leftLeg);

        // --- Right Leg (below torso) ---
        var rightLeg = new THREE.Mesh(legLGeo.clone(), legMat.clone());
        rightLeg.position.set(0.17, -torsoH / 2 + headRadius - 0.45, 0);
        group.add(rightLeg);

        // --- Arms (hanging from shoulders) ---
        var armLen = 0.6;
        var armGeo = new THREE.BoxGeometry(0.12, armLen, 0.25);
        var leftArm = new THREE.Mesh(armGeo, legMat.clone());
        leftArm.position.set(-torsoW / 2 - 0.05, torsoH / 2 - headRadius + 0.1, 0);
        group.add(leftArm);

        var rightArm = new THREE.Mesh(armGeo.clone(), legMat.clone());
        rightArm.position.set(torsoW / 2 + 0.05, torsoH / 2 - headRadius + 0.1, 0);
        group.add(rightArm);

        // userData
        leftLeg.userData = { type: "leftLeg", isWalking: false };
        rightLeg.userData = { type: "rightLeg", isWalking: false };
        group.userData = {
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            isWalking: false,
            currentFloor: 0,
            inElevator: false,
        };

        return group;
    }

    function detachPerson(person) {
        var root = person.parent;
        while (root && root.parent && root.parent !== undefined) {
            root = root.parent;
        }
        if (root && root !== undefined) {
            root.attach(person);
        }
    }

    function walk(person, distance) {
        person.userData.isWalking = true;
        var startPos = new THREE.Vector3();
        person.getWorldPosition(startPos);
        var targetZ = startPos.z + distance;

        if (person.walkState && person.walkState.done) return;
        if (!person.walkState) {
            person.walkState = { done: false, distToGo: targetZ - startPos.z };
        }

        var legL = person.userData.leftLeg;
        var legR = person.userData.rightLeg;

        function tick() {
            person.userData.isWalking = true;
            var progress = person.walkState.done ? 1 : (person.walkState.progress || 0);
            progress += 0.25;
            if (progress >= 1) {
                progress = 1;
                person.walkState.done = true;
                return;
            }

            var t = progress;
            legL.rotation.x = -Math.sin(t * Math.PI * 2) * 0.6;
            legR.rotation.x = Math.sin(t * Math.PI * 2) * 0.6;

            var pos = new THREE.Vector3();
            person.getWorldPosition(pos);
            if (Math.abs(pos.z - targetZ) < 0.05) {
                progress = 1;
                person.walkState.done = true;
                return;
            }

            var newPosX = pos.clone();
            newPosX.z += (targetZ - pos.z) * 0.5;
            person.position.copy(newPosX);
        }

        window.tick = tick;

        function animate() {
            if (!person.walkState || person.walkState.done) return;
            tick();
            requestAnimationFrame(animate);
        }
        animate();
    }

    // Stop walking
    function stopWalking(person) {
        if (person.walkState && !person.walkState.done) {
            person.walkState.done = true;
        }
        person.userData.isWalking = false;
    }

    window.createPerson = createPerson;
    window.walk = walk;
    window.stopWalking = stopWalking;
})();
