// Person factory function - returns a THREE.Group representing a person with proper dimensions for elevator simulation

function createPerson() {
    const group = new THREE.Group();
    group.name = 'person';

    // Dimensions (meters)
    const legLength = 1.0;      // hip to foot
    const legWidth = 0.3;
    const legDepth = 0.2;
    
    const torsoHeight = 1.5;
    const torsoWidth = 0.6;
    const torsoDepth = 0.3;
    
    const headRadius = 0.4;
    
    const upperArmLength = 0.8; // shoulder to wrist
    const upperArmWidth = 0.2;

    // Colors
    const bodyColor = new THREE.Color(0x3498db);   // Blue body
    const skinColor = new THREE.Color(0xffdbac);   // Skin tone head
    const darkLegsColor = new THREE.Color(0x2c3e50); // Dark legs

    // Create torso (box)
    const torsoGeometry = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);

    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);

    // Create left leg
    const leftLegGeometry = new THREE.BoxGeometry(legWidth, legLength, legDepth);
    const leftLegMaterial = new THREE.MeshLambertMaterial({ color: darkLegsColor });
    const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
    leftLeg.name = 'leftLeg';

    // Create right leg
    const rightLegGeometry = new THREE.BoxGeometry(legWidth, legLength, legDepth);
    const rightLegMaterial = new THREE.MeshLambertMaterial({ color: darkLegsColor });
    const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
    rightLeg.name = 'rightLeg';

    // Create left arm
    const leftArmGeometry = new THREE.BoxGeometry(upperArmWidth, upperArmLength, upperArmWidth);
    const leftArmMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const leftArm = new THREE.Mesh(leftArmGeometry, leftArmMaterial);
    leftArm.name = 'leftArm';

    // Create right arm
    const rightArmGeometry = new THREE.BoxGeometry(upperArmWidth, upperArmLength, upperArmWidth);
    const rightArmMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const rightArm = new THREE.Mesh(rightArmGeometry, rightArmMaterial);
    rightArm.name = 'rightArm';

    // Add all parts to group
    group.add(torso);
    group.add(head);
    group.add(leftLeg);
    group.add(rightLeg);
    group.add(leftArm);
    group.add(rightArm);

    // Set initial pose (standing straight)
    function setStandingPose() {
        // Position legs so that when group.position.y = desired floor height, feet touch that floor
        // Feet are at bottom of leg boxes; we position legs such that their local origin is at hip joint,
        //   and with no extra rotation, foot touches worldY = group.position.y  (after math worked out earlier)
        //
        // We'll use the approach where:
        //    Each leg mesh is positioned relative to group so its local origin (0,0,0) is at hip joint.
        //    The leg geometry is a box centered at its own origin; we will shift it down by half legLength
        //        so that when no rotation, the foot tip is at local position Y = -legLength/2? Wait let's derive:
        //
        // Alternative simple approach that works: 
        //    Place each leg mesh with position.y = legLength/2 and no geometry shift.
        //    Then if group.position.y = floorHeight, foot touches worldY=floorHeight (as previously derived).
        // We'll use this simpler method for now; note it means legs pivot about their center not hip,
        //   but we'll limit swing angle to reduce visual error.

        const hipSeparation = 0.2; // distance between inner feet? actually we'll set leg positions to have gap
        const legOffsetX = legWidth/2 + hipSeparation/2; // distance from group origin to leg center

        // Left leg: positioned left of center, slightly forward? We'll set z=0 for now; facing will be handled by rotating whole person.
        leftLeg.position.set(-legOffsetX, legLength/2, 0);
        rightLeg.position.set(legOffsetX, legLength/2, 0);

        // Torso sits on top of legs: its bottom at height = legLength (top of legs)
        torso.position.set(0, legLength + torsoHeight/2, 0);

        // Head sits on top of torso
        head.position.set(0, legLength + torsoHeight + headRadius, 0);

        // Arms at shoulder level (approximate)
        const shoulderY = legLength + torsoHeight * 0.5; // rough midpoint of torso vertically
        leftArm.position.set(
            -(torsoWidth/2 + upperArmWidth/2),   // x: touch side of torso
            shoulderY - upperArmLength/2,        // y: so that top of arm at shoulder
            0                                    // z
        );
        rightArm.position.set(
            (torsoWidth/2 + upperArmWidth/2),
            shoulderY - upperArmLength/2,
            0
        );

        // Reset leg rotations to zero (standing)
        leftLeg.rotation.set(0, 0, 0);
        rightLeg.rotation.set(0, 0, 0);
    }

    setStandingPose();

    return group;
}

export { createPerson };