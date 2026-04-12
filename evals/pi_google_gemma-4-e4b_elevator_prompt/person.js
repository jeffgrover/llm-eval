// person.js

/**
 * Factory function to create a simple 3D humanoid figure.
 * @param {number} height - The total desired height of the character (e.g., 2 units).
 * @returns {THREE.Group} A group object representing the complete character model.
 */
function createPerson(height) {
    const person = new THREE.Group();

    // Constants derived from typical human proportions and the overall height
    const legHeightRatio = 0.4;
    const torsoHeightRatio = 0.35;
    const headHeightRatio = 0.25;
    const armLengthRatio = 0.25;
    const bodyWidth = 0.15;

    // Calculate dimensions
    const legHeight = height * legHeightRatio;
    const torsoHeight = height * torsoHeightRatio;
    const headHeight = height * headHeightRatio;
    const armLength = height * armLengthRatio;

    let currentY = 0; // Relative Y position for stacking parts from the bottom

    // --- Legs ---
    const legGeometry = new THREE.BoxGeometry(bodyWidth * 0.6, legHeight, bodyWidth * 0.6);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50 }); // Dark legs

    // Left Leg (Pivot point is at the hip)
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.y = legHeight / 2;
    person.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.x = bodyWidth * 0.6; // Offset to mimic width/stride
    rightLeg.position.y = legHeight / 2;
    person.add(rightLeg);

    // Store hip pivot point for walking animation
    const hipsPivot = new THREE.Group();
    hipsPivot.add(leftLeg);
    hipsPivot.add(rightLeg);
    person.add(hipsPivot);

    currentY += legHeight;


    // --- Torso ---
    const torsoGeometry = new THREE.BoxGeometry(bodyWidth, torsoHeight, bodyWidth);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db }); // Blue body

    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    // Position the torso base on top of the legs (Y=currentY)
    torso.position.y = currentY + torsoHeight / 2;
    person.add(torso);
    currentY += torsoHeight;


    // --- Head ---
    const headGeometry = new THREE.SphereGeometry(bodyWidth * 0.4, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // Skin tone

    const head = new THREE.Mesh(headGeometry, headMaterial);
    // Position the head base on top of the torso (Y=currentY)
    head.position.y = currentY + headHeight * 0.2; // Adjust position to center sphere vertically on top
    person.add(head);
    currentY += headHeight;

    // --- Arms ---
    const armGeometry = new THREE.BoxGeometry(bodyWidth * 0.15, armLength / 2, bodyWidth * 0.15);
    const armMaterial = torsoMaterial; // Same color as torso

    // Shoulder pivot group
    const shouldersPivot = new THREE.Group();

    // Left Arm (Initial state: hanging down)
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.y = -armLength / 2; // Hang below shoulder level
    shouldersPivot.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.x = bodyWidth * 0.15; // Offset from torso center
    rightArm.position.y = -armLength / 2;
    shouldersPivot.add(rightArm);

    // Position shoulders on the top of the torso
    shouldersPivot.position.y = currentY + torsoHeight * 0.45; // Shoulder level (slightly below midpoint)

    person.add(shouldersPivot);


    return person;
}

window.createPerson = createPerson;