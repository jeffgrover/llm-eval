(function(root) {
    const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
    const SKIN_COLORS = ['#f5d0a9', '#d4a574', '#c68642', '#8d5524', '#f1c27d', '#e0ac69'];
    const LEG_COLORS = ['#2c3e50', '#34495e', '#1a1a2e', '#4a4a4a', '#2d3436', '#636e72'];

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(options) {
        options = options || {};
        const bodyColor = options.bodyColor || randomFrom(SHIRT_COLORS);
        const skinColor = options.skinColor || randomFrom(SKIN_COLORS);
        const legColor = options.legColor || randomFrom(LEG_COLORS);

        const group = new THREE.Group();
        group.userData = { isWalking: false, isSitting: false, walkPhase: 0 };

        const torsoMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(bodyColor) });
        const skinMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(skinColor) });
        const legMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(legColor) });

        // Legs - each is a Group pivoting at hip
        const leftLeg = new THREE.Group();
        leftLeg.position.set(-0.15, 0.85, 0);
        const leftLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8), legMat);
        leftLegMesh.position.y = -0.425;
        leftLeg.add(leftLegMesh);
        group.add(leftLeg);

        const rightLeg = new THREE.Group();
        rightLeg.position.set(0.15, 0.85, 0);
        const rightLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8), legMat);
        rightLegMesh.position.y = -0.425;
        rightLeg.add(rightLegMesh);
        group.add(rightLeg);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), torsoMat);
        torso.position.y = 1.15;
        group.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
        head.position.y = 1.6;
        group.add(head);

        // Nose on +Z face of head
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skinMat);
        nose.position.set(0, 1.58, 0.18);
        group.add(nose);

        // Arms - each is a Group pivoting at shoulder
        const leftArm = new THREE.Group();
        leftArm.position.set(-0.32, 1.35, 0);
        const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), torsoMat);
        leftArmMesh.position.y = -0.275;
        leftArm.add(leftArmMesh);
        group.add(leftArm);

        const rightArm = new THREE.Group();
        rightArm.position.set(0.32, 1.35, 0);
        const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), torsoMat);
        rightArmMesh.position.y = -0.275;
        rightArm.add(rightArmMesh);
        group.add(rightArm);

        group.userData.leftLeg = leftLeg;
        group.userData.rightLeg = rightLeg;
        group.userData.leftArm = leftArm;
        group.userData.rightArm = rightArm;

        return group;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        const leftLeg = ud.leftLeg;
        const rightLeg = ud.rightLeg;
        const leftArm = ud.leftArm;
        const rightArm = ud.rightArm;

        if (ud.isSitting) {
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const phase = ud.walkPhase;
            leftLeg.rotation.x = Math.sin(phase) * 0.6;
            rightLeg.rotation.x = -Math.sin(phase) * 0.6;
            leftArm.rotation.x = -Math.sin(phase) * 0.5;
            rightArm.rotation.x = Math.sin(phase) * 0.5;
        } else {
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftArm.rotation.x = 0;
            rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== 'undefined' ? window : globalThis);
