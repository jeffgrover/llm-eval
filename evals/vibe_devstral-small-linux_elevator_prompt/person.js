/**
 * Person factory function - creates a simple 3D humanoid figure
 * Returns: { object: THREE.Group, updateLegs: function } 
 */
function createPerson() {
    const person = new THREE.Group();
    const legsHeight = 0.4;
    const torsoHeight = 0.3;
    const headRadius = 0.2;

    // Create legs (cylinder)
    const legsGeometry = new THREE.CylinderGeometry(0.1, 0.15, legsHeight, 8);
    legsGeometry.rotateX(Math.PI / 2); // Stand upright
    const legsMaterial = new THREE.MeshBasicMaterial({
        color: 0x2c3e50,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const legs = new THREE.Mesh(legsGeometry, legsMaterial);
    person.add(legs);

    // Create torso (box)
    const torsoGeometry = new THREE.BoxGeometry(0.2, 0.15, 0.15);
    const torsoMaterial = new THREE.MeshBasicMaterial({
        color: 0x3498db,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = legsHeight;
    person.add(torso);

    // Create head (sphere)
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16, 0, Math.PI * 2);
    const headMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdbac,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = legsHeight + torsoHeight;
    person.add(head);

    // Create arms (cylinders attached to shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
    armGeometry.rotateX(Math.PI / 2);
    const armMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdbac,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.15, legsHeight + torsoHeight / 2, 0);
    person.add(leftArm);

    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.15, legsHeight + torsoHeight / 2, 0);
    person.add(rightArm);

    // Total height calculation
    const totalHeight = legsHeight + torsoHeight + headRadius;

    // Leg animation state
    let legRotation = 0;
    let isWalking = false;
    let walkDirection = 1; // 1 for forward, -1 for backward

    function updateLegs(delta) {
        if (!isWalking) return;
        
        legRotation += delta * 2 * walkDirection;
        
        // Apply alternating rotation to legs
        const leftLegRot = Math.sin(legRotation) * 0.3 * walkDirection;
        const rightLegRot = Math.sin(legRotation + Math.PI) * 0.3 * walkDirection;
        
        leftArm.rotation.z = leftLegRot;
        rightArm.rotation.z = rightLegRot;
    }

    function startWalking(direction = 1) {
        isWalking = true;
        walkDirection = direction;
    }

    function stopWalking() {
        isWalking = false;
        leftArm.rotation.z = 0;
        rightArm.rotation.z = 0;
    }

    return {
        object: person,
        updateLegs: updateLegs,
        startWalking: startWalking,
        stopWalking: stopWalking,
        totalHeight: totalHeight,
        legsY: legsHeight
    };
}
