// Person Model Factory - Creates 3D humanoid figures using Three.js primitives

const Person = (function() {
    // Constants for person dimensions
    const LEG_HEIGHT = 1;
    const TORSO_HEIGHT = 1.5;
    const HEAD_RADIUS = 0.4;
    const ARM_LENGTH = 1;
    const ARM_WIDTH = 0.2;
    const LEG_WIDTH = 0.3;

    function createPerson() {
        const person = new THREE.Group();
        person.userData = {
            isWalking: false,
            walkTime: 0,
            targetPosition: null,
            onArrival: null
        };

        // Colors
        const bodyColor = 0x3498db;
        const skinColor = 0xffdbac;
        const legColor = 0x2c3e50;

        // Legs (from bottom)
        const leftLegGeom = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
        const rightLegGeom = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_WIDTH);
        
        const legMaterial = new THREE.MeshPhongMaterial({ color: legColor });
        
        const leftLeg = new THREE.Mesh(leftLegGeom, legMaterial);
        leftLeg.position.set(-0.25, LEG_HEIGHT / 2, 0);
        person.add(leftLeg);

        const rightLeg = new THREE.Mesh(rightLegGeom, legMaterial);
        rightLeg.position.set(0.25, LEG_HEIGHT / 2, 0);
        person.add(rightLeg);

        // Torso (middle)
        const torsoHeight = TORSO_HEIGHT;
        const torsoWidth = 0.7;
        const torsoDepth = 0.5;
        const torsoGeom = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: bodyColor });
        
        const torso = new THREE.Mesh(torsoGeom, bodyMaterial);
        torso.position.set(0, LEG_HEIGHT + torsoHeight / 2, 0);
        person.add(torso);

        // Head (top)
        const headGeom = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
        const headMaterial = new THREE.MeshPhongMaterial({ color: skinColor });
        
        const head = new THREE.Mesh(headGeom, headMaterial);
        head.position.set(0, LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS, 0);
        person.add(head);

        // Arms (at shoulder level, hanging down)
        const armGeom = new THREE.BoxGeometry(ARM_WIDTH, ARM_LENGTH, ARM_WIDTH);
        
        const leftArm = new THREE.Mesh(armGeom, bodyMaterial);
        leftArm.position.set(-0.5, LEG_HEIGHT + TORSO_HEIGHT - 0.3, 0);
        person.add(leftArm);

        const rightArm = new THREE.Mesh(armGeom, bodyMaterial);
        rightArm.position.set(0.5, LEG_HEIGHT + TORSO_HEIGHT - 0.3, 0);
        person.add(rightArm);

        // Calculate total height for positioning
        person.userData.totalHeight = LEG_HEIGHT + TORSO_HEIGHT + HEAD_RADIUS * 2;

        return person;
    }

    function walk(person, targetPos, speed) {
        if (!person.userData.isWalking) {
            person.userData.isWalking = true;
            person.userData.targetPosition = targetPos.clone();
        }

        const currentPos = new THREE.Vector3();
        person.getWorldPosition(currentPos);
        
        const direction = new THREE.Vector3()
            .subVectors(person.userData.targetPosition, currentPos)
            .normalize();

        const distance = currentPos.distanceTo(person.userData.targetPosition);

        if (distance < 0.01) {
            // Arrived at destination
            person.userData.isWalking = false;
            person.userData.walkTime = 0;
            
            // Reset leg positions to standing
            person.children.forEach((child, index) => {
                const name = child.geometry ? ['leftLeg', 'rightLeg', 'torso', 'head', 'leftArm', 'rightArm'][index] : '';
                if (name === 'leftLeg' || name === 'rightLeg') {
                    child.rotation.x = 0;
                }
            });

            if (person.userData.onArrival) {
                person.userData.onArrival();
                person.userData.onArrival = null;
            }
            
            return true; // Animation complete
        }

        // Move towards target
        const moveDistance = speed * 0.016; // ~60fps
        currentPos.add(direction.multiplyScalar(moveDistance));
        
        // Convert world position back to local if person is child of elevator
        if (person.parent !== scene) {
            // Get parent's world transform and convert
            const targetWorld = person.userData.targetPosition.clone();
            const parentWorldMatrix = new THREE.Matrix4().getInverse(person.parent.matrixWorld);
            const localTarget = parentWorldMatrix.multiplyVector3(targetWorld);
            
            const currentLocal = new THREE.Vector3();
            person.getWorldPosition(currentLocal);
            const parentToLocal = parentWorldMatrix.multiplyVector3(currentLocal);
            
            const localDirection = new THREE.Vector3()
                .subVectors(localTarget, parentToLocal)
                .normalize();
            
            // Apply movement in elevator's coordinate space
            person.position.add(localDirection.multiplyScalar(moveDistance));
        } else {
            // Set world position directly
            const targetWorld = currentPos;
            const localPos = new THREE.Vector3();
            if (person.parent !== scene) {
                parentWorldMatrix.multiplyVector3(targetWorld);
            } else {
                person.position.set(targetWorld.x, targetWorld.y, targetWorld.z);
            }
        }

        // Animate legs with sine wave
        person.userData.walkTime += 0.15 * speed;
        const legAngle = Math.sin(person.userData.walkTime) * 0.4;
        
        // Left and right legs alternate
        if (person.children[0] && person.children[1]) {
            person.children[0].rotation.x = legAngle; // Left leg
            person.children[1].rotation.x = -legAngle; // Right leg
        }

        return false; // Still walking
    }

    function stopWalking(person) {
        person.userData.isWalking = false;
        person.userData.walkTime = 0;
        
        // Reset legs to standing position
        if (person.children[0] && person.children[1]) {
            person.children[0].rotation.x = 0;
            person.children[1].rotation.x = 0;
        }
    }

    return {
        create: createPerson,
        walk: walk,
        stopWalking: stopWalking
    };
})();
