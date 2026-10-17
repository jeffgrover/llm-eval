// person.js
// Factory for simple 3D humanoid figures built from Three.js primitives.
// The returned THREE.Group has its origin at the person's FEET (y = 0),
// so placing the group at a floor's Y puts the feet exactly on that floor.
//
// Body structure from bottom to top: legs -> torso -> head,
// with arms hanging DOWN from the shoulders.
//
// This file intentionally declares NO shared simulation globals
// (scene, camera, renderer, controls, elevatorCar, people all live in
// elevator.js). It only defines the global factory createPerson(color).

function createPerson(color) {
    var bodyColor = color || 0x3498db;   // blue torso / arms
    var skinColor = 0xffdbac;            // skin-tone head
    var legColor = 0x2c3e50;             // dark legs

    var person = new THREE.Group();
    person.name = "person";

    // ---- Dimensions -------------------------------------------------
    var legHeight = 0.9;
    var legWidth = 0.16;
    var legDepth = 0.16;
    var hipY = legHeight;                 // hip pivot height above feet
    var torsoHeight = 0.7;
    var torsoWidth = 0.5;
    var torsoDepth = 0.3;
    var shoulderY = hipY + torsoHeight - 0.1; // near the top of the torso
    var armLength = 0.6;
    var headRadius = 0.22;

    // ---- Legs (pivot at the hips so they swing from the top) --------
    // Left leg
    var leftLeg = new THREE.Group();
    leftLeg.position.set(-0.18, hipY, 0);
    var leftLegMesh = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        new THREE.MeshLambertMaterial({ color: legColor })
    );
    // Mesh hangs DOWN from the pivot: its centre is half a leg below the hip.
    leftLegMesh.position.y = -legHeight / 2;
    leftLeg.add(leftLegMesh);
    person.add(leftLeg);

    // Right leg
    var rightLeg = new THREE.Group();
    rightLeg.position.set(0.18, hipY, 0);
    var rightLegMesh = new THREE.Mesh(
        new THREE.BoxGeometry(legWidth, legHeight, legDepth),
        new THREE.MeshLambertMaterial({ color: legColor })
    );
    rightLegMesh.position.y = -legHeight / 2;
    rightLeg.add(rightLegMesh);
    person.add(rightLeg);

    // ---- Torso ------------------------------------------------------
    var torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    torso.position.set(0, hipY + torsoHeight / 2, 0);
    person.add(torso);

    // ---- Arms (hang DOWN from the shoulders) ------------------------
    var armWidth = 0.12;
    var armDepth = 0.12;

    var leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armLength, armDepth),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    // Shoulder pivot at the top of the arm; the arm hangs below it.
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, shoulderY - armLength / 2, 0);
    person.add(leftArm);

    var rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(armWidth, armLength, armDepth),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, shoulderY - armLength / 2, 0);
    person.add(rightArm);

    // ---- Head -------------------------------------------------------
    var head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 16, 16),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.position.set(0, hipY + torsoHeight + headRadius, 0);
    person.add(head);

    // ---- Animation contract (read every frame by elevator.js) -------
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
