// person.js

function createPerson() {
    // Colors
    const COLOR_BODY = 0x3498db;
    const COLOR_SKIN = 0xffdbac;
    const COLOR_LEGS = 0x2c3e50;
    
    // Dimensions
    const LEG_WIDTH = 0.15;
    const LEG_HEIGHT = 0.75;
    const LEG_DEPTH = 0.15;
    
    const TORSO_WIDTH = 0.4;
    const TORSO_HEIGHT = 0.6;
    const TORSO_DEPTH = 0.25;
    
    const HEAD_SIZE = 0.25;
    
    const ARM_WIDTH = 0.12;
    const ARM_HEIGHT = 0.6;
    const ARM_DEPTH = 0.12;
    
    // Create Group - Pivot is at feet (0,0,0)
    const person = new THREE.Group();
    
    // --- Legs ---
    const legGeo = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH);
    const legMat = new THREE.MeshLambertMaterial({ color: COLOR_LEGS });
    
    // Left Leg
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    // Pivot at hip: Geometry is centered. Move geometry down by half height so pivot is at top?
    // Or just position leg relative to hip.
    // Easier for animation: Make a pivot group for the leg at the hip.
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.1, LEG_HEIGHT, 0); // Hip position
    leftLeg.position.set(0, -LEG_HEIGHT/2, 0); // Leg hangs down from pivot
    leftLegPivot.add(leftLeg);
    person.add(leftLegPivot);
    
    // Right Leg
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.1, LEG_HEIGHT, 0); // Hip position
    rightLeg.position.set(0, -LEG_HEIGHT/2, 0); // Leg hangs down from pivot
    rightLegPivot.add(rightLeg);
    person.add(rightLegPivot);
    
    // --- Torso ---
    const torsoGeo = new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH);
    const torsoMat = new THREE.MeshLambertMaterial({ color: COLOR_BODY });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, LEG_HEIGHT + TORSO_HEIGHT/2, 0);
    person.add(torso);
    
    // --- Head ---
    const headGeo = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE); // Using box for simplicity as per "primitives"
    const headMat = new THREE.MeshLambertMaterial({ color: COLOR_SKIN });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, LEG_HEIGHT + TORSO_HEIGHT + HEAD_SIZE/2, 0);
    person.add(head);
    
    // --- Arms ---
    const armGeo = new THREE.BoxGeometry(ARM_WIDTH, ARM_HEIGHT, ARM_DEPTH);
    const armMat = new THREE.MeshLambertMaterial({ color: COLOR_BODY }); // Same as shirt usually
    
    // Left Arm
    const leftArm = new THREE.Mesh(armGeo, armMat);
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-(TORSO_WIDTH/2 + ARM_WIDTH/2), LEG_HEIGHT + TORSO_HEIGHT - 0.1, 0); // Shoulder position
    leftArm.position.set(0, -ARM_HEIGHT/2, 0); // Arm hangs down
    leftArmPivot.add(leftArm);
    person.add(leftArmPivot);
    
    // Right Arm
    const rightArm = new THREE.Mesh(armGeo, armMat);
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(TORSO_WIDTH/2 + ARM_WIDTH/2, LEG_HEIGHT + TORSO_HEIGHT - 0.1, 0); // Shoulder position
    rightArm.position.set(0, -ARM_HEIGHT/2, 0); // Arm hangs down
    rightArmPivot.add(rightArm);
    person.add(rightArmPivot);
    
    // --- Animation Logic ---
    person.userData = {
        isWalking: false,
        walkTime: 0,
        setWalking: function(walking) {
            this.isWalking = walking;
            if (!walking) {
                // Reset pose
                leftLegPivot.rotation.x = 0;
                rightLegPivot.rotation.x = 0;
                leftArmPivot.rotation.x = 0;
                rightArmPivot.rotation.x = 0;
                this.walkTime = 0;
            }
        },
        update: function(delta) {
            if (this.isWalking) {
                this.walkTime += delta * 10; // Speed of swing
                const swing = Math.sin(this.walkTime) * 0.5; // Amplitude
                
                leftLegPivot.rotation.x = swing;
                rightLegPivot.rotation.x = -swing;
                
                // Arms opposite to legs
                leftArmPivot.rotation.x = -swing * 0.5;
                rightArmPivot.rotation.x = swing * 0.5;
            }
        }
    };
    
    return person;
}
