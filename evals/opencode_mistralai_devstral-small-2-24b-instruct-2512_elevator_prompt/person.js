// person.js - Person model factory function
// Creates simple 3D humanoid figures made from Three.js primitives

function createPerson() {
    const group = new THREE.Group();
    
    // Constants for person dimensions
    const LEG_HEIGHT = 0.8;
    const TORSO_HEIGHT = 1.2;
    const HEAD_SIZE = 0.4;
    const ARM_LENGTH = 0.35;
    const LEG_WIDTH = 0.2;
    const ARM_WIDTH = 0.1;
    
    // Create legs (positioned at floor level)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
    const legMaterial = new THREE.MeshBasicMaterial({
        color: 0x2c3e50,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-LEG_WIDTH / 2 - 0.05, LEG_HEIGHT / 2, 0);
    group.add(leftLeg);
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(LEG_WIDTH / 2 + 0.05, LEG_HEIGHT / 2, 0);
    group.add(rightLeg);
    
    // Create torso
    const torsoGeometry = new THREE.BoxGeometry(0.4, TORSO_HEIGHT, 0.3);
    const torsoMaterial = new THREE.MeshBasicMaterial({
        color: 0x3498db,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2;
    group.add(torso);
    
    // Create head
    const headGeometry = new THREE.SphereGeometry(HEAD_SIZE / 2, 16, 16);
    const headMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdbac,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT + HEAD_SIZE / 2;
    group.add(head);
    
    // Create arms (hanging down from shoulders)
    const armGeometry = new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH);
    const armMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdbac,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-torsoGeometry.parameters.width / 2 + ARM_WIDTH / 2, LEG_HEIGHT + TORSO_HEIGHT - ARM_LENGTH / 2, torsoGeometry.parameters.depth / 2);
    group.add(leftArm);
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(torsoGeometry.parameters.width / 2 - ARM_WIDTH / 2, LEG_HEIGHT + TORSO_HEIGHT - ARM_LENGTH / 2, torsoGeometry.parameters.depth / 2);
    group.add(rightArm);
    
    // Store references for animation
    group.legs = {
        left: leftLeg,
        right: rightLeg
    };
    group.walking = false;
    group.walkTime = 0;
    
    return group;
}
