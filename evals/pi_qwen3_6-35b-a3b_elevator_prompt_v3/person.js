// person.js - Person model factory function
// No ES6 imports or exports. Defines only createPerson().
// Shared simulation globals (scene, camera, renderer, people, elevatorCar)
// belong in elevator.js.

var DEFAULT_PERSON_COLORS = {
    body: 0x3498db,
    head: 0xffdbac,
    legs: 0x2c3e50
};

function createPerson(colorOverrides) {
    var colors = colorOverrides || DEFAULT_PERSON_COLORS;
    var person = new THREE.Group();

    // LEGS - two thin boxes pivoting from hip level
    var legWidth = 0.3;
    var legHeight = 0.9;
    var legDepth = 0.3;
    var legMat = new THREE.MeshPhongMaterial({
        color: colors.legs,
        side: THREE.DoubleSide
    });
    var leftLeg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, legHeight, legDepth), legMat);
    var rightLeg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, legHeight, legDepth), legMat);
    // Offset legs to left/right of center, with bottom at y=0 (feet on floor)
    leftLeg.position.set(-legWidth / 2, legHeight / 2, 0);
    rightLeg.position.set(legWidth / 2, legHeight / 2, 0);
    // Pivot point is at the top of each leg (hip level)
    leftLeg.geometry.translate(0, -legHeight / 2, 0);
    rightLeg.geometry.translate(0, -legHeight / 2, 0);

    // TORSO - box from hip (y=0.9) to shoulder (y=1.9)
    var torsoWidth = 0.7;
    var torsoHeight = 1.0;
    var torsoDepth = 0.4;
    var torsoMat = new THREE.MeshPhongMaterial({
        color: colors.body,
        side: THREE.DoubleSide
    });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth), torsoMat);
    torso.position.set(0, 0.9 + torsoHeight / 2, 0);

    // ARMS - hang DOWN from shoulders (y = 0.9 + torsoHeight = 1.9)
    var armWidth = 0.15;
    var armLength = 0.7;
    var armDepth = 0.15;
    var armMat = new THREE.MeshPhongMaterial({
        color: colors.body,
        side: THREE.DoubleSide
    });
    var leftArm = new THREE.Mesh(new THREE.BoxGeometry(armWidth, armLength, armDepth), armMat);
    var rightArm = new THREE.Mesh(new THREE.BoxGeometry(armWidth, armLength, armDepth), armMat);
    leftArm.position.set(-torsoWidth / 2 - armWidth / 2, 0.9 + torsoHeight - armLength / 2, 0);
    rightArm.position.set(torsoWidth / 2 + armWidth / 2, 0.9 + torsoHeight - armLength / 2, 0);
    // Pivot at shoulder (top of arm)
    leftArm.geometry.translate(0, -armLength / 2, 0);
    rightArm.geometry.translate(0, -armLength / 2, 0);

    // HEAD - sphere at top of torso
    var headRadius = 0.25;
    var headMat = new THREE.MeshPhongMaterial({
        color: colors.head,
        side: THREE.DoubleSide
    });
    var head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 12, 8), headMat);
    head.position.set(0, 0.9 + torsoHeight + headRadius, 0);

    // Add all parts to person group
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(leftArm);
    person.add(rightArm);
    person.add(head);

    // Store references on userData per H7 contract
    person.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return person;
}
