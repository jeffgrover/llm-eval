// Person factory function - creates a 3D humanoid figure
function createPerson() {
  const personGroup = new THREE.Group();
  
  // Body structure from bottom to top: legs → torso → head, with arms at shoulder level
  
  // Legs (dark blue)
  const legMaterial = new THREE.MeshStandardMaterial({
    color: '#2c3e50',
    roughness: 0.8,
    metalness: 0.1
  });
  const legGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
  
  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  
  // Position legs at hip level (1.2 units from bottom)
  const hipHeight = 1.2;
  leftLeg.position.set(-0.4, hipHeight + 0.75, 0);
  rightLeg.position.set(0.4, hipHeight + 0.75, 0);
  
  // Rotate legs to face forward (90 degrees)
  leftLeg.rotation.y = Math.PI / 2;
  rightLeg.rotation.y = Math.PI / 2;
  
  personGroup.add(leftLeg);
  personGroup.add(rightLeg);
  
  // Torso (blue body)
  const torsoMaterial = new THREE.MeshStandardMaterial({
    color: '#3498db',
    roughness: 0.5,
    metalness: 0.1
  });
  const torsoGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2.5, 8);
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.position.set(0, hipHeight + 0.75 + 0.75, 0); // Positioned at shoulders
  
  // Arms (hanging down from shoulder level)
  const armMaterial = new THREE.MeshStandardMaterial({
    color: '#3498db',
    roughness: 0.5,
    metalness: 0.1
  });
  const armGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6);
  
  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  const rightArm = new THREE.Mesh(armGeometry, armMaterial);
  
  // Position arms at shoulder level
  const shoulderHeight = hipHeight + 0.75;
  leftArm.position.set(-0.4, shoulderHeight - 0.6, 0);
  rightArm.position.set(0.4, shoulderHeight - 0.6, 0);
  
  // Rotate arms to hang downward
  leftArm.rotation.z = Math.PI / 2;
  rightArm.rotation.z = Math.PI / 2;
  
  personGroup.add(torso);
  personGroup.add(leftArm);
  personGroup.add(rightArm);
  
  // Head (skin tone)
  const headMaterial = new THREE.MeshStandardMaterial({
    color: '#ffdbac',
    roughness: 0.5,
    metalness: 0.1
  });
  const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  
  // Position head at top of torso (shoulder + neck length)
  head.position.set(0, shoulderHeight + 0.5, 0);
  
  personGroup.add(head);
  
  // Store reference to leg meshes for animation
  personGroup.userData = {
    leftLeg,
    rightLeg,
    torso,
    leftArm,
    rightArm,
    originalRotation: 0,
    isWalking: false,
    walkPhase: 0
  };
  
  return personGroup;
}
