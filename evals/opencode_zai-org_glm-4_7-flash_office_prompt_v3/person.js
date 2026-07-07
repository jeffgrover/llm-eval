const WORLD = {
    FLOOR_HEIGHT: 3.4,
    FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22,
    BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3,
    SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};

function createPerson({ bodyColor, skinColor, legColor } = {}) {
    const person = new THREE.Group();
    person.userData = { isWalking: false, isSitting: false, walkPhase: 0 };

    const bodyColor = bodyColor || 0x4a6fa5;
    const skinColor = skinColor || 0xffdbac;
    const legColor = legColor || 0x2c3e50;

    const hip = new THREE.Group();
    hip.position.y = 0.9;
    person.add(hip);

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.15, 0, 0);
    hip.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.15, 0, 0);
    hip.add(rightLeg);

    const torso = new THREE.Group();
    torso.position.y = 0.9;
    hip.add(torso);

    const torsoMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.7, 0.3),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    torso.add(torsoMesh);

    const head = new THREE.Group();
    head.position.y = 0.6;
    torso.add(head);

    const headMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    head.add(headMesh);

    const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshLambertMaterial({ color: skinColor })
    );
    nose.position.set(0, 0.05, 0.22);
    head.add(nose);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.35, 0.4, 0);
    torso.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.35, 0.4, 0);
    torso.add(rightArm);

    const leftArmMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.5, 0.15),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    leftArm.add(leftArmMesh);

    const rightArmMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.5, 0.15),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    rightArm.add(rightArmMesh);

    person.userData.legs = { left: leftLeg, right: rightLeg };
    person.userData.arms = { left: leftArm, right: rightArm };

    return person;
}

function animatePersonWalking(person, dt) {
    const { isSitting, isWalking, walkPhase } = person.userData;

    if (isSitting) {
        person.userData.legs.left.rotation.x = -Math.PI / 2;
        person.userData.legs.right.rotation.x = -Math.PI / 2;
        person.userData.arms.left.rotation.x = -Math.PI / 4;
        person.userData.arms.right.rotation.x = -Math.PI / 4;
        person.userData.walkPhase = 0;
    } else if (isWalking) {
        person.userData.walkPhase += dt * 8;
        const phase = person.userData.walkPhase;
        person.userData.legs.left.rotation.x = Math.sin(phase) * 0.6;
        person.userData.legs.right.rotation.x = -Math.sin(phase) * 0.6;
        person.userData.arms.left.rotation.x = -Math.sin(phase) * 0.5;
        person.userData.arms.right.rotation.x = Math.sin(phase) * 0.5;
    } else {
        person.userData.legs.left.rotation.x = 0;
        person.userData.legs.right.rotation.x = 0;
        person.userData.arms.left.rotation.x = 0;
        person.userData.arms.right.rotation.x = 0;
        person.userData.walkPhase = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;