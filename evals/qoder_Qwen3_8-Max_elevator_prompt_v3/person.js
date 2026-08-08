// person.js - person model factory only. Shared simulation globals live in elevator.js.

function createPerson() {
  const person = new THREE.Group();

  const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x3498db });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });

  // Legs pivot at the hips (y = 0.75); geometry hangs down so feet sit at y = 0.
  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.75, 10), legMaterial);
  leftLeg.position.set(-0.13, 0.75, 0);
  person.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.75, 10), legMaterial);
  rightLeg.position.set(0.13, 0.75, 0);
  person.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), bodyMaterial);
  torso.position.y = 1.05;
  person.add(torso);

  // Arms hang down from shoulder level.
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), bodyMaterial);
  leftArm.position.set(-0.33, 1.06, 0);
  person.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), bodyMaterial);
  rightArm.position.set(0.33, 1.06, 0);
  person.add(rightArm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skinMaterial);
  head.position.y = 1.52;
  person.add(head);

  person.userData = {
    leftLeg: leftLeg,
    rightLeg: rightLeg,
    isWalking: false
  };

  return person;
}
