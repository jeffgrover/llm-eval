// Person factory function
// Creates a simple 3D humanoid figure and returns a THREE.Group

function createPerson() {
    const person = new THREE.Group();

    // Color scheme: blue body, skin tone head, dark legs
    const bodyColor = 0x3498db;
    const headColor = 0xffdbac;
    const legColor = 0x2c3e50;

    // Leg geometry - pivot from hips
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8);
    const leftLegMaterial = new THREE.MeshPhongMaterial({ color: legColor });
    const rightLegMaterial = new THREE.MeshPhongMaterial({ color: legColor });
    
    const leftLeg = new THREE.Mesh(legGeometry, leftLegMaterial);
    const rightLeg = new THREE.Mesh(legGeometry, rightLegMaterial);

    // Position legs at hip level, slightly apart
    leftLeg.position.set(-0.12, 0.3, 0);
    rightLeg.position.set(0.12, 0.3, 0);
    
    person.add(leftLeg);
    person.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8);
    const torsoMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, 0.65, 0);
    person.add(torso);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({ color: headColor });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0.95, 0);
    person.add(head);

    // Arms hanging down from shoulders
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
    const armMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.25, 0.75, 0);
    leftArm.rotation.z = Math.PI / 4; // Slight bend at elbow
    person.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.25, 0.75, 0);
    rightArm.rotation.z = -Math.PI / 4; // Slight bend at elbow
    person.add(rightArm);

    // Populate userData contract (H7)
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    // Face the person toward the elevator (positive Z is in front of elevator)
    // Person should face negative Z to look at elevator
    person.rotation.y = Math.PI;

    return person;
}
