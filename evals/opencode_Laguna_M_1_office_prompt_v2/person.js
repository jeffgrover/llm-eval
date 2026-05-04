(function(root) {
    const SHIRT_COLORS = [0x4a90e2, 0xe94a4a, 0x4ae94a, 0xe9e94a, 0xc785d6, 0x22b14c];
    const SKIN_COLORS = [0xf9d9b7, 0xe0ac69, 0xc68642];
    const PANTS_COLORS = [0x2c3e50, 0x34495e, 0x1a2530];

    function getRandomColor(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson({bodyColor, skinColor, legColor} = {}) {
        const person = new THREE.Group();
        
        const material = {
            body: new THREE.MeshPhongMaterial({ color: bodyColor || getRandomColor(SHIRT_COLORS) }),
            skin: new THREE.MeshPhongMaterial({ color: skinColor || getRandomColor(SKIN_COLORS) }),
            legs: new THREE.MeshPhongMaterial({ color: legColor || getRandomColor(PANTS_COLORS) })
        };

        // Legs - each is a group pivoting at hip
        const legGeometry = new THREE.CylinderGeometry(0.13, 0.13, 0.6, 6);
        legGeometry.translate(0, -0.3, 0);

        const leftLeg = new THREE.Group();
        const leftLegMesh = new THREE.Mesh(legGeometry, material.legs);
        leftLegMesh.position.y = 0;
        leftLeg.add(leftLegMesh);
        leftLeg.position.set(-0.14, 0, 0);

        const rightLeg = new THREE.Group();
        const rightLegMesh = new THREE.Mesh(legGeometry, material.legs);
        rightLegMesh.position.y = 0;
        rightLeg.add(rightLegMesh);
        rightLeg.position.set(0.14, 0, 0);

        // Torso
        const torsoGeometry = new THREE.BoxGeometry(0.5, 0.7, 0.3);
        const torso = new THREE.Mesh(torsoGeometry, material.body);
        torso.position.y = 0.65;

        // Arms - groups pivoting at shoulder
        const armGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6);
        armGeometry.translate(0, -0.25, 0);

        const leftArm = new THREE.Group();
        const leftArmMesh = new THREE.Mesh(armGeometry, material.body);
        leftArmMesh.position.y = 0;
        leftArm.add(leftArmMesh);
        leftArm.position.set(-0.33, 1.25, 0);

        const rightArm = new THREE.Group();
        const rightArmMesh = new THREE.Mesh(armGeometry, material.body);
        rightArmMesh.position.y = 0;
        rightArm.add(rightArmMesh);
        rightArm.position.set(0.33, 1.25, 0);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.22, 8, 8);
        headGeometry.translate(0, 0.22, 0);
        const head = new THREE.Mesh(headGeometry, material.skin);
        head.position.y = 1.45;

        // Nose (small hemisphere on +Z face)
        const noseGeometry = new THREE.SphereGeometry(0.05, 6, 6);
        const nose = new THREE.Mesh(noseGeometry, material.skin);
        nose.scale.set(1, 0.6, 0.8);
        nose.position.set(0, 0.18, 0.25);
        head.add(nose);

        person.add(leftLeg);
        person.add(rightLeg);
        person.add(torso);
        person.add(leftArm);
        person.add(rightArm);
        person.add(head);

        person.userData = {
            leftLeg, rightLeg, leftArm, rightArm,
            isWalking: false,
            isSitting: false,
            walkPhase: 0,
            _prevWp: null,
            _stallT: 0
        };

        return person;
    }

    function animatePersonWalking(person, dt) {
        const ud = person.userData;
        
        if (ud.isSitting) {
            ud.leftLeg.rotation.x = -Math.PI / 2;
            ud.rightLeg.rotation.x = -Math.PI / 2;
            ud.leftArm.rotation.x = -Math.PI / 4;
            ud.rightArm.rotation.x = -Math.PI / 4;
            ud.walkPhase = 0;
            return;
        }
        
        if (ud.isWalking) {
            ud.walkPhase += dt * 8;
            const swing = Math.sin(ud.walkPhase);
            ud.leftLeg.rotation.x = swing * 0.6;
            ud.rightLeg.rotation.x = -swing * 0.6;
            ud.leftArm.rotation.x = -swing * 0.5;
            ud.rightArm.rotation.x = swing * 0.5;
        } else {
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
            ud.walkPhase = 0;
        }
    }

    root.createPerson = createPerson;
    root.animatePersonWalking = animatePersonWalking;
})(typeof window !== 'undefined' ? window : globalThis);