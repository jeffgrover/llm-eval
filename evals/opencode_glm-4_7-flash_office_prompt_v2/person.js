// Color palettes for visual distinction
const COLOR_PALETTES = {
    shirts: [0x0077be, 0xcc0000, 0x00aa00, 0xccaa00], // Blue, Red, Green, Yellow
    skinTones: [0xcc9966, 0xb38b63, 0x8d6e63], // Brown variations
    pants: [0x333333, 0x666666, 0x999999] // Grays/Blacks
};

/**
 * Creates a person mesh group.
 * @param {Object} params - Configuration parameters.
 * @param {number} [params.bodyColor] - Base body color.
 * @param {number} [params.skinColor] - Skin color.
 * @param {number} [params.legColor] - Leg color.
 * @returns {THREE.Group} The person mesh.
 */
export function createPerson(params = {}) {
    const colors = COLOR_PALETTES;
    const bodyColor = params.bodyColor || colors.shirts[Math.floor(Math.random() * colors.shirts.length)];
    const skinColor = params.skinColor || colors.skinTones[Math.floor(Math.random() * colors.skinTones.length)];
    const legColor = params.legColor || colors.pants[Math.floor(Math.random() * colors.pants.length)];

    // Main group for the person, origin at hip level
    const person = new THREE.Group();
    person.userData = {
        isSitting: false,
        isWalking: false,
        walkPhase: 0,
        hipPivot: new THREE.Group(), // Pivot for legs
        shoulderPivot: new THREE.Group() // Pivot for arms
    };

    // 1. Legs (Pivoting at Hip)
    const legMaterial = new THREE.MeshStandardMaterial({ color: legColor });
    const torsoHeight = 1.5;
    const legLength = 0.7;
    
    for (let i = 0; i < 2; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, legLength, 8), legMaterial);
        // Position relative to hip pivot
        leg.position.set(i === 0 ? -0.15 : 0.15, -legLength / 2, 0);
        person.userData.hipPivot.add(leg);
    }
    person.userData.hipPivot.position.y = 0; // Feet sit at local y=0 relative to the hip pivot

    // 2. Torso (Above hip pivot)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, torsoHeight, 0.2), new THREE.MeshStandardMaterial({ color: bodyColor }));
    torso.position.y = torsoHeight / 2;
    person.add(torso);

    // 3. Head (On top of torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: skinColor }));
    head.position.y = torsoHeight + 0.15;
    person.add(head);
    
    // 4. Nose (Hemisphere on +Z face of head)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshStandardMaterial({ color: skinColor }));
    nose.position.set(0, 0, 0.2 + 0.05); // Slightly forward on Z axis
    head.add(nose);

    // 5. Arms (Pivoting at Shoulder)
    const armMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
    const armLength = 0.5;
    
    for (let i = 0; i < 2; i++) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, armLength, 0.1), armMaterial);
        arm.rotation.y = i === 0 ? 0 : Math.PI; // Default alignment
        // Position relative to shoulder pivot (attached to torso top)
        arm.position.set(i === 0 ? -0.15 : 0.15, 0.1, 0);
        person.userData.shoulderPivot.add(arm);
    }

    // Attach pivots to person group
    person.add(person.userData.hipPivot);
    person.add(person.userData.shoulderPivot);
    
    return person;
}

/**
 * Animates the person mesh based on state.
 * @param {THREE.Group} person - The person mesh group.
 * @param {number} dt - Delta time (simulated).
 */
export function animatePersonWalking(person, dt) {
    const { isSitting, isWalking, walkPhase } = person.userData;
    const hipPivot = person.userData.hipPivot;
    const shoulderPivot = person.userData.shoulderPivot;
    
    // Reset state if not active
    if (!isSitting && !isWalking) {
        // Standing idle
        hipPivot.rotation.set(0, 0, 0);
        shoulderPivot.rotation.set(0, 0, 0);
        return;
    }

    if (isSitting) {
        // Sitting state
        hipPivot.rotation.set(-Math.PI / 2, 0, 0); // Legs forward
        shoulderPivot.rotation.set(-Math.PI / 4, 0, 0); // Arms dropped
        // Note: walkPhase reset handled externally/on state change
    } else if (isWalking) {
        // Walking gait animation
        walkPhase += dt * 8;
        
        // Legs swing (sin(phase) * 0.6)
        hipPivot.rotation.set(Math.sin(walkPhase) * 0.6, 0, 0); 
        
        // Arms swing (opposite, -sin(phase) * 0.5)
        shoulderPivot.rotation.set(-Math.sin(walkPhase) * 0.5, 0, 0);
    }
}