// Person factory function - creates a 3D humanoid figure
// No imports or exports - uses global THREE object

// Person height constants
const LEG_LENGTH = 0.7;
const TORSO_LENGTH = 1.2;
const HEAD_RADIUS = 0.4;
const TOTAL_HEIGHT = LEG_LENGTH + TORSO_LENGTH + HEAD_RADIUS;

// Create a single person mesh with animated legs
function createPerson() {
    const person = new THREE.Group();

    // Materials
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db }); // Blue body
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone head
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // Dark legs

    // Legs (two cylinders, will be animated)
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.12, LEG_LENGTH, 8);
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, LEG_LENGTH / 2 - TOTAL_HEIGHT / 2, 0);
    leftLeg.castShadow = true;
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, LEG_LENGTH / 2 - TOTAL_HEIGHT / 2, 0);
    rightLeg.castShadow = true;

    // Torso
    const torsoGeometry = new THREE.CylinderGeometry(0.3, 0.25, TORSO_LENGTH, 8);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, HEAD_RADIUS + TORSO_LENGTH / 2 - TOTAL_HEIGHT / 2, 0);
    torso.castShadow = true;

    // Arms (hanging down from shoulders)
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.08, 0.6, 8);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.4, TORSO_LENGTH / 2 + HEAD_RADIUS - 0.3 - TOTAL_HEIGHT / 2, 0);
    leftArm.rotation.x = Math.PI / 2;
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = true;

    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(0.4, TORSO_LENGTH / 2 + HEAD_RADIUS - 0.3 - TOTAL_HEIGHT / 2, 0);
    rightArm.rotation.x = Math.PI / 2;
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;

    // Head
    const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.set(0, HEAD_RADIUS / 2 - TOTAL_HEIGHT / 2, 0);
    head.castShadow = true;

    // Add all parts to person group
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(leftArm);
    person.add(rightArm);
    person.add(head);

    // Set userData for animation access - REQUIRED by animation loop
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}

// Expose createPerson globally for elevator.js to use
window.createPerson = createPerson;
