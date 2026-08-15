/**
 * person.js
 * 3D Person mesh factory and skeletal walking/sitting animator using Three.js primitives.
 * Attached to window.createPerson and window.animatePersonWalking.
 */
(function() {
    "use strict";

    const SHIRT_COLORS = [
        0x3366cc, 0xdc3912, 0xff9900, 0x109618, 0x990099,
        0x3b3eac, 0x0099c6, 0xdd4477, 0x66aa00, 0xb82e2e,
        0x316395, 0x22aa99, 0xaaaa11, 0x6633cc, 0xe67300,
        0x8b0707, 0x329262, 0x5574a6, 0x2e86de, 0x10ac84
    ];

    const SKIN_COLORS = [
        0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642,
        0x8d5524, 0x523318, 0xffe0bd, 0xd9a066
    ];

    const PANTS_COLORS = [
        0x2c3e50, 0x34495e, 0x2c2c54, 0x474787,
        0x333333, 0x1e272e, 0x485460, 0x57606f,
        0x2f3542, 0x636e72, 0x4b6584, 0x1b1464
    ];

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function createPerson(options) {
        const opts = options || {};
        const shirtColor = opts.bodyColor !== undefined ? opts.bodyColor : pickRandom(SHIRT_COLORS);
        const skinColor = opts.skinColor !== undefined ? opts.skinColor : pickRandom(SKIN_COLORS);
        const pantsColor = opts.legColor !== undefined ? opts.legColor : pickRandom(PANTS_COLORS);

        const personGroup = new THREE.Group();

        // Materials
        const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
        const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
        const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
        const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

        // LEGS (pivot at hip y = 0.8)
        const hipY = 0.8;
        const legHeight = 0.74;
        const legRadius = 0.065;
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 8);
        const shoeGeo = new THREE.BoxGeometry(0.14, 0.08, 0.2);

        // Left Leg Group
        const leftLegGroup = new THREE.Group();
        leftLegGroup.position.set(-0.13, hipY, 0);
        const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
        leftLegMesh.position.set(0, -legHeight / 2, 0);
        leftLegGroup.add(leftLegMesh);
        const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
        leftShoe.position.set(0, -legHeight, 0.04);
        leftLegGroup.add(leftShoe);
        personGroup.add(leftLegGroup);

        // Right Leg Group
        const rightLegGroup = new THREE.Group();
        rightLegGroup.position.set(0.13, hipY, 0);
        const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
        rightLegMesh.position.set(0, -legHeight / 2, 0);
        rightLegGroup.add(rightLegMesh);
        const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
        rightShoe.position.set(0, -legHeight, 0.04);
        rightLegGroup.add(rightShoe);
        personGroup.add(rightLegGroup);

        // TORSO (box centered at y = 1.1)
        const torsoWidth = 0.44;
        const torsoHeight = 0.54;
        const torsoDepth = 0.24;
        const torsoGeo = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
        const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
        torsoMesh.position.set(0, hipY + torsoHeight / 2 + 0.02, 0);
        personGroup.add(torsoMesh);

        // ARMS (pivot at shoulder y = 1.32)
        const shoulderY = hipY + torsoHeight - 0.02;
        const armHeight = 0.52;
        const armRadius = 0.055;
        const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armHeight, 8);
        const handGeo = new THREE.SphereGeometry(0.06, 8, 8);

        // Left Arm Group
        const leftArmGroup = new THREE.Group();
        leftArmGroup.position.set(-(torsoWidth / 2 + armRadius + 0.02), shoulderY, 0);
        const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
        leftArmMesh.position.set(0, -armHeight / 2, 0);
        leftArmGroup.add(leftArmMesh);
        const leftHand = new THREE.Mesh(handGeo, skinMat);
        leftHand.position.set(0, -armHeight, 0);
        leftArmGroup.add(leftHand);
        personGroup.add(leftArmGroup);

        // Right Arm Group
        const rightArmGroup = new THREE.Group();
        rightArmGroup.position.set((torsoWidth / 2 + armRadius + 0.02), shoulderY, 0);
        const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
        rightArmMesh.position.set(0, -armHeight / 2, 0);
        rightArmGroup.add(rightArmMesh);
        const rightHand = new THREE.Mesh(handGeo, skinMat);
        rightHand.position.set(0, -armHeight, 0);
        rightArmGroup.add(rightHand);
        personGroup.add(rightArmGroup);

        // HEAD
        const headRadius = 0.16;
        const headGeo = new THREE.SphereGeometry(headRadius, 12, 12);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, shoulderY + headRadius + 0.06, 0);
        personGroup.add(headMesh);

        // NOSE on +Z face so facing direction is distinct from top-down
        const noseGeo = new THREE.ConeGeometry(0.05, 0.1, 8);
        const noseMesh = new THREE.Mesh(noseGeo, skinMat);
        noseMesh.rotation.x = Math.PI / 2;
        noseMesh.position.set(0, shoulderY + headRadius + 0.06, headRadius + 0.04);
        personGroup.add(noseMesh);

        // Hair / Cap (half sphere)
        const hairMat = new THREE.MeshLambertMaterial({ color: 0x221100 });
        const hairGeo = new THREE.SphereGeometry(headRadius + 0.01, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        const hairMesh = new THREE.Mesh(hairGeo, hairMat);
        hairMesh.position.set(0, shoulderY + headRadius + 0.06, 0);
        personGroup.add(hairMesh);

        // Store references in userData for animation
        personGroup.userData = {
            isWalking: false,
            isSitting: false,
            walkPhase: 0,
            leftLegGroup: leftLegGroup,
            rightLegGroup: rightLegGroup,
            leftArmGroup: leftArmGroup,
            rightArmGroup: rightArmGroup
        };

        return personGroup;
    }

    function animatePersonWalking(person, dt) {
        if (!person || !person.userData) return;
        const ud = person.userData;
        const leftLeg = ud.leftLegGroup;
        const rightLeg = ud.rightLegGroup;
        const leftArm = ud.leftArmGroup;
        const rightArm = ud.rightArmGroup;

        if (!leftLeg || !rightLeg || !leftArm || !rightArm) return;

        if (ud.isSitting) {
            // Legs rotate forward 90 degrees at hip (-pi/2)
            leftLeg.rotation.x = -Math.PI / 2;
            rightLeg.rotation.x = -Math.PI / 2;
            leftLeg.rotation.y = 0;
            rightLeg.rotation.y = 0;
            leftLeg.rotation.z = 0;
            rightLeg.rotation.z = 0;

            // Arms resting forward
            leftArm.rotation.x = -Math.PI / 4;
            rightArm.rotation.x = -Math.PI / 4;
            leftArm.rotation.y = 0;
            rightArm.rotation.y = 0;

            ud.walkPhase = 0;
        } else if (ud.isWalking) {
            ud.walkPhase = (ud.walkPhase || 0) + dt * 8.0;
            const legAngle = Math.sin(ud.walkPhase) * 0.6;
            const armAngle = -Math.sin(ud.walkPhase) * 0.5;

            leftLeg.rotation.x = legAngle;
            rightLeg.rotation.x = -legAngle;
            leftLeg.rotation.y = 0;
            rightLeg.rotation.y = 0;
            leftLeg.rotation.z = 0;
            rightLeg.rotation.z = 0;

            leftArm.rotation.x = armAngle;
            rightArm.rotation.x = -armAngle;
            leftArm.rotation.y = 0;
            rightArm.rotation.y = 0;
        } else {
            // Standing idle
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftLeg.rotation.y = 0;
            rightLeg.rotation.y = 0;
            leftLeg.rotation.z = 0;
            rightLeg.rotation.z = 0;

            leftArm.rotation.x = 0;
            rightArm.rotation.x = 0;
            leftArm.rotation.y = 0;
            rightArm.rotation.y = 0;

            ud.walkPhase = 0;
        }
    }

    window.createPerson = createPerson;
    window.animatePersonWalking = animatePersonWalking;
})();
