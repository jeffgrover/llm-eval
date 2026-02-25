// person.js - Handles creation of 3D humanoid figures

function createPerson(colorBody = 0x3498db) {
    const personGroup = new THREE.Group();

    // Dimensions
    const legHeight = 1.2;
    const legWidth = 0.25;
    const legDepth = 0.25;
    const torsoHeight = 1.5;
    const torsoWidth = 0.8;
    const torsoDepth = 0.4;
    const headSize = 0.5;
    const armLength = 1.1;
    const armWidth = 0.2;

    const materialLegs = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // Dark legs
    const materialBody = new THREE.MeshLambertMaterial({ color: colorBody }); // Blue body
    const materialSkin = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone

    // 1. Legs (Pivot at hips)
    // Left Leg
    const legLGeo = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    // Move geometry center down so pivot is at top
    legLGeo.translate(0, -legHeight / 2, 0);
    const legL = new THREE.Mesh(legLGeo, materialLegs);
    legL.position.set(-0.2, legHeight, 0);
    
    // Right Leg
    const legRGeo = new THREE.BoxGeometry(legWidth, legHeight, legDepth);
    legRGeo.translate(0, -legHeight / 2, 0);
    const legR = new THREE.Mesh(legRGeo, materialLegs);
    legR.position.set(0.2, legHeight, 0);

    // 2. Torso
    const torsoGeo = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    // Pivot is center of torso, position it above legs
    const torso = new THREE.Mesh(torsoGeo, materialBody);
    torso.position.set(0, legHeight + torsoHeight / 2, 0);

    // 3. Head
    const headGeo = new THREE.BoxGeometry(headSize, headSize, headSize);
    const head = new THREE.Mesh(headGeo, materialSkin);
    head.position.set(0, legHeight + torsoHeight + headSize / 2, 0);

    // 4. Arms (Hanging down from shoulders)
    // Left Arm
    const armLGeo = new THREE.BoxGeometry(armWidth, armLength, armWidth);
    armLGeo.translate(0, -armLength / 2, 0); // Pivot at shoulder
    const armL = new THREE.Mesh(armLGeo, materialSkin);
    armL.position.set(-torsoWidth / 2 - armWidth / 2, legHeight + torsoHeight - 0.2, 0);

    // Right Arm
    const armRGeo = new THREE.BoxGeometry(armWidth, armLength, armWidth);
    armRGeo.translate(0, -armLength / 2, 0); // Pivot at shoulder
    const armR = new THREE.Mesh(armRGeo, materialSkin);
    armR.position.set(torsoWidth / 2 + armWidth / 2, legHeight + torsoHeight - 0.2, 0);

    // Assemble
    personGroup.add(legL);
    personGroup.add(legR);
    personGroup.add(torso);
    personGroup.add(head);
    personGroup.add(armL);
    personGroup.add(armR);

    // Expose parts for animation
    personGroup.userData = {
        legL: legL,
        legR: legR,
        armL: armL,
        armR: armR,
        isWalking: false,
        walkTime: 0
    };

    // Animation helper
    personGroup.updateAnimation = function(delta) {
        if (this.userData.isWalking) {
            this.userData.walkTime += delta * 10; // Speed of cycle
            const angle = Math.sin(this.userData.walkTime) * 0.5; // Max rotation angle

            // Scissor motion
            this.userData.legL.rotation.x = angle;
            this.userData.legR.rotation.x = -angle;
            
            // Arms opposite to legs
            this.userData.armL.rotation.x = -angle * 0.5;
            this.userData.armR.rotation.x = angle * 0.5;
        } else {
            // Reset to standing
            this.userData.legL.rotation.x = 0;
            this.userData.legR.rotation.x = 0;
            this.userData.armL.rotation.x = 0;
            this.userData.armR.rotation.x = 0;
        }
    };

    return personGroup;
}
