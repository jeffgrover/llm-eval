// person.js
// Global factory to create a simple humanoid figure
// Returns a THREE.Group with correctly positioned parts

(function(){
  // Ensure THREE is available
  if (typeof THREE === 'undefined') {
    console.error('THREE not loaded before person.js');
    return;
  }

  const BODY_COLOR = 0x3498db; // blue body
  const SKIN_COLOR = 0xffdbac; // skin tone for head
  const LEG_COLOR = 0x2c3e50; // dark legs

  // Helper to create a cylinder mesh
  function cylinder(radiusTop, radiusBottom, height, color) {
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16);
    const mat = new THREE.MeshPhongMaterial({color});
    return new THREE.Mesh(geo, mat);
  }

  // Helper to create a box mesh
  function box(w, h, d, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshPhongMaterial({color});
    return new THREE.Mesh(geo, mat);
  }

  // Main factory function
  window.createPerson = function(){
    const group = new THREE.Group();

    // Dimensions (all in world units)
    const LEG_HEIGHT = 1.2;
    const LEG_RADIUS = 0.15;
    const TORSO_HEIGHT = 1.0;
    const TORSO_WIDTH = 0.6;
    const TORSO_DEPTH = 0.3;
    const HEAD_RADIUS = 0.35;
    const ARM_LENGTH = 0.8;
    const ARM_RADIUS = 0.07;

    // Left leg
    const leftLeg = cylinder(LEG_RADIUS, LEG_RADIUS, LEG_HEIGHT, LEG_COLOR);
    leftLeg.position.set(-0.15, LEG_HEIGHT/2, 0);
    group.add(leftLeg);
    // Right leg
    const rightLeg = cylinder(LEG_RADIUS, LEG_RADIUS, LEG_HEIGHT, LEG_COLOR);
    rightLeg.position.set(0.15, LEG_HEIGHT/2, 0);
    group.add(rightLeg);

    // Torso
    const torso = box(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH, BODY_COLOR);
    torso.position.set(0, LEG_HEIGHT + TORSO_HEIGHT/2, 0);
    group.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
    const headMat = new THREE.MeshPhongMaterial({color: SKIN_COLOR});
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS, 0);
    group.add(head);

    // Arms (attached to shoulders)
    const leftArm = cylinder(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, BODY_COLOR);
    leftArm.rotation.z = Math.PI/2; // point downwards
    leftArm.position.set(-(TORSO_WIDTH/2 + ARM_RADIUS), LEG_HEIGHT + TORSO_HEIGHT - ARM_LENGTH/2, 0);
    group.add(leftArm);

    const rightArm = cylinder(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, BODY_COLOR);
    rightArm.rotation.z = Math.PI/2;
    rightArm.position.set((TORSO_WIDTH/2 + ARM_RADIUS), LEG_HEIGHT + TORSO_HEIGHT - ARM_LENGTH/2, 0);
    group.add(rightArm);

    // Store references for animation
    group.userData = {
      legs: [leftLeg, rightLeg],
      legSwingPhase: 0 // for walking animation
    };

    return group;
  };
})();
