// person.js
// Humanoid figure factory for the elevator simulation.
// Plain script (no ES module syntax): defines the global createPerson()
// used by elevator.js.
//
// Conventions: the group's origin is at the person's feet (y = 0) so the
// group can be placed directly at floor height, and the person faces +Z
// when rotation.y === 0.

const PERSON_LEG_HEIGHT = 0.8;
const PERSON_TORSO_HEIGHT = 0.8;
const PERSON_TORSO_WIDTH = 0.5;
const PERSON_TORSO_DEPTH = 0.28;
const PERSON_HEAD_RADIUS = 0.25;
const PERSON_ARM_LENGTH = 0.65;

function createPerson() {
  const person = new THREE.Group();

  const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

  // Legs: the geometry is shifted downward so each mesh's origin sits at the
  // hip joint — rotating the mesh on X swings the whole leg from the hip.
  const legGeometry = new THREE.BoxGeometry(0.16, PERSON_LEG_HEIGHT, 0.16);
  legGeometry.translate(0, -PERSON_LEG_HEIGHT / 2, 0);

  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.position.set(-0.13, PERSON_LEG_HEIGHT, 0);
  person.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.position.set(0.13, PERSON_LEG_HEIGHT, 0);
  person.add(rightLeg);

  // Torso sits on top of the legs.
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(PERSON_TORSO_WIDTH, PERSON_TORSO_HEIGHT, PERSON_TORSO_DEPTH),
    bodyMaterial
  );
  torso.position.y = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT / 2;
  person.add(torso);

  // Head on top of the torso.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(PERSON_HEAD_RADIUS, 16, 12),
    skinMaterial
  );
  head.position.y = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT + PERSON_HEAD_RADIUS;
  person.add(head);

  // Small nose so the facing direction (+Z) is visible from outside.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.08), skinMaterial);
  nose.position.set(0, head.position.y, PERSON_HEAD_RADIUS + 0.02);
  person.add(nose);

  // Arms hang straight DOWN from shoulder level (top of the torso).
  const armGeometry = new THREE.BoxGeometry(0.12, PERSON_ARM_LENGTH, 0.12);
  const shoulderY = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT - 0.05;
  const armX = PERSON_TORSO_WIDTH / 2 + 0.07;

  const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
  leftArm.position.set(-armX, shoulderY - PERSON_ARM_LENGTH / 2, 0);
  person.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
  rightArm.position.set(armX, shoulderY - PERSON_ARM_LENGTH / 2, 0);
  person.add(rightArm);

  // Contract required by elevator.js (rule H7): the animation loop reads
  // these fields every frame.
  person.userData = {
    leftLeg: leftLeg,
    rightLeg: rightLeg,
    isWalking: false
  };
  person.userData.walkTime = 0;

  return person;
}
