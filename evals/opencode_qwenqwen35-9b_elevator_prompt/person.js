/**
 * Person Model Factory Function
 * Creates 3D humanoid figures made from Three.js primitives
 */

const PERSON_CONFIG = {
    LEG_HEIGHT: 0.15,
    TORSO_HEIGHT: 0.25,
    HEAD_RADIUS: 0.06,
    HEAD_HEIGHT: 0.08,
    ARM_LENGTH: 0.12,
    BODY_WIDTH: 0.12,
    BODY_DEPTH: 0.10
};

/**
 * Creates a person mesh positioned at the correct floor level
 * @param {THREE.Vector3} position - World position where feet should be
 * @param {number} floorY - Y height of the floor
 * @returns {Object} Person with body, legs array, and door references
 */
function createPerson(position, floorY) {
    const personGroup = new THREE.Group();
    
    // Calculate total height: torso + head
    const headY = floorY + PERSON_CONFIG.LEG_HEIGHT + PERSON_CONFIG.TORSO_HEIGHT + PERSON_CONFIG.HEAD_HEIGHT;
    
    // Group for body parts (legs pivot from hips)
    const bodyPivot = new THREE.Group();
    bodyPivot.position.y = PERSON_CONFIG.TORSO_HEIGHT + PERSON_CONFIG.HEAD_HEIGHT / 2;
    personGroup.add(bodyPivot);
    
    // Left leg - dark legs color
    const leftLeg = createCylinder(0.035, 0.15, 16, true);
    leftLeg.rotation.x = Math.PI / 2;
    leftLeg.position.set(-PERSON_CONFIG.BODY_WIDTH / 2, PERSON_CONFIG.LEG_HEIGHT - leftLeg.geometry.parameters.height / 2, 0);
    bodyPivot.add(leftLeg);
    
    // Right leg - dark legs color
    const rightLeg = createCylinder(0.035, 0.15, 16, true);
    rightLeg.rotation.x = Math.PI / 2;
    rightLeg.position.set(PERSON_CONFIG.BODY_WIDTH / 2, PERSON_CONFIG.LEG_HEIGHT - rightLeg.geometry.parameters.height / 2, 0);
    bodyPivot.add(rightLeg);
    
    // Torso - blue body color
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(PERSON_CONFIG.BODY_WIDTH * 1.2, PERSON_CONFIG.TORSO_HEIGHT, PERSON_CONFIG.BODY_DEPTH),
        createMaterial('#3498db')
    );
    torso.position.y = PERSON_CONFIG.LEG_HEIGHT + PERSON_CONFIG.TORSO_HEIGHT / 2;
    personGroup.add(torso);
    
    // Arms - attached at shoulders, hanging down
    const armPivot = new THREE.Group();
    armPivot.position.set(0, PERSON_CONFIG.LEG_HEIGHT + PERSON_CONFIG.TORSO_HEIGHT, 0);
    torso.add(armPivot);
    
    // Left arm with pivot shoulder structure (hanging from shoulder)
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-PERSON_CONFIG.BODY_WIDTH / 2.5, -PERSON_CONFIG.ARM_LENGTH * 0.3, 0);
    armPivot.add(leftArmGroup);
    
    const leftUpperArm = createCylinder(0.03, PERSON_CONFIG.ARM_LENGTH, 8, true);
    leftUpperArm.rotation.x = Math.PI / 2;
    leftUpperArm.position.set(PERSON_CONFIG.BODY_WIDTH / 5, 0, 0);
    leftArmGroup.add(leftUpperArm);
    
    const leftLowerArm = createCylinder(0.03, PERSON_CONFIG.ARM_LENGTH * 0.7, 8, true);
    leftLowerArm.rotation.x = Math.PI / 2;
    leftLowerArm.position.set(PERSON_CONFIG.BODY_WIDTH / 5, -PERSON_CONFIG.ARM_LENGTH * 0.4, 0);
    leftArmGroup.add(leftLowerArm);
    
    // Right arm with pivot shoulder structure (hanging from shoulder)
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(PERSON_CONFIG.BODY_WIDTH / 2.5, -PERSON_CONFIG.ARM_LENGTH * 0.3, 0);
    armPivot.add(rightArmGroup);
    
    const rightUpperArm = createCylinder(0.03, PERSON_CONFIG.ARM_LENGTH, 8, true);
    rightUpperArm.rotation.x = Math.PI / 2;
    rightUpperArm.position.set(-PERSON_CONFIG.BODY_WIDTH / 5, 0, 0);
    rightArmGroup.add(rightUpperArm);
    
    const rightLowerArm = createCylinder(0.03, PERSON_CONFIG.ARM_LENGTH * 0.7, 8, true);
    rightLowerArm.rotation.x = Math.PI / 2;
    rightLowerArm.position.set(-PERSON_CONFIG.BODY_WIDTH / 5, -PERSON_CONFIG.ARM_LENGTH * 0.4, 0);
    rightArmGroup.add(rightLowerArm);
    
    // Head - skin tone color on top of body structure
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(PERSON_CONFIG.HEAD_RADIUS, 16, 16),
        createMaterial('#ffdbac')
    );
    head.position.y = PERSON_CONFIG.TORSO_HEIGHT / 2 + PERSON_CONFIG.HEAD_HEIGHT;
    personGroup.add(head);
    
    // Position person on correct floor
    personGroup.position.copy(position);
    personGroup.position.y = floorY;
    
    return {
        group: personGroup,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        torso: torso,
        head: head
    };
}

/**
 * Creates a cylinder geometry
 */
function createCylinder(r, h, segments, hollow) {
    const radius = hollow ? new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-r, 0, 0), new THREE.Vector3(0, 0, 0)]) : r;
    return new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, h, segments, 1, true),
        new THREE.MeshPhongMaterial({ color: 0x444444, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.7 })
    );
}

/**
 * Creates material with transparency settings
 */
function createMaterial(color) {
    return new THREE.MeshPhongMaterial({
        color: color,
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
        opacity: 0.9
    });
}

/**
 * Animate walking legs during movement
 */
window.walkPerson = function(personObj, speed) {
    const time = Date.now() * 0.01;
    const walkSpeed = speed > 1 ? Math.min(time / (3000 / speed), Math.PI) : 0;
    
    // Alternate leg swing using sine wave
    personObj.leftLeg.rotation.x = Math.sin(walkSpeed) * 0.5;
    personObj.rightLeg.rotation.x = Math.sin(walkSpeed + Math.PI) * 0.5;
};

/**
 * Reset legs to standing position
 */
window.resetPersonLegs = function(personObj) {
    personObj.leftLeg.rotation.x = 0;
    personObj.rightLeg.rotation.x = 0;
};
