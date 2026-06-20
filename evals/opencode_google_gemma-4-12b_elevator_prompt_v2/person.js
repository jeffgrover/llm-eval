/**
 * This file defines the creation of a person object.
 * No imports or exports are used as per requirements.
 */

function createPerson() {
    const group = new THREE.Group();

    // Body components
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x3498db });
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffdbac });
    const legMaterial = new THREE.MeshBasicMaterial({ color: 0x2c3e50 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMaterial);
    head.position.y = 1.4;
    group.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMaterial);
    torso.position.y = 0.85;
    group.add(torso);

    // Arms (attached to shoulders)
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), bodyMaterial);
    leftArm.position.set(-0.3, 1.05, 0.1);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), bodyMaterial);
    rightArm.position.set(0.3, 1.05, 0.1);
    group.add(rightArm);

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMaterial);
    leftLeg.position.set(-0.15, 0.35, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMaterial);
    rightLeg.position.set(0.15, 0.35, 0);
    group.add(rightLeg);

    // Attach the data object as required by H7
    group.userData = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        isWalking: false
    };

    return group;
}
