// person.js - Humanoid figure factory function

var PERSON_LEG_LENGTH = 0.6;
var PERSON_TORSO_HEIGHT = 1.0;
var PERSON_HEAD_RADIUS = 0.35;
var PERSON_ARM_LENGTH = 0.7;
var PERSON_WALK_SPEED = 2.0;
var PERSON_MAX_ANGLE = 0.5;

function createPerson() {
    var group = new THREE.Group();

    var legMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
    var torsoMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
    var headMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    var armMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });

    // Legs - pivot from hips (top of leg geometry)
    var legGeometry = new THREE.BoxGeometry(0.18, PERSON_LEG_LENGTH, 0.2);
    legGeometry.translate(0, -PERSON_LEG_LENGTH / 2, 0);

    var leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, PERSON_LEG_LENGTH, 0);
    leftLeg.name = 'leftLeg';

    var rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, PERSON_LEG_LENGTH, 0);
    rightLeg.name = 'rightLeg';

    // Torso
    var torsoGeometry = new THREE.BoxGeometry(0.5, PERSON_TORSO_HEIGHT, 0.3);
    var torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.set(0, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT / 2, 0);
    torso.name = 'torso';

    // Head
    var headGeometry = new THREE.SphereGeometry(PERSON_HEAD_RADIUS, 16, 16);
    var head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT + PERSON_HEAD_RADIUS, 0);
    head.name = 'head';

    // Arms - pivot from shoulders (top of arm geometry), hanging DOWN
    var armGeometry = new THREE.BoxGeometry(0.12, PERSON_ARM_LENGTH, 0.12);
    armGeometry.translate(0, -PERSON_ARM_LENGTH / 2, 0);

    var leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.35, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT, 0);
    leftArm.name = 'leftArm';

    var rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.35, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT, 0);
    rightArm.name = 'rightArm';

    group.add(leftLeg);
    group.add(rightLeg);
    group.add(torso);
    group.add(head);
    group.add(leftArm);
    group.add(rightArm);

    group.walkCycle = 0;
    group.isWalking = false;

    // Reference positions for standing pose
    group.leftLegHomePos = new THREE.Vector3(-0.15, PERSON_LEG_LENGTH, 0);
    group.rightLegHomePos = new THREE.Vector3(0.15, PERSON_LEG_LENGTH, 0);
    group.leftArmHomePos = new THREE.Vector3(-0.35, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT, 0);
    group.rightArmHomePos = new THREE.Vector3(0.35, PERSON_LEG_LENGTH + PERSON_TORSO_HEIGHT, 0);

    return group;
}

function setWalking(person, isWalking) {
    person.isWalking = isWalking;
    if (!isWalking) {
        person.leftLeg.rotation.x = 0;
        person.rightLeg.rotation.x = 0;
        person.leftArm.rotation.x = 0;
        person.rightArm.rotation.x = 0;
        person.walkCycle = 0;
    }
}

function updatePersonAnimation(person, deltaTime, speedMultiplier) {
    if (person.isWalking) {
        person.walkCycle += deltaTime * PERSON_WALK_SPEED * speedMultiplier;

        var angle = Math.sin(person.walkCycle) * PERSON_MAX_ANGLE;

        person.leftLeg.rotation.x = angle;
        person.rightLeg.rotation.x = -angle;

        person.leftArm.rotation.x = -angle * 0.5;
        person.rightArm.rotation.x = angle * 0.5;
    } else {
        person.leftLeg.rotation.x = 0;
        person.rightLeg.rotation.x = 0;
        person.leftArm.rotation.x = 0;
        person.rightArm.rotation.x = 0;
        person.walkCycle = 0;
    }
}
