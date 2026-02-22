/**
 * Person factory function
 * Creates a simple 3D humanoid figure with proper body structure
 */
function createPerson() {
    const person = new THREE.Group();
    
    // Constants for person proportions
    const LEG_HEIGHT = 1.5;
    const TORSO_HEIGHT = 2;
    const HEAD_RADIUS = 0.8;
    const ARM_LENGTH = 1.5;
    const LEG_WIDTH = 0.4;
    const TORSO_WIDTH = 1;
    
    // Create legs (box shape)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
    const legMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    // Left leg (negative X)
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.x = -TORSO_WIDTH / 4;
    person.add(leftLeg);
    
    // Right leg (positive X)
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.x = TORSO_WIDTH / 4;
    person.add(rightLeg);
    
    // Create torso (box shape)
    const torsoGeometry = new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, LEG_WIDTH);
    const torsoMaterial = new THREE.MeshStandardMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = LEG_HEIGHT;
    person.add(torso);
    
    // Create head (sphere shape)
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT;
    person.add(head);
    
    // Create arms (cylinders hanging down from shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.2, 0.2, ARM_LENGTH, 8);
    const armMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    
    // Left arm (negative X, hanging down)
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.rotation.z = Math.PI / 2; // Rotate to horizontal position
    leftArm.position.set(-TORSO_WIDTH / 3, LEG_HEIGHT + TORSO_HEIGHT / 2 - ARM_LENGTH / 2, 0);
    person.add(leftArm);
    
    // Right arm (positive X, hanging down)
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.rotation.z = Math.PI / 2; // Rotate to horizontal position
    rightArm.position.set(TORSO_WIDTH / 3, LEG_HEIGHT + TORSO_HEIGHT / 2 - ARM_LENGTH / 2, 0);
    person.add(rightArm);
    
    // Store references for animation
    person.leftLeg = leftLeg;
    person.rightLeg = rightLeg;
    person.walking = false;
    person.walkProgress = 0;
    
    // Animation function for walking
    person.animateWalk = function(deltaTime, speed) {
        if (!this.walking) return;
        
        this.walkProgress += deltaTime * speed * 2;
        
        // Alternating leg swing using sine wave
        const leftLegAngle = Math.sin(this.walkProgress) * 0.3;
        const rightLegAngle = Math.sin(this.walkProgress + Math.PI) * 0.3;
        
        this.leftLeg.rotation.x = leftLegAngle;
        this.rightLeg.rotation.x = rightLegAngle;
    };
    
    person.stopWalking = function() {
        this.walking = false;
        this.leftLeg.rotation.x = 0;
        this.rightLeg.rotation.x = 0;
    };
    
    return person;
}