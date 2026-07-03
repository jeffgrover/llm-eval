// person.js
// Humanoid figure factory for the elevator simulation.
// Plain script — defines the global createPerson() used by elevator.js.
// The group origin is at the person's feet (y=0).

const PERSON_LEG_HEIGHT = 0.8;
const PERSON_TORSO_HEIGHT = 0.85;
const PERSON_TORSO_WIDTH = 0.48;
const PERSON_TORSO_DEPTH = 0.26;
const PERSON_HEAD_RADIUS = 0.22;
const PERSON_ARM_LENGTH = 0.6;

function createPerson() {
  const person = new THREE.Group();

  const legMaterial = new THREE.MeshLambertMaterial({ color: 0x1e2a3a });
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x2e6bb6 });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

  // Legs — geometry origin shifted to hip so X-rotation swings the leg.
  const legGeometry = new THREE.BoxGeometry(0.14, PERSON_LEG_HEIGHT, 0.14);
  legGeometry.translate(0, -PERSON_LEG_HEIGHT / 2, 0);

  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.position.set(-0.12, PERSON_LEG_HEIGHT, 0);
  person.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.position.set(0.12, PERSON_LEG_HEIGHT, 0);
  person.add(rightLeg);

  // Torso.
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(PERSON_TORSO_WIDTH, PERSON_TORSO_HEIGHT, PERSON_TORSO_DEPTH),
    bodyMaterial
  );
  torso.position.y = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT / 2;
  person.add(torso);

  // Head.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(PERSON_HEAD_RADIUS, 14, 10),
    skinMaterial
  );
  head.position.y = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT + PERSON_HEAD_RADIUS;
  person.add(head);

  // Nose so facing direction is visible.
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.07),
    skinMaterial
  );
  nose.position.set(0, head.position.y, PERSON_HEAD_RADIUS + 0.01);
  person.add(nose);

  // Arms hang DOWN from shoulder level.
  const armGeometry = new THREE.BoxGeometry(0.11, PERSON_ARM_LENGTH, 0.11);
  const shoulderY = PERSON_LEG_HEIGHT + PERSON_TORSO_HEIGHT - 0.04;
  const armX = PERSON_TORSO_WIDTH / 2 + 0.06;

  const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
  leftArm.position.set(-armX, shoulderY - PERSON_ARM_LENGTH / 2, 0);
  person.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
  rightArm.position.set(armX, shoulderY - PERSON_ARM_LENGTH / 2, 0);
  person.add(rightArm);

  // Animation contract required by elevator.js.
  person.userData = {
    leftLeg: leftLeg,
    rightLeg: rightLeg,
    isWalking: false
  };
  person.userData.walkTime = 0;

  return person;
}
