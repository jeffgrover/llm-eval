function createPerson(color) {
  color = color || 0x3498db;

  var person = new THREE.Group();

  // Legs — pivot at hips so they swing from top
  var leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.25, 0.75, 0);
  var leftLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.75, 0.2),
    new THREE.MeshPhongMaterial({ color: 0x2c3e50 })
  );
  leftLeg.position.y = -0.375;
  leftLegGroup.add(leftLeg);
  person.add(leftLegGroup);

  var rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.25, 0.75, 0);
  var rightLeg = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.75, 0.2),
    new THREE.MeshPhongMaterial({ color: 0x2c3e50 })
  );
  rightLeg.position.y = -0.375;
  rightLegGroup.add(rightLeg);
  person.add(rightLegGroup);

  // Torso
  var torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.7, 0.3),
    new THREE.MeshPhongMaterial({ color: color })
  );
  torso.position.y = 1.4;
  person.add(torso);

  // Arms — hang DOWN from shoulders (y = 1.75 is shoulder level)
  var leftArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.6, 0.15),
    new THREE.MeshPhongMaterial({ color: color })
  );
  leftArm.position.set(-0.425, 1.4, 0);
  leftArm.position.y = 1.4;
  person.add(leftArm);

  var rightArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.6, 0.15),
    new THREE.MeshPhongMaterial({ color: color })
  );
  rightArm.position.set(0.425, 1.4, 0);
  rightArm.position.y = 1.4;
  person.add(rightArm);

  // Head
  var head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshPhongMaterial({ color: 0xffdbac })
  );
  head.position.y = 1.975;
  person.add(head);

  person.userData = {
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup,
    isWalking: false
  };

  return person;
}
