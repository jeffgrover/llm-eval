// Person factory function - creates a 3D humanoid figure
function createPerson() {
    const person = new THREE.Group();
    
    // Colors
    const SKIN_COLOR = 0xffdbac;
    const BODY_COLOR = 0x3498db;
    const LEG_COLOR = 0x2c3e50;
    
    // Person height components (total ~1.7 units)
    const LEG_HEIGHT = 0.8;
    const TORSO_HEIGHT = 0.7;
    const HEAD_RADIUS = 0.25;
    
    // Legs (two cylinders)
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, LEG_HEIGHT, 8);
    const legMaterial = new THREE.MeshLambertMaterial({ color: LEG_COLOR });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.1, LEG_HEIGHT / 2, 0);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.1, LEG_HEIGHT / 2, 0);
    
    // Torso (cylinder)
    const torsoGeometry = new THREE.CylinderGeometry(0.2, 0.15, TORSO_HEIGHT, 8);
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: BODY_COLOR });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, LEG_HEIGHT + TORSO_HEIGHT / 2, 0);
    
    // Arms (two cylinders hanging from shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8);
    const armMaterial = new THREE.MeshLambertMaterial({ color: BODY_COLOR });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.3, LEG_HEIGHT + TORSO_HEIGHT - 0.1, 0);
    leftArm.rotation.x = Math.PI / 2; // Arms hang down
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.3, LEG_HEIGHT + TORSO_HEIGHT - 0.1, 0);
    rightArm.rotation.x = Math.PI / 2; // Arms hang down
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS, 0);
    
    // Add all parts to person group
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(leftArm);
    person.add(rightArm);
    person.add(head);
    
    // Set userData for animation access
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    return person;
}
