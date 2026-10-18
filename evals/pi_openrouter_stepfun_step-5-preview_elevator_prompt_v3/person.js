/*
 * person.js
 *
 * Person model factory for the Three.js elevator simulation.
 *
 * This file only defines the person factory. It never declares shared
 * simulation globals (scene, camera, renderer, controls, elevatorCar,
 * people) so both classic scripts stay free of duplicate declarations.
 *
 * Geometry layout (the group origin sits exactly on the floor surface):
 *
 *      feet .......... y = 0.00   (bottom of the legs, flush with the floor)
 *      hips .......... y = 0.78   (leg pivots live here, so legs swing
 *                                  from the hips and not from the knees)
 *      torso .......... y = 0.78 .. 1.40
 *      shoulders ..... y = 1.32   (arm pivots live here, arms hang DOWN)
 *      head center ... y = 1.41
 *      head top ...... y = 1.60
 */

function createPerson(color) {
    const bodyColor = color === undefined ? 0x3498db : color;
    const skinColor = 0xffdbac;
    const legColor = 0x2c3e50;

    /* Body proportions, measured in world units. */
    const legHeight = 0.78;
    const torsoWidth = 0.42;
    const torsoHeight = 0.62;
    const torsoDepth = 0.24;
    const headRadius = 0.19;
    const armHeight = 0.54;
    const armWidth = 0.11;
    const shoulderY = legHeight + torsoHeight - 0.08;
    const hipY = legHeight;
    const torsoCenterY = legHeight + torsoHeight / 2;
    const headCenterY = legHeight + torsoHeight + headRadius - 0.06;

    const person = new THREE.Group();

    const bodyMaterial = new THREE.MeshPhongMaterial({ color: bodyColor, shininess: 25 });
    const skinMaterial = new THREE.MeshPhongMaterial({ color: skinColor, shininess: 8 });
    const legMaterial = new THREE.MeshPhongMaterial({ color: legColor, shininess: 8 });

    /* ------------------------------------------------------------------
     * Legs. Each leg is a pivot group placed at the hip; the leg mesh is
     * offset downward by half its height so the pivot rotates the whole
     * leg around the hip and the feet stay at y = 0 while standing.
     * ------------------------------------------------------------------ */
    const legGeometry = new THREE.BoxGeometry(0.17, legHeight, 0.17);

    const leftPivot = new THREE.Group();
    leftPivot.position.set(-0.13, hipY, 0);
    const leftLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    leftLegMesh.position.y = -legHeight / 2;
    leftPivot.add(leftLegMesh);
    person.add(leftPivot);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(0.13, hipY, 0);
    const rightLegMesh = new THREE.Mesh(legGeometry, legMaterial);
    rightLegMesh.position.y = -legHeight / 2;
    rightPivot.add(rightLegMesh);
    person.add(rightPivot);

    /* ------------------------------------------------------------------
     * Torso sits directly on top of the hips.
     * ------------------------------------------------------------------ */
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth),
        bodyMaterial
    );
    torso.position.y = torsoCenterY;
    person.add(torso);

    /* Shoulders give the arms a visible anchor point. */
    const shoulderGeometry = new THREE.BoxGeometry(torsoWidth + 0.04, 0.12, torsoDepth + 0.04);
    const shoulders = new THREE.Mesh(shoulderGeometry, bodyMaterial);
    shoulders.position.y = shoulderY + 0.03;
    person.add(shoulders);

    /* ------------------------------------------------------------------
     * Arms hang DOWN from the shoulders: the pivot sits at the shoulder
     * and the arm mesh reaches down to roughly hip level.
     * ------------------------------------------------------------------ */
    const armGeometry = new THREE.BoxGeometry(armWidth, armHeight, armWidth);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-(torsoWidth / 2 + armWidth / 2), shoulderY, 0);
    const leftArmMesh = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArmMesh.position.y = -armHeight / 2;
    leftArmPivot.add(leftArmMesh);
    person.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(torsoWidth / 2 + armWidth / 2, shoulderY, 0);
    const rightArmMesh = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArmMesh.position.y = -armHeight / 2;
    rightArmPivot.add(rightArmMesh);
    person.add(rightArmPivot);

    /* ------------------------------------------------------------------
     * Head.
     * ------------------------------------------------------------------ */
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 20, 16), skinMaterial);
    head.position.y = headCenterY;
    person.add(head);

    /* Animation contract read by the simulation loop in elevator.js. */
    person.userData = {
        leftLeg: leftPivot,
        rightLeg: rightPivot,
        leftArm: leftArmPivot,
        rightArm: rightArmPivot,
        isWalking: false
    };

    return person;
}
