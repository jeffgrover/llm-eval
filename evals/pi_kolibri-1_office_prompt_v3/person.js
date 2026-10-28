// person.js
// Simple person mesh factory and walking animation

const shirts = ["#ff5555", "#55aaff", "#55ff55", "#ffaa55", "#aaff55"];
const skinTones = ["#ffcc99", "#ffb366", "#ffa500", "#d98265", "#b8654f"];
const pants = ["#334455", "#667788", "#223344", "#445566", "#556677"];

function createPerson({ bodyColor = shirts[0], skinColor = skinTones[0], legColor = pants[0] } = {}) {
    const hipY = 1.0;
    // Legs
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, hipY * 0.5, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    const leftShin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, hipY * 0.5, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    const leftFoot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    leftThigh.position.y = hipY * 0.25;
    leftShin.position.y = hipY * 0.75;
    leftLeg.add(leftThigh);
    leftLeg.add(leftShin);
    leftLeg.add(leftFoot);
    leftLeg.position.x = -0.2;
    const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, hipY * 0.5, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    const rightShin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, hipY * 0.5, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    const rightFoot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: legColor }));
    rightThigh.position.y = hipY * 0.25;
    rightShin.position.y = hipY * 0.75;
    rightLeg.add(rightThigh);
    rightLeg.add(rightShin);
    rightLeg.add(rightFoot);
    rightLeg.position.x = 0.2;
    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), new THREE.MeshBasicMaterial({ color: bodyColor }));
    torso.position.y = hipY + 0.6;
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), new THREE.MeshBasicMaterial({ color: skinColor }));
    head.position.y = hipY + 1.2 + 0.25;
    const nose = new THREE.Mesh(new THREE.HemisphereGeometry(0.05, 0.05, 8, 4, 0, Math.PI, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: skinColor }));
    nose.position.z = 0.4;
    nose.rotation.x = -Math.PI / 2;
    // Arms
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const shoulderY = hipY + 0.8;
    const leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), new THREE.MeshBasicMaterial({ color: bodyColor }));
    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), new THREE.MeshBasicMaterial({ color: bodyColor }));
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: skinColor }));
    leftUpperArm.position.y = shoulderY * 0.25;
    leftForearm.position.y = shoulderY * 0.75;
    leftArm.add(leftUpperArm);
    leftArm.add(leftForearm);
    leftArm.add(leftHand);
    leftArm.position.x = -0.35;
    const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), new THREE.MeshBasicMaterial({ color: bodyColor }));
    const rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), new THREE.MeshBasicMaterial({ color: bodyColor }));
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: skinColor }));
    rightUpperArm.position.y = shoulderY * 0.25;
    rightForearm.position.y = shoulderY * 0.75;
    rightArm.add(rightUpperArm);
    rightArm.add(rightForearm);
    rightArm.add(rightHand);
    rightArm.position.x = 0.35;
    // Assemble person
    const person = new THREE.Group();
    person.add(leftLeg);
    person.add(rightLeg);
    person.add(torso);
    person.add(head);
    person.add(nose);
    person.add(leftArm);
    person.add(rightArm);
    person.userData = {
        isSitting: false,
        isWalking: false,
        walkPhase: 0,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        leftArm: leftArm,
        rightArm: rightArm,
        bodyColor: bodyColor,
        skinColor: skinColor,
        legColor: legColor
    };
    return person;
}

function animatePersonWalking(person, dt) {
    const ud = person.userData;
    if (ud.isSitting) {
        ud.leftLeg.rotation.x = -Math.PI / 2;
        ud.rightLeg.rotation.x = -Math.PI / 2;
        ud.leftArm.rotation.x = -Math.PI / 4;
        ud.rightArm.rotation.x = -Math.PI / 4;
        ud.walkPhase = 0;
    } else if (ud.isWalking) {
        ud.walkPhase += dt * 8;
        ud.leftLeg.rotation.x = Math.sin(ud.walkPhase) * 0.6;
        ud.rightLeg.rotation.x = Math.sin(ud.walkPhase) * 0.6;
        ud.leftArm.rotation.x = -Math.sin(ud.walkPhase) * 0.5;
        ud.rightArm.rotation.x = -Math.sin(ud.walkPhase) * 0.5;
    } else {
        ud.leftLeg.rotation.x = 0;
        ud.rightLeg.rotation.x = 0;
        ud.leftArm.rotation.x = 0;
        ud.rightArm.rotation.x = 0;
    }
}

window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;