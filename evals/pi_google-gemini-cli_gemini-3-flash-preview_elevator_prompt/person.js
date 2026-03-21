/**
 * person.js
 * Factory function for creating 3D humanoid figures for the elevator simulation.
 */

function createPerson(bodyColor, headColor, legsColor) {
    const group = new THREE.Group();

    // Dimensions
    const legHeight = 0.5;
    const torsoHeight = 0.6;
    const headRadius = 0.15;
    const armHeight = 0.45;
    const shoulderWidth = 0.22;

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
    const headMat = new THREE.MeshStandardMaterial({ color: headColor });
    const legMat = new THREE.MeshStandardMaterial({ color: legsColor });

    // --- LEGS (Pivoting from hips) ---
    const legGeo = new THREE.BoxGeometry(0.12, legHeight, 0.12);
    
    // Left Leg Pivot (at hip level)
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.08, legHeight, 0); 
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.set(0, -legHeight/2, 0); // Offset so pivot is at top
    leftLegPivot.add(leftLegMesh);
    group.add(leftLegPivot);

    // Right Leg Pivot (at hip level)
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.08, legHeight, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.set(0, -legHeight/2, 0); // Offset so pivot is at top
    rightLegPivot.add(rightLegMesh);
    group.add(rightLegPivot);

    // --- TORSO ---
    const torsoGeo = new THREE.BoxGeometry(0.3, torsoHeight, 0.18);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.set(0, legHeight + torsoHeight/2, 0);
    group.add(torso);

    // --- HEAD ---
    const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, legHeight + torsoHeight + headRadius, 0);
    group.add(head);

    // --- ARMS (Hanging from shoulders) ---
    const armGeo = new THREE.BoxGeometry(0.08, armHeight, 0.08);
    
    const leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-shoulderWidth, legHeight + torsoHeight - armHeight/2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(shoulderWidth, legHeight + torsoHeight - armHeight/2, 0);
    group.add(rightArm);

    // Store state for animation
    group.userData.isWalking = false;
    group.userData.walkTime = 0;

    /**
     * Updates the walking animation of the person.
     * @param {number} deltaTime - Time since last frame
     * @param {number} simulationSpeed - Multiplier for animation speed
     */
    group.updateAnimation = function(deltaTime, simulationSpeed) {
        if (group.userData.isWalking) {
            group.userData.walkTime += deltaTime * 10 * simulationSpeed;
            const angle = Math.sin(group.userData.walkTime) * 0.5;
            leftLegPivot.rotation.x = angle;
            rightLegPivot.rotation.x = -angle;
        } else {
            // Reset to standing position
            leftLegPivot.rotation.x = 0;
            rightLegPivot.rotation.x = 0;
            group.userData.walkTime = 0;
        }
    };

    return group;
}
