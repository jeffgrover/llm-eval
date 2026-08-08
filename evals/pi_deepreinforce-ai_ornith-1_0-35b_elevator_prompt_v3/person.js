// person.js - Person model factory for elevator simulation

function createPerson() {
    const person = new THREE.Group();
    
    // Body color: blue (#3498db)
    const bodyColor = 0x3498db;
    // Skin tone: #ffdbac
    const skinColor = 0xffdbac;
    // Leg color: dark (#2c3e50)
    const legColor = 0x2c3e50;
    
    // Legs - positioned at the bottom
    const legGeometry = new THREE.BoxGeometry(0.3, 1.2, 0.3);
    const legMaterial = new THREE.MeshLambertMaterial({ color: legColor });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.25, 0.6, 0); // Half height so feet are at y=0
    person.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.25, 0.6, 0);
    person.add(rightLeg);
    
    // Torso - above legs
    const torsoHeight = 1.4;
    const torsoGeometry = new THREE.BoxGeometry(0.7, torsoHeight, 0.4);
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 1.2 + torsoHeight / 2, 0); // On top of legs
    person.add(torso);
    
    // Arms - hanging down from shoulders
    const armGeometry = new THREE.BoxGeometry(0.25, 1.0, 0.25);
    const armMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.5, 1.2 + torsoHeight - 0.3, 0); // Shoulder level
    person.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.5, 1.2 + torsoHeight - 0.3, 0);
    person.add(rightArm);
    
    // Head - on top of torso
    const headRadius = 0.3;
    const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.2 + torsoHeight + headRadius, 0); // On top of torso
    person.add(head);
    
    // Store references in userData for animation
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };
    
    return person;
}
