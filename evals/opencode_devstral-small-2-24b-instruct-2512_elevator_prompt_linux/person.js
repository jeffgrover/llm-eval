// person.js - Person model factory function

// Create a simple humanoid figure using Three.js primitives
function createPerson() {
    const group = new THREE.Group();
    
    // Constants for person dimensions
    const LEG_WIDTH = 0.8;
    const LEG_DEPTH = 0.8;
    const LEG_HEIGHT = 2;
    const TORSO_WIDTH = 1.5;
    const TORSO_DEPTH = 1.5;
    const TORSO_HEIGHT = 3;
    const HEAD_WIDTH = 2;
    const HEAD_DEPTH = 2;
    const HEAD_HEIGHT = 2;
    const ARM_LENGTH = 1.5;
    const ARM_WIDTH = 0.4;

    // Create legs (box from bottom)
    const legs = new THREE.Mesh(
        new THREE.BoxGeometry(LEG_WIDTH, LEG_DEPTH, LEG_HEIGHT),
        new THREE.MeshStandardMaterial({
            color: 0x2c3e50,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    legs.position.y = LEG_HEIGHT / 2;
    group.add(legs);

    // Create torso (box on top of legs)
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(TORSO_WIDTH, TORSO_DEPTH, TORSO_HEIGHT),
        new THREE.MeshStandardMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    torso.position.y = LEG_HEIGHT + TORSO_HEIGHT / 2;
    group.add(torso);

    // Create head (sphere on top of torso)
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_WIDTH / 2, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    head.position.y = LEG_HEIGHT + TORSO_HEIGHT + HEAD_HEIGHT / 2;
    group.add(head);

    // Create left arm (box extending from torso)
    const leftArm = new THREE.Mesh(
        new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH),
        new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    leftArm.position.set(
        -TORSO_WIDTH / 2 + ARM_WIDTH / 2,
        LEG_HEIGHT + TORSO_HEIGHT / 2,
        -ARM_LENGTH / 2
    );
    group.add(leftArm);

    // Create right arm (box extending from torso)
    const rightArm = new THREE.Mesh(
        new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH),
        new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        })
    );
    rightArm.position.set(
        TORSO_WIDTH / 2 - ARM_WIDTH / 2,
        LEG_HEIGHT + TORSO_HEIGHT / 2,
        -ARM_LENGTH / 2
    );
    group.add(rightArm);

    // Store references for animation
    group.legs = legs;
    group.leftArm = leftArm;
    group.rightArm = rightArm;

    return group;
}