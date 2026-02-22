// Person factory function
function createPerson() {
    // Constants for person dimensions
    const LEG_HEIGHT = 0.4;
    const TORSO_HEIGHT = 0.5;
    const HEAD_RADIUS = 0.2;
    const ARM_LENGTH = 0.3;
    
    // Create person container
    const person = new THREE.Group();
    
    // Legs (dark blue)
    const leftLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, LEG_HEIGHT, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    );
    const rightLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, LEG_HEIGHT, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    );
    
    // Position legs
    leftLeg.position.y = LEG_HEIGHT / 2;
    rightLeg.position.y = LEG_HEIGHT / 2;
    leftLeg.position.x = -0.1;
    rightLeg.position.x = 0.1;
    
    // Torso (blue)
    const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, TORSO_HEIGHT, 8),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );
    torso.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2;
    
    // Head (skin tone)
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_RADIUS, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    );
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS;
    
    // Arms (blue, hanging down from shoulders)
    const leftArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, ARM_LENGTH, 8),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );
    const rightArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, ARM_LENGTH, 8),
        new THREE.MeshStandardMaterial({ color: 0x3498db })
    );
    
    // Position arms at shoulder level
    leftArm.position.y = LEG_HEIGHT + TORSO_HEIGHT;
    rightArm.position.y = LEG_HEIGHT + TORSO_HEIGHT;
    leftArm.position.x = -0.25;
    rightArm.position.x = 0.25;
    
    // Rotate arms to hang down
    leftArm.rotation.z = Math.PI / 4; // Slight angle for natural look
    rightArm.rotation.z = -Math.PI / 4;
    
    // Add all parts to person
    person.add(leftLeg, rightLeg, torso, head, leftArm, rightArm);
    
    // Animation state
    person.isWalking = false;
    person.walkTime = 0;
    
    // Walking animation function
    person.updateAnimation = function(deltaTime) {
        if (this.isWalking) {
            this.walkTime += deltaTime * 5; // Speed factor
            
            // Animate legs with sine wave (pivot from hips)
            const legAngle = Math.sin(this.walkTime) * 0.3;
            leftLeg.rotation.x = legAngle;
            rightLeg.rotation.x = -legAngle;
            
            // Slight arm swing opposite to legs
            leftArm.rotation.z = Math.PI / 4 + Math.sin(this.walkTime) * 0.2;
            rightArm.rotation.z = -Math.PI / 4 - Math.sin(this.walkTime) * 0.2;
        } else {
            // Reset to standing position
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftArm.rotation.z = Math.PI / 4;
            rightArm.rotation.z = -Math.PI / 4;
        }
    };
    
    return person;
}