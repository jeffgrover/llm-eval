// person.js
// Plain global script — no ES6 modules, no module syntax (see H2).
// Defines a global factory function createPerson() that returns a THREE.Group
// whose userData is populated per the H7 contract:
//     person.userData = { leftLeg, rightLeg, isWalking: false }
//
// Body structure from bottom to top: legs -> torso -> head, with arms hanging
// DOWN from the shoulders. The lowest point of the figure (the soles of the
// feet) is at local y = 0 so that placing the group at world y = floorY puts
// the feet exactly on the floor surface (no protruding through the floor).

// People colors
var PERSON_BODY_COLOR = 0x3498db; // blue body
var PERSON_HEAD_COLOR = 0xffdbac; // skin tone head
var PERSON_LEG_COLOR  = 0x2c3e50; // dark legs

function createPerson(bodyColor) {
    var person = new THREE.Group();

    var bodyMat = new THREE.MeshStandardMaterial({ color: (bodyColor !== undefined ? bodyColor : PERSON_BODY_COLOR) });
    var headMat = new THREE.MeshStandardMaterial({ color: PERSON_HEAD_COLOR });
    var legMat  = new THREE.MeshStandardMaterial({ color: PERSON_LEG_COLOR });

    // --- Dimensions ---
    var legLen   = 0.8;
    var legW     = 0.18;
    var torsoH   = 0.8;
    var torsoW   = 0.5;
    var torsoD   = 0.3;
    var headR    = 0.2;
    var armLen   = 0.7;
    var armW     = 0.15;

    var hipY     = legLen;          // top of the legs / hip pivot height = 0.8
    var torsoTop = hipY + torsoH;   // 1.6
    var shoulderY = torsoTop - 0.05;

    // --- LEFT LEG ---
    // The leg is parented to a Group positioned at the HIP. The leg mesh is
    // offset downward by half its length so that rotating the group about X
    // swings the whole leg from the hip (NOT the knee).
    var leftLeg = new THREE.Group();
    leftLeg.position.set(-legW, hipY, 0);
    var leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(legW, legLen, legW), legMat);
    leftLegMesh.position.y = -legLen / 2; // extends DOWN from the hip pivot
    leftLeg.add(leftLegMesh);
    person.add(leftLeg);

    // --- RIGHT LEG ---
    var rightLeg = new THREE.Group();
    rightLeg.position.set(legW, hipY, 0);
    var rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(legW, legLen, legW), legMat);
    rightLegMesh.position.y = -legLen / 2;
    rightLeg.add(rightLegMesh);
    person.add(rightLeg);

    // --- TORSO --- (sits on top of the hips)
    var torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), bodyMat);
    torso.position.y = hipY + torsoH / 2; // 1.2
    person.add(torso);

    // --- HEAD --- (rests on top of the torso)
    var head = new THREE.Mesh(new THREE.SphereGeometry(headR, 18, 18), headMat);
    head.position.y = torsoTop + headR; // 1.8
    person.add(head);

    // --- ARMS --- hang DOWN from the shoulders (top of arm at shoulder level)
    var armOffsetX = torsoW / 2 + armW / 2; // 0.325
    var leftArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armLen, armW), bodyMat);
    leftArm.position.set(-armOffsetX, shoulderY - armLen / 2, 0);
    person.add(leftArm);
    var rightArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armLen, armW), bodyMat);
    rightArm.position.set(armOffsetX, shoulderY - armLen / 2, 0);
    person.add(rightArm);

    // --- userData contract (H7) ---
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false,
        walkPhase: 0,
        floor: 0
    };

    // Draw people above the transparent building/elevator surfaces.
    person.traverse(function (o) {
        if (o.isMesh) { o.renderOrder = 2; }
    });

    return person;
}

// Expose globally (belt and suspenders — it is already a top-level declaration).
window.createPerson = createPerson;
